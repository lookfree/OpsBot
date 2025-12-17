//! MySQL database driver implementation

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

/// MySQL database driver
pub struct MySqlDriver {
    pool: MySqlPool,
}

impl MySqlDriver {
    /// Create a new MySQL connection
    pub async fn connect(
        host: &str,
        port: u16,
        username: &str,
        password: &str,
        database: &str,
    ) -> Result<Self, String> {
        // URL encode username and password to handle special characters
        let url = format!(
            "mysql://{}:{}@{}:{}/{}",
            encode(username), encode(password), host, port, database
        );

        let pool = MySqlPoolOptions::new()
            .max_connections(10)
            .min_connections(2)
            .connect(&url)
            .await
            .map_err(|e| format!("Failed to connect to MySQL: {}", e))?;

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
        // URL encode username and password to handle special characters
        let url = format!(
            "mysql://{}:{}@{}:{}/{}",
            encode(username), encode(password), host, port, database
        );

        let pool = MySqlPoolOptions::new()
            .max_connections(1)
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

    fn get_column_value(&self, row: &MySqlRow, index: usize, type_name: &str) -> serde_json::Value {
        match type_name {
            "BIGINT" | "INT" | "SMALLINT" | "TINYINT" | "MEDIUMINT" => row
                .try_get::<i64, _>(index)
                .map(serde_json::Value::from)
                .unwrap_or(serde_json::Value::Null),
            "BIGINT UNSIGNED" | "INT UNSIGNED" | "SMALLINT UNSIGNED" | "TINYINT UNSIGNED" => row
                .try_get::<u64, _>(index)
                .map(serde_json::Value::from)
                .unwrap_or(serde_json::Value::Null),
            "FLOAT" | "DOUBLE" | "DECIMAL" => row
                .try_get::<f64, _>(index)
                .map(serde_json::Value::from)
                .unwrap_or(serde_json::Value::Null),
            "BOOLEAN" | "BOOL" => row
                .try_get::<bool, _>(index)
                .map(serde_json::Value::from)
                .unwrap_or(serde_json::Value::Null),
            _ => row
                .try_get::<String, _>(index)
                .map(serde_json::Value::from)
                .unwrap_or(serde_json::Value::Null),
        }
    }
}

#[async_trait]
impl DatabaseDriver for MySqlDriver {
    async fn execute_query(&self, sql: &str) -> Result<QueryResult, String> {
        let start = Instant::now();

        let rows: Vec<MySqlRow> = sqlx::query(sql)
            .fetch_all(&self.pool)
            .await
            .map_err(|e| format!("Query failed: {}", e))?;

        let execution_time_ms = start.elapsed().as_millis() as u64;

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

        let data: Vec<Vec<serde_json::Value>> = rows
            .iter()
            .map(|row| {
                row.columns()
                    .iter()
                    .enumerate()
                    .map(|(i, col)| self.get_column_value(row, i, col.type_info().name()))
                    .collect()
            })
            .collect();

        Ok(QueryResult {
            columns,
            rows: data,
            affected_rows: rows.len() as u64,
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
        let rows: Vec<MySqlRow> = sqlx::query("SHOW DATABASES")
            .fetch_all(&self.pool)
            .await
            .map_err(|e| format!("Failed to get databases: {}", e))?;

        Ok(rows
            .iter()
            .filter_map(|row| row.try_get::<String, _>(0).ok())
            .collect())
    }

    async fn get_schemas(&self, _database: Option<&str>) -> Result<Vec<String>, String> {
        // MySQL doesn't have schemas in the same sense as PostgreSQL
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

        Ok(rows
            .iter()
            .filter_map(|row| {
                Some(TableInfo {
                    name: row.try_get("TABLE_NAME").ok()?,
                    table_type: "BASE TABLE".to_string(),
                    row_count: None,
                })
            })
            .collect())
    }

    async fn get_table_structure(
        &self,
        database: &str,
        table: &str,
    ) -> Result<TableStructure, String> {
        let sql = format!("SHOW FULL COLUMNS FROM `{}`.`{}`", database, table);

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
        let index_sql = format!("SHOW INDEX FROM `{}`.`{}`", database, table);
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
        let row: MySqlRow = sqlx::query(&format!("SHOW CREATE TABLE `{}`.`{}`", database, table))
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
        let sql = format!(
            "RENAME TABLE `{}`.`{}` TO `{}`.`{}`",
            database, old_name, database, new_name
        );
        sqlx::query(&sql)
            .execute(&self.pool)
            .await
            .map_err(|e| format!("Failed to rename table: {}", e))?;
        Ok(())
    }

    async fn drop_table(&self, database: &str, table: &str) -> Result<(), String> {
        let sql = format!("DROP TABLE `{}`.`{}`", database, table);
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
            auto_increment: row.try_get("AUTO_INCREMENT").ok(),
            row_format: row.try_get("ROW_FORMAT").ok(),
        })
    }

    async fn close(&self) {
        self.pool.close().await;
    }
}
