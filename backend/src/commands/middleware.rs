//! Tauri commands for middleware operations (Kafka, Redis, etc.)

use std::collections::HashMap;
use std::sync::Arc;

use tauri::State;

#[cfg(feature = "kafka")]
use crate::models::{
    ClusterInfo, ConsumerGroupInfo, ConsumerGroupListItem, ConsumerGroupOffset,
    CreateTopicRequest, FetchMessagesRequest, KafkaConnectRequest, KafkaConnectionInfo,
    KafkaMessage, ProduceMessageRequest, ProduceResult, TopicConfig, TopicInfo, TopicListItem,
};

#[cfg(feature = "redis")]
use crate::models::{
    RedisCommandResult, RedisConnectRequest, RedisConnectionInfo, RedisDatabaseInfo,
    RedisExecuteRequest, RedisInfo, RedisScanRequest, RedisScanResponse, RedisSetRequest,
    RedisValue,
};

use crate::services::MiddlewareService;

/// State wrapper for middleware service
pub struct MiddlewareServiceState(pub Arc<MiddlewareService>);

// ============ Kafka Connection Commands ============

/// Connect to Kafka cluster
#[cfg(feature = "kafka")]
#[tauri::command]
pub async fn mw_kafka_connect(
    state: State<'_, MiddlewareServiceState>,
    request: KafkaConnectRequest,
) -> Result<KafkaConnectionInfo, String> {
    state.0.connect_kafka(request).await
}

/// Disconnect from Kafka
#[cfg(feature = "kafka")]
#[tauri::command]
pub async fn mw_kafka_disconnect(
    state: State<'_, MiddlewareServiceState>,
    connection_id: String,
) -> Result<(), String> {
    state.0.disconnect_kafka(&connection_id).await
}

/// Test Kafka connection
#[cfg(feature = "kafka")]
#[tauri::command]
pub async fn mw_kafka_test_connection(
    state: State<'_, MiddlewareServiceState>,
    request: KafkaConnectRequest,
) -> Result<(), String> {
    state.0.test_kafka_connection(request).await
}

/// Check if Kafka connection is active
#[cfg(feature = "kafka")]
#[tauri::command]
pub async fn mw_kafka_is_connected(
    state: State<'_, MiddlewareServiceState>,
    connection_id: String,
) -> Result<bool, String> {
    Ok(state.0.is_kafka_connected(&connection_id))
}

// ============ Kafka Cluster Commands ============

/// Get cluster info
#[cfg(feature = "kafka")]
#[tauri::command]
pub async fn mw_kafka_get_cluster_info(
    state: State<'_, MiddlewareServiceState>,
    connection_id: String,
) -> Result<ClusterInfo, String> {
    state.0.kafka_get_cluster_info(&connection_id).await
}

// ============ Kafka Topic Commands ============

/// List all topics
#[cfg(feature = "kafka")]
#[tauri::command]
pub async fn mw_kafka_list_topics(
    state: State<'_, MiddlewareServiceState>,
    connection_id: String,
) -> Result<Vec<TopicListItem>, String> {
    state.0.kafka_list_topics(&connection_id).await
}

/// Get topic details
#[cfg(feature = "kafka")]
#[tauri::command]
pub async fn mw_kafka_get_topic(
    state: State<'_, MiddlewareServiceState>,
    connection_id: String,
    topic: String,
) -> Result<TopicInfo, String> {
    state.0.kafka_get_topic(&connection_id, &topic).await
}

/// Create topic
#[cfg(feature = "kafka")]
#[tauri::command]
pub async fn mw_kafka_create_topic(
    state: State<'_, MiddlewareServiceState>,
    request: CreateTopicRequest,
) -> Result<(), String> {
    state
        .0
        .kafka_create_topic(
            &request.connection_id,
            &request.name,
            request.partitions,
            request.replication_factor,
            request.configs,
        )
        .await
}

/// Delete topic
#[cfg(feature = "kafka")]
#[tauri::command]
pub async fn mw_kafka_delete_topic(
    state: State<'_, MiddlewareServiceState>,
    connection_id: String,
    topic: String,
) -> Result<(), String> {
    state.0.kafka_delete_topic(&connection_id, &topic).await
}

/// Get topic configuration
#[cfg(feature = "kafka")]
#[tauri::command]
pub async fn mw_kafka_get_topic_config(
    state: State<'_, MiddlewareServiceState>,
    connection_id: String,
    topic: String,
) -> Result<Vec<TopicConfig>, String> {
    state.0.kafka_get_topic_config(&connection_id, &topic).await
}

/// Update topic configuration
#[cfg(feature = "kafka")]
#[tauri::command]
pub async fn mw_kafka_update_topic_config(
    state: State<'_, MiddlewareServiceState>,
    connection_id: String,
    topic: String,
    configs: HashMap<String, String>,
) -> Result<(), String> {
    state
        .0
        .kafka_update_topic_config(&connection_id, &topic, configs)
        .await
}

// ============ Kafka Consumer Group Commands ============

/// List all consumer groups
#[cfg(feature = "kafka")]
#[tauri::command]
pub async fn mw_kafka_list_consumer_groups(
    state: State<'_, MiddlewareServiceState>,
    connection_id: String,
) -> Result<Vec<ConsumerGroupListItem>, String> {
    state.0.kafka_list_consumer_groups(&connection_id).await
}

/// Get consumer group details
#[cfg(feature = "kafka")]
#[tauri::command]
pub async fn mw_kafka_get_consumer_group(
    state: State<'_, MiddlewareServiceState>,
    connection_id: String,
    group_id: String,
) -> Result<ConsumerGroupInfo, String> {
    state
        .0
        .kafka_get_consumer_group(&connection_id, &group_id)
        .await
}

/// Get consumer group offsets
#[cfg(feature = "kafka")]
#[tauri::command]
pub async fn mw_kafka_get_consumer_group_offsets(
    state: State<'_, MiddlewareServiceState>,
    connection_id: String,
    group_id: String,
) -> Result<Vec<ConsumerGroupOffset>, String> {
    state
        .0
        .kafka_get_consumer_group_offsets(&connection_id, &group_id)
        .await
}

/// Delete consumer group
#[cfg(feature = "kafka")]
#[tauri::command]
pub async fn mw_kafka_delete_consumer_group(
    state: State<'_, MiddlewareServiceState>,
    connection_id: String,
    group_id: String,
) -> Result<(), String> {
    state
        .0
        .kafka_delete_consumer_group(&connection_id, &group_id)
        .await
}

/// Reset consumer group offsets
#[cfg(feature = "kafka")]
#[tauri::command]
pub async fn mw_kafka_reset_consumer_group_offsets(
    state: State<'_, MiddlewareServiceState>,
    connection_id: String,
    group_id: String,
    topic: String,
    reset_type: String,
) -> Result<(), String> {
    state
        .0
        .kafka_reset_consumer_group_offsets(&connection_id, &group_id, &topic, &reset_type)
        .await
}

// ============ Kafka Message Commands ============

/// Fetch messages from topic
#[cfg(feature = "kafka")]
#[tauri::command]
pub async fn mw_kafka_fetch_messages(
    state: State<'_, MiddlewareServiceState>,
    request: FetchMessagesRequest,
) -> Result<Vec<KafkaMessage>, String> {
    state
        .0
        .kafka_fetch_messages(
            &request.connection_id,
            &request.topic,
            request.partition,
            request.offset,
            request.limit,
        )
        .await
}

/// Produce message to topic
#[cfg(feature = "kafka")]
#[tauri::command]
pub async fn mw_kafka_produce_message(
    state: State<'_, MiddlewareServiceState>,
    request: ProduceMessageRequest,
) -> Result<ProduceResult, String> {
    let headers = request.headers.map(|h| {
        h.into_iter()
            .map(|mh| (mh.key, mh.value))
            .collect::<Vec<_>>()
    });

    state
        .0
        .kafka_produce_message(
            &request.connection_id,
            &request.topic,
            request.partition,
            request.key.as_deref(),
            &request.value,
            headers,
        )
        .await
}

// ============ Redis Connection Commands ============

/// Connect to Redis
#[cfg(feature = "redis")]
#[tauri::command]
pub async fn mw_redis_connect(
    state: State<'_, MiddlewareServiceState>,
    request: RedisConnectRequest,
) -> Result<RedisConnectionInfo, String> {
    state.0.connect_redis(request).await
}

/// Disconnect from Redis
#[cfg(feature = "redis")]
#[tauri::command]
pub async fn mw_redis_disconnect(
    state: State<'_, MiddlewareServiceState>,
    connection_id: String,
) -> Result<(), String> {
    state.0.disconnect_redis(&connection_id).await
}

/// Test Redis connection
#[cfg(feature = "redis")]
#[tauri::command]
pub async fn mw_redis_test_connection(
    state: State<'_, MiddlewareServiceState>,
    request: RedisConnectRequest,
) -> Result<(), String> {
    state.0.test_redis_connection(request).await
}

/// Check if Redis connection is active
#[cfg(feature = "redis")]
#[tauri::command]
pub async fn mw_redis_is_connected(
    state: State<'_, MiddlewareServiceState>,
    connection_id: String,
) -> Result<bool, String> {
    Ok(state.0.is_redis_connected(&connection_id))
}

// ============ Redis Server Info Commands ============

/// Get Redis server info
#[cfg(feature = "redis")]
#[tauri::command]
pub async fn mw_redis_get_info(
    state: State<'_, MiddlewareServiceState>,
    connection_id: String,
    section: Option<String>,
) -> Result<RedisInfo, String> {
    state.0.redis_get_info(&connection_id, section).await
}

/// Get Redis database list
#[cfg(feature = "redis")]
#[tauri::command]
pub async fn mw_redis_get_databases(
    state: State<'_, MiddlewareServiceState>,
    connection_id: String,
) -> Result<Vec<RedisDatabaseInfo>, String> {
    state.0.redis_get_databases(&connection_id).await
}

/// Select Redis database
#[cfg(feature = "redis")]
#[tauri::command]
pub async fn mw_redis_select_database(
    state: State<'_, MiddlewareServiceState>,
    connection_id: String,
    db: u8,
) -> Result<(), String> {
    state.0.redis_select_database(&connection_id, db).await
}

// ============ Redis Key Commands ============

/// Scan Redis keys
#[cfg(feature = "redis")]
#[tauri::command]
pub async fn mw_redis_scan_keys(
    state: State<'_, MiddlewareServiceState>,
    connection_id: String,
    request: RedisScanRequest,
) -> Result<RedisScanResponse, String> {
    state.0.redis_scan_keys(&connection_id, request).await
}

/// Get Redis key count
#[cfg(feature = "redis")]
#[tauri::command]
pub async fn mw_redis_get_key_count(
    state: State<'_, MiddlewareServiceState>,
    connection_id: String,
) -> Result<i64, String> {
    state.0.redis_get_key_count(&connection_id).await
}

/// Get Redis key type
#[cfg(feature = "redis")]
#[tauri::command]
pub async fn mw_redis_get_key_type(
    state: State<'_, MiddlewareServiceState>,
    connection_id: String,
    key: String,
) -> Result<String, String> {
    state.0.redis_get_key_type(&connection_id, &key).await
}

/// Get Redis key TTL
#[cfg(feature = "redis")]
#[tauri::command]
pub async fn mw_redis_get_key_ttl(
    state: State<'_, MiddlewareServiceState>,
    connection_id: String,
    key: String,
) -> Result<i64, String> {
    state.0.redis_get_key_ttl(&connection_id, &key).await
}

/// Set Redis key TTL
#[cfg(feature = "redis")]
#[tauri::command]
pub async fn mw_redis_set_key_ttl(
    state: State<'_, MiddlewareServiceState>,
    connection_id: String,
    key: String,
    ttl: i64,
) -> Result<(), String> {
    state.0.redis_set_key_ttl(&connection_id, &key, ttl).await
}

/// Delete Redis keys
#[cfg(feature = "redis")]
#[tauri::command]
pub async fn mw_redis_delete_keys(
    state: State<'_, MiddlewareServiceState>,
    connection_id: String,
    keys: Vec<String>,
) -> Result<i64, String> {
    state.0.redis_delete_keys(&connection_id, keys).await
}

/// Rename Redis key
#[cfg(feature = "redis")]
#[tauri::command]
pub async fn mw_redis_rename_key(
    state: State<'_, MiddlewareServiceState>,
    connection_id: String,
    old_key: String,
    new_key: String,
) -> Result<(), String> {
    state
        .0
        .redis_rename_key(&connection_id, &old_key, &new_key)
        .await
}

/// Check if Redis key exists
#[cfg(feature = "redis")]
#[tauri::command]
pub async fn mw_redis_key_exists(
    state: State<'_, MiddlewareServiceState>,
    connection_id: String,
    key: String,
) -> Result<bool, String> {
    state.0.redis_key_exists(&connection_id, &key).await
}

// ============ Redis Data Commands ============

/// Get Redis value
#[cfg(feature = "redis")]
#[tauri::command]
pub async fn mw_redis_get_value(
    state: State<'_, MiddlewareServiceState>,
    connection_id: String,
    key: String,
) -> Result<RedisValue, String> {
    state.0.redis_get_value(&connection_id, &key).await
}

/// Set Redis value
#[cfg(feature = "redis")]
#[tauri::command]
pub async fn mw_redis_set_value(
    state: State<'_, MiddlewareServiceState>,
    connection_id: String,
    request: RedisSetRequest,
) -> Result<(), String> {
    state.0.redis_set_value(&connection_id, request).await
}

// ============ Redis Command Execution ============

/// Execute Redis command
#[cfg(feature = "redis")]
#[tauri::command]
pub async fn mw_redis_execute_command(
    state: State<'_, MiddlewareServiceState>,
    request: RedisExecuteRequest,
) -> Result<RedisCommandResult, String> {
    state
        .0
        .redis_execute_command(&request.connection_id, &request.command, request.args)
        .await
}

// ============ Redis Management Commands ============

/// Flush Redis database
#[cfg(feature = "redis")]
#[tauri::command]
pub async fn mw_redis_flush_db(
    state: State<'_, MiddlewareServiceState>,
    connection_id: String,
    async_mode: bool,
) -> Result<(), String> {
    state.0.redis_flush_db(&connection_id, async_mode).await
}

/// Flush all Redis databases
#[cfg(feature = "redis")]
#[tauri::command]
pub async fn mw_redis_flush_all(
    state: State<'_, MiddlewareServiceState>,
    connection_id: String,
    async_mode: bool,
) -> Result<(), String> {
    state.0.redis_flush_all(&connection_id, async_mode).await
}
