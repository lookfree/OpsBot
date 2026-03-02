//! ClickHouse database driver implementation
//!
//! Provides connection and query execution for ClickHouse columnar OLAP database.
//! Uses the clickhouse-rs crate for typed queries and reqwest for dynamic queries.

use std::time::{Duration, Instant};

use async_trait::async_trait;
use clickhouse::{Client, Row};
use serde::Deserialize;

use crate::models::{
    CheckConstraintInfo, ColumnDetail, DatabaseObjectsCount, ForeignKeyInfo, IndexInfo,
    QueryColumn, QueryResult, RoutineInfo, TableInfo, TableOptions, TableStructure, TriggerInfo,
    ViewInfo,
};

use super::traits::DatabaseDriver;
use super::utils::{escape_backtick_identifier, validate_sql_identifier, MAX_QUERY_ROWS};

/// ClickHouse database driver
pub struct ClickHouseDriver {
    client: Client,
    http_client: reqwest::Client,
    base_url: String,
    username: String,
    password: String,
    current_database: String,
}

impl ClickHouseDriver {
    /// Create a new ClickHouse connection
    pub async fn connect(
        host: &str,
        port: u16,
        username: &str,
        password: &str,
        database: &str,
    ) -> Result<Self, String> {
        let url = format!("http://{}:{}", host, port);

        log::info!("Connecting to ClickHouse: {}:{}/{}", host, port, database);

        let mut client = Client::default().with_url(&url).with_user(username);

        if !password.is_empty() {
            client = client.with_password(password);
        }

        if !database.is_empty() {
            client = client.with_database(database);
        }

        // Test connection
        client
            .query("SELECT 1")
            .execute()
            .await
            .map_err(|e| format!("Connection failed: {}", e))?;

        log::info!("ClickHouse connection established successfully");

        // Create HTTP client with timeout for dynamic queries
        // Use no_proxy to bypass system proxy - ClickHouse is typically on internal network
        let http_client = reqwest::Client::builder()
            .timeout(Duration::from_secs(300)) // 5 minutes timeout for large queries
            .connect_timeout(Duration::from_secs(30))
            .no_proxy() // Bypass system proxy for internal database connections
            .build()
            .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

        Ok(Self {
            client,
            http_client,
            base_url: url,
            username: username.to_string(),
            password: password.to_string(),
            current_database: if database.is_empty() {
                "default".to_string()
            } else {
                database.to_string()
            },
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
        let driver = Self::connect(host, port, username, password, database).await?;
        drop(driver);
        Ok(())
    }

    /// Parse a ClickHouse connection URL into (username, password, host, port, database)
    /// Supports: clickhouse://user:pass@host:8123/database
    ///       or: http://user:pass@host:8123/database
    fn parse_url(url: &str) -> Result<(String, String, String, u16, String), String> {
        let rest = if url.starts_with("clickhouse://") {
            &url["clickhouse://".len()..]
        } else if url.starts_with("http://") {
            &url["http://".len()..]
        } else {
            return Err("Invalid ClickHouse URL: must start with clickhouse:// or http://".to_string());
        };

        let (user_info, host_path) = rest
            .split_once('@')
            .ok_or_else(|| "Invalid URL: missing '@' separator".to_string())?;

        let (username, password) = user_info
            .split_once(':')
            .map(|(u, p)| (u.to_string(), p.to_string()))
            .unwrap_or_else(|| (user_info.to_string(), String::new()));

        let (host_port, database) = host_path
            .split_once('/')
            .map(|(hp, db)| (hp, if db.is_empty() { "default" } else { db }))
            .unwrap_or((host_path, "default"));

        let (host, port_str) = host_port.split_once(':').unwrap_or((host_port, "8123"));
        let port = port_str.parse::<u16>().map_err(|_| "Invalid port in URL".to_string())?;

        Ok((username, password, host.to_string(), port, database.to_string()))
    }

    /// Create a new ClickHouse connection using a connection URL
    pub async fn connect_url(url: &str) -> Result<Self, String> {
        let (username, password, host, port, database) = Self::parse_url(url)?;
        Self::connect(&host, port, &username, &password, &database).await
    }

    /// Test connection using a connection URL
    pub async fn test_connection_url(url: &str) -> Result<(), String> {
        let (username, password, host, port, database) = Self::parse_url(url)?;
        Self::test_connection(&host, port, &username, &password, &database).await
    }

    /// Execute a query using HTTP API and return JSON results
    async fn execute_http_query(&self, sql: &str) -> Result<QueryResult, String> {
        let start = Instant::now();

        // Use JSONEachRow format for easy parsing
        let query_with_format = format!("{} FORMAT JSONEachRow", sql.trim().trim_end_matches(';'));

        log::info!(
            "Executing ClickHouse query on database '{}': {}",
            self.current_database,
            &query_with_format[..query_with_format.len().min(200)]
        );

        let mut request = self
            .http_client
            .post(&self.base_url)
            .query(&[("database", &self.current_database)])
            .header("X-ClickHouse-User", &self.username)
            .body(query_with_format);

        if !self.password.is_empty() {
            request = request.header("X-ClickHouse-Key", &self.password);
        }

        let response = request
            .send()
            .await
            .map_err(|e| {
                log::error!("ClickHouse HTTP request failed: {}", e);
                format!("HTTP request failed: {}", e)
            })?;

        log::debug!("ClickHouse HTTP response status: {}", response.status());

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response
                .text()
                .await
                .unwrap_or_else(|_| "Unknown error".to_string());
            log::error!(
                "ClickHouse query failed with status {}: {}",
                status,
                if error_text.is_empty() { "Empty response" } else { &error_text }
            );
            return Err(format!(
                "Query failed (HTTP {}): {}",
                status.as_u16(),
                if error_text.is_empty() { "Empty response from server" } else { &error_text }
            ));
        }

        let body = response
            .text()
            .await
            .map_err(|e| format!("Failed to read response: {}", e))?;

        // Parse JSONEachRow format - each line is a JSON object
        let mut rows: Vec<Vec<serde_json::Value>> = Vec::new();
        let mut columns: Vec<QueryColumn> = Vec::new();
        let mut first_row = true;

        for line in body.lines() {
            if line.trim().is_empty() {
                continue;
            }

            let row: serde_json::Value = serde_json::from_str(line)
                .map_err(|e| format!("Failed to parse JSON: {}", e))?;

            if first_row {
                if let serde_json::Value::Object(map) = &row {
                    columns = map
                        .keys()
                        .map(|k| QueryColumn {
                            name: k.clone(),
                            column_type: "String".to_string(),
                            nullable: true,
                        })
                        .collect();
                }
                first_row = false;
            }

            if let serde_json::Value::Object(map) = row {
                let row_values: Vec<serde_json::Value> = columns
                    .iter()
                    .map(|col| map.get(&col.name).cloned().unwrap_or(serde_json::Value::Null))
                    .collect();
                rows.push(row_values);
            }
        }

        let execution_time_ms = start.elapsed().as_millis() as u64;
        let total_rows = rows.len();
        let truncated = total_rows > MAX_QUERY_ROWS;

        if truncated {
            rows.truncate(MAX_QUERY_ROWS);
            rows.push(vec![serde_json::Value::String(
                format!("[Result truncated: showing {} of {} rows]", MAX_QUERY_ROWS, total_rows),
            )]);
        }

        Ok(QueryResult {
            columns,
            rows,
            affected_rows: total_rows as u64,
            execution_time_ms,
        })
    }
}

#[derive(Row, Deserialize)]
struct DatabaseRow {
    name: String,
}

#[derive(Row, Deserialize)]
struct TableRow {
    name: String,
    engine: String,
    total_rows: Option<u64>,
}

#[derive(Row, Deserialize)]
struct ColumnRow {
    name: String,
    #[serde(rename = "type")]
    column_type: String,
    default_kind: String,
    default_expression: String,
    comment: String,
    is_in_sorting_key: u8,
    is_in_primary_key: u8,
    is_in_partition_key: u8,
}

#[derive(Row, Deserialize)]
struct ViewRow {
    name: String,
    engine: String,
}

#[derive(Row, Deserialize)]
struct CountRow {
    tables: u64,
    views: u64,
    mat_views: u64,
}

#[derive(Row, Deserialize)]
struct CreateRow {
    statement: String,
}

#[derive(Row, Deserialize)]
struct EngineRow {
    engine: String,
    engine_full: String,
    sorting_key: String,
}

#[async_trait]
impl DatabaseDriver for ClickHouseDriver {
    async fn execute_query(&self, sql: &str) -> Result<QueryResult, String> {
        self.execute_http_query(sql).await
    }

    async fn execute_update(&self, sql: &str) -> Result<QueryResult, String> {
        let start = Instant::now();

        self.client
            .query(sql)
            .execute()
            .await
            .map_err(|e| format!("Execute failed: {}", e))?;

        Ok(QueryResult {
            columns: vec![],
            rows: vec![],
            affected_rows: 0, // ClickHouse doesn't return affected rows
            execution_time_ms: start.elapsed().as_millis() as u64,
        })
    }

    async fn get_databases(&self) -> Result<Vec<String>, String> {
        log::info!("Fetching ClickHouse databases list...");

        let sql = "SELECT name FROM system.databases ORDER BY name";

        let rows = self
            .client
            .query(sql)
            .fetch_all::<DatabaseRow>()
            .await
            .map_err(|e| {
                log::error!("Failed to get databases: {}", e);
                format!("Failed to get databases: {}", e)
            })?;

        let databases: Vec<String> = rows.into_iter().map(|r| r.name).collect();

        log::info!("Found {} databases", databases.len());
        Ok(databases)
    }

    async fn get_schemas(&self, _database: Option<&str>) -> Result<Vec<String>, String> {
        // ClickHouse doesn't have schema concept like PostgreSQL
        Ok(vec!["default".to_string()])
    }

    async fn get_tables(
        &self,
        database: &str,
        _schema: Option<&str>,
    ) -> Result<Vec<TableInfo>, String> {
        let sql = format!(
            r#"
            SELECT
                name,
                engine,
                total_rows
            FROM system.tables
            WHERE database = '{}'
              AND engine NOT IN ('View', 'MaterializedView')
            ORDER BY name
        "#,
            database
        );

        let rows = self
            .client
            .query(&sql)
            .fetch_all::<TableRow>()
            .await
            .map_err(|e| format!("Failed to get tables: {}", e))?;

        Ok(rows
            .into_iter()
            .map(|r| TableInfo {
                name: r.name,
                table_type: r.engine,
                row_count: r.total_rows.map(|v| v as i64),
            })
            .collect())
    }

    async fn get_table_structure(
        &self,
        database: &str,
        table: &str,
    ) -> Result<TableStructure, String> {
        let sql = format!(
            r#"
            SELECT
                name,
                type,
                default_kind,
                default_expression,
                comment,
                is_in_sorting_key,
                is_in_primary_key,
                is_in_partition_key
            FROM system.columns
            WHERE database = '{}' AND table = '{}'
            ORDER BY position
        "#,
            database, table
        );

        let rows = self
            .client
            .query(&sql)
            .fetch_all::<ColumnRow>()
            .await
            .map_err(|e| format!("Failed to get columns: {}", e))?;

        let columns: Vec<ColumnDetail> = rows
            .into_iter()
            .map(|r| {
                let key = if r.is_in_primary_key == 1 {
                    Some("PRI".to_string())
                } else if r.is_in_sorting_key == 1 {
                    Some("SORT".to_string())
                } else {
                    None
                };

                let default_value = if !r.default_expression.is_empty() {
                    Some(r.default_expression)
                } else {
                    None
                };

                let extra = if r.is_in_partition_key == 1 {
                    Some("PARTITION".to_string())
                } else if !r.default_kind.is_empty() {
                    Some(r.default_kind)
                } else {
                    None
                };

                ColumnDetail {
                    name: r.name,
                    column_type: r.column_type.clone(),
                    nullable: r.column_type.starts_with("Nullable"),
                    key,
                    default_value,
                    extra,
                    comment: if r.comment.is_empty() {
                        None
                    } else {
                        Some(r.comment)
                    },
                }
            })
            .collect();

        // ClickHouse indexes are defined by ORDER BY, not separate index objects
        let indexes = vec![IndexInfo {
            name: "PRIMARY".to_string(),
            columns: columns
                .iter()
                .filter(|c| c.key == Some("PRI".to_string()) || c.key == Some("SORT".to_string()))
                .map(|c| c.name.clone())
                .collect(),
            unique: false,
            index_type: "SORTING_KEY".to_string(),
        }];

        Ok(TableStructure {
            database: database.to_string(),
            table_name: table.to_string(),
            columns,
            indexes,
        })
    }

    async fn get_views(
        &self,
        database: &str,
        _schema: Option<&str>,
    ) -> Result<Vec<ViewInfo>, String> {
        let sql = format!(
            r#"
            SELECT name, engine
            FROM system.tables
            WHERE database = '{}'
              AND engine IN ('View', 'MaterializedView')
            ORDER BY name
        "#,
            database
        );

        let rows = self
            .client
            .query(&sql)
            .fetch_all::<ViewRow>()
            .await
            .map_err(|e| format!("Failed to get views: {}", e))?;

        Ok(rows
            .into_iter()
            .map(|r| ViewInfo {
                name: r.name,
                definer: Some(r.engine), // Use engine type as definer info
                security_type: None,
            })
            .collect())
    }

    async fn get_routines(
        &self,
        _database: &str,
        _schema: Option<&str>,
    ) -> Result<Vec<RoutineInfo>, String> {
        // ClickHouse doesn't support stored procedures
        // Could potentially list user-defined functions here
        Ok(vec![])
    }

    async fn get_objects_count(
        &self,
        database: &str,
        _schema: Option<&str>,
    ) -> Result<DatabaseObjectsCount, String> {
        let sql = format!(
            r#"
            SELECT
                countIf(engine NOT IN ('View', 'MaterializedView')) as tables,
                countIf(engine = 'View') as views,
                countIf(engine = 'MaterializedView') as mat_views
            FROM system.tables
            WHERE database = '{}'
        "#,
            database
        );

        let row = self
            .client
            .query(&sql)
            .fetch_one::<CountRow>()
            .await
            .map_err(|e| format!("Failed to count objects: {}", e))?;

        Ok(DatabaseObjectsCount {
            tables: row.tables as usize,
            views: (row.views + row.mat_views) as usize,
            functions: 0,
            procedures: 0,
        })
    }

    async fn get_table_ddl(&self, database: &str, table: &str) -> Result<String, String> {
        validate_sql_identifier(database)?;
        validate_sql_identifier(table)?;
        let sql = format!(
            "SHOW CREATE TABLE `{}`.`{}`",
            escape_backtick_identifier(database),
            escape_backtick_identifier(table)
        );

        let row = self
            .client
            .query(&sql)
            .fetch_one::<CreateRow>()
            .await
            .map_err(|e| format!("Failed to get DDL: {}", e))?;

        Ok(row.statement)
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

        self.client
            .query(&sql)
            .execute()
            .await
            .map_err(|e| format!("Failed to rename table: {}", e))?;

        Ok(())
    }

    async fn drop_table(&self, database: &str, table: &str) -> Result<(), String> {
        validate_sql_identifier(database)?;
        validate_sql_identifier(table)?;
        let sql = format!(
            "DROP TABLE IF EXISTS `{}`.`{}`",
            escape_backtick_identifier(database),
            escape_backtick_identifier(table)
        );

        self.client
            .query(&sql)
            .execute()
            .await
            .map_err(|e| format!("Failed to drop table: {}", e))?;

        Ok(())
    }

    async fn get_foreign_keys(
        &self,
        _database: &str,
        _table: &str,
    ) -> Result<Vec<ForeignKeyInfo>, String> {
        // ClickHouse doesn't support foreign keys
        Ok(vec![])
    }

    async fn get_check_constraints(
        &self,
        _database: &str,
        _table: &str,
    ) -> Result<Vec<CheckConstraintInfo>, String> {
        // ClickHouse doesn't support CHECK constraints
        Ok(vec![])
    }

    async fn get_triggers(
        &self,
        _database: &str,
        _table: &str,
    ) -> Result<Vec<TriggerInfo>, String> {
        // ClickHouse doesn't support triggers
        Ok(vec![])
    }

    async fn get_table_options(&self, database: &str, table: &str) -> Result<TableOptions, String> {
        let sql = format!(
            r#"
            SELECT engine, engine_full, sorting_key
            FROM system.tables
            WHERE database = '{}' AND name = '{}'
        "#,
            database, table
        );

        let row = self
            .client
            .query(&sql)
            .fetch_one::<EngineRow>()
            .await
            .map_err(|e| format!("Failed to get table options: {}", e))?;

        let comment = if !row.sorting_key.is_empty() {
            format!("ORDER BY: {}", row.sorting_key)
        } else {
            String::new()
        };

        Ok(TableOptions {
            engine: row.engine,
            charset: "UTF-8".to_string(),
            collation: String::new(),
            comment,
            auto_increment: None,
            row_format: Some(row.engine_full),
        })
    }

    async fn close(&self) {
        // clickhouse-rs client doesn't require explicit close
    }
}

// ==================== ClickHouse-specific types ====================

/// Cluster information
#[derive(Debug, Clone, serde::Serialize)]
pub struct ClusterInfo {
    pub name: String,
    pub shard_count: u32,
    pub replica_count: u32,
    pub nodes: Vec<ClusterNode>,
}

/// Cluster node information
#[derive(Debug, Clone, serde::Serialize)]
pub struct ClusterNode {
    pub shard_num: u32,
    pub replica_num: u32,
    pub host_name: String,
    pub port: u16,
}
