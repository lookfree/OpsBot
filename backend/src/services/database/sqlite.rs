//! SQLite database driver implementation
//!
//! SQLite is a lightweight embedded database that uses a single file.
//! Unlike other databases, it doesn't use host/port/username/password,
//! but instead uses a file path.

use std::collections::HashMap;
use std::time::Instant;

use async_trait::async_trait;
use sqlx::sqlite::{SqlitePool, SqlitePoolOptions, SqliteRow};
use sqlx::{Column, Row, TypeInfo};

use crate::models::{
    CheckConstraintInfo, DatabaseObjectsCount, ForeignKeyInfo, QueryColumn, QueryResult,
    RoutineInfo, TableInfo, TableOptions, TableStructure, TriggerInfo, ViewInfo,
};

use super::traits::{build_column_detail, build_index_map, DatabaseDriver};
use super::utils::{escape_double_quote_identifier, validate_sql_identifier, MAX_QUERY_ROWS};

/// SQLite database driver
pub struct SqliteDriver {
    pool: SqlitePool,
    file_path: String,
}

impl SqliteDriver {
    /// Open or create a SQLite database file
    ///
    /// # Arguments
    /// * `file_path` - Path to the SQLite database file, or `:memory:` for in-memory database
    pub async fn connect(file_path: &str) -> Result<Self, String> {
        // Build connection URL
        let url = if file_path == ":memory:" {
            "sqlite::memory:".to_string()
        } else {
            // mode=rwc: read-write-create
            format!("sqlite://{}?mode=rwc", file_path)
        };

        log::info!("Opening SQLite database: {}", file_path);

        let pool = SqlitePoolOptions::new()
            .max_connections(5)
            .min_connections(1)
            .connect(&url)
            .await
            .map_err(|e| {
                log::error!("Failed to open SQLite database: {}", e);
                format!("Failed to open SQLite database: {}", e)
            })?;

        // Enable foreign key support (disabled by default in SQLite)
        sqlx::query("PRAGMA foreign_keys = ON")
            .execute(&pool)
            .await
            .map_err(|e| format!("Failed to enable foreign keys: {}", e))?;

        log::info!("SQLite database opened successfully");
        Ok(Self {
            pool,
            file_path: file_path.to_string(),
        })
    }

    /// Test if a database file can be opened
    pub async fn test_connection(file_path: &str) -> Result<(), String> {
        let url = if file_path == ":memory:" {
            "sqlite::memory:".to_string()
        } else {
            // mode=ro: read-only for testing
            format!("sqlite://{}?mode=ro", file_path)
        };

        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .acquire_timeout(std::time::Duration::from_secs(10))
            .connect(&url)
            .await
            .map_err(|e| format!("Connection test failed: {}", e))?;

        // Verify database integrity
        sqlx::query("PRAGMA integrity_check")
            .fetch_one(&pool)
            .await
            .map_err(|e| format!("Database integrity check failed: {}", e))?;

        pool.close().await;
        Ok(())
    }

    /// Get the database file name (without path)
    fn get_database_name(&self) -> String {
        std::path::Path::new(&self.file_path)
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("main")
            .to_string()
    }

    fn get_column_value(&self, row: &SqliteRow, index: usize, type_name: &str) -> serde_json::Value {
        // SQLite has dynamic typing, try different types
        let type_upper = type_name.to_uppercase();

        if type_upper.contains("INT") {
            if let Ok(v) = row.try_get::<i64, _>(index) {
                return serde_json::Value::from(v);
            }
        }

        if type_upper.contains("REAL")
            || type_upper.contains("FLOAT")
            || type_upper.contains("DOUBLE")
        {
            if let Ok(v) = row.try_get::<f64, _>(index) {
                return serde_json::json!(v);
            }
        }

        if type_upper.contains("BLOB") {
            if let Ok(v) = row.try_get::<Vec<u8>, _>(index) {
                return serde_json::Value::String(format!("[BLOB: {} bytes]", v.len()));
            }
        }

        // Try as string (most common fallback)
        if let Ok(v) = row.try_get::<String, _>(index) {
            return serde_json::Value::String(v);
        }

        // Try as i64 (for untyped integers)
        if let Ok(v) = row.try_get::<i64, _>(index) {
            return serde_json::Value::from(v);
        }

        // Try as f64 (for untyped floats)
        if let Ok(v) = row.try_get::<f64, _>(index) {
            return serde_json::json!(v);
        }

        serde_json::Value::Null
    }
}

#[async_trait]
impl DatabaseDriver for SqliteDriver {
    async fn execute_query(&self, sql: &str) -> Result<QueryResult, String> {
        let start = Instant::now();

        let rows: Vec<SqliteRow> = sqlx::query(sql)
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
        // SQLite: one file = one database
        // Return the database name from file path
        Ok(vec![self.get_database_name()])
    }

    async fn get_schemas(&self, _database: Option<&str>) -> Result<Vec<String>, String> {
        // SQLite doesn't have schemas like PostgreSQL
        // Return "main" as the default schema
        Ok(vec!["main".to_string()])
    }

    async fn get_tables(
        &self,
        _database: &str,
        _schema: Option<&str>,
    ) -> Result<Vec<TableInfo>, String> {
        let sql = r#"
            SELECT name
            FROM sqlite_master
            WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
            ORDER BY name
        "#;

        let rows: Vec<SqliteRow> = sqlx::query(sql)
            .fetch_all(&self.pool)
            .await
            .map_err(|e| format!("Failed to get tables: {}", e))?;

        Ok(rows
            .iter()
            .filter_map(|row| {
                Some(TableInfo {
                    name: row.try_get("name").ok()?,
                    table_type: "TABLE".to_string(),
                    row_count: None,
                })
            })
            .collect())
    }

    async fn get_table_structure(
        &self,
        _database: &str,
        table: &str,
    ) -> Result<TableStructure, String> {
        // Use PRAGMA table_info to get column information.
        // Escape the identifier so a name containing a quote can't break out
        // of the quoted context and inject additional statements.
        let sql = format!("PRAGMA table_info(\"{}\")", escape_double_quote_identifier(table));
        let column_rows: Vec<SqliteRow> = sqlx::query(&sql)
            .fetch_all(&self.pool)
            .await
            .map_err(|e| format!("Failed to get columns: {}", e))?;

        let columns = column_rows
            .iter()
            .filter_map(|row| {
                let name: String = row.try_get("name").ok()?;
                let col_type: String = row.try_get("type").ok().unwrap_or_default();
                let notnull: i32 = row.try_get("notnull").ok().unwrap_or(0);
                let dflt_value: Option<String> = row.try_get("dflt_value").ok();
                let pk: i32 = row.try_get("pk").ok().unwrap_or(0);

                // Check if INTEGER PRIMARY KEY (auto-increment in SQLite)
                let extra = if pk > 0 && col_type.to_uppercase() == "INTEGER" {
                    Some("AUTOINCREMENT".to_string())
                } else {
                    None
                };

                Some(build_column_detail(
                    name,
                    col_type,
                    notnull == 0,
                    if pk > 0 { Some("PRI".to_string()) } else { None },
                    dflt_value,
                    extra,
                    None, // SQLite doesn't support column comments
                ))
            })
            .collect();

        // Get indexes using PRAGMA index_list
        let idx_sql = format!("PRAGMA index_list(\"{}\")", escape_double_quote_identifier(table));
        let idx_rows: Vec<SqliteRow> = sqlx::query(&idx_sql)
            .fetch_all(&self.pool)
            .await
            .map_err(|e| format!("Failed to get indexes: {}", e))?;

        let mut index_map = HashMap::new();
        for idx_row in &idx_rows {
            let idx_name: String = idx_row.try_get("name").unwrap_or_default();
            let unique: i32 = idx_row.try_get("unique").unwrap_or(0);

            // Get columns for this index
            let col_sql = format!("PRAGMA index_info(\"{}\")", escape_double_quote_identifier(&idx_name));
            let col_rows: Vec<SqliteRow> = sqlx::query(&col_sql)
                .fetch_all(&self.pool)
                .await
                .unwrap_or_default();

            for col_row in &col_rows {
                let column_name: String = col_row.try_get("name").unwrap_or_default();
                build_index_map(
                    idx_name.clone(),
                    column_name,
                    unique == 1,
                    "BTREE".to_string(),
                    &mut index_map,
                );
            }
        }

        Ok(TableStructure {
            database: "main".to_string(),
            table_name: table.to_string(),
            columns,
            indexes: index_map.into_values().collect(),
        })
    }

    async fn get_views(
        &self,
        _database: &str,
        _schema: Option<&str>,
    ) -> Result<Vec<ViewInfo>, String> {
        let sql = r#"
            SELECT name
            FROM sqlite_master
            WHERE type = 'view'
            ORDER BY name
        "#;

        let rows: Vec<SqliteRow> = sqlx::query(sql)
            .fetch_all(&self.pool)
            .await
            .map_err(|e| format!("Failed to get views: {}", e))?;

        Ok(rows
            .iter()
            .filter_map(|row| {
                Some(ViewInfo {
                    name: row.try_get("name").ok()?,
                    definer: None,
                    security_type: None,
                })
            })
            .collect())
    }

    async fn get_routines(
        &self,
        _database: &str,
        _schema: Option<&str>,
    ) -> Result<Vec<RoutineInfo>, String> {
        // SQLite doesn't support stored procedures/functions
        Ok(vec![])
    }

    async fn get_objects_count(
        &self,
        _database: &str,
        _schema: Option<&str>,
    ) -> Result<DatabaseObjectsCount, String> {
        let sql = r#"
            SELECT type, COUNT(*) as count
            FROM sqlite_master
            WHERE name NOT LIKE 'sqlite_%'
            GROUP BY type
        "#;

        let rows: Vec<SqliteRow> = sqlx::query(sql)
            .fetch_all(&self.pool)
            .await
            .map_err(|e| format!("Failed to count objects: {}", e))?;

        let mut counts = DatabaseObjectsCount {
            tables: 0,
            views: 0,
            functions: 0,
            procedures: 0,
        };

        for row in &rows {
            let obj_type: String = row.try_get("type").unwrap_or_default();
            let count: i64 = row.try_get("count").unwrap_or(0);
            match obj_type.as_str() {
                "table" => counts.tables = count as usize,
                "view" => counts.views = count as usize,
                _ => {}
            }
        }

        Ok(counts)
    }

    async fn get_table_ddl(&self, _database: &str, table: &str) -> Result<String, String> {
        let sql = "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?";

        let row: SqliteRow = sqlx::query(sql)
            .bind(table)
            .fetch_one(&self.pool)
            .await
            .map_err(|e| format!("Failed to get DDL: {}", e))?;

        Ok(row.try_get("sql").unwrap_or_default())
    }

    async fn rename_table(
        &self,
        _database: &str,
        old_name: &str,
        new_name: &str,
    ) -> Result<(), String> {
        validate_sql_identifier(old_name)?;
        validate_sql_identifier(new_name)?;
        let sql = format!(
            "ALTER TABLE \"{}\" RENAME TO \"{}\"",
            escape_double_quote_identifier(old_name),
            escape_double_quote_identifier(new_name)
        );
        sqlx::query(&sql)
            .execute(&self.pool)
            .await
            .map_err(|e| format!("Failed to rename table: {}", e))?;
        Ok(())
    }

    async fn drop_table(&self, _database: &str, table: &str) -> Result<(), String> {
        validate_sql_identifier(table)?;
        let sql = format!(
            "DROP TABLE IF EXISTS \"{}\"",
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
        _database: &str,
        table: &str,
    ) -> Result<Vec<ForeignKeyInfo>, String> {
        let sql = format!("PRAGMA foreign_key_list(\"{}\")", escape_double_quote_identifier(table));
        let rows: Vec<SqliteRow> = sqlx::query(&sql)
            .fetch_all(&self.pool)
            .await
            .map_err(|e| format!("Failed to get foreign keys: {}", e))?;

        Ok(rows
            .iter()
            .filter_map(|row| {
                let id: i32 = row.try_get("id").ok()?;
                Some(ForeignKeyInfo {
                    name: format!("fk_{}", id),
                    column: row.try_get("from").ok()?,
                    ref_table: row.try_get("table").ok()?,
                    ref_column: row.try_get("to").ok()?,
                    on_delete: row.try_get("on_delete").unwrap_or_else(|_| "NO ACTION".to_string()),
                    on_update: row.try_get("on_update").unwrap_or_else(|_| "NO ACTION".to_string()),
                })
            })
            .collect())
    }

    async fn get_check_constraints(
        &self,
        _database: &str,
        _table: &str,
    ) -> Result<Vec<CheckConstraintInfo>, String> {
        // SQLite CHECK constraints are embedded in CREATE TABLE
        // and require parsing the DDL to extract
        // For simplicity, return empty list
        Ok(vec![])
    }

    async fn get_triggers(
        &self,
        _database: &str,
        table: &str,
    ) -> Result<Vec<TriggerInfo>, String> {
        let sql = r#"
            SELECT name, sql
            FROM sqlite_master
            WHERE type = 'trigger' AND tbl_name = ?
        "#;

        let rows: Vec<SqliteRow> = sqlx::query(sql)
            .bind(table)
            .fetch_all(&self.pool)
            .await
            .map_err(|e| format!("Failed to get triggers: {}", e))?;

        Ok(rows
            .iter()
            .filter_map(|row| {
                let trigger_sql: String = row.try_get("sql").ok()?;
                Some(TriggerInfo {
                    name: row.try_get("name").ok()?,
                    event: "".to_string(),  // Would need to parse SQL
                    timing: "".to_string(), // Would need to parse SQL
                    statement: trigger_sql,
                    created: None,
                })
            })
            .collect())
    }

    async fn get_table_options(
        &self,
        _database: &str,
        _table: &str,
    ) -> Result<TableOptions, String> {
        // SQLite has minimal table options
        Ok(TableOptions {
            engine: "SQLite".to_string(),
            charset: "UTF-8".to_string(),
            collation: "BINARY".to_string(),
            comment: "".to_string(),
            auto_increment: None,
            row_format: None,
        })
    }

    async fn close(&self) {
        self.pool.close().await;
    }
}
