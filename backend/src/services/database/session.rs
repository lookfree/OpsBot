//! Database session management
//!
//! Holds database connection information and driver instance.

use std::collections::HashMap;
use std::sync::Arc;

use parking_lot::RwLock;

use crate::models::{DatabaseConnectRequest, DatabaseType};

use super::traits::DatabaseDriver;
use crate::services::SshTunnelHandle;

/// Database session holding connection info and driver
pub struct DatabaseSession {
    pub connection_id: String,
    pub db_type: DatabaseType,
    pub host: String,
    pub port: u16,
    pub username: String,
    pub password: String,
    pub database: Option<String>,
    pub schema: Option<String>,
    pub connection_url: Option<String>,
    pub driver_version: Option<String>,
    pub driver: Arc<dyn DatabaseDriver>,
    pub ssh_tunnel: Option<SshTunnelHandle>,
    pub connected_at: chrono::DateTime<chrono::Utc>,
    /// Extra drivers connected to other databases on the same server,
    /// keyed by database name. Needed for engines like PostgreSQL where a
    /// connection is pinned to one database and switching requires a new pool.
    pub derived_drivers: RwLock<HashMap<String, Arc<dyn DatabaseDriver>>>,
    /// Cached list of databases on the server, used to validate a requested
    /// database name before opening a derived pool for it.
    pub known_databases: RwLock<Option<Vec<String>>>,
}

impl DatabaseSession {
    /// Build a session from the (possibly SSH-tunnel-rewritten) connect request.
    pub fn new(
        request: &DatabaseConnectRequest,
        schema: Option<String>,
        driver: Arc<dyn DatabaseDriver>,
        ssh_tunnel: Option<SshTunnelHandle>,
    ) -> Self {
        Self {
            connection_id: request.connection_id.clone(),
            db_type: request.db_type.clone(),
            host: request.host.clone(),
            port: request.port,
            username: request.username.clone(),
            password: request.password.clone().unwrap_or_default(),
            database: request.database.clone(),
            schema,
            connection_url: request.connection_url.clone(),
            driver_version: request.driver_version.clone(),
            driver,
            ssh_tunnel,
            connected_at: chrono::Utc::now(),
            derived_drivers: RwLock::new(HashMap::new()),
            known_databases: RwLock::new(None),
        }
    }

    /// Take all derived drivers out of the session so the caller can close them.
    pub fn take_derived_drivers(&self) -> Vec<Arc<dyn DatabaseDriver>> {
        self.derived_drivers.write().drain().map(|(_, driver)| driver).collect()
    }
}
