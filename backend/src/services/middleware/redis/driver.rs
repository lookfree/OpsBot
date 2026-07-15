//! Redis driver implementation
//!
//! Main entry point for Redis operations.
//! Handles connection management and delegates to specialized modules.

use std::collections::HashMap;
use std::sync::Arc;

use async_trait::async_trait;
use parking_lot::RwLock;
use redis::aio::MultiplexedConnection;
use redis::Client;
use tokio::sync::Mutex;

use crate::models::{
    ClusterNodeInfo, RedisCommandResult, RedisConnectRequest, RedisDatabaseInfo, RedisInfo,
    RedisMode, RedisScanRequest, RedisScanResponse, RedisSetRequest, RedisValue,
};
use crate::services::middleware::traits::CacheDriver;

/// Redis connection type
/// Both MultiplexedConnection and ClusterConnection implement Clone,
/// so we can clone connections for concurrent use without a Mutex.
#[derive(Clone)]
pub enum RedisConnection {
    Standalone(MultiplexedConnection),
    Cluster(redis::cluster_async::ClusterConnection),
}

/// Redis driver implementation
pub struct RedisDriver {
    /// Guarded by an RwLock so `select_database` can atomically swap in a fresh
    /// connection bound to the selected DB (which also survives reconnects).
    connection: RwLock<RedisConnection>,
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
            connection: RwLock::new(connection),
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
        let raw_nodes = config
            .nodes
            .as_ref()
            .ok_or("Cluster nodes required")?;

        log::info!("Redis cluster: received {} raw nodes: {:?}", raw_nodes.len(), raw_nodes);

        let nodes = raw_nodes
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

        log::info!("Redis cluster: connecting to nodes: {:?}", nodes.iter().map(|n| {
            // Hide password in log
            if n.contains("@") {
                let parts: Vec<&str> = n.split("@").collect();
                format!("{}://***@{}", parts[0].split("://").next().unwrap_or("redis"), parts.get(1).unwrap_or(&""))
            } else {
                n.clone()
            }
        }).collect::<Vec<_>>());

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
            // URL-encode the password so special characters (@ : / %) don't break parsing.
            format!("redis://:{}@{}", urlencoding::encode(pwd), sentinel_addr)
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

    /// Build Redis connection URL (using the configured DB index)
    fn build_connection_url(config: &RedisConnectRequest) -> Result<String, String> {
        Self::build_connection_url_with_db(config, config.db.unwrap_or(0))
    }

    /// Build Redis connection URL bound to a specific DB index
    fn build_connection_url_with_db(
        config: &RedisConnectRequest,
        db: u8,
    ) -> Result<String, String> {
        let host = config.host.as_deref().unwrap_or("127.0.0.1");
        let port = config.port.unwrap_or(6379);

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

    /// Get a cloned connection for operations.
    /// Both MultiplexedConnection and ClusterConnection are cheaply cloneable,
    /// so this avoids lock contention for concurrent operations.
    pub(crate) fn get_connection_clone(&self) -> RedisConnection {
        self.connection.read().clone()
    }

    /// Execute a raw Redis command
    pub(crate) async fn execute_raw<T: redis::FromRedisValue>(
        &self,
        cmd: &str,
        args: &[&str],
    ) -> Result<T, String> {
        log::debug!("Redis execute_raw: cmd={} args={:?}", cmd, args);

        let mut conn = self.get_connection_clone();
        let mut redis_cmd = redis::cmd(cmd);
        for arg in args {
            redis_cmd.arg(*arg);
        }

        let result = match &mut conn {
            RedisConnection::Standalone(c) => redis_cmd
                .query_async(c)
                .await
                .map_err(|e| {
                    log::error!("Redis standalone command failed: cmd={} error={}", cmd, e);
                    format!("Command failed: {}", e)
                }),
            RedisConnection::Cluster(c) => redis_cmd
                .query_async(c)
                .await
                .map_err(|e| {
                    log::error!("Redis cluster command failed: cmd={} error={}", cmd, e);
                    format!("Command failed: {}", e)
                }),
        };

        log::debug!("Redis execute_raw: cmd={} success={}", cmd, result.is_ok());
        result
    }

    /// Execute a raw Redis command with String args
    pub(crate) async fn execute_raw_string<T: redis::FromRedisValue>(
        &self,
        cmd: &str,
        args: &[String],
    ) -> Result<T, String> {
        let mut conn = self.get_connection_clone();
        let mut redis_cmd = redis::cmd(cmd);
        for arg in args {
            redis_cmd.arg(arg);
        }

        match &mut conn {
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

    /// Execute INFO command - handles cluster mode returning Map<node, info>
    /// For cluster mode, picks the first master node's response
    pub(crate) async fn execute_info(&self, section: Option<&str>) -> Result<String, String> {
        log::debug!("Redis execute_info: section={:?}", section);

        let mut conn = self.get_connection_clone();
        let mut redis_cmd = redis::cmd("INFO");
        if let Some(sec) = section {
            redis_cmd.arg(sec);
        }

        match &mut conn {
            RedisConnection::Standalone(c) => redis_cmd
                .query_async::<String>(c)
                .await
                .map_err(|e| {
                    log::error!("Redis standalone INFO failed: {}", e);
                    format!("INFO failed: {}", e)
                }),
            RedisConnection::Cluster(c) => {
                // Cluster mode returns HashMap<String, String> where key is node address
                let result: HashMap<String, String> = redis_cmd
                    .query_async(c)
                    .await
                    .map_err(|e| {
                        log::error!("Redis cluster INFO failed: {}", e);
                        format!("INFO failed: {}", e)
                    })?;

                log::debug!("Redis cluster INFO: got {} node responses", result.len());

                // Pick a deterministic node (lowest address) so repeated
                // refreshes don't flicker between different nodes' stats.
                if let Some((node, info)) = result.into_iter().min_by(|a, b| a.0.cmp(&b.0)) {
                    log::debug!("Using INFO from node: {}", node);
                    Ok(info)
                } else {
                    Err("No nodes returned INFO".to_string())
                }
            }
        }
    }

    /// Execute DBSIZE command - for cluster mode, sums DBSIZE across all masters
    pub(crate) async fn execute_dbsize(&self) -> Result<i64, String> {
        log::debug!("Redis execute_dbsize");

        // Cluster: query each master directly and sum. A single aggregated i64
        // reply from the cluster client can silently reflect just one shard, so
        // we never trust it for the total key count.
        if self.is_cluster_mode() {
            let masters = self.get_cluster_masters().await?;
            if masters.is_empty() {
                return Err("No master nodes found in cluster".to_string());
            }
            let mut total: i64 = 0;
            for master in &masters {
                let mut node_conn = self.connect_to_node(&master.address).await?;
                let count: i64 = redis::cmd("DBSIZE")
                    .query_async(&mut node_conn)
                    .await
                    .map_err(|e| format!("DBSIZE failed on {}: {}", master.address, e))?;
                total += count;
            }
            log::debug!(
                "Redis cluster DBSIZE: total {} from {} masters",
                total,
                masters.len()
            );
            return Ok(total);
        }

        let mut conn = self.get_connection_clone();
        match &mut conn {
            RedisConnection::Standalone(c) => redis::cmd("DBSIZE")
                .query_async::<i64>(c)
                .await
                .map_err(|e| {
                    log::error!("Redis standalone DBSIZE failed: {}", e);
                    format!("DBSIZE failed: {}", e)
                }),
            RedisConnection::Cluster(_) => unreachable!("handled by is_cluster_mode above"),
        }
    }

    /// Execute SCAN command - for cluster mode, handles aggregated response
    /// Returns (cursor, keys) tuple
    pub(crate) async fn execute_scan(&self, args: &[&str]) -> Result<(String, Vec<String>), String> {
        log::debug!("Redis execute_scan: args={:?}", args);

        let mut conn = self.get_connection_clone();
        let mut redis_cmd = redis::cmd("SCAN");
        for arg in args {
            redis_cmd.arg(*arg);
        }

        match &mut conn {
            RedisConnection::Standalone(c) => redis_cmd
                .query_async::<(String, Vec<String>)>(c)
                .await
                .map_err(|e| {
                    log::error!("Redis standalone SCAN failed: {}", e);
                    format!("SCAN failed: {}", e)
                }),
            RedisConnection::Cluster(c) => {
                // Cluster mode: redis-rs aggregates SCAN from all nodes
                // It returns a flat Vec<String> of all keys (already aggregated)
                match redis_cmd.clone().query_async::<Vec<String>>(c).await {
                    Ok(keys) => {
                        log::debug!("Redis cluster SCAN: got {} aggregated keys", keys.len());
                        // All keys returned at once, cursor is "0" (finished)
                        Ok(("0".to_string(), keys))
                    }
                    Err(e1) => {
                        // Fallback: try as tuple (some versions may return this)
                        match redis_cmd.clone().query_async::<(String, Vec<String>)>(c).await {
                            Ok(result) => {
                                log::debug!("Redis cluster SCAN: got cursor={} keys={}", result.0, result.1.len());
                                Ok(result)
                            }
                            Err(e2) => {
                                log::error!("Redis cluster SCAN failed: vec={}, tuple={}", e1, e2);
                                Err(format!("SCAN failed: {}", e1))
                            }
                        }
                    }
                }
            }
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
        match self.config.mode {
            RedisMode::Cluster => {
                return Err("Database selection not supported in cluster mode".to_string());
            }
            RedisMode::Standalone => {
                // Rebuild the connection bound to the target DB and swap it in.
                // The DB index is encoded in the URL, so the selection also
                // survives transparent reconnects of the multiplexed connection
                // (a plain SELECT would silently revert to db 0 on reconnect).
                let url = Self::build_connection_url_with_db(&self.config, db)?;
                let client =
                    Client::open(url).map_err(|e| format!("Failed to open client: {}", e))?;
                let conn = client
                    .get_multiplexed_async_connection()
                    .await
                    .map_err(|e| format!("Failed to select database {}: {}", db, e))?;
                *self.connection.write() = RedisConnection::Standalone(conn);
            }
            RedisMode::Sentinel => {
                // The resolved master address isn't persisted, so fall back to a
                // live SELECT on the current connection.
                let mut conn = self.get_connection_clone();
                if let RedisConnection::Standalone(c) = &mut conn {
                    redis::cmd("SELECT")
                        .arg(db)
                        .query_async::<()>(c)
                        .await
                        .map_err(|e| format!("SELECT failed: {}", e))?;
                }
            }
        }
        *self.current_db.lock().await = db;
        Ok(())
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

        let mut conn = self.get_connection_clone();
        let mut redis_cmd = redis::cmd(command);
        for arg in &args {
            redis_cmd.arg(arg);
        }

        let result: redis::Value = match &mut conn {
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

// ============ Cluster SCAN Methods ============
impl RedisDriver {
    /// Check if current connection is cluster mode
    pub fn is_cluster_mode(&self) -> bool {
        matches!(self.config.mode, RedisMode::Cluster)
    }

    /// Get list of master nodes in cluster
    /// Returns Vec<ClusterNodeInfo> with node_id, address (host:port), is_master
    pub async fn get_cluster_masters(&self) -> Result<Vec<ClusterNodeInfo>, String> {
        if !self.is_cluster_mode() {
            return Err("Not in cluster mode".to_string());
        }

        // Execute CLUSTER NODES command
        let nodes_output: String = self.execute_raw("CLUSTER", &["NODES"]).await?;

        let mut masters = Vec::new();
        for line in nodes_output.lines() {
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() < 3 {
                continue;
            }

            let node_id = parts[0].to_string();
            let address_part = parts[1]; // format: host:port@cport or host:port
            let flags = parts[2];

            // Extract host:port (remove @cport if present)
            let address = if let Some(at_pos) = address_part.find('@') {
                address_part[..at_pos].to_string()
            } else {
                address_part.to_string()
            };

            // Check if this is a master node
            let is_master = flags.contains("master") && !flags.contains("fail");

            if is_master {
                masters.push(ClusterNodeInfo {
                    node_id,
                    address,
                    is_master: true,
                });
            }
        }

        // CLUSTER NODES ordering is not stable across calls; sort by the stable
        // node_id so the composite SCAN cursor's node_index maps to the same node
        // on every page.
        masters.sort_by(|a, b| a.node_id.cmp(&b.node_id));

        log::debug!("Cluster masters found: {:?}", masters.iter().map(|n| &n.address).collect::<Vec<_>>());
        Ok(masters)
    }

    /// Create a direct connection to a specific node (for SCAN)
    async fn connect_to_node(&self, address: &str) -> Result<MultiplexedConnection, String> {
        let scheme = if self.config.tls.as_ref().map(|t| t.enabled).unwrap_or(false) {
            "rediss"
        } else {
            "redis"
        };

        let url = if let Some(password) = &self.config.password {
            format!("{}://:{}@{}", scheme, urlencoding::encode(password), address)
        } else {
            format!("{}://{}", scheme, address)
        };

        let client = Client::open(url)
            .map_err(|e| format!("Failed to create client for node {}: {}", address, e))?;

        client
            .get_multiplexed_async_connection()
            .await
            .map_err(|e| format!("Failed to connect to node {}: {}", address, e))
    }

    /// Scan keys on a single cluster node
    /// Returns (next_cursor, keys) - cursor is "0" when this node is finished
    pub async fn scan_single_node(
        &self,
        address: &str,
        cursor: &str,
        pattern: Option<&str>,
        count: Option<i64>,
    ) -> Result<(String, Vec<String>), String> {
        let mut conn = self.connect_to_node(address).await?;

        let mut cmd = redis::cmd("SCAN");
        cmd.arg(cursor);

        if let Some(p) = pattern {
            cmd.arg("MATCH").arg(p);
        }

        if let Some(c) = count {
            cmd.arg("COUNT").arg(c);
        }

        let result: (String, Vec<String>) = cmd
            .query_async(&mut conn)
            .await
            .map_err(|e| format!("SCAN failed on node {}: {}", address, e))?;

        log::debug!(
            "Scanned node {}: cursor={} -> {} keys",
            address,
            cursor,
            result.1.len()
        );

        Ok(result)
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
