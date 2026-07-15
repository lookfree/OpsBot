//! Kafka driver implementation
//!
//! Implements the MessageQueueDriver trait for Apache Kafka.
//!
//! All synchronous librdkafka calls (metadata/watermarks/poll/commit) are run
//! inside `tokio::task::spawn_blocking` so they never block the async runtime,
//! and access to the shared `BaseConsumer` is serialized through a `Mutex` so
//! concurrent `assign()` calls cannot clobber each other's partition assignment.

use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use async_trait::async_trait;
use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine as _;
use rdkafka::admin::{AdminClient, AdminOptions, NewTopic, TopicReplication};
use rdkafka::client::DefaultClientContext;
use rdkafka::config::ClientConfig;
use rdkafka::consumer::{BaseConsumer, Consumer};
use rdkafka::message::{Header, Headers, Message, OwnedHeaders};
use rdkafka::producer::{FutureProducer, FutureRecord};
use rdkafka::{Offset, TopicPartitionList};

use crate::models::{
    BrokerInfo, ClusterInfo, ConsumerGroupInfo, ConsumerGroupListItem, ConsumerGroupMember,
    ConsumerGroupOffset, ConsumerGroupState, KafkaMessage, MessageHeader, PartitionInfo,
    ProduceResult, SaslMechanism, SecurityProtocol, TopicConfig, TopicInfo, TopicListItem,
};
use crate::services::middleware::traits::MessageQueueDriver;

const CONSUMER_GROUP_ID: &str = "zwd-opsbot-admin";

/// Kafka driver implementing the MessageQueueDriver trait
pub struct KafkaDriver {
    admin_client: AdminClient<DefaultClientContext>,
    /// Shared consumer used for metadata/watermarks/message fetching. Guarded by
    /// a Mutex so concurrent operations serialize instead of clobbering each
    /// other's partition assignment.
    consumer: Arc<Mutex<BaseConsumer>>,
    producer: FutureProducer,
    #[allow(dead_code)]
    bootstrap_servers: String,
    /// Base config (bootstrap servers + security/SASL) without any consumer- or
    /// producer-specific properties. Reused to build temporary consumers (offset
    /// reset, committed-offset lookup) so they inherit authentication settings.
    base_config: ClientConfig,
}

impl KafkaDriver {
    /// Create a new Kafka driver and connect to the cluster
    pub async fn connect(
        bootstrap_servers: Vec<String>,
        security_protocol: Option<SecurityProtocol>,
        sasl_mechanism: Option<SaslMechanism>,
        username: Option<String>,
        password: Option<String>,
    ) -> Result<Self, String> {
        let servers = bootstrap_servers.join(",");
        let base_config = Self::build_client_config(
            &servers,
            security_protocol,
            sasl_mechanism,
            username,
            password,
        );

        // Create admin client from the clean base config (no group.id).
        let admin_client: AdminClient<DefaultClientContext> = base_config
            .create()
            .map_err(|e| format!("Failed to create admin client: {}", e))?;

        // Create consumer for fetching messages, with consumer-only properties.
        let mut consumer_config = base_config.clone();
        consumer_config.set("group.id", CONSUMER_GROUP_ID);
        consumer_config.set("enable.auto.commit", "false");
        consumer_config.set("auto.offset.reset", "earliest");
        let consumer: BaseConsumer = consumer_config
            .create()
            .map_err(|e| format!("Failed to create consumer: {}", e))?;

        // Create producer from the clean base config plus durability settings.
        let mut producer_config = base_config.clone();
        producer_config.set("acks", "all");
        let producer: FutureProducer = producer_config
            .create()
            .map_err(|e| format!("Failed to create producer: {}", e))?;

        Ok(Self {
            admin_client,
            consumer: Arc::new(Mutex::new(consumer)),
            producer,
            bootstrap_servers: servers,
            base_config,
        })
    }

    /// Build client configuration
    fn build_client_config(
        bootstrap_servers: &str,
        security_protocol: Option<SecurityProtocol>,
        sasl_mechanism: Option<SaslMechanism>,
        username: Option<String>,
        password: Option<String>,
    ) -> ClientConfig {
        let mut config = ClientConfig::new();
        config.set("bootstrap.servers", bootstrap_servers);
        config.set("client.id", "zwd-opsbot");

        let protocol = security_protocol.unwrap_or_default();
        match protocol {
            SecurityProtocol::Plaintext => {
                config.set("security.protocol", "plaintext");
            }
            SecurityProtocol::SaslPlaintext => {
                config.set("security.protocol", "sasl_plaintext");
                Self::set_sasl_config(&mut config, sasl_mechanism, username, password);
            }
            SecurityProtocol::SaslSsl => {
                config.set("security.protocol", "sasl_ssl");
                Self::set_sasl_config(&mut config, sasl_mechanism, username, password);
            }
            SecurityProtocol::Ssl => {
                config.set("security.protocol", "ssl");
            }
        }

        config
    }

    /// Set SASL configuration
    fn set_sasl_config(
        config: &mut ClientConfig,
        sasl_mechanism: Option<SaslMechanism>,
        username: Option<String>,
        password: Option<String>,
    ) {
        let mechanism = sasl_mechanism.unwrap_or_default();
        let mechanism_str = match mechanism {
            SaslMechanism::Plain => "PLAIN",
            SaslMechanism::ScramSha256 => "SCRAM-SHA-256",
            SaslMechanism::ScramSha512 => "SCRAM-SHA-512",
        };
        config.set("sasl.mechanism", mechanism_str);

        if let Some(user) = username {
            config.set("sasl.username", user);
        }
        if let Some(pass) = password {
            config.set("sasl.password", pass);
        }
    }

    /// Run a blocking closure with exclusive access to the shared consumer.
    ///
    /// The work runs on the blocking thread pool (never on an async worker), and
    /// the Mutex guarantees only one metadata/fetch operation touches the
    /// consumer at a time so assignments cannot be clobbered.
    async fn with_consumer<F, R>(&self, f: F) -> Result<R, String>
    where
        F: FnOnce(&BaseConsumer) -> Result<R, String> + Send + 'static,
        R: Send + 'static,
    {
        let consumer = self.consumer.clone();
        tokio::task::spawn_blocking(move || {
            let guard = consumer
                .lock()
                .map_err(|_| "Consumer mutex poisoned".to_string())?;
            f(&guard)
        })
        .await
        .map_err(|e| format!("Consumer task failed: {}", e))?
    }

    /// Decode raw bytes as UTF-8, falling back to base64 for binary payloads.
    /// Returns `(text, is_binary)`.
    fn decode_bytes(bytes: &[u8]) -> (String, bool) {
        match std::str::from_utf8(bytes) {
            Ok(s) => (s.to_string(), false),
            Err(_) => (BASE64.encode(bytes), true),
        }
    }

    /// Get topic partition information (metadata + watermarks in one pass).
    async fn get_partition_info(&self, topic: &str) -> Result<Vec<PartitionInfo>, String> {
        let topic = topic.to_string();
        self.with_consumer(move |consumer| {
            let metadata = consumer
                .fetch_metadata(Some(&topic), Duration::from_secs(10))
                .map_err(|e| format!("Failed to fetch metadata: {}", e))?;

            let topic_metadata = metadata
                .topics()
                .iter()
                .find(|t| t.name() == topic)
                .ok_or_else(|| format!("Topic '{}' not found", topic))?;

            let mut partitions = Vec::new();
            for partition in topic_metadata.partitions() {
                let (earliest, latest) = consumer
                    .fetch_watermarks(&topic, partition.id(), Duration::from_secs(10))
                    .map_err(|e| format!("Failed to fetch watermarks: {}", e))?;
                partitions.push(PartitionInfo {
                    partition_id: partition.id(),
                    leader: partition.leader(),
                    replicas: partition.replicas().to_vec(),
                    isr: partition.isr().to_vec(),
                    earliest_offset: earliest,
                    latest_offset: latest,
                });
            }

            Ok(partitions)
        })
        .await
    }
}

#[async_trait]
impl MessageQueueDriver for KafkaDriver {
    async fn test_connection(&self) -> Result<(), String> {
        self.with_consumer(|consumer| {
            consumer
                .fetch_metadata(None, Duration::from_secs(10))
                .map(|_| ())
                .map_err(|e| format!("Connection test failed: {}", e))
        })
        .await
    }

    async fn get_cluster_info(&self) -> Result<ClusterInfo, String> {
        self.with_consumer(|consumer| {
            let metadata = consumer
                .fetch_metadata(None, Duration::from_secs(10))
                .map_err(|e| format!("Failed to fetch metadata: {}", e))?;

            // Use the real cluster.id when available; fall back to the broker name.
            let cluster_id = consumer
                .client()
                .fetch_cluster_id(Duration::from_secs(10))
                .unwrap_or_else(|| metadata.orig_broker_name().to_string());

            let brokers: Vec<BrokerInfo> = metadata
                .brokers()
                .iter()
                .map(|b| BrokerInfo {
                    id: b.id(),
                    host: b.host().to_string(),
                    port: b.port() as i32,
                    is_controller: false, // rdkafka doesn't expose controller info directly
                })
                .collect();

            Ok(ClusterInfo {
                cluster_id,
                controller_id: -1, // -1 = unknown (not exposed by rdkafka metadata)
                brokers,
                topic_count: metadata.topics().len(),
            })
        })
        .await
    }

    async fn list_topics(&self) -> Result<Vec<TopicListItem>, String> {
        self.with_consumer(|consumer| {
            let metadata = consumer
                .fetch_metadata(None, Duration::from_secs(10))
                .map_err(|e| format!("Failed to fetch metadata: {}", e))?;

            let topics: Vec<TopicListItem> = metadata
                .topics()
                .iter()
                .map(|t| {
                    let replication_factor = t
                        .partitions()
                        .first()
                        .map(|p| p.replicas().len() as i16)
                        .unwrap_or(0);

                    TopicListItem {
                        name: t.name().to_string(),
                        partition_count: t.partitions().len(),
                        replication_factor,
                        is_internal: t.name().starts_with("__"),
                    }
                })
                .collect();

            Ok(topics)
        })
        .await
    }

    async fn get_topic(&self, topic: &str) -> Result<TopicInfo, String> {
        let partitions = self.get_partition_info(topic).await?;
        let replication_factor = partitions
            .first()
            .map(|p| p.replicas.len() as i16)
            .unwrap_or(0);

        Ok(TopicInfo {
            name: topic.to_string(),
            partitions,
            is_internal: topic.starts_with("__"),
            replication_factor,
        })
    }

    async fn create_topic(
        &self,
        name: &str,
        partitions: i32,
        replication_factor: i16,
        configs: Option<HashMap<String, String>>,
    ) -> Result<(), String> {
        if partitions < 1 {
            return Err(format!("Partition count must be >= 1, got {}", partitions));
        }
        if replication_factor < 1 {
            return Err(format!(
                "Replication factor must be >= 1, got {}",
                replication_factor
            ));
        }

        let mut new_topic =
            NewTopic::new(name, partitions, TopicReplication::Fixed(replication_factor as i32));

        if let Some(cfg) = &configs {
            for (key, value) in cfg {
                new_topic = new_topic.set(key, value);
            }
        }

        let opts = AdminOptions::new().operation_timeout(Some(Duration::from_secs(30)));
        let results = self
            .admin_client
            .create_topics(&[new_topic], &opts)
            .await
            .map_err(|e| format!("Failed to create topic: {}", e))?;

        for result in results {
            result.map_err(|(_, e)| format!("Failed to create topic '{}': {}", name, e))?;
        }

        Ok(())
    }

    async fn delete_topic(&self, topic: &str) -> Result<(), String> {
        let opts = AdminOptions::new().operation_timeout(Some(Duration::from_secs(30)));
        let results = self
            .admin_client
            .delete_topics(&[topic], &opts)
            .await
            .map_err(|e| format!("Failed to delete topic: {}", e))?;

        for result in results {
            result.map_err(|(_, e)| format!("Failed to delete topic '{}': {}", topic, e))?;
        }

        Ok(())
    }

    async fn get_topic_config(&self, topic: &str) -> Result<Vec<TopicConfig>, String> {
        use rdkafka::admin::ResourceSpecifier;

        let resource = ResourceSpecifier::Topic(topic);
        let opts = AdminOptions::new().operation_timeout(Some(Duration::from_secs(30)));

        let results = self
            .admin_client
            .describe_configs([&resource], &opts)
            .await
            .map_err(|e| format!("Failed to describe config: {}", e))?;

        let mut configs = Vec::new();
        for result in results {
            if let Ok(config_resource) = result {
                for entry in config_resource.entries {
                    configs.push(TopicConfig {
                        name: entry.name.to_string(),
                        value: entry.value.unwrap_or_default().to_string(),
                        is_default: entry.is_default,
                        is_read_only: entry.is_read_only,
                        is_sensitive: entry.is_sensitive,
                    });
                }
            }
        }

        Ok(configs)
    }

    async fn update_topic_config(
        &self,
        topic: &str,
        configs: HashMap<String, String>,
    ) -> Result<(), String> {
        use rdkafka::admin::{AlterConfig, ResourceSpecifier};

        let mut alter_config = AlterConfig::new(ResourceSpecifier::Topic(topic));
        for (key, value) in &configs {
            alter_config = alter_config.set(key, value);
        }

        let opts = AdminOptions::new().operation_timeout(Some(Duration::from_secs(30)));

        let results = self
            .admin_client
            .alter_configs([&alter_config], &opts)
            .await
            .map_err(|e| format!("Failed to alter config: {}", e))?;

        for result in results {
            result.map_err(|e| format!("Failed to update config for topic '{}': {:?}", topic, e))?;
        }

        Ok(())
    }

    async fn list_consumer_groups(&self) -> Result<Vec<ConsumerGroupListItem>, String> {
        self.with_consumer(|consumer| {
            let groups = consumer
                .fetch_group_list(None, Duration::from_secs(10))
                .map_err(|e| format!("Failed to list consumer groups: {}", e))?;

            let result: Vec<ConsumerGroupListItem> = groups
                .groups()
                .iter()
                .map(|g| ConsumerGroupListItem {
                    group_id: g.name().to_string(),
                    state: Self::parse_group_state(g.state()),
                    member_count: g.members().len(),
                })
                .collect();

            Ok(result)
        })
        .await
    }

    async fn get_consumer_group(&self, group_id: &str) -> Result<ConsumerGroupInfo, String> {
        let group_id = group_id.to_string();
        self.with_consumer(move |consumer| {
            let groups = consumer
                .fetch_group_list(Some(&group_id), Duration::from_secs(10))
                .map_err(|e| format!("Failed to get consumer group: {}", e))?;

            let group = groups
                .groups()
                .iter()
                .find(|g| g.name() == group_id)
                .ok_or_else(|| format!("Consumer group '{}' not found", group_id))?;

            let members: Vec<ConsumerGroupMember> = group
                .members()
                .iter()
                .map(|m| ConsumerGroupMember {
                    member_id: m.id().to_string(),
                    client_id: m.client_id().to_string(),
                    client_host: m.client_host().to_string(),
                    assignments: Vec::new(), // Assignment parsing is complex
                })
                .collect();

            Ok(ConsumerGroupInfo {
                group_id: group.name().to_string(),
                state: Self::parse_group_state(group.state()),
                protocol_type: group.protocol_type().to_string(),
                protocol: group.protocol().to_string(),
                members,
            })
        })
        .await
    }

    async fn get_consumer_group_offsets(
        &self,
        group_id: &str,
    ) -> Result<Vec<ConsumerGroupOffset>, String> {
        let group_id = group_id.to_string();
        let mut config = self.base_config.clone();
        config.set("group.id", group_id.as_str());
        config.set("enable.auto.commit", "false");

        tokio::task::spawn_blocking(move || {
            let consumer: BaseConsumer = config
                .create()
                .map_err(|e| format!("Failed to create consumer for offsets: {}", e))?;

            // Build a TPL of every non-internal topic-partition to query committed offsets.
            let metadata = consumer
                .fetch_metadata(None, Duration::from_secs(10))
                .map_err(|e| format!("Failed to fetch metadata: {}", e))?;

            let mut tpl = TopicPartitionList::new();
            let mut has_any = false;
            for topic in metadata.topics() {
                if topic.name().starts_with("__") {
                    continue;
                }
                for partition in topic.partitions() {
                    tpl.add_partition(topic.name(), partition.id());
                    has_any = true;
                }
            }
            if !has_any {
                return Ok(Vec::new());
            }

            let committed = consumer
                .committed_offsets(tpl, Duration::from_secs(15))
                .map_err(|e| format!("Failed to fetch committed offsets: {}", e))?;

            let mut result = Vec::new();
            for elem in committed.elements() {
                // Only report partitions that have a real committed offset.
                let current = match elem.offset().to_raw() {
                    Some(o) if o >= 0 => o,
                    _ => continue,
                };
                let (_, high) = consumer
                    .fetch_watermarks(elem.topic(), elem.partition(), Duration::from_secs(10))
                    .map_err(|e| format!("Failed to fetch watermarks: {}", e))?;
                let lag = (high - current).max(0);
                result.push(ConsumerGroupOffset {
                    topic: elem.topic().to_string(),
                    partition: elem.partition(),
                    current_offset: current,
                    log_end_offset: high,
                    lag,
                });
            }

            Ok(result)
        })
        .await
        .map_err(|e| format!("Offsets task failed: {}", e))?
    }

    async fn delete_consumer_group(&self, group_id: &str) -> Result<(), String> {
        let opts = AdminOptions::new().operation_timeout(Some(Duration::from_secs(30)));

        let results = self
            .admin_client
            .delete_groups(&[group_id], &opts)
            .await
            .map_err(|e| format!("Failed to delete consumer group: {}", e))?;

        for result in results {
            result.map_err(|(_, e)| {
                format!("Failed to delete consumer group '{}': {}", group_id, e)
            })?;
        }

        Ok(())
    }

    async fn reset_consumer_group_offsets(
        &self,
        group_id: &str,
        topic: &str,
        reset_type: &str,
    ) -> Result<(), String> {
        let group_id = group_id.to_string();
        let topic = topic.to_string();
        let reset_type = reset_type.to_string();

        // Reuse the base config so security/SASL settings carry over to the temp consumer.
        let mut config = self.base_config.clone();
        config.set("group.id", group_id.as_str());
        config.set("enable.auto.commit", "false");

        tokio::task::spawn_blocking(move || {
            use rdkafka::consumer::CommitMode;

            let consumer: BaseConsumer = config
                .create()
                .map_err(|e| format!("Failed to create consumer for offset reset: {}", e))?;

            let metadata = consumer
                .fetch_metadata(Some(&topic), Duration::from_secs(10))
                .map_err(|e| format!("Failed to fetch topic metadata: {}", e))?;

            let topic_metadata = metadata
                .topics()
                .iter()
                .find(|t| t.name() == topic)
                .ok_or_else(|| format!("Topic '{}' not found", topic))?;

            if topic_metadata.partitions().is_empty() {
                return Err(format!("Topic '{}' has no partitions", topic));
            }

            let mut tpl = TopicPartitionList::new();
            for partition in topic_metadata.partitions() {
                tpl.add_partition(&topic, partition.id());
            }

            match reset_type.as_str() {
                "earliest" => {
                    for partition in topic_metadata.partitions() {
                        let (low, _high) = consumer
                            .fetch_watermarks(&topic, partition.id(), Duration::from_secs(10))
                            .map_err(|e| format!("Failed to fetch watermarks: {}", e))?;
                        tpl.set_partition_offset(&topic, partition.id(), Offset::Offset(low))
                            .map_err(|e| format!("Failed to set offset: {}", e))?;
                    }
                }
                "latest" => {
                    for partition in topic_metadata.partitions() {
                        let (_low, high) = consumer
                            .fetch_watermarks(&topic, partition.id(), Duration::from_secs(10))
                            .map_err(|e| format!("Failed to fetch watermarks: {}", e))?;
                        tpl.set_partition_offset(&topic, partition.id(), Offset::Offset(high))
                            .map_err(|e| format!("Failed to set offset: {}", e))?;
                    }
                }
                other => {
                    let value = other
                        .parse::<i64>()
                        .map_err(|_| format!("Invalid reset type: {}", other))?;

                    if value > 1_000_000_000_000 {
                        // Treat as a millisecond timestamp -> resolve to offsets.
                        for partition in topic_metadata.partitions() {
                            tpl.set_partition_offset(
                                &topic,
                                partition.id(),
                                Offset::Offset(value),
                            )
                            .map_err(|e| format!("Failed to set timestamp: {}", e))?;
                        }
                        let resolved = consumer
                            .offsets_for_times(tpl.clone(), Duration::from_secs(10))
                            .map_err(|e| format!("Failed to get offsets for timestamp: {}", e))?;

                        // Partitions with no message at/after the timestamp come back
                        // as End/Invalid; fall back to the high watermark for those.
                        let mut fixed = TopicPartitionList::new();
                        for elem in resolved.elements() {
                            let offset = match elem.offset().to_raw() {
                                Some(o) if o >= 0 => Offset::Offset(o),
                                _ => {
                                    let (_low, high) = consumer
                                        .fetch_watermarks(
                                            elem.topic(),
                                            elem.partition(),
                                            Duration::from_secs(10),
                                        )
                                        .map_err(|e| format!("Failed to fetch watermarks: {}", e))?;
                                    Offset::Offset(high)
                                }
                            };
                            fixed
                                .add_partition_offset(elem.topic(), elem.partition(), offset)
                                .map_err(|e| format!("Failed to set offset: {}", e))?;
                        }
                        tpl = fixed;
                    } else {
                        // Treat as a specific offset.
                        for partition in topic_metadata.partitions() {
                            tpl.set_partition_offset(
                                &topic,
                                partition.id(),
                                Offset::Offset(value),
                            )
                            .map_err(|e| format!("Failed to set offset: {}", e))?;
                        }
                    }
                }
            }

            consumer
                .commit(&tpl, CommitMode::Sync)
                .map_err(|e| format!("Failed to commit offsets: {}", e))?;

            Ok(())
        })
        .await
        .map_err(|e| format!("Offset reset task failed: {}", e))?
    }

    async fn fetch_messages(
        &self,
        topic: &str,
        partition: i32,
        offset: i64,
        limit: i32,
    ) -> Result<Vec<KafkaMessage>, String> {
        let topic = topic.to_string();
        let limit = limit.max(0) as usize;
        if limit == 0 {
            return Ok(Vec::new());
        }

        self.with_consumer(move |consumer| {
            // Determine the high watermark so we know when the partition is exhausted
            // and never poll past the available data.
            let (_low, high) = consumer
                .fetch_watermarks(&topic, partition, Duration::from_secs(10))
                .map_err(|e| format!("Failed to fetch watermarks: {}", e))?;

            if offset >= high {
                return Ok(Vec::new());
            }

            let mut tpl = TopicPartitionList::new();
            tpl.add_partition_offset(&topic, partition, Offset::Offset(offset))
                .map_err(|e| format!("Failed to set partition offset: {}", e))?;

            consumer
                .assign(&tpl)
                .map_err(|e| format!("Failed to assign partition: {}", e))?;

            let mut messages = Vec::new();
            let deadline = Instant::now() + Duration::from_secs(10);
            let mut next_offset = offset;

            // Poll until we hit the limit, reach the high watermark, or time out.
            // A single empty poll (broker warm-up / transient stall) does NOT end
            // the read, avoiding truncated results.
            let result = loop {
                if messages.len() >= limit || next_offset >= high {
                    break Ok(());
                }
                if Instant::now() >= deadline {
                    break Ok(());
                }

                match consumer.poll(Duration::from_millis(500)) {
                    Some(Ok(msg)) => {
                        let (key, key_binary) = match msg.key() {
                            Some(k) => {
                                let (s, b) = Self::decode_bytes(k);
                                (Some(s), b)
                            }
                            None => (None, false),
                        };
                        let (value, value_binary) = match msg.payload() {
                            Some(v) => {
                                let (s, b) = Self::decode_bytes(v);
                                (Some(s), b)
                            }
                            None => (None, false),
                        };

                        let headers = msg
                            .headers()
                            .map(|h| {
                                (0..h.count())
                                    .map(|i| {
                                        let header = h.get(i);
                                        MessageHeader {
                                            key: header.key.to_string(),
                                            value: String::from_utf8_lossy(
                                                header.value.unwrap_or(&[]),
                                            )
                                            .to_string(),
                                        }
                                    })
                                    .collect()
                            })
                            .unwrap_or_default();

                        next_offset = msg.offset() + 1;
                        messages.push(KafkaMessage {
                            topic: msg.topic().to_string(),
                            partition: msg.partition(),
                            offset: msg.offset(),
                            timestamp: msg.timestamp().to_millis(),
                            key,
                            value,
                            key_binary,
                            value_binary,
                            headers,
                        });
                    }
                    Some(Err(e)) => break Err(format!("Error fetching message: {}", e)),
                    None => continue, // keep polling until deadline / high watermark
                }
            };

            // Always release the assignment so it can't leak into the next call.
            let _ = consumer.unassign();
            result.map(|_| messages)
        })
        .await
    }

    async fn produce_message(
        &self,
        topic: &str,
        partition: Option<i32>,
        key: Option<&str>,
        value: &str,
        headers: Option<Vec<(String, String)>>,
    ) -> Result<ProduceResult, String> {
        let mut record = FutureRecord::to(topic).payload(value);

        if let Some(k) = key {
            record = record.key(k);
        }

        if let Some(p) = partition {
            record = record.partition(p);
        }

        let owned_headers: Option<OwnedHeaders> = headers.map(|h| {
            let mut owned = OwnedHeaders::new();
            for (key, value) in h {
                owned = owned.insert(Header {
                    key: &key,
                    value: Some(value.as_bytes()),
                });
            }
            owned
        });

        if let Some(h) = owned_headers {
            record = record.headers(h);
        }

        let delivery_result = self
            .producer
            .send(record, Duration::from_secs(30))
            .await
            .map_err(|(e, _)| format!("Failed to produce message: {}", e))?;

        Ok(ProduceResult {
            topic: topic.to_string(),
            partition: delivery_result.0,
            offset: delivery_result.1,
        })
    }

    async fn close(&self) {
        // rdkafka clients are cleaned up on drop
    }
}

impl KafkaDriver {
    fn parse_group_state(state: &str) -> ConsumerGroupState {
        match state.to_lowercase().as_str() {
            "stable" => ConsumerGroupState::Stable,
            "preparingrebalance" => ConsumerGroupState::PreparingRebalance,
            "completingrebalance" => ConsumerGroupState::CompletingRebalance,
            "dead" => ConsumerGroupState::Dead,
            "empty" => ConsumerGroupState::Empty,
            _ => ConsumerGroupState::Unknown,
        }
    }
}
