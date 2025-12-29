//! Middleware models for Kafka and other message queues
//!
//! This module contains data structures for middleware management.

use serde::{Deserialize, Serialize};

/// Middleware types supported
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum MiddlewareType {
    Kafka,
    // Future: RabbitMQ, RocketMQ, etc.
}

/// Security protocol for Kafka connections
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum SecurityProtocol {
    #[default]
    Plaintext,
    SaslPlaintext,
    SaslSsl,
    Ssl,
}

/// SASL mechanism for authentication
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
pub enum SaslMechanism {
    #[default]
    #[serde(rename = "PLAIN")]
    Plain,
    #[serde(rename = "SCRAM-SHA-256")]
    ScramSha256,
    #[serde(rename = "SCRAM-SHA-512")]
    ScramSha512,
}

/// Kafka connection configuration
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KafkaConnectRequest {
    pub connection_id: String,
    pub bootstrap_servers: Vec<String>,
    pub security_protocol: Option<SecurityProtocol>,
    pub sasl_mechanism: Option<SaslMechanism>,
    pub username: Option<String>,
    pub password: Option<String>,
}

/// Kafka connection info
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KafkaConnectionInfo {
    pub connection_id: String,
    pub bootstrap_servers: Vec<String>,
    pub connected_at: String,
    pub cluster_id: Option<String>,
}

// ============ Broker Models ============

/// Kafka broker information
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BrokerInfo {
    pub id: i32,
    pub host: String,
    pub port: i32,
    pub is_controller: bool,
}

/// Cluster overview
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClusterInfo {
    pub cluster_id: String,
    pub controller_id: i32,
    pub brokers: Vec<BrokerInfo>,
    pub topic_count: usize,
}

// ============ Topic Models ============

/// Topic partition information
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PartitionInfo {
    pub partition_id: i32,
    pub leader: i32,
    pub replicas: Vec<i32>,
    pub isr: Vec<i32>,
    pub earliest_offset: i64,
    pub latest_offset: i64,
}

/// Topic information
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TopicInfo {
    pub name: String,
    pub partitions: Vec<PartitionInfo>,
    pub is_internal: bool,
    pub replication_factor: i16,
}

/// Topic list item (lightweight version for listing)
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TopicListItem {
    pub name: String,
    pub partition_count: usize,
    pub replication_factor: i16,
    pub is_internal: bool,
}

/// Create topic request
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateTopicRequest {
    pub connection_id: String,
    pub name: String,
    pub partitions: i32,
    pub replication_factor: i16,
    pub configs: Option<std::collections::HashMap<String, String>>,
}

/// Topic configuration
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TopicConfig {
    pub name: String,
    pub value: String,
    pub is_default: bool,
    pub is_read_only: bool,
    pub is_sensitive: bool,
}

// ============ Consumer Group Models ============

/// Consumer group state
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "PascalCase")]
pub enum ConsumerGroupState {
    Unknown,
    PreparingRebalance,
    CompletingRebalance,
    Stable,
    Dead,
    Empty,
}

/// Consumer group member information
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConsumerGroupMember {
    pub member_id: String,
    pub client_id: String,
    pub client_host: String,
    pub assignments: Vec<TopicPartitionAssignment>,
}

/// Topic partition assignment
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TopicPartitionAssignment {
    pub topic: String,
    pub partition: i32,
}

/// Consumer group information
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConsumerGroupInfo {
    pub group_id: String,
    pub state: ConsumerGroupState,
    pub protocol_type: String,
    pub protocol: String,
    pub members: Vec<ConsumerGroupMember>,
}

/// Consumer group list item
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConsumerGroupListItem {
    pub group_id: String,
    pub state: ConsumerGroupState,
    pub member_count: usize,
}

/// Consumer group offset information
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConsumerGroupOffset {
    pub topic: String,
    pub partition: i32,
    pub current_offset: i64,
    pub log_end_offset: i64,
    pub lag: i64,
}

// ============ Message Models ============

/// Kafka message header
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MessageHeader {
    pub key: String,
    pub value: String,
}

/// Kafka message
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KafkaMessage {
    pub topic: String,
    pub partition: i32,
    pub offset: i64,
    pub timestamp: Option<i64>,
    pub key: Option<String>,
    pub value: Option<String>,
    pub headers: Vec<MessageHeader>,
}

/// Fetch messages request
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FetchMessagesRequest {
    pub connection_id: String,
    pub topic: String,
    pub partition: i32,
    pub offset: i64,
    pub limit: i32,
}

/// Produce message request
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProduceMessageRequest {
    pub connection_id: String,
    pub topic: String,
    pub partition: Option<i32>,
    pub key: Option<String>,
    pub value: String,
    pub headers: Option<Vec<MessageHeader>>,
}

/// Produce result
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProduceResult {
    pub topic: String,
    pub partition: i32,
    pub offset: i64,
}
