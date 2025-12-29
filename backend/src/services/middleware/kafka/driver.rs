//! Kafka driver implementation
//!
//! Implements the MessageQueueDriver trait for Apache Kafka.

use std::collections::HashMap;
use std::time::Duration;

use async_trait::async_trait;
use rdkafka::admin::{AdminClient, AdminOptions, NewTopic, TopicReplication};
use rdkafka::client::DefaultClientContext;
use rdkafka::config::ClientConfig;
use rdkafka::consumer::{BaseConsumer, Consumer};
use rdkafka::message::{Header, Headers, Message, OwnedHeaders};
use rdkafka::producer::{FutureProducer, FutureRecord};
use rdkafka::Offset;

use crate::models::{
    BrokerInfo, ClusterInfo, ConsumerGroupInfo, ConsumerGroupListItem, ConsumerGroupMember,
    ConsumerGroupOffset, ConsumerGroupState, KafkaMessage, MessageHeader, PartitionInfo,
    ProduceResult, SaslMechanism, SecurityProtocol, TopicConfig, TopicInfo, TopicListItem,
};
use crate::services::middleware::traits::MessageQueueDriver;

/// Kafka driver implementing the MessageQueueDriver trait
pub struct KafkaDriver {
    admin_client: AdminClient<DefaultClientContext>,
    consumer: BaseConsumer,
    producer: FutureProducer,
    #[allow(dead_code)]
    bootstrap_servers: String,
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
        let mut config = Self::build_client_config(
            &servers,
            security_protocol,
            sasl_mechanism,
            username,
            password,
        );

        // Create admin client
        let admin_client: AdminClient<DefaultClientContext> = config
            .create()
            .map_err(|e| format!("Failed to create admin client: {}", e))?;

        // Create consumer for fetching messages
        config.set("group.id", "zwd-opsbot-admin");
        config.set("enable.auto.commit", "false");
        config.set("auto.offset.reset", "earliest");

        let consumer: BaseConsumer = config
            .create()
            .map_err(|e| format!("Failed to create consumer: {}", e))?;

        // Create producer for sending messages
        let producer: FutureProducer = config
            .create()
            .map_err(|e| format!("Failed to create producer: {}", e))?;

        Ok(Self {
            admin_client,
            consumer,
            producer,
            bootstrap_servers: servers,
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

    /// Get topic partition information
    async fn get_partition_info(&self, topic: &str) -> Result<Vec<PartitionInfo>, String> {
        let metadata = self
            .consumer
            .fetch_metadata(Some(topic), Duration::from_secs(10))
            .map_err(|e| format!("Failed to fetch metadata: {}", e))?;

        let topic_metadata = metadata
            .topics()
            .iter()
            .find(|t| t.name() == topic)
            .ok_or_else(|| format!("Topic '{}' not found", topic))?;

        let mut partitions = Vec::new();
        for partition in topic_metadata.partitions() {
            let (earliest, latest) = self.get_partition_offsets(topic, partition.id())?;
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
    }

    /// Get partition offset range
    fn get_partition_offsets(&self, topic: &str, partition: i32) -> Result<(i64, i64), String> {
        let (low, high) = self
            .consumer
            .fetch_watermarks(topic, partition, Duration::from_secs(10))
            .map_err(|e| format!("Failed to fetch watermarks: {}", e))?;
        Ok((low, high))
    }
}

#[async_trait]
impl MessageQueueDriver for KafkaDriver {
    async fn test_connection(&self) -> Result<(), String> {
        self.consumer
            .fetch_metadata(None, Duration::from_secs(10))
            .map_err(|e| format!("Connection test failed: {}", e))?;
        Ok(())
    }

    async fn get_cluster_info(&self) -> Result<ClusterInfo, String> {
        let metadata = self
            .consumer
            .fetch_metadata(None, Duration::from_secs(10))
            .map_err(|e| format!("Failed to fetch metadata: {}", e))?;

        let cluster_id = metadata
            .orig_broker_name()
            .to_string();

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
            controller_id: 0, // Not directly available in rdkafka
            brokers,
            topic_count: metadata.topics().len(),
        })
    }

    async fn list_topics(&self) -> Result<Vec<TopicListItem>, String> {
        let metadata = self
            .consumer
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
        let groups = self
            .admin_client
            .inner()
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
    }

    async fn get_consumer_group(&self, group_id: &str) -> Result<ConsumerGroupInfo, String> {
        let groups = self
            .admin_client
            .inner()
            .fetch_group_list(Some(group_id), Duration::from_secs(10))
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
    }

    async fn get_consumer_group_offsets(
        &self,
        _group_id: &str,
    ) -> Result<Vec<ConsumerGroupOffset>, String> {
        // TODO: This requires creating a consumer with the group ID to fetch committed offsets
        // For now, return empty - full implementation needs group coordinator protocol
        Ok(Vec::new())
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
        use rdkafka::consumer::CommitMode;
        use rdkafka::TopicPartitionList;

        // Get topic metadata to find all partitions
        let metadata = self
            .consumer
            .fetch_metadata(Some(topic), Duration::from_secs(10))
            .map_err(|e| format!("Failed to fetch topic metadata: {}", e))?;

        let topic_metadata = metadata
            .topics()
            .iter()
            .find(|t| t.name() == topic)
            .ok_or_else(|| format!("Topic '{}' not found", topic))?;

        if topic_metadata.partitions().is_empty() {
            return Err(format!("Topic '{}' has no partitions", topic));
        }

        // Create a temporary consumer with the target group ID
        let mut config = ClientConfig::new();
        config.set("bootstrap.servers", self.bootstrap_servers.clone());
        config.set("group.id", group_id);
        config.set("enable.auto.commit", "false");

        let temp_consumer: BaseConsumer = config
            .create()
            .map_err(|e| format!("Failed to create consumer for offset reset: {}", e))?;

        // Build the topic partition list
        let mut tpl = TopicPartitionList::new();
        for partition in topic_metadata.partitions() {
            tpl.add_partition(topic, partition.id());
        }

        // Determine the target offsets based on reset type
        match reset_type {
            "earliest" => {
                // Get earliest offsets using watermarks
                for partition in topic_metadata.partitions() {
                    let (low, _high) = temp_consumer
                        .fetch_watermarks(topic, partition.id(), Duration::from_secs(10))
                        .map_err(|e| format!("Failed to fetch watermarks: {}", e))?;
                    tpl.set_partition_offset(topic, partition.id(), Offset::Offset(low))
                        .map_err(|e| format!("Failed to set offset: {}", e))?;
                }
            }
            "latest" => {
                // Get latest offsets using watermarks
                for partition in topic_metadata.partitions() {
                    let (_low, high) = temp_consumer
                        .fetch_watermarks(topic, partition.id(), Duration::from_secs(10))
                        .map_err(|e| format!("Failed to fetch watermarks: {}", e))?;
                    tpl.set_partition_offset(topic, partition.id(), Offset::Offset(high))
                        .map_err(|e| format!("Failed to set offset: {}", e))?;
                }
            }
            _ => {
                // Parse as timestamp or specific offset
                if let Ok(timestamp) = reset_type.parse::<i64>() {
                    // If it's a large number, treat it as timestamp (milliseconds)
                    if timestamp > 1_000_000_000_000 {
                        // Use offsets_for_times to find offsets for the given timestamp
                        for partition in topic_metadata.partitions() {
                            tpl.set_partition_offset(
                                topic,
                                partition.id(),
                                Offset::Offset(timestamp),
                            )
                            .map_err(|e| format!("Failed to set offset: {}", e))?;
                        }
                        let offsets = temp_consumer
                            .offsets_for_times(tpl.clone(), Duration::from_secs(10))
                            .map_err(|e| format!("Failed to get offsets for timestamp: {}", e))?;
                        tpl = offsets;
                    } else {
                        // Treat as specific offset
                        for partition in topic_metadata.partitions() {
                            tpl.set_partition_offset(
                                topic,
                                partition.id(),
                                Offset::Offset(timestamp),
                            )
                            .map_err(|e| format!("Failed to set offset: {}", e))?;
                        }
                    }
                } else {
                    return Err(format!("Invalid reset type: {}", reset_type));
                }
            }
        }

        // Commit the offsets to the consumer group
        temp_consumer
            .commit(&tpl, CommitMode::Sync)
            .map_err(|e| format!("Failed to commit offsets: {}", e))?;

        Ok(())
    }

    async fn fetch_messages(
        &self,
        topic: &str,
        partition: i32,
        offset: i64,
        limit: i32,
    ) -> Result<Vec<KafkaMessage>, String> {
        use rdkafka::TopicPartitionList;

        let mut tpl = TopicPartitionList::new();
        tpl.add_partition_offset(topic, partition, Offset::Offset(offset))
            .map_err(|e| format!("Failed to set partition offset: {}", e))?;

        self.consumer
            .assign(&tpl)
            .map_err(|e| format!("Failed to assign partition: {}", e))?;

        let mut messages = Vec::new();
        let timeout = Duration::from_secs(5);

        for _ in 0..limit {
            match self.consumer.poll(timeout) {
                Some(Ok(msg)) => {
                    let headers = msg
                        .headers()
                        .map(|h| {
                            (0..h.count())
                                .map(|i| {
                                    let header = h.get(i);
                                    MessageHeader {
                                        key: header.key.to_string(),
                                        value: String::from_utf8_lossy(header.value.unwrap_or(&[]))
                                            .to_string(),
                                    }
                                })
                                .collect()
                        })
                        .unwrap_or_default();

                    messages.push(KafkaMessage {
                        topic: msg.topic().to_string(),
                        partition: msg.partition(),
                        offset: msg.offset(),
                        timestamp: msg.timestamp().to_millis(),
                        key: msg.key().map(|k| String::from_utf8_lossy(k).to_string()),
                        value: msg.payload().map(|v| String::from_utf8_lossy(v).to_string()),
                        headers,
                    });
                }
                Some(Err(e)) => {
                    return Err(format!("Error fetching message: {}", e));
                }
                None => break, // No more messages
            }
        }

        Ok(messages)
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
