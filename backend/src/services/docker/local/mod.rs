//! Local Docker driver implementation
//!
//! Connects to local Docker daemon via Unix socket or Windows named pipe.

use async_trait::async_trait;
use bollard::container::{
    RemoveContainerOptions, RestartContainerOptions,
    StartContainerOptions, StopContainerOptions,
};
use bollard::image::{ListImagesOptions, RemoveImageOptions};
use bollard::network::CreateNetworkOptions;
use bollard::volume::{CreateVolumeOptions, RemoveVolumeOptions};
use bollard::Docker;
use futures::channel::mpsc::UnboundedSender;
use futures::StreamExt;
use parking_lot::RwLock;
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
    ComposeContainer, ComposeProject, ContainerInfo, ContainerStats,
    CreateComposeRequest, CreateNetworkRequest, CreateRegistryRequest, CreateVolumeRequest,
    DockerInfo, DockerSettings, DockerStats, DockerTestResult, ImageInfo,
    NetworkDetail, NetworkInfo, PruneResult, RegistryImage, RegistryInfo,
    UpdateComposeRequest, UpdateRegistryRequest, VolumeInfo,
};

mod compose;
mod containers;
mod daemon;
mod exec;
mod networks;
mod parsing;
mod registry;

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
        self.list_containers_impl(all).await
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
        self.get_container_logs_impl(container_id, tail).await
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
        self.get_info_impl().await
    }

    async fn get_stats(&self) -> Result<DockerStats, String> {
        self.get_stats_impl().await
    }

    // ========== 设置页面方法 ==========

    async fn get_settings(&self) -> Result<DockerSettings, String> {
        self.get_settings_impl().await
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
        self.list_networks_impl().await
    }

    async fn inspect_network(&self, network_id: &str) -> Result<NetworkDetail, String> {
        self.inspect_network_impl(network_id).await
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
        self.list_volumes_impl().await
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
        self.get_container_stats_impl(container_id).await
    }

    async fn exec_command(
        &self,
        container_id: &str,
        cmd: Vec<String>,
    ) -> Result<String, String> {
        self.exec_command_impl(container_id, cmd).await
    }

    async fn exec_start_interactive(
        &self,
        container_id: &str,
        cmd: Vec<String>,
        cols: u16,
        rows: u16,
        output_tx: futures::channel::mpsc::UnboundedSender<Vec<u8>>,
    ) -> Result<String, String> {
        self.exec_start_interactive_impl(container_id, cmd, cols, rows, output_tx).await
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
        self.list_compose_projects_impl().await
    }

    async fn get_compose_containers(&self, project_name: &str) -> Result<Vec<ComposeContainer>, String> {
        self.get_compose_containers_impl(project_name).await
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
        self.create_compose_project_impl(request).await
    }

    async fn update_compose_content(&self, request: UpdateComposeRequest) -> Result<(), String> {
        self.update_compose_content_impl(request).await
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
        // Registry config lives in a local JSON store for both drivers.
        super::registry_helpers::create_registry(request)
    }

    async fn update_registry(&self, request: UpdateRegistryRequest) -> Result<RegistryInfo, String> {
        super::registry_helpers::update_registry(request)
    }

    async fn delete_registry(&self, registry_id: &str) -> Result<(), String> {
        super::registry_helpers::delete_registry(registry_id)
    }

    async fn test_registry(&self, registry_id: &str) -> Result<bool, String> {
        self.test_registry_impl(registry_id).await
    }

    async fn search_registry_images(
        &self,
        registry_id: &str,
        query: Option<&str>,
    ) -> Result<Vec<RegistryImage>, String> {
        self.search_registry_images_impl(registry_id, query).await
    }

    async fn pull_from_registry(
        &self,
        registry_id: &str,
        images: Vec<String>,
    ) -> Result<(), String> {
        self.pull_from_registry_impl(registry_id, images).await
    }

    async fn close(&self) {
        // Close all exec sessions
        let mut sessions = self.exec_sessions.write();
        sessions.clear();
    }
}
