//! Remote Docker driver implementation
//!
//! Connects to remote Docker daemon via SSH tunnel.
//! Uses command-line docker commands executed over SSH.

use async_trait::async_trait;
use std::sync::Arc;

use super::compose_cmd::validate_project_name;
use super::registry_helpers::{load_registries, save_registries};
use super::traits::DockerDriver;
use crate::models::docker::{
    ComposeContainer, ComposeProject, ContainerInfo, ContainerStats, CreateComposeRequest,
    CreateNetworkRequest, CreateRegistryRequest, CreateVolumeRequest, DockerInfo, DockerSettings,
    DockerStats, DockerTestResult, ImageInfo, NetworkDetail, NetworkInfo, PruneResult,
    RegistryImage, RegistryInfo, UpdateComposeRequest, UpdateRegistryRequest, VolumeInfo,
};
use crate::services::SshService;
use std::collections::HashMap;

mod compose;
mod daemon;
mod net_vol;
mod parsing;
mod registry;

/// Shell-quote a value before interpolating it into a command that the remote
/// host executes via a login shell (SshService::exec_command runs
/// `channel.exec` = `sh -c cmd`). Wraps in single quotes and escapes embedded
/// single quotes with the `'"'"'` idiom. EVERY user-controlled value spliced
/// into a docker command MUST go through this to prevent shell injection.
fn shq(s: &str) -> String {
    format!("'{}'", s.replace('\'', "'\"'\"'"))
}

/// Remote Docker driver using SSH
pub struct RemoteDockerDriver {
    ssh_service: Arc<SshService>,
    /// The SSH *connection* id (saved config id). The live session id is
    /// resolved per call (see `sid`) so the driver survives an SSH reconnect
    /// instead of pinning a session id that goes stale.
    ssh_connection_id: String,
}

impl RemoteDockerDriver {
    /// Create a new remote Docker driver
    pub fn new(ssh_service: Arc<SshService>, ssh_connection_id: String) -> Self {
        Self {
            ssh_service,
            ssh_connection_id,
        }
    }

    /// Resolve the CURRENT SSH session id for this Docker connection. Resolving
    /// per call (not pinning it at connect) keeps the driver working after the
    /// SSH session is re-established, and fails clearly when it is gone instead
    /// of dispatching to a dead session id while is_connected reports healthy.
    async fn sid(&self) -> Result<String, String> {
        self.ssh_service
            .find_session_by_connection_id(&self.ssh_connection_id)
            .await
            .ok_or_else(|| "SSH session not connected; reconnect the SSH server".to_string())
    }

    /// Run a raw shell command over the current SSH session (output only).
    async fn ssh_exec(&self, cmd: &str) -> Result<String, String> {
        let sid = self.sid().await?;
        self.ssh_service
            .exec_command(&sid, cmd)
            .await
            .map_err(|e| e.to_string())
    }

    /// Run a raw shell command and return (output, exit_code).
    async fn ssh_exec_status(&self, cmd: &str) -> Result<(String, Option<u32>), String> {
        let sid = self.sid().await?;
        self.ssh_service
            .exec_command_status(&sid, cmd)
            .await
            .map_err(|e| e.to_string())
    }

    /// Execute a docker command via SSH. A non-zero exit status is surfaced as
    /// Err (docker exits non-zero only on real failure), so mutating operations
    /// no longer report success when the daemon rejected them.
    async fn exec_docker_cmd(&self, args: &str) -> Result<String, String> {
        let cmd = format!("docker {}", args);
        let (output, exit) = self.ssh_exec_status(&cmd).await?;
        match exit {
            Some(code) if code != 0 => {
                let msg = output.trim();
                Err(if msg.is_empty() {
                    format!("docker exited with status {}", code)
                } else {
                    msg.to_string()
                })
            }
            _ => Ok(output),
        }
    }
}

#[async_trait]
impl DockerDriver for RemoteDockerDriver {
    async fn test_connection(&self) -> Result<DockerTestResult, String> {
        let output = self.exec_docker_cmd("version --format '{{json .}}' 2>/dev/null").await;

        match output {
            Ok(output) => {
                if let Ok(json) = serde_json::from_str::<serde_json::Value>(&output) {
                    let version = json["Client"]["Version"]
                        .as_str()
                        .or_else(|| json["Server"]["Version"].as_str())
                        .map(|s| s.to_string());
                    let api_version = json["Client"]["ApiVersion"]
                        .as_str()
                        .or_else(|| json["Server"]["ApiVersion"].as_str())
                        .map(|s| s.to_string());

                    Ok(DockerTestResult {
                        success: true,
                        version,
                        api_version,
                        error: None,
                    })
                } else {
                    // Fallback: just check if docker command works
                    Ok(DockerTestResult {
                        success: true,
                        version: None,
                        api_version: None,
                        error: None,
                    })
                }
            }
            Err(e) => Ok(DockerTestResult {
                success: false,
                version: None,
                api_version: None,
                error: Some(e),
            }),
        }
    }

    async fn list_containers(&self, all: bool) -> Result<Vec<ContainerInfo>, String> {
        let all_flag = if all { "-a" } else { "" };
        let format = r#"--format '{"ID":"{{.ID}}","Names":"{{.Names}}","Image":"{{.Image}}","Status":"{{.Status}}","State":"{{.State}}","Ports":"{{.Ports}}","CreatedAt":"{{.CreatedAt}}"}'"#;

        let output = self.exec_docker_cmd(&format!("ps {} {}", all_flag, format)).await?;
        self.parse_containers(&output)
    }

    async fn start_container(&self, container_id: &str) -> Result<(), String> {
        self.exec_docker_cmd(&format!("start {}", shq(container_id)))
            .await?;
        Ok(())
    }

    async fn stop_container(&self, container_id: &str) -> Result<(), String> {
        self.exec_docker_cmd(&format!("stop {}", shq(container_id)))
            .await?;
        Ok(())
    }

    async fn restart_container(&self, container_id: &str) -> Result<(), String> {
        self.exec_docker_cmd(&format!("restart {}", shq(container_id)))
            .await?;
        Ok(())
    }

    async fn remove_container(&self, container_id: &str, force: bool) -> Result<(), String> {
        let force_flag = if force { "-f" } else { "" };
        self.exec_docker_cmd(&format!("rm {} {}", force_flag, shq(container_id)))
            .await?;
        Ok(())
    }

    async fn get_container_logs(
        &self,
        container_id: &str,
        tail: Option<u32>,
    ) -> Result<String, String> {
        let tail_arg = tail.map(|t| format!("--tail {}", t)).unwrap_or_default();
        self.exec_docker_cmd(&format!("logs {} {}", tail_arg, shq(container_id)))
            .await
    }

    async fn list_images(&self) -> Result<Vec<ImageInfo>, String> {
        let format = r#"--format '{"ID":"{{.ID}}","Repository":"{{.Repository}}","Tag":"{{.Tag}}","Size":"{{.Size}}","CreatedAt":"{{.CreatedAt}}"}'"#;

        let output = self.exec_docker_cmd(&format!("images {}", format)).await?;
        self.parse_images(&output)
    }

    async fn pull_image(&self, image: &str) -> Result<(), String> {
        self.exec_docker_cmd(&format!("pull {}", shq(image))).await?;
        Ok(())
    }

    async fn remove_image(&self, image_id: &str, force: bool) -> Result<(), String> {
        let force_flag = if force { "-f" } else { "" };
        self.exec_docker_cmd(&format!("rmi {} {}", force_flag, shq(image_id)))
            .await?;
        Ok(())
    }

    // ========== 概览页面方法 ==========

    async fn get_info(&self) -> Result<DockerInfo, String> {
        self.get_info_impl().await
    }

    async fn get_stats(&self) -> Result<DockerStats, String> {
        // Get system info for container counts
        let info_output = self.exec_docker_cmd("info --format '{{json .}}' 2>/dev/null").await?;
        let info_json: serde_json::Value = serde_json::from_str(&info_output)
            .unwrap_or_default();

        // Get images for size calculation
        let images = self.list_images().await?;
        let images_size: u64 = images.iter().map(|i| i.size).sum();

        let containers_running = info_json["ContainersRunning"]
            .as_u64()
            .unwrap_or(0) as u32;
        let containers_stopped = info_json["ContainersStopped"]
            .as_u64()
            .unwrap_or(0) as u32;
        let containers_paused = info_json["ContainersPaused"]
            .as_u64()
            .unwrap_or(0) as u32;

        Ok(DockerStats {
            containers_running,
            containers_stopped: containers_stopped + containers_paused,
            containers_total: containers_running + containers_stopped + containers_paused,
            images_count: info_json["Images"].as_u64().unwrap_or(0) as u32,
            images_size,
        })
    }

    // ========== 设置页面方法 ==========

    async fn get_settings(&self) -> Result<DockerSettings, String> {
        self.get_settings_impl().await
    }

    async fn update_registry_mirrors(&self, mirrors: Vec<String>) -> Result<(), String> {
        self.update_registry_mirrors_impl(mirrors).await
    }

    async fn stop_daemon(&self) -> Result<(), String> {
        // Try systemctl first, then service command
        let result = self.ssh_exec("sudo systemctl stop docker")
            .await;

        if result.is_err() {
            self.ssh_exec("sudo service docker stop")
                .await
                .map_err(|e| format!("Failed to stop Docker daemon: {}", e))?;
        }

        Ok(())
    }

    async fn restart_daemon(&self) -> Result<(), String> {
        // Try systemctl first, then service command
        let result = self.ssh_exec("sudo systemctl restart docker")
            .await;

        if result.is_err() {
            self.ssh_exec("sudo service docker restart")
                .await
                .map_err(|e| format!("Failed to restart Docker daemon: {}", e))?;
        }

        Ok(())
    }

    // ========== 网络管理 (第二期) ==========

    async fn list_networks(&self) -> Result<Vec<NetworkInfo>, String> {
        self.list_networks_impl().await
    }

    async fn inspect_network(&self, network_id: &str) -> Result<NetworkDetail, String> {
        self.inspect_network_impl(network_id).await
    }

    async fn create_network(&self, config: CreateNetworkRequest) -> Result<String, String> {
        let mut cmd = format!("network create {}", shq(&config.name));

        if let Some(driver) = &config.driver {
            cmd.push_str(&format!(" --driver {}", shq(driver)));
        }

        if let Some(subnet) = &config.subnet {
            cmd.push_str(&format!(" --subnet {}", shq(subnet)));
        }

        if let Some(gateway) = &config.gateway {
            cmd.push_str(&format!(" --gateway {}", shq(gateway)));
        }

        if config.internal.unwrap_or(false) {
            cmd.push_str(" --internal");
        }

        if let Some(labels) = &config.labels {
            for (key, value) in labels {
                cmd.push_str(&format!(" --label {}", shq(&format!("{}={}", key, value))));
            }
        }

        let output = self.exec_docker_cmd(&cmd).await?;
        Ok(output.trim().to_string())
    }

    async fn remove_network(&self, network_id: &str) -> Result<(), String> {
        self.exec_docker_cmd(&format!("network rm {}", shq(network_id))).await?;
        Ok(())
    }

    async fn connect_container_to_network(
        &self,
        network_id: &str,
        container_id: &str,
    ) -> Result<(), String> {
        self.exec_docker_cmd(&format!("network connect {} {}", shq(network_id), shq(container_id))).await?;
        Ok(())
    }

    async fn disconnect_container_from_network(
        &self,
        network_id: &str,
        container_id: &str,
    ) -> Result<(), String> {
        self.exec_docker_cmd(&format!("network disconnect {} {}", shq(network_id), shq(container_id))).await?;
        Ok(())
    }

    async fn prune_networks(&self) -> Result<PruneResult, String> {
        let output = self.exec_docker_cmd("network prune -f").await?;

        // Parse output to count deleted networks
        let deleted_count = output
            .lines()
            .filter(|line| line.contains("Deleted"))
            .count() as u32;

        Ok(PruneResult {
            deleted_count,
            space_reclaimed: 0,
        })
    }

    // ========== 存储卷管理 (第二期) ==========

    async fn list_volumes(&self) -> Result<Vec<VolumeInfo>, String> {
        self.list_volumes_impl().await
    }

    async fn create_volume(&self, config: CreateVolumeRequest) -> Result<String, String> {
        let mut cmd = format!("volume create {}", shq(&config.name));

        if let Some(driver) = &config.driver {
            cmd.push_str(&format!(" --driver {}", shq(driver)));
        }

        if let Some(opts) = &config.driver_opts {
            for (key, value) in opts {
                cmd.push_str(&format!(" --opt {}", shq(&format!("{}={}", key, value))));
            }
        }

        if let Some(labels) = &config.labels {
            for (key, value) in labels {
                cmd.push_str(&format!(" --label {}", shq(&format!("{}={}", key, value))));
            }
        }

        let output = self.exec_docker_cmd(&cmd).await?;
        Ok(output.trim().to_string())
    }

    async fn remove_volume(&self, volume_name: &str, force: bool) -> Result<(), String> {
        let force_flag = if force { "-f" } else { "" };
        self.exec_docker_cmd(&format!("volume rm {} {}", force_flag, shq(volume_name))).await?;
        Ok(())
    }

    async fn prune_volumes(&self) -> Result<PruneResult, String> {
        let output = self.exec_docker_cmd("volume prune -f").await?;

        // Parse output for deleted count and space reclaimed
        let mut deleted_count = 0u32;
        let mut space_reclaimed = 0u64;

        for line in output.lines() {
            if line.contains("Total reclaimed space:") {
                if let Some(size_str) = line.split(':').last() {
                    space_reclaimed = Self::parse_size(size_str.trim());
                }
            } else if !line.contains("Deleted") && !line.contains("Total") && !line.trim().is_empty() {
                deleted_count += 1;
            }
        }

        Ok(PruneResult {
            deleted_count,
            space_reclaimed,
        })
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
        // Escape and join command arguments
        let escaped_cmd: Vec<String> = cmd
            .iter()
            .map(|arg| {
                // Simple shell escaping - wrap in quotes and escape internal quotes
                format!("'{}'", arg.replace("'", "'\"'\"'"))
            })
            .collect();

        let cmd_str = escaped_cmd.join(" ");
        let docker_cmd = format!("exec {} {}", shq(container_id), cmd_str);

        self.exec_docker_cmd(&docker_cmd).await
    }

    async fn exec_start_interactive(
        &self,
        container_id: &str,
        cmd: Vec<String>,
        cols: u16,
        rows: u16,
        output_tx: futures::channel::mpsc::UnboundedSender<Vec<u8>>,
    ) -> Result<String, String> {
        // Build docker exec command with environment variables for proper terminal support
        let shell = cmd.first().map(|s| s.as_str()).unwrap_or("/bin/sh");
        // Use -it for interactive terminal, -e to set TERM for proper terminal handling
        // Also set COLUMNS and LINES for proper terminal size
        let docker_cmd = format!(
            "docker exec -it -e TERM=xterm-256color -e COLUMNS={} -e LINES={} {} {}",
            cols, rows, shq(container_id), shq(shell)
        );

        log::debug!("Starting remote docker exec: {}", docker_cmd);

        // Use SSH interactive exec
        let sid = self.sid().await?;
        self.ssh_service
            .exec_interactive_start(&sid, &docker_cmd, cols, rows, output_tx)
            .await
            .map_err(|e| e.to_string())
    }

    async fn exec_send_data(&self, exec_id: &str, data: Vec<u8>) -> Result<(), String> {
        self.ssh_service
            .exec_interactive_send_data(exec_id, &data)
            .await
            .map_err(|e| e.to_string())
    }

    async fn exec_resize(&self, exec_id: &str, cols: u16, rows: u16) -> Result<(), String> {
        self.ssh_service
            .exec_interactive_resize(exec_id, cols, rows)
            .await
            .map_err(|e| e.to_string())
    }

    async fn exec_close(&self, exec_id: &str) -> Result<(), String> {
        self.ssh_service
            .exec_interactive_close(exec_id)
            .await
            .map_err(|e| e.to_string())
    }

    // ========== Docker Compose 编排 (第二期) ==========

    async fn list_compose_projects(&self) -> Result<Vec<ComposeProject>, String> {
        self.list_compose_projects_impl().await
    }

    async fn get_compose_containers(&self, project_name: &str) -> Result<Vec<ComposeContainer>, String> {
        self.get_compose_containers_impl(project_name).await
    }

    async fn get_compose_content(&self, project_name: &str) -> Result<String, String> {
        let projects = self.list_compose_projects().await?;
        let project = projects.iter()
            .find(|p| p.name == project_name)
            .ok_or_else(|| format!("Compose project '{}' not found", project_name))?;

        if project.path.is_empty() {
            return Err("Project path not found".to_string());
        }

        // Try to read compose files
        for filename in ["docker-compose.yml", "docker-compose.yaml", "compose.yml", "compose.yaml"] {
            let file_path = format!("{}/{}", project.path, filename);
            let cmd = format!("cat {} 2>/dev/null", shq(&file_path));
            if let Ok(content) = self.ssh_exec(&cmd).await {
                if !content.trim().is_empty() {
                    return Ok(content);
                }
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
        self.exec_docker_cmd(&format!("compose -p {} start", shq(project_name))).await?;
        Ok(())
    }

    async fn stop_compose(&self, project_name: &str) -> Result<(), String> {
        validate_project_name(project_name)?;
        self.exec_docker_cmd(&format!("compose -p {} stop", shq(project_name))).await?;
        Ok(())
    }

    async fn restart_compose(&self, project_name: &str) -> Result<(), String> {
        validate_project_name(project_name)?;
        self.exec_docker_cmd(&format!("compose -p {} restart", shq(project_name))).await?;
        Ok(())
    }

    async fn remove_compose(&self, project_name: &str, remove_volumes: bool) -> Result<(), String> {
        validate_project_name(project_name)?;
        let volume_flag = if remove_volumes { "-v" } else { "" };
        self.exec_docker_cmd(&format!("compose -p {} down {}", shq(project_name), volume_flag)).await?;
        Ok(())
    }

    async fn get_compose_logs(&self, project_name: &str, tail: Option<u32>, service: Option<&str>) -> Result<String, String> {
        validate_project_name(project_name)?;
        let tail_arg = tail.map(|t| format!("--tail {}", t)).unwrap_or_default();
        let service_arg = service.map(shq).unwrap_or_default();
        self.exec_docker_cmd(&format!("compose -p {} logs {} {}", shq(project_name), tail_arg, service_arg)).await
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
        // Registries are stored locally (shared config)
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
        // SSH session is managed separately
    }
}

#[cfg(test)]
mod tests {
    use super::shq;
    use super::RemoteDockerDriver;

    #[test]
    fn parse_size_handles_binary_and_decimal_units() {
        // IEC binary units are 1024-based.
        assert_eq!(RemoteDockerDriver::parse_size("1KiB"), 1024);
        assert_eq!(RemoteDockerDriver::parse_size("1MiB"), 1024 * 1024);
        assert_eq!(RemoteDockerDriver::parse_size("2GiB"), 2 * 1024 * 1024 * 1024);
        // SI decimal units are 1000-based.
        assert_eq!(RemoteDockerDriver::parse_size("1kB"), 1000);
        assert_eq!(RemoteDockerDriver::parse_size("1MB"), 1000 * 1000);
        assert_eq!(RemoteDockerDriver::parse_size("1.5GB"), 1_500_000_000);
        // Plain bytes and empty/garbage input.
        assert_eq!(RemoteDockerDriver::parse_size("512B"), 512);
        assert_eq!(RemoteDockerDriver::parse_size(""), 0);
        assert_eq!(RemoteDockerDriver::parse_size("N/A"), 0);
    }

    #[test]
    fn shq_wraps_and_neutralizes_metacharacters() {
        assert_eq!(shq("simple"), "'simple'");
        // Shell metacharacters are inert inside single quotes.
        assert_eq!(shq("; rm -rf /"), "'; rm -rf /'");
        assert_eq!(shq("$(reboot)"), "'$(reboot)'");
        assert_eq!(shq("a && b `c`"), "'a && b `c`'");
    }

    #[test]
    fn shq_escapes_embedded_single_quote() {
        // a'b -> 'a'"'"'b' : closes the quote, a double-quoted quote, reopens.
        assert_eq!(shq("a'b"), "'a'\"'\"'b'");
        let out = shq("x'; reboot; '");
        assert!(out.starts_with('\'') && out.ends_with('\''));
        assert!(out.contains("'\"'\"'"));
    }
}
