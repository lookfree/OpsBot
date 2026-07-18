//! Tauri commands for Docker operations

use std::sync::Arc;

use tauri::State;

use crate::models::docker::{
    ComposeContainer, ComposeProject, ContainerInfo, ContainerStats, CreateComposeRequest,
    CreateNetworkRequest, CreateRegistryRequest, CreateVolumeRequest, DockerConnectRequest,
    DockerInfo, DockerSettings, DockerStats, DockerTestResult, ImageInfo, NetworkDetail,
    NetworkInfo, PruneResult, RegistryImage, RegistryInfo, UpdateComposeRequest,
    UpdateRegistryRequest, VolumeInfo,
};
use crate::services::DockerService;

/// State wrapper for Docker service
pub struct DockerServiceState(pub Arc<DockerService>);

/// Connect to Docker daemon
#[tauri::command]
pub async fn docker_connect(
    state: State<'_, DockerServiceState>,
    request: DockerConnectRequest,
) -> Result<DockerTestResult, String> {
    state.0.connect(request).await
}

/// Test Docker connection
#[tauri::command]
pub async fn docker_test_connection(
    state: State<'_, DockerServiceState>,
    request: DockerConnectRequest,
) -> Result<DockerTestResult, String> {
    state.0.test_connection(request).await
}

/// Disconnect from Docker
#[tauri::command]
pub async fn docker_disconnect(
    state: State<'_, DockerServiceState>,
    connection_id: String,
) -> Result<(), String> {
    state.0.disconnect(&connection_id).await
}

/// Check if Docker connection is active
#[tauri::command]
pub async fn docker_is_connected(
    state: State<'_, DockerServiceState>,
    connection_id: String,
) -> Result<bool, String> {
    Ok(state.0.is_connected(&connection_id))
}

/// List containers
#[tauri::command]
pub async fn docker_list_containers(
    state: State<'_, DockerServiceState>,
    connection_id: String,
    all: bool,
) -> Result<Vec<ContainerInfo>, String> {
    state.0.list_containers(&connection_id, all).await
}

/// Start a container
#[tauri::command]
pub async fn docker_start_container(
    state: State<'_, DockerServiceState>,
    connection_id: String,
    container_id: String,
) -> Result<(), String> {
    state.0.start_container(&connection_id, &container_id).await
}

/// Stop a container
#[tauri::command]
pub async fn docker_stop_container(
    state: State<'_, DockerServiceState>,
    connection_id: String,
    container_id: String,
) -> Result<(), String> {
    state.0.stop_container(&connection_id, &container_id).await
}

/// Restart a container
#[tauri::command]
pub async fn docker_restart_container(
    state: State<'_, DockerServiceState>,
    connection_id: String,
    container_id: String,
) -> Result<(), String> {
    state.0.restart_container(&connection_id, &container_id).await
}

/// Remove a container
#[tauri::command]
pub async fn docker_remove_container(
    state: State<'_, DockerServiceState>,
    connection_id: String,
    container_id: String,
    force: bool,
) -> Result<(), String> {
    state.0.remove_container(&connection_id, &container_id, force).await
}

/// Get container logs
#[tauri::command]
pub async fn docker_get_logs(
    state: State<'_, DockerServiceState>,
    connection_id: String,
    container_id: String,
    tail: Option<u32>,
) -> Result<String, String> {
    state.0.get_container_logs(&connection_id, &container_id, tail).await
}

/// List images
#[tauri::command]
pub async fn docker_list_images(
    state: State<'_, DockerServiceState>,
    connection_id: String,
) -> Result<Vec<ImageInfo>, String> {
    state.0.list_images(&connection_id).await
}

/// Pull an image
#[tauri::command]
pub async fn docker_pull_image(
    state: State<'_, DockerServiceState>,
    connection_id: String,
    image: String,
) -> Result<(), String> {
    state.0.pull_image(&connection_id, &image).await
}

/// Remove an image
#[tauri::command]
pub async fn docker_remove_image(
    state: State<'_, DockerServiceState>,
    connection_id: String,
    image_id: String,
    force: bool,
) -> Result<(), String> {
    state.0.remove_image(&connection_id, &image_id, force).await
}

// ========== 概览页面命令 ==========

/// Get Docker system info
#[tauri::command]
pub async fn docker_get_info(
    state: State<'_, DockerServiceState>,
    connection_id: String,
) -> Result<DockerInfo, String> {
    state.0.get_info(&connection_id).await
}

/// Get Docker stats (container/image counts)
#[tauri::command]
pub async fn docker_get_stats(
    state: State<'_, DockerServiceState>,
    connection_id: String,
) -> Result<DockerStats, String> {
    state.0.get_stats(&connection_id).await
}

// ========== 设置页面命令 ==========

/// Get Docker daemon settings
#[tauri::command]
pub async fn docker_get_settings(
    state: State<'_, DockerServiceState>,
    connection_id: String,
) -> Result<DockerSettings, String> {
    state.0.get_settings(&connection_id).await
}

/// Update registry mirrors
#[tauri::command]
pub async fn docker_update_registry_mirrors(
    state: State<'_, DockerServiceState>,
    connection_id: String,
    mirrors: Vec<String>,
) -> Result<(), String> {
    state.0.update_registry_mirrors(&connection_id, mirrors).await
}

/// Stop Docker daemon
#[tauri::command]
pub async fn docker_stop_daemon(
    state: State<'_, DockerServiceState>,
    connection_id: String,
) -> Result<(), String> {
    state.0.stop_daemon(&connection_id).await
}

/// Restart Docker daemon
#[tauri::command]
pub async fn docker_restart_daemon(
    state: State<'_, DockerServiceState>,
    connection_id: String,
) -> Result<(), String> {
    state.0.restart_daemon(&connection_id).await
}

// ========== 网络管理命令 (第二期) ==========

/// List Docker networks
#[tauri::command]
pub async fn docker_list_networks(
    state: State<'_, DockerServiceState>,
    connection_id: String,
) -> Result<Vec<NetworkInfo>, String> {
    state.0.list_networks(&connection_id).await
}

/// Get network details
#[tauri::command]
pub async fn docker_inspect_network(
    state: State<'_, DockerServiceState>,
    connection_id: String,
    network_id: String,
) -> Result<NetworkDetail, String> {
    state.0.inspect_network(&connection_id, &network_id).await
}

/// Create a Docker network
#[tauri::command]
pub async fn docker_create_network(
    state: State<'_, DockerServiceState>,
    connection_id: String,
    config: CreateNetworkRequest,
) -> Result<String, String> {
    state.0.create_network(&connection_id, config).await
}

/// Remove a Docker network
#[tauri::command]
pub async fn docker_remove_network(
    state: State<'_, DockerServiceState>,
    connection_id: String,
    network_id: String,
) -> Result<(), String> {
    state.0.remove_network(&connection_id, &network_id).await
}

/// Connect a container to a network
#[tauri::command]
pub async fn docker_connect_container_to_network(
    state: State<'_, DockerServiceState>,
    connection_id: String,
    network_id: String,
    container_id: String,
) -> Result<(), String> {
    state.0.connect_container_to_network(&connection_id, &network_id, &container_id).await
}

/// Disconnect a container from a network
#[tauri::command]
pub async fn docker_disconnect_container_from_network(
    state: State<'_, DockerServiceState>,
    connection_id: String,
    network_id: String,
    container_id: String,
) -> Result<(), String> {
    state.0.disconnect_container_from_network(&connection_id, &network_id, &container_id).await
}

/// Prune unused networks
#[tauri::command]
pub async fn docker_prune_networks(
    state: State<'_, DockerServiceState>,
    connection_id: String,
) -> Result<PruneResult, String> {
    state.0.prune_networks(&connection_id).await
}

// ========== 存储卷管理命令 (第二期) ==========

/// List Docker volumes
#[tauri::command]
pub async fn docker_list_volumes(
    state: State<'_, DockerServiceState>,
    connection_id: String,
) -> Result<Vec<VolumeInfo>, String> {
    state.0.list_volumes(&connection_id).await
}

/// Create a Docker volume
#[tauri::command]
pub async fn docker_create_volume(
    state: State<'_, DockerServiceState>,
    connection_id: String,
    config: CreateVolumeRequest,
) -> Result<String, String> {
    state.0.create_volume(&connection_id, config).await
}

/// Remove a Docker volume
#[tauri::command]
pub async fn docker_remove_volume(
    state: State<'_, DockerServiceState>,
    connection_id: String,
    volume_name: String,
    force: bool,
) -> Result<(), String> {
    state.0.remove_volume(&connection_id, &volume_name, force).await
}

/// Prune unused volumes
#[tauri::command]
pub async fn docker_prune_volumes(
    state: State<'_, DockerServiceState>,
    connection_id: String,
) -> Result<PruneResult, String> {
    state.0.prune_volumes(&connection_id).await
}

// ========== 资源监控命令 (第二期) ==========

/// Get container resource stats
#[tauri::command]
pub async fn docker_get_container_stats(
    state: State<'_, DockerServiceState>,
    connection_id: String,
    container_id: String,
) -> Result<ContainerStats, String> {
    state.0.get_container_stats(&connection_id, &container_id).await
}

// ========== 容器终端命令 (第二期) ==========

/// Execute a command in a container
#[tauri::command]
pub async fn docker_exec_command(
    state: State<'_, DockerServiceState>,
    connection_id: String,
    container_id: String,
    cmd: Vec<String>,
) -> Result<String, String> {
    state.0.exec_command(&connection_id, &container_id, cmd).await
}

/// Start an interactive exec session in a container
#[tauri::command]
pub async fn docker_exec_start(
    app_handle: tauri::AppHandle,
    state: State<'_, DockerServiceState>,
    connection_id: String,
    container_id: String,
    cmd: Vec<String>,
    cols: u16,
    rows: u16,
) -> Result<String, String> {
    use futures::channel::mpsc;
    use futures::StreamExt;
    use tauri::Emitter;

    // Create channel for output
    let (output_tx, mut output_rx) = mpsc::unbounded::<Vec<u8>>();

    // Start the interactive exec
    let exec_id = state.0
        .exec_start_interactive(&connection_id, &container_id, cmd, cols, rows, output_tx)
        .await?;

    // Spawn task to forward output to frontend via events
    let exec_id_clone = exec_id.clone();
    let app_handle_clone = app_handle.clone();
    tokio::spawn(async move {
        while let Some(data) = output_rx.next().await {
            let event_name = format!("docker-exec-data-{}", exec_id_clone);
            let _ = app_handle_clone.emit(&event_name, data);
        }
    });

    Ok(exec_id)
}

/// Send data to an interactive exec session
#[tauri::command]
pub async fn docker_exec_send_data(
    state: State<'_, DockerServiceState>,
    connection_id: String,
    exec_id: String,
    data: Vec<u8>,
) -> Result<(), String> {
    state.0.exec_send_data(&connection_id, &exec_id, data).await
}

/// Resize an interactive exec session
#[tauri::command]
pub async fn docker_exec_resize(
    state: State<'_, DockerServiceState>,
    connection_id: String,
    exec_id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    state.0.exec_resize(&connection_id, &exec_id, cols, rows).await
}

/// Close an interactive exec session
#[tauri::command]
pub async fn docker_exec_close(
    state: State<'_, DockerServiceState>,
    connection_id: String,
    exec_id: String,
) -> Result<(), String> {
    state.0.exec_close(&connection_id, &exec_id).await
}

// ========== Docker Compose 编排命令 (第二期) ==========

/// List Docker Compose projects
#[tauri::command]
pub async fn docker_list_compose_projects(
    state: State<'_, DockerServiceState>,
    connection_id: String,
) -> Result<Vec<ComposeProject>, String> {
    state.0.list_compose_projects(&connection_id).await
}

/// Get containers for a Compose project
#[tauri::command]
pub async fn docker_get_compose_containers(
    state: State<'_, DockerServiceState>,
    connection_id: String,
    project_name: String,
) -> Result<Vec<ComposeContainer>, String> {
    state.0.get_compose_containers(&connection_id, &project_name).await
}

/// Get Compose file content
#[tauri::command]
pub async fn docker_get_compose_content(
    state: State<'_, DockerServiceState>,
    connection_id: String,
    project_name: String,
) -> Result<String, String> {
    state.0.get_compose_content(&connection_id, &project_name).await
}

/// Create a new Compose project
#[tauri::command]
pub async fn docker_create_compose_project(
    state: State<'_, DockerServiceState>,
    connection_id: String,
    request: CreateComposeRequest,
) -> Result<(), String> {
    state.0.create_compose_project(&connection_id, request).await
}

/// Update Compose file content
#[tauri::command]
pub async fn docker_update_compose_content(
    state: State<'_, DockerServiceState>,
    connection_id: String,
    request: UpdateComposeRequest,
) -> Result<(), String> {
    state.0.update_compose_content(&connection_id, request).await
}

/// Start a Compose project
#[tauri::command]
pub async fn docker_start_compose(
    state: State<'_, DockerServiceState>,
    connection_id: String,
    project_name: String,
) -> Result<(), String> {
    state.0.start_compose(&connection_id, &project_name).await
}

/// Stop a Compose project
#[tauri::command]
pub async fn docker_stop_compose(
    state: State<'_, DockerServiceState>,
    connection_id: String,
    project_name: String,
) -> Result<(), String> {
    state.0.stop_compose(&connection_id, &project_name).await
}

/// Restart a Compose project
#[tauri::command]
pub async fn docker_restart_compose(
    state: State<'_, DockerServiceState>,
    connection_id: String,
    project_name: String,
) -> Result<(), String> {
    state.0.restart_compose(&connection_id, &project_name).await
}

/// Remove a Compose project
#[tauri::command]
pub async fn docker_remove_compose(
    state: State<'_, DockerServiceState>,
    connection_id: String,
    project_name: String,
    remove_volumes: bool,
) -> Result<(), String> {
    state.0.remove_compose(&connection_id, &project_name, remove_volumes).await
}

/// Get Compose project logs
#[tauri::command]
pub async fn docker_get_compose_logs(
    state: State<'_, DockerServiceState>,
    connection_id: String,
    project_name: String,
    tail: Option<u32>,
    service: Option<String>,
) -> Result<String, String> {
    state.0.get_compose_logs(&connection_id, &project_name, tail, service.as_deref()).await
}

/// Get Compose project path
#[tauri::command]
pub async fn docker_get_compose_path(
    state: State<'_, DockerServiceState>,
    connection_id: String,
    project_name: String,
) -> Result<String, String> {
    state.0.get_compose_path(&connection_id, &project_name).await
}

// ========== 仓库管理命令 (第三期) ==========

/// List configured registries
#[tauri::command]
pub async fn docker_list_registries(
    state: State<'_, DockerServiceState>,
    connection_id: String,
) -> Result<Vec<RegistryInfo>, String> {
    state.0.list_registries(&connection_id).await
}

/// Create a new registry configuration
#[tauri::command]
pub async fn docker_create_registry(
    state: State<'_, DockerServiceState>,
    connection_id: String,
    request: CreateRegistryRequest,
) -> Result<RegistryInfo, String> {
    state.0.create_registry(&connection_id, request).await
}

/// Update an existing registry configuration
#[tauri::command]
pub async fn docker_update_registry(
    state: State<'_, DockerServiceState>,
    connection_id: String,
    request: UpdateRegistryRequest,
) -> Result<RegistryInfo, String> {
    state.0.update_registry(&connection_id, request).await
}

/// Delete a registry configuration
#[tauri::command]
pub async fn docker_delete_registry(
    state: State<'_, DockerServiceState>,
    connection_id: String,
    registry_id: String,
) -> Result<(), String> {
    state.0.delete_registry(&connection_id, &registry_id).await
}

/// Test registry connection
#[tauri::command]
pub async fn docker_test_registry(
    state: State<'_, DockerServiceState>,
    connection_id: String,
    registry_id: String,
) -> Result<bool, String> {
    state.0.test_registry(&connection_id, &registry_id).await
}

/// Test registry connection directly without saving
/// Supports both Basic Auth and Docker Registry Token Auth (Bearer)
#[tauri::command]
pub async fn docker_test_registry_direct(
    url: String,
    username: Option<String>,
    password: Option<String>,
    skip_tls_verify: bool,
) -> Result<String, String> {
    // Delegate to the shared, credential-safe implementation (curl auth via
    // stdin --config, not `-u user:pass` on the argv where it leaks into the
    // process list). Run the blocking curl calls off the async runtime.
    tokio::task::spawn_blocking(move || {
        crate::services::docker::registry_helpers::test_registry_connection(
            &url,
            username.as_deref(),
            password.as_deref(),
            skip_tls_verify,
        )
    })
    .await
    .map_err(|e| format!("registry test task failed: {}", e))?
}

/// Search for images in a registry
#[tauri::command]
pub async fn docker_search_registry_images(
    state: State<'_, DockerServiceState>,
    connection_id: String,
    registry_id: String,
    query: Option<String>,
) -> Result<Vec<RegistryImage>, String> {
    state.0.search_registry_images(&connection_id, &registry_id, query.as_deref()).await
}

/// Pull images from a registry
#[tauri::command]
pub async fn docker_pull_from_registry(
    state: State<'_, DockerServiceState>,
    connection_id: String,
    registry_id: String,
    images: Vec<String>,
) -> Result<(), String> {
    state.0.pull_from_registry(&connection_id, &registry_id, images).await
}
