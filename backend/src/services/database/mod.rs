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
#[cfg(feature = "oracle")]
mod oracle;
mod postgresql;
mod session;
mod sqlite;
mod traits;

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
#[cfg(feature = "oracle")]
use oracle::OracleDriver;
use postgresql::PostgreSqlDriver;
use sqlite::SqliteDriver;

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

    /// Connect to database
    pub async fn connect(
        &self,
        request: DatabaseConnectRequest,
    ) -> Result<DatabaseConnectionInfo, String> {
        let password = request.password.as_deref().unwrap_or("");

        let (driver, schema): (Arc<dyn DatabaseDriver>, Option<String>) = match request.db_type {
            DatabaseType::MySQL => {
                let database = request.database.as_deref().unwrap_or("mysql");
                let driver = MySqlDriver::connect(
                    &request.host,
                    request.port,
                    &request.username,
                    password,
                    database,
                )
                .await?;
                (Arc::new(driver), None)
            }
            DatabaseType::PostgreSQL => {
                let database = request.database.as_deref().unwrap_or("postgres");
                let driver = PostgreSqlDriver::connect(
                    &request.host,
                    request.port,
                    &request.username,
                    password,
                    database,
                )
                .await?;
                (Arc::new(driver), Some("public".to_string()))
            }
            DatabaseType::MariaDB => {
                let database = request.database.as_deref().unwrap_or("mysql");
                let driver = MariaDBDriver::connect(
                    &request.host,
                    request.port,
                    &request.username,
                    password,
                    database,
                )
                .await?;
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
                let database = request.database.as_deref().unwrap_or("TEST");
                let driver = KingBaseDriver::connect(
                    &request.host,
                    request.port,
                    &request.username,
                    password,
                    database,
                )
                .await?;
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
                let database = request.database.as_deref().unwrap_or("default");
                let driver = ClickHouseDriver::connect(
                    &request.host,
                    request.port,
                    &request.username,
                    password,
                    database,
                )
                .await?;
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
        ));

        self.sessions
            .write()
            .insert(request.connection_id.clone(), session.clone());

        Ok(DatabaseConnectionInfo {
            connection_id: request.connection_id,
            db_type: request.db_type,
            host: request.host,
            port: request.port,
            database: request.database,
            connected_at: session.connected_at.to_rfc3339(),
        })
    }

    /// Disconnect from database
    pub async fn disconnect(&self, connection_id: &str) -> Result<(), String> {
        let session = self.sessions.write().remove(connection_id);
        if let Some(session) = session {
            session.driver.close().await;
            Ok(())
        } else {
            Err("Connection not found".to_string())
        }
    }

    /// Test database connection
    pub async fn test_connection(&self, request: DatabaseConnectRequest) -> Result<(), String> {
        let password = request.password.as_deref().unwrap_or("");

        match request.db_type {
            DatabaseType::MySQL => {
                let database = request.database.as_deref().unwrap_or("mysql");
                MySqlDriver::test_connection(
                    &request.host,
                    request.port,
                    &request.username,
                    password,
                    database,
                )
                .await
            }
            DatabaseType::PostgreSQL => {
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
            DatabaseType::MariaDB => {
                let database = request.database.as_deref().unwrap_or("mysql");
                MariaDBDriver::test_connection(
                    &request.host,
                    request.port,
                    &request.username,
                    password,
                    database,
                )
                .await
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
            #[cfg(not(feature = "clickhouse"))]
            DatabaseType::ClickHouse => {
                Err("ClickHouse support is not enabled. Rebuild with --features clickhouse".to_string())
            }
        }
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
        session.driver.get_databases().await
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
        session.driver.get_tables(database, schema).await
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
