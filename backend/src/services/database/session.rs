//! Database session management
//!
//! Holds database connection information and driver instance.

use std::sync::Arc;

use crate::models::DatabaseType;

use super::traits::DatabaseDriver;

/// Database session holding connection info and driver
pub struct DatabaseSession {
    pub connection_id: String,
    pub db_type: DatabaseType,
    pub host: String,
    pub port: u16,
    pub database: Option<String>,
    pub schema: Option<String>,
    pub driver: Arc<dyn DatabaseDriver>,
    pub connected_at: chrono::DateTime<chrono::Utc>,
}

impl DatabaseSession {
    pub fn new(
        connection_id: String,
        db_type: DatabaseType,
        host: String,
        port: u16,
        database: Option<String>,
        schema: Option<String>,
        driver: Arc<dyn DatabaseDriver>,
    ) -> Self {
        Self {
            connection_id,
            db_type,
            host,
            port,
            database,
            schema,
            driver,
            connected_at: chrono::Utc::now(),
        }
    }
}
