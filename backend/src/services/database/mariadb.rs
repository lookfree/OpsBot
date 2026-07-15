//! MariaDB database driver implementation
//!
//! MariaDB is a fork of MySQL and uses the same wire protocol,
//! so we can reuse the MySQL driver with slight modifications.

use std::collections::HashMap;
use std::time::Instant;

use async_trait::async_trait;
use sqlx::mysql::{MySqlPool, MySqlPoolOptions, MySqlRow};
use sqlx::{Column, Row, TypeInfo};
use urlencoding::encode;

use crate::models::{
    CheckConstraintInfo, DatabaseObjectsCount, ForeignKeyInfo, QueryColumn, QueryResult,
    RoutineInfo, TableInfo, TableOptions, TableStructure, TriggerInfo, ViewInfo,
};

use super::traits::{build_column_detail, build_index_map, DatabaseDriver};
use super::utils::{
    bytes_to_json_value, escape_backtick_identifier, validate_sql_identifier, MAX_QUERY_ROWS,
};

fn build_mariadb_url(
    host: &str,
    port: u16,
    username: &str,
    password: &str,
    database: Option<&str>,
) -> String {
    let base = format!(
        "mysql://{}:{}@{}:{}",
        encode(username),
        encode(password),
        host,
        port
    );

    match database.filter(|db| !db.trim().is_empty()) {
        Some(db) => format!("{}/{}?ssl-mode=preferred", base, encode(db)),
        None => format!("{}?ssl-mode=preferred", base),
    }
}

/// MariaDB database driver
pub struct MariaDBDriver {
    pool: MySqlPool,
}

impl MariaDBDriver {
    /// Create a new MariaDB connection
    pub async fn connect(
        host: &str,
        port: u16,
        username: &str,
        password: &str,
        database: Option<&str>,
    ) -> Result<Self, String> {
        let url = build_mariadb_url(host, port, username, password, database);

        log::info!(
            "Connecting to MariaDB: {}:{}/{}",
            host,
            port,
            database.unwrap_or("")
        );

        let pool = MySqlPoolOptions::new()
            .max_connections(10)
            .idle_timeout(std::time::Duration::from_secs(300))
            .connect(&url)
            .await
            .map_err(|e| {
                log::error!("Failed to connect to MariaDB: {}", e);
                "Failed to connect to MariaDB: connection refused or invalid credentials".to_string()
            })?;

        log::info!("MariaDB connection established successfully");
        Ok(Self { pool })
    }

    /// Test connection without keeping it open
    pub async fn test_connection(
        host: &str,
        port: u16,
        username: &str,
        password: &str,
        database: Option<&str>,
    ) -> Result<(), String> {
        let url = build_mariadb_url(host, port, username, password, database);

        let pool = MySqlPoolOptions::new()
            .max_connections(1)
            .acquire_timeout(std::time::Duration::from_secs(10))
            .connect(&url)
            .await
            .map_err(|e| {
                log::error!("MariaDB connection test failed: {}", e);
                "Connection test failed: connection refused or invalid credentials".to_string()
            })?;

        sqlx::query("SELECT 1")
            .execute(&pool)
            .await
            .map_err(|e| format!("Query test failed: {}", e))?;

        pool.close().await;
        Ok(())
    }

    /// Create a new MariaDB connection using a connection URL
    pub async fn connect_url(url: &str) -> Result<Self, String> {
        if !url.starts_with("mysql://") && !url.starts_with("mariadb://") {
            return Err("Invalid MariaDB URL: must start with mysql:// or mariadb://".to_string());
        }

        // mariadb:// scheme is not supported by sqlx, normalize to mysql://
        let normalized = url.replacen("mariadb://", "mysql://", 1);

        log::info!("Connecting to MariaDB via URL");

        let pool = MySqlPoolOptions::new()
            .max_connections(10)
            .idle_timeout(std::time::Duration::from_secs(300))
            .connect(&normalized)
            .await
            .map_err(|e| {
                log::error!("Failed to connect to MariaDB via URL: {}", e);
                "Failed to connect to MariaDB: connection refused or invalid credentials".to_string()
            })?;

        log::info!("MariaDB URL connection established successfully");
        Ok(Self { pool })
    }

    /// Test connection using a connection URL
    pub async fn test_connection_url(url: &str) -> Result<(), String> {
        if !url.starts_with("mysql://") && !url.starts_with("mariadb://") {
            return Err("Invalid MariaDB URL: must start with mysql:// or mariadb://".to_string());
        }

        let normalized = url.replacen("mariadb://", "mysql://", 1);

        let pool = MySqlPoolOptions::new()
            .max_connections(1)
            .acquire_timeout(std::time::Duration::from_secs(10))
            .connect(&normalized)
            .await
            .map_err(|e| {
                log::error!("MariaDB URL connection test failed: {}", e);
                "Connection test failed: connection refused or invalid credentials".to_string()
            })?;

        sqlx::query("SELECT 1")
            .execute(&pool)
            .await
            .map_err(|e| format!("Query test failed: {}", e))?;

        pool.close().await;
        Ok(())
    }

    fn get_column_value(&self, row: &MySqlRow, index: usize, type_name: &str) -> serde_json::Value {
        use serde_json::Value;
        match type_name {
            "TINYINT" | "SMALLINT" | "MEDIUMINT" | "INT" | "BIGINT" => row
                .try_get::<i64, _>(index)
                .map(Value::from)
                .unwrap_or(Value::Null),
            "TINYINT UNSIGNED" | "SMALLINT UNSIGNED" | "MEDIUMINT UNSIGNED" | "INT UNSIGNED"
            | "BIGINT UNSIGNED" => row
                .try_get::<u64, _>(index)
                .map(Value::from)
                .unwrap_or(Value::Null),
            "FLOAT" | "DOUBLE" => row
                .try_get::<f64, _>(index)
                .map(Value::from)
                .unwrap_or(Value::Null),
            // DECIMAL/NUMERIC: keep as string to preserve precision (f64 would lose it)
            "DECIMAL" | "NUMERIC" => row
                .try_get::<sqlx::types::BigDecimal, _>(index)
                .map(|d| Value::String(d.to_string()))
                .unwrap_or(Value::Null),
            "BOOLEAN" | "BOOL" => row
                .try_get::<bool, _>(index)
                .map(Value::from)
                .unwrap_or(Value::Null),
            "JSON" => row
                .try_get::<serde_json::Value, _>(index)
                .unwrap_or(Value::Null),
            "DATE" => row
                .try_get::<chrono::NaiveDate, _>(index)
                .map(|d| Value::String(d.to_string()))
                .unwrap_or(Value::Null),
            "DATETIME" | "TIMESTAMP" => row
                .try_get::<chrono::NaiveDateTime, _>(index)
                .map(|dt| Value::String(dt.format("%Y-%m-%d %H:%M:%S").to_string()))
                .unwrap_or(Value::Null),
            "TIME" => row
                .try_get::<chrono::NaiveTime, _>(index)
                .map(|t| Value::String(t.to_string()))
                .unwrap_or(Value::Null),
            // YEAR and BIT are unsigned-integer compatible; read as u64.
            "YEAR" => row
                .try_get::<u64, _>(index)
                .map(Value::from)
                .unwrap_or(Value::Null),
            "BIT" => row
                .try_get::<u64, _>(index)
                .map(Value::from)
                .or_else(|_| row.try_get::<Vec<u8>, _>(index).map(|b| bytes_to_json_value(&b)))
                .unwrap_or(Value::Null),
            // Text/ENUM/SET/BLOB/BINARY/GEOMETRY: UTF-8 string, else hex (binary-safe).
            _ => row
                .try_get::<String, _>(index)
                .ok()
                .map(Value::from)
                .or_else(|| {
                    row.try_get::<Vec<u8>, _>(index)
                        .ok()
                        .map(|b| bytes_to_json_value(&b))
                })
                .unwrap_or(Value::Null),
        }
    }

    fn extract_database_name(row: &MySqlRow) -> Option<String> {
        row.try_get::<String, _>("Database")
            .ok()
            .or_else(|| {
                row.try_get::<Vec<u8>, _>("Database")
                    .ok()
                    .and_then(|bytes| String::from_utf8(bytes).ok())
            })
            .or_else(|| {
                row.try_get::<String, _>(0).ok().or_else(|| {
                    row.try_get::<Vec<u8>, _>(0)
                        .ok()
                        .and_then(|bytes| String::from_utf8(bytes).ok())
                })
            })
    }
}

#[async_trait]
impl DatabaseDriver for MariaDBDriver {
    fn supports_database_switch(&self) -> bool {
        true
    }

    async fn execute_query(&self, sql: &str) -> Result<QueryResult, String> {
        let start = Instant::now();

        let rows: Vec<MySqlRow> = sqlx::query(sql)
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
        log::info!("Fetching databases list from MariaDB...");
        let rows: Vec<MySqlRow> = sqlx::query("SHOW DATABASES")
            .fetch_all(&self.pool)
            .await
            .map_err(|e| {
                log::error!("Failed to get databases: {}", e);
                format!("Failed to get databases: {}", e)
            })?;

        let mut databases: Vec<String> = rows
            .iter()
            .filter_map(Self::extract_database_name)
            .collect();

        if databases.is_empty() {
            let fallback_rows: Vec<MySqlRow> = sqlx::query(
                "SELECT SCHEMA_NAME AS `Database` FROM information_schema.SCHEMATA ORDER BY SCHEMA_NAME",
            )
            .fetch_all(&self.pool)
            .await
            .map_err(|e| {
                log::error!("Failed to get databases via information_schema: {}", e);
                format!("Failed to get databases: {}", e)
            })?;

            databases = fallback_rows
                .iter()
                .filter_map(Self::extract_database_name)
                .collect();
        }

        log::info!("Found {} databases", databases.len());
        Ok(databases)
    }

    async fn get_schemas(&self, _database: Option<&str>) -> Result<Vec<String>, String> {
        // MariaDB doesn't have schemas in the same sense as PostgreSQL
        Ok(vec![])
    }

    async fn get_tables(&self, database: &str, _schema: Option<&str>) -> Result<Vec<TableInfo>, String> {
        let sql = "SELECT TABLE_NAME FROM information_schema.TABLES \
                   WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME";

        let rows: Vec<MySqlRow> = sqlx::query(sql)
            .bind(database)
            .fetch_all(&self.pool)
            .await
            .map_err(|e| format!("Failed to get tables: {}", e))?;

        // Some servers/collations return TABLE_NAME as binary; read either form.
        let extract = |row: &MySqlRow, idx: usize| -> Option<String> {
            row.try_get::<String, _>(idx).ok().or_else(|| {
                row.try_get::<Vec<u8>, _>(idx)
                    .ok()
                    .and_then(|b| String::from_utf8(b).ok())
            })
        };

        let mut tables: Vec<TableInfo> = rows
            .iter()
            .filter_map(|row| {
                let name = row
                    .try_get::<String, _>("TABLE_NAME")
                    .ok()
                    .or_else(|| {
                        row.try_get::<Vec<u8>, _>("TABLE_NAME")
                            .ok()
                            .and_then(|b| String::from_utf8(b).ok())
                    })?;
                Some(TableInfo {
                    name,
                    table_type: "BASE TABLE".to_string(),
                    row_count: None,
                })
            })
            .collect();

        // information_schema.TABLES can return empty under some connection
        // configs/permissions; fall back to SHOW FULL TABLES (same as MySQL).
        if tables.is_empty() {
            let show_sql = format!("SHOW FULL TABLES FROM `{}`", escape_backtick_identifier(database));
            let show_rows: Vec<MySqlRow> = sqlx::query(&show_sql)
                .fetch_all(&self.pool)
                .await
                .map_err(|e| format!("Failed to show tables: {}", e))?;
            tables = show_rows
                .iter()
                .filter_map(|row| {
                    let name = extract(row, 0)?;
                    let table_type =
                        extract(row, 1).unwrap_or_else(|| "BASE TABLE".to_string());
                    if table_type.eq_ignore_ascii_case("BASE TABLE") {
                        Some(TableInfo { name, table_type, row_count: None })
                    } else {
                        None
                    }
                })
                .collect();
        }

        Ok(tables)
    }

    async fn get_table_structure(
        &self,
        database: &str,
        table: &str,
    ) -> Result<TableStructure, String> {
        validate_sql_identifier(database)?;
        validate_sql_identifier(table)?;
        let sql = format!(
            "SHOW FULL COLUMNS FROM `{}`.`{}`",
            escape_backtick_identifier(database),
            escape_backtick_identifier(table)
        );

        let column_rows: Vec<MySqlRow> = sqlx::query(&sql)
            .fetch_all(&self.pool)
            .await
            .map_err(|e| format!("Failed to get columns: {}", e))?;

        let columns = column_rows
            .iter()
            .filter_map(|row| {
                let field: Option<String> = row.try_get("Field").ok().or_else(|| {
                    row.try_get::<Vec<u8>, _>("Field")
                        .ok()
                        .and_then(|b| String::from_utf8(b).ok())
                });
                let col_type: Option<String> = row.try_get("Type").ok().or_else(|| {
                    row.try_get::<Vec<u8>, _>("Type")
                        .ok()
                        .and_then(|b| String::from_utf8(b).ok())
                });

                let null_val: Option<String> = row.try_get("Null").ok();
                let key: Option<String> = row.try_get("Key").ok();
                let default_val: Option<String> = row.try_get("Default").ok();
                let extra: Option<String> = row.try_get("Extra").ok();
                let comment: Option<String> = row.try_get("Comment").ok().or_else(|| {
                    row.try_get::<Vec<u8>, _>("Comment")
                        .ok()
                        .and_then(|b| String::from_utf8(b).ok())
                });

                Some(build_column_detail(
                    field?,
                    col_type?,
                    null_val.map(|v| v == "YES").unwrap_or(true),
                    key,
                    default_val,
                    extra,
                    comment,
                ))
            })
            .collect();

        // Get indexes
        let index_sql = format!(
            "SHOW INDEX FROM `{}`.`{}`",
            escape_backtick_identifier(database),
            escape_backtick_identifier(table)
        );
        let index_rows: Vec<MySqlRow> = sqlx::query(&index_sql)
            .fetch_all(&self.pool)
            .await
            .map_err(|e| format!("Failed to get indexes: {}", e))?;

        let mut index_map = HashMap::new();
        for row in &index_rows {
            let key_name: String = row.try_get("Key_name").unwrap_or_default();
            let column_name: String = row.try_get("Column_name").unwrap_or_default();
            let non_unique: i32 = row.try_get("Non_unique").unwrap_or(1);
            let index_type: String = row.try_get("Index_type").unwrap_or_default();

            build_index_map(key_name, column_name, non_unique == 0, index_type, &mut index_map);
        }

        Ok(TableStructure {
            database: database.to_string(),
            table_name: table.to_string(),
            columns,
            indexes: index_map.into_values().collect(),
        })
    }

    async fn get_views(&self, database: &str, _schema: Option<&str>) -> Result<Vec<ViewInfo>, String> {
        let sql = "SELECT TABLE_NAME, DEFINER, SECURITY_TYPE \
                   FROM information_schema.VIEWS WHERE TABLE_SCHEMA = ?";

        let rows: Vec<MySqlRow> = sqlx::query(sql)
            .bind(database)
            .fetch_all(&self.pool)
            .await
            .map_err(|e| format!("Failed to get views: {}", e))?;

        Ok(rows
            .iter()
            .filter_map(|row| {
                Some(ViewInfo {
                    name: row.try_get("TABLE_NAME").ok()?,
                    definer: row.try_get("DEFINER").ok(),
                    security_type: row.try_get("SECURITY_TYPE").ok(),
                })
            })
            .collect())
    }

    async fn get_routines(&self, database: &str, _schema: Option<&str>) -> Result<Vec<RoutineInfo>, String> {
        let sql = "SELECT ROUTINE_NAME, ROUTINE_TYPE, DEFINER, CREATED \
                   FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA = ?";

        let rows: Vec<MySqlRow> = sqlx::query(sql)
            .bind(database)
            .fetch_all(&self.pool)
            .await
            .map_err(|e| format!("Failed to get routines: {}", e))?;

        Ok(rows
            .iter()
            .filter_map(|row| {
                Some(RoutineInfo {
                    name: row.try_get("ROUTINE_NAME").ok()?,
                    routine_type: row.try_get("ROUTINE_TYPE").ok()?,
                    definer: row.try_get("DEFINER").ok(),
                    created: row
                        .try_get::<chrono::NaiveDateTime, _>("CREATED")
                        .ok()
                        .map(|dt| dt.to_string()),
                })
            })
            .collect())
    }

    async fn get_objects_count(&self, database: &str, _schema: Option<&str>) -> Result<DatabaseObjectsCount, String> {
        // Execute all 4 queries in parallel for better performance
        let (tables_result, views_result, functions_result, procedures_result) = tokio::join!(
            sqlx::query(
                "SELECT COUNT(*) as cnt FROM information_schema.TABLES \
                 WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'"
            )
            .bind(database)
            .fetch_one(&self.pool),
            sqlx::query(
                "SELECT COUNT(*) as cnt FROM information_schema.VIEWS WHERE TABLE_SCHEMA = ?"
            )
            .bind(database)
            .fetch_one(&self.pool),
            sqlx::query(
                "SELECT COUNT(*) as cnt FROM information_schema.ROUTINES \
                 WHERE ROUTINE_SCHEMA = ? AND ROUTINE_TYPE = 'FUNCTION'"
            )
            .bind(database)
            .fetch_one(&self.pool),
            sqlx::query(
                "SELECT COUNT(*) as cnt FROM information_schema.ROUTINES \
                 WHERE ROUTINE_SCHEMA = ? AND ROUTINE_TYPE = 'PROCEDURE'"
            )
            .bind(database)
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

    async fn get_table_ddl(&self, database: &str, table: &str) -> Result<String, String> {
        validate_sql_identifier(database)?;
        validate_sql_identifier(table)?;
        let row: MySqlRow = sqlx::query(&format!(
            "SHOW CREATE TABLE `{}`.`{}`",
            escape_backtick_identifier(database),
            escape_backtick_identifier(table)
        ))
            .fetch_one(&self.pool)
            .await
            .map_err(|e| format!("Failed to get DDL: {}", e))?;

        Ok(row.try_get(1).unwrap_or_default())
    }

    async fn rename_table(
        &self,
        database: &str,
        old_name: &str,
        new_name: &str,
    ) -> Result<(), String> {
        validate_sql_identifier(database)?;
        validate_sql_identifier(old_name)?;
        validate_sql_identifier(new_name)?;
        let sql = format!(
            "RENAME TABLE `{}`.`{}` TO `{}`.`{}`",
            escape_backtick_identifier(database),
            escape_backtick_identifier(old_name),
            escape_backtick_identifier(database),
            escape_backtick_identifier(new_name)
        );
        sqlx::query(&sql)
            .execute(&self.pool)
            .await
            .map_err(|e| format!("Failed to rename table: {}", e))?;
        Ok(())
    }

    async fn drop_table(&self, database: &str, table: &str) -> Result<(), String> {
        validate_sql_identifier(database)?;
        validate_sql_identifier(table)?;
        let sql = format!(
            "DROP TABLE `{}`.`{}`",
            escape_backtick_identifier(database),
            escape_backtick_identifier(table)
        );
        sqlx::query(&sql)
            .execute(&self.pool)
            .await
            .map_err(|e| format!("Failed to drop table: {}", e))?;
        Ok(())
    }

    async fn get_foreign_keys(
        &self,
        database: &str,
        table: &str,
    ) -> Result<Vec<ForeignKeyInfo>, String> {
        let sql = r#"
            SELECT CONSTRAINT_NAME as name, COLUMN_NAME as col,
                   REFERENCED_TABLE_NAME as ref_table, REFERENCED_COLUMN_NAME as ref_col
            FROM information_schema.KEY_COLUMN_USAGE
            WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND REFERENCED_TABLE_NAME IS NOT NULL
            ORDER BY CONSTRAINT_NAME, ORDINAL_POSITION
        "#;

        let rows: Vec<MySqlRow> = sqlx::query(sql)
            .bind(database)
            .bind(table)
            .fetch_all(&self.pool)
            .await
            .map_err(|e| format!("Failed to get foreign keys: {}", e))?;

        let rules_sql = r#"
            SELECT CONSTRAINT_NAME, DELETE_RULE, UPDATE_RULE
            FROM information_schema.REFERENTIAL_CONSTRAINTS
            WHERE CONSTRAINT_SCHEMA = ? AND TABLE_NAME = ?
        "#;

        let rules_rows: Vec<MySqlRow> = sqlx::query(rules_sql)
            .bind(database)
            .bind(table)
            .fetch_all(&self.pool)
            .await
            .unwrap_or_default();

        let mut rules_map: HashMap<String, (String, String)> = HashMap::new();
        for row in &rules_rows {
            let name: String = row.try_get("CONSTRAINT_NAME").unwrap_or_default();
            let del: String = row
                .try_get("DELETE_RULE")
                .unwrap_or_else(|_| "RESTRICT".to_string());
            let upd: String = row
                .try_get("UPDATE_RULE")
                .unwrap_or_else(|_| "RESTRICT".to_string());
            rules_map.insert(name, (del, upd));
        }

        Ok(rows
            .iter()
            .filter_map(|row| {
                let name: String = row.try_get("name").ok()?;
                let (on_delete, on_update) = rules_map
                    .get(&name)
                    .cloned()
                    .unwrap_or(("RESTRICT".to_string(), "RESTRICT".to_string()));

                Some(ForeignKeyInfo {
                    name,
                    column: row.try_get("col").ok()?,
                    ref_table: row.try_get("ref_table").ok()?,
                    ref_column: row.try_get("ref_col").ok()?,
                    on_delete,
                    on_update,
                })
            })
            .collect())
    }

    async fn get_check_constraints(
        &self,
        database: &str,
        table: &str,
    ) -> Result<Vec<CheckConstraintInfo>, String> {
        // MariaDB supports CHECK constraints since 10.2.1
        let sql = r#"
            SELECT CONSTRAINT_NAME as name, CHECK_CLAUSE as expression
            FROM information_schema.CHECK_CONSTRAINTS
            WHERE CONSTRAINT_SCHEMA = ? AND TABLE_NAME = ?
        "#;

        let rows: Vec<MySqlRow> = sqlx::query(sql)
            .bind(database)
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

    async fn get_triggers(&self, database: &str, table: &str) -> Result<Vec<TriggerInfo>, String> {
        let sql = r#"
            SELECT TRIGGER_NAME, EVENT_MANIPULATION, ACTION_TIMING, ACTION_STATEMENT, CREATED
            FROM information_schema.TRIGGERS
            WHERE EVENT_OBJECT_SCHEMA = ? AND EVENT_OBJECT_TABLE = ?
        "#;

        let rows: Vec<MySqlRow> = sqlx::query(sql)
            .bind(database)
            .bind(table)
            .fetch_all(&self.pool)
            .await
            .map_err(|e| format!("Failed to get triggers: {}", e))?;

        Ok(rows
            .iter()
            .filter_map(|row| {
                Some(TriggerInfo {
                    name: row.try_get("TRIGGER_NAME").ok()?,
                    event: row.try_get("EVENT_MANIPULATION").ok()?,
                    timing: row.try_get("ACTION_TIMING").ok()?,
                    statement: row.try_get("ACTION_STATEMENT").ok()?,
                    created: row
                        .try_get::<chrono::NaiveDateTime, _>("CREATED")
                        .ok()
                        .map(|dt| dt.to_string()),
                })
            })
            .collect())
    }

    async fn get_table_options(&self, database: &str, table: &str) -> Result<TableOptions, String> {
        let sql = r#"
            SELECT ENGINE, TABLE_COLLATION, TABLE_COMMENT, AUTO_INCREMENT, ROW_FORMAT
            FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
        "#;

        let row: MySqlRow = sqlx::query(sql)
            .bind(database)
            .bind(table)
            .fetch_one(&self.pool)
            .await
            .map_err(|e| format!("Failed to get table options: {}", e))?;

        let collation: String = row.try_get("TABLE_COLLATION").unwrap_or_default();
        let charset = collation.split('_').next().unwrap_or("utf8mb4").to_string();

        Ok(TableOptions {
            engine: row
                .try_get("ENGINE")
                .unwrap_or_else(|_| "InnoDB".to_string()),
            charset,
            collation,
            comment: row.try_get("TABLE_COMMENT").unwrap_or_default(),
            auto_increment: row.try_get::<u64, _>("AUTO_INCREMENT").ok().map(|v| v as i64),
            row_format: row.try_get("ROW_FORMAT").ok(),
        })
    }

    async fn close(&self) {
        self.pool.close().await;
    }
}
