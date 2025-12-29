//! DM (达梦) database driver implementation
//!
//! Uses ODBC API for connecting to DM Database (DM7/DM8).
//! Default port: 5236
//!
//! Requires DM ODBC driver to be installed:
//! - Windows: Install DM Client, driver name "DM8 ODBC DRIVER"
//! - Linux: Install unixODBC and configure /etc/odbcinst.ini
//! - macOS: Install unixODBC via brew

use std::collections::HashMap;
use std::time::Instant;

use async_trait::async_trait;
use odbc_api::{buffers::TextRowSet, Connection, ConnectionOptions, Cursor, Environment, ResultSetMetadata};
use parking_lot::Mutex;

use crate::models::{
    CheckConstraintInfo, ColumnDetail, DatabaseObjectsCount, ForeignKeyInfo, IndexInfo,
    QueryColumn, QueryResult, RoutineInfo, TableInfo, TableOptions, TableStructure, TriggerInfo,
    ViewInfo,
};

use super::traits::{build_column_detail, build_index_map, DatabaseDriver};

/// Lazy static ODBC environment (thread-safe singleton)
fn get_odbc_env() -> &'static Environment {
    use std::sync::OnceLock;
    static ENV: OnceLock<Environment> = OnceLock::new();
    ENV.get_or_init(|| {
        Environment::new().expect("Failed to create ODBC environment")
    })
}

/// DM database driver
pub struct DmDriver {
    /// ODBC connection string for reconnection
    conn_string: String,
    /// Current schema (user)
    current_schema: Mutex<String>,
}

impl DmDriver {
    /// Create a new DM connection
    /// DM ODBC connection string format:
    /// DRIVER={DM8 ODBC DRIVER};SERVER=host;PORT=5236;DATABASE=db;UID=user;PWD=pass
    pub async fn connect(
        host: &str,
        port: u16,
        username: &str,
        password: &str,
        database: &str,
    ) -> Result<Self, String> {
        log::info!("Connecting to DM Database: {}:{}/{}", host, port, database);

        // Build ODBC connection string
        let conn_string = format!(
            "DRIVER={{DM8 ODBC DRIVER}};SERVER={};PORT={};DATABASE={};UID={};PWD={}",
            host, port, database, username, password
        );

        // Test connection in blocking task
        let conn_str = conn_string.clone();
        let schema = username.to_uppercase();

        tokio::task::spawn_blocking(move || -> Result<(), String> {
            let env = get_odbc_env();
            let conn = env
                .connect_with_connection_string(&conn_str, ConnectionOptions::default())
                .map_err(|e| format!("Failed to connect to DM: {}", e))?;

            // Test query
            if let Some(cursor) = conn
                .execute("SELECT 1 FROM DUAL", ())
                .map_err(|e| format!("Query test failed: {}", e))?
            {
                drop(cursor);
            }

            drop(conn);
            Ok(())
        })
        .await
        .map_err(|e| format!("Task join error: {}", e))??;

        log::info!("DM connection established successfully");

        Ok(Self {
            conn_string,
            current_schema: Mutex::new(schema),
        })
    }

    /// Test connection without keeping it open
    pub async fn test_connection(
        host: &str,
        port: u16,
        username: &str,
        password: &str,
        database: &str,
    ) -> Result<(), String> {
        let conn_string = format!(
            "DRIVER={{DM8 ODBC DRIVER}};SERVER={};PORT={};DATABASE={};UID={};PWD={}",
            host, port, database, username, password
        );

        tokio::task::spawn_blocking(move || -> Result<(), String> {
            let env = get_odbc_env();
            let conn = env
                .connect_with_connection_string(&conn_string, ConnectionOptions::default())
                .map_err(|e| format!("Connection test failed: {}", e))?;

            // Execute test query
            if let Some(cursor) = conn
                .execute("SELECT 1 FROM DUAL", ())
                .map_err(|e| format!("Query test failed: {}", e))?
            {
                drop(cursor);
            }

            drop(conn);
            Ok(())
        })
        .await
        .map_err(|e| format!("Task join error: {}", e))?
    }

    /// Get a new connection from ODBC
    fn get_conn(&self) -> Result<Connection<'static>, String> {
        let env = get_odbc_env();
        env.connect_with_connection_string(&self.conn_string, ConnectionOptions::default())
            .map_err(|e| format!("Failed to get connection: {}", e))
    }

    /// Execute query in blocking context
    async fn execute_blocking<F, T>(&self, f: F) -> Result<T, String>
    where
        F: FnOnce(Connection<'static>) -> Result<T, String> + Send + 'static,
        T: Send + 'static,
    {
        let conn = self.get_conn()?;
        tokio::task::spawn_blocking(move || f(conn))
            .await
            .map_err(|e| format!("Task join error: {}", e))?
    }

    /// Execute a query and return rows as Vec<Vec<String>>
    fn query_rows(
        conn: &Connection<'_>,
        sql: &str,
        params: &[&str],
    ) -> Result<Vec<Vec<String>>, String> {
        // Build parameter tuple based on count
        let cursor_opt = match params.len() {
            0 => conn.execute(sql, ()).map_err(|e| format!("Query failed: {}", e))?,
            1 => conn
                .execute(sql, &params[0].into_parameter())
                .map_err(|e| format!("Query failed: {}", e))?,
            2 => conn
                .execute(sql, (&params[0].into_parameter(), &params[1].into_parameter()))
                .map_err(|e| format!("Query failed: {}", e))?,
            _ => return Err("Too many parameters".to_string()),
        };

        let Some(mut cursor) = cursor_opt else {
            return Ok(vec![]);
        };

        // Use text buffer for fetching
        let mut rows = Vec::new();
        let batch_size = 1000;
        let max_str_len = 4096;
        let col_count = cursor.num_result_cols().map_err(|e| format!("{}", e))? as usize;

        if col_count == 0 {
            return Ok(vec![]);
        }

        let mut buffers =
            TextRowSet::for_cursor(batch_size, &mut cursor, Some(max_str_len)).map_err(|e| format!("{}", e))?;

        let mut row_set_cursor = cursor.bind_buffer(&mut buffers).map_err(|e| format!("{}", e))?;

        while let Some(batch) = row_set_cursor.fetch().map_err(|e| e.to_string())? {
            for row_idx in 0..batch.num_rows() {
                let mut row = Vec::with_capacity(col_count);
                for col_idx in 0..col_count {
                    let value = batch
                        .at(col_idx, row_idx)
                        .map(|bytes| String::from_utf8_lossy(bytes).to_string())
                        .unwrap_or_default();
                    row.push(value);
                }
                rows.push(row);
            }
        }

        Ok(rows)
    }
}

// Helper trait to convert &str to ODBC parameter
trait IntoOdbcParam {
    fn into_parameter(&self) -> odbc_api::parameter::VarCharSlice<'_>;
}

impl IntoOdbcParam for &str {
    fn into_parameter(&self) -> odbc_api::parameter::VarCharSlice<'_> {
        odbc_api::parameter::VarCharSlice::new(self.as_bytes())
    }
}

#[async_trait]
impl DatabaseDriver for DmDriver {
    async fn execute_query(&self, sql: &str) -> Result<QueryResult, String> {
        let sql = sql.to_string();
        let start = Instant::now();

        self.execute_blocking(move |conn| {
            let cursor_opt = conn
                .execute(&sql, ())
                .map_err(|e| format!("Query failed: {}", e))?;

            let Some(mut cursor) = cursor_opt else {
                return Ok(QueryResult {
                    columns: vec![],
                    rows: vec![],
                    affected_rows: 0,
                    execution_time_ms: start.elapsed().as_millis() as u64,
                });
            };

            // Get column info
            let col_count = cursor.num_result_cols().map_err(|e| format!("{}", e))? as usize;
            let mut columns = Vec::with_capacity(col_count);

            for i in 1..=col_count {
                let col_desc = cursor
                    .col_name(i as u16)
                    .map_err(|e| format!("{}", e))?;
                columns.push(QueryColumn {
                    name: col_desc,
                    column_type: "VARCHAR".to_string(),
                    nullable: true,
                });
            }

            // Fetch rows
            let batch_size = 1000;
            let max_str_len = 4096;

            let mut buffers = TextRowSet::for_cursor(batch_size, &mut cursor, Some(max_str_len))
                .map_err(|e| format!("{}", e))?;

            let mut row_set_cursor = cursor.bind_buffer(&mut buffers).map_err(|e| format!("{}", e))?;
            let mut data: Vec<Vec<serde_json::Value>> = Vec::new();

            while let Some(batch) = row_set_cursor.fetch().map_err(|e| e.to_string())? {
                for row_idx in 0..batch.num_rows() {
                    let mut row = Vec::with_capacity(col_count);
                    for col_idx in 0..col_count {
                        let value = batch
                            .at(col_idx, row_idx)
                            .map(|bytes| {
                                let s = String::from_utf8_lossy(bytes).to_string();
                                // Try to parse as number
                                if let Ok(n) = s.parse::<i64>() {
                                    serde_json::Value::Number(n.into())
                                } else if let Ok(n) = s.parse::<f64>() {
                                    serde_json::Number::from_f64(n)
                                        .map(serde_json::Value::Number)
                                        .unwrap_or(serde_json::Value::String(s.clone()))
                                } else {
                                    serde_json::Value::String(s)
                                }
                            })
                            .unwrap_or(serde_json::Value::Null);
                        row.push(value);
                    }
                    data.push(row);
                }
            }

            let execution_time_ms = start.elapsed().as_millis() as u64;
            let row_count = data.len() as u64;

            Ok(QueryResult {
                columns,
                rows: data,
                affected_rows: row_count,
                execution_time_ms,
            })
        })
        .await
    }

    async fn execute_update(&self, sql: &str) -> Result<QueryResult, String> {
        let sql = sql.to_string();
        let start = Instant::now();

        self.execute_blocking(move |conn| {
            let cursor_opt = conn
                .execute(&sql, ())
                .map_err(|e| format!("Execute failed: {}", e))?;

            // For DML statements, cursor is None
            let affected = if cursor_opt.is_some() { 0 } else { 1 };

            Ok(QueryResult {
                columns: vec![],
                rows: vec![],
                affected_rows: affected,
                execution_time_ms: start.elapsed().as_millis() as u64,
            })
        })
        .await
    }

    async fn get_databases(&self) -> Result<Vec<String>, String> {
        log::info!("Fetching DM schemas (users)...");

        self.execute_blocking(|conn| {
            let sql = r#"
                SELECT USERNAME FROM ALL_USERS
                WHERE USERNAME NOT IN ('SYS', 'SYSTEM', 'CTISYS', 'SYSAUDITOR', 'SYSSSO', 'SYSDBA')
                ORDER BY USERNAME
            "#;

            let rows = Self::query_rows(&conn, sql, &[])?;
            let schemas: Vec<String> = rows.into_iter().filter_map(|r| r.first().cloned()).collect();

            log::info!("Found {} schemas", schemas.len());
            Ok(schemas)
        })
        .await
    }

    async fn get_schemas(&self, _database: Option<&str>) -> Result<Vec<String>, String> {
        // DM uses schemas = users
        self.get_databases().await
    }

    async fn get_tables(
        &self,
        schema: &str,
        _schema_filter: Option<&str>,
    ) -> Result<Vec<TableInfo>, String> {
        let schema = schema.to_uppercase();

        self.execute_blocking(move |conn| {
            let sql = "SELECT TABLE_NAME FROM ALL_TABLES WHERE OWNER = ? ORDER BY TABLE_NAME";
            let rows = Self::query_rows(&conn, sql, &[&schema])?;

            let tables: Vec<TableInfo> = rows
                .into_iter()
                .filter_map(|r| {
                    r.first().map(|name| TableInfo {
                        name: name.clone(),
                        table_type: "TABLE".to_string(),
                        row_count: None,
                    })
                })
                .collect();

            Ok(tables)
        })
        .await
    }

    async fn get_table_structure(
        &self,
        schema: &str,
        table: &str,
    ) -> Result<TableStructure, String> {
        let schema = schema.to_uppercase();
        let table = table.to_uppercase();

        self.execute_blocking(move |conn| {
            // Get columns
            let col_sql = r#"
                SELECT
                    COLUMN_NAME,
                    DATA_TYPE ||
                    CASE
                        WHEN DATA_TYPE IN ('VARCHAR', 'VARCHAR2', 'CHAR', 'NVARCHAR', 'NCHAR')
                            THEN '(' || DATA_LENGTH || ')'
                        WHEN DATA_TYPE IN ('NUMBER', 'DECIMAL', 'NUMERIC') AND DATA_PRECISION IS NOT NULL
                            THEN '(' || DATA_PRECISION || ',' || NVL(DATA_SCALE, 0) || ')'
                        ELSE ''
                    END AS DATA_TYPE,
                    NULLABLE,
                    DATA_DEFAULT
                FROM ALL_TAB_COLUMNS
                WHERE OWNER = ? AND TABLE_NAME = ?
                ORDER BY COLUMN_ID
            "#;

            let col_rows = Self::query_rows(&conn, col_sql, &[&schema, &table])?;

            let mut columns: Vec<ColumnDetail> = col_rows
                .into_iter()
                .map(|r| {
                    let name = r.get(0).cloned().unwrap_or_default();
                    let col_type = r.get(1).cloned().unwrap_or_default();
                    let nullable = r.get(2).map(|s| s == "Y").unwrap_or(true);
                    let default_val = r.get(3).cloned().filter(|s| !s.is_empty());

                    build_column_detail(name, col_type, nullable, None, default_val, None, None)
                })
                .collect();

            // Get primary key columns
            let pk_sql = r#"
                SELECT CC.COLUMN_NAME
                FROM ALL_CONSTRAINTS C
                JOIN ALL_CONS_COLUMNS CC ON C.CONSTRAINT_NAME = CC.CONSTRAINT_NAME
                    AND C.OWNER = CC.OWNER
                WHERE C.OWNER = ? AND C.TABLE_NAME = ? AND C.CONSTRAINT_TYPE = 'P'
                ORDER BY CC.POSITION
            "#;

            let pk_rows = Self::query_rows(&conn, pk_sql, &[&schema, &table]).unwrap_or_default();
            let pk_columns: Vec<String> = pk_rows
                .into_iter()
                .filter_map(|r| r.first().cloned())
                .collect();

            // Update column key info
            for col in &mut columns {
                if pk_columns.contains(&col.name) {
                    col.key = Some("PRI".to_string());
                }
            }

            // Get indexes
            let idx_sql = r#"
                SELECT I.INDEX_NAME, IC.COLUMN_NAME, I.UNIQUENESS, I.INDEX_TYPE
                FROM ALL_INDEXES I
                JOIN ALL_IND_COLUMNS IC ON I.INDEX_NAME = IC.INDEX_NAME
                    AND I.OWNER = IC.INDEX_OWNER
                WHERE I.OWNER = ? AND I.TABLE_NAME = ?
                ORDER BY I.INDEX_NAME, IC.COLUMN_POSITION
            "#;

            let idx_rows = Self::query_rows(&conn, idx_sql, &[&schema, &table]).unwrap_or_default();

            let mut index_map: HashMap<String, IndexInfo> = HashMap::new();
            for r in idx_rows {
                let idx_name = r.get(0).cloned().unwrap_or_default();
                let col_name = r.get(1).cloned().unwrap_or_default();
                let uniqueness = r.get(2).map(|s| s == "UNIQUE").unwrap_or(false);
                let idx_type = r.get(3).cloned().unwrap_or_default();

                build_index_map(idx_name, col_name, uniqueness, idx_type, &mut index_map);
            }

            Ok(TableStructure {
                database: schema,
                table_name: table,
                columns,
                indexes: index_map.into_values().collect(),
            })
        })
        .await
    }

    async fn get_views(
        &self,
        schema: &str,
        _schema_filter: Option<&str>,
    ) -> Result<Vec<ViewInfo>, String> {
        let schema = schema.to_uppercase();

        self.execute_blocking(move |conn| {
            let sql = "SELECT VIEW_NAME FROM ALL_VIEWS WHERE OWNER = ? ORDER BY VIEW_NAME";
            let rows = Self::query_rows(&conn, sql, &[&schema])?;

            let views: Vec<ViewInfo> = rows
                .into_iter()
                .filter_map(|r| {
                    r.first().map(|name| ViewInfo {
                        name: name.clone(),
                        definer: Some(schema.clone()),
                        security_type: None,
                    })
                })
                .collect();

            Ok(views)
        })
        .await
    }

    async fn get_routines(
        &self,
        schema: &str,
        _schema_filter: Option<&str>,
    ) -> Result<Vec<RoutineInfo>, String> {
        let schema = schema.to_uppercase();

        self.execute_blocking(move |conn| {
            let sql = r#"
                SELECT OBJECT_NAME, OBJECT_TYPE, TO_CHAR(CREATED, 'YYYY-MM-DD HH24:MI:SS') AS CREATED
                FROM ALL_OBJECTS
                WHERE OWNER = ? AND OBJECT_TYPE IN ('FUNCTION', 'PROCEDURE')
                ORDER BY OBJECT_NAME
            "#;

            let rows = Self::query_rows(&conn, sql, &[&schema])?;

            let routines: Vec<RoutineInfo> = rows
                .into_iter()
                .map(|r| RoutineInfo {
                    name: r.get(0).cloned().unwrap_or_default(),
                    routine_type: r.get(1).cloned().unwrap_or_default(),
                    definer: Some(schema.clone()),
                    created: r.get(2).cloned(),
                })
                .collect();

            Ok(routines)
        })
        .await
    }

    async fn get_objects_count(
        &self,
        schema: &str,
        _schema_filter: Option<&str>,
    ) -> Result<DatabaseObjectsCount, String> {
        let schema = schema.to_uppercase();

        self.execute_blocking(move |conn| {
            let sql = r#"
                SELECT
                    NVL(SUM(CASE WHEN OBJECT_TYPE = 'TABLE' THEN 1 ELSE 0 END), 0) AS TABLES,
                    NVL(SUM(CASE WHEN OBJECT_TYPE = 'VIEW' THEN 1 ELSE 0 END), 0) AS VIEWS,
                    NVL(SUM(CASE WHEN OBJECT_TYPE = 'FUNCTION' THEN 1 ELSE 0 END), 0) AS FUNCTIONS,
                    NVL(SUM(CASE WHEN OBJECT_TYPE = 'PROCEDURE' THEN 1 ELSE 0 END), 0) AS PROCEDURES
                FROM ALL_OBJECTS
                WHERE OWNER = ? AND OBJECT_TYPE IN ('TABLE', 'VIEW', 'FUNCTION', 'PROCEDURE')
            "#;

            let rows = Self::query_rows(&conn, sql, &[&schema])?;

            let row = rows.first();
            Ok(DatabaseObjectsCount {
                tables: row
                    .and_then(|r| r.get(0))
                    .and_then(|s| s.parse().ok())
                    .unwrap_or(0),
                views: row
                    .and_then(|r| r.get(1))
                    .and_then(|s| s.parse().ok())
                    .unwrap_or(0),
                functions: row
                    .and_then(|r| r.get(2))
                    .and_then(|s| s.parse().ok())
                    .unwrap_or(0),
                procedures: row
                    .and_then(|r| r.get(3))
                    .and_then(|s| s.parse().ok())
                    .unwrap_or(0),
            })
        })
        .await
    }

    async fn get_table_ddl(&self, schema: &str, table: &str) -> Result<String, String> {
        let schema = schema.to_uppercase();
        let table = table.to_uppercase();

        self.execute_blocking(move |conn| {
            // Use DBMS_METADATA.GET_DDL
            let sql = "SELECT DBMS_METADATA.GET_DDL('TABLE', ?, ?) FROM DUAL";
            let rows = Self::query_rows(&conn, sql, &[&table, &schema])?;

            let ddl = rows
                .first()
                .and_then(|r| r.first().cloned())
                .unwrap_or_else(|| format!("-- DDL not available for {}.{}", schema, table));

            Ok(ddl)
        })
        .await
    }

    async fn rename_table(
        &self,
        schema: &str,
        old_name: &str,
        new_name: &str,
    ) -> Result<(), String> {
        let schema = schema.to_uppercase();
        let old_name = old_name.to_uppercase();
        let new_name = new_name.to_uppercase();

        self.execute_blocking(move |conn| {
            let sql = format!(
                "ALTER TABLE \"{}\".\"{}\" RENAME TO \"{}\"",
                schema, old_name, new_name
            );
            conn.execute(&sql, ())
                .map_err(|e| format!("Failed to rename table: {}", e))?;
            Ok(())
        })
        .await
    }

    async fn drop_table(&self, schema: &str, table: &str) -> Result<(), String> {
        let schema = schema.to_uppercase();
        let table = table.to_uppercase();

        self.execute_blocking(move |conn| {
            let sql = format!("DROP TABLE \"{}\".\"{}\" CASCADE CONSTRAINTS", schema, table);
            conn.execute(&sql, ())
                .map_err(|e| format!("Failed to drop table: {}", e))?;
            Ok(())
        })
        .await
    }

    async fn get_foreign_keys(
        &self,
        schema: &str,
        table: &str,
    ) -> Result<Vec<ForeignKeyInfo>, String> {
        let schema = schema.to_uppercase();
        let table = table.to_uppercase();

        self.execute_blocking(move |conn| {
            let sql = r#"
                SELECT
                    C.CONSTRAINT_NAME,
                    CC.COLUMN_NAME,
                    RC.TABLE_NAME AS REF_TABLE,
                    RCC.COLUMN_NAME AS REF_COLUMN,
                    C.DELETE_RULE
                FROM ALL_CONSTRAINTS C
                JOIN ALL_CONS_COLUMNS CC ON C.CONSTRAINT_NAME = CC.CONSTRAINT_NAME
                    AND C.OWNER = CC.OWNER
                JOIN ALL_CONSTRAINTS RC ON C.R_CONSTRAINT_NAME = RC.CONSTRAINT_NAME
                    AND C.R_OWNER = RC.OWNER
                JOIN ALL_CONS_COLUMNS RCC ON RC.CONSTRAINT_NAME = RCC.CONSTRAINT_NAME
                    AND RC.OWNER = RCC.OWNER
                WHERE C.OWNER = ? AND C.TABLE_NAME = ? AND C.CONSTRAINT_TYPE = 'R'
                ORDER BY C.CONSTRAINT_NAME, CC.POSITION
            "#;

            let rows = Self::query_rows(&conn, sql, &[&schema, &table]).unwrap_or_default();

            let fks: Vec<ForeignKeyInfo> = rows
                .into_iter()
                .map(|r| ForeignKeyInfo {
                    name: r.get(0).cloned().unwrap_or_default(),
                    column: r.get(1).cloned().unwrap_or_default(),
                    ref_table: r.get(2).cloned().unwrap_or_default(),
                    ref_column: r.get(3).cloned().unwrap_or_default(),
                    on_delete: r.get(4).cloned().unwrap_or_else(|| "NO ACTION".to_string()),
                    on_update: "NO ACTION".to_string(), // DM follows Oracle pattern
                })
                .collect();

            Ok(fks)
        })
        .await
    }

    async fn get_check_constraints(
        &self,
        schema: &str,
        table: &str,
    ) -> Result<Vec<CheckConstraintInfo>, String> {
        let schema = schema.to_uppercase();
        let table = table.to_uppercase();

        self.execute_blocking(move |conn| {
            let sql = r#"
                SELECT CONSTRAINT_NAME, SEARCH_CONDITION
                FROM ALL_CONSTRAINTS
                WHERE OWNER = ? AND TABLE_NAME = ?
                AND CONSTRAINT_TYPE = 'C'
                AND GENERATED = 'USER NAME'
            "#;

            let rows = Self::query_rows(&conn, sql, &[&schema, &table]).unwrap_or_default();

            let checks: Vec<CheckConstraintInfo> = rows
                .into_iter()
                .map(|r| CheckConstraintInfo {
                    name: r.get(0).cloned().unwrap_or_default(),
                    expression: r.get(1).cloned().unwrap_or_default(),
                })
                .collect();

            Ok(checks)
        })
        .await
    }

    async fn get_triggers(&self, schema: &str, table: &str) -> Result<Vec<TriggerInfo>, String> {
        let schema = schema.to_uppercase();
        let table = table.to_uppercase();

        self.execute_blocking(move |conn| {
            let sql = r#"
                SELECT TRIGGER_NAME, TRIGGERING_EVENT, TRIGGER_TYPE, TRIGGER_BODY
                FROM ALL_TRIGGERS
                WHERE OWNER = ? AND TABLE_NAME = ?
                ORDER BY TRIGGER_NAME
            "#;

            let rows = Self::query_rows(&conn, sql, &[&schema, &table]).unwrap_or_default();

            let triggers: Vec<TriggerInfo> = rows
                .into_iter()
                .map(|r| {
                    let trigger_type = r.get(2).cloned().unwrap_or_default();
                    let timing = if trigger_type.contains("BEFORE") {
                        "BEFORE"
                    } else if trigger_type.contains("AFTER") {
                        "AFTER"
                    } else {
                        "INSTEAD OF"
                    }
                    .to_string();

                    TriggerInfo {
                        name: r.get(0).cloned().unwrap_or_default(),
                        event: r.get(1).cloned().unwrap_or_default(),
                        timing,
                        statement: r.get(3).cloned().unwrap_or_default(),
                        created: None,
                    }
                })
                .collect();

            Ok(triggers)
        })
        .await
    }

    async fn get_table_options(&self, schema: &str, table: &str) -> Result<TableOptions, String> {
        let schema = schema.to_uppercase();
        let table = table.to_uppercase();

        self.execute_blocking(move |conn| {
            let sql = r#"
                SELECT T.TABLESPACE_NAME, C.COMMENTS
                FROM ALL_TABLES T
                LEFT JOIN ALL_TAB_COMMENTS C ON T.OWNER = C.OWNER AND T.TABLE_NAME = C.TABLE_NAME
                WHERE T.OWNER = ? AND T.TABLE_NAME = ?
            "#;

            let rows = Self::query_rows(&conn, sql, &[&schema, &table]).unwrap_or_default();
            let row = rows.first();

            let tablespace = row.and_then(|r| r.get(0).cloned()).unwrap_or_default();
            let comment = row.and_then(|r| r.get(1).cloned()).unwrap_or_default();

            Ok(TableOptions {
                engine: tablespace,
                charset: "UTF8".to_string(),
                collation: "BINARY".to_string(),
                comment,
                auto_increment: None,
                row_format: None,
            })
        })
        .await
    }

    async fn close(&self) {
        // Connections are not pooled, nothing to close explicitly
        log::info!("DM connection closed");
    }
}
