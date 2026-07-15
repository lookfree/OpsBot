//! Redis models for cache/KV store management
//!
//! This module contains data structures for Redis connection and operations.

use serde::{Deserialize, Serialize};

// ============ Connection Models ============

/// Redis deployment mode
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "lowercase")]
pub enum RedisMode {
    #[default]
    Standalone,
    Cluster,
    Sentinel,
}

/// Redis TLS configuration
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct RedisTlsConfig {
    pub enabled: bool,
    pub reject_unauthorized: bool,
    pub ca_path: Option<String>,
}

/// Redis connection configuration
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RedisConnectRequest {
    pub connection_id: String,
    pub mode: RedisMode,
    // Standalone mode
    pub host: Option<String>,
    pub port: Option<u16>,
    // Cluster mode
    pub nodes: Option<Vec<String>>,
    // Sentinel mode
    pub sentinels: Option<Vec<String>>,
    pub sentinel_password: Option<String>,
    pub master_name: Option<String>,
    // Common config
    pub password: Option<String>,
    pub db: Option<u8>,
    pub tls: Option<RedisTlsConfig>,
    pub connect_timeout_ms: Option<u64>,
}

/// Redis connection info returned after successful connection
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RedisConnectionInfo {
    pub connection_id: String,
    pub mode: RedisMode,
    pub version: String,
    pub connected_clients: i32,
    pub used_memory: String,
    pub total_keys: i64,
    pub connected_at: String,
}

// ============ Server Info Models ============

/// Redis server information
#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct RedisServerInfo {
    pub redis_version: String,
    pub redis_mode: String,
    pub os: String,
    pub uptime_in_seconds: i64,
    pub uptime_in_days: i64,
}

/// Redis clients information
#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct RedisClientsInfo {
    pub connected_clients: i32,
    pub blocked_clients: i32,
    pub max_clients: i32,
}

/// Redis memory information
#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct RedisMemoryInfo {
    pub used_memory: i64,
    pub used_memory_human: String,
    pub used_memory_peak: i64,
    pub used_memory_peak_human: String,
    pub maxmemory: i64,
    pub maxmemory_human: String,
    pub mem_fragmentation_ratio: f64,
}

/// Redis stats information
#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct RedisStatsInfo {
    pub total_connections_received: i64,
    pub total_commands_processed: i64,
    pub instantaneous_ops_per_sec: i64,
    pub keyspace_hits: i64,
    pub keyspace_misses: i64,
    pub hit_rate: f64,
}

/// Redis keyspace information (per database)
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RedisKeyspaceInfo {
    pub db: u8,
    pub keys: i64,
    pub expires: i64,
    pub avg_ttl: i64,
}

/// Complete Redis INFO response
#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct RedisInfo {
    pub server: RedisServerInfo,
    pub clients: RedisClientsInfo,
    pub memory: RedisMemoryInfo,
    pub stats: RedisStatsInfo,
    pub keyspace: Vec<RedisKeyspaceInfo>,
}

/// Redis database info for database selector
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RedisDatabaseInfo {
    pub db: u8,
    pub keys: i64,
    pub expires: i64,
}

// ============ Key Models ============

/// Key scan request
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RedisScanRequest {
    pub cursor: String,
    pub pattern: Option<String>,
    pub count: Option<i64>,
    pub key_type: Option<String>,
}

/// Key information
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RedisKeyInfo {
    pub key: String,
    pub key_type: String,
    pub ttl: i64, // -1: permanent, -2: not exists, >0: remaining seconds
    pub size: Option<i64>,
}

/// Key scan response
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RedisScanResponse {
    pub cursor: String,
    pub keys: Vec<RedisKeyInfo>,
    pub finished: bool,
}

// ============ Cluster Scan Models ============

/// Cluster node information (for SCAN)
#[derive(Debug, Clone)]
pub struct ClusterNodeInfo {
    pub node_id: String,
    pub address: String, // host:port
    pub is_master: bool,
}

/// Cluster SCAN state (composite cursor)
#[derive(Debug, Clone)]
pub struct ClusterScanState {
    pub node_index: usize,   // Current node index being scanned
    pub node_cursor: String, // Cursor within current node
    pub total_nodes: usize,  // Total number of master nodes
}

impl ClusterScanState {
    /// Parse composite cursor
    /// Format: "nodeIndex:nodeCursor" (e.g., "0:1234", "1:0")
    /// Initial cursor "0" is treated as "0:0"
    pub fn from_cursor(cursor: &str) -> Result<Self, String> {
        if cursor == "0" {
            return Ok(Self {
                node_index: 0,
                node_cursor: "0".to_string(),
                total_nodes: 0, // Will be filled when scanning
            });
        }

        let parts: Vec<&str> = cursor.split(':').collect();
        if parts.len() != 2 {
            return Err(format!("Invalid cluster cursor format: {}", cursor));
        }

        Ok(Self {
            node_index: parts[0]
                .parse()
                .map_err(|_| format!("Invalid node index: {}", parts[0]))?,
            node_cursor: parts[1].to_string(),
            total_nodes: 0,
        })
    }

    /// Generate composite cursor
    pub fn to_cursor(&self) -> String {
        format!("{}:{}", self.node_index, self.node_cursor)
    }

    /// Check if scan is finished (all nodes scanned)
    pub fn is_finished(&self) -> bool {
        self.node_index >= self.total_nodes
    }

    /// Move to next node
    pub fn next_node(&mut self) {
        self.node_index += 1;
        self.node_cursor = "0".to_string();
    }
}

// ============ Value Models ============

/// Redis stream entry
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RedisStreamEntry {
    pub id: String,
    pub fields: Vec<(String, String)>,
}

/// Redis value (supports all types)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "data")]
pub enum RedisValue {
    String(String),
    List(Vec<String>),
    Set(Vec<String>),
    Hash(Vec<(String, String)>),
    ZSet(Vec<(String, f64)>), // (member, score)
    Stream(Vec<RedisStreamEntry>),
    /// Base64-encoded raw bytes for values that are not valid UTF-8 (read-only).
    Binary(String),
    None,
}

/// Set value request
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RedisSetRequest {
    pub key: String,
    pub value: RedisValue,
    pub ttl: Option<i64>, // seconds, None means permanent
    #[serde(default)]
    pub nx: bool, // only set if key doesn't exist
    #[serde(default)]
    pub xx: bool, // only set if key exists
}

// ============ Command Models ============

/// Command execution result
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RedisCommandResult {
    pub result_type: String, // string | array | integer | null | error
    pub value: serde_json::Value,
    pub execution_time_ms: i64,
}

/// Execute command request
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RedisExecuteRequest {
    pub connection_id: String,
    pub command: String,
    pub args: Vec<String>,
}
