//! Container listing, logs and resource stats for the local Docker driver.
//! Method bodies extracted from `mod.rs` verbatim. No logic changes.

use super::*;
use super::parsing::calculate_cpu_percent;
use bollard::container::{ListContainersOptions, LogsOptions};
use crate::models::docker::PortMapping;

impl LocalDockerDriver {
    pub(super) async fn list_containers_impl(&self, all: bool) -> Result<Vec<ContainerInfo>, String> {
        with_docker_timeout(DOCKER_TIMEOUT_SECS, "list_containers", async {
            let options = ListContainersOptions::<String> {
                all,
                ..Default::default()
            };

            let containers = self
                .client
                .list_containers(Some(options))
                .await
                .map_err(|e| format!("Failed to list containers: {}", e))?;

            let mut result = Vec::new();
            for container in containers {
                let ports = container
                    .ports
                    .unwrap_or_default()
                    .into_iter()
                    .map(|p| PortMapping {
                        container_port: p.private_port,
                        host_port: p.public_port,
                        protocol: p.typ.map(|t| t.to_string()).unwrap_or_else(|| "tcp".to_string()),
                        host_ip: p.ip,
                    })
                    .collect();

                let name = container
                    .names
                    .as_ref()
                    .and_then(|n| n.first())
                    .map(|n| n.trim_start_matches('/').to_string())
                    .unwrap_or_default();

                result.push(ContainerInfo {
                    id: container.id.unwrap_or_default(),
                    name,
                    image: container.image.unwrap_or_default(),
                    status: container.status.unwrap_or_default(),
                    state: container.state.unwrap_or_default(),
                    created: container.created.unwrap_or(0),
                    ports,
                });
            }

            Ok(result)
        }).await
    }

    pub(super) async fn get_container_logs_impl(
        &self,
        container_id: &str,
        tail: Option<u32>,
    ) -> Result<String, String> {
        with_docker_timeout(DOCKER_TIMEOUT_SECS, "get_container_logs", async {
            let options = LogsOptions::<String> {
                stdout: true,
                stderr: true,
                tail: tail.map(|t| t.to_string()).unwrap_or_else(|| "100".to_string()),
                ..Default::default()
            };

            let mut logs_stream = self.client.logs(container_id, Some(options));
            // Accumulate raw bytes and decode once at the end: decoding each
            // frame independently corrupts a multibyte (e.g. CJK) character that
            // Docker split across frame boundaries into U+FFFD.
            let mut bytes: Vec<u8> = Vec::new();

            while let Some(log_result) = logs_stream.next().await {
                match log_result {
                    Ok(log) => {
                        bytes.extend_from_slice(&log.into_bytes());
                    }
                    Err(e) => {
                        return Err(format!("Failed to get container logs: {}", e));
                    }
                }
            }

            Ok(String::from_utf8_lossy(&bytes).to_string())
        }).await
    }

    pub(super) async fn get_container_stats_impl(&self, container_id: &str) -> Result<ContainerStats, String> {
        with_docker_timeout(DOCKER_TIMEOUT_SECS, "get_container_stats", async {
            use bollard::container::StatsOptions;
            use chrono::Utc;

            // one_shot must be false: with one_shot=true the daemon skips the
            // priming read, so precpu_stats is empty and CPU% is computed from
            // lifetime totals (essentially always wrong). stream=false still
            // returns a single sample, but the daemon takes two internal reads.
            let options = StatsOptions {
                stream: false,
                one_shot: false,
            };

            let mut stats_stream = self.client.stats(container_id, Some(options));

            if let Some(result) = stats_stream.next().await {
                let stats = result.map_err(|e| format!("Failed to get container stats: {}", e))?;

                let cpu_percent = calculate_cpu_percent(&stats);

                let memory_usage = stats.memory_stats.usage.unwrap_or(0);
                let memory_limit = stats.memory_stats.limit.unwrap_or(1);
                let memory_percent = if memory_limit > 0 {
                    (memory_usage as f64 / memory_limit as f64) * 100.0
                } else {
                    0.0
                };

                let (network_rx, network_tx) = if let Some(networks) = &stats.networks {
                    networks.values().fold((0u64, 0u64), |(rx, tx), net| {
                        (rx + net.rx_bytes, tx + net.tx_bytes)
                    })
                } else {
                    (0, 0)
                };

                let (block_read, block_write) = if let Some(blkio) = &stats.blkio_stats.io_service_bytes_recursive {
                    blkio.iter().fold((0u64, 0u64), |(read, write), entry| {
                        match entry.op.as_str() {
                            "read" | "Read" => (read + entry.value, write),
                            "write" | "Write" => (read, write + entry.value),
                            _ => (read, write),
                        }
                    })
                } else {
                    (0, 0)
                };

                let name = stats.name.trim_start_matches('/').to_string();

                Ok(ContainerStats {
                    container_id: container_id.to_string(),
                    name,
                    cpu_percent,
                    memory_usage,
                    memory_limit,
                    memory_percent,
                    network_rx,
                    network_tx,
                    block_read,
                    block_write,
                    timestamp: Utc::now().timestamp(),
                })
            } else {
                Err("No stats available for container".to_string())
            }
        }).await
    }
}
