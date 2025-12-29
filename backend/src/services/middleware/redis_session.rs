//! Redis session management
//!
//! Holds Redis connection information and driver instance.

use std::sync::Arc;

use super::traits::CacheDriver;

/// Redis session holding connection info and driver
pub struct RedisSession {
    pub connection_id: String,
    pub host: String,
    pub port: u16,
    pub mode: String,
    pub driver: Arc<dyn CacheDriver>,
    pub connected_at: chrono::DateTime<chrono::Utc>,
    pub current_db: u8,
}

impl RedisSession {
    pub fn new(
        connection_id: String,
        host: String,
        port: u16,
        mode: String,
        driver: Arc<dyn CacheDriver>,
    ) -> Self {
        Self {
            connection_id,
            host,
            port,
            mode,
            driver,
            connected_at: chrono::Utc::now(),
            current_db: 0,
        }
    }
}
