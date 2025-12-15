//! Database service for MySQL connections
//!
//! Manages database connections and executes SQL queries.

use std::collections::HashMap;
use std::sync::Arc;
use std::time::Instant;

use parking_lot::RwLock;
use sqlx::mysql::{MySqlPool, MySqlPoolOptions, MySqlRow};
use sqlx::{Column, Row, TypeInfo};

use crate::models::{
    CheckConstraintInfo, ColumnDetail, DatabaseConnectRequest, DatabaseConnectionInfo,
    DatabaseInfo, DatabaseObjectsCount, DatabaseType, ForeignKeyInfo, IndexInfo, QueryColumn,
    QueryResult, RoutineInfo, SqlExecuteRequest, TableInfo, TableOptions, TableStructure,
    TableStructureExt, TriggerInfo, ViewInfo,
};

/// Database session holding connection pool
pub struct DatabaseSession {
    pub connection_id: String,
    pub db_type: DatabaseType,
    pub host: String,
    pub port: u16,
    pub database: Option<String>,
    pub pool: MySqlPool,
    pub connected_at: chrono::DateTime<chrono::Utc>,
}

/// Database service managing all database connections
pub struct DatabaseService {
    sessions: RwLock<HashMap<String, Arc<DatabaseSession>>>,
}

impl DatabaseService {
    pub fn new() -> Self {
        Self {
            sessions: RwLock::new(HashMap::new()),
        }
    }

    /// Connect to MySQL database
    pub async fn connect(&self, request: DatabaseConnectRequest) -> Result<DatabaseConnectionInfo, String> {
        // Build connection URL
        let database = request.database.as_deref().unwrap_or("mysql");
        let password = request.password.as_deref().unwrap_or("");
        let url = format!(
            "mysql://{}:{}@{}:{}/{}",
            request.username, password, request.host, request.port, database
        );

        // Create connection pool
        let pool = MySqlPoolOptions::new()
            .max_connections(5)
            .min_connections(1)
            .connect(&url)
            .await
            .map_err(|e| format!("Failed to connect: {}", e))?;

        let now = chrono::Utc::now();
        let session = Arc::new(DatabaseSession {
            connection_id: request.connection_id.clone(),
            db_type: request.db_type.clone(),
            host: request.host.clone(),
            port: request.port,
            database: request.database.clone(),
            pool,
            connected_at: now,
        });

        self.sessions.write().insert(request.connection_id.clone(), session);

        Ok(DatabaseConnectionInfo {
            connection_id: request.connection_id,
            db_type: request.db_type,
            host: request.host,
            port: request.port,
            database: request.database,
            connected_at: now.to_rfc3339(),
        })
    }

    /// Disconnect from database
    pub async fn disconnect(&self, connection_id: &str) -> Result<(), String> {
        let session = self.sessions.write().remove(connection_id);
        if let Some(session) = session {
            session.pool.close().await;
            Ok(())
        } else {
            Err("Connection not found".to_string())
        }
    }

    /// Execute SQL query
    pub async fn execute_sql(&self, request: SqlExecuteRequest) -> Result<QueryResult, String> {
        let session = self.get_session(&request.connection_id)?;

        // Note: Database switching via USE command is not supported in prepared statements.
        // Queries should include the database name directly (e.g., SELECT * FROM db.table)

        let start = Instant::now();
        let sql = request.sql.trim();

        // Determine if it's a SELECT query
        let is_select = sql.to_uppercase().starts_with("SELECT")
            || sql.to_uppercase().starts_with("SHOW")
            || sql.to_uppercase().starts_with("DESCRIBE")
            || sql.to_uppercase().starts_with("EXPLAIN");

        if is_select {
            self.execute_query(&session, sql, start).await
        } else {
            self.execute_update(&session, sql, start).await
        }
    }

    /// Execute SELECT query
    async fn execute_query(
        &self,
        session: &DatabaseSession,
        sql: &str,
        start: Instant,
    ) -> Result<QueryResult, String> {
        let rows: Vec<MySqlRow> = sqlx::query(sql)
            .fetch_all(&session.pool)
            .await
            .map_err(|e| format!("Query failed: {}", e))?;

        let execution_time_ms = start.elapsed().as_millis() as u64;

        // Extract columns from first row or empty
        let columns: Vec<QueryColumn> = if let Some(first_row) = rows.first() {
            first_row
                .columns()
                .iter()
                .map(|col| QueryColumn {
                    name: col.name().to_string(),
                    column_type: col.type_info().name().to_string(),
                    nullable: true, // MySQL doesn't provide this in query result
                })
                .collect()
        } else {
            vec![]
        };

        // Convert rows to JSON values
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

    /// Execute INSERT/UPDATE/DELETE
    async fn execute_update(
        &self,
        session: &DatabaseSession,
        sql: &str,
        start: Instant,
    ) -> Result<QueryResult, String> {
        let result = sqlx::query(sql)
            .execute(&session.pool)
            .await
            .map_err(|e| format!("Execute failed: {}", e))?;

        let execution_time_ms = start.elapsed().as_millis() as u64;

        Ok(QueryResult {
            columns: vec![],
            rows: vec![],
            affected_rows: result.rows_affected(),
            execution_time_ms,
        })
    }

    /// Get column value as JSON
    fn get_column_value(&self, row: &MySqlRow, index: usize, type_name: &str) -> serde_json::Value {
        match type_name {
            "BIGINT" | "INT" | "SMALLINT" | "TINYINT" | "MEDIUMINT" => {
                row.try_get::<i64, _>(index)
                    .map(serde_json::Value::from)
                    .unwrap_or(serde_json::Value::Null)
            }
            "BIGINT UNSIGNED" | "INT UNSIGNED" | "SMALLINT UNSIGNED" | "TINYINT UNSIGNED" => {
                row.try_get::<u64, _>(index)
                    .map(serde_json::Value::from)
                    .unwrap_or(serde_json::Value::Null)
            }
            "FLOAT" | "DOUBLE" | "DECIMAL" => {
                row.try_get::<f64, _>(index)
                    .map(serde_json::Value::from)
                    .unwrap_or(serde_json::Value::Null)
            }
            "BOOLEAN" | "BOOL" => {
                row.try_get::<bool, _>(index)
                    .map(serde_json::Value::from)
                    .unwrap_or(serde_json::Value::Null)
            }
            _ => {
                // Default to string for VARCHAR, TEXT, DATE, DATETIME, etc.
                row.try_get::<String, _>(index)
                    .map(serde_json::Value::from)
                    .unwrap_or(serde_json::Value::Null)
            }
        }
    }

    /// Get all databases
    pub async fn get_databases(&self, connection_id: &str) -> Result<Vec<String>, String> {
        let session = self.get_session(connection_id)?;

        let rows: Vec<MySqlRow> = sqlx::query("SHOW DATABASES")
            .fetch_all(&session.pool)
            .await
            .map_err(|e| format!("Failed to get databases: {}", e))?;

        let databases: Vec<String> = rows
            .iter()
            .filter_map(|row| row.try_get::<String, _>(0).ok())
            .collect();

        Ok(databases)
    }

    /// Get tables in a database
    pub async fn get_tables(&self, connection_id: &str, database: &str) -> Result<Vec<TableInfo>, String> {
        let session = self.get_session(connection_id)?;

        // Use information_schema for consistent results with get_objects_count
        let rows: Vec<MySqlRow> = sqlx::query(
            "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME"
        )
            .bind(database)
            .fetch_all(&session.pool)
            .await
            .map_err(|e| format!("Failed to get tables: {}", e))?;

        let tables: Vec<TableInfo> = rows
            .iter()
            .filter_map(|row| {
                Some(TableInfo {
                    name: row.try_get("TABLE_NAME").ok()?,
                    table_type: "BASE TABLE".to_string(),
                    row_count: None,
                })
            })
            .collect();

        Ok(tables)
    }

    /// Get table structure
    pub async fn get_table_structure(
        &self,
        connection_id: &str,
        database: &str,
        table: &str,
    ) -> Result<TableStructure, String> {
        log::info!("get_table_structure called: connection_id={}, database={}, table={}",
            connection_id, database, table);

        let session = self.get_session(connection_id)?;

        // Get columns using fully qualified table name
        let sql = format!("SHOW FULL COLUMNS FROM `{}`.`{}`", database, table);
        log::info!("Executing SQL: {}", sql);

        let column_rows: Vec<MySqlRow> = sqlx::query(&sql)
            .fetch_all(&session.pool)
            .await
            .map_err(|e| format!("Failed to get columns: {}", e))?;

        log::info!("Got {} column rows", column_rows.len());

        // SHOW FULL COLUMNS returns: Field, Type, Collation, Null, Key, Default, Extra, Privileges, Comment
        // Use column name-based access for reliability
        let columns: Vec<ColumnDetail> = column_rows
            .iter()
            .filter_map(|row| {
                use sqlx::Row;

                // Try to get Field and Type - these are required
                let field: Option<String> = row.try_get("Field").ok();
                let col_type: Option<String> = row.try_get("Type").ok();

                // If column name access fails, try decoding as bytes and converting
                let field = field.or_else(|| {
                    row.try_get::<Vec<u8>, _>("Field").ok()
                        .and_then(|bytes| String::from_utf8(bytes).ok())
                });
                let col_type = col_type.or_else(|| {
                    row.try_get::<Vec<u8>, _>("Type").ok()
                        .and_then(|bytes| String::from_utf8(bytes).ok())
                });

                let null_val: Option<String> = row.try_get("Null").ok();
                let key: Option<String> = row.try_get("Key").ok();
                let default_val: Option<String> = row.try_get("Default").ok();
                let extra: Option<String> = row.try_get("Extra").ok();
                let comment: Option<String> = row.try_get("Comment").ok()
                    .or_else(|| {
                        row.try_get::<Vec<u8>, _>("Comment").ok()
                            .and_then(|bytes| String::from_utf8(bytes).ok())
                    });

                if field.is_none() || col_type.is_none() {
                    log::warn!("Failed to parse column row: Field={:?}, Type={:?}, Null={:?}",
                        field, col_type, null_val);
                    return None;
                }

                Some(ColumnDetail {
                    name: field.unwrap(),
                    column_type: col_type.unwrap(),
                    nullable: null_val.map(|v| v == "YES").unwrap_or(true),
                    key,
                    default_value: default_val,
                    extra,
                    comment,
                })
            })
            .collect();

        log::info!("Parsed {} columns", columns.len());

        // Get indexes using fully qualified table name
        let index_rows: Vec<MySqlRow> = sqlx::query(&format!(
            "SHOW INDEX FROM `{}`.`{}`",
            database, table
        ))
        .fetch_all(&session.pool)
        .await
        .map_err(|e| format!("Failed to get indexes: {}", e))?;

        // Group indexes by name
        let mut index_map: HashMap<String, IndexInfo> = HashMap::new();
        for row in &index_rows {
            let key_name: String = row.try_get("Key_name").unwrap_or_default();
            let column_name: String = row.try_get("Column_name").unwrap_or_default();
            let non_unique: i32 = row.try_get("Non_unique").unwrap_or(1);
            let index_type: String = row.try_get("Index_type").unwrap_or_default();

            index_map
                .entry(key_name.clone())
                .and_modify(|idx| idx.columns.push(column_name.clone()))
                .or_insert(IndexInfo {
                    name: key_name,
                    columns: vec![column_name],
                    unique: non_unique == 0,
                    index_type,
                });
        }

        let indexes: Vec<IndexInfo> = index_map.into_values().collect();
        log::info!("Returning TableStructure with {} columns and {} indexes",
            columns.len(), indexes.len());

        Ok(TableStructure {
            database: database.to_string(),
            table_name: table.to_string(),
            columns,
            indexes,
        })
    }

    /// Get views in a database
    pub async fn get_views(&self, connection_id: &str, database: &str) -> Result<Vec<ViewInfo>, String> {
        let session = self.get_session(connection_id)?;

        let rows: Vec<MySqlRow> = sqlx::query(
            "SELECT TABLE_NAME, DEFINER, SECURITY_TYPE FROM information_schema.VIEWS WHERE TABLE_SCHEMA = ?"
        )
            .bind(database)
            .fetch_all(&session.pool)
            .await
            .map_err(|e| format!("Failed to get views: {}", e))?;

        let views: Vec<ViewInfo> = rows
            .iter()
            .filter_map(|row| {
                Some(ViewInfo {
                    name: row.try_get("TABLE_NAME").ok()?,
                    definer: row.try_get("DEFINER").ok(),
                    security_type: row.try_get("SECURITY_TYPE").ok(),
                })
            })
            .collect();

        Ok(views)
    }

    /// Get functions and procedures in a database
    pub async fn get_routines(
        &self,
        connection_id: &str,
        database: &str,
    ) -> Result<Vec<RoutineInfo>, String> {
        let session = self.get_session(connection_id)?;

        let rows: Vec<MySqlRow> = sqlx::query(
            "SELECT ROUTINE_NAME, ROUTINE_TYPE, DEFINER, CREATED FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA = ?"
        )
            .bind(database)
            .fetch_all(&session.pool)
            .await
            .map_err(|e| format!("Failed to get routines: {}", e))?;

        let routines: Vec<RoutineInfo> = rows
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
            .collect();

        Ok(routines)
    }

    /// Get database objects count
    pub async fn get_objects_count(
        &self,
        connection_id: &str,
        database: &str,
    ) -> Result<DatabaseObjectsCount, String> {
        let session = self.get_session(connection_id)?;

        // Count tables (excluding views)
        let tables_row: MySqlRow = sqlx::query(
            "SELECT COUNT(*) as cnt FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'"
        )
            .bind(database)
            .fetch_one(&session.pool)
            .await
            .map_err(|e| format!("Failed to count tables: {}", e))?;
        let tables: i64 = tables_row.try_get("cnt").unwrap_or(0);

        // Count views
        let views_row: MySqlRow = sqlx::query(
            "SELECT COUNT(*) as cnt FROM information_schema.VIEWS WHERE TABLE_SCHEMA = ?"
        )
            .bind(database)
            .fetch_one(&session.pool)
            .await
            .map_err(|e| format!("Failed to count views: {}", e))?;
        let views: i64 = views_row.try_get("cnt").unwrap_or(0);

        // Count functions
        let funcs_row: MySqlRow = sqlx::query(
            "SELECT COUNT(*) as cnt FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA = ? AND ROUTINE_TYPE = 'FUNCTION'"
        )
            .bind(database)
            .fetch_one(&session.pool)
            .await
            .map_err(|e| format!("Failed to count functions: {}", e))?;
        let functions: i64 = funcs_row.try_get("cnt").unwrap_or(0);

        // Count procedures
        let procs_row: MySqlRow = sqlx::query(
            "SELECT COUNT(*) as cnt FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA = ? AND ROUTINE_TYPE = 'PROCEDURE'"
        )
            .bind(database)
            .fetch_one(&session.pool)
            .await
            .map_err(|e| format!("Failed to count procedures: {}", e))?;
        let procedures: i64 = procs_row.try_get("cnt").unwrap_or(0);

        Ok(DatabaseObjectsCount {
            tables: tables as usize,
            views: views as usize,
            functions: functions as usize,
            procedures: procedures as usize,
        })
    }

    /// Get table DDL (CREATE TABLE statement)
    pub async fn get_table_ddl(
        &self,
        connection_id: &str,
        database: &str,
        table: &str,
    ) -> Result<String, String> {
        let session = self.get_session(connection_id)?;

        // Use fully qualified table name
        let row: MySqlRow = sqlx::query(&format!("SHOW CREATE TABLE `{}`.`{}`", database, table))
            .fetch_one(&session.pool)
            .await
            .map_err(|e| format!("Failed to get DDL: {}", e))?;

        let ddl: String = row.try_get(1).unwrap_or_default();
        Ok(ddl)
    }

    /// Rename a table
    pub async fn rename_table(
        &self,
        connection_id: &str,
        database: &str,
        old_name: &str,
        new_name: &str,
    ) -> Result<(), String> {
        let session = self.get_session(connection_id)?;

        let sql = format!(
            "RENAME TABLE `{}`.`{}` TO `{}`.`{}`",
            database, old_name, database, new_name
        );

        sqlx::query(&sql)
            .execute(&session.pool)
            .await
            .map_err(|e| format!("Failed to rename table: {}", e))?;

        Ok(())
    }

    /// Drop a table
    pub async fn drop_table(
        &self,
        connection_id: &str,
        database: &str,
        table: &str,
    ) -> Result<(), String> {
        let session = self.get_session(connection_id)?;

        let sql = format!("DROP TABLE `{}`.`{}`", database, table);

        sqlx::query(&sql)
            .execute(&session.pool)
            .await
            .map_err(|e| format!("Failed to drop table: {}", e))?;

        Ok(())
    }

    /// Get foreign keys for a table
    pub async fn get_foreign_keys(
        &self,
        connection_id: &str,
        database: &str,
        table: &str,
    ) -> Result<Vec<ForeignKeyInfo>, String> {
        let session = self.get_session(connection_id)?;

        let sql = r#"
            SELECT
                CONSTRAINT_NAME as name,
                COLUMN_NAME as col,
                REFERENCED_TABLE_NAME as ref_table,
                REFERENCED_COLUMN_NAME as ref_col
            FROM information_schema.KEY_COLUMN_USAGE
            WHERE TABLE_SCHEMA = ?
              AND TABLE_NAME = ?
              AND REFERENCED_TABLE_NAME IS NOT NULL
            ORDER BY CONSTRAINT_NAME, ORDINAL_POSITION
        "#;

        let rows: Vec<MySqlRow> = sqlx::query(sql)
            .bind(database)
            .bind(table)
            .fetch_all(&session.pool)
            .await
            .map_err(|e| format!("Failed to get foreign keys: {}", e))?;

        // Get ON DELETE/ON UPDATE rules
        let rules_sql = r#"
            SELECT
                CONSTRAINT_NAME,
                DELETE_RULE,
                UPDATE_RULE
            FROM information_schema.REFERENTIAL_CONSTRAINTS
            WHERE CONSTRAINT_SCHEMA = ?
              AND TABLE_NAME = ?
        "#;

        let rules_rows: Vec<MySqlRow> = sqlx::query(rules_sql)
            .bind(database)
            .bind(table)
            .fetch_all(&session.pool)
            .await
            .unwrap_or_default();

        let mut rules_map: HashMap<String, (String, String)> = HashMap::new();
        for row in &rules_rows {
            let name: String = row.try_get("CONSTRAINT_NAME").unwrap_or_default();
            let del: String = row.try_get("DELETE_RULE").unwrap_or_else(|_| "RESTRICT".to_string());
            let upd: String = row.try_get("UPDATE_RULE").unwrap_or_else(|_| "RESTRICT".to_string());
            rules_map.insert(name, (del, upd));
        }

        let fks: Vec<ForeignKeyInfo> = rows
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
            .collect();

        Ok(fks)
    }

    /// Get check constraints for a table (MySQL 8.0.16+)
    pub async fn get_check_constraints(
        &self,
        connection_id: &str,
        database: &str,
        table: &str,
    ) -> Result<Vec<CheckConstraintInfo>, String> {
        let session = self.get_session(connection_id)?;

        // Check if MySQL version supports CHECK constraints (8.0.16+)
        let sql = r#"
            SELECT
                CONSTRAINT_NAME as name,
                CHECK_CLAUSE as expression
            FROM information_schema.CHECK_CONSTRAINTS
            WHERE CONSTRAINT_SCHEMA = ?
              AND TABLE_NAME = ?
        "#;

        let rows: Vec<MySqlRow> = sqlx::query(sql)
            .bind(database)
            .bind(table)
            .fetch_all(&session.pool)
            .await
            .unwrap_or_default(); // Return empty if table doesn't exist (older MySQL)

        let checks: Vec<CheckConstraintInfo> = rows
            .iter()
            .filter_map(|row| {
                Some(CheckConstraintInfo {
                    name: row.try_get("name").ok()?,
                    expression: row.try_get("expression").ok()?,
                })
            })
            .collect();

        Ok(checks)
    }

    /// Get triggers for a table
    pub async fn get_triggers(
        &self,
        connection_id: &str,
        database: &str,
        table: &str,
    ) -> Result<Vec<TriggerInfo>, String> {
        let session = self.get_session(connection_id)?;

        let sql = r#"
            SELECT
                TRIGGER_NAME,
                EVENT_MANIPULATION,
                ACTION_TIMING,
                ACTION_STATEMENT,
                CREATED
            FROM information_schema.TRIGGERS
            WHERE EVENT_OBJECT_SCHEMA = ?
              AND EVENT_OBJECT_TABLE = ?
        "#;

        let rows: Vec<MySqlRow> = sqlx::query(sql)
            .bind(database)
            .bind(table)
            .fetch_all(&session.pool)
            .await
            .map_err(|e| format!("Failed to get triggers: {}", e))?;

        let triggers: Vec<TriggerInfo> = rows
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
            .collect();

        Ok(triggers)
    }

    /// Get table options (engine, charset, collation, etc.)
    pub async fn get_table_options(
        &self,
        connection_id: &str,
        database: &str,
        table: &str,
    ) -> Result<TableOptions, String> {
        let session = self.get_session(connection_id)?;

        let sql = r#"
            SELECT
                ENGINE,
                TABLE_COLLATION,
                TABLE_COMMENT,
                AUTO_INCREMENT,
                ROW_FORMAT
            FROM information_schema.TABLES
            WHERE TABLE_SCHEMA = ?
              AND TABLE_NAME = ?
        "#;

        let row: MySqlRow = sqlx::query(sql)
            .bind(database)
            .bind(table)
            .fetch_one(&session.pool)
            .await
            .map_err(|e| format!("Failed to get table options: {}", e))?;

        let collation: String = row.try_get("TABLE_COLLATION").unwrap_or_default();
        let charset = collation.split('_').next().unwrap_or("utf8mb4").to_string();

        Ok(TableOptions {
            engine: row.try_get("ENGINE").unwrap_or_else(|_| "InnoDB".to_string()),
            charset,
            collation,
            comment: row.try_get("TABLE_COMMENT").unwrap_or_default(),
            auto_increment: row.try_get("AUTO_INCREMENT").ok(),
            row_format: row.try_get("ROW_FORMAT").ok(),
        })
    }

    /// Get extended table structure with all details
    pub async fn get_table_structure_ext(
        &self,
        connection_id: &str,
        database: &str,
        table: &str,
    ) -> Result<TableStructureExt, String> {
        // Get basic structure
        let basic = self.get_table_structure(connection_id, database, table).await?;

        // Get foreign keys
        let foreign_keys = self.get_foreign_keys(connection_id, database, table).await?;

        // Get check constraints
        let check_constraints = self.get_check_constraints(connection_id, database, table).await?;

        // Get triggers
        let triggers = self.get_triggers(connection_id, database, table).await?;

        // Get table options
        let options = self.get_table_options(connection_id, database, table).await?;

        Ok(TableStructureExt {
            database: basic.database,
            table_name: basic.table_name,
            columns: basic.columns,
            indexes: basic.indexes,
            foreign_keys,
            check_constraints,
            triggers,
            options,
        })
    }

    /// Test database connection
    pub async fn test_connection(&self, request: DatabaseConnectRequest) -> Result<(), String> {
        let database = request.database.as_deref().unwrap_or("mysql");
        let password = request.password.as_deref().unwrap_or("");
        let url = format!(
            "mysql://{}:{}@{}:{}/{}",
            request.username, password, request.host, request.port, database
        );

        let pool = MySqlPoolOptions::new()
            .max_connections(1)
            .connect(&url)
            .await
            .map_err(|e| format!("Connection test failed: {}", e))?;

        // Test with simple query
        sqlx::query("SELECT 1")
            .execute(&pool)
            .await
            .map_err(|e| format!("Query test failed: {}", e))?;

        pool.close().await;
        Ok(())
    }

    /// Check if connection exists
    pub fn is_connected(&self, connection_id: &str) -> bool {
        self.sessions.read().contains_key(connection_id)
    }

    /// Get session by connection ID
    fn get_session(&self, connection_id: &str) -> Result<Arc<DatabaseSession>, String> {
        self.sessions
            .read()
            .get(connection_id)
            .cloned()
            .ok_or_else(|| "Connection not found".to_string())
    }
}

impl Default for DatabaseService {
    fn default() -> Self {
        Self::new()
    }
}
