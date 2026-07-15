//! SQL Server (MSSQL) database driver implementation
//!
//! Uses tiberius crate with bb8 connection pooling for SQL Server connectivity.
//! Supports SQL Server 2014+, Azure SQL Database.

use std::collections::HashMap;
use std::time::Instant;

use async_trait::async_trait;
use tiberius::{AuthMethod, Client, Column, Config, Query, Row};
use tokio::net::TcpStream;
use tokio_util::compat::{Compat, TokioAsyncWriteCompatExt};

use crate::models::{
    CheckConstraintInfo, ColumnDetail, DatabaseObjectsCount, ForeignKeyInfo, IndexInfo,
    QueryColumn, QueryResult, RoutineInfo, TableInfo, TableOptions, TableStructure, TriggerInfo,
    ViewInfo,
};

use super::traits::{build_column_detail, build_index_map, DatabaseDriver};
use super::utils::{escape_bracket_identifier, validate_sql_identifier, MAX_QUERY_ROWS};

// -- bb8 connection manager for tiberius --

#[derive(Debug)]
enum MssqlPoolError {
    Io(std::io::Error),
    Tiberius(tiberius::error::Error),
}

impl std::fmt::Display for MssqlPoolError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Io(e) => write!(f, "IO: {}", e),
            Self::Tiberius(e) => write!(f, "Tiberius: {}", e),
        }
    }
}

impl std::error::Error for MssqlPoolError {}

struct TiberiusConnectionManager {
    config: Config,
    addr: String,
}

#[async_trait]
impl bb8::ManageConnection for TiberiusConnectionManager {
    type Connection = Client<Compat<TcpStream>>;
    type Error = MssqlPoolError;

    async fn connect(&self) -> Result<Self::Connection, Self::Error> {
        let tcp = TcpStream::connect(&self.addr)
            .await
            .map_err(MssqlPoolError::Io)?;
        tcp.set_nodelay(true).ok();
        Client::connect(self.config.clone(), tcp.compat_write())
            .await
            .map_err(MssqlPoolError::Tiberius)
    }

    async fn is_valid(&self, conn: &mut Self::Connection) -> Result<(), Self::Error> {
        conn.simple_query("SELECT 1")
            .await
            .map_err(MssqlPoolError::Tiberius)?
            .into_results()
            .await
            .map_err(MssqlPoolError::Tiberius)?;
        Ok(())
    }

    fn has_broken(&self, _conn: &mut Self::Connection) -> bool {
        false
    }
}

/// SQL Server database driver with connection pooling
pub struct MssqlDriver {
    pool: bb8::Pool<TiberiusConnectionManager>,
}

impl MssqlDriver {
    /// Create a new SQL Server connection pool
    pub async fn connect(
        host: &str,
        port: u16,
        username: &str,
        password: &str,
        database: &str,
    ) -> Result<Self, String> {
        let mut config = Config::new();
        config.host(host);
        config.port(port);
        config.authentication(AuthMethod::sql_server(username, password));
        config.database(database);
        config.trust_cert();

        log::info!("Connecting to SQL Server: {}:{}/{}", host, port, database);

        let addr = format!("{}:{}", host, port);
        let manager = TiberiusConnectionManager {
            config,
            addr,
        };

        let pool = bb8::Pool::builder()
            .max_size(10)
            .min_idle(Some(2))
            .build(manager)
            .await
            .map_err(|e| format!("Failed to create connection pool: {}", e))?;

        log::info!("SQL Server connection pool established successfully");
        Ok(Self { pool })
    }

    /// Test connection without keeping a pool open
    pub async fn test_connection(
        host: &str,
        port: u16,
        username: &str,
        password: &str,
        database: &str,
    ) -> Result<(), String> {
        let mut config = Config::new();
        config.host(host);
        config.port(port);
        config.authentication(AuthMethod::sql_server(username, password));
        config.database(database);
        config.trust_cert();

        let tcp = TcpStream::connect(format!("{}:{}", host, port))
            .await
            .map_err(|e| format!("TCP connection failed: {}", e))?;
        tcp.set_nodelay(true).ok();

        let mut client = Client::connect(config, tcp.compat_write())
            .await
            .map_err(|e| format!("Connection test failed: {}", e))?;

        client
            .simple_query("SELECT 1")
            .await
            .map_err(|e| format!("Query test failed: {}", e))?
            .into_results()
            .await
            .map_err(|e| format!("Query test failed: {}", e))?;

        Ok(())
    }

    /// Get column type name from Column metadata
    fn get_column_type_name(col: &Column) -> String {
        format!("{:?}", col.column_type())
    }

    /// Extract value from a row at given index and convert to JSON
    fn row_value_to_json(row: &Row, index: usize) -> serde_json::Value {
        if let Some(val) = row.try_get::<&str, _>(index).ok().flatten() {
            return serde_json::Value::String(val.to_string());
        }
        // TINYINT is unsigned (0-255) in SQL Server; tiberius decodes it as u8
        if let Some(val) = row.try_get::<u8, _>(index).ok().flatten() {
            return serde_json::Value::Number(val.into());
        }
        if let Some(val) = row.try_get::<i64, _>(index).ok().flatten() {
            return serde_json::Value::Number(val.into());
        }
        if let Some(val) = row.try_get::<i32, _>(index).ok().flatten() {
            return serde_json::Value::Number(val.into());
        }
        if let Some(val) = row.try_get::<i16, _>(index).ok().flatten() {
            return serde_json::Value::Number(val.into());
        }
        // DECIMAL/NUMERIC/MONEY: keep as string to preserve precision
        if let Some(val) = row.try_get::<tiberius::numeric::Numeric, _>(index).ok().flatten() {
            return serde_json::Value::String(val.to_string());
        }
        if let Some(val) = row.try_get::<f64, _>(index).ok().flatten() {
            return serde_json::json!(val);
        }
        if let Some(val) = row.try_get::<f32, _>(index).ok().flatten() {
            return serde_json::json!(val);
        }
        if let Some(val) = row.try_get::<bool, _>(index).ok().flatten() {
            return serde_json::Value::Bool(val);
        }
        if let Some(val) = row.try_get::<uuid::Uuid, _>(index).ok().flatten() {
            return serde_json::Value::String(val.to_string());
        }
        if let Some(val) = row.try_get::<chrono::NaiveDateTime, _>(index).ok().flatten() {
            return serde_json::Value::String(val.to_string());
        }
        // NOTE: plain DATE/TIME/DATETIMEOFFSET columns aren't decoded here —
        // tiberius 0.12's chrono FromSql impls for NaiveDate/NaiveTime/
        // DateTime are not available against this project's chrono, so those
        // still fall through to Null (DATETIME/DATETIME2 work via NaiveDateTime).
        if let Some(val) = row.try_get::<&[u8], _>(index).ok().flatten() {
            return serde_json::Value::String(format!(
                "0x{}",
                val.iter().map(|b| format!("{:02x}", b)).collect::<String>()
            ));
        }
        serde_json::Value::Null
    }
}

#[async_trait]
impl DatabaseDriver for MssqlDriver {
    fn supports_database_switch(&self) -> bool {
        true
    }

    async fn execute_query(&self, sql: &str) -> Result<QueryResult, String> {
        let start = Instant::now();

        let mut client = self.pool.get().await.map_err(|e| format!("Pool error: {}", e))?;
        let query = Query::new(sql);

        let stream = query
            .query(&mut *client)
            .await
            .map_err(|e| format!("Query failed: {}", e))?;

        let rows: Vec<Row> = stream
            .into_first_result()
            .await
            .map_err(|e| format!("Failed to get results: {}", e))?;

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
                    column_type: Self::get_column_type_name(col),
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
                    .map(|(i, _col)| Self::row_value_to_json(row, i))
                    .collect()
            })
            .collect();

        if truncated {
            data.push(vec![serde_json::Value::String(format!(
                "[Result truncated: showing {} of {} rows]",
                MAX_QUERY_ROWS, total_rows
            ))]);
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

        let mut client = self.pool.get().await.map_err(|e| format!("Pool error: {}", e))?;

        let result = client
            .execute(sql, &[])
            .await
            .map_err(|e| format!("Execute failed: {}", e))?;

        Ok(QueryResult {
            columns: vec![],
            rows: vec![],
            affected_rows: result.rows_affected().iter().sum(),
            execution_time_ms: start.elapsed().as_millis() as u64,
        })
    }

    async fn get_databases(&self) -> Result<Vec<String>, String> {
        log::info!("Fetching SQL Server databases list...");

        let sql = "SELECT name FROM sys.databases WHERE state = 0 ORDER BY name";
        let result = self.execute_query(sql).await?;

        let databases: Vec<String> = result
            .rows
            .iter()
            .filter_map(|row| row.first().and_then(|v| v.as_str().map(|s| s.to_string())))
            .collect();

        log::info!("Found {} databases", databases.len());
        Ok(databases)
    }

    async fn get_schemas(&self, _database: Option<&str>) -> Result<Vec<String>, String> {
        let sql = "SELECT name FROM sys.schemas WHERE schema_id < 16384 ORDER BY name";
        let result = self.execute_query(sql).await?;

        Ok(result
            .rows
            .iter()
            .filter_map(|row| row.first().and_then(|v| v.as_str().map(|s| s.to_string())))
            .collect())
    }

    async fn get_tables(
        &self,
        database: &str,
        schema: Option<&str>,
    ) -> Result<Vec<TableInfo>, String> {
        let schema_filter = schema.unwrap_or("dbo");
        validate_sql_identifier(database)?;
        validate_sql_identifier(schema_filter)?;

        let sql = format!(
            "SELECT TABLE_NAME FROM [{database}].INFORMATION_SCHEMA.TABLES \
             WHERE TABLE_TYPE = 'BASE TABLE' AND TABLE_SCHEMA = '{schema_filter}' \
             ORDER BY TABLE_NAME"
        );

        let result = self.execute_query(&sql).await?;

        Ok(result
            .rows
            .iter()
            .filter_map(|row| {
                row.first().and_then(|v| {
                    v.as_str().map(|name| TableInfo {
                        name: name.to_string(),
                        table_type: "BASE TABLE".to_string(),
                        row_count: None,
                    })
                })
            })
            .collect())
    }

    async fn get_table_structure(
        &self,
        database: &str,
        table: &str,
    ) -> Result<TableStructure, String> {
        validate_sql_identifier(database)?;
        validate_sql_identifier(table)?;
        let columns_sql = format!(
            "SELECT
                c.COLUMN_NAME,
                c.DATA_TYPE,
                c.CHARACTER_MAXIMUM_LENGTH,
                c.NUMERIC_PRECISION,
                c.NUMERIC_SCALE,
                c.IS_NULLABLE,
                c.COLUMN_DEFAULT,
                CASE WHEN pk.COLUMN_NAME IS NOT NULL THEN 'PRI'
                     WHEN uq.COLUMN_NAME IS NOT NULL THEN 'UNI'
                     ELSE NULL END AS KEY_TYPE,
                CASE WHEN ic.is_identity = 1 THEN 'auto_increment' ELSE NULL END AS EXTRA,
                ep.value AS COMMENT
            FROM [{database}].INFORMATION_SCHEMA.COLUMNS c
            LEFT JOIN (
                SELECT ku.COLUMN_NAME
                FROM [{database}].INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
                JOIN [{database}].INFORMATION_SCHEMA.KEY_COLUMN_USAGE ku
                    ON tc.CONSTRAINT_NAME = ku.CONSTRAINT_NAME
                WHERE tc.TABLE_NAME = '{table}' AND tc.TABLE_SCHEMA = 'dbo' AND tc.CONSTRAINT_TYPE = 'PRIMARY KEY'
            ) pk ON c.COLUMN_NAME = pk.COLUMN_NAME
            LEFT JOIN (
                SELECT ku.COLUMN_NAME
                FROM [{database}].INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
                JOIN [{database}].INFORMATION_SCHEMA.KEY_COLUMN_USAGE ku
                    ON tc.CONSTRAINT_NAME = ku.CONSTRAINT_NAME
                WHERE tc.TABLE_NAME = '{table}' AND tc.TABLE_SCHEMA = 'dbo' AND tc.CONSTRAINT_TYPE = 'UNIQUE'
            ) uq ON c.COLUMN_NAME = uq.COLUMN_NAME
            LEFT JOIN [{database}].sys.identity_columns ic
                ON ic.object_id = OBJECT_ID('[{database}].[dbo].[{table}]')
                AND ic.name = c.COLUMN_NAME
            LEFT JOIN [{database}].sys.extended_properties ep
                ON ep.major_id = OBJECT_ID('[{database}].[dbo].[{table}]')
                AND ep.minor_id = COLUMNPROPERTY(OBJECT_ID('[{database}].[dbo].[{table}]'), c.COLUMN_NAME, 'ColumnId')
                AND ep.name = 'MS_Description'
            WHERE c.TABLE_NAME = '{table}' AND c.TABLE_SCHEMA = 'dbo'
            ORDER BY c.ORDINAL_POSITION"
        );

        let col_result = self.execute_query(&columns_sql).await?;

        let columns: Vec<ColumnDetail> = col_result
            .rows
            .iter()
            .filter_map(|row| {
                let name = row.get(0)?.as_str()?.to_string();
                let data_type = row.get(1)?.as_str()?.to_string();
                let char_max_len = row.get(2).and_then(|v| v.as_i64());
                let num_precision = row.get(3).and_then(|v| v.as_i64());
                let num_scale = row.get(4).and_then(|v| v.as_i64());
                let nullable = row.get(5).and_then(|v| v.as_str()) == Some("YES");
                let default_value = row.get(6).and_then(|v| v.as_str()).map(|s| s.to_string());
                let key = row.get(7).and_then(|v| v.as_str()).map(|s| s.to_string());
                let extra = row.get(8).and_then(|v| v.as_str()).map(|s| s.to_string());
                let comment = row.get(9).and_then(|v| v.as_str()).map(|s| s.to_string());

                let column_type = build_mssql_column_type(&data_type, char_max_len, num_precision, num_scale);

                Some(build_column_detail(
                    name,
                    column_type,
                    nullable,
                    key,
                    default_value,
                    extra,
                    comment,
                ))
            })
            .collect();

        let indexes_sql = format!(
            "SELECT
                i.name AS index_name,
                c.name AS column_name,
                i.is_unique,
                i.type_desc AS index_type
            FROM [{database}].sys.indexes i
            JOIN [{database}].sys.index_columns ic
                ON i.object_id = ic.object_id AND i.index_id = ic.index_id
            JOIN [{database}].sys.columns c
                ON ic.object_id = c.object_id AND ic.column_id = c.column_id
            WHERE i.object_id = OBJECT_ID('[{database}].[dbo].[{table}]')
                AND i.name IS NOT NULL
                AND i.is_primary_key = 0
            ORDER BY i.name, ic.key_ordinal"
        );

        let idx_result = self.execute_query(&indexes_sql).await?;

        let mut index_map: HashMap<String, IndexInfo> = HashMap::new();
        for row in &idx_result.rows {
            if let (Some(idx_name), Some(col_name), Some(is_unique), Some(idx_type)) = (
                row.get(0).and_then(|v| v.as_str()),
                row.get(1).and_then(|v| v.as_str()),
                row.get(2).and_then(|v| v.as_bool()),
                row.get(3).and_then(|v| v.as_str()),
            ) {
                build_index_map(
                    idx_name.to_string(),
                    col_name.to_string(),
                    is_unique,
                    idx_type.to_string(),
                    &mut index_map,
                );
            }
        }

        Ok(TableStructure {
            database: database.to_string(),
            table_name: table.to_string(),
            columns,
            indexes: index_map.into_values().collect(),
        })
    }

    async fn get_views(
        &self,
        database: &str,
        schema: Option<&str>,
    ) -> Result<Vec<ViewInfo>, String> {
        let schema_filter = schema.unwrap_or("dbo");
        validate_sql_identifier(database)?;
        validate_sql_identifier(schema_filter)?;

        let sql = format!(
            "SELECT TABLE_NAME FROM [{database}].INFORMATION_SCHEMA.VIEWS \
             WHERE TABLE_SCHEMA = '{schema_filter}' ORDER BY TABLE_NAME"
        );

        let result = self.execute_query(&sql).await?;

        Ok(result
            .rows
            .iter()
            .filter_map(|row| {
                row.first().and_then(|v| {
                    v.as_str().map(|name| ViewInfo {
                        name: name.to_string(),
                        definer: None,
                        security_type: None,
                    })
                })
            })
            .collect())
    }

    async fn get_routines(
        &self,
        database: &str,
        schema: Option<&str>,
    ) -> Result<Vec<RoutineInfo>, String> {
        let schema_filter = schema.unwrap_or("dbo");
        validate_sql_identifier(database)?;
        validate_sql_identifier(schema_filter)?;

        let sql = format!(
            "SELECT ROUTINE_NAME, ROUTINE_TYPE, CREATED \
             FROM [{database}].INFORMATION_SCHEMA.ROUTINES \
             WHERE ROUTINE_SCHEMA = '{schema_filter}' ORDER BY ROUTINE_NAME"
        );

        let result = self.execute_query(&sql).await?;

        Ok(result
            .rows
            .iter()
            .filter_map(|row| {
                let name = row.get(0)?.as_str()?.to_string();
                let routine_type = row.get(1)?.as_str()?.to_string();
                let created = row.get(2).and_then(|v| v.as_str()).map(|s| s.to_string());

                Some(RoutineInfo {
                    name,
                    routine_type,
                    definer: None,
                    created,
                })
            })
            .collect())
    }

    async fn get_objects_count(
        &self,
        database: &str,
        schema: Option<&str>,
    ) -> Result<DatabaseObjectsCount, String> {
        let schema_filter = schema.unwrap_or("dbo");
        validate_sql_identifier(database)?;
        validate_sql_identifier(schema_filter)?;

        let sql = format!(
            "SELECT
                (SELECT COUNT(*) FROM [{database}].INFORMATION_SCHEMA.TABLES
                 WHERE TABLE_SCHEMA = '{schema_filter}' AND TABLE_TYPE = 'BASE TABLE') AS tables_count,
                (SELECT COUNT(*) FROM [{database}].INFORMATION_SCHEMA.VIEWS
                 WHERE TABLE_SCHEMA = '{schema_filter}') AS views_count,
                (SELECT COUNT(*) FROM [{database}].INFORMATION_SCHEMA.ROUTINES
                 WHERE ROUTINE_SCHEMA = '{schema_filter}' AND ROUTINE_TYPE = 'FUNCTION') AS functions_count,
                (SELECT COUNT(*) FROM [{database}].INFORMATION_SCHEMA.ROUTINES
                 WHERE ROUTINE_SCHEMA = '{schema_filter}' AND ROUTINE_TYPE = 'PROCEDURE') AS procedures_count"
        );

        let result = self.execute_query(&sql).await?;

        if let Some(row) = result.rows.first() {
            Ok(DatabaseObjectsCount {
                tables: row.get(0).and_then(|v| v.as_i64()).unwrap_or(0) as usize,
                views: row.get(1).and_then(|v| v.as_i64()).unwrap_or(0) as usize,
                functions: row.get(2).and_then(|v| v.as_i64()).unwrap_or(0) as usize,
                procedures: row.get(3).and_then(|v| v.as_i64()).unwrap_or(0) as usize,
            })
        } else {
            Ok(DatabaseObjectsCount {
                tables: 0,
                views: 0,
                functions: 0,
                procedures: 0,
            })
        }
    }

    async fn get_table_ddl(&self, database: &str, table: &str) -> Result<String, String> {
        let structure = self.get_table_structure(database, table).await?;
        let foreign_keys = self.get_foreign_keys(database, table).await?;
        let options = self.get_table_options(database, table).await?;

        let ddl = build_mssql_ddl(table, &structure, &foreign_keys, &options);
        Ok(ddl)
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
        // Qualify sp_rename with the target database so it runs in the right
        // database context (the base pool is pinned to the connect-time db);
        // an unqualified sp_rename would rename in the wrong database.
        let sql = format!(
            "EXEC [{}].sys.sp_rename 'dbo.{}', '{}'",
            escape_bracket_identifier(database),
            old_name.replace('\'', "''"),
            new_name.replace('\'', "''")
        );
        self.execute_update(&sql).await?;
        Ok(())
    }

    async fn drop_table(&self, database: &str, table: &str) -> Result<(), String> {
        validate_sql_identifier(database)?;
        validate_sql_identifier(table)?;
        let sql = format!(
            "DROP TABLE [{}].[dbo].[{}]",
            escape_bracket_identifier(database),
            escape_bracket_identifier(table)
        );
        self.execute_update(&sql).await?;
        Ok(())
    }

    async fn get_foreign_keys(
        &self,
        database: &str,
        table: &str,
    ) -> Result<Vec<ForeignKeyInfo>, String> {
        validate_sql_identifier(database)?;
        validate_sql_identifier(table)?;
        let sql = format!(
            "SELECT
                fk.name AS constraint_name,
                c1.name AS column_name,
                t2.name AS ref_table,
                c2.name AS ref_column,
                fk.delete_referential_action_desc AS on_delete,
                fk.update_referential_action_desc AS on_update
            FROM [{database}].sys.foreign_keys fk
            JOIN [{database}].sys.foreign_key_columns fkc
                ON fk.object_id = fkc.constraint_object_id
            JOIN [{database}].sys.columns c1
                ON fkc.parent_object_id = c1.object_id AND fkc.parent_column_id = c1.column_id
            JOIN [{database}].sys.tables t2
                ON fkc.referenced_object_id = t2.object_id
            JOIN [{database}].sys.columns c2
                ON fkc.referenced_object_id = c2.object_id AND fkc.referenced_column_id = c2.column_id
            WHERE fk.parent_object_id = OBJECT_ID('[{database}].[dbo].[{table}]')
            ORDER BY fk.name"
        );

        let result = self.execute_query(&sql).await?;

        Ok(result
            .rows
            .iter()
            .filter_map(|row| {
                Some(ForeignKeyInfo {
                    name: row.get(0)?.as_str()?.to_string(),
                    column: row.get(1)?.as_str()?.to_string(),
                    ref_table: row.get(2)?.as_str()?.to_string(),
                    ref_column: row.get(3)?.as_str()?.to_string(),
                    on_delete: row.get(4)?.as_str().unwrap_or("NO_ACTION").to_string(),
                    on_update: row.get(5)?.as_str().unwrap_or("NO_ACTION").to_string(),
                })
            })
            .collect())
    }

    async fn get_check_constraints(
        &self,
        database: &str,
        table: &str,
    ) -> Result<Vec<CheckConstraintInfo>, String> {
        validate_sql_identifier(database)?;
        validate_sql_identifier(table)?;
        let sql = format!(
            "SELECT cc.name AS constraint_name, cc.definition AS expression \
             FROM [{database}].sys.check_constraints cc \
             WHERE cc.parent_object_id = OBJECT_ID('[{database}].[dbo].[{table}]')"
        );

        let result = self.execute_query(&sql).await?;

        Ok(result
            .rows
            .iter()
            .filter_map(|row| {
                Some(CheckConstraintInfo {
                    name: row.get(0)?.as_str()?.to_string(),
                    expression: row.get(1)?.as_str()?.to_string(),
                })
            })
            .collect())
    }

    async fn get_triggers(
        &self,
        database: &str,
        table: &str,
    ) -> Result<Vec<TriggerInfo>, String> {
        validate_sql_identifier(database)?;
        validate_sql_identifier(table)?;
        let sql = format!(
            "SELECT
                t.name AS trigger_name,
                CASE WHEN t.is_instead_of_trigger = 1 THEN 'INSTEAD OF' ELSE 'AFTER' END AS timing,
                STUFF((
                    SELECT ', ' + te.type_desc
                    FROM [{database}].sys.trigger_events te
                    WHERE te.object_id = t.object_id
                    FOR XML PATH('')), 1, 2, '') AS event,
                m.definition AS statement,
                CONVERT(VARCHAR, t.create_date, 120) AS created
            FROM [{database}].sys.triggers t
            JOIN [{database}].sys.sql_modules m ON t.object_id = m.object_id
            WHERE t.parent_id = OBJECT_ID('[{database}].[dbo].[{table}]')"
        );

        let result = self.execute_query(&sql).await?;

        Ok(result
            .rows
            .iter()
            .filter_map(|row| {
                Some(TriggerInfo {
                    name: row.get(0)?.as_str()?.to_string(),
                    timing: row.get(1)?.as_str()?.to_string(),
                    event: row.get(2)?.as_str()?.to_string(),
                    statement: row.get(3)?.as_str()?.to_string(),
                    created: row.get(4).and_then(|v| v.as_str()).map(|s| s.to_string()),
                })
            })
            .collect())
    }

    async fn get_table_options(
        &self,
        database: &str,
        table: &str,
    ) -> Result<TableOptions, String> {
        validate_sql_identifier(database)?;
        validate_sql_identifier(table)?;
        let sql = format!(
            "SELECT
                ISNULL(fg.name, 'PRIMARY') AS filegroup_name,
                t.lock_escalation_desc,
                ISNULL(p.data_compression_desc, 'NONE') AS compression,
                CAST(ep.value AS NVARCHAR(MAX)) AS table_comment
            FROM [{database}].sys.tables t
            LEFT JOIN [{database}].sys.indexes i
                ON t.object_id = i.object_id AND i.type IN (0, 1)
            LEFT JOIN [{database}].sys.filegroups fg
                ON i.data_space_id = fg.data_space_id
            LEFT JOIN [{database}].sys.partitions p
                ON t.object_id = p.object_id AND p.index_id IN (0, 1) AND p.partition_number = 1
            LEFT JOIN [{database}].sys.extended_properties ep
                ON t.object_id = ep.major_id AND ep.minor_id = 0 AND ep.name = 'MS_Description'
            WHERE t.object_id = OBJECT_ID('[{database}].[dbo].[{table}]')"
        );

        let result = self.execute_query(&sql).await?;

        if let Some(row) = result.rows.first() {
            let filegroup = row.get(0).and_then(|v| v.as_str()).unwrap_or("PRIMARY");
            let _lock_escalation = row.get(1).and_then(|v| v.as_str()).unwrap_or("TABLE");
            let compression = row.get(2).and_then(|v| v.as_str()).unwrap_or("NONE");
            let comment = row.get(3).and_then(|v| v.as_str()).unwrap_or("");

            Ok(TableOptions {
                engine: filegroup.to_string(),
                charset: String::new(),
                collation: String::new(),
                comment: comment.to_string(),
                auto_increment: None,
                row_format: Some(compression.to_string()),
            })
        } else {
            Ok(TableOptions {
                engine: "PRIMARY".to_string(),
                charset: String::new(),
                collation: String::new(),
                comment: String::new(),
                auto_increment: None,
                row_format: Some("NONE".to_string()),
            })
        }
    }

    async fn close(&self) {
        log::info!("SQL Server connection pool closed");
    }
}

// -- Helper functions extracted to respect 80-line limit --

fn build_mssql_column_type(
    data_type: &str,
    char_max_len: Option<i64>,
    num_precision: Option<i64>,
    num_scale: Option<i64>,
) -> String {
    if let Some(len) = char_max_len {
        if len == -1 {
            format!("{}(MAX)", data_type.to_uppercase())
        } else {
            format!("{}({})", data_type.to_uppercase(), len)
        }
    } else if let (Some(p), Some(s)) = (num_precision, num_scale) {
        if s > 0 {
            format!("{}({},{})", data_type.to_uppercase(), p, s)
        } else {
            data_type.to_uppercase()
        }
    } else {
        data_type.to_uppercase()
    }
}

fn build_mssql_ddl(
    table: &str,
    structure: &TableStructure,
    foreign_keys: &[ForeignKeyInfo],
    options: &TableOptions,
) -> String {
    let mut ddl = format!("CREATE TABLE [dbo].[{}] (\n", table);

    let col_defs: Vec<String> = structure
        .columns
        .iter()
        .map(|col| {
            let mut def = format!("\t[{}] {}", col.name, col.column_type);
            if !col.nullable {
                def.push_str(" NOT NULL");
            }
            if let Some(ref extra) = col.extra {
                if extra.contains("auto_increment") {
                    def.push_str(" IDENTITY(1,1)");
                }
            }
            if let Some(ref default) = col.default_value {
                def.push_str(&format!(" DEFAULT {}", default));
            }
            def
        })
        .collect();

    ddl.push_str(&col_defs.join(",\n"));

    let pk_cols: Vec<&str> = structure
        .columns
        .iter()
        .filter(|c| c.key.as_deref() == Some("PRI"))
        .map(|c| c.name.as_str())
        .collect();

    if !pk_cols.is_empty() {
        ddl.push_str(&format!(
            ",\n\tCONSTRAINT [PK_{}] PRIMARY KEY CLUSTERED ({})",
            table,
            pk_cols
                .iter()
                .map(|c| format!("[{}]", c))
                .collect::<Vec<_>>()
                .join(", ")
        ));
    }

    ddl.push_str("\n);\nGO\n");

    if !options.comment.is_empty() {
        ddl.push_str(&format!(
            "\nEXEC sys.sp_addextendedproperty\n\
            \t@name=N'MS_Description', @value=N'{}',\n\
            \t@level0type=N'SCHEMA', @level0name=N'dbo',\n\
            \t@level1type=N'TABLE', @level1name=N'{}';\nGO\n",
            options.comment.replace('\'', "''"),
            table
        ));
    }

    append_ddl_comments(table, &structure.columns, &mut ddl);
    append_ddl_indexes(table, &structure.indexes, &mut ddl);
    append_ddl_foreign_keys(table, foreign_keys, &mut ddl);

    ddl
}

fn append_ddl_comments(table: &str, columns: &[ColumnDetail], ddl: &mut String) {
    for col in columns {
        if let Some(ref comment) = col.comment {
            if !comment.is_empty() {
                ddl.push_str(&format!(
                    "\nEXEC sys.sp_addextendedproperty\n\
                    \t@name=N'MS_Description', @value=N'{}',\n\
                    \t@level0type=N'SCHEMA', @level0name=N'dbo',\n\
                    \t@level1type=N'TABLE', @level1name=N'{}',\n\
                    \t@level2type=N'COLUMN', @level2name=N'{}';\nGO\n",
                    comment.replace('\'', "''"),
                    table,
                    col.name
                ));
            }
        }
    }
}

fn append_ddl_indexes(table: &str, indexes: &[IndexInfo], ddl: &mut String) {
    for idx in indexes {
        let idx_type = if idx.unique { "UNIQUE NONCLUSTERED" } else { "NONCLUSTERED" };
        ddl.push_str(&format!(
            "\nCREATE {} INDEX [{}]\nON [dbo].[{}] ({});\nGO\n",
            idx_type,
            idx.name,
            table,
            idx.columns
                .iter()
                .map(|c| format!("[{}]", c))
                .collect::<Vec<_>>()
                .join(", ")
        ));
    }
}

fn append_ddl_foreign_keys(table: &str, foreign_keys: &[ForeignKeyInfo], ddl: &mut String) {
    for fk in foreign_keys {
        ddl.push_str(&format!(
            "\nALTER TABLE [dbo].[{}]\nADD CONSTRAINT [{}]\nFOREIGN KEY ([{}])\n\
            REFERENCES [dbo].[{}] ([{}])\nON UPDATE {} ON DELETE {};\nGO\n",
            table, fk.name, fk.column, fk.ref_table, fk.ref_column, fk.on_update, fk.on_delete
        ));
    }
}
