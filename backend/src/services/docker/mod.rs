//! Docker service module
//!
//! Provides Docker container and image management using the strategy pattern.
//! Supports both local Docker and remote Docker via SSH tunnel.

mod compose_cmd;
mod local;
pub(crate) mod registry_helpers;
mod remote;
mod traits;

pub use traits::DockerDriver;

use std::collections::HashMap;
use std::sync::Arc;

use parking_lot::RwLock;

use crate::models::docker::{
    ComposeContainer, ComposeProject, ContainerInfo, ContainerStats, CreateComposeRequest,
    CreateNetworkRequest, CreateRegistryRequest, CreateVolumeRequest, DockerConnectRequest,
    DockerConnectionType, DockerInfo, DockerSettings, DockerStats, DockerTestResult, ImageInfo,
    NetworkDetail, NetworkInfo, PruneResult, RegistryImage, RegistryInfo, UpdateComposeRequest,
    UpdateRegistryRequest, VolumeInfo,
};
use crate::services::SshService;

use local::LocalDockerDriver;
use remote::RemoteDockerDriver;

/// Docker session information
pub struct DockerSession {
    pub connection_id: String,
    pub connection_type: DockerConnectionType,
    pub ssh_session_id: Option<String>,
    driver: Arc<dyn DockerDriver>,
}

/// Docker service managing all Docker connections
pub struct DockerService {
    sessions: RwLock<HashMap<String, Arc<DockerSession>>>,
    ssh_service: Arc<SshService>,
}

impl DockerService {
    pub fn new(ssh_service: Arc<SshService>) -> Self {
        Self {
            sessions: RwLock::new(HashMap::new()),
            ssh_service,
        }
    }

    /// Connect to Docker daemon
    pub async fn connect(&self, request: DockerConnectRequest) -> Result<DockerTestResult, String> {
        let driver: Arc<dyn DockerDriver> = match request.connection_type {
            DockerConnectionType::Local => {
                let driver = LocalDockerDriver::connect().await?;
                Arc::new(driver)
            }
            DockerConnectionType::Ssh => {
                let ssh_connection_id = request
                    .ssh_connection_id
                    .as_ref()
                    .ok_or("SSH connection ID is required for remote Docker")?;

                // Find active SSH session by connection_id (saved config ID)
                let ssh_session_id = self
                    .ssh_service
                    .find_session_by_connection_id(ssh_connection_id)
                    .await
                    .ok_or_else(|| {
                        format!(
                            "No active SSH session found. Please connect to the SSH server first."
                        )
                    })?;

                let driver = RemoteDockerDriver::new(
                    self.ssh_service.clone(),
                    ssh_session_id,
                );
                Arc::new(driver)
            }
        };

        // Test the connection
        let test_result = driver.test_connection().await?;

        if test_result.success {
            let session = Arc::new(DockerSession {
                connection_id: request.connection_id.clone(),
                connection_type: request.connection_type,
                ssh_session_id: request.ssh_connection_id,
                driver,
            });

            self.sessions
                .write()
                .insert(request.connection_id, session);
        }

        Ok(test_result)
    }

    /// Test Docker connection without storing session
    pub async fn test_connection(
        &self,
        request: DockerConnectRequest,
    ) -> Result<DockerTestResult, String> {
        match request.connection_type {
            DockerConnectionType::Local => LocalDockerDriver::test().await,
            DockerConnectionType::Ssh => {
                let ssh_connection_id = request
                    .ssh_connection_id
                    .as_ref()
                    .ok_or("SSH connection ID is required for remote Docker")?;

                // Find active SSH session by connection_id (saved config ID)
                let ssh_session_id = self
                    .ssh_service
                    .find_session_by_connection_id(ssh_connection_id)
                    .await
                    .ok_or_else(|| {
                        format!(
                            "No active SSH session found. Please connect to the SSH server first."
                        )
                    })?;

                let driver = RemoteDockerDriver::new(
                    self.ssh_service.clone(),
                    ssh_session_id,
                );
                driver.test_connection().await
            }
        }
    }

    /// Disconnect from Docker
    pub async fn disconnect(&self, connection_id: &str) -> Result<(), String> {
        let session = self.sessions.write().remove(connection_id);
        if let Some(session) = session {
            session.driver.close().await;
            Ok(())
        } else {
            Err("Connection not found".to_string())
        }
    }

    /// Check if connection exists
    pub fn is_connected(&self, connection_id: &str) -> bool {
        self.sessions.read().contains_key(connection_id)
    }

    /// List containers
    pub async fn list_containers(
        &self,
        connection_id: &str,
        all: bool,
    ) -> Result<Vec<ContainerInfo>, String> {
        let session = self.get_session(connection_id)?;
        session.driver.list_containers(all).await
    }

    /// Start a container
    pub async fn start_container(
        &self,
        connection_id: &str,
        container_id: &str,
    ) -> Result<(), String> {
        let session = self.get_session(connection_id)?;
        session.driver.start_container(container_id).await
    }

    /// Stop a container
    pub async fn stop_container(
        &self,
        connection_id: &str,
        container_id: &str,
    ) -> Result<(), String> {
        let session = self.get_session(connection_id)?;
        session.driver.stop_container(container_id).await
    }

    /// Restart a container
    pub async fn restart_container(
        &self,
        connection_id: &str,
        container_id: &str,
    ) -> Result<(), String> {
        let session = self.get_session(connection_id)?;
        session.driver.restart_container(container_id).await
    }

    /// Remove a container
    pub async fn remove_container(
        &self,
        connection_id: &str,
        container_id: &str,
        force: bool,
    ) -> Result<(), String> {
        let session = self.get_session(connection_id)?;
        session.driver.remove_container(container_id, force).await
    }

    /// Get container logs
    pub async fn get_container_logs(
        &self,
        connection_id: &str,
        container_id: &str,
        tail: Option<u32>,
    ) -> Result<String, String> {
        let session = self.get_session(connection_id)?;
        session.driver.get_container_logs(container_id, tail).await
    }

    /// List images
    pub async fn list_images(&self, connection_id: &str) -> Result<Vec<ImageInfo>, String> {
        let session = self.get_session(connection_id)?;
        session.driver.list_images().await
    }

    /// Pull an image
    pub async fn pull_image(&self, connection_id: &str, image: &str) -> Result<(), String> {
        let session = self.get_session(connection_id)?;
        session.driver.pull_image(image).await
    }

    /// Remove an image
    pub async fn remove_image(
        &self,
        connection_id: &str,
        image_id: &str,
        force: bool,
    ) -> Result<(), String> {
        let session = self.get_session(connection_id)?;
        session.driver.remove_image(image_id, force).await
    }

    // ========== 概览页面方法 ==========

    /// Get Docker system info
    pub async fn get_info(&self, connection_id: &str) -> Result<DockerInfo, String> {
        let session = self.get_session(connection_id)?;
        session.driver.get_info().await
    }

    /// Get Docker stats
    pub async fn get_stats(&self, connection_id: &str) -> Result<DockerStats, String> {
        let session = self.get_session(connection_id)?;
        session.driver.get_stats().await
    }

    // ========== 设置页面方法 ==========

    /// Get Docker daemon settings
    pub async fn get_settings(&self, connection_id: &str) -> Result<DockerSettings, String> {
        let session = self.get_session(connection_id)?;
        session.driver.get_settings().await
    }

    /// Update registry mirrors
    pub async fn update_registry_mirrors(
        &self,
        connection_id: &str,
        mirrors: Vec<String>,
    ) -> Result<(), String> {
        let session = self.get_session(connection_id)?;
        session.driver.update_registry_mirrors(mirrors).await
    }

    /// Stop Docker daemon
    pub async fn stop_daemon(&self, connection_id: &str) -> Result<(), String> {
        let session = self.get_session(connection_id)?;
        session.driver.stop_daemon().await
    }

    /// Restart Docker daemon
    pub async fn restart_daemon(&self, connection_id: &str) -> Result<(), String> {
        let session = self.get_session(connection_id)?;
        session.driver.restart_daemon().await
    }

    // ========== 网络管理方法 (第二期) ==========

    /// List Docker networks
    pub async fn list_networks(&self, connection_id: &str) -> Result<Vec<NetworkInfo>, String> {
        let session = self.get_session(connection_id)?;
        session.driver.list_networks().await
    }

    /// Get network details
    pub async fn inspect_network(
        &self,
        connection_id: &str,
        network_id: &str,
    ) -> Result<NetworkDetail, String> {
        let session = self.get_session(connection_id)?;
        session.driver.inspect_network(network_id).await
    }

    /// Create a Docker network
    pub async fn create_network(
        &self,
        connection_id: &str,
        config: CreateNetworkRequest,
    ) -> Result<String, String> {
        let session = self.get_session(connection_id)?;
        session.driver.create_network(config).await
    }

    /// Remove a Docker network
    pub async fn remove_network(
        &self,
        connection_id: &str,
        network_id: &str,
    ) -> Result<(), String> {
        let session = self.get_session(connection_id)?;
        session.driver.remove_network(network_id).await
    }

    /// Connect a container to a network
    pub async fn connect_container_to_network(
        &self,
        connection_id: &str,
        network_id: &str,
        container_id: &str,
    ) -> Result<(), String> {
        let session = self.get_session(connection_id)?;
        session.driver.connect_container_to_network(network_id, container_id).await
    }

    /// Disconnect a container from a network
    pub async fn disconnect_container_from_network(
        &self,
        connection_id: &str,
        network_id: &str,
        container_id: &str,
    ) -> Result<(), String> {
        let session = self.get_session(connection_id)?;
        session.driver.disconnect_container_from_network(network_id, container_id).await
    }

    /// Prune unused networks
    pub async fn prune_networks(&self, connection_id: &str) -> Result<PruneResult, String> {
        let session = self.get_session(connection_id)?;
        session.driver.prune_networks().await
    }

    // ========== 存储卷管理方法 (第二期) ==========

    /// List Docker volumes
    pub async fn list_volumes(&self, connection_id: &str) -> Result<Vec<VolumeInfo>, String> {
        let session = self.get_session(connection_id)?;
        session.driver.list_volumes().await
    }

    /// Create a Docker volume
    pub async fn create_volume(
        &self,
        connection_id: &str,
        config: CreateVolumeRequest,
    ) -> Result<String, String> {
        let session = self.get_session(connection_id)?;
        session.driver.create_volume(config).await
    }

    /// Remove a Docker volume
    pub async fn remove_volume(
        &self,
        connection_id: &str,
        volume_name: &str,
        force: bool,
    ) -> Result<(), String> {
        let session = self.get_session(connection_id)?;
        session.driver.remove_volume(volume_name, force).await
    }

    /// Prune unused volumes
    pub async fn prune_volumes(&self, connection_id: &str) -> Result<PruneResult, String> {
        let session = self.get_session(connection_id)?;
        session.driver.prune_volumes().await
    }

    // ========== 资源监控方法 (第二期) ==========

    /// Get container resource stats
    pub async fn get_container_stats(
        &self,
        connection_id: &str,
        container_id: &str,
    ) -> Result<ContainerStats, String> {
        let session = self.get_session(connection_id)?;
        session.driver.get_container_stats(container_id).await
    }

    // ========== 容器终端方法 (第二期) ==========

    /// Execute a command in a container
    pub async fn exec_command(
        &self,
        connection_id: &str,
        container_id: &str,
        cmd: Vec<String>,
    ) -> Result<String, String> {
        let session = self.get_session(connection_id)?;
        session.driver.exec_command(container_id, cmd).await
    }

    /// Start an interactive exec session
    pub async fn exec_start_interactive(
        &self,
        connection_id: &str,
        container_id: &str,
        cmd: Vec<String>,
        cols: u16,
        rows: u16,
        output_tx: futures::channel::mpsc::UnboundedSender<Vec<u8>>,
    ) -> Result<String, String> {
        let session = self.get_session(connection_id)?;
        session.driver.exec_start_interactive(container_id, cmd, cols, rows, output_tx).await
    }

    /// Send data to an interactive exec session
    pub async fn exec_send_data(
        &self,
        connection_id: &str,
        exec_id: &str,
        data: Vec<u8>,
    ) -> Result<(), String> {
        let session = self.get_session(connection_id)?;
        session.driver.exec_send_data(exec_id, data).await
    }

    /// Resize an interactive exec session
    pub async fn exec_resize(
        &self,
        connection_id: &str,
        exec_id: &str,
        cols: u16,
        rows: u16,
    ) -> Result<(), String> {
        let session = self.get_session(connection_id)?;
        session.driver.exec_resize(exec_id, cols, rows).await
    }

    /// Close an interactive exec session
    pub async fn exec_close(
        &self,
        connection_id: &str,
        exec_id: &str,
    ) -> Result<(), String> {
        let session = self.get_session(connection_id)?;
        session.driver.exec_close(exec_id).await
    }

    // ========== Docker Compose 编排方法 (第二期) ==========

    /// List Compose projects
    pub async fn list_compose_projects(
        &self,
        connection_id: &str,
    ) -> Result<Vec<ComposeProject>, String> {
        let session = self.get_session(connection_id)?;
        session.driver.list_compose_projects().await
    }

    /// Get containers for a Compose project
    pub async fn get_compose_containers(
        &self,
        connection_id: &str,
        project_name: &str,
    ) -> Result<Vec<ComposeContainer>, String> {
        let session = self.get_session(connection_id)?;
        session.driver.get_compose_containers(project_name).await
    }

    /// Get Compose file content
    pub async fn get_compose_content(
        &self,
        connection_id: &str,
        project_name: &str,
    ) -> Result<String, String> {
        let session = self.get_session(connection_id)?;
        session.driver.get_compose_content(project_name).await
    }

    /// Create a Compose project
    pub async fn create_compose_project(
        &self,
        connection_id: &str,
        request: CreateComposeRequest,
    ) -> Result<(), String> {
        let session = self.get_session(connection_id)?;
        session.driver.create_compose_project(request).await
    }

    /// Update Compose file content
    pub async fn update_compose_content(
        &self,
        connection_id: &str,
        request: UpdateComposeRequest,
    ) -> Result<(), String> {
        let session = self.get_session(connection_id)?;
        session.driver.update_compose_content(request).await
    }

    /// Start a Compose project
    pub async fn start_compose(
        &self,
        connection_id: &str,
        project_name: &str,
    ) -> Result<(), String> {
        let session = self.get_session(connection_id)?;
        session.driver.start_compose(project_name).await
    }

    /// Stop a Compose project
    pub async fn stop_compose(
        &self,
        connection_id: &str,
        project_name: &str,
    ) -> Result<(), String> {
        let session = self.get_session(connection_id)?;
        session.driver.stop_compose(project_name).await
    }

    /// Restart a Compose project
    pub async fn restart_compose(
        &self,
        connection_id: &str,
        project_name: &str,
    ) -> Result<(), String> {
        let session = self.get_session(connection_id)?;
        session.driver.restart_compose(project_name).await
    }

    /// Remove a Compose project
    pub async fn remove_compose(
        &self,
        connection_id: &str,
        project_name: &str,
        remove_volumes: bool,
    ) -> Result<(), String> {
        let session = self.get_session(connection_id)?;
        session.driver.remove_compose(project_name, remove_volumes).await
    }

    /// Get Compose project logs
    pub async fn get_compose_logs(
        &self,
        connection_id: &str,
        project_name: &str,
        tail: Option<u32>,
        service: Option<&str>,
    ) -> Result<String, String> {
        let session = self.get_session(connection_id)?;
        session.driver.get_compose_logs(project_name, tail, service).await
    }

    /// Get Compose project path
    pub async fn get_compose_path(
        &self,
        connection_id: &str,
        project_name: &str,
    ) -> Result<String, String> {
        let session = self.get_session(connection_id)?;
        session.driver.get_compose_path(project_name).await
    }

    // ========== 仓库管理方法 (第三期) ==========

    /// List configured registries
    pub async fn list_registries(
        &self,
        connection_id: &str,
    ) -> Result<Vec<RegistryInfo>, String> {
        let session = self.get_session(connection_id)?;
        session.driver.list_registries().await
    }

    /// Create a new registry configuration
    pub async fn create_registry(
        &self,
        connection_id: &str,
        request: CreateRegistryRequest,
    ) -> Result<RegistryInfo, String> {
        let session = self.get_session(connection_id)?;
        session.driver.create_registry(request).await
    }

    /// Update an existing registry configuration
    pub async fn update_registry(
        &self,
        connection_id: &str,
        request: UpdateRegistryRequest,
    ) -> Result<RegistryInfo, String> {
        let session = self.get_session(connection_id)?;
        session.driver.update_registry(request).await
    }

    /// Delete a registry configuration
    pub async fn delete_registry(
        &self,
        connection_id: &str,
        registry_id: &str,
    ) -> Result<(), String> {
        let session = self.get_session(connection_id)?;
        session.driver.delete_registry(registry_id).await
    }

    /// Test registry connection
    pub async fn test_registry(
        &self,
        connection_id: &str,
        registry_id: &str,
    ) -> Result<bool, String> {
        let session = self.get_session(connection_id)?;
        session.driver.test_registry(registry_id).await
    }

    /// Search for images in a registry
    pub async fn search_registry_images(
        &self,
        connection_id: &str,
        registry_id: &str,
        query: Option<&str>,
    ) -> Result<Vec<RegistryImage>, String> {
        let session = self.get_session(connection_id)?;
        session.driver.search_registry_images(registry_id, query).await
    }

    /// Pull images from a registry
    pub async fn pull_from_registry(
        &self,
        connection_id: &str,
        registry_id: &str,
        images: Vec<String>,
    ) -> Result<(), String> {
        let session = self.get_session(connection_id)?;
        session.driver.pull_from_registry(registry_id, images).await
    }

    /// Get session by connection ID
    fn get_session(&self, connection_id: &str) -> Result<Arc<DockerSession>, String> {
        self.sessions
            .read()
            .get(connection_id)
            .cloned()
            .ok_or_else(|| "Docker connection not found".to_string())
    }
}

impl Default for DockerService {
    fn default() -> Self {
        panic!("DockerService requires SshService, use DockerService::new() instead")
    }
}
