//! Middleware service module
//!
//! Provides message queue, cache, and search engine connection management using the strategy pattern.
//! Currently supports:
//! - Kafka (message queue)
//! - Redis (cache/KV store)
//! - Elasticsearch (search engine)

#[cfg(feature = "elasticsearch")]
mod elasticsearch;
#[cfg(feature = "kafka")]
mod kafka;
#[cfg(feature = "redis")]
mod redis;
#[cfg(feature = "redis")]
mod redis_ops;
#[cfg(feature = "redis")]
mod redis_session;
#[cfg(feature = "kafka")]
mod session;
mod traits;

#[cfg(feature = "elasticsearch")]
pub use elasticsearch::{ElasticsearchDriver, ElasticsearchSession};
#[cfg(feature = "kafka")]
pub use session::MiddlewareSession;
#[cfg(feature = "kafka")]
pub use traits::MessageQueueDriver;
#[cfg(feature = "redis")]
pub use redis::RedisDriver;
#[cfg(feature = "redis")]
pub use redis_session::RedisSession;
#[cfg(feature = "redis")]
pub use traits::CacheDriver;
#[cfg(feature = "elasticsearch")]
pub use traits::SearchEngineDriver;

use std::collections::HashMap;
use std::sync::Arc;

use parking_lot::RwLock;

#[cfg(feature = "elasticsearch")]
use crate::models::{
    EsBulkOperation, EsBulkResponse, EsClusterHealth, EsClusterStats, EsConnectRequest,
    EsConnectionInfo, EsCreateDocRequest, EsCreateIndexRequest, EsDocResponse, EsDocument,
    EsIndexStats, EsIndexSummary, EsNodeInfo, EsSearchRequest, EsSearchResponse, EsShardInfo,
    EsSqlResponse, EsUpdateDocRequest,
};

#[cfg(feature = "kafka")]
use crate::models::{
    ClusterInfo, ConsumerGroupInfo, ConsumerGroupListItem, ConsumerGroupOffset,
    KafkaConnectRequest, KafkaConnectionInfo, KafkaMessage, MiddlewareType,
    ProduceResult, TopicConfig, TopicInfo, TopicListItem,
};

#[cfg(feature = "kafka")]
use kafka::KafkaDriver;

/// Middleware service managing all message queue, cache, and search engine connections
pub struct MiddlewareService {
    #[cfg(feature = "elasticsearch")]
    es_sessions: RwLock<HashMap<String, Arc<ElasticsearchSession>>>,
    #[cfg(feature = "kafka")]
    kafka_sessions: RwLock<HashMap<String, Arc<MiddlewareSession>>>,
    #[cfg(feature = "redis")]
    redis_sessions: RwLock<HashMap<String, Arc<RedisSession>>>,
}

impl MiddlewareService {
    pub fn new() -> Self {
        Self {
            #[cfg(feature = "elasticsearch")]
            es_sessions: RwLock::new(HashMap::new()),
            #[cfg(feature = "kafka")]
            kafka_sessions: RwLock::new(HashMap::new()),
            #[cfg(feature = "redis")]
            redis_sessions: RwLock::new(HashMap::new()),
        }
    }

    // ============ Kafka Connection ============

    /// Connect to Kafka
    #[cfg(feature = "kafka")]
    pub async fn connect_kafka(
        &self,
        request: KafkaConnectRequest,
    ) -> Result<KafkaConnectionInfo, String> {
        let driver = KafkaDriver::connect(
            request.brokers.clone(),
            request.security_protocol.clone(),
            request.sasl_mechanism.clone(),
            request.username.clone(),
            request.password.clone(),
        )
        .await?;

        let cluster_id = driver.get_cluster_info().await.ok().map(|c| c.cluster_id);

        let session = Arc::new(MiddlewareSession::new(
            request.connection_id.clone(),
            MiddlewareType::Kafka,
            request.brokers.clone(),
            Arc::new(driver),
        ));

        self.kafka_sessions
            .write()
            .insert(request.connection_id.clone(), session.clone());

        Ok(KafkaConnectionInfo {
            connection_id: request.connection_id,
            brokers: request.brokers,
            connected_at: session.connected_at.to_rfc3339(),
            cluster_id,
        })
    }

    /// Disconnect from Kafka
    #[cfg(feature = "kafka")]
    pub async fn disconnect_kafka(&self, connection_id: &str) -> Result<(), String> {
        let session = self.kafka_sessions.write().remove(connection_id);
        if let Some(session) = session {
            session.driver.close().await;
            Ok(())
        } else {
            Err("Kafka connection not found".to_string())
        }
    }

    /// Test Kafka connection
    #[cfg(feature = "kafka")]
    pub async fn test_kafka_connection(
        &self,
        request: KafkaConnectRequest,
    ) -> Result<(), String> {
        let driver = KafkaDriver::connect(
            request.brokers,
            request.security_protocol,
            request.sasl_mechanism,
            request.username,
            request.password,
        )
        .await?;

        driver.test_connection().await?;
        driver.close().await;
        Ok(())
    }

    /// Check if Kafka connection exists
    #[cfg(feature = "kafka")]
    pub fn is_kafka_connected(&self, connection_id: &str) -> bool {
        self.kafka_sessions.read().contains_key(connection_id)
    }

    // ============ Kafka Cluster Operations ============

    /// Get cluster info
    #[cfg(feature = "kafka")]
    pub async fn kafka_get_cluster_info(
        &self,
        connection_id: &str,
    ) -> Result<ClusterInfo, String> {
        let session = self.get_kafka_session(connection_id)?;
        session.driver.get_cluster_info().await
    }

    // ============ Kafka Topic Operations ============

    /// List all topics
    #[cfg(feature = "kafka")]
    pub async fn kafka_list_topics(
        &self,
        connection_id: &str,
    ) -> Result<Vec<TopicListItem>, String> {
        let session = self.get_kafka_session(connection_id)?;
        session.driver.list_topics().await
    }

    /// Get topic details
    #[cfg(feature = "kafka")]
    pub async fn kafka_get_topic(
        &self,
        connection_id: &str,
        topic: &str,
    ) -> Result<TopicInfo, String> {
        let session = self.get_kafka_session(connection_id)?;
        session.driver.get_topic(topic).await
    }

    /// Create topic
    #[cfg(feature = "kafka")]
    pub async fn kafka_create_topic(
        &self,
        connection_id: &str,
        name: &str,
        partitions: i32,
        replication_factor: i16,
        configs: Option<HashMap<String, String>>,
    ) -> Result<(), String> {
        let session = self.get_kafka_session(connection_id)?;
        session
            .driver
            .create_topic(name, partitions, replication_factor, configs)
            .await
    }

    /// Delete topic
    #[cfg(feature = "kafka")]
    pub async fn kafka_delete_topic(
        &self,
        connection_id: &str,
        topic: &str,
    ) -> Result<(), String> {
        let session = self.get_kafka_session(connection_id)?;
        session.driver.delete_topic(topic).await
    }

    /// Get topic config
    #[cfg(feature = "kafka")]
    pub async fn kafka_get_topic_config(
        &self,
        connection_id: &str,
        topic: &str,
    ) -> Result<Vec<TopicConfig>, String> {
        let session = self.get_kafka_session(connection_id)?;
        session.driver.get_topic_config(topic).await
    }

    /// Update topic config
    #[cfg(feature = "kafka")]
    pub async fn kafka_update_topic_config(
        &self,
        connection_id: &str,
        topic: &str,
        configs: HashMap<String, String>,
    ) -> Result<(), String> {
        let session = self.get_kafka_session(connection_id)?;
        session.driver.update_topic_config(topic, configs).await
    }

    // ============ Kafka Consumer Group Operations ============

    /// List consumer groups
    #[cfg(feature = "kafka")]
    pub async fn kafka_list_consumer_groups(
        &self,
        connection_id: &str,
    ) -> Result<Vec<ConsumerGroupListItem>, String> {
        let session = self.get_kafka_session(connection_id)?;
        session.driver.list_consumer_groups().await
    }

    /// Get consumer group details
    #[cfg(feature = "kafka")]
    pub async fn kafka_get_consumer_group(
        &self,
        connection_id: &str,
        group_id: &str,
    ) -> Result<ConsumerGroupInfo, String> {
        let session = self.get_kafka_session(connection_id)?;
        session.driver.get_consumer_group(group_id).await
    }

    /// Get consumer group offsets
    #[cfg(feature = "kafka")]
    pub async fn kafka_get_consumer_group_offsets(
        &self,
        connection_id: &str,
        group_id: &str,
    ) -> Result<Vec<ConsumerGroupOffset>, String> {
        let session = self.get_kafka_session(connection_id)?;
        session.driver.get_consumer_group_offsets(group_id).await
    }

    /// Delete consumer group
    #[cfg(feature = "kafka")]
    pub async fn kafka_delete_consumer_group(
        &self,
        connection_id: &str,
        group_id: &str,
    ) -> Result<(), String> {
        let session = self.get_kafka_session(connection_id)?;
        session.driver.delete_consumer_group(group_id).await
    }

    /// Reset consumer group offsets
    #[cfg(feature = "kafka")]
    pub async fn kafka_reset_consumer_group_offsets(
        &self,
        connection_id: &str,
        group_id: &str,
        topic: &str,
        reset_type: &str,
    ) -> Result<(), String> {
        let session = self.get_kafka_session(connection_id)?;
        session
            .driver
            .reset_consumer_group_offsets(group_id, topic, reset_type)
            .await
    }

    // ============ Kafka Message Operations ============

    /// Fetch messages from topic
    #[cfg(feature = "kafka")]
    pub async fn kafka_fetch_messages(
        &self,
        connection_id: &str,
        topic: &str,
        partition: i32,
        offset: i64,
        limit: i32,
    ) -> Result<Vec<KafkaMessage>, String> {
        let session = self.get_kafka_session(connection_id)?;
        session
            .driver
            .fetch_messages(topic, partition, offset, limit)
            .await
    }

    /// Produce message to topic
    #[cfg(feature = "kafka")]
    pub async fn kafka_produce_message(
        &self,
        connection_id: &str,
        topic: &str,
        partition: Option<i32>,
        key: Option<&str>,
        value: &str,
        headers: Option<Vec<(String, String)>>,
    ) -> Result<ProduceResult, String> {
        let session = self.get_kafka_session(connection_id)?;
        session
            .driver
            .produce_message(topic, partition, key, value, headers)
            .await
    }

    /// Get Kafka session by connection ID
    #[cfg(feature = "kafka")]
    fn get_kafka_session(&self, connection_id: &str) -> Result<Arc<MiddlewareSession>, String> {
        self.kafka_sessions
            .read()
            .get(connection_id)
            .cloned()
            .ok_or_else(|| "Kafka connection not found".to_string())
    }

    // ============ Elasticsearch Connection ============

    /// Connect to Elasticsearch
    #[cfg(feature = "elasticsearch")]
    pub async fn connect_elasticsearch(
        &self,
        request: EsConnectRequest,
    ) -> Result<EsConnectionInfo, String> {
        let driver = ElasticsearchDriver::connect(request.clone()).await?;
        let mut info = driver.test_connection().await?;
        info.connection_id = request.connection_id.clone();

        let session = Arc::new(ElasticsearchSession::new(
            request.connection_id.clone(),
            Arc::new(driver),
        ));

        self.es_sessions
            .write()
            .insert(request.connection_id, session);

        Ok(info)
    }

    /// Disconnect from Elasticsearch
    #[cfg(feature = "elasticsearch")]
    pub async fn disconnect_elasticsearch(&self, connection_id: &str) -> Result<(), String> {
        let session = self.es_sessions.write().remove(connection_id);
        if let Some(session) = session {
            session.driver.close().await;
            Ok(())
        } else {
            Err("Elasticsearch connection not found".to_string())
        }
    }

    /// Test Elasticsearch connection
    #[cfg(feature = "elasticsearch")]
    pub async fn test_elasticsearch_connection(
        &self,
        request: EsConnectRequest,
    ) -> Result<EsConnectionInfo, String> {
        let driver = ElasticsearchDriver::connect(request.clone()).await?;
        let mut info = driver.test_connection().await?;
        info.connection_id = request.connection_id;
        driver.close().await;
        Ok(info)
    }

    /// Check if Elasticsearch connection exists
    #[cfg(feature = "elasticsearch")]
    pub fn is_elasticsearch_connected(&self, connection_id: &str) -> bool {
        self.es_sessions.read().contains_key(connection_id)
    }

    // ============ Elasticsearch Cluster Operations ============

    /// Get cluster health
    #[cfg(feature = "elasticsearch")]
    pub async fn es_get_cluster_health(
        &self,
        connection_id: &str,
    ) -> Result<EsClusterHealth, String> {
        let session = self.get_es_session(connection_id)?;
        session.driver.get_cluster_health().await
    }

    /// Get cluster stats
    #[cfg(feature = "elasticsearch")]
    pub async fn es_get_cluster_stats(
        &self,
        connection_id: &str,
    ) -> Result<EsClusterStats, String> {
        let session = self.get_es_session(connection_id)?;
        session.driver.get_cluster_stats().await
    }

    /// Get nodes
    #[cfg(feature = "elasticsearch")]
    pub async fn es_get_nodes(&self, connection_id: &str) -> Result<Vec<EsNodeInfo>, String> {
        let session = self.get_es_session(connection_id)?;
        session.driver.get_nodes().await
    }

    /// Get shards
    #[cfg(feature = "elasticsearch")]
    pub async fn es_get_shards(&self, connection_id: &str) -> Result<Vec<EsShardInfo>, String> {
        let session = self.get_es_session(connection_id)?;
        session.driver.get_shards().await
    }

    // ============ Elasticsearch Index Operations ============

    /// Get indices
    #[cfg(feature = "elasticsearch")]
    pub async fn es_get_indices(
        &self,
        connection_id: &str,
        pattern: Option<String>,
    ) -> Result<Vec<EsIndexSummary>, String> {
        let session = self.get_es_session(connection_id)?;
        session.driver.get_indices(pattern.as_deref()).await
    }

    /// Get index mapping
    #[cfg(feature = "elasticsearch")]
    pub async fn es_get_index_mapping(
        &self,
        connection_id: &str,
        index_name: &str,
    ) -> Result<serde_json::Value, String> {
        let session = self.get_es_session(connection_id)?;
        session.driver.get_index_mapping(index_name).await
    }

    /// Get index settings
    #[cfg(feature = "elasticsearch")]
    pub async fn es_get_index_settings(
        &self,
        connection_id: &str,
        index_name: &str,
    ) -> Result<serde_json::Value, String> {
        let session = self.get_es_session(connection_id)?;
        session.driver.get_index_settings(index_name).await
    }

    /// Get index stats
    #[cfg(feature = "elasticsearch")]
    pub async fn es_get_index_stats(
        &self,
        connection_id: &str,
        index_name: &str,
    ) -> Result<EsIndexStats, String> {
        let session = self.get_es_session(connection_id)?;
        session.driver.get_index_stats(index_name).await
    }

    /// Create index
    #[cfg(feature = "elasticsearch")]
    pub async fn es_create_index(
        &self,
        connection_id: &str,
        request: EsCreateIndexRequest,
    ) -> Result<(), String> {
        let session = self.get_es_session(connection_id)?;
        session.driver.create_index(request).await
    }

    /// Delete index
    #[cfg(feature = "elasticsearch")]
    pub async fn es_delete_index(
        &self,
        connection_id: &str,
        index_name: &str,
    ) -> Result<(), String> {
        let session = self.get_es_session(connection_id)?;
        session.driver.delete_index(index_name).await
    }

    /// Open index
    #[cfg(feature = "elasticsearch")]
    pub async fn es_open_index(
        &self,
        connection_id: &str,
        index_name: &str,
    ) -> Result<(), String> {
        let session = self.get_es_session(connection_id)?;
        session.driver.open_index(index_name).await
    }

    /// Close index
    #[cfg(feature = "elasticsearch")]
    pub async fn es_close_index(
        &self,
        connection_id: &str,
        index_name: &str,
    ) -> Result<(), String> {
        let session = self.get_es_session(connection_id)?;
        session.driver.close_index(index_name).await
    }

    /// Refresh index
    #[cfg(feature = "elasticsearch")]
    pub async fn es_refresh_index(
        &self,
        connection_id: &str,
        index_name: &str,
    ) -> Result<(), String> {
        let session = self.get_es_session(connection_id)?;
        session.driver.refresh_index(index_name).await
    }

    /// Update index mapping (add new fields only)
    #[cfg(feature = "elasticsearch")]
    pub async fn es_update_index_mapping(
        &self,
        connection_id: &str,
        index_name: &str,
        mapping: serde_json::Value,
    ) -> Result<(), String> {
        let session = self.get_es_session(connection_id)?;
        session.driver.update_index_mapping(index_name, mapping).await
    }

    /// Update index settings (dynamic settings only)
    #[cfg(feature = "elasticsearch")]
    pub async fn es_update_index_settings(
        &self,
        connection_id: &str,
        index_name: &str,
        settings: serde_json::Value,
    ) -> Result<(), String> {
        let session = self.get_es_session(connection_id)?;
        session.driver.update_index_settings(index_name, settings).await
    }

    // ============ Elasticsearch Document Operations ============

    /// Get document
    #[cfg(feature = "elasticsearch")]
    pub async fn es_get_document(
        &self,
        connection_id: &str,
        index_name: &str,
        doc_id: &str,
    ) -> Result<EsDocument, String> {
        let session = self.get_es_session(connection_id)?;
        session.driver.get_document(index_name, doc_id).await
    }

    /// Create document
    #[cfg(feature = "elasticsearch")]
    pub async fn es_create_document(
        &self,
        connection_id: &str,
        request: EsCreateDocRequest,
    ) -> Result<EsDocResponse, String> {
        let session = self.get_es_session(connection_id)?;
        session.driver.create_document(request).await
    }

    /// Update document
    #[cfg(feature = "elasticsearch")]
    pub async fn es_update_document(
        &self,
        connection_id: &str,
        request: EsUpdateDocRequest,
    ) -> Result<EsDocResponse, String> {
        let session = self.get_es_session(connection_id)?;
        session.driver.update_document(request).await
    }

    /// Delete document
    #[cfg(feature = "elasticsearch")]
    pub async fn es_delete_document(
        &self,
        connection_id: &str,
        index_name: &str,
        doc_id: &str,
    ) -> Result<(), String> {
        let session = self.get_es_session(connection_id)?;
        session.driver.delete_document(index_name, doc_id).await
    }

    /// Bulk operation
    #[cfg(feature = "elasticsearch")]
    pub async fn es_bulk_operation(
        &self,
        connection_id: &str,
        operations: Vec<EsBulkOperation>,
    ) -> Result<EsBulkResponse, String> {
        let session = self.get_es_session(connection_id)?;
        session.driver.bulk_operation(operations).await
    }

    // ============ Elasticsearch Search Operations ============

    /// Search
    #[cfg(feature = "elasticsearch")]
    pub async fn es_search(
        &self,
        connection_id: &str,
        request: EsSearchRequest,
    ) -> Result<EsSearchResponse, String> {
        let session = self.get_es_session(connection_id)?;
        session.driver.search(request).await
    }

    /// SQL query
    #[cfg(feature = "elasticsearch")]
    pub async fn es_sql_query(
        &self,
        connection_id: &str,
        query: &str,
    ) -> Result<EsSqlResponse, String> {
        let session = self.get_es_session(connection_id)?;
        session.driver.sql_query(query).await
    }

    /// Get Elasticsearch session by connection ID
    #[cfg(feature = "elasticsearch")]
    fn get_es_session(&self, connection_id: &str) -> Result<Arc<ElasticsearchSession>, String> {
        self.es_sessions
            .read()
            .get(connection_id)
            .cloned()
            .ok_or_else(|| "Elasticsearch connection not found".to_string())
    }
}

impl Default for MiddlewareService {
    fn default() -> Self {
        Self::new()
    }
}
