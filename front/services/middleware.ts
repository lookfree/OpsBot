/**
 * Middleware service for Kafka, Redis and other middleware
 */

import { invoke } from '@tauri-apps/api/core'

// ============ Kafka Enums ============

export type SecurityProtocol = 'PLAINTEXT' | 'SASL_PLAINTEXT' | 'SASL_SSL' | 'SSL'
export type SaslMechanism = 'PLAIN' | 'SCRAM-SHA-256' | 'SCRAM-SHA-512'
export type ConsumerGroupState = 'Unknown' | 'PreparingRebalance' | 'CompletingRebalance' | 'Stable' | 'Dead' | 'Empty'

// ============ Redis Enums ============

export type RedisMode = 'standalone' | 'cluster' | 'sentinel'

// ============ Connection Types ============

export interface KafkaConnectRequest {
  connectionId: string
  bootstrapServers: string[]
  securityProtocol?: SecurityProtocol
  saslMechanism?: SaslMechanism
  username?: string
  password?: string
}

export interface KafkaConnectionInfo {
  connectionId: string
  bootstrapServers: string[]
  connectedAt: string
  clusterId?: string
}

// ============ Broker Types ============

export interface BrokerInfo {
  id: number
  host: string
  port: number
  isController: boolean
}

export interface ClusterInfo {
  clusterId: string
  controllerId: number
  brokers: BrokerInfo[]
  topicCount: number
}

// ============ Topic Types ============

export interface PartitionInfo {
  partitionId: number
  leader: number
  replicas: number[]
  isr: number[]
  earliestOffset: number
  latestOffset: number
}

export interface TopicInfo {
  name: string
  partitions: PartitionInfo[]
  isInternal: boolean
  replicationFactor: number
}

export interface TopicListItem {
  name: string
  partitionCount: number
  replicationFactor: number
  isInternal: boolean
}

export interface CreateTopicRequest {
  connectionId: string
  name: string
  partitions: number
  replicationFactor: number
  configs?: Record<string, string>
}

export interface TopicConfig {
  name: string
  value: string
  isDefault: boolean
  isReadOnly: boolean
  isSensitive: boolean
}

// ============ Consumer Group Types ============

export interface TopicPartitionAssignment {
  topic: string
  partition: number
}

export interface ConsumerGroupMember {
  memberId: string
  clientId: string
  clientHost: string
  assignments: TopicPartitionAssignment[]
}

export interface ConsumerGroupInfo {
  groupId: string
  state: ConsumerGroupState
  protocolType: string
  protocol: string
  members: ConsumerGroupMember[]
}

export interface ConsumerGroupListItem {
  groupId: string
  state: ConsumerGroupState
  memberCount: number
}

export interface ConsumerGroupOffset {
  topic: string
  partition: number
  currentOffset: number
  logEndOffset: number
  lag: number
}

// ============ Message Types ============

export interface MessageHeader {
  key: string
  value: string
}

export interface KafkaMessage {
  topic: string
  partition: number
  offset: number
  timestamp?: number
  key?: string
  value?: string
  headers: MessageHeader[]
}

export interface FetchMessagesRequest {
  connectionId: string
  topic: string
  partition: number
  offset: number
  limit: number
}

export interface ProduceMessageRequest {
  connectionId: string
  topic: string
  partition?: number
  key?: string
  value: string
  headers?: MessageHeader[]
}

export interface ProduceResult {
  topic: string
  partition: number
  offset: number
}

// ============ Connection Functions ============

/**
 * Connect to Kafka cluster
 */
export async function mwKafkaConnect(request: KafkaConnectRequest): Promise<KafkaConnectionInfo> {
  return invoke<KafkaConnectionInfo>('mw_kafka_connect', { request })
}

/**
 * Disconnect from Kafka
 */
export async function mwKafkaDisconnect(connectionId: string): Promise<void> {
  return invoke('mw_kafka_disconnect', { connectionId })
}

/**
 * Test Kafka connection
 */
export async function mwKafkaTestConnection(request: KafkaConnectRequest): Promise<void> {
  return invoke('mw_kafka_test_connection', { request })
}

/**
 * Check if Kafka connection is active
 */
export async function mwKafkaIsConnected(connectionId: string): Promise<boolean> {
  return invoke<boolean>('mw_kafka_is_connected', { connectionId })
}

// ============ Kafka Cluster Functions ============

/**
 * Get Kafka cluster info
 */
export async function mwKafkaGetClusterInfo(connectionId: string): Promise<ClusterInfo> {
  return invoke<ClusterInfo>('mw_kafka_get_cluster_info', { connectionId })
}

// ============ Kafka Topic Functions ============

/**
 * List all Kafka topics
 */
export async function mwKafkaListTopics(connectionId: string): Promise<TopicListItem[]> {
  return invoke<TopicListItem[]>('mw_kafka_list_topics', { connectionId })
}

/**
 * Get Kafka topic details
 */
export async function mwKafkaGetTopic(connectionId: string, topic: string): Promise<TopicInfo> {
  return invoke<TopicInfo>('mw_kafka_get_topic', { connectionId, topic })
}

/**
 * Create Kafka topic
 */
export async function mwKafkaCreateTopic(request: CreateTopicRequest): Promise<void> {
  return invoke('mw_kafka_create_topic', { request })
}

/**
 * Delete Kafka topic
 */
export async function mwKafkaDeleteTopic(connectionId: string, topic: string): Promise<void> {
  return invoke('mw_kafka_delete_topic', { connectionId, topic })
}

/**
 * Get Kafka topic configuration
 */
export async function mwKafkaGetTopicConfig(connectionId: string, topic: string): Promise<TopicConfig[]> {
  return invoke<TopicConfig[]>('mw_kafka_get_topic_config', { connectionId, topic })
}

/**
 * Update Kafka topic configuration
 */
export async function mwKafkaUpdateTopicConfig(
  connectionId: string,
  topic: string,
  configs: Record<string, string>
): Promise<void> {
  return invoke('mw_kafka_update_topic_config', { connectionId, topic, configs })
}

// ============ Kafka Consumer Group Functions ============

/**
 * List all Kafka consumer groups
 */
export async function mwKafkaListConsumerGroups(connectionId: string): Promise<ConsumerGroupListItem[]> {
  return invoke<ConsumerGroupListItem[]>('mw_kafka_list_consumer_groups', { connectionId })
}

/**
 * Get Kafka consumer group details
 */
export async function mwKafkaGetConsumerGroup(connectionId: string, groupId: string): Promise<ConsumerGroupInfo> {
  return invoke<ConsumerGroupInfo>('mw_kafka_get_consumer_group', { connectionId, groupId })
}

/**
 * Get Kafka consumer group offsets
 */
export async function mwKafkaGetConsumerGroupOffsets(
  connectionId: string,
  groupId: string
): Promise<ConsumerGroupOffset[]> {
  return invoke<ConsumerGroupOffset[]>('mw_kafka_get_consumer_group_offsets', { connectionId, groupId })
}

/**
 * Delete Kafka consumer group
 */
export async function mwKafkaDeleteConsumerGroup(connectionId: string, groupId: string): Promise<void> {
  return invoke('mw_kafka_delete_consumer_group', { connectionId, groupId })
}

/**
 * Reset Kafka consumer group offsets
 * @param resetType - "earliest", "latest", or a timestamp/offset value as string
 */
export async function mwKafkaResetConsumerGroupOffsets(
  connectionId: string,
  groupId: string,
  topic: string,
  resetType: string
): Promise<void> {
  return invoke('mw_kafka_reset_consumer_group_offsets', { connectionId, groupId, topic, resetType })
}

// ============ Kafka Message Functions ============

/**
 * Fetch messages from Kafka topic
 */
export async function mwKafkaFetchMessages(request: FetchMessagesRequest): Promise<KafkaMessage[]> {
  return invoke<KafkaMessage[]>('mw_kafka_fetch_messages', { request })
}

/**
 * Produce message to Kafka topic
 */
export async function mwKafkaProduceMessage(request: ProduceMessageRequest): Promise<ProduceResult> {
  return invoke<ProduceResult>('mw_kafka_produce_message', { request })
}

// ============================================================
// ============ Redis Types ============
// ============================================================

// ============ Redis Connection Types ============

export interface RedisTlsConfig {
  enabled: boolean
  rejectUnauthorized?: boolean
  ca?: string
}

export interface RedisConnectRequest {
  connectionId: string
  mode: RedisMode
  host?: string
  port?: number
  nodes?: string[]
  sentinels?: string[]
  sentinelPassword?: string
  masterName?: string
  password?: string
  db?: number
  tls?: RedisTlsConfig
  connectTimeout?: number
}

export interface RedisConnectionInfo {
  connectionId: string
  mode: RedisMode
  version: string
  connectedClients: number
  usedMemory: string
  totalKeys: number
  connectedAt: string
}

// ============ Redis Server Info Types ============

export interface RedisServerInfo {
  redisVersion: string
  redisMode: string
  os: string
  uptimeInSeconds: number
  uptimeInDays: number
}

export interface RedisClientsInfo {
  connectedClients: number
  blockedClients: number
  maxClients: number
}

export interface RedisMemoryInfo {
  usedMemory: number
  usedMemoryHuman: string
  usedMemoryPeak: number
  usedMemoryPeakHuman: string
  maxmemory: number
  maxmemoryHuman: string
  memFragmentationRatio: number
}

export interface RedisStatsInfo {
  totalConnectionsReceived: number
  totalCommandsProcessed: number
  instantaneousOpsPerSec: number
  keyspaceHits: number
  keyspaceMisses: number
  hitRate: number
}

export interface RedisKeyspaceInfo {
  db: number
  keys: number
  expires: number
  avgTtl: number
}

export interface RedisInfo {
  server: RedisServerInfo
  clients: RedisClientsInfo
  memory: RedisMemoryInfo
  stats: RedisStatsInfo
  keyspace: RedisKeyspaceInfo[]
}

export interface RedisDatabaseInfo {
  db: number
  keys: number
  expires: number
}

// ============ Redis Key Types ============

export interface RedisScanRequest {
  cursor: string
  pattern?: string
  count?: number
  keyType?: string
}

export interface RedisKeyInfo {
  key: string
  keyType: string
  ttl: number
  size?: number
}

export interface RedisScanResponse {
  cursor: string
  keys: RedisKeyInfo[]
  finished: boolean
}

// ============ Redis Value Types ============

export interface RedisStreamEntry {
  id: string
  fields: [string, string][]
}

export type RedisValue =
  | { type: 'String'; data: string }
  | { type: 'List'; data: string[] }
  | { type: 'Set'; data: string[] }
  | { type: 'Hash'; data: [string, string][] }
  | { type: 'ZSet'; data: [string, number][] }
  | { type: 'Stream'; data: RedisStreamEntry[] }
  | { type: 'None'; data: null }

export interface RedisSetRequest {
  key: string
  value: RedisValue
  ttl?: number
  nx?: boolean
  xx?: boolean
}

// ============ Redis Command Types ============

export interface RedisExecuteRequest {
  connectionId: string
  command: string
  args: string[]
}

export interface RedisCommandResult {
  resultType: string
  value: unknown
  executionTimeMs: number
}

// ============================================================
// ============ Redis Functions ============
// ============================================================

// ============ Redis Connection Functions ============

/**
 * Connect to Redis
 */
export async function mwRedisConnect(request: RedisConnectRequest): Promise<RedisConnectionInfo> {
  return invoke<RedisConnectionInfo>('mw_redis_connect', { request })
}

/**
 * Disconnect from Redis
 */
export async function mwRedisDisconnect(connectionId: string): Promise<void> {
  return invoke('mw_redis_disconnect', { connectionId })
}

/**
 * Test Redis connection
 */
export async function mwRedisTestConnection(request: RedisConnectRequest): Promise<void> {
  return invoke('mw_redis_test_connection', { request })
}

/**
 * Check if Redis connection is active
 */
export async function mwRedisIsConnected(connectionId: string): Promise<boolean> {
  return invoke<boolean>('mw_redis_is_connected', { connectionId })
}

// ============ Redis Server Info Functions ============

/**
 * Get Redis server info
 */
export async function mwRedisGetInfo(connectionId: string, section?: string): Promise<RedisInfo> {
  return invoke<RedisInfo>('mw_redis_get_info', { connectionId, section })
}

/**
 * Get Redis databases list
 */
export async function mwRedisGetDatabases(connectionId: string): Promise<RedisDatabaseInfo[]> {
  return invoke<RedisDatabaseInfo[]>('mw_redis_get_databases', { connectionId })
}

/**
 * Select Redis database
 */
export async function mwRedisSelectDatabase(connectionId: string, db: number): Promise<void> {
  return invoke('mw_redis_select_database', { connectionId, db })
}

// ============ Redis Key Functions ============

/**
 * Scan Redis keys
 */
export async function mwRedisScanKeys(connectionId: string, request: RedisScanRequest): Promise<RedisScanResponse> {
  return invoke<RedisScanResponse>('mw_redis_scan_keys', { connectionId, request })
}

/**
 * Get Redis key count
 */
export async function mwRedisGetKeyCount(connectionId: string): Promise<number> {
  return invoke<number>('mw_redis_get_key_count', { connectionId })
}

/**
 * Get Redis key type
 */
export async function mwRedisGetKeyType(connectionId: string, key: string): Promise<string> {
  return invoke<string>('mw_redis_get_key_type', { connectionId, key })
}

/**
 * Get Redis key TTL
 */
export async function mwRedisGetKeyTtl(connectionId: string, key: string): Promise<number> {
  return invoke<number>('mw_redis_get_key_ttl', { connectionId, key })
}

/**
 * Set Redis key TTL
 */
export async function mwRedisSetKeyTtl(connectionId: string, key: string, ttl: number): Promise<void> {
  return invoke('mw_redis_set_key_ttl', { connectionId, key, ttl })
}

/**
 * Delete Redis keys
 */
export async function mwRedisDeleteKeys(connectionId: string, keys: string[]): Promise<number> {
  return invoke<number>('mw_redis_delete_keys', { connectionId, keys })
}

/**
 * Rename Redis key
 */
export async function mwRedisRenameKey(connectionId: string, oldKey: string, newKey: string): Promise<void> {
  return invoke('mw_redis_rename_key', { connectionId, oldKey, newKey })
}

/**
 * Check if Redis key exists
 */
export async function mwRedisKeyExists(connectionId: string, key: string): Promise<boolean> {
  return invoke<boolean>('mw_redis_key_exists', { connectionId, key })
}

// ============ Redis Data Functions ============

/**
 * Get Redis value
 */
export async function mwRedisGetValue(connectionId: string, key: string): Promise<RedisValue> {
  return invoke<RedisValue>('mw_redis_get_value', { connectionId, key })
}

/**
 * Set Redis value
 */
export async function mwRedisSetValue(connectionId: string, request: RedisSetRequest): Promise<void> {
  return invoke('mw_redis_set_value', { connectionId, request })
}

// ============ Redis Command Functions ============

/**
 * Execute Redis command
 */
export async function mwRedisExecuteCommand(request: RedisExecuteRequest): Promise<RedisCommandResult> {
  return invoke<RedisCommandResult>('mw_redis_execute_command', { request })
}

// ============ Redis Management Functions ============

/**
 * Flush Redis database
 */
export async function mwRedisFlushDb(connectionId: string, asyncMode: boolean = false): Promise<void> {
  return invoke('mw_redis_flush_db', { connectionId, asyncMode })
}

/**
 * Flush all Redis databases
 */
export async function mwRedisFlushAll(connectionId: string, asyncMode: boolean = false): Promise<void> {
  return invoke('mw_redis_flush_all', { connectionId, asyncMode })
}
