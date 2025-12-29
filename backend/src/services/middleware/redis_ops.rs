//! Redis operations for MiddlewareService
//!
//! Contains all Redis-related methods for the MiddlewareService.

use std::sync::Arc;

use crate::models::{
    RedisCommandResult, RedisConnectRequest, RedisConnectionInfo, RedisDatabaseInfo,
    RedisInfo, RedisMode, RedisScanRequest, RedisScanResponse, RedisSetRequest, RedisValue,
};

use super::redis::RedisDriver;
use super::redis_session::RedisSession;
use super::traits::CacheDriver;
use super::MiddlewareService;

impl MiddlewareService {
    // ============ Redis Connection ============

    /// Connect to Redis
    pub async fn connect_redis(
        &self,
        request: RedisConnectRequest,
    ) -> Result<RedisConnectionInfo, String> {
        let driver = RedisDriver::connect(request.clone()).await?;

        let host = request.host.clone().unwrap_or_else(|| "127.0.0.1".to_string());
        let port = request.port.unwrap_or(6379);
        let mode_str = match request.mode {
            RedisMode::Standalone => "standalone",
            RedisMode::Cluster => "cluster",
            RedisMode::Sentinel => "sentinel",
        };

        // Get server info for connection info
        let info = driver.get_info(None).await.unwrap_or_default();
        let key_count = driver.get_key_count().await.unwrap_or(0);

        let session = Arc::new(RedisSession::new(
            request.connection_id.clone(),
            host.clone(),
            port,
            mode_str.to_string(),
            Arc::new(driver),
        ));

        self.redis_sessions
            .write()
            .insert(request.connection_id.clone(), session.clone());

        Ok(RedisConnectionInfo {
            connection_id: request.connection_id,
            mode: request.mode,
            version: info.server.redis_version,
            connected_clients: info.clients.connected_clients,
            used_memory: info.memory.used_memory_human,
            total_keys: key_count,
            connected_at: session.connected_at.to_rfc3339(),
        })
    }

    /// Disconnect from Redis
    pub async fn disconnect_redis(&self, connection_id: &str) -> Result<(), String> {
        let session = self.redis_sessions.write().remove(connection_id);
        if let Some(session) = session {
            session.driver.close().await;
            Ok(())
        } else {
            Err("Redis connection not found".to_string())
        }
    }

    /// Test Redis connection
    pub async fn test_redis_connection(&self, request: RedisConnectRequest) -> Result<(), String> {
        let driver = RedisDriver::connect(request).await?;
        driver.test_connection().await?;
        driver.close().await;
        Ok(())
    }

    /// Check if Redis connection exists
    pub fn is_redis_connected(&self, connection_id: &str) -> bool {
        self.redis_sessions.read().contains_key(connection_id)
    }

    // ============ Redis Server Info ============

    /// Get Redis server info
    pub async fn redis_get_info(
        &self,
        connection_id: &str,
        section: Option<String>,
    ) -> Result<RedisInfo, String> {
        let session = self.get_redis_session(connection_id)?;
        session.driver.get_info(section.as_deref()).await
    }

    /// Get Redis database list
    pub async fn redis_get_databases(
        &self,
        connection_id: &str,
    ) -> Result<Vec<RedisDatabaseInfo>, String> {
        let session = self.get_redis_session(connection_id)?;
        session.driver.get_databases().await
    }

    /// Select Redis database
    pub async fn redis_select_database(
        &self,
        connection_id: &str,
        db: u8,
    ) -> Result<(), String> {
        let session = self.get_redis_session(connection_id)?;
        session.driver.select_database(db).await
    }

    // ============ Redis Key Operations ============

    /// Scan Redis keys
    pub async fn redis_scan_keys(
        &self,
        connection_id: &str,
        request: RedisScanRequest,
    ) -> Result<RedisScanResponse, String> {
        let session = self.get_redis_session(connection_id)?;
        session.driver.scan_keys(request).await
    }

    /// Get Redis key count
    pub async fn redis_get_key_count(&self, connection_id: &str) -> Result<i64, String> {
        let session = self.get_redis_session(connection_id)?;
        session.driver.get_key_count().await
    }

    /// Get Redis key type
    pub async fn redis_get_key_type(
        &self,
        connection_id: &str,
        key: &str,
    ) -> Result<String, String> {
        let session = self.get_redis_session(connection_id)?;
        session.driver.get_key_type(key).await
    }

    /// Get Redis key TTL
    pub async fn redis_get_key_ttl(&self, connection_id: &str, key: &str) -> Result<i64, String> {
        let session = self.get_redis_session(connection_id)?;
        session.driver.get_key_ttl(key).await
    }

    /// Set Redis key TTL
    pub async fn redis_set_key_ttl(
        &self,
        connection_id: &str,
        key: &str,
        ttl: i64,
    ) -> Result<(), String> {
        let session = self.get_redis_session(connection_id)?;
        session.driver.set_key_ttl(key, ttl).await
    }

    /// Delete Redis keys
    pub async fn redis_delete_keys(
        &self,
        connection_id: &str,
        keys: Vec<String>,
    ) -> Result<i64, String> {
        let session = self.get_redis_session(connection_id)?;
        session.driver.delete_keys(keys).await
    }

    /// Rename Redis key
    pub async fn redis_rename_key(
        &self,
        connection_id: &str,
        old_key: &str,
        new_key: &str,
    ) -> Result<(), String> {
        let session = self.get_redis_session(connection_id)?;
        session.driver.rename_key(old_key, new_key).await
    }

    /// Check if Redis key exists
    pub async fn redis_key_exists(
        &self,
        connection_id: &str,
        key: &str,
    ) -> Result<bool, String> {
        let session = self.get_redis_session(connection_id)?;
        session.driver.key_exists(key).await
    }

    // ============ Redis Data Operations ============

    /// Get Redis value
    pub async fn redis_get_value(
        &self,
        connection_id: &str,
        key: &str,
    ) -> Result<RedisValue, String> {
        let session = self.get_redis_session(connection_id)?;
        session.driver.get_value(key).await
    }

    /// Set Redis value
    pub async fn redis_set_value(
        &self,
        connection_id: &str,
        request: RedisSetRequest,
    ) -> Result<(), String> {
        let session = self.get_redis_session(connection_id)?;
        session.driver.set_value(request).await
    }

    // ============ Redis Command Execution ============

    /// Execute Redis command
    pub async fn redis_execute_command(
        &self,
        connection_id: &str,
        command: &str,
        args: Vec<String>,
    ) -> Result<RedisCommandResult, String> {
        let session = self.get_redis_session(connection_id)?;
        session.driver.execute_command(command, args).await
    }

    // ============ Redis Management ============

    /// Flush Redis database
    pub async fn redis_flush_db(
        &self,
        connection_id: &str,
        async_mode: bool,
    ) -> Result<(), String> {
        let session = self.get_redis_session(connection_id)?;
        session.driver.flush_db(async_mode).await
    }

    /// Flush all Redis databases
    pub async fn redis_flush_all(
        &self,
        connection_id: &str,
        async_mode: bool,
    ) -> Result<(), String> {
        let session = self.get_redis_session(connection_id)?;
        session.driver.flush_all(async_mode).await
    }

    // ============ Helper ============

    /// Get Redis session by connection ID
    pub(crate) fn get_redis_session(
        &self,
        connection_id: &str,
    ) -> Result<Arc<RedisSession>, String> {
        self.redis_sessions
            .read()
            .get(connection_id)
            .cloned()
            .ok_or_else(|| "Redis connection not found".to_string())
    }
}
