//! Docker driver trait definition
//!
//! Defines the interface for Docker drivers using the strategy pattern.

use async_trait::async_trait;

use crate::models::docker::{
    ComposeContainer, ComposeProject, ContainerInfo, ContainerStats, CreateComposeRequest,
    CreateNetworkRequest, CreateRegistryRequest, CreateVolumeRequest, DockerInfo, DockerSettings,
    DockerStats as DockerSystemStats, DockerTestResult, ImageInfo, NetworkDetail, NetworkInfo,
    PruneResult, RegistryImage, RegistryInfo, UpdateComposeRequest, UpdateRegistryRequest,
    VolumeInfo,
};

/// Docker driver trait - defines the interface for all Docker implementations
#[async_trait]
pub trait DockerDriver: Send + Sync {
    /// Test the connection to Docker daemon
    async fn test_connection(&self) -> Result<DockerTestResult, String>;

    // ========== 容器管理 ==========

    /// List all containers
    /// If `all` is true, includes stopped containers
    async fn list_containers(&self, all: bool) -> Result<Vec<ContainerInfo>, String>;

    /// Start a container
    async fn start_container(&self, container_id: &str) -> Result<(), String>;

    /// Stop a container
    async fn stop_container(&self, container_id: &str) -> Result<(), String>;

    /// Restart a container
    async fn restart_container(&self, container_id: &str) -> Result<(), String>;

    /// Remove a container
    async fn remove_container(&self, container_id: &str, force: bool) -> Result<(), String>;

    /// Get container logs
    async fn get_container_logs(
        &self,
        container_id: &str,
        tail: Option<u32>,
    ) -> Result<String, String>;

    // ========== 镜像管理 ==========

    /// List all images
    async fn list_images(&self) -> Result<Vec<ImageInfo>, String>;

    /// Pull an image from registry
    async fn pull_image(&self, image: &str) -> Result<(), String>;

    /// Remove an image
    async fn remove_image(&self, image_id: &str, force: bool) -> Result<(), String>;

    // ========== 概览页面 (新增) ==========

    /// Get Docker system info
    async fn get_info(&self) -> Result<DockerInfo, String>;

    /// Get Docker stats (container/image counts)
    async fn get_stats(&self) -> Result<DockerSystemStats, String>;

    // ========== 设置页面 (新增) ==========

    /// Get Docker daemon settings
    async fn get_settings(&self) -> Result<DockerSettings, String>;

    /// Update registry mirrors (requires daemon restart)
    async fn update_registry_mirrors(&self, mirrors: Vec<String>) -> Result<(), String>;

    /// Stop Docker daemon
    async fn stop_daemon(&self) -> Result<(), String>;

    /// Restart Docker daemon
    async fn restart_daemon(&self) -> Result<(), String>;

    // ========== 网络管理 (第二期) ==========

    /// List all networks
    async fn list_networks(&self) -> Result<Vec<NetworkInfo>, String>;

    /// Get network details
    async fn inspect_network(&self, network_id: &str) -> Result<NetworkDetail, String>;

    /// Create a network
    async fn create_network(&self, config: CreateNetworkRequest) -> Result<String, String>;

    /// Remove a network
    async fn remove_network(&self, network_id: &str) -> Result<(), String>;

    /// Connect a container to a network
    async fn connect_container_to_network(
        &self,
        network_id: &str,
        container_id: &str,
    ) -> Result<(), String>;

    /// Disconnect a container from a network
    async fn disconnect_container_from_network(
        &self,
        network_id: &str,
        container_id: &str,
    ) -> Result<(), String>;

    /// Prune unused networks
    async fn prune_networks(&self) -> Result<PruneResult, String>;

    // ========== 存储卷管理 (第二期) ==========

    /// List all volumes
    async fn list_volumes(&self) -> Result<Vec<VolumeInfo>, String>;

    /// Create a volume
    async fn create_volume(&self, config: CreateVolumeRequest) -> Result<String, String>;

    /// Remove a volume
    async fn remove_volume(&self, volume_name: &str, force: bool) -> Result<(), String>;

    /// Prune unused volumes
    async fn prune_volumes(&self) -> Result<PruneResult, String>;

    // ========== 资源监控 (第二期) ==========

    /// Get container resource stats
    async fn get_container_stats(&self, container_id: &str) -> Result<ContainerStats, String>;

    // ========== 容器终端 (第二期) ==========

    /// Execute a command in a container and return output
    /// This is a non-interactive exec that runs a command and returns the result
    async fn exec_command(
        &self,
        container_id: &str,
        cmd: Vec<String>,
    ) -> Result<String, String>;

    /// Start an interactive exec session with TTY
    /// Returns (exec_id, input_sender) for bidirectional communication
    async fn exec_start_interactive(
        &self,
        container_id: &str,
        cmd: Vec<String>,
        cols: u16,
        rows: u16,
        output_tx: futures::channel::mpsc::UnboundedSender<Vec<u8>>,
    ) -> Result<String, String>;

    /// Send data to an interactive exec session
    async fn exec_send_data(&self, exec_id: &str, data: Vec<u8>) -> Result<(), String>;

    /// Resize an interactive exec session
    async fn exec_resize(&self, exec_id: &str, cols: u16, rows: u16) -> Result<(), String>;

    /// Close an interactive exec session
    async fn exec_close(&self, exec_id: &str) -> Result<(), String>;

    // ========== Docker Compose 编排 (第二期) ==========

    /// List all Compose projects
    async fn list_compose_projects(&self) -> Result<Vec<ComposeProject>, String>;

    /// Get Compose project containers
    async fn get_compose_containers(&self, project_name: &str) -> Result<Vec<ComposeContainer>, String>;

    /// Get Compose file content
    async fn get_compose_content(&self, project_name: &str) -> Result<String, String>;

    /// Create a new Compose project
    async fn create_compose_project(&self, request: CreateComposeRequest) -> Result<(), String>;

    /// Update Compose project content
    async fn update_compose_content(&self, request: UpdateComposeRequest) -> Result<(), String>;

    /// Start Compose project
    async fn start_compose(&self, project_name: &str) -> Result<(), String>;

    /// Stop Compose project
    async fn stop_compose(&self, project_name: &str) -> Result<(), String>;

    /// Restart Compose project
    async fn restart_compose(&self, project_name: &str) -> Result<(), String>;

    /// Remove Compose project (stop and remove containers)
    async fn remove_compose(&self, project_name: &str, remove_volumes: bool) -> Result<(), String>;

    /// Get Compose project logs
    async fn get_compose_logs(&self, project_name: &str, tail: Option<u32>, service: Option<&str>) -> Result<String, String>;

    /// Open Compose project directory
    async fn get_compose_path(&self, project_name: &str) -> Result<String, String>;

    // ========== 仓库管理 (第三期) ==========

    /// List all configured registries
    async fn list_registries(&self) -> Result<Vec<RegistryInfo>, String>;

    /// Create a new registry configuration
    async fn create_registry(&self, request: CreateRegistryRequest) -> Result<RegistryInfo, String>;

    /// Update an existing registry configuration
    async fn update_registry(&self, request: UpdateRegistryRequest) -> Result<RegistryInfo, String>;

    /// Delete a registry configuration
    async fn delete_registry(&self, registry_id: &str) -> Result<(), String>;

    /// Test registry connection
    async fn test_registry(&self, registry_id: &str) -> Result<bool, String>;

    /// Search for images in a registry
    async fn search_registry_images(
        &self,
        registry_id: &str,
        query: Option<&str>,
    ) -> Result<Vec<RegistryImage>, String>;

    /// Pull images from a registry (sync)
    async fn pull_from_registry(
        &self,
        registry_id: &str,
        images: Vec<String>,
    ) -> Result<(), String>;

    /// Close the connection
    async fn close(&self);
}
