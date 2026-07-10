//! Elasticsearch models for search engine management
//!
//! This module contains data structures for Elasticsearch operations.

use serde::{Deserialize, Serialize};

// ============ Authentication Types ============

/// Authentication type for Elasticsearch connections
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub enum EsAuthType {
    #[default]
    None,
    Basic,
    ApiKey,
    Cloud,
}

/// TLS configuration for Elasticsearch
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EsTlsConfig {
    #[serde(default)]
    pub enabled: bool,
    /// Whether to reject certificates that fail verification.
    /// Accepts the frontend's `verifyCertificate` field (same semantics:
    /// verify the server cert == reject unauthorized certs).
    #[serde(default, alias = "verifyCertificate")]
    pub reject_unauthorized: bool,
    #[serde(default)]
    pub ca: Option<String>,
}

// ============ Connection Types ============

/// ES version for compatibility mode
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub enum EsVersionHint {
    #[default]
    Auto,
    #[serde(rename = "5")]
    V5,
    #[serde(rename = "6")]
    V6,
    #[serde(rename = "7")]
    V7,
    #[serde(rename = "8")]
    V8,
    #[serde(rename = "9")]
    V9,
}

/// Elasticsearch connection request
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EsConnectRequest {
    pub connection_id: String,
    pub nodes: Vec<String>,
    /// ES version hint for compatibility mode
    #[serde(default)]
    pub version: EsVersionHint,
    pub auth_type: EsAuthType,
    pub username: Option<String>,
    pub password: Option<String>,
    pub api_key: Option<String>,
    pub cloud_id: Option<String>,
    pub tls: Option<EsTlsConfig>,
    pub request_timeout: Option<u64>,
    /// Whether to use system proxy (default: false for direct connection)
    #[serde(default)]
    pub use_proxy: bool,
}

/// Elasticsearch connection info (returned after successful connection)
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EsConnectionInfo {
    pub connection_id: String,
    pub cluster_name: String,
    pub cluster_uuid: String,
    pub version: String,
    pub connected_at: String,
}

// ============ Cluster Types ============

/// Cluster health status
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EsClusterHealth {
    pub cluster_name: String,
    pub status: String,
    pub number_of_nodes: i32,
    pub number_of_data_nodes: i32,
    pub active_primary_shards: i32,
    pub active_shards: i32,
    pub relocating_shards: i32,
    pub initializing_shards: i32,
    pub unassigned_shards: i32,
    pub delayed_unassigned_shards: i32,
    pub number_of_pending_tasks: i32,
    pub number_of_in_flight_fetch: i32,
    pub task_max_waiting_in_queue_millis: i64,
    pub active_shards_percent_as_number: f64,
}

/// Cluster statistics
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EsClusterStats {
    pub cluster_name: String,
    pub cluster_uuid: String,
    pub status: String,
    pub indices_count: i32,
    pub total_shards: i32,
    pub docs_count: i64,
    pub store_size_bytes: i64,
    pub store_size: String,
}

/// Node information
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EsNodeInfo {
    pub id: String,
    pub name: String,
    pub ip: String,
    pub roles: Vec<String>,
    pub version: String,
    pub heap_percent: i32,
    pub heap_current: String,
    pub heap_max: String,
    pub disk_percent: Option<i32>,
    pub disk_used: Option<String>,
    pub disk_total: Option<String>,
    pub cpu_percent: Option<i32>,
    pub load_1m: Option<f64>,
    pub master: bool,
}

/// Shard information
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EsShardInfo {
    pub index: String,
    pub shard: i32,
    pub primary: bool,
    pub state: String,
    pub docs: Option<i64>,
    pub size: Option<String>,
    pub node: Option<String>,
    pub unassigned_reason: Option<String>,
}

// ============ Index Types ============

/// Index summary (lightweight for listing)
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EsIndexSummary {
    pub name: String,
    pub health: String,
    pub status: String,
    pub uuid: String,
    pub docs_count: i64,
    pub docs_deleted: i64,
    pub store_size: String,
    pub primary_shards: i32,
    pub replica_shards: i32,
}

/// Index statistics
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EsIndexStats {
    pub name: String,
    pub docs_count: i64,
    pub docs_deleted: i64,
    pub store_size_bytes: i64,
    pub store_size: String,
    pub primary_shards: i32,
    pub replica_shards: i32,
    pub indexing_total: i64,
    pub search_query_total: i64,
}

/// Create index request
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EsCreateIndexRequest {
    pub name: String,
    pub settings: Option<serde_json::Value>,
    pub mappings: Option<serde_json::Value>,
}

// ============ Document Types ============

/// Document representation
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EsDocument {
    pub index: String,
    pub id: String,
    pub version: i64,
    pub source: serde_json::Value,
}

/// Create document request
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EsCreateDocRequest {
    pub index: String,
    pub id: Option<String>,
    pub source: serde_json::Value,
}

/// Update document request
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EsUpdateDocRequest {
    pub index: String,
    pub id: String,
    pub doc: serde_json::Value,
}

/// Document operation response
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EsDocResponse {
    pub index: String,
    pub id: String,
    pub version: i64,
    pub result: String,
}

/// Bulk operation types
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum EsBulkOperationType {
    Index,
    Create,
    Update,
    Delete,
}

/// Bulk operation item
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EsBulkOperation {
    pub operation: EsBulkOperationType,
    pub index: String,
    pub id: Option<String>,
    pub source: Option<serde_json::Value>,
}

/// Bulk operation response
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EsBulkResponse {
    pub took: i64,
    pub errors: bool,
    pub items: Vec<EsBulkItemResponse>,
}

/// Bulk item response
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EsBulkItemResponse {
    pub operation: String,
    pub index: String,
    pub id: String,
    pub status: i32,
    pub error: Option<String>,
}

// ============ Search Types ============

/// Search request
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EsSearchRequest {
    pub index: String,
    pub query: serde_json::Value,
    pub from: Option<i64>,
    pub size: Option<i64>,
    pub sort: Option<Vec<serde_json::Value>>,
    pub source: Option<serde_json::Value>,
}

/// Search hit
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EsSearchHit {
    pub index: String,
    pub id: String,
    pub score: Option<f64>,
    pub source: serde_json::Value,
}

/// Search response
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EsSearchResponse {
    pub took: i64,
    pub timed_out: bool,
    pub total: i64,
    pub max_score: Option<f64>,
    pub hits: Vec<EsSearchHit>,
}

/// SQL query response
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EsSqlResponse {
    pub columns: Vec<EsSqlColumn>,
    pub rows: Vec<Vec<serde_json::Value>>,
}

/// SQL column info
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EsSqlColumn {
    pub name: String,
    pub column_type: String,
}
