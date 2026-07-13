//! Database session management
//!
//! Holds database connection information and driver instance.

use std::collections::HashMap;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};

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
    /// The database the base driver is actually connected to (resolved from
    /// the connection URL or the engine default when the request omits it).
    pub database: Option<String>,
    pub schema: Option<String>,
    pub driver: Arc<dyn DatabaseDriver>,
    pub ssh_tunnel: Option<SshTunnelHandle>,
    pub connected_at: chrono::DateTime<chrono::Utc>,
    /// The (SSH-tunnel-rewritten) connect request, kept so per-database
    /// drivers can be created lazily with identical connection settings.
    pub connect_request: DatabaseConnectRequest,
    /// Extra drivers connected to other databases on the same server,
    /// keyed by database name. Needed for engines like PostgreSQL where a
    /// connection is pinned to one database and switching requires a new pool.
    pub derived_drivers: RwLock<HashMap<String, Arc<dyn DatabaseDriver>>>,
    /// Cached list of databases on the server, used to validate a requested
    /// database name before opening a derived pool for it.
    pub known_databases: RwLock<Option<Vec<String>>>,
    /// Serializes derived-driver creation so concurrent first requests for
    /// the same database open a single pool.
    pub creation_lock: tokio::sync::Mutex<()>,
    closed: AtomicBool,
}

impl DatabaseSession {
    /// Build a session from the (possibly SSH-tunnel-rewritten) connect request.
    pub fn new(
        request: DatabaseConnectRequest,
        database: Option<String>,
        schema: Option<String>,
        driver: Arc<dyn DatabaseDriver>,
        ssh_tunnel: Option<SshTunnelHandle>,
    ) -> Self {
        Self {
            connection_id: request.connection_id.clone(),
            db_type: request.db_type.clone(),
            host: request.host.clone(),
            port: request.port,
            database,
            schema,
            driver,
            ssh_tunnel,
            connected_at: chrono::Utc::now(),
            connect_request: request,
            derived_drivers: RwLock::new(HashMap::new()),
            known_databases: RwLock::new(None),
            creation_lock: tokio::sync::Mutex::new(()),
            closed: AtomicBool::new(false),
        }
    }

    /// Mark the session closed so no new derived drivers get cached in it.
    pub fn mark_closed(&self) {
        self.closed.store(true, Ordering::SeqCst);
    }

    pub fn is_closed(&self) -> bool {
        self.closed.load(Ordering::SeqCst)
    }

    /// Take all derived drivers out of the session so the caller can close them.
    pub fn take_derived_drivers(&self) -> Vec<Arc<dyn DatabaseDriver>> {
        self.derived_drivers.write().drain().map(|(_, driver)| driver).collect()
    }
}
