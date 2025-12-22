//! Oracle database driver implementation
//!
//! Uses the oracle crate which requires Oracle Instant Client (OCI) libraries.

use std::collections::HashMap;
use std::time::Instant;

use async_trait::async_trait;
use oracle::{pool::PoolBuilder, Connection, Row as OracleRow};
use parking_lot::Mutex;

use crate::models::{
    CheckConstraintInfo, DatabaseObjectsCount, ForeignKeyInfo, QueryColumn, QueryResult,
    RoutineInfo, TableInfo, TableOptions, TableStructure, TriggerInfo, ViewInfo,
};

use super::traits::{build_column_detail, build_index_map, DatabaseDriver};

/// Oracle database driver
pub struct OracleDriver {
    pool: oracle::pool::Pool,
    /// Current schema (user)
    #[allow(dead_code)]
    current_schema: Mutex<String>,
}

impl OracleDriver {
    /// Create a new Oracle connection
    /// Oracle connection string format: //host:port/service_name or host:port:sid
    pub async fn connect(
        host: &str,
        port: u16,
        username: &str,
        password: &str,
        service_name: &str,
    ) -> Result<Self, String> {
        log::info!(
            "Connecting to Oracle: {}:{}/{}",
            host,
            port,
            service_name
        );

        // Build Oracle connection string (using service name format)
        let connect_string = format!("//{}:{}/{}", host, port, service_name);

        // Create connection pool in a blocking task
        let pool: oracle::pool::Pool = tokio::task::spawn_blocking({
            let connect_string = connect_string.clone();
            let username = username.to_string();
            let password = password.to_string();
            move || -> Result<oracle::pool::Pool, oracle::Error> {
                PoolBuilder::new(&username, &password, &connect_string)
                    .min_connections(2)
                    .max_connections(10)
                    .build()
            }
        })
        .await
        .map_err(|e| format!("Task join error: {}", e))?
        .map_err(|e| {
            log::error!("Failed to connect to Oracle: {}", e);
            format!("Failed to connect to Oracle: {}", e)
        })?;

        log::info!("Oracle connection established successfully");

        Ok(Self {
            pool,
            current_schema: Mutex::new(username.to_uppercase()),
        })
    }

    /// Test connection without keeping it open
    pub async fn test_connection(
        host: &str,
        port: u16,
        username: &str,
        password: &str,
        service_name: &str,
    ) -> Result<(), String> {
        let connect_string = format!("//{}:{}/{}", host, port, service_name);

        tokio::task::spawn_blocking({
            let username = username.to_string();
            let password = password.to_string();
            move || -> Result<(), String> {
                let conn = Connection::connect(&username, &password, &connect_string)
                    .map_err(|e| format!("Connection test failed: {}", e))?;

                conn.query_row_as::<i32>("SELECT 1 FROM DUAL", &[])
                    .map_err(|e| format!("Query test failed: {}", e))?;

                conn.close().map_err(|e| format!("Failed to close: {}", e))?;
                Ok(())
            }
        })
        .await
        .map_err(|e| format!("Task join error: {}", e))?
    }

    /// Get a connection from the pool
    fn get_conn(&self) -> Result<Connection, String> {
        self.pool
            .get()
            .map_err(|e| format!("Failed to get connection: {}", e))
    }

    /// Execute query in blocking context
    async fn execute_blocking<F, T>(&self, f: F) -> Result<T, String>
    where
        F: FnOnce(Connection) -> Result<T, String> + Send + 'static,
        T: Send + 'static,
    {
        let conn = self.get_conn()?;
        tokio::task::spawn_blocking(move || f(conn))
            .await
            .map_err(|e| format!("Task join error: {}", e))?
    }

    /// Convert Oracle row to JSON value
    fn row_to_values(row: &OracleRow, col_count: usize) -> Vec<serde_json::Value> {
        (0..col_count)
            .map(|i| {
                // Try different types and convert to JSON
                if let Ok(v) = row.get::<_, Option<i64>>(i) {
                    v.map(serde_json::Value::from)
                        .unwrap_or(serde_json::Value::Null)
                } else if let Ok(v) = row.get::<_, Option<f64>>(i) {
                    v.map(serde_json::Value::from)
                        .unwrap_or(serde_json::Value::Null)
                } else if let Ok(v) = row.get::<_, Option<String>>(i) {
                    v.map(serde_json::Value::from)
                        .unwrap_or(serde_json::Value::Null)
                } else {
                    serde_json::Value::Null
                }
            })
            .collect()
    }
}

#[async_trait]
impl DatabaseDriver for OracleDriver {
    async fn execute_query(&self, sql: &str) -> Result<QueryResult, String> {
        let sql = sql.to_string();
        let start = Instant::now();

        self.execute_blocking(move |conn| {
            let mut stmt = conn
                .statement(&sql)
                .build()
                .map_err(|e| format!("Failed to prepare statement: {}", e))?;

            let rows = stmt
                .query(&[])
                .map_err(|e| format!("Query failed: {}", e))?;

            let col_info = rows.column_info();
            let columns: Vec<QueryColumn> = col_info
                .iter()
                .map(|c| QueryColumn {
                    name: c.name().to_string(),
                    column_type: format!("{:?}", c.oracle_type()),
                    nullable: c.nullable(),
                })
                .collect();

            let col_count = columns.len();
            let mut data: Vec<Vec<serde_json::Value>> = Vec::new();

            for row_result in rows {
                let row = row_result.map_err(|e| format!("Row fetch failed: {}", e))?;
                data.push(Self::row_to_values(&row, col_count));
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
            let stmt = conn
                .execute(&sql, &[])
                .map_err(|e| format!("Execute failed: {}", e))?;

            let row_count = stmt.row_count().map_err(|e| format!("Row count failed: {}", e))?;

            conn.commit().map_err(|e| format!("Commit failed: {}", e))?;

            Ok(QueryResult {
                columns: vec![],
                rows: vec![],
                affected_rows: row_count,
                execution_time_ms: start.elapsed().as_millis() as u64,
            })
        })
        .await
    }

    async fn get_databases(&self) -> Result<Vec<String>, String> {
        log::info!("Fetching Oracle schemas (users)...");

        // In Oracle, databases are schemas (users)
        // We list accessible schemas
        self.execute_blocking(|conn| {
            let mut schemas = Vec::new();
            let rows = conn
                .query(
                    "SELECT USERNAME FROM ALL_USERS ORDER BY USERNAME",
                    &[],
                )
                .map_err(|e| format!("Failed to get schemas: {}", e))?;

            for row_result in rows {
                let row = row_result.map_err(|e| format!("Row fetch failed: {}", e))?;
                if let Ok(name) = row.get::<_, String>(0) {
                    schemas.push(name);
                }
            }

            log::info!("Found {} schemas", schemas.len());
            Ok(schemas)
        })
        .await
    }

    async fn get_schemas(&self, _database: Option<&str>) -> Result<Vec<String>, String> {
        // Oracle uses schemas = users, already returned by get_databases
        self.get_databases().await
    }

    async fn get_tables(
        &self,
        schema: &str,
        _schema_filter: Option<&str>,
    ) -> Result<Vec<TableInfo>, String> {
        let schema = schema.to_uppercase();

        self.execute_blocking(move |conn| {
            let mut tables = Vec::new();
            let rows = conn
                .query(
                    "SELECT TABLE_NAME FROM ALL_TABLES WHERE OWNER = :1 ORDER BY TABLE_NAME",
                    &[&schema],
                )
                .map_err(|e| format!("Failed to get tables: {}", e))?;

            for row_result in rows {
                let row = row_result.map_err(|e| format!("Row fetch failed: {}", e))?;
                if let Ok(name) = row.get::<_, String>(0) {
                    tables.push(TableInfo {
                        name,
                        table_type: "TABLE".to_string(),
                        row_count: None,
                    });
                }
            }

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
            let sql = r#"
                SELECT
                    COLUMN_NAME,
                    DATA_TYPE ||
                    CASE
                        WHEN DATA_TYPE IN ('VARCHAR2', 'CHAR', 'NVARCHAR2', 'NCHAR')
                            THEN '(' || DATA_LENGTH || ')'
                        WHEN DATA_TYPE = 'NUMBER' AND DATA_PRECISION IS NOT NULL
                            THEN '(' || DATA_PRECISION || ',' || NVL(DATA_SCALE, 0) || ')'
                        ELSE ''
                    END AS DATA_TYPE,
                    NULLABLE,
                    DATA_DEFAULT
                FROM ALL_TAB_COLUMNS
                WHERE OWNER = :1 AND TABLE_NAME = :2
                ORDER BY COLUMN_ID
            "#;

            let rows = conn
                .query(sql, &[&schema, &table])
                .map_err(|e| format!("Failed to get columns: {}", e))?;

            let mut columns = Vec::new();
            for row_result in rows {
                let row = row_result.map_err(|e| format!("Row fetch failed: {}", e))?;
                let name: String = row.get(0).unwrap_or_default();
                let col_type: String = row.get(1).unwrap_or_default();
                let nullable: String = row.get(2).unwrap_or_else(|_| "Y".to_string());
                let default_val: Option<String> = row.get(3).ok();

                columns.push(build_column_detail(
                    name,
                    col_type,
                    nullable == "Y",
                    None, // Key info comes from constraints
                    default_val,
                    None,
                    None,
                ));
            }

            // Get primary key columns
            let pk_sql = r#"
                SELECT cc.COLUMN_NAME
                FROM ALL_CONSTRAINTS c
                JOIN ALL_CONS_COLUMNS cc ON c.CONSTRAINT_NAME = cc.CONSTRAINT_NAME
                    AND c.OWNER = cc.OWNER
                WHERE c.OWNER = :1 AND c.TABLE_NAME = :2 AND c.CONSTRAINT_TYPE = 'P'
                ORDER BY cc.POSITION
            "#;

            let pk_rows = conn.query(pk_sql, &[&schema, &table]).ok();

            let mut pk_columns: Vec<String> = Vec::new();
            if let Some(rows) = pk_rows {
                for row_result in rows {
                    if let Ok(row) = row_result {
                        if let Ok(col) = row.get::<_, String>(0) {
                            pk_columns.push(col);
                        }
                    }
                }
            }

            // Update column key info
            for col in &mut columns {
                if pk_columns.contains(&col.name) {
                    col.key = Some("PRI".to_string());
                }
            }

            // Get indexes
            let index_sql = r#"
                SELECT i.INDEX_NAME, ic.COLUMN_NAME, i.UNIQUENESS, i.INDEX_TYPE
                FROM ALL_INDEXES i
                JOIN ALL_IND_COLUMNS ic ON i.INDEX_NAME = ic.INDEX_NAME
                    AND i.OWNER = ic.INDEX_OWNER
                WHERE i.OWNER = :1 AND i.TABLE_NAME = :2
                ORDER BY i.INDEX_NAME, ic.COLUMN_POSITION
            "#;

            let idx_rows = conn.query(index_sql, &[&schema, &table]).ok();

            let mut index_map: HashMap<String, crate::models::IndexInfo> = HashMap::new();
            if let Some(rows) = idx_rows {
                for row_result in rows {
                    if let Ok(row) = row_result {
                        let idx_name: String = row.get(0).unwrap_or_default();
                        let col_name: String = row.get(1).unwrap_or_default();
                        let uniqueness: String = row.get(2).unwrap_or_default();
                        let idx_type: String = row.get(3).unwrap_or_default();

                        build_index_map(
                            idx_name,
                            col_name,
                            uniqueness == "UNIQUE",
                            idx_type,
                            &mut index_map,
                        );
                    }
                }
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
            let mut views = Vec::new();
            let rows = conn
                .query(
                    "SELECT VIEW_NAME FROM ALL_VIEWS WHERE OWNER = :1 ORDER BY VIEW_NAME",
                    &[&schema],
                )
                .map_err(|e| format!("Failed to get views: {}", e))?;

            for row_result in rows {
                let row = row_result.map_err(|e| format!("Row fetch failed: {}", e))?;
                if let Ok(name) = row.get::<_, String>(0) {
                    views.push(ViewInfo {
                        name,
                        definer: Some(schema.clone()),
                        security_type: None,
                    });
                }
            }

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
            let mut routines = Vec::new();
            let sql = r#"
                SELECT OBJECT_NAME, OBJECT_TYPE, TO_CHAR(CREATED, 'YYYY-MM-DD HH24:MI:SS') AS CREATED
                FROM ALL_OBJECTS
                WHERE OWNER = :1 AND OBJECT_TYPE IN ('FUNCTION', 'PROCEDURE')
                ORDER BY OBJECT_NAME
            "#;

            let rows = conn
                .query(sql, &[&schema])
                .map_err(|e| format!("Failed to get routines: {}", e))?;

            for row_result in rows {
                let row = row_result.map_err(|e| format!("Row fetch failed: {}", e))?;
                let name: String = row.get(0).unwrap_or_default();
                let obj_type: String = row.get(1).unwrap_or_default();
                let created: Option<String> = row.get(2).ok();

                routines.push(RoutineInfo {
                    name,
                    routine_type: obj_type,
                    definer: Some(schema.clone()),
                    created,
                });
            }

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
            let count_sql = r#"
                SELECT
                    NVL(SUM(CASE WHEN OBJECT_TYPE = 'TABLE' THEN 1 ELSE 0 END), 0) as tables,
                    NVL(SUM(CASE WHEN OBJECT_TYPE = 'VIEW' THEN 1 ELSE 0 END), 0) as views,
                    NVL(SUM(CASE WHEN OBJECT_TYPE = 'FUNCTION' THEN 1 ELSE 0 END), 0) as functions,
                    NVL(SUM(CASE WHEN OBJECT_TYPE = 'PROCEDURE' THEN 1 ELSE 0 END), 0) as procedures
                FROM ALL_OBJECTS
                WHERE OWNER = :1 AND OBJECT_TYPE IN ('TABLE', 'VIEW', 'FUNCTION', 'PROCEDURE')
            "#;

            let row = conn
                .query_row(count_sql, &[&schema])
                .map_err(|e| format!("Failed to count objects: {}", e))?;

            Ok(DatabaseObjectsCount {
                tables: row.get::<_, i64>(0).unwrap_or(0) as usize,
                views: row.get::<_, i64>(1).unwrap_or(0) as usize,
                functions: row.get::<_, i64>(2).unwrap_or(0) as usize,
                procedures: row.get::<_, i64>(3).unwrap_or(0) as usize,
            })
        })
        .await
    }

    async fn get_table_ddl(&self, schema: &str, table: &str) -> Result<String, String> {
        let schema = schema.to_uppercase();
        let table = table.to_uppercase();

        self.execute_blocking(move |conn| {
            // Use DBMS_METADATA to get DDL
            let ddl: String = conn
                .query_row_as::<String>(
                    "SELECT DBMS_METADATA.GET_DDL('TABLE', :1, :2) FROM DUAL",
                    &[&table, &schema],
                )
                .map_err(|e| format!("Failed to get DDL: {}", e))?;

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
            conn.execute(&sql, &[])
                .map_err(|e| format!("Failed to rename table: {}", e))?;
            conn.commit().map_err(|e| format!("Commit failed: {}", e))?;
            Ok(())
        })
        .await
    }

    async fn drop_table(&self, schema: &str, table: &str) -> Result<(), String> {
        let schema = schema.to_uppercase();
        let table = table.to_uppercase();

        self.execute_blocking(move |conn| {
            let sql = format!("DROP TABLE \"{}\".\"{}\"", schema, table);
            conn.execute(&sql, &[])
                .map_err(|e| format!("Failed to drop table: {}", e))?;
            conn.commit().map_err(|e| format!("Commit failed: {}", e))?;
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
                    c.CONSTRAINT_NAME,
                    cc.COLUMN_NAME,
                    rc.TABLE_NAME AS REF_TABLE,
                    rcc.COLUMN_NAME AS REF_COLUMN,
                    c.DELETE_RULE
                FROM ALL_CONSTRAINTS c
                JOIN ALL_CONS_COLUMNS cc ON c.CONSTRAINT_NAME = cc.CONSTRAINT_NAME
                    AND c.OWNER = cc.OWNER
                JOIN ALL_CONSTRAINTS rc ON c.R_CONSTRAINT_NAME = rc.CONSTRAINT_NAME
                    AND c.R_OWNER = rc.OWNER
                JOIN ALL_CONS_COLUMNS rcc ON rc.CONSTRAINT_NAME = rcc.CONSTRAINT_NAME
                    AND rc.OWNER = rcc.OWNER
                WHERE c.OWNER = :1 AND c.TABLE_NAME = :2 AND c.CONSTRAINT_TYPE = 'R'
                ORDER BY c.CONSTRAINT_NAME, cc.POSITION
            "#;

            let mut fks = Vec::new();
            let rows = conn.query(sql, &[&schema, &table]).ok();

            if let Some(rows) = rows {
                for row_result in rows {
                    if let Ok(row) = row_result {
                        let name: String = row.get(0).unwrap_or_default();
                        let column: String = row.get(1).unwrap_or_default();
                        let ref_table: String = row.get(2).unwrap_or_default();
                        let ref_column: String = row.get(3).unwrap_or_default();
                        let delete_rule: String = row.get(4).unwrap_or_else(|_| "NO ACTION".to_string());

                        fks.push(ForeignKeyInfo {
                            name,
                            column,
                            ref_table,
                            ref_column,
                            on_delete: delete_rule,
                            on_update: "NO ACTION".to_string(), // Oracle doesn't support ON UPDATE
                        });
                    }
                }
            }

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
                WHERE OWNER = :1 AND TABLE_NAME = :2
                AND CONSTRAINT_TYPE = 'C'
                AND GENERATED = 'USER NAME'
            "#;

            let mut checks = Vec::new();
            let rows = conn.query(sql, &[&schema, &table]).ok();

            if let Some(rows) = rows {
                for row_result in rows {
                    if let Ok(row) = row_result {
                        let name: String = row.get(0).unwrap_or_default();
                        let expr: String = row.get(1).unwrap_or_default();

                        checks.push(CheckConstraintInfo {
                            name,
                            expression: expr,
                        });
                    }
                }
            }

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
                WHERE OWNER = :1 AND TABLE_NAME = :2
                ORDER BY TRIGGER_NAME
            "#;

            let mut triggers = Vec::new();
            let rows = conn.query(sql, &[&schema, &table]).ok();

            if let Some(rows) = rows {
                for row_result in rows {
                    if let Ok(row) = row_result {
                        let name: String = row.get(0).unwrap_or_default();
                        let event: String = row.get(1).unwrap_or_default();
                        let trigger_type: String = row.get(2).unwrap_or_default();
                        let body: String = row.get(3).unwrap_or_default();

                        // Parse trigger_type to get timing (BEFORE/AFTER)
                        let timing = if trigger_type.contains("BEFORE") {
                            "BEFORE"
                        } else if trigger_type.contains("AFTER") {
                            "AFTER"
                        } else {
                            "INSTEAD OF"
                        }
                        .to_string();

                        triggers.push(TriggerInfo {
                            name,
                            event,
                            timing,
                            statement: body,
                            created: None,
                        });
                    }
                }
            }

            Ok(triggers)
        })
        .await
    }

    async fn get_table_options(&self, schema: &str, table: &str) -> Result<TableOptions, String> {
        let schema = schema.to_uppercase();
        let table = table.to_uppercase();

        self.execute_blocking(move |conn| {
            let sql = r#"
                SELECT t.TABLESPACE_NAME, t.COMPRESSION, c.COMMENTS
                FROM ALL_TABLES t
                LEFT JOIN ALL_TAB_COMMENTS c ON t.OWNER = c.OWNER AND t.TABLE_NAME = c.TABLE_NAME
                WHERE t.OWNER = :1 AND t.TABLE_NAME = :2
            "#;

            let row = conn
                .query_row(sql, &[&schema, &table])
                .map_err(|e| format!("Failed to get table options: {}", e))?;

            let tablespace: String = row.get(0).unwrap_or_default();
            let compression: String = row.get(1).unwrap_or_else(|_| "DISABLED".to_string());
            let comment: String = row.get(2).unwrap_or_default();

            Ok(TableOptions {
                engine: tablespace.clone(),   // Use tablespace as "engine" equivalent
                charset: "AL32UTF8".to_string(), // Oracle default charset
                collation: "BINARY".to_string(), // Oracle doesn't have collation like MySQL
                comment,
                auto_increment: None, // Oracle uses SEQUENCE, not auto_increment
                row_format: Some(compression),
            })
        })
        .await
    }

    async fn close(&self) {
        let _ = self.pool.close(&oracle::pool::CloseMode::Default);
    }
}
