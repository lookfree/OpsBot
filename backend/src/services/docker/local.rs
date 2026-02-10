//! Local Docker driver implementation
//!
//! Connects to local Docker daemon via Unix socket or Windows named pipe.

use async_trait::async_trait;
use log::info;
use bollard::container::{
    ListContainersOptions, LogsOptions, RemoveContainerOptions, RestartContainerOptions,
    StartContainerOptions, StopContainerOptions,
};
use bollard::image::{ListImagesOptions, RemoveImageOptions};
use bollard::network::{CreateNetworkOptions, ListNetworksOptions};
use bollard::volume::{CreateVolumeOptions, ListVolumesOptions, RemoveVolumeOptions};
use bollard::Docker;
use futures::channel::mpsc::UnboundedSender;
use futures::StreamExt;
use parking_lot::RwLock;
use tokio::io::AsyncWriteExt;
use tokio::time::{timeout, Duration};
use std::collections::HashMap;
use std::path::Path;
use std::sync::Arc;

const DOCKER_TIMEOUT_SECS: u64 = 30;
const DOCKER_SLOW_TIMEOUT_SECS: u64 = 300;

async fn with_docker_timeout<T>(
    secs: u64,
    op: &str,
    fut: impl std::future::Future<Output = Result<T, String>>,
) -> Result<T, String> {
    timeout(Duration::from_secs(secs), fut)
        .await
        .map_err(|_| format!("{} timed out after {}s", op, secs))?
}

use super::compose_cmd::{run_compose_action, run_compose_checked, validate_compose_path, validate_project_name};
use super::registry_helpers::{load_registries, save_registries, test_registry_connection};
use super::traits::DockerDriver;
use crate::models::docker::{
    ComposeContainer, ComposeProject, ComposeSource, ContainerInfo, ContainerStats,
    CreateComposeRequest, CreateNetworkRequest, CreateRegistryRequest, CreateVolumeRequest,
    DockerInfo, DockerSettings, DockerStats, DockerTestResult, ImageInfo, NetworkContainer,
    NetworkDetail, NetworkInfo, PortMapping, PruneResult, RegistryImage, RegistryInfo,
    RegistryStatus, RegistryType, UpdateComposeRequest, UpdateRegistryRequest, VolumeInfo,
};

/// Active exec session with input channel
struct ExecSession {
    input_tx: UnboundedSender<Vec<u8>>,
    _container_id: String,
}

/// Local Docker driver using Bollard library
pub struct LocalDockerDriver {
    client: Docker,
    exec_sessions: Arc<RwLock<HashMap<String, ExecSession>>>,
}

/// Get possible Docker socket paths for the current platform
fn get_docker_socket_paths() -> Vec<String> {
    let mut paths = Vec::new();

    #[cfg(unix)]
    {
        // Standard Linux/macOS path
        paths.push("/var/run/docker.sock".to_string());

        // macOS Docker Desktop paths
        if let Ok(home) = std::env::var("HOME") {
            paths.push(format!("{}/.docker/run/docker.sock", home));
        }
        paths.push("/Users/Shared/.docker/run/docker.sock".to_string());

        // Colima (alternative Docker runtime for macOS)
        if let Ok(home) = std::env::var("HOME") {
            paths.push(format!("{}/.colima/default/docker.sock", home));
        }

        // Rancher Desktop
        if let Ok(home) = std::env::var("HOME") {
            paths.push(format!("{}/.rd/docker.sock", home));
        }
    }

    paths
}

/// Try to connect to Docker using multiple socket paths
fn connect_to_docker() -> Result<Docker, String> {
    // First try the default connection
    if let Ok(client) = Docker::connect_with_local_defaults() {
        return Ok(client);
    }

    // Try each socket path
    for socket_path in get_docker_socket_paths() {
        if Path::new(&socket_path).exists() {
            let socket_url = format!("unix://{}", socket_path);
            if let Ok(client) = Docker::connect_with_socket(&socket_url, 120, bollard::API_DEFAULT_VERSION) {
                return Ok(client);
            }
        }
    }

    // Return a helpful error message
    let tried_paths = get_docker_socket_paths().join(", ");
    Err(format!(
        "Failed to connect to local Docker. Tried paths: {}. Make sure Docker Desktop is running.",
        tried_paths
    ))
}

impl LocalDockerDriver {
    /// Create a new local Docker driver
    pub async fn connect() -> Result<Self, String> {
        let client = connect_to_docker()?;
        Ok(Self {
            client,
            exec_sessions: Arc::new(RwLock::new(HashMap::new())),
        })
    }

    /// Test connection to local Docker
    pub async fn test() -> Result<DockerTestResult, String> {
        let client = connect_to_docker()?;

        match client.version().await {
            Ok(version) => Ok(DockerTestResult {
                success: true,
                version: version.version,
                api_version: version.api_version,
                error: None,
            }),
            Err(e) => Ok(DockerTestResult {
                success: false,
                version: None,
                api_version: None,
                error: Some(e.to_string()),
            }),
        }
    }
}

#[async_trait]
impl DockerDriver for LocalDockerDriver {
    async fn test_connection(&self) -> Result<DockerTestResult, String> {
        with_docker_timeout(DOCKER_TIMEOUT_SECS, "test_connection", async {
            match self.client.version().await {
                Ok(version) => Ok(DockerTestResult {
                    success: true,
                    version: version.version,
                    api_version: version.api_version,
                    error: None,
                }),
                Err(e) => Ok(DockerTestResult {
                    success: false,
                    version: None,
                    api_version: None,
                    error: Some(e.to_string()),
                }),
            }
        }).await
    }

    async fn list_containers(&self, all: bool) -> Result<Vec<ContainerInfo>, String> {
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

    async fn start_container(&self, container_id: &str) -> Result<(), String> {
        with_docker_timeout(DOCKER_TIMEOUT_SECS, "start_container", async {
            self.client
                .start_container(container_id, None::<StartContainerOptions<String>>)
                .await
                .map_err(|e| format!("Failed to start container: {}", e))
        }).await
    }

    async fn stop_container(&self, container_id: &str) -> Result<(), String> {
        with_docker_timeout(DOCKER_TIMEOUT_SECS, "stop_container", async {
            self.client
                .stop_container(container_id, Some(StopContainerOptions { t: 10 }))
                .await
                .map_err(|e| format!("Failed to stop container: {}", e))
        }).await
    }

    async fn restart_container(&self, container_id: &str) -> Result<(), String> {
        with_docker_timeout(DOCKER_TIMEOUT_SECS, "restart_container", async {
            self.client
                .restart_container(container_id, Some(RestartContainerOptions { t: 10 }))
                .await
                .map_err(|e| format!("Failed to restart container: {}", e))
        }).await
    }

    async fn remove_container(&self, container_id: &str, force: bool) -> Result<(), String> {
        with_docker_timeout(DOCKER_TIMEOUT_SECS, "remove_container", async {
            let options = RemoveContainerOptions {
                force,
                ..Default::default()
            };
            self.client
                .remove_container(container_id, Some(options))
                .await
                .map_err(|e| format!("Failed to remove container: {}", e))
        }).await
    }

    async fn get_container_logs(
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
            let mut output = String::new();

            while let Some(log_result) = logs_stream.next().await {
                match log_result {
                    Ok(log) => {
                        output.push_str(&log.to_string());
                    }
                    Err(e) => {
                        return Err(format!("Failed to get container logs: {}", e));
                    }
                }
            }

            Ok(output)
        }).await
    }

    async fn list_images(&self) -> Result<Vec<ImageInfo>, String> {
        with_docker_timeout(DOCKER_TIMEOUT_SECS, "list_images", async {
            let options = ListImagesOptions::<String> {
                all: false,
                ..Default::default()
            };

            let images = self
                .client
                .list_images(Some(options))
                .await
                .map_err(|e| format!("Failed to list images: {}", e))?;

            let result = images
                .into_iter()
                .map(|img| ImageInfo {
                    id: img.id,
                    tags: img.repo_tags,
                    size: img.size as u64,
                    created: img.created,
                })
                .collect();

            Ok(result)
        }).await
    }

    async fn pull_image(&self, image: &str) -> Result<(), String> {
        with_docker_timeout(DOCKER_SLOW_TIMEOUT_SECS, "pull_image", async {
            use bollard::image::CreateImageOptions;

            let options = CreateImageOptions {
                from_image: image,
                ..Default::default()
            };

            let mut stream = self.client.create_image(Some(options), None, None);

            while let Some(result) = stream.next().await {
                match result {
                    Ok(_info) => {
                        // Progress info available but not used for now
                    }
                    Err(e) => {
                        return Err(format!("Failed to pull image: {}", e));
                    }
                }
            }

            Ok(())
        }).await
    }

    async fn remove_image(&self, image_id: &str, force: bool) -> Result<(), String> {
        with_docker_timeout(DOCKER_TIMEOUT_SECS, "remove_image", async {
            let options = RemoveImageOptions {
                force,
                ..Default::default()
            };

            self.client
                .remove_image(image_id, Some(options), None)
                .await
                .map_err(|e| format!("Failed to remove image: {}", e))?;

            Ok(())
        }).await
    }

    // ========== 概览页面方法 ==========

    async fn get_info(&self) -> Result<DockerInfo, String> {
        with_docker_timeout(DOCKER_TIMEOUT_SECS, "get_info", async {
            let info = self.client.info().await
                .map_err(|e| format!("Failed to get Docker info: {}", e))?;

            let version = self.client.version().await
                .map_err(|e| format!("Failed to get Docker version: {}", e))?;

            Ok(DockerInfo {
                version: version.version.unwrap_or_default(),
                api_version: version.api_version.unwrap_or_default(),
                os: version.os.unwrap_or_default(),
                arch: version.arch.unwrap_or_default(),
                kernel_version: version.kernel_version.unwrap_or_default(),
                root_dir: info.docker_root_dir.unwrap_or_default(),
                storage_driver: info.driver.unwrap_or_default(),
                containers_running: info.containers_running.unwrap_or(0) as u32,
                containers_paused: info.containers_paused.unwrap_or(0) as u32,
                containers_stopped: info.containers_stopped.unwrap_or(0) as u32,
                images: info.images.unwrap_or(0) as u32,
                memory_total: info.mem_total.unwrap_or(0) as u64,
                cpus: info.ncpu.unwrap_or(0) as u32,
            })
        }).await
    }

    async fn get_stats(&self) -> Result<DockerStats, String> {
        with_docker_timeout(DOCKER_TIMEOUT_SECS, "get_stats", async {
            let info = self.client.info().await
                .map_err(|e| format!("Failed to get Docker info: {}", e))?;

            // Get images total size
            let images = self.list_images().await?;
            let images_size: u64 = images.iter().map(|i| i.size).sum();

            let containers_running = info.containers_running.unwrap_or(0) as u32;
            let containers_stopped = info.containers_stopped.unwrap_or(0) as u32;
            let containers_paused = info.containers_paused.unwrap_or(0) as u32;

            Ok(DockerStats {
                containers_running,
                containers_stopped: containers_stopped + containers_paused,
                containers_total: containers_running + containers_stopped + containers_paused,
                images_count: info.images.unwrap_or(0) as u32,
                images_size,
            })
        }).await
    }

    // ========== 设置页面方法 ==========

    async fn get_settings(&self) -> Result<DockerSettings, String> {
        with_docker_timeout(DOCKER_TIMEOUT_SECS, "get_settings", async {
            let info = self.client.info().await
                .map_err(|e| format!("Failed to get Docker info: {}", e))?;

            Ok(DockerSettings {
                registry_mirrors: info.registry_config
                    .as_ref()
                    .and_then(|rc| rc.mirrors.clone())
                    .unwrap_or_default(),
                storage_path: info.docker_root_dir.clone().unwrap_or_default(),
                socket_path: "/var/run/docker.sock".to_string(),
                cgroup_driver: info.cgroup_driver.as_ref()
                    .map(|d| format!("{:?}", d))
                    .unwrap_or_else(|| "unknown".to_string()),
                live_restore: info.live_restore_enabled.unwrap_or(false),
                ipv6_enabled: info.ipv4_forwarding.unwrap_or(false),
            })
        }).await
    }

    async fn update_registry_mirrors(&self, _mirrors: Vec<String>) -> Result<(), String> {
        // Note: Updating daemon.json requires system-level access
        // This is typically done by modifying /etc/docker/daemon.json
        // For local Docker, this would require elevated privileges
        Err("Updating registry mirrors for local Docker requires manual configuration. Please edit /etc/docker/daemon.json (Linux) or Docker Desktop settings.".to_string())
    }

    async fn stop_daemon(&self) -> Result<(), String> {
        // Stopping local Docker daemon requires system-level access
        Err("Stopping local Docker daemon requires system privileges. Please use 'sudo systemctl stop docker' (Linux) or Docker Desktop.".to_string())
    }

    async fn restart_daemon(&self) -> Result<(), String> {
        // Restarting local Docker daemon requires system-level access
        Err("Restarting local Docker daemon requires system privileges. Please use 'sudo systemctl restart docker' (Linux) or Docker Desktop.".to_string())
    }

    // ========== 网络管理 (第二期) ==========

    async fn list_networks(&self) -> Result<Vec<NetworkInfo>, String> {
        with_docker_timeout(DOCKER_TIMEOUT_SECS, "list_networks", async {
            let options = ListNetworksOptions::<String> {
                ..Default::default()
            };

            let networks = self
                .client
                .list_networks(Some(options))
                .await
                .map_err(|e| format!("Failed to list networks: {}", e))?;

            let result = networks
                .into_iter()
                .map(|net| {
                    let ipam_config = net.ipam.as_ref().and_then(|ipam| {
                        ipam.config.as_ref().and_then(|configs| configs.first())
                    });

                    NetworkInfo {
                        id: net.id.unwrap_or_default(),
                        name: net.name.unwrap_or_default(),
                        driver: net.driver.unwrap_or_default(),
                        scope: net.scope.unwrap_or_default(),
                        created: net.created.unwrap_or_default(),
                        ipam_subnet: ipam_config.and_then(|c| c.subnet.clone()),
                        ipam_gateway: ipam_config.and_then(|c| c.gateway.clone()),
                        containers_count: net.containers.as_ref().map(|c| c.len() as u32).unwrap_or(0),
                        internal: net.internal.unwrap_or(false),
                    }
                })
                .collect();

            Ok(result)
        }).await
    }

    async fn inspect_network(&self, network_id: &str) -> Result<NetworkDetail, String> {
        with_docker_timeout(DOCKER_TIMEOUT_SECS, "inspect_network", async {
            let network = self
                .client
                .inspect_network::<String>(network_id, None)
                .await
                .map_err(|e| format!("Failed to inspect network: {}", e))?;

            let ipam_config = network.ipam.as_ref().and_then(|ipam| {
                ipam.config.as_ref().and_then(|configs| configs.first())
            });

            let containers: Vec<NetworkContainer> = network
                .containers
                .as_ref()
                .map(|c| {
                    c.iter()
                        .map(|(id, info)| NetworkContainer {
                            container_id: id.clone(),
                            name: info.name.clone().unwrap_or_default(),
                            ipv4_address: info.ipv4_address.clone(),
                            ipv6_address: info.ipv6_address.clone(),
                            mac_address: info.mac_address.clone(),
                        })
                        .collect()
                })
                .unwrap_or_default();

            let info = NetworkInfo {
                id: network.id.clone().unwrap_or_default(),
                name: network.name.clone().unwrap_or_default(),
                driver: network.driver.clone().unwrap_or_default(),
                scope: network.scope.clone().unwrap_or_default(),
                created: network.created.clone().unwrap_or_default(),
                ipam_subnet: ipam_config.and_then(|c| c.subnet.clone()),
                ipam_gateway: ipam_config.and_then(|c| c.gateway.clone()),
                containers_count: containers.len() as u32,
                internal: network.internal.unwrap_or(false),
            };

            Ok(NetworkDetail {
                info,
                containers,
                options: network.options.unwrap_or_default(),
                labels: network.labels.unwrap_or_default(),
            })
        }).await
    }

    async fn create_network(&self, config: CreateNetworkRequest) -> Result<String, String> {
        with_docker_timeout(DOCKER_TIMEOUT_SECS, "create_network", async {
            use bollard::models::IpamConfig;

            let ipam_config = if config.subnet.is_some() || config.gateway.is_some() {
                Some(bollard::models::Ipam {
                    driver: Some("default".to_string()),
                    config: Some(vec![IpamConfig {
                        subnet: config.subnet,
                        gateway: config.gateway,
                        ..Default::default()
                    }]),
                    options: None,
                })
            } else {
                None
            };

            let labels_owned = config.labels.unwrap_or_default();
            let labels: HashMap<&str, &str> = labels_owned
                .iter()
                .map(|(k, v)| (k.as_str(), v.as_str()))
                .collect();

            let options = CreateNetworkOptions {
                name: config.name.as_str(),
                driver: config.driver.as_deref().unwrap_or("bridge"),
                internal: config.internal.unwrap_or(false),
                ipam: ipam_config.unwrap_or_default(),
                labels,
                ..Default::default()
            };

            let response = self
                .client
                .create_network(options)
                .await
                .map_err(|e| format!("Failed to create network: {}", e))?;

            Ok(response.id)
        }).await
    }

    async fn remove_network(&self, network_id: &str) -> Result<(), String> {
        with_docker_timeout(DOCKER_TIMEOUT_SECS, "remove_network", async {
            self.client
                .remove_network(network_id)
                .await
                .map_err(|e| format!("Failed to remove network: {}", e))
        }).await
    }

    async fn connect_container_to_network(
        &self,
        network_id: &str,
        container_id: &str,
    ) -> Result<(), String> {
        with_docker_timeout(DOCKER_TIMEOUT_SECS, "connect_container_to_network", async {
            use bollard::network::ConnectNetworkOptions;
            use bollard::models::EndpointSettings;

            let options = ConnectNetworkOptions {
                container: container_id,
                endpoint_config: EndpointSettings::default(),
            };

            self.client
                .connect_network(network_id, options)
                .await
                .map_err(|e| format!("Failed to connect container to network: {}", e))
        }).await
    }

    async fn disconnect_container_from_network(
        &self,
        network_id: &str,
        container_id: &str,
    ) -> Result<(), String> {
        with_docker_timeout(DOCKER_TIMEOUT_SECS, "disconnect_container_from_network", async {
            use bollard::network::DisconnectNetworkOptions;

            let options = DisconnectNetworkOptions {
                container: container_id,
                force: false,
            };

            self.client
                .disconnect_network(network_id, options)
                .await
                .map_err(|e| format!("Failed to disconnect container from network: {}", e))
        }).await
    }

    async fn prune_networks(&self) -> Result<PruneResult, String> {
        with_docker_timeout(DOCKER_TIMEOUT_SECS, "prune_networks", async {
            let result = self
                .client
                .prune_networks::<String>(None)
                .await
                .map_err(|e| format!("Failed to prune networks: {}", e))?;

            Ok(PruneResult {
                deleted_count: result.networks_deleted.as_ref().map(|n| n.len() as u32).unwrap_or(0),
                space_reclaimed: 0,
            })
        }).await
    }

    // ========== 存储卷管理 (第二期) ==========

    async fn list_volumes(&self) -> Result<Vec<VolumeInfo>, String> {
        with_docker_timeout(DOCKER_TIMEOUT_SECS, "list_volumes", async {
            let options = ListVolumesOptions::<String> {
                ..Default::default()
            };

            let response = self
                .client
                .list_volumes(Some(options))
                .await
                .map_err(|e| format!("Failed to list volumes: {}", e))?;

            let volumes = response.volumes.unwrap_or_default();
            let result = volumes
                .into_iter()
                .map(|vol| {
                    let scope = vol.scope
                        .map(|s| format!("{:?}", s).to_lowercase())
                        .unwrap_or_else(|| "local".to_string());

                    VolumeInfo {
                        name: vol.name,
                        driver: vol.driver,
                        mountpoint: vol.mountpoint,
                        created: vol.created_at.unwrap_or_default(),
                        size: vol.usage_data.as_ref().map(|u| u.size as u64),
                        scope,
                        labels: vol.labels,
                    }
                })
                .collect();

            Ok(result)
        }).await
    }

    async fn create_volume(&self, config: CreateVolumeRequest) -> Result<String, String> {
        with_docker_timeout(DOCKER_TIMEOUT_SECS, "create_volume", async {
            let driver_opts_owned = config.driver_opts.unwrap_or_default();
            let driver_opts: HashMap<&str, &str> = driver_opts_owned
                .iter()
                .map(|(k, v)| (k.as_str(), v.as_str()))
                .collect();

            let labels_owned = config.labels.unwrap_or_default();
            let labels: HashMap<&str, &str> = labels_owned
                .iter()
                .map(|(k, v)| (k.as_str(), v.as_str()))
                .collect();

            let options = CreateVolumeOptions {
                name: config.name.as_str(),
                driver: config.driver.as_deref().unwrap_or("local"),
                driver_opts,
                labels,
            };

            let volume = self
                .client
                .create_volume(options)
                .await
                .map_err(|e| format!("Failed to create volume: {}", e))?;

            Ok(volume.name)
        }).await
    }

    async fn remove_volume(&self, volume_name: &str, force: bool) -> Result<(), String> {
        with_docker_timeout(DOCKER_TIMEOUT_SECS, "remove_volume", async {
            let options = RemoveVolumeOptions { force };

            self.client
                .remove_volume(volume_name, Some(options))
                .await
                .map_err(|e| format!("Failed to remove volume: {}", e))
        }).await
    }

    async fn prune_volumes(&self) -> Result<PruneResult, String> {
        with_docker_timeout(DOCKER_TIMEOUT_SECS, "prune_volumes", async {
            let result = self
                .client
                .prune_volumes::<String>(None)
                .await
                .map_err(|e| format!("Failed to prune volumes: {}", e))?;

            Ok(PruneResult {
                deleted_count: result.volumes_deleted.as_ref().map(|v| v.len() as u32).unwrap_or(0),
                space_reclaimed: result.space_reclaimed.unwrap_or(0) as u64,
            })
        }).await
    }

    // ========== 资源监控 (第二期) ==========

    async fn get_container_stats(&self, container_id: &str) -> Result<ContainerStats, String> {
        with_docker_timeout(DOCKER_TIMEOUT_SECS, "get_container_stats", async {
            use bollard::container::StatsOptions;
            use chrono::Utc;

            let options = StatsOptions {
                stream: false,
                one_shot: true,
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

    async fn exec_command(
        &self,
        container_id: &str,
        cmd: Vec<String>,
    ) -> Result<String, String> {
        with_docker_timeout(DOCKER_TIMEOUT_SECS, "exec_command", async {
            use bollard::exec::{CreateExecOptions, StartExecResults};
            use futures::StreamExt;

            let exec = self.client
                .create_exec(
                    container_id,
                    CreateExecOptions {
                        attach_stdout: Some(true),
                        attach_stderr: Some(true),
                        cmd: Some(cmd),
                        ..Default::default()
                    },
                )
                .await
                .map_err(|e| e.to_string())?;

            let output = self.client
                .start_exec(&exec.id, None)
                .await
                .map_err(|e| e.to_string())?;

            let mut result = String::new();
            if let StartExecResults::Attached { mut output, .. } = output {
                while let Some(msg) = output.next().await {
                    match msg {
                        Ok(log_output) => {
                            result.push_str(&log_output.to_string());
                        }
                        Err(e) => {
                            return Err(e.to_string());
                        }
                    }
                }
            }

            Ok(result)
        }).await
    }

    async fn exec_start_interactive(
        &self,
        container_id: &str,
        cmd: Vec<String>,
        cols: u16,
        rows: u16,
        output_tx: futures::channel::mpsc::UnboundedSender<Vec<u8>>,
    ) -> Result<String, String> {
        use bollard::exec::{CreateExecOptions, ResizeExecOptions, StartExecOptions, StartExecResults};
        use futures::channel::mpsc;
        use futures::SinkExt;

        // Create exec instance with TTY
        let exec = self.client
            .create_exec(
                container_id,
                CreateExecOptions {
                    attach_stdin: Some(true),
                    attach_stdout: Some(true),
                    attach_stderr: Some(true),
                    tty: Some(true),
                    cmd: Some(cmd),
                    ..Default::default()
                },
            )
            .await
            .map_err(|e| e.to_string())?;

        let exec_id = exec.id.clone();

        // Resize to initial size
        self.client
            .resize_exec(
                &exec_id,
                ResizeExecOptions {
                    height: rows,
                    width: cols,
                },
            )
            .await
            .map_err(|e| e.to_string())?;

        // Start exec with TTY
        let start_result = self.client
            .start_exec(
                &exec_id,
                Some(StartExecOptions {
                    detach: false,
                    tty: true,
                    output_capacity: None,
                }),
            )
            .await
            .map_err(|e| e.to_string())?;

        // Create input channel for this session
        let (input_tx, mut input_rx) = mpsc::unbounded::<Vec<u8>>();

        // Store the session
        {
            let mut sessions = self.exec_sessions.write();
            sessions.insert(exec_id.clone(), ExecSession {
                input_tx,
                _container_id: container_id.to_string(),
            });
        }

        // Spawn task to handle bidirectional streaming
        if let StartExecResults::Attached { mut output, mut input } = start_result {
            let exec_id_clone = exec_id.clone();
            let exec_sessions = self.exec_sessions.clone();

            tokio::spawn(async move {
                // Spawn input handler
                let input_handle = tokio::spawn(async move {
                    while let Some(data) = input_rx.next().await {
                        if input.write_all(&data).await.is_err() {
                            break;
                        }
                    }
                });

                // Handle output
                let mut output_tx = output_tx;
                while let Some(msg) = output.next().await {
                    match msg {
                        Ok(log_output) => {
                            let bytes = log_output.into_bytes().to_vec();
                            if output_tx.send(bytes).await.is_err() {
                                break;
                            }
                        }
                        Err(_) => break,
                    }
                }

                // Cleanup
                input_handle.abort();
                exec_sessions.write().remove(&exec_id_clone);
            });
        }

        Ok(exec_id)
    }

    async fn exec_send_data(&self, exec_id: &str, data: Vec<u8>) -> Result<(), String> {
        use futures::SinkExt;

        // Clone the sender outside the lock scope to avoid holding lock across await
        let tx = {
            let sessions = self.exec_sessions.read();
            sessions.get(exec_id).map(|s| s.input_tx.clone())
        };

        if let Some(mut tx) = tx {
            tx.send(data).await.map_err(|e| e.to_string())
        } else {
            Err("Exec session not found".to_string())
        }
    }

    async fn exec_resize(&self, exec_id: &str, cols: u16, rows: u16) -> Result<(), String> {
        with_docker_timeout(DOCKER_TIMEOUT_SECS, "exec_resize", async {
            use bollard::exec::ResizeExecOptions;

            self.client
                .resize_exec(
                    exec_id,
                    ResizeExecOptions {
                        height: rows,
                        width: cols,
                    },
                )
                .await
                .map_err(|e| e.to_string())
        }).await
    }

    async fn exec_close(&self, exec_id: &str) -> Result<(), String> {
        let mut sessions = self.exec_sessions.write();
        if sessions.remove(exec_id).is_some() {
            Ok(())
        } else {
            Err("Exec session not found".to_string())
        }
    }

    // ========== Docker Compose 编排 (第二期) ==========

    async fn list_compose_projects(&self) -> Result<Vec<ComposeProject>, String> {
        use chrono::Utc;

        // Run docker compose ls --format json (async)
        let stdout = run_compose_checked(
            &["compose", "ls", "--format", "json"],
            "docker compose ls"
        ).await?;
        if stdout.trim().is_empty() {
            return Ok(Vec::new());
        }

        // Parse JSON output
        let projects: Vec<serde_json::Value> = serde_json::from_str(&stdout)
            .map_err(|e| format!("Failed to parse compose ls output: {}", e))?;

        let mut result = Vec::new();
        for project in projects {
            let name = project["Name"].as_str().unwrap_or("").to_string();
            let status_str = project["Status"].as_str().unwrap_or("");
            let config_files = project["ConfigFiles"].as_str().unwrap_or("");

            // Parse status like "running(2)" or "exited(1)"
            let (running_count, total_count, status) = parse_compose_status(status_str);

            // Determine source based on path
            let source = if config_files.contains("/1panel/") || config_files.contains("/app-store/") {
                ComposeSource::AppStore
            } else {
                ComposeSource::Local
            };

            // Get path (first config file's directory)
            let path = if let Some(first_file) = config_files.split(',').next() {
                Path::new(first_file.trim())
                    .parent()
                    .map(|p| p.to_string_lossy().to_string())
                    .unwrap_or_default()
            } else {
                String::new()
            };

            // Get creation time from docker-compose.yml file
            let created_at = if !path.is_empty() {
                let compose_file = Path::new(&path).join("docker-compose.yml");
                if compose_file.exists() {
                    std::fs::metadata(&compose_file)
                        .ok()
                        .and_then(|m| m.created().ok())
                        .map(|t| t.duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_secs() as i64)
                        .unwrap_or_else(|| Utc::now().timestamp())
                } else {
                    Utc::now().timestamp()
                }
            } else {
                Utc::now().timestamp()
            };

            result.push(ComposeProject {
                name,
                source,
                path,
                created_at,
                running_count,
                total_count,
                status,
            });
        }

        Ok(result)
    }

    async fn get_compose_containers(&self, project_name: &str) -> Result<Vec<ComposeContainer>, String> {
        // Validate project name
        validate_project_name(project_name)?;

        // Run docker compose ps --format json (async)
        let stdout = run_compose_checked(
            &["compose", "-p", project_name, "ps", "--format", "json", "-a"],
            "docker compose ps"
        ).await?;
        if stdout.trim().is_empty() {
            return Ok(Vec::new());
        }

        // Parse JSON output - each line is a separate JSON object
        let mut result = Vec::new();
        for line in stdout.lines() {
            if line.trim().is_empty() {
                continue;
            }

            let container: serde_json::Value = serde_json::from_str(line)
                .map_err(|e| format!("Failed to parse container json: {}", e))?;

            let id = container["ID"].as_str().unwrap_or("").to_string();
            let service = container["Service"].as_str().unwrap_or("").to_string();
            let name = container["Name"].as_str().unwrap_or("").to_string();
            let image = container["Image"].as_str().unwrap_or("").to_string();
            let state = container["State"].as_str().unwrap_or("").to_string();
            let status = container["Status"].as_str().unwrap_or("").to_string();

            // Parse ports
            let ports_str = container["Ports"].as_str().unwrap_or("");
            let ports = parse_ports_string(ports_str);

            // Get container stats if running
            let (cpu_percent, memory_percent) = if state == "running" {
                self.get_container_stats(&id)
                    .await
                    .map(|s| (Some(s.cpu_percent), Some(s.memory_percent)))
                    .unwrap_or((None, None))
            } else {
                (None, None)
            };

            result.push(ComposeContainer {
                id,
                service,
                name,
                image,
                state,
                status,
                cpu_percent,
                memory_percent,
                ports,
            });
        }

        Ok(result)
    }

    async fn get_compose_content(&self, project_name: &str) -> Result<String, String> {
        // First get the project path
        let projects = self.list_compose_projects().await?;
        let project = projects.iter()
            .find(|p| p.name == project_name)
            .ok_or_else(|| format!("Compose project '{}' not found", project_name))?;

        if project.path.is_empty() {
            return Err("Project path not found".to_string());
        }

        // Try to read docker-compose.yml or docker-compose.yaml
        let yml_path = Path::new(&project.path).join("docker-compose.yml");
        let yaml_path = Path::new(&project.path).join("docker-compose.yaml");
        let compose_path = Path::new(&project.path).join("compose.yml");
        let compose_yaml_path = Path::new(&project.path).join("compose.yaml");

        for path in [yml_path, yaml_path, compose_path, compose_yaml_path] {
            if path.exists() {
                return std::fs::read_to_string(&path)
                    .map_err(|e| format!("Failed to read compose file: {}", e));
            }
        }

        Err("Compose file not found".to_string())
    }

    async fn create_compose_project(&self, request: CreateComposeRequest) -> Result<(), String> {
        // Validate project name
        validate_project_name(&request.name)?;

        // Determine and validate the project path
        let project_path = if let Some(path) = &request.path {
            validate_compose_path(path)?
        } else {
            // Default to ~/docker-compose/{name}
            let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".to_string());
            let default_path = Path::new(&home).join("docker-compose").join(&request.name);
            default_path
        };

        // Create directory if it doesn't exist
        std::fs::create_dir_all(&project_path)
            .map_err(|e| format!("Failed to create project directory: {}", e))?;

        // Write docker-compose.yml
        let compose_file = project_path.join("docker-compose.yml");
        std::fs::write(&compose_file, &request.content)
            .map_err(|e| format!("Failed to write compose file: {}", e))?;

        // Run docker compose up -d (async)
        let compose_file_str = compose_file.to_string_lossy().to_string();
        run_compose_action(
            &["compose", "-p", &request.name, "-f", &compose_file_str, "up", "-d"],
            "docker compose up"
        ).await
    }

    async fn update_compose_content(&self, request: UpdateComposeRequest) -> Result<(), String> {
        // Get the project path
        let projects = self.list_compose_projects().await?;
        let project = projects.iter()
            .find(|p| p.name == request.name)
            .ok_or_else(|| format!("Compose project '{}' not found", request.name))?;

        if project.path.is_empty() {
            return Err("Project path not found".to_string());
        }

        // Find the compose file
        let yml_path = Path::new(&project.path).join("docker-compose.yml");
        let yaml_path = Path::new(&project.path).join("docker-compose.yaml");
        let compose_path = Path::new(&project.path).join("compose.yml");
        let compose_yaml_path = Path::new(&project.path).join("compose.yaml");

        let file_path = if yml_path.exists() {
            yml_path
        } else if yaml_path.exists() {
            yaml_path
        } else if compose_path.exists() {
            compose_path
        } else if compose_yaml_path.exists() {
            compose_yaml_path
        } else {
            return Err("Compose file not found".to_string());
        };

        // Write updated content
        std::fs::write(&file_path, &request.content)
            .map_err(|e| format!("Failed to write compose file: {}", e))?;

        Ok(())
    }

    async fn start_compose(&self, project_name: &str) -> Result<(), String> {
        validate_project_name(project_name)?;
        run_compose_action(
            &["compose", "-p", project_name, "start"],
            "docker compose start"
        ).await
    }

    async fn stop_compose(&self, project_name: &str) -> Result<(), String> {
        validate_project_name(project_name)?;
        run_compose_action(
            &["compose", "-p", project_name, "stop"],
            "docker compose stop"
        ).await
    }

    async fn restart_compose(&self, project_name: &str) -> Result<(), String> {
        validate_project_name(project_name)?;
        run_compose_action(
            &["compose", "-p", project_name, "restart"],
            "docker compose restart"
        ).await
    }

    async fn remove_compose(&self, project_name: &str, remove_volumes: bool) -> Result<(), String> {
        validate_project_name(project_name)?;

        let args = if remove_volumes {
            vec!["compose", "-p", project_name, "down", "-v"]
        } else {
            vec!["compose", "-p", project_name, "down"]
        };

        run_compose_action(&args, "docker compose down").await
    }

    async fn get_compose_logs(&self, project_name: &str, tail: Option<u32>, service: Option<&str>) -> Result<String, String> {
        validate_project_name(project_name)?;

        let tail_str = tail.map(|t| t.to_string());
        let mut args = vec!["compose", "-p", project_name, "logs"];

        if let Some(ref t) = tail_str {
            args.push("--tail");
            args.push(t);
        }

        if let Some(s) = service {
            args.push(s);
        }

        run_compose_checked(&args, "docker compose logs").await
    }

    async fn get_compose_path(&self, project_name: &str) -> Result<String, String> {
        let projects = self.list_compose_projects().await?;
        let project = projects.iter()
            .find(|p| p.name == project_name)
            .ok_or_else(|| format!("Compose project '{}' not found", project_name))?;

        if project.path.is_empty() {
            return Err("Project path not found".to_string());
        }

        Ok(project.path.clone())
    }

    // ========== 仓库管理 (第三期) ==========

    async fn list_registries(&self) -> Result<Vec<RegistryInfo>, String> {
        load_registries()
    }

    async fn create_registry(&self, request: CreateRegistryRequest) -> Result<RegistryInfo, String> {
        let mut registries = load_registries()?;

        let now = chrono::Utc::now().timestamp();
        let registry = RegistryInfo {
            id: uuid::Uuid::new_v4().to_string(),
            name: request.name,
            registry_type: request.registry_type,
            url: request.url,
            username: request.username,
            password: request.password,
            encrypted_password: None, // Will be encrypted when saved
            download_limit: request.download_limit,
            skip_tls_verify: request.skip_tls_verify,
            status: RegistryStatus::Disconnected,
            last_sync_at: None,
            created_at: now,
            updated_at: now,
        };

        registries.push(registry.clone());
        save_registries(&registries)?;

        Ok(registry)
    }

    async fn update_registry(&self, request: UpdateRegistryRequest) -> Result<RegistryInfo, String> {
        let mut registries = load_registries()?;

        let registry = registries.iter_mut()
            .find(|r| r.id == request.registry_id)
            .ok_or_else(|| format!("Registry '{}' not found", request.registry_id))?;

        if let Some(name) = request.name {
            registry.name = name;
        }
        if let Some(registry_type) = request.registry_type {
            registry.registry_type = registry_type;
        }
        if let Some(url) = request.url {
            registry.url = url;
        }
        if let Some(username) = request.username {
            // Only update username if it's non-empty, otherwise keep existing
            if !username.is_empty() {
                registry.username = Some(username);
            }
        }
        if let Some(password) = request.password {
            // Only update password if it's non-empty, otherwise keep existing
            if !password.is_empty() {
                registry.password = Some(password);
            }
        }
        if let Some(download_limit) = request.download_limit {
            registry.download_limit = Some(download_limit);
        }
        if let Some(skip_tls_verify) = request.skip_tls_verify {
            registry.skip_tls_verify = skip_tls_verify;
        }
        registry.updated_at = chrono::Utc::now().timestamp();

        let updated = registry.clone();
        save_registries(&registries)?;

        Ok(updated)
    }

    async fn delete_registry(&self, registry_id: &str) -> Result<(), String> {
        let mut registries = load_registries()?;
        let len_before = registries.len();
        registries.retain(|r| r.id != registry_id);

        if registries.len() == len_before {
            return Err(format!("Registry '{}' not found", registry_id));
        }

        save_registries(&registries)?;
        Ok(())
    }

    async fn test_registry(&self, registry_id: &str) -> Result<bool, String> {
        info!("test_registry called with registry_id: {}", registry_id);

        let registries = load_registries()?;
        let registry = registries.iter()
            .find(|r| r.id == registry_id)
            .ok_or_else(|| format!("Registry '{}' not found", registry_id))?
            .clone();

        info!("Found registry: {} ({})", registry.name, registry.url);

        // Test using HTTP request (supports both Basic Auth and Token Auth)
        let result = test_registry_connection(
            &registry.url,
            registry.username.as_deref(),
            registry.password.as_deref(),
            registry.skip_tls_verify,
        );

        info!("test_registry_connection result: {:?}", result);

        // Update registry status
        let mut registries = load_registries()?;
        if let Some(reg) = registries.iter_mut().find(|r| r.id == registry_id) {
            reg.status = match &result {
                Ok(_) => RegistryStatus::Connected,
                Err(e) => RegistryStatus::Error(e.clone()),
            };
            reg.last_sync_at = Some(chrono::Utc::now().timestamp());
            reg.updated_at = chrono::Utc::now().timestamp();
            info!("Updated registry status to: {:?}", reg.status);
        }
        save_registries(&registries)?;
        info!("Saved registries to file");

        result.map(|_| true).map_err(|e| e)
    }

    async fn search_registry_images(
        &self,
        registry_id: &str,
        query: Option<&str>,
    ) -> Result<Vec<RegistryImage>, String> {
        let registries = load_registries()?;
        let registry = registries.iter()
            .find(|r| r.id == registry_id)
            .ok_or_else(|| format!("Registry '{}' not found", registry_id))?;

        // For Docker Hub, use docker search command
        let search_term = query.unwrap_or("");

        if registry.registry_type != RegistryType::DockerHub {
            // For other registries, we need to query the registry API
            // This is a simplified implementation
            return Ok(vec![]);
        }

        // Validate search term to prevent command injection
        if !search_term.chars().all(|c| c.is_alphanumeric() || matches!(c, '.' | '-' | '/' | ':' | '_')) {
            return Err("Invalid search term: only alphanumeric characters, '.', '-', '/', ':', '_' are allowed".to_string());
        }

        let output = std::process::Command::new("docker")
            .args(["search", "--limit", "25", "--format", "{{.Name}}\t{{.Description}}\t{{.StarCount}}\t{{.IsOfficial}}", search_term])
            .output()
            .map_err(|e| format!("Failed to search: {}", e))?;

        if !output.status.success() {
            return Err(String::from_utf8_lossy(&output.stderr).to_string());
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        let mut images = Vec::new();

        // Parse tab-separated docker search --format output
        for line in stdout.lines() {
            let line = line.trim();
            if line.is_empty() {
                continue;
            }
            let parts: Vec<&str> = line.split('\t').collect();
            if !parts.is_empty() && !parts[0].is_empty() {
                images.push(RegistryImage {
                    name: parts[0].to_string(),
                    tags: vec!["latest".to_string()],
                    size: None,
                    last_updated: None,
                });
            }
        }

        Ok(images)
    }

    async fn pull_from_registry(
        &self,
        registry_id: &str,
        images: Vec<String>,
    ) -> Result<(), String> {
        with_docker_timeout(DOCKER_SLOW_TIMEOUT_SECS, "pull_from_registry", async {
            let registries = load_registries()?;
            let registry = registries.iter()
                .find(|r| r.id == registry_id)
                .ok_or_else(|| format!("Registry '{}' not found", registry_id))?;

            // Update status to syncing
            {
                let mut regs = load_registries()?;
                if let Some(reg) = regs.iter_mut().find(|r| r.id == registry_id) {
                    reg.status = RegistryStatus::Syncing;
                    reg.updated_at = chrono::Utc::now().timestamp();
                }
                save_registries(&regs)?;
            }

            // Pull each image
            for image in &images {
                let full_image = if registry.registry_type == RegistryType::DockerHub {
                    image.clone()
                } else {
                    format!("{}/{}", registry.url.trim_start_matches("https://")
                        .trim_start_matches("http://"), image)
                };

                let output = std::process::Command::new("docker")
                    .args(["pull", &full_image])
                    .output()
                    .map_err(|e| format!("Failed to pull {}: {}", full_image, e))?;

                if !output.status.success() {
                    let mut regs = load_registries()?;
                    if let Some(reg) = regs.iter_mut().find(|r| r.id == registry_id) {
                        reg.status = RegistryStatus::Error(
                            String::from_utf8_lossy(&output.stderr).trim().to_string()
                        );
                        reg.updated_at = chrono::Utc::now().timestamp();
                    }
                    save_registries(&regs)?;
                    return Err(format!("Failed to pull {}: {}",
                        full_image, String::from_utf8_lossy(&output.stderr)));
                }
            }

            // Update status to connected and last_sync_at
            let mut regs = load_registries()?;
            if let Some(reg) = regs.iter_mut().find(|r| r.id == registry_id) {
                reg.status = RegistryStatus::Connected;
                reg.last_sync_at = Some(chrono::Utc::now().timestamp());
                reg.updated_at = chrono::Utc::now().timestamp();
            }
            save_registries(&regs)?;

            Ok(())
        }).await
    }

    async fn close(&self) {
        // Close all exec sessions
        let mut sessions = self.exec_sessions.write();
        sessions.clear();
    }
}

/// Calculate CPU usage percentage from stats
fn calculate_cpu_percent(stats: &bollard::container::Stats) -> f64 {
    let cpu_delta = stats.cpu_stats.cpu_usage.total_usage as i64
        - stats.precpu_stats.cpu_usage.total_usage as i64;
    let system_delta = stats.cpu_stats.system_cpu_usage.unwrap_or(0) as i64
        - stats.precpu_stats.system_cpu_usage.unwrap_or(0) as i64;

    if system_delta > 0 && cpu_delta > 0 {
        let cpu_count = stats.cpu_stats.online_cpus.unwrap_or(1) as f64;
        (cpu_delta as f64 / system_delta as f64) * cpu_count * 100.0
    } else {
        0.0
    }
}

/// Parse compose status string like "running(2)" or "exited(1), running(1)"
/// Returns (running_count, total_count, status_string)
fn parse_compose_status(status_str: &str) -> (u32, u32, String) {
    use regex::Regex;

    let re = Regex::new(r"(\w+)\((\d+)\)").unwrap();
    let mut running_count = 0u32;
    let mut total_count = 0u32;

    for cap in re.captures_iter(status_str) {
        let state = cap.get(1).map(|m| m.as_str()).unwrap_or("");
        let count: u32 = cap.get(2)
            .and_then(|m| m.as_str().parse().ok())
            .unwrap_or(0);

        total_count += count;
        if state == "running" {
            running_count = count;
        }
    }

    let status = if running_count == 0 {
        "stopped".to_string()
    } else if running_count == total_count {
        "running".to_string()
    } else {
        "partial".to_string()
    };

    (running_count, total_count, status)
}

/// Parse ports string like "0.0.0.0:5432->5432/tcp, 0.0.0.0:5433->5433/tcp"
fn parse_ports_string(ports_str: &str) -> Vec<PortMapping> {
    use regex::Regex;

    let mut ports = Vec::new();
    if ports_str.is_empty() {
        return ports;
    }

    // Pattern: "0.0.0.0:5432->5432/tcp" or "5432/tcp"
    let re = Regex::new(r"(?:(\d+\.\d+\.\d+\.\d+):)?(\d+)->(\d+)/(\w+)").unwrap();

    for cap in re.captures_iter(ports_str) {
        let host_ip = cap.get(1).map(|m| m.as_str().to_string());
        let host_port: Option<u16> = cap.get(2).and_then(|m| m.as_str().parse().ok());
        let container_port: u16 = cap.get(3)
            .and_then(|m| m.as_str().parse().ok())
            .unwrap_or(0);
        let protocol = cap.get(4)
            .map(|m| m.as_str().to_string())
            .unwrap_or_else(|| "tcp".to_string());

        if container_port > 0 {
            ports.push(PortMapping {
                container_port,
                host_port,
                protocol,
                host_ip,
            });
        }
    }

    ports
}
