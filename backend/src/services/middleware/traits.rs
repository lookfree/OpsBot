//! Middleware driver trait definitions
//!
//! Defines the interface for middleware drivers using the strategy pattern.
//! - MessageQueueDriver: For message queue systems (Kafka, RabbitMQ, etc.)
//! - CacheDriver: For cache/KV store systems (Redis, Memcached, etc.)
//! - SearchEngineDriver: For search engines (Elasticsearch, OpenSearch, etc.)

use async_trait::async_trait;

#[cfg(feature = "elasticsearch")]
use crate::models::{
    EsBulkOperation, EsBulkResponse, EsClusterHealth, EsClusterStats, EsConnectionInfo,
    EsCreateDocRequest, EsCreateIndexRequest, EsDocResponse, EsDocument, EsIndexStats,
    EsIndexSummary, EsNodeInfo, EsSearchRequest, EsSearchResponse, EsShardInfo,
    EsSqlResponse, EsUpdateDocRequest,
};

#[cfg(feature = "kafka")]
use crate::models::{
    ClusterInfo, ConsumerGroupInfo, ConsumerGroupListItem, ConsumerGroupOffset,
    KafkaMessage, ProduceResult, TopicConfig, TopicInfo, TopicListItem,
};

#[cfg(feature = "redis")]
use crate::models::{
    RedisCommandResult, RedisDatabaseInfo, RedisInfo,
    RedisScanRequest, RedisScanResponse, RedisSetRequest, RedisValue,
};

/// Message queue driver trait - defines the interface for all MQ implementations
#[cfg(feature = "kafka")]
#[async_trait]
pub trait MessageQueueDriver: Send + Sync {
    // ============ Connection & Cluster ============

    /// Test the connection
    async fn test_connection(&self) -> Result<(), String>;

    /// Get cluster information
    async fn get_cluster_info(&self) -> Result<ClusterInfo, String>;

    // ============ Topic Operations ============

    /// List all topics
    async fn list_topics(&self) -> Result<Vec<TopicListItem>, String>;

    /// Get topic details
    async fn get_topic(&self, topic: &str) -> Result<TopicInfo, String>;

    /// Create a new topic
    async fn create_topic(
        &self,
        name: &str,
        partitions: i32,
        replication_factor: i16,
        configs: Option<std::collections::HashMap<String, String>>,
    ) -> Result<(), String>;

    /// Delete a topic
    async fn delete_topic(&self, topic: &str) -> Result<(), String>;

    /// Get topic configuration
    async fn get_topic_config(&self, topic: &str) -> Result<Vec<TopicConfig>, String>;

    /// Update topic configuration
    async fn update_topic_config(
        &self,
        topic: &str,
        configs: std::collections::HashMap<String, String>,
    ) -> Result<(), String>;

    // ============ Consumer Group Operations ============

    /// List all consumer groups
    async fn list_consumer_groups(&self) -> Result<Vec<ConsumerGroupListItem>, String>;

    /// Get consumer group details
    async fn get_consumer_group(&self, group_id: &str) -> Result<ConsumerGroupInfo, String>;

    /// Get consumer group offsets
    async fn get_consumer_group_offsets(
        &self,
        group_id: &str,
    ) -> Result<Vec<ConsumerGroupOffset>, String>;

    /// Delete a consumer group
    async fn delete_consumer_group(&self, group_id: &str) -> Result<(), String>;

    /// Reset consumer group offsets
    /// reset_type can be: "earliest", "latest", or a timestamp/offset value as string
    async fn reset_consumer_group_offsets(
        &self,
        group_id: &str,
        topic: &str,
        reset_type: &str,
    ) -> Result<(), String>;

    // ============ Message Operations ============

    /// Fetch messages from a topic partition
    async fn fetch_messages(
        &self,
        topic: &str,
        partition: i32,
        offset: i64,
        limit: i32,
    ) -> Result<Vec<KafkaMessage>, String>;

    /// Produce a message to a topic
    async fn produce_message(
        &self,
        topic: &str,
        partition: Option<i32>,
        key: Option<&str>,
        value: &str,
        headers: Option<Vec<(String, String)>>,
    ) -> Result<ProduceResult, String>;

    // ============ Lifecycle ============

    /// Close the connection
    async fn close(&self);
}

// ============ Cache Driver Trait ============

/// Cache driver trait - defines the interface for all cache/KV store implementations
#[cfg(feature = "redis")]
#[async_trait]
pub trait CacheDriver: Send + Sync {
    // ============ Connection & Lifecycle ============

    /// Test the connection and return basic info
    async fn test_connection(&self) -> Result<(), String>;

    /// Close the connection
    async fn close(&self);

    // ============ Server Information ============

    /// Get server information
    async fn get_info(&self, section: Option<&str>) -> Result<RedisInfo, String>;

    /// Get database list with key counts
    async fn get_databases(&self) -> Result<Vec<RedisDatabaseInfo>, String>;

    /// Select a database (for standalone/sentinel mode)
    async fn select_database(&self, db: u8) -> Result<(), String>;

    // ============ Key Operations ============

    /// Scan keys with cursor-based pagination
    async fn scan_keys(&self, request: RedisScanRequest) -> Result<RedisScanResponse, String>;

    /// Get total key count
    async fn get_key_count(&self) -> Result<i64, String>;

    /// Get key type
    async fn get_key_type(&self, key: &str) -> Result<String, String>;

    /// Get key TTL (-1: permanent, -2: not exists)
    async fn get_key_ttl(&self, key: &str) -> Result<i64, String>;

    /// Set key TTL
    async fn set_key_ttl(&self, key: &str, ttl: i64) -> Result<(), String>;

    /// Delete keys
    async fn delete_keys(&self, keys: Vec<String>) -> Result<i64, String>;

    /// Rename a key
    async fn rename_key(&self, old_key: &str, new_key: &str) -> Result<(), String>;

    /// Check if key exists
    async fn key_exists(&self, key: &str) -> Result<bool, String>;

    // ============ Data Operations ============

    /// Get value (auto-detect type)
    async fn get_value(&self, key: &str) -> Result<RedisValue, String>;

    /// Set value
    async fn set_value(&self, request: RedisSetRequest) -> Result<(), String>;

    // ============ Command Execution ============

    /// Execute arbitrary command
    async fn execute_command(
        &self,
        command: &str,
        args: Vec<String>,
    ) -> Result<RedisCommandResult, String>;

    // ============ Management Operations ============

    /// Flush current database
    async fn flush_db(&self, async_mode: bool) -> Result<(), String>;

    /// Flush all databases
    async fn flush_all(&self, async_mode: bool) -> Result<(), String>;
}

// ============ Search Engine Driver Trait ============

/// Search engine driver trait - defines the interface for all search engine implementations
#[cfg(feature = "elasticsearch")]
#[async_trait]
pub trait SearchEngineDriver: Send + Sync {
    // ============ Connection & Lifecycle ============

    /// Test the connection and return connection info
    async fn test_connection(&self) -> Result<EsConnectionInfo, String>;

    /// Close the connection
    async fn close(&self);

    // ============ Cluster Operations ============

    /// Get cluster health status
    async fn get_cluster_health(&self) -> Result<EsClusterHealth, String>;

    /// Get cluster statistics
    async fn get_cluster_stats(&self) -> Result<EsClusterStats, String>;

    /// Get nodes information
    async fn get_nodes(&self) -> Result<Vec<EsNodeInfo>, String>;

    /// Get shards information
    async fn get_shards(&self) -> Result<Vec<EsShardInfo>, String>;

    // ============ Index Operations ============

    /// Get all indices (optionally filtered by pattern)
    async fn get_indices(&self, pattern: Option<&str>) -> Result<Vec<EsIndexSummary>, String>;

    /// Get index mapping
    async fn get_index_mapping(&self, index: &str) -> Result<serde_json::Value, String>;

    /// Get index settings
    async fn get_index_settings(&self, index: &str) -> Result<serde_json::Value, String>;

    /// Get index statistics
    async fn get_index_stats(&self, index: &str) -> Result<EsIndexStats, String>;

    /// Create a new index
    async fn create_index(&self, request: EsCreateIndexRequest) -> Result<(), String>;

    /// Delete an index
    async fn delete_index(&self, index: &str) -> Result<(), String>;

    /// Open an index
    async fn open_index(&self, index: &str) -> Result<(), String>;

    /// Close an index
    async fn close_index(&self, index: &str) -> Result<(), String>;

    /// Refresh an index
    async fn refresh_index(&self, index: &str) -> Result<(), String>;

    /// Update index mapping (add new fields only)
    /// Note: ES doesn't support modifying existing field mappings
    async fn update_index_mapping(
        &self,
        index: &str,
        mapping: serde_json::Value,
    ) -> Result<(), String>;

    /// Update index settings (dynamic settings only)
    /// Note: Some settings (like number_of_shards) cannot be changed after creation
    async fn update_index_settings(
        &self,
        index: &str,
        settings: serde_json::Value,
    ) -> Result<(), String>;

    // ============ Document Operations ============

    /// Get a document by ID
    async fn get_document(&self, index: &str, id: &str) -> Result<EsDocument, String>;

    /// Create a new document
    async fn create_document(&self, request: EsCreateDocRequest) -> Result<EsDocResponse, String>;

    /// Update an existing document
    async fn update_document(&self, request: EsUpdateDocRequest) -> Result<EsDocResponse, String>;

    /// Delete a document by ID
    async fn delete_document(&self, index: &str, id: &str) -> Result<(), String>;

    /// Execute bulk operations
    async fn bulk_operation(
        &self,
        operations: Vec<EsBulkOperation>,
    ) -> Result<EsBulkResponse, String>;

    // ============ Search Operations ============

    /// Execute a search query
    async fn search(&self, request: EsSearchRequest) -> Result<EsSearchResponse, String>;

    /// Execute a SQL query (ES 6.3+)
    async fn sql_query(&self, query: &str) -> Result<EsSqlResponse, String>;
}
