//! Middleware session management
//!
//! Holds middleware connection information and driver instance.

use std::sync::Arc;

use crate::models::MiddlewareType;

use super::traits::MessageQueueDriver;

/// Middleware session holding connection info and driver
pub struct MiddlewareSession {
    pub connection_id: String,
    pub middleware_type: MiddlewareType,
    pub servers: Vec<String>,
    pub driver: Arc<dyn MessageQueueDriver>,
    pub connected_at: chrono::DateTime<chrono::Utc>,
}

impl MiddlewareSession {
    pub fn new(
        connection_id: String,
        middleware_type: MiddlewareType,
        servers: Vec<String>,
        driver: Arc<dyn MessageQueueDriver>,
    ) -> Self {
        Self {
            connection_id,
            middleware_type,
            servers,
            driver,
            connected_at: chrono::Utc::now(),
        }
    }
}
