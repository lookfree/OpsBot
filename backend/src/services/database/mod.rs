//! Database service module
//!
//! Provides database connection management using the strategy pattern.
//! Supports MySQL, PostgreSQL, MariaDB, SQLite, Oracle, MSSQL, KingBase, DM and ClickHouse
//! with easy extensibility for new databases.

#[cfg(feature = "clickhouse")]
mod clickhouse;
#[cfg(feature = "dm")]
mod dm;
mod factory;
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

        let (driver, schema) = factory::create_driver(&request).await?;
        let database = factory::effective_database(&request);
        let session = Arc::new(DatabaseSession::new(request, database, schema, driver, ssh_tunnel));

        let previous_session = self
            .sessions
            .write()
            .insert(session.connection_id.clone(), session.clone());
        if let Some(previous_session) = previous_session {
            Self::close_session(&previous_session).await;
        }

        log::info!(
            "[DB_TREE] connected id={} type={:?} host={}:{} database={}",
            session.connection_id,
            session.db_type,
            original_host,
            original_port,
            session.database.as_deref().unwrap_or("")
        );

        Ok(DatabaseConnectionInfo {
            connection_id: session.connection_id.clone(),
            db_type: session.db_type.clone(),
            host: original_host,
            port: original_port,
            database: session.database.clone(),
            connected_at: session.connected_at.to_rfc3339(),
        })
    }

    /// Disconnect from database
    pub async fn disconnect(&self, connection_id: &str) -> Result<(), String> {
        let session = self.sessions.write().remove(connection_id);
        if let Some(session) = session {
            Self::close_session(&session).await;
            Ok(())
        } else {
            Err("Connection not found".to_string())
        }
    }

    /// Close a session's drivers (base + per-database pools) and SSH tunnel.
    async fn close_session(session: &DatabaseSession) {
        // Mark closed before draining so a racing resolve_driver can detect
        // the teardown and close its late-created pool itself.
        session.mark_closed();
        for driver in session.take_derived_drivers() {
            driver.close().await;
        }
        session.driver.close().await;
        if let Some(tunnel) = &session.ssh_tunnel {
            tunnel.close().await;
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

        let result = factory::test_driver(&request).await;

        if let Some(tunnel) = &ssh_tunnel {
            tunnel.close().await;
        }

        result
    }

    /// Execute SQL query
    pub async fn execute_sql(&self, request: SqlExecuteRequest) -> Result<QueryResult, String> {
        let session = self.get_session(&request.connection_id)?;
        let driver = self
            .resolve_driver(&session, request.database.as_deref())
            .await?;

        let sql = request.sql.trim();
        if utils::is_row_returning_sql(sql) {
            driver.execute_query(sql).await
        } else {
            driver.execute_update(sql).await
        }
    }

    /// MySQL-family database names are case-insensitive on common setups.
    fn database_names_match(db_type: &DatabaseType, a: &str, b: &str) -> bool {
        match db_type {
            DatabaseType::MySQL | DatabaseType::MariaDB => a.eq_ignore_ascii_case(b),
            _ => a == b,
        }
    }

    /// Resolve the driver a query should run on. When a database different
    /// from the session's is requested on an engine that pins connections to
    /// one database, a dedicated pool for that database is opened (and cached
    /// on the session). Requesting a database that does not exist on the
    /// server is an error — silently running on another database is worse.
    async fn resolve_driver(
        &self,
        session: &Arc<DatabaseSession>,
        database: Option<&str>,
    ) -> Result<Arc<dyn DatabaseDriver>, String> {
        let Some(db) = database.map(str::trim).filter(|db| !db.is_empty()) else {
            return Ok(session.driver.clone());
        };
        if !session.driver.supports_database_switch()
            || session
                .database
                .as_deref()
                .is_some_and(|current| Self::database_names_match(&session.db_type, current, db))
        {
            return Ok(session.driver.clone());
        }
        // Case-insensitive engines share one cache entry per logical database
        let cache_key = match session.db_type {
            DatabaseType::MySQL | DatabaseType::MariaDB => db.to_ascii_lowercase(),
            _ => db.to_string(),
        };
        if let Some(driver) = session.derived_drivers.read().get(&cache_key).cloned() {
            return Ok(driver);
        }

        // Serialize creation so concurrent first requests share one pool.
        let _creating = session.creation_lock.lock().await;
        if let Some(driver) = session.derived_drivers.read().get(&cache_key).cloned() {
            return Ok(driver);
        }
        if !Self::database_exists(session, db).await? {
            return Err(format!("Database '{}' does not exist on this server", db));
        }
        let driver = match factory::create_driver_for_database(session, db).await {
            Ok(driver) => driver,
            Err(err) => {
                // The cached list may be stale (database dropped since) —
                // force revalidation on the next attempt.
                *session.known_databases.write() = None;
                return Err(err);
            }
        };
        session
            .derived_drivers
            .write()
            .insert(cache_key.clone(), driver.clone());
        if session.is_closed() {
            session.derived_drivers.write().remove(&cache_key);
            driver.close().await;
            return Err("Connection was closed".to_string());
        }
        log::info!(
            "[DB_ROUTE] id={} opened dedicated pool for database '{}'",
            session.connection_id,
            db
        );
        Ok(driver)
    }

    /// Check the requested name against the server's database list (cached
    /// per session, refreshed on a miss). Listing failures propagate — they
    /// must not silently reroute an explicitly selected database.
    async fn database_exists(session: &Arc<DatabaseSession>, db: &str) -> Result<bool, String> {
        let matches = |name: &String| Self::database_names_match(&session.db_type, name, db);
        if let Some(list) = session.known_databases.read().as_ref() {
            if list.iter().any(matches) {
                return Ok(true);
            }
        }
        let list = session
            .driver
            .get_databases()
            .await
            .map_err(|err| format!("Failed to verify database '{}': {}", db, err))?;
        let found = list.iter().any(matches);
        *session.known_databases.write() = Some(list);
        Ok(found)
    }

    /// Driver for metadata/object operations scoped to a database. Only the
    /// PostgreSQL family needs a dedicated pool; MySQL-family drivers scope
    /// these queries with the database name in SQL.
    async fn driver_for_object(
        &self,
        session: &Arc<DatabaseSession>,
        database: Option<&str>,
    ) -> Result<Arc<dyn DatabaseDriver>, String> {
        if session.driver.requires_dedicated_database_pool() {
            self.resolve_driver(session, database).await
        } else {
            Ok(session.driver.clone())
        }
    }

    /// The scope string passed to a driver's table-level methods: the schema
    /// for engines that organize objects by schema (PostgreSQL family),
    /// otherwise the database itself (MySQL family embeds it in SQL).
    fn object_scope<'a>(
        session: &'a DatabaseSession,
        database: &'a str,
        schema: Option<&'a str>,
    ) -> &'a str {
        if let Some(schema) = schema.filter(|s| !s.trim().is_empty()) {
            return schema;
        }
        if session.driver.requires_dedicated_database_pool() {
            session.schema.as_deref().unwrap_or("public")
        } else {
            database
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

        // Keep routing validation in sync with the list offered to the UI
        *session.known_databases.write() = Some(databases.clone());

        Ok(databases)
    }

    /// Get all schemas (PostgreSQL only)
    pub async fn get_schemas(&self, connection_id: &str, database: Option<&str>) -> Result<Vec<String>, String> {
        let session = self.get_session(connection_id)?;
        let driver = self.driver_for_object(&session, database).await?;
        driver.get_schemas(database).await
    }

    /// Get tables in a database/schema
    pub async fn get_tables(
        &self,
        connection_id: &str,
        database: &str,
        schema: Option<&str>,
    ) -> Result<Vec<TableInfo>, String> {
        let session = self.get_session(connection_id)?;
        let driver = self.driver_for_object(&session, Some(database)).await?;
        let tables = driver.get_tables(database, schema).await?;
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
        schema: Option<&str>,
        table: &str,
    ) -> Result<TableStructure, String> {
        let session = self.get_session(connection_id)?;
        let driver = self.driver_for_object(&session, Some(database)).await?;
        driver
            .get_table_structure(Self::object_scope(&session, database, schema), table)
            .await
    }

    /// Get views in a database/schema
    pub async fn get_views(
        &self,
        connection_id: &str,
        database: &str,
        schema: Option<&str>,
    ) -> Result<Vec<ViewInfo>, String> {
        let session = self.get_session(connection_id)?;
        let driver = self.driver_for_object(&session, Some(database)).await?;
        driver.get_views(database, schema).await
    }

    /// Get functions and procedures
    pub async fn get_routines(
        &self,
        connection_id: &str,
        database: &str,
        schema: Option<&str>,
    ) -> Result<Vec<RoutineInfo>, String> {
        let session = self.get_session(connection_id)?;
        let driver = self.driver_for_object(&session, Some(database)).await?;
        driver.get_routines(database, schema).await
    }

    /// Get database objects count
    pub async fn get_objects_count(
        &self,
        connection_id: &str,
        database: &str,
        schema: Option<&str>,
    ) -> Result<DatabaseObjectsCount, String> {
        let session = self.get_session(connection_id)?;
        let driver = self.driver_for_object(&session, Some(database)).await?;
        driver.get_objects_count(database, schema).await
    }

    /// Get table DDL
    pub async fn get_table_ddl(
        &self,
        connection_id: &str,
        database: &str,
        schema: Option<&str>,
        table: &str,
    ) -> Result<String, String> {
        let session = self.get_session(connection_id)?;
        let driver = self.driver_for_object(&session, Some(database)).await?;
        driver
            .get_table_ddl(Self::object_scope(&session, database, schema), table)
            .await
    }

    /// Rename a table
    pub async fn rename_table(
        &self,
        connection_id: &str,
        database: &str,
        schema: Option<&str>,
        old_name: &str,
        new_name: &str,
    ) -> Result<(), String> {
        let session = self.get_session(connection_id)?;
        let driver = self.driver_for_object(&session, Some(database)).await?;
        driver
            .rename_table(Self::object_scope(&session, database, schema), old_name, new_name)
            .await
    }

    /// Drop a table
    pub async fn drop_table(
        &self,
        connection_id: &str,
        database: &str,
        schema: Option<&str>,
        table: &str,
    ) -> Result<(), String> {
        let session = self.get_session(connection_id)?;
        let driver = self.driver_for_object(&session, Some(database)).await?;
        driver
            .drop_table(Self::object_scope(&session, database, schema), table)
            .await
    }

    /// Get foreign keys for a table
    pub async fn get_foreign_keys(
        &self,
        connection_id: &str,
        database: &str,
        schema: Option<&str>,
        table: &str,
    ) -> Result<Vec<ForeignKeyInfo>, String> {
        let session = self.get_session(connection_id)?;
        let driver = self.driver_for_object(&session, Some(database)).await?;
        driver
            .get_foreign_keys(Self::object_scope(&session, database, schema), table)
            .await
    }

    /// Get check constraints for a table
    pub async fn get_check_constraints(
        &self,
        connection_id: &str,
        database: &str,
        schema: Option<&str>,
        table: &str,
    ) -> Result<Vec<CheckConstraintInfo>, String> {
        let session = self.get_session(connection_id)?;
        let driver = self.driver_for_object(&session, Some(database)).await?;
        driver
            .get_check_constraints(Self::object_scope(&session, database, schema), table)
            .await
    }

    /// Get triggers for a table
    pub async fn get_triggers(
        &self,
        connection_id: &str,
        database: &str,
        schema: Option<&str>,
        table: &str,
    ) -> Result<Vec<TriggerInfo>, String> {
        let session = self.get_session(connection_id)?;
        let driver = self.driver_for_object(&session, Some(database)).await?;
        driver
            .get_triggers(Self::object_scope(&session, database, schema), table)
            .await
    }

    /// Get table options
    pub async fn get_table_options(
        &self,
        connection_id: &str,
        database: &str,
        schema: Option<&str>,
        table: &str,
    ) -> Result<TableOptions, String> {
        let session = self.get_session(connection_id)?;
        let driver = self.driver_for_object(&session, Some(database)).await?;
        driver
            .get_table_options(Self::object_scope(&session, database, schema), table)
            .await
    }

    /// Get extended table structure with all details
    pub async fn get_table_structure_ext(
        &self,
        connection_id: &str,
        database: &str,
        schema: Option<&str>,
        table: &str,
    ) -> Result<TableStructureExt, String> {
        let basic = self
            .get_table_structure(connection_id, database, schema, table)
            .await?;
        let foreign_keys = self
            .get_foreign_keys(connection_id, database, schema, table)
            .await?;
        let check_constraints = self
            .get_check_constraints(connection_id, database, schema, table)
            .await?;
        let triggers = self.get_triggers(connection_id, database, schema, table).await?;
        let options = self
            .get_table_options(connection_id, database, schema, table)
            .await?;

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
