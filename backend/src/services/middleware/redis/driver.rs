//! Redis driver implementation
//!
//! Main entry point for Redis operations.
//! Handles connection management and delegates to specialized modules.

use std::sync::Arc;

use async_trait::async_trait;
use redis::aio::MultiplexedConnection;
use redis::Client;
use tokio::sync::Mutex;

use crate::models::{
    RedisCommandResult, RedisConnectRequest, RedisDatabaseInfo, RedisInfo, RedisMode,
    RedisScanRequest, RedisScanResponse, RedisSetRequest, RedisValue,
};
use crate::services::middleware::traits::CacheDriver;

/// Redis connection type
pub enum RedisConnection {
    Standalone(MultiplexedConnection),
    Cluster(redis::cluster_async::ClusterConnection),
}

/// Redis driver implementation
pub struct RedisDriver {
    connection: Arc<Mutex<RedisConnection>>,
    config: RedisConnectRequest,
    current_db: Arc<Mutex<u8>>,
}

impl RedisDriver {
    /// Create a new Redis driver and connect
    pub async fn connect(config: RedisConnectRequest) -> Result<Self, String> {
        let connection = match config.mode {
            RedisMode::Standalone => Self::connect_standalone(&config).await?,
            RedisMode::Cluster => Self::connect_cluster(&config).await?,
            RedisMode::Sentinel => Self::connect_sentinel(&config).await?,
        };

        let db = config.db.unwrap_or(0);

        Ok(Self {
            connection: Arc::new(Mutex::new(connection)),
            config,
            current_db: Arc::new(Mutex::new(db)),
        })
    }

    /// Connect to standalone Redis
    async fn connect_standalone(config: &RedisConnectRequest) -> Result<RedisConnection, String> {
        let url = Self::build_connection_url(config)?;
        let client = Client::open(url).map_err(|e| format!("Failed to create client: {}", e))?;

        let conn = client
            .get_multiplexed_async_connection()
            .await
            .map_err(|e| format!("Failed to connect: {}", e))?;

        Ok(RedisConnection::Standalone(conn))
    }

    /// Connect to Redis cluster
    async fn connect_cluster(config: &RedisConnectRequest) -> Result<RedisConnection, String> {
        let nodes = config
            .nodes
            .as_ref()
            .ok_or("Cluster nodes required")?
            .iter()
            .map(|n| {
                // Build URL with password if provided
                let scheme = if config.tls.as_ref().map(|t| t.enabled).unwrap_or(false) {
                    "rediss"
                } else {
                    "redis"
                };

                let host_port = if n.starts_with("redis://") || n.starts_with("rediss://") {
                    // Extract host:port from existing URL
                    n.trim_start_matches("redis://").trim_start_matches("rediss://").to_string()
                } else {
                    n.clone()
                };

                if let Some(password) = &config.password {
                    format!("{}://:{}@{}", scheme, urlencoding::encode(password), host_port)
                } else {
                    format!("{}://{}", scheme, host_port)
                }
            })
            .collect::<Vec<_>>();

        let client = redis::cluster::ClusterClient::new(nodes)
            .map_err(|e| format!("Failed to create cluster client: {}", e))?;

        let conn = client
            .get_async_connection()
            .await
            .map_err(|e| format!("Failed to connect to cluster: {}", e))?;

        Ok(RedisConnection::Cluster(conn))
    }

    /// Connect to Redis via Sentinel
    async fn connect_sentinel(config: &RedisConnectRequest) -> Result<RedisConnection, String> {
        let sentinels = config
            .sentinels
            .as_ref()
            .ok_or("Sentinel nodes required")?;
        let master_name = config
            .master_name
            .as_ref()
            .ok_or("Master name required")?;

        // Try to connect to each sentinel and get master info
        for sentinel_addr in sentinels {
            if let Ok((master_host, master_port)) =
                Self::get_master_from_sentinel(sentinel_addr, master_name, &config.sentinel_password).await
            {
                // Create a standalone config pointing to master
                let mut standalone_config = config.clone();
                standalone_config.host = Some(master_host);
                standalone_config.port = Some(master_port);
                standalone_config.mode = RedisMode::Standalone;
                return Self::connect_standalone(&standalone_config).await;
            }
        }

        Err("Failed to connect to any sentinel".to_string())
    }

    /// Get master info from sentinel
    async fn get_master_from_sentinel(
        sentinel_addr: &str,
        master_name: &str,
        password: &Option<String>,
    ) -> Result<(String, u16), String> {
        let url = if let Some(pwd) = password {
            format!("redis://:{}@{}", pwd, sentinel_addr)
        } else {
            format!("redis://{}", sentinel_addr)
        };

        let client = Client::open(url).map_err(|e| format!("Sentinel client error: {}", e))?;

        let mut conn = client
            .get_multiplexed_async_connection()
            .await
            .map_err(|e| format!("Sentinel connection error: {}", e))?;

        // Execute SENTINEL GET-MASTER-ADDR-BY-NAME
        let result: Vec<String> = redis::cmd("SENTINEL")
            .arg("GET-MASTER-ADDR-BY-NAME")
            .arg(master_name)
            .query_async(&mut conn)
            .await
            .map_err(|e| format!("Sentinel query error: {}", e))?;

        if result.len() >= 2 {
            let port: u16 = result[1].parse().map_err(|_| "Invalid port")?;
            Ok((result[0].clone(), port))
        } else {
            Err("Master not found".to_string())
        }
    }

    /// Build Redis connection URL
    fn build_connection_url(config: &RedisConnectRequest) -> Result<String, String> {
        let host = config.host.as_deref().unwrap_or("127.0.0.1");
        let port = config.port.unwrap_or(6379);
        let db = config.db.unwrap_or(0);

        let scheme = if config
            .tls
            .as_ref()
            .map(|t| t.enabled)
            .unwrap_or(false)
        {
            "rediss"
        } else {
            "redis"
        };

        let auth = if let Some(password) = &config.password {
            format!(":{}@", urlencoding::encode(password))
        } else {
            String::new()
        };

        Ok(format!("{}://{}{}:{}/{}", scheme, auth, host, port, db))
    }

    /// Get a connection for operations
    pub(crate) async fn get_connection(&self) -> tokio::sync::MutexGuard<'_, RedisConnection> {
        self.connection.lock().await
    }

    /// Execute a raw Redis command
    pub(crate) async fn execute_raw<T: redis::FromRedisValue>(
        &self,
        cmd: &str,
        args: &[&str],
    ) -> Result<T, String> {
        let mut conn = self.get_connection().await;
        let mut redis_cmd = redis::cmd(cmd);
        for arg in args {
            redis_cmd.arg(*arg);
        }

        match &mut *conn {
            RedisConnection::Standalone(c) => redis_cmd
                .query_async(c)
                .await
                .map_err(|e| format!("Command failed: {}", e)),
            RedisConnection::Cluster(c) => redis_cmd
                .query_async(c)
                .await
                .map_err(|e| format!("Command failed: {}", e)),
        }
    }

    /// Execute a raw Redis command with String args
    pub(crate) async fn execute_raw_string<T: redis::FromRedisValue>(
        &self,
        cmd: &str,
        args: &[String],
    ) -> Result<T, String> {
        let mut conn = self.get_connection().await;
        let mut redis_cmd = redis::cmd(cmd);
        for arg in args {
            redis_cmd.arg(arg);
        }

        match &mut *conn {
            RedisConnection::Standalone(c) => redis_cmd
                .query_async(c)
                .await
                .map_err(|e| format!("Command failed: {}", e)),
            RedisConnection::Cluster(c) => redis_cmd
                .query_async(c)
                .await
                .map_err(|e| format!("Command failed: {}", e)),
        }
    }
}

#[async_trait]
impl CacheDriver for RedisDriver {
    async fn test_connection(&self) -> Result<(), String> {
        let _: String = self.execute_raw("PING", &[]).await?;
        Ok(())
    }

    async fn close(&self) {
        // Connection will be closed when dropped
    }

    async fn get_info(&self, section: Option<&str>) -> Result<RedisInfo, String> {
        super::info::get_info(self, section).await
    }

    async fn get_databases(&self) -> Result<Vec<RedisDatabaseInfo>, String> {
        super::info::get_databases(self).await
    }

    async fn select_database(&self, db: u8) -> Result<(), String> {
        // Only works for standalone mode
        let mut conn = self.get_connection().await;
        match &mut *conn {
            RedisConnection::Standalone(c) => {
                redis::cmd("SELECT")
                    .arg(db)
                    .query_async::<()>(c)
                    .await
                    .map_err(|e| format!("SELECT failed: {}", e))?;
                *self.current_db.lock().await = db;
                Ok(())
            }
            RedisConnection::Cluster(_) => {
                Err("Database selection not supported in cluster mode".to_string())
            }
        }
    }

    async fn scan_keys(&self, request: RedisScanRequest) -> Result<RedisScanResponse, String> {
        super::keys::scan_keys(self, request).await
    }

    async fn get_key_count(&self) -> Result<i64, String> {
        super::keys::get_key_count(self).await
    }

    async fn get_key_type(&self, key: &str) -> Result<String, String> {
        super::keys::get_key_type(self, key).await
    }

    async fn get_key_ttl(&self, key: &str) -> Result<i64, String> {
        super::keys::get_key_ttl(self, key).await
    }

    async fn set_key_ttl(&self, key: &str, ttl: i64) -> Result<(), String> {
        super::keys::set_key_ttl(self, key, ttl).await
    }

    async fn delete_keys(&self, keys: Vec<String>) -> Result<i64, String> {
        super::keys::delete_keys(self, keys).await
    }

    async fn rename_key(&self, old_key: &str, new_key: &str) -> Result<(), String> {
        super::keys::rename_key(self, old_key, new_key).await
    }

    async fn key_exists(&self, key: &str) -> Result<bool, String> {
        super::keys::key_exists(self, key).await
    }

    async fn get_value(&self, key: &str) -> Result<RedisValue, String> {
        super::data::get_value(self, key).await
    }

    async fn set_value(&self, request: RedisSetRequest) -> Result<(), String> {
        super::data::set_value(self, request).await
    }

    async fn execute_command(
        &self,
        command: &str,
        args: Vec<String>,
    ) -> Result<RedisCommandResult, String> {
        let start = std::time::Instant::now();

        let mut conn = self.get_connection().await;
        let mut redis_cmd = redis::cmd(command);
        for arg in &args {
            redis_cmd.arg(arg);
        }

        let result: redis::Value = match &mut *conn {
            RedisConnection::Standalone(c) => redis_cmd
                .query_async(c)
                .await
                .map_err(|e| format!("Command failed: {}", e))?,
            RedisConnection::Cluster(c) => redis_cmd
                .query_async(c)
                .await
                .map_err(|e| format!("Command failed: {}", e))?,
        };

        let execution_time_ms = start.elapsed().as_millis() as i64;

        Ok(RedisCommandResult {
            result_type: Self::get_value_type(&result),
            value: Self::redis_value_to_json(&result),
            execution_time_ms,
        })
    }

    async fn flush_db(&self, async_mode: bool) -> Result<(), String> {
        let args: &[&str] = if async_mode { &["ASYNC"] } else { &[] };
        let _: () = self.execute_raw("FLUSHDB", args).await?;
        Ok(())
    }

    async fn flush_all(&self, async_mode: bool) -> Result<(), String> {
        let args: &[&str] = if async_mode { &["ASYNC"] } else { &[] };
        let _: () = self.execute_raw("FLUSHALL", args).await?;
        Ok(())
    }
}

impl RedisDriver {
    /// Get Redis value type name
    fn get_value_type(value: &redis::Value) -> String {
        match value {
            redis::Value::Nil => "null".to_string(),
            redis::Value::Int(_) => "integer".to_string(),
            redis::Value::BulkString(_) | redis::Value::SimpleString(_) => "string".to_string(),
            redis::Value::Array(_) => "array".to_string(),
            redis::Value::Map(_) => "map".to_string(),
            redis::Value::Okay => "ok".to_string(),
            redis::Value::ServerError(_) => "error".to_string(),
            _ => "unknown".to_string(),
        }
    }

    /// Convert Redis value to JSON
    fn redis_value_to_json(value: &redis::Value) -> serde_json::Value {
        match value {
            redis::Value::Nil => serde_json::Value::Null,
            redis::Value::Int(i) => serde_json::json!(i),
            redis::Value::BulkString(bytes) => {
                match String::from_utf8(bytes.clone()) {
                    Ok(s) => serde_json::json!(s),
                    Err(_) => serde_json::json!(format!("<binary: {} bytes>", bytes.len())),
                }
            }
            redis::Value::SimpleString(s) => serde_json::json!(s),
            redis::Value::Array(arr) => {
                serde_json::json!(arr.iter().map(Self::redis_value_to_json).collect::<Vec<_>>())
            }
            redis::Value::Map(map) => {
                let mut obj = serde_json::Map::new();
                for (k, v) in map {
                    let key = match k {
                        redis::Value::BulkString(bytes) => {
                            String::from_utf8_lossy(bytes).to_string()
                        }
                        redis::Value::SimpleString(s) => s.clone(),
                        _ => format!("{:?}", k),
                    };
                    obj.insert(key, Self::redis_value_to_json(v));
                }
                serde_json::Value::Object(obj)
            }
            redis::Value::Okay => serde_json::json!("OK"),
            redis::Value::ServerError(e) => serde_json::json!(format!("ERROR: {:?}", e)),
            _ => serde_json::json!(format!("{:?}", value)),
        }
    }
}
