//! Database service module
//!
//! Provides database connection management using the strategy pattern.
//! Supports MySQL, PostgreSQL, MariaDB, SQLite, Oracle, MSSQL, KingBase, DM and ClickHouse
//! with easy extensibility for new databases.

#[cfg(feature = "clickhouse")]
mod clickhouse;
#[cfg(feature = "dm")]
mod dm;
mod kingbase;
mod mariadb;
#[cfg(feature = "mssql")]
mod mssql;
mod mysql;
#[cfg(feature = "mysql-legacy")]
mod mysql_legacy;
#[cfg(feature = "oracle")]
mod oracle;
mod postgresql;
mod session;
mod sqlite;
mod traits;
pub(crate) mod utils;

pub use session::DatabaseSession;
pub use traits::DatabaseDriver;

use std::collections::HashMap;
use std::sync::Arc;

use parking_lot::RwLock;

use crate::models::{
    CheckConstraintInfo, DatabaseConnectRequest, DatabaseConnectionInfo, DatabaseObjectsCount,
    DatabaseType, ForeignKeyInfo, QueryResult, RoutineInfo, SqlExecuteRequest, TableInfo,
    TableOptions, TableStructure, TableStructureExt, TriggerInfo, ViewInfo,
};
use crate::services::{SshService, SshTunnelHandle};

#[cfg(feature = "clickhouse")]
pub use clickhouse::{ClusterInfo, ClusterNode};
#[cfg(feature = "clickhouse")]
use clickhouse::ClickHouseDriver;
#[cfg(feature = "dm")]
use dm::DmDriver;
use kingbase::KingBaseDriver;
use mariadb::MariaDBDriver;
#[cfg(feature = "mssql")]
use mssql::MssqlDriver;
use mysql::MySqlDriver;
#[cfg(feature = "mysql-legacy")]
use mysql_legacy::MySqlLegacyDriver;
#[cfg(feature = "oracle")]
use oracle::OracleDriver;
use postgresql::PostgreSqlDriver;
use sqlite::SqliteDriver;

/// Database service managing all database connections
pub struct DatabaseService {
    sessions: RwLock<HashMap<String, Arc<DatabaseSession>>>,
    ssh_service: RwLock<Option<Arc<SshService>>>,
}

impl DatabaseService {
    pub fn new() -> Self {
        Self {
            sessions: RwLock::new(HashMap::new()),
            ssh_service: RwLock::new(None),
        }
    }

    pub fn set_ssh_service(&self, ssh_service: Arc<SshService>) {
        *self.ssh_service.write() = Some(ssh_service);
    }

    async fn prepare_ssh_tunnel(
        &self,
        request: &DatabaseConnectRequest,
        app_handle: Option<tauri::AppHandle>,
    ) -> Result<Option<SshTunnelHandle>, String> {
        let Some(tunnel_config) = request.ssh_tunnel.as_ref().filter(|config| config.enabled) else {
            return Ok(None);
        };

        if request.connection_url.is_some() {
            return Err(
                "SSH tunnel is not supported with database connection URL mode yet".to_string(),
            );
        }

        let ssh_service = self
            .ssh_service
            .read()
            .clone()
            .ok_or_else(|| "SSH service is not available for database tunnel".to_string())?;

        ssh_service
            .open_local_tunnel(tunnel_config, request.host.clone(), request.port, app_handle)
            .await
            .map(Some)
            .map_err(|err| err.to_string())
    }

    /// Connect to database
    pub async fn connect(
        &self,
        mut request: DatabaseConnectRequest,
        app_handle: Option<tauri::AppHandle>,
    ) -> Result<DatabaseConnectionInfo, String> {
        let original_host = request.host.clone();
        let original_port = request.port;
        let ssh_tunnel = self.prepare_ssh_tunnel(&request, app_handle).await?;
        if let Some(tunnel) = &ssh_tunnel {
            request.host = tunnel.local_host.clone();
            request.port = tunnel.local_port;
        }

        let password = request.password.as_deref().unwrap_or("");

        let (driver, schema): (Arc<dyn DatabaseDriver>, Option<String>) = match request.db_type {
            DatabaseType::MySQL => {
                let driver: Arc<dyn DatabaseDriver> = if let Some(ref url) = request.connection_url {
                    Arc::new(MySqlDriver::connect_url(url).await?)
                } else {
                    match request.driver_version.as_deref().unwrap_or("5.7+") {
                        "5.6" => {
                            #[cfg(feature = "mysql-legacy")]
                            { Arc::new(MySqlLegacyDriver::connect(&request.host, request.port, &request.username, password, request.database.as_deref()).await?) }
                            #[cfg(not(feature = "mysql-legacy"))]
                            { return Err("MySQL 5.6 support is not enabled in this build".to_string()); }
                        }
                        _ => Arc::new(
                            MySqlDriver::connect(
                                &request.host,
                                request.port,
                                &request.username,
                                password,
                                request.database.as_deref(),
                            )
                            .await?,
                        ),
                    }
                };
                (driver, None)
            }
            DatabaseType::PostgreSQL => {
                let driver = if let Some(ref url) = request.connection_url {
                    PostgreSqlDriver::connect_url(url).await?
                } else {
                    let database = request.database.as_deref().unwrap_or("postgres");
                    PostgreSqlDriver::connect(
                        &request.host,
                        request.port,
                        &request.username,
                        password,
                        database,
                    )
                    .await?
                };
                (Arc::new(driver), Some("public".to_string()))
            }
            DatabaseType::MariaDB => {
                let driver = if let Some(ref url) = request.connection_url {
                    MariaDBDriver::connect_url(url).await?
                } else {
                    MariaDBDriver::connect(
                        &request.host,
                        request.port,
                        &request.username,
                        password,
                        request.database.as_deref(),
                    )
                    .await?
                };
                (Arc::new(driver), None)
            }
            DatabaseType::SQLite => {
                // For SQLite, the database field contains the file path
                let file_path = request.database.as_deref().unwrap_or(":memory:");
                let driver = SqliteDriver::connect(file_path).await?;
                (Arc::new(driver), Some("main".to_string()))
            }
            #[cfg(feature = "oracle")]
            DatabaseType::Oracle => {
                let service_name = request.database.as_deref().unwrap_or("ORCL");
                let driver = OracleDriver::connect(
                    &request.host,
                    request.port,
                    &request.username,
                    password,
                    service_name,
                )
                .await?;
                (Arc::new(driver), None)
            }
            #[cfg(not(feature = "oracle"))]
            DatabaseType::Oracle => {
                return Err("Oracle support is not enabled. Rebuild with --features oracle".to_string());
            }
            #[cfg(feature = "mssql")]
            DatabaseType::MSSQL => {
                let database = request.database.as_deref().unwrap_or("master");
                let driver = MssqlDriver::connect(
                    &request.host,
                    request.port,
                    &request.username,
                    password,
                    database,
                )
                .await?;
                (Arc::new(driver), Some("dbo".to_string()))
            }
            #[cfg(not(feature = "mssql"))]
            DatabaseType::MSSQL => {
                return Err("SQL Server support is not enabled. Rebuild with --features mssql".to_string());
            }
            DatabaseType::KingBase => {
                let driver = if let Some(ref url) = request.connection_url {
                    KingBaseDriver::connect_url(url).await?
                } else {
                    let database = request.database.as_deref().unwrap_or("TEST");
                    KingBaseDriver::connect(
                        &request.host,
                        request.port,
                        &request.username,
                        password,
                        database,
                    )
                    .await?
                };
                (Arc::new(driver), Some("public".to_string()))
            }
            #[cfg(feature = "dm")]
            DatabaseType::DM => {
                let database = request.database.as_deref().unwrap_or("SYSDBA");
                let driver = DmDriver::connect(
                    &request.host,
                    request.port,
                    &request.username,
                    password,
                    database,
                )
                .await?;
                (Arc::new(driver), None)
            }
            #[cfg(not(feature = "dm"))]
            DatabaseType::DM => {
                return Err("DM Database support is not enabled. Rebuild with --features dm".to_string());
            }
            #[cfg(feature = "clickhouse")]
            DatabaseType::ClickHouse => {
                let driver = if let Some(ref url) = request.connection_url {
                    ClickHouseDriver::connect_url(url).await?
                } else {
                    let database = request.database.as_deref().unwrap_or("default");
                    ClickHouseDriver::connect(
                        &request.host,
                        request.port,
                        &request.username,
                        password,
                        database,
                    )
                    .await?
                };
                (Arc::new(driver), None)
            }
            #[cfg(not(feature = "clickhouse"))]
            DatabaseType::ClickHouse => {
                return Err("ClickHouse support is not enabled. Rebuild with --features clickhouse".to_string());
            }
        };

        let session = Arc::new(DatabaseSession::new(
            request.connection_id.clone(),
            request.db_type.clone(),
            request.host.clone(),
            request.port,
            request.database.clone(),
            schema,
            driver,
            ssh_tunnel,
        ));

        let previous_session = self
            .sessions
            .write()
            .insert(request.connection_id.clone(), session.clone());
        if let Some(previous_session) = previous_session {
            previous_session.driver.close().await;
            if let Some(tunnel) = &previous_session.ssh_tunnel {
                tunnel.close().await;
            }
        }

        log::info!(
            "[DB_TREE] connected id={} type={:?} host={}:{} database={}",
            request.connection_id,
            request.db_type,
            original_host,
            original_port,
            request.database.as_deref().unwrap_or("")
        );

        Ok(DatabaseConnectionInfo {
            connection_id: request.connection_id,
            db_type: request.db_type,
            host: original_host,
            port: original_port,
            database: request.database,
            connected_at: session.connected_at.to_rfc3339(),
        })
    }

    /// Disconnect from database
    pub async fn disconnect(&self, connection_id: &str) -> Result<(), String> {
        let session = self.sessions.write().remove(connection_id);
        if let Some(session) = session {
            session.driver.close().await;
            if let Some(tunnel) = &session.ssh_tunnel {
                tunnel.close().await;
            }
            Ok(())
        } else {
            Err("Connection not found".to_string())
        }
    }

    /// Test database connection
    pub async fn test_connection(
        &self,
        mut request: DatabaseConnectRequest,
        app_handle: Option<tauri::AppHandle>,
    ) -> Result<(), String> {
        let ssh_tunnel = self.prepare_ssh_tunnel(&request, app_handle).await?;
        if let Some(tunnel) = &ssh_tunnel {
            request.host = tunnel.local_host.clone();
            request.port = tunnel.local_port;
        }

        let password = request.password.as_deref().unwrap_or("");

        let result = match request.db_type {
            DatabaseType::MySQL => {
                if let Some(ref url) = request.connection_url {
                    MySqlDriver::test_connection_url(url).await
                } else {
                    match request.driver_version.as_deref().unwrap_or("5.7+") {
                        "5.6" => {
                            #[cfg(feature = "mysql-legacy")]
                            { MySqlLegacyDriver::test_connection(&request.host, request.port, &request.username, password, request.database.as_deref()).await }
                            #[cfg(not(feature = "mysql-legacy"))]
                            { Err("MySQL 5.6 support is not enabled in this build".to_string()) }
                        }
                        _ => MySqlDriver::test_connection(
                            &request.host,
                            request.port,
                            &request.username,
                            password,
                            request.database.as_deref(),
                        )
                        .await,
                    }
                }
            }
            DatabaseType::PostgreSQL => {
                if let Some(ref url) = request.connection_url {
                    PostgreSqlDriver::test_connection_url(url).await
                } else {
                    let database = request.database.as_deref().unwrap_or("postgres");
                    PostgreSqlDriver::test_connection(
                        &request.host,
                        request.port,
                        &request.username,
                        password,
                        database,
                    )
                    .await
                }
            }
            DatabaseType::MariaDB => {
                if let Some(ref url) = request.connection_url {
                    MariaDBDriver::test_connection_url(url).await
                } else {
                    MariaDBDriver::test_connection(
                        &request.host,
                        request.port,
                        &request.username,
                        password,
                        request.database.as_deref(),
                    )
                    .await
                }
            }
            DatabaseType::SQLite => {
                let file_path = request.database.as_deref().unwrap_or(":memory:");
                SqliteDriver::test_connection(file_path).await
            }
            #[cfg(feature = "oracle")]
            DatabaseType::Oracle => {
                let service_name = request.database.as_deref().unwrap_or("ORCL");
                OracleDriver::test_connection(
                    &request.host,
                    request.port,
                    &request.username,
                    password,
                    service_name,
                )
                .await
            }
            #[cfg(not(feature = "oracle"))]
            DatabaseType::Oracle => {
                Err("Oracle support is not enabled. Rebuild with --features oracle".to_string())
            }
            #[cfg(feature = "mssql")]
            DatabaseType::MSSQL => {
                let database = request.database.as_deref().unwrap_or("master");
                MssqlDriver::test_connection(
                    &request.host,
                    request.port,
                    &request.username,
                    password,
                    database,
                )
                .await
            }
            #[cfg(not(feature = "mssql"))]
            DatabaseType::MSSQL => {
                Err("SQL Server support is not enabled. Rebuild with --features mssql".to_string())
            }
            DatabaseType::KingBase => {
                if let Some(ref url) = request.connection_url {
                    KingBaseDriver::test_connection_url(url).await
                } else {
                    let database = request.database.as_deref().unwrap_or("TEST");
                    KingBaseDriver::test_connection(
                        &request.host,
                        request.port,
                        &request.username,
                        password,
                        database,
                    )
                    .await
                }
            }
            #[cfg(feature = "dm")]
            DatabaseType::DM => {
                let database = request.database.as_deref().unwrap_or("SYSDBA");
                DmDriver::test_connection(
                    &request.host,
                    request.port,
                    &request.username,
                    password,
                    database,
                )
                .await
            }
            #[cfg(not(feature = "dm"))]
            DatabaseType::DM => {
                Err("DM Database support is not enabled. Rebuild with --features dm".to_string())
            }
            #[cfg(feature = "clickhouse")]
            DatabaseType::ClickHouse => {
                if let Some(ref url) = request.connection_url {
                    ClickHouseDriver::test_connection_url(url).await
                } else {
                    let database = request.database.as_deref().unwrap_or("default");
                    ClickHouseDriver::test_connection(
                        &request.host,
                        request.port,
                        &request.username,
                        password,
                        database,
                    )
                    .await
                }
            }
            #[cfg(not(feature = "clickhouse"))]
            DatabaseType::ClickHouse => {
                Err("ClickHouse support is not enabled. Rebuild with --features clickhouse".to_string())
            }
        };

        if let Some(tunnel) = &ssh_tunnel {
            tunnel.close().await;
        }

        result
    }

    /// Execute SQL query
    pub async fn execute_sql(&self, request: SqlExecuteRequest) -> Result<QueryResult, String> {
        let session = self.get_session(&request.connection_id)?;

        let sql = request.sql.trim();
        let sql_upper = sql.to_uppercase();
        let is_select = sql_upper.starts_with("SELECT")
            || sql_upper.starts_with("SHOW")
            || sql_upper.starts_with("DESCRIBE")
            || sql_upper.starts_with("EXPLAIN")
            || sql_upper.starts_with("\\D");

        if is_select {
            session.driver.execute_query(sql).await
        } else {
            session.driver.execute_update(sql).await
        }
    }

    /// Get all databases
    pub async fn get_databases(&self, connection_id: &str) -> Result<Vec<String>, String> {
        let session = self.get_session(connection_id)?;
        let mut databases = Vec::new();

        if matches!(session.db_type, DatabaseType::MySQL | DatabaseType::MariaDB) {
            if let Some(database) = session.database.as_ref().filter(|db| !db.trim().is_empty()) {
                databases.push(database.clone());
            }
        }

        for database in session.driver.get_databases().await? {
            if !databases.iter().any(|existing| existing == &database) {
                databases.push(database);
            }
        }

        if databases.is_empty() {
            if let Some(database) = session.database.as_ref().filter(|db| !db.trim().is_empty()) {
                databases.push(database.clone());
            }
        }

        if databases.is_empty() {
            let current_database_sql = match session.db_type {
                DatabaseType::MySQL | DatabaseType::MariaDB => Some("SELECT DATABASE()"),
                DatabaseType::PostgreSQL => Some("SELECT current_database()"),
                _ => None,
            };

            if let Some(sql) = current_database_sql {
                if let Ok(result) = session.driver.execute_query(sql).await {
                    if let Some(database) = result
                        .rows
                        .first()
                        .and_then(|row| row.first())
                        .and_then(|value| value.as_str())
                        .filter(|db| !db.trim().is_empty())
                    {
                        databases.push(database.to_string());
                    }
                }
            }
        }

        if databases.len() > 1 {
            databases.sort();
            databases.dedup();
        }

        log::info!(
            "[DB_TREE] databases id={} type={:?} count={} names={}",
            connection_id,
            session.db_type,
            databases.len(),
            databases.join(",")
        );

        Ok(databases)
    }

    /// Get all schemas (PostgreSQL only)
    pub async fn get_schemas(&self, connection_id: &str, database: Option<&str>) -> Result<Vec<String>, String> {
        let session = self.get_session(connection_id)?;
        session.driver.get_schemas(database).await
    }

    /// Get tables in a database/schema
    pub async fn get_tables(
        &self,
        connection_id: &str,
        database: &str,
        schema: Option<&str>,
    ) -> Result<Vec<TableInfo>, String> {
        let session = self.get_session(connection_id)?;
        let tables = session.driver.get_tables(database, schema).await?;
        log::info!(
            "[DB_TREE] tables id={} type={:?} database={} schema={} count={}",
            connection_id,
            session.db_type,
            database,
            schema.unwrap_or(""),
            tables.len()
        );
        Ok(tables)
    }

    /// Get table structure
    pub async fn get_table_structure(
        &self,
        connection_id: &str,
        database: &str,
        table: &str,
    ) -> Result<TableStructure, String> {
        let session = self.get_session(connection_id)?;
        session.driver.get_table_structure(database, table).await
    }

    /// Get views in a database/schema
    pub async fn get_views(
        &self,
        connection_id: &str,
        database: &str,
        schema: Option<&str>,
    ) -> Result<Vec<ViewInfo>, String> {
        let session = self.get_session(connection_id)?;
        session.driver.get_views(database, schema).await
    }

    /// Get functions and procedures
    pub async fn get_routines(
        &self,
        connection_id: &str,
        database: &str,
        schema: Option<&str>,
    ) -> Result<Vec<RoutineInfo>, String> {
        let session = self.get_session(connection_id)?;
        session.driver.get_routines(database, schema).await
    }

    /// Get database objects count
    pub async fn get_objects_count(
        &self,
        connection_id: &str,
        database: &str,
        schema: Option<&str>,
    ) -> Result<DatabaseObjectsCount, String> {
        let session = self.get_session(connection_id)?;
        session.driver.get_objects_count(database, schema).await
    }

    /// Get table DDL
    pub async fn get_table_ddl(
        &self,
        connection_id: &str,
        database: &str,
        table: &str,
    ) -> Result<String, String> {
        let session = self.get_session(connection_id)?;
        session.driver.get_table_ddl(database, table).await
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
        session
            .driver
            .rename_table(database, old_name, new_name)
            .await
    }

    /// Drop a table
    pub async fn drop_table(
        &self,
        connection_id: &str,
        database: &str,
        table: &str,
    ) -> Result<(), String> {
        let session = self.get_session(connection_id)?;
        session.driver.drop_table(database, table).await
    }

    /// Get foreign keys for a table
    pub async fn get_foreign_keys(
        &self,
        connection_id: &str,
        database: &str,
        table: &str,
    ) -> Result<Vec<ForeignKeyInfo>, String> {
        let session = self.get_session(connection_id)?;
        session.driver.get_foreign_keys(database, table).await
    }

    /// Get check constraints for a table
    pub async fn get_check_constraints(
        &self,
        connection_id: &str,
        database: &str,
        table: &str,
    ) -> Result<Vec<CheckConstraintInfo>, String> {
        let session = self.get_session(connection_id)?;
        session.driver.get_check_constraints(database, table).await
    }

    /// Get triggers for a table
    pub async fn get_triggers(
        &self,
        connection_id: &str,
        database: &str,
        table: &str,
    ) -> Result<Vec<TriggerInfo>, String> {
        let session = self.get_session(connection_id)?;
        session.driver.get_triggers(database, table).await
    }

    /// Get table options
    pub async fn get_table_options(
        &self,
        connection_id: &str,
        database: &str,
        table: &str,
    ) -> Result<TableOptions, String> {
        let session = self.get_session(connection_id)?;
        session.driver.get_table_options(database, table).await
    }

    /// Get extended table structure with all details
    pub async fn get_table_structure_ext(
        &self,
        connection_id: &str,
        database: &str,
        table: &str,
    ) -> Result<TableStructureExt, String> {
        let basic = self.get_table_structure(connection_id, database, table).await?;
        let foreign_keys = self.get_foreign_keys(connection_id, database, table).await?;
        let check_constraints = self
            .get_check_constraints(connection_id, database, table)
            .await?;
        let triggers = self.get_triggers(connection_id, database, table).await?;
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

    /// Get ClickHouse clusters (ClickHouse only)
    #[cfg(feature = "clickhouse")]
    pub async fn get_clickhouse_clusters(
        &self,
        connection_id: &str,
    ) -> Result<Vec<clickhouse::ClusterInfo>, String> {
        let session = self.get_session(connection_id)?;

        // Check if this is a ClickHouse connection
        if session.db_type != DatabaseType::ClickHouse {
            return Err("This operation is only available for ClickHouse connections".to_string());
        }

        // Execute query to get cluster information
        let sql = r#"
            SELECT
                cluster,
                shard_num,
                replica_num,
                host_name,
                port
            FROM system.clusters
            ORDER BY cluster, shard_num, replica_num
        "#;

        let result = session.driver.execute_query(sql).await?;

        // Parse results into ClusterInfo
        let mut clusters_map: std::collections::HashMap<String, clickhouse::ClusterInfo> =
            std::collections::HashMap::new();

        for row in result.rows {
            if row.len() < 5 {
                continue;
            }

            let cluster_name = row[0].as_str().unwrap_or_default().to_string();
            let shard_num = row[1].as_u64().unwrap_or(0) as u32;
            let replica_num = row[2].as_u64().unwrap_or(0) as u32;
            let host_name = row[3].as_str().unwrap_or_default().to_string();
            let port = row[4].as_u64().unwrap_or(0) as u16;

            let cluster = clusters_map
                .entry(cluster_name.clone())
                .or_insert_with(|| clickhouse::ClusterInfo {
                    name: cluster_name,
                    shard_count: 0,
                    replica_count: 0,
                    nodes: vec![],
                });

            if shard_num > cluster.shard_count {
                cluster.shard_count = shard_num;
            }
            if replica_num > cluster.replica_count {
                cluster.replica_count = replica_num;
            }

            cluster.nodes.push(clickhouse::ClusterNode {
                shard_num,
                replica_num,
                host_name,
                port,
            });
        }

        Ok(clusters_map.into_values().collect())
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
