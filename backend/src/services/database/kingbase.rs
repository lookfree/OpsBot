//! KingBase database driver implementation
//!
//! KingBase is compatible with PostgreSQL protocol,
//! so we reuse sqlx::PgPool for connections.
//! Default port: 54321

use std::collections::HashMap;
use std::time::Instant;

use async_trait::async_trait;
use sqlx::postgres::{PgPool, PgPoolOptions, PgRow};
use sqlx::{Column, Row, TypeInfo};
use urlencoding::encode;

use crate::models::{
    CheckConstraintInfo, DatabaseObjectsCount, ForeignKeyInfo, QueryColumn, QueryResult,
    RoutineInfo, TableInfo, TableOptions, TableStructure, TriggerInfo, ViewInfo,
};

use super::traits::{build_column_detail, build_index_map, DatabaseDriver};
use super::utils::{escape_double_quote_identifier, validate_sql_identifier, MAX_QUERY_ROWS};

/// KingBase database driver
pub struct KingBaseDriver {
    pool: PgPool,
}

impl KingBaseDriver {
    /// Create a new KingBase connection
    pub async fn connect(
        host: &str,
        port: u16,
        username: &str,
        password: &str,
        database: &str,
    ) -> Result<Self, String> {
        // KingBase uses PostgreSQL protocol
        let url = format!(
            "postgres://{}:{}@{}:{}/{}",
            encode(username),
            encode(password),
            host,
            port,
            database
        );

        log::info!("Connecting to KingBase: {}:{}/{}", host, port, database);

        let pool = PgPoolOptions::new()
            .max_connections(10)
            .min_connections(2)
            .acquire_timeout(std::time::Duration::from_secs(10))
            .connect(&url)
            .await
            .map_err(|e| {
                log::error!("Failed to connect to KingBase: {}", e);
                format!("Failed to connect to KingBase: {}", e)
            })?;

        log::info!("KingBase connection established successfully");
        Ok(Self { pool })
    }

    /// Test connection without keeping it open
    pub async fn test_connection(
        host: &str,
        port: u16,
        username: &str,
        password: &str,
        database: &str,
    ) -> Result<(), String> {
        let url = format!(
            "postgres://{}:{}@{}:{}/{}",
            encode(username),
            encode(password),
            host,
            port,
            database
        );

        let pool = PgPoolOptions::new()
            .max_connections(1)
            .acquire_timeout(std::time::Duration::from_secs(10))
            .connect(&url)
            .await
            .map_err(|e| format!("Connection test failed: {}", e))?;

        sqlx::query("SELECT 1")
            .execute(&pool)
            .await
            .map_err(|e| format!("Query test failed: {}", e))?;

        pool.close().await;
        Ok(())
    }

    /// Create a new KingBase connection using a connection URL
    /// Accepts kingbase://, postgres://, or postgresql:// schemes
    pub async fn connect_url(url: &str) -> Result<Self, String> {
        if !url.starts_with("kingbase://") && !url.starts_with("postgres://") && !url.starts_with("postgresql://") {
            return Err("Invalid KingBase URL: must start with kingbase://, postgres://, or postgresql://".to_string());
        }

        // kingbase:// scheme is not supported by sqlx, normalize to postgres://
        let normalized = url.replacen("kingbase://", "postgres://", 1);

        log::info!("Connecting to KingBase via URL");

        let pool = PgPoolOptions::new()
            .max_connections(10)
            .min_connections(2)
            .acquire_timeout(std::time::Duration::from_secs(10))
            .connect(&normalized)
            .await
            .map_err(|e| {
                log::error!("Failed to connect to KingBase via URL: {}", e);
                format!("Failed to connect to KingBase: {}", e)
            })?;

        log::info!("KingBase URL connection established successfully");
        Ok(Self { pool })
    }

    /// Test connection using a connection URL
    pub async fn test_connection_url(url: &str) -> Result<(), String> {
        if !url.starts_with("kingbase://") && !url.starts_with("postgres://") && !url.starts_with("postgresql://") {
            return Err("Invalid KingBase URL: must start with kingbase://, postgres://, or postgresql://".to_string());
        }

        let normalized = url.replacen("kingbase://", "postgres://", 1);

        let pool = PgPoolOptions::new()
            .max_connections(1)
            .acquire_timeout(std::time::Duration::from_secs(10))
            .connect(&normalized)
            .await
            .map_err(|e| format!("Connection test failed: {}", e))?;

        sqlx::query("SELECT 1")
            .execute(&pool)
            .await
            .map_err(|e| format!("Query test failed: {}", e))?;

        pool.close().await;
        Ok(())
    }

    fn get_column_value(&self, row: &PgRow, index: usize, type_name: &str) -> serde_json::Value {
        match type_name {
            "INT8" | "INT4" | "INT2" | "SERIAL" | "BIGSERIAL" => row
                .try_get::<i64, _>(index)
                .map(serde_json::Value::from)
                .unwrap_or(serde_json::Value::Null),
            "FLOAT8" | "FLOAT4" | "NUMERIC" => row
                .try_get::<f64, _>(index)
                .map(serde_json::Value::from)
                .unwrap_or(serde_json::Value::Null),
            "BOOL" => row
                .try_get::<bool, _>(index)
                .map(serde_json::Value::from)
                .unwrap_or(serde_json::Value::Null),
            "JSON" | "JSONB" => row
                .try_get::<serde_json::Value, _>(index)
                .unwrap_or(serde_json::Value::Null),
            _ => row
                .try_get::<String, _>(index)
                .map(serde_json::Value::from)
                .unwrap_or(serde_json::Value::Null),
        }
    }
}

#[async_trait]
impl DatabaseDriver for KingBaseDriver {
    async fn execute_query(&self, sql: &str) -> Result<QueryResult, String> {
        let start = Instant::now();

        let rows: Vec<PgRow> = sqlx::query(sql)
            .fetch_all(&self.pool)
            .await
            .map_err(|e| format!("Query failed: {}", e))?;

        let execution_time_ms = start.elapsed().as_millis() as u64;
        let total_rows = rows.len();
        let truncated = total_rows > MAX_QUERY_ROWS;
        let display_rows = if truncated { &rows[..MAX_QUERY_ROWS] } else { &rows[..] };

        let columns: Vec<QueryColumn> = if let Some(first_row) = rows.first() {
            first_row
                .columns()
                .iter()
                .map(|col| QueryColumn {
                    name: col.name().to_string(),
                    column_type: col.type_info().name().to_string(),
                    nullable: true,
                })
                .collect()
        } else {
            vec![]
        };

        let mut data: Vec<Vec<serde_json::Value>> = display_rows
            .iter()
            .map(|row| {
                row.columns()
                    .iter()
                    .enumerate()
                    .map(|(i, col)| self.get_column_value(row, i, col.type_info().name()))
                    .collect()
            })
            .collect();

        if truncated {
            data.push(vec![serde_json::Value::String(
                format!("[Result truncated: showing {} of {} rows]", MAX_QUERY_ROWS, total_rows),
            )]);
        }

        Ok(QueryResult {
            columns,
            rows: data,
            affected_rows: total_rows as u64,
            execution_time_ms,
        })
    }

    async fn execute_update(&self, sql: &str) -> Result<QueryResult, String> {
        let start = Instant::now();

        let result = sqlx::query(sql)
            .execute(&self.pool)
            .await
            .map_err(|e| format!("Execute failed: {}", e))?;

        Ok(QueryResult {
            columns: vec![],
            rows: vec![],
            affected_rows: result.rows_affected(),
            execution_time_ms: start.elapsed().as_millis() as u64,
        })
    }

    async fn get_databases(&self) -> Result<Vec<String>, String> {
        log::info!("Fetching KingBase databases list...");

        let sql = "SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY datname";

        let rows: Vec<PgRow> = sqlx::query(sql)
            .fetch_all(&self.pool)
            .await
            .map_err(|e| format!("Failed to get databases: {}", e))?;

        let databases: Vec<String> = rows
            .iter()
            .filter_map(|row| row.try_get::<String, _>(0).ok())
            .collect();

        log::info!("Found {} databases", databases.len());
        Ok(databases)
    }

    async fn get_schemas(&self, _database: Option<&str>) -> Result<Vec<String>, String> {
        // Use OID-based filtering: system schemas have OID < 16384 (assigned during initdb)
        // User-created schemas have OID >= 16384
        // Keep 'public' schema as it's the default user schema
        // Exclude temporary schemas (pg_temp*, pg_toast_temp*)
        let sql = "SELECT nspname FROM pg_namespace \
                   WHERE (oid >= 16384 OR nspname = 'public') \
                   AND nspname NOT LIKE 'pg_temp%' \
                   AND nspname NOT LIKE 'pg_toast_temp%' \
                   ORDER BY nspname";

        let rows: Vec<PgRow> = sqlx::query(sql)
            .fetch_all(&self.pool)
            .await
            .map_err(|e| format!("Failed to get schemas: {}", e))?;

        Ok(rows
            .iter()
            .filter_map(|row| row.try_get::<String, _>(0).ok())
            .collect())
    }

    async fn get_tables(
        &self,
        _database: &str,
        schema: Option<&str>,
    ) -> Result<Vec<TableInfo>, String> {
        let schema_name = schema.unwrap_or("public");
        let sql = "SELECT table_name FROM information_schema.tables \
                   WHERE table_schema = $1 AND table_type = 'BASE TABLE' ORDER BY table_name";

        let rows: Vec<PgRow> = sqlx::query(sql)
            .bind(schema_name)
            .fetch_all(&self.pool)
            .await
            .map_err(|e| format!("Failed to get tables: {}", e))?;

        Ok(rows
            .iter()
            .filter_map(|row| {
                Some(TableInfo {
                    name: row.try_get("table_name").ok()?,
                    table_type: "BASE TABLE".to_string(),
                    row_count: None,
                })
            })
            .collect())
    }

    async fn get_table_structure(
        &self,
        schema: &str,
        table: &str,
    ) -> Result<TableStructure, String> {
        let column_sql = r#"
            SELECT c.column_name, c.data_type, c.is_nullable, c.column_default,
                   c.character_maximum_length, c.numeric_precision, c.numeric_scale,
                   CASE WHEN pk.column_name IS NOT NULL THEN 'PRI' ELSE '' END as key,
                   COALESCE(pgd.description, '') as comment
            FROM information_schema.columns c
            LEFT JOIN (
                SELECT ku.column_name FROM information_schema.table_constraints tc
                JOIN information_schema.key_column_usage ku
                    ON tc.constraint_name = ku.constraint_name
                WHERE tc.table_schema = $1 AND tc.table_name = $2
                    AND tc.constraint_type = 'PRIMARY KEY'
            ) pk ON c.column_name = pk.column_name
            LEFT JOIN pg_catalog.pg_statio_all_tables st
                ON st.schemaname = c.table_schema AND st.relname = c.table_name
            LEFT JOIN pg_catalog.pg_description pgd
                ON pgd.objoid = st.relid AND pgd.objsubid = c.ordinal_position
            WHERE c.table_schema = $1 AND c.table_name = $2
            ORDER BY c.ordinal_position
        "#;

        let column_rows: Vec<PgRow> = sqlx::query(column_sql)
            .bind(schema)
            .bind(table)
            .fetch_all(&self.pool)
            .await
            .map_err(|e| format!("Failed to get columns: {}", e))?;

        let columns = column_rows
            .iter()
            .filter_map(|row| {
                let name: String = row.try_get("column_name").ok()?;
                let data_type: String = row.try_get("data_type").ok()?;
                let is_nullable: String = row.try_get("is_nullable").ok()?;
                let column_default: Option<String> = row.try_get("column_default").ok();
                let key: String = row.try_get("key").ok().unwrap_or_default();
                let comment: String = row.try_get("comment").ok().unwrap_or_default();

                let max_length: Option<i32> = row.try_get("character_maximum_length").ok();
                let precision: Option<i32> = row.try_get("numeric_precision").ok();
                let scale: Option<i32> = row.try_get("numeric_scale").ok();

                let column_type = if let Some(len) = max_length {
                    format!("{}({})", data_type, len)
                } else if let (Some(p), Some(s)) = (precision, scale) {
                    format!("{}({},{})", data_type, p, s)
                } else {
                    data_type
                };

                let extra = column_default
                    .as_ref()
                    .filter(|d| d.contains("nextval"))
                    .map(|_| "auto_increment".to_string());

                Some(build_column_detail(
                    name,
                    column_type,
                    is_nullable == "YES",
                    if key.is_empty() { None } else { Some(key) },
                    column_default,
                    extra,
                    if comment.is_empty() {
                        None
                    } else {
                        Some(comment)
                    },
                ))
            })
            .collect();

        // Get indexes
        let index_sql = r#"
            SELECT i.relname as index_name, a.attname as column_name,
                   ix.indisunique as is_unique, am.amname as index_type
            FROM pg_class t
            JOIN pg_index ix ON t.oid = ix.indrelid
            JOIN pg_class i ON i.oid = ix.indexrelid
            JOIN pg_am am ON i.relam = am.oid
            JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
            JOIN pg_namespace n ON n.oid = t.relnamespace
            WHERE n.nspname = $1 AND t.relname = $2
            ORDER BY i.relname, a.attnum
        "#;

        let index_rows: Vec<PgRow> = sqlx::query(index_sql)
            .bind(schema)
            .bind(table)
            .fetch_all(&self.pool)
            .await
            .map_err(|e| format!("Failed to get indexes: {}", e))?;

        let mut index_map = HashMap::new();
        for row in &index_rows {
            let index_name: String = row.try_get("index_name").unwrap_or_default();
            let column_name: String = row.try_get("column_name").unwrap_or_default();
            let is_unique: bool = row.try_get("is_unique").unwrap_or(false);
            let index_type: String = row.try_get("index_type").unwrap_or_default();

            build_index_map(
                index_name,
                column_name,
                is_unique,
                index_type.to_uppercase(),
                &mut index_map,
            );
        }

        Ok(TableStructure {
            database: schema.to_string(),
            table_name: table.to_string(),
            columns,
            indexes: index_map.into_values().collect(),
        })
    }

    async fn get_views(
        &self,
        _database: &str,
        schema: Option<&str>,
    ) -> Result<Vec<ViewInfo>, String> {
        let schema_name = schema.unwrap_or("public");
        let sql = "SELECT table_name FROM information_schema.views \
                   WHERE table_schema = $1 ORDER BY table_name";

        let rows: Vec<PgRow> = sqlx::query(sql)
            .bind(schema_name)
            .fetch_all(&self.pool)
            .await
            .map_err(|e| format!("Failed to get views: {}", e))?;

        Ok(rows
            .iter()
            .filter_map(|row| {
                Some(ViewInfo {
                    name: row.try_get("table_name").ok()?,
                    definer: None,
                    security_type: None,
                })
            })
            .collect())
    }

    async fn get_routines(
        &self,
        _database: &str,
        schema: Option<&str>,
    ) -> Result<Vec<RoutineInfo>, String> {
        let schema_name = schema.unwrap_or("public");
        let sql = "SELECT routine_name, routine_type FROM information_schema.routines \
                   WHERE routine_schema = $1 ORDER BY routine_name";

        let rows: Vec<PgRow> = sqlx::query(sql)
            .bind(schema_name)
            .fetch_all(&self.pool)
            .await
            .map_err(|e| format!("Failed to get routines: {}", e))?;

        Ok(rows
            .iter()
            .filter_map(|row| {
                Some(RoutineInfo {
                    name: row.try_get("routine_name").ok()?,
                    routine_type: row.try_get("routine_type").ok()?,
                    definer: None,
                    created: None,
                })
            })
            .collect())
    }

    async fn get_objects_count(
        &self,
        _database: &str,
        schema: Option<&str>,
    ) -> Result<DatabaseObjectsCount, String> {
        let schema_name = schema.unwrap_or("public");

        let (tables_result, views_result, functions_result, procedures_result) = tokio::join!(
            sqlx::query(
                "SELECT COUNT(*) as cnt FROM information_schema.tables \
                 WHERE table_schema = $1 AND table_type = 'BASE TABLE'"
            )
            .bind(schema_name)
            .fetch_one(&self.pool),
            sqlx::query(
                "SELECT COUNT(*) as cnt FROM information_schema.views WHERE table_schema = $1"
            )
            .bind(schema_name)
            .fetch_one(&self.pool),
            sqlx::query(
                "SELECT COUNT(*) as cnt FROM information_schema.routines \
                 WHERE routine_schema = $1 AND routine_type = 'FUNCTION'"
            )
            .bind(schema_name)
            .fetch_one(&self.pool),
            sqlx::query(
                "SELECT COUNT(*) as cnt FROM information_schema.routines \
                 WHERE routine_schema = $1 AND routine_type = 'PROCEDURE'"
            )
            .bind(schema_name)
            .fetch_one(&self.pool)
        );

        let tables: i64 = tables_result
            .map_err(|e| format!("Failed to count tables: {}", e))?
            .try_get("cnt")
            .unwrap_or(0);

        let views: i64 = views_result
            .map_err(|e| format!("Failed to count views: {}", e))?
            .try_get("cnt")
            .unwrap_or(0);

        let functions: i64 = functions_result
            .map_err(|e| format!("Failed to count functions: {}", e))?
            .try_get("cnt")
            .unwrap_or(0);

        let procedures: i64 = procedures_result
            .map_err(|e| format!("Failed to count procedures: {}", e))?
            .try_get("cnt")
            .unwrap_or(0);

        Ok(DatabaseObjectsCount {
            tables: tables as usize,
            views: views as usize,
            functions: functions as usize,
            procedures: procedures as usize,
        })
    }

    async fn get_table_ddl(&self, schema: &str, table: &str) -> Result<String, String> {
        let structure = self.get_table_structure(schema, table).await?;

        let mut ddl = format!("CREATE TABLE \"{}\".\"{}\" (\n", schema, table);

        for (i, col) in structure.columns.iter().enumerate() {
            let nullable = if col.nullable { "" } else { " NOT NULL" };
            let default = col
                .default_value
                .as_ref()
                .map(|d| format!(" DEFAULT {}", d))
                .unwrap_or_default();
            let pk = col
                .key
                .as_ref()
                .filter(|k| *k == "PRI")
                .map(|_| " PRIMARY KEY")
                .unwrap_or_default();

            ddl.push_str(&format!(
                "    \"{}\" {}{}{}{}",
                col.name, col.column_type, nullable, default, pk
            ));

            if i < structure.columns.len() - 1 {
                ddl.push_str(",\n");
            } else {
                ddl.push('\n');
            }
        }

        ddl.push_str(");");

        // Add column comments
        for col in &structure.columns {
            if let Some(ref comment) = col.comment {
                if !comment.is_empty() {
                    ddl.push_str(&format!(
                        "\n\nCOMMENT ON COLUMN \"{}\".\"{}\".\"{}\"\nIS '{}';",
                        schema,
                        table,
                        col.name,
                        comment.replace('\'', "''")
                    ));
                }
            }
        }

        Ok(ddl)
    }

    async fn rename_table(
        &self,
        schema: &str,
        old_name: &str,
        new_name: &str,
    ) -> Result<(), String> {
        validate_sql_identifier(schema)?;
        validate_sql_identifier(old_name)?;
        validate_sql_identifier(new_name)?;
        let sql = format!(
            "ALTER TABLE \"{}\".\"{}\" RENAME TO \"{}\"",
            escape_double_quote_identifier(schema),
            escape_double_quote_identifier(old_name),
            escape_double_quote_identifier(new_name)
        );
        sqlx::query(&sql)
            .execute(&self.pool)
            .await
            .map_err(|e| format!("Failed to rename table: {}", e))?;
        Ok(())
    }

    async fn drop_table(&self, schema: &str, table: &str) -> Result<(), String> {
        validate_sql_identifier(schema)?;
        validate_sql_identifier(table)?;
        let sql = format!(
            "DROP TABLE \"{}\".\"{}\"",
            escape_double_quote_identifier(schema),
            escape_double_quote_identifier(table)
        );
        sqlx::query(&sql)
            .execute(&self.pool)
            .await
            .map_err(|e| format!("Failed to drop table: {}", e))?;
        Ok(())
    }

    async fn get_foreign_keys(
        &self,
        schema: &str,
        table: &str,
    ) -> Result<Vec<ForeignKeyInfo>, String> {
        let sql = r#"
            SELECT tc.constraint_name as name, kcu.column_name as col,
                   ccu.table_name as ref_table, ccu.column_name as ref_col,
                   rc.delete_rule as on_delete, rc.update_rule as on_update
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu
                ON tc.constraint_name = kcu.constraint_name
                AND tc.table_schema = kcu.table_schema
            JOIN information_schema.constraint_column_usage ccu
                ON ccu.constraint_name = tc.constraint_name
                AND ccu.table_schema = tc.table_schema
            JOIN information_schema.referential_constraints rc
                ON rc.constraint_name = tc.constraint_name
                AND rc.constraint_schema = tc.table_schema
            WHERE tc.constraint_type = 'FOREIGN KEY'
                AND tc.table_schema = $1 AND tc.table_name = $2
            ORDER BY tc.constraint_name
        "#;

        let rows: Vec<PgRow> = sqlx::query(sql)
            .bind(schema)
            .bind(table)
            .fetch_all(&self.pool)
            .await
            .map_err(|e| format!("Failed to get foreign keys: {}", e))?;

        Ok(rows
            .iter()
            .filter_map(|row| {
                Some(ForeignKeyInfo {
                    name: row.try_get("name").ok()?,
                    column: row.try_get("col").ok()?,
                    ref_table: row.try_get("ref_table").ok()?,
                    ref_column: row.try_get("ref_col").ok()?,
                    on_delete: row
                        .try_get("on_delete")
                        .unwrap_or_else(|_| "NO ACTION".to_string()),
                    on_update: row
                        .try_get("on_update")
                        .unwrap_or_else(|_| "NO ACTION".to_string()),
                })
            })
            .collect())
    }

    async fn get_check_constraints(
        &self,
        schema: &str,
        table: &str,
    ) -> Result<Vec<CheckConstraintInfo>, String> {
        let sql = r#"
            SELECT con.conname as name, pg_get_constraintdef(con.oid) as expression
            FROM pg_constraint con
            JOIN pg_class rel ON rel.oid = con.conrelid
            JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
            WHERE con.contype = 'c' AND nsp.nspname = $1 AND rel.relname = $2
        "#;

        let rows: Vec<PgRow> = sqlx::query(sql)
            .bind(schema)
            .bind(table)
            .fetch_all(&self.pool)
            .await
            .unwrap_or_default();

        Ok(rows
            .iter()
            .filter_map(|row| {
                Some(CheckConstraintInfo {
                    name: row.try_get("name").ok()?,
                    expression: row.try_get("expression").ok()?,
                })
            })
            .collect())
    }

    async fn get_triggers(&self, schema: &str, table: &str) -> Result<Vec<TriggerInfo>, String> {
        let sql = r#"
            SELECT t.tgname as trigger_name,
                   CASE WHEN t.tgtype & 2 = 2 THEN 'BEFORE' ELSE 'AFTER' END as timing,
                   CONCAT_WS(' OR ',
                       CASE WHEN t.tgtype & 4 = 4 THEN 'INSERT' END,
                       CASE WHEN t.tgtype & 8 = 8 THEN 'DELETE' END,
                       CASE WHEN t.tgtype & 16 = 16 THEN 'UPDATE' END,
                       CASE WHEN t.tgtype & 32 = 32 THEN 'TRUNCATE' END
                   ) as event,
                   pg_get_triggerdef(t.oid) as statement
            FROM pg_trigger t
            JOIN pg_class c ON c.oid = t.tgrelid
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE NOT t.tgisinternal AND n.nspname = $1 AND c.relname = $2
        "#;

        let rows: Vec<PgRow> = sqlx::query(sql)
            .bind(schema)
            .bind(table)
            .fetch_all(&self.pool)
            .await
            .map_err(|e| format!("Failed to get triggers: {}", e))?;

        Ok(rows
            .iter()
            .filter_map(|row| {
                Some(TriggerInfo {
                    name: row.try_get("trigger_name").ok()?,
                    event: row.try_get("event").unwrap_or_default(),
                    timing: row.try_get("timing").ok()?,
                    statement: row.try_get("statement").ok()?,
                    created: None,
                })
            })
            .collect())
    }

    async fn get_table_options(&self, schema: &str, table: &str) -> Result<TableOptions, String> {
        let sql = r#"
            SELECT obj_description(c.oid) as comment
            FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = $1 AND c.relname = $2
        "#;

        let row: PgRow = sqlx::query(sql)
            .bind(schema)
            .bind(table)
            .fetch_one(&self.pool)
            .await
            .map_err(|e| format!("Failed to get table options: {}", e))?;

        let comment: Option<String> = row.try_get("comment").ok();

        Ok(TableOptions {
            engine: "KingBase".to_string(),
            charset: "UTF8".to_string(),
            collation: "default".to_string(),
            comment: comment.unwrap_or_default(),
            auto_increment: None,
            row_format: None,
        })
    }

    async fn close(&self) {
        self.pool.close().await;
        log::info!("KingBase connection closed");
    }
}
