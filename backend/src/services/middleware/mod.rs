//! Middleware service module
//!
//! Provides message queue and cache connection management using the strategy pattern.
//! Currently supports:
//! - Kafka (message queue)
//! - Redis (cache/KV store)

#[cfg(feature = "kafka")]
mod kafka;
#[cfg(feature = "redis")]
mod redis;
#[cfg(feature = "redis")]
mod redis_ops;
#[cfg(feature = "redis")]
mod redis_session;
mod session;
mod traits;

pub use session::MiddlewareSession;
#[cfg(feature = "kafka")]
pub use traits::MessageQueueDriver;
#[cfg(feature = "redis")]
pub use redis::RedisDriver;
#[cfg(feature = "redis")]
pub use redis_session::RedisSession;
#[cfg(feature = "redis")]
pub use traits::CacheDriver;

use std::collections::HashMap;
use std::sync::Arc;

use parking_lot::RwLock;

#[cfg(feature = "kafka")]
use crate::models::{
    ClusterInfo, ConsumerGroupInfo, ConsumerGroupListItem, ConsumerGroupOffset,
    KafkaConnectRequest, KafkaConnectionInfo, KafkaMessage, MiddlewareType,
    ProduceResult, TopicConfig, TopicInfo, TopicListItem,
};


#[cfg(feature = "kafka")]
use kafka::KafkaDriver;

/// Middleware service managing all message queue and cache connections
pub struct MiddlewareService {
    #[cfg(feature = "kafka")]
    kafka_sessions: RwLock<HashMap<String, Arc<MiddlewareSession>>>,
    #[cfg(feature = "redis")]
    redis_sessions: RwLock<HashMap<String, Arc<RedisSession>>>,
}

impl MiddlewareService {
    pub fn new() -> Self {
        Self {
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
            request.bootstrap_servers.clone(),
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
            request.bootstrap_servers.clone(),
            Arc::new(driver),
        ));

        self.kafka_sessions
            .write()
            .insert(request.connection_id.clone(), session.clone());

        Ok(KafkaConnectionInfo {
            connection_id: request.connection_id,
            bootstrap_servers: request.bootstrap_servers,
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
            request.bootstrap_servers,
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
}

impl Default for MiddlewareService {
    fn default() -> Self {
        Self::new()
    }
}
