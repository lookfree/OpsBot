//! Remote Docker driver implementation
//!
//! Connects to remote Docker daemon via SSH tunnel.
//! Uses command-line docker commands executed over SSH.

use async_trait::async_trait;
use std::sync::Arc;

use super::traits::DockerDriver;
use crate::models::docker::{
    ComposeContainer, ComposeProject, ComposeSource, ContainerInfo, ContainerStats,
    CreateComposeRequest, CreateNetworkRequest, CreateRegistryRequest, CreateVolumeRequest,
    DockerInfo, DockerSettings, DockerStats, DockerTestResult, ImageInfo, NetworkContainer,
    NetworkDetail, NetworkInfo, PortMapping, PruneResult, RegistryImage, RegistryInfo,
    RegistryStatus, RegistryType, UpdateComposeRequest, UpdateRegistryRequest, VolumeInfo,
};
use crate::services::SshService;
use std::collections::HashMap;

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
    ssh_session_id: String,
}

impl RemoteDockerDriver {
    /// Create a new remote Docker driver
    pub fn new(ssh_service: Arc<SshService>, ssh_session_id: String) -> Self {
        Self {
            ssh_service,
            ssh_session_id,
        }
    }

    /// Execute a docker command via SSH
    async fn exec_docker_cmd(&self, args: &str) -> Result<String, String> {
        let cmd = format!("docker {}", args);
        self.ssh_service
            .exec_command(&self.ssh_session_id, &cmd)
            .await
            .map_err(|e| e.to_string())
    }

    /// Parse container list from docker ps --format json
    fn parse_containers(&self, output: &str) -> Result<Vec<ContainerInfo>, String> {
        let mut containers = Vec::new();

        for line in output.lines() {
            let line = line.trim();
            if line.is_empty() {
                continue;
            }

            if let Ok(json) = serde_json::from_str::<serde_json::Value>(line) {
                let id = json["ID"].as_str().unwrap_or_default().to_string();
                let name = json["Names"].as_str().unwrap_or_default().to_string();
                let image = json["Image"].as_str().unwrap_or_default().to_string();
                let status = json["Status"].as_str().unwrap_or_default().to_string();
                let state = json["State"].as_str().unwrap_or_default().to_string();
                let _created_at = json["CreatedAt"].as_str().unwrap_or_default();

                // Parse ports from "0.0.0.0:8080->80/tcp" format
                let ports_str = json["Ports"].as_str().unwrap_or_default();
                let ports = Self::parse_ports(ports_str);

                // Parse created timestamp (approximate)
                let created = chrono::Utc::now().timestamp();

                containers.push(ContainerInfo {
                    id,
                    name,
                    image,
                    status,
                    state,
                    created,
                    ports,
                });
            }
        }

        Ok(containers)
    }

    /// Parse ports string like "0.0.0.0:8080->80/tcp, :::8080->80/tcp"
    fn parse_ports(ports_str: &str) -> Vec<PortMapping> {
        let mut ports = Vec::new();

        for part in ports_str.split(", ") {
            let part = part.trim();
            if part.is_empty() {
                continue;
            }

            // Format: "0.0.0.0:8080->80/tcp" or "80/tcp"
            if let Some((host_part, container_part)) = part.split_once("->") {
                // Has port mapping
                let (container_port_str, protocol) = container_part
                    .split_once('/')
                    .unwrap_or((container_part, "tcp"));

                let container_port = container_port_str.parse().unwrap_or(0);

                // Parse host part: "0.0.0.0:8080" or "[::]:8080"
                let (host_ip, host_port) = if let Some((ip, port)) = host_part.rsplit_once(':') {
                    (Some(ip.to_string()), port.parse().ok())
                } else {
                    (None, None)
                };

                if container_port > 0 {
                    ports.push(PortMapping {
                        container_port,
                        host_port,
                        protocol: protocol.to_string(),
                        host_ip,
                    });
                }
            } else {
                // Just exposed port without mapping: "80/tcp"
                let (port_str, protocol) = part.split_once('/').unwrap_or((part, "tcp"));
                if let Ok(port) = port_str.parse() {
                    ports.push(PortMapping {
                        container_port: port,
                        host_port: None,
                        protocol: protocol.to_string(),
                        host_ip: None,
                    });
                }
            }
        }

        ports
    }

    /// Parse image list from docker images --format json
    fn parse_images(&self, output: &str) -> Result<Vec<ImageInfo>, String> {
        let mut images = Vec::new();

        for line in output.lines() {
            let line = line.trim();
            if line.is_empty() {
                continue;
            }

            if let Ok(json) = serde_json::from_str::<serde_json::Value>(line) {
                let id = json["ID"].as_str().unwrap_or_default().to_string();
                let repository = json["Repository"].as_str().unwrap_or_default();
                let tag = json["Tag"].as_str().unwrap_or_default();
                let size_str = json["Size"].as_str().unwrap_or("0");

                // Build tag
                let full_tag = if repository != "<none>" && tag != "<none>" {
                    format!("{}:{}", repository, tag)
                } else if repository != "<none>" {
                    repository.to_string()
                } else {
                    String::new()
                };

                let tags = if full_tag.is_empty() {
                    vec![]
                } else {
                    vec![full_tag]
                };

                // Parse size (e.g., "1.23GB", "456MB")
                let size = Self::parse_size(size_str);

                // Parse created timestamp
                let created = chrono::Utc::now().timestamp();

                images.push(ImageInfo {
                    id,
                    tags,
                    size,
                    created,
                });
            }
        }

        Ok(images)
    }

    /// Parse size string like "1.23GB" to bytes
    fn parse_size(size_str: &str) -> u64 {
        let size_str = size_str.trim();
        if size_str.is_empty() {
            return 0;
        }

        let (num_str, unit) = if size_str.ends_with("GB") {
            (&size_str[..size_str.len() - 2], 1024 * 1024 * 1024)
        } else if size_str.ends_with("MB") {
            (&size_str[..size_str.len() - 2], 1024 * 1024)
        } else if size_str.ends_with("KB") || size_str.ends_with("kB") {
            (&size_str[..size_str.len() - 2], 1024)
        } else if size_str.ends_with('B') {
            (&size_str[..size_str.len() - 1], 1)
        } else {
            (size_str, 1)
        };

        num_str.parse::<f64>().unwrap_or(0.0) as u64 * unit
    }
}

#[async_trait]
impl DockerDriver for RemoteDockerDriver {
    async fn test_connection(&self) -> Result<DockerTestResult, String> {
        let output = self.exec_docker_cmd("version --format '{{json .}}'").await;

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
        // Get version info
        let version_output = self.exec_docker_cmd("version --format '{{json .}}'").await?;
        let version_json: serde_json::Value = serde_json::from_str(&version_output)
            .unwrap_or_default();

        // Get system info
        let info_output = self.exec_docker_cmd("info --format '{{json .}}'").await?;
        let info_json: serde_json::Value = serde_json::from_str(&info_output)
            .unwrap_or_default();

        Ok(DockerInfo {
            version: version_json["Server"]["Version"]
                .as_str()
                .or_else(|| version_json["Client"]["Version"].as_str())
                .unwrap_or_default()
                .to_string(),
            api_version: version_json["Server"]["ApiVersion"]
                .as_str()
                .or_else(|| version_json["Client"]["ApiVersion"].as_str())
                .unwrap_or_default()
                .to_string(),
            os: info_json["OperatingSystem"]
                .as_str()
                .unwrap_or_default()
                .to_string(),
            arch: info_json["Architecture"]
                .as_str()
                .unwrap_or_default()
                .to_string(),
            kernel_version: info_json["KernelVersion"]
                .as_str()
                .unwrap_or_default()
                .to_string(),
            root_dir: info_json["DockerRootDir"]
                .as_str()
                .unwrap_or_default()
                .to_string(),
            storage_driver: info_json["Driver"]
                .as_str()
                .unwrap_or_default()
                .to_string(),
            containers_running: info_json["ContainersRunning"]
                .as_u64()
                .unwrap_or(0) as u32,
            containers_paused: info_json["ContainersPaused"]
                .as_u64()
                .unwrap_or(0) as u32,
            containers_stopped: info_json["ContainersStopped"]
                .as_u64()
                .unwrap_or(0) as u32,
            images: info_json["Images"]
                .as_u64()
                .unwrap_or(0) as u32,
            memory_total: info_json["MemTotal"]
                .as_u64()
                .unwrap_or(0),
            cpus: info_json["NCPU"]
                .as_u64()
                .unwrap_or(0) as u32,
        })
    }

    async fn get_stats(&self) -> Result<DockerStats, String> {
        // Get system info for container counts
        let info_output = self.exec_docker_cmd("info --format '{{json .}}'").await?;
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
        // Get system info for registry settings
        let info_output = self.exec_docker_cmd("info --format '{{json .}}'").await?;
        let info_json: serde_json::Value = serde_json::from_str(&info_output)
            .unwrap_or_default();

        // Parse registry mirrors
        let registry_mirrors = info_json["RegistryConfig"]["Mirrors"]
            .as_array()
            .map(|arr| {
                arr.iter()
                    .filter_map(|v| v.as_str().map(|s| s.to_string()))
                    .collect()
            })
            .unwrap_or_default();

        // Get storage path
        let storage_path = info_json["DockerRootDir"]
            .as_str()
            .unwrap_or_default()
            .to_string();

        // Get cgroup driver
        let cgroup_driver = info_json["CgroupDriver"]
            .as_str()
            .unwrap_or("unknown")
            .to_string();

        // Get live restore status
        let live_restore = info_json["LiveRestoreEnabled"]
            .as_bool()
            .unwrap_or(false);

        // Get IPv6 status
        let ipv6_enabled = info_json["IPv6Forwarding"]
            .as_bool()
            .unwrap_or(false);

        Ok(DockerSettings {
            registry_mirrors,
            storage_path,
            socket_path: "/var/run/docker.sock".to_string(),
            cgroup_driver,
            live_restore,
            ipv6_enabled,
        })
    }

    async fn update_registry_mirrors(&self, mirrors: Vec<String>) -> Result<(), String> {
        // Read current daemon.json
        let read_cmd = "cat /etc/docker/daemon.json 2>/dev/null || echo '{}'";
        let current_config = self.ssh_service
            .exec_command(&self.ssh_session_id, read_cmd)
            .await
            .map_err(|e| e.to_string())?;

        // Parse and update config
        let mut config: serde_json::Value = serde_json::from_str(&current_config)
            .unwrap_or(serde_json::json!({}));

        config["registry-mirrors"] = serde_json::json!(mirrors);

        let new_config = serde_json::to_string_pretty(&config)
            .map_err(|e| format!("Failed to serialize config: {}", e))?;

        // Write back to daemon.json (requires sudo)
        let write_cmd = format!(
            "echo '{}' | sudo tee /etc/docker/daemon.json > /dev/null",
            new_config.replace('\'', "'\"'\"'")
        );
        self.ssh_service
            .exec_command(&self.ssh_session_id, &write_cmd)
            .await
            .map_err(|e| format!("Failed to write daemon.json: {}", e))?;

        Ok(())
    }

    async fn stop_daemon(&self) -> Result<(), String> {
        // Try systemctl first, then service command
        let result = self.ssh_service
            .exec_command(&self.ssh_session_id, "sudo systemctl stop docker")
            .await;

        if result.is_err() {
            self.ssh_service
                .exec_command(&self.ssh_session_id, "sudo service docker stop")
                .await
                .map_err(|e| format!("Failed to stop Docker daemon: {}", e))?;
        }

        Ok(())
    }

    async fn restart_daemon(&self) -> Result<(), String> {
        // Try systemctl first, then service command
        let result = self.ssh_service
            .exec_command(&self.ssh_session_id, "sudo systemctl restart docker")
            .await;

        if result.is_err() {
            self.ssh_service
                .exec_command(&self.ssh_session_id, "sudo service docker restart")
                .await
                .map_err(|e| format!("Failed to restart Docker daemon: {}", e))?;
        }

        Ok(())
    }

    // ========== 网络管理 (第二期) ==========

    async fn list_networks(&self) -> Result<Vec<NetworkInfo>, String> {
        let format = r#"--format '{"ID":"{{.ID}}","Name":"{{.Name}}","Driver":"{{.Driver}}","Scope":"{{.Scope}}","CreatedAt":"{{.CreatedAt}}","Internal":"{{.Internal}}"}'"#;
        let output = self.exec_docker_cmd(&format!("network ls {}", format)).await?;

        let mut networks = Vec::new();
        for line in output.lines() {
            let line = line.trim();
            if line.is_empty() {
                continue;
            }

            if let Ok(json) = serde_json::from_str::<serde_json::Value>(line) {
                let id = json["ID"].as_str().unwrap_or_default().to_string();
                let name = json["Name"].as_str().unwrap_or_default().to_string();

                // Get additional info by inspecting the network
                let ipam_info = self.get_network_ipam(&id).await.unwrap_or_default();

                networks.push(NetworkInfo {
                    id,
                    name,
                    driver: json["Driver"].as_str().unwrap_or_default().to_string(),
                    scope: json["Scope"].as_str().unwrap_or_default().to_string(),
                    created: json["CreatedAt"].as_str().unwrap_or_default().to_string(),
                    ipam_subnet: ipam_info.0,
                    ipam_gateway: ipam_info.1,
                    containers_count: ipam_info.2,
                    internal: json["Internal"].as_str().unwrap_or("false") == "true",
                });
            }
        }

        Ok(networks)
    }

    async fn inspect_network(&self, network_id: &str) -> Result<NetworkDetail, String> {
        let output = self.exec_docker_cmd(&format!("network inspect {}", shq(network_id))).await?;
        let json_array: Vec<serde_json::Value> = serde_json::from_str(&output)
            .map_err(|e| format!("Failed to parse network inspect output: {}", e))?;

        let json = json_array.first()
            .ok_or_else(|| "No network found".to_string())?;

        // Parse containers
        let containers: Vec<NetworkContainer> = json["Containers"]
            .as_object()
            .map(|c| {
                c.iter()
                    .map(|(id, info)| NetworkContainer {
                        container_id: id.clone(),
                        name: info["Name"].as_str().unwrap_or_default().to_string(),
                        ipv4_address: info["IPv4Address"].as_str().map(|s| s.to_string()),
                        ipv6_address: info["IPv6Address"].as_str().map(|s| s.to_string()),
                        mac_address: info["MacAddress"].as_str().map(|s| s.to_string()),
                    })
                    .collect()
            })
            .unwrap_or_default();

        // Parse IPAM config
        let ipam_config = json["IPAM"]["Config"]
            .as_array()
            .and_then(|arr| arr.first());

        let info = NetworkInfo {
            id: json["Id"].as_str().unwrap_or_default().to_string(),
            name: json["Name"].as_str().unwrap_or_default().to_string(),
            driver: json["Driver"].as_str().unwrap_or_default().to_string(),
            scope: json["Scope"].as_str().unwrap_or_default().to_string(),
            created: json["Created"].as_str().unwrap_or_default().to_string(),
            ipam_subnet: ipam_config.and_then(|c| c["Subnet"].as_str().map(|s| s.to_string())),
            ipam_gateway: ipam_config.and_then(|c| c["Gateway"].as_str().map(|s| s.to_string())),
            containers_count: containers.len() as u32,
            internal: json["Internal"].as_bool().unwrap_or(false),
        };

        // Parse options and labels
        let options: HashMap<String, String> = json["Options"]
            .as_object()
            .map(|obj| {
                obj.iter()
                    .filter_map(|(k, v)| v.as_str().map(|s| (k.clone(), s.to_string())))
                    .collect()
            })
            .unwrap_or_default();

        let labels: HashMap<String, String> = json["Labels"]
            .as_object()
            .map(|obj| {
                obj.iter()
                    .filter_map(|(k, v)| v.as_str().map(|s| (k.clone(), s.to_string())))
                    .collect()
            })
            .unwrap_or_default();

        Ok(NetworkDetail {
            info,
            containers,
            options,
            labels,
        })
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
        let format = r#"--format '{"Name":"{{.Name}}","Driver":"{{.Driver}}","Mountpoint":"{{.Mountpoint}}","Scope":"{{.Scope}}"}'"#;
        let output = self.exec_docker_cmd(&format!("volume ls {}", format)).await?;

        let mut volumes = Vec::new();
        for line in output.lines() {
            let line = line.trim();
            if line.is_empty() {
                continue;
            }

            if let Ok(json) = serde_json::from_str::<serde_json::Value>(line) {
                let name = json["Name"].as_str().unwrap_or_default().to_string();

                // Get additional info by inspecting the volume
                let (created, labels, size) = self.get_volume_details(&name).await.unwrap_or_default();

                volumes.push(VolumeInfo {
                    name,
                    driver: json["Driver"].as_str().unwrap_or_default().to_string(),
                    mountpoint: json["Mountpoint"].as_str().unwrap_or_default().to_string(),
                    created,
                    size,
                    scope: json["Scope"].as_str().unwrap_or("local").to_string(),
                    labels,
                });
            }
        }

        Ok(volumes)
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
        use chrono::Utc;

        // Use docker stats with --no-stream to get a single snapshot
        let format = r#"--format '{"Name":"{{.Name}}","CPUPerc":"{{.CPUPerc}}","MemUsage":"{{.MemUsage}}","MemPerc":"{{.MemPerc}}","NetIO":"{{.NetIO}}","BlockIO":"{{.BlockIO}}"}'"#;
        let output = self.exec_docker_cmd(&format!("stats {} --no-stream {}", shq(container_id), format)).await?;

        let line = output.lines().next().ok_or("No stats output")?;
        let json: serde_json::Value = serde_json::from_str(line)
            .map_err(|e| format!("Failed to parse stats: {}", e))?;

        // Parse CPU percentage (e.g., "0.50%")
        let cpu_percent = json["CPUPerc"]
            .as_str()
            .unwrap_or("0%")
            .trim_end_matches('%')
            .parse::<f64>()
            .unwrap_or(0.0);

        // Parse memory usage (e.g., "100MiB / 8GiB")
        let mem_usage_str = json["MemUsage"].as_str().unwrap_or("0B / 0B");
        let (memory_usage, memory_limit) = Self::parse_memory_usage(mem_usage_str);

        // Parse memory percentage (e.g., "1.22%")
        let memory_percent = json["MemPerc"]
            .as_str()
            .unwrap_or("0%")
            .trim_end_matches('%')
            .parse::<f64>()
            .unwrap_or(0.0);

        // Parse network I/O (e.g., "1.5kB / 0B")
        let net_io_str = json["NetIO"].as_str().unwrap_or("0B / 0B");
        let (network_rx, network_tx) = Self::parse_io_values(net_io_str);

        // Parse block I/O (e.g., "0B / 0B")
        let block_io_str = json["BlockIO"].as_str().unwrap_or("0B / 0B");
        let (block_read, block_write) = Self::parse_io_values(block_io_str);

        Ok(ContainerStats {
            container_id: container_id.to_string(),
            name: json["Name"].as_str().unwrap_or_default().to_string(),
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
        self.ssh_service
            .exec_interactive_start(&self.ssh_session_id, &docker_cmd, cols, rows, output_tx)
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
        use chrono::Utc;

        let output = self.exec_docker_cmd("compose ls --format json").await?;

        if output.trim().is_empty() {
            return Ok(Vec::new());
        }

        let projects: Vec<serde_json::Value> = serde_json::from_str(&output)
            .map_err(|e| format!("Failed to parse compose ls output: {}", e))?;

        let mut result = Vec::new();
        for project in projects {
            let name = project["Name"].as_str().unwrap_or("").to_string();
            let status_str = project["Status"].as_str().unwrap_or("");
            let config_files = project["ConfigFiles"].as_str().unwrap_or("");

            let (running_count, total_count, status) = parse_compose_status(status_str);

            let source = if config_files.contains("/1panel/") || config_files.contains("/app-store/") {
                ComposeSource::AppStore
            } else {
                ComposeSource::Local
            };

            let path = if let Some(first_file) = config_files.split(',').next() {
                first_file.trim().rsplit_once('/').map(|(dir, _)| dir.to_string()).unwrap_or_default()
            } else {
                String::new()
            };

            result.push(ComposeProject {
                name,
                source,
                path,
                created_at: Utc::now().timestamp(),
                running_count,
                total_count,
                status,
            });
        }

        Ok(result)
    }

    async fn get_compose_containers(&self, project_name: &str) -> Result<Vec<ComposeContainer>, String> {
        let output = self.exec_docker_cmd(&format!("compose -p {} ps --format json -a", shq(project_name))).await?;

        if output.trim().is_empty() {
            return Ok(Vec::new());
        }

        let mut result = Vec::new();
        for line in output.lines() {
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

            let ports_str = container["Ports"].as_str().unwrap_or("");
            let ports = Self::parse_ports(ports_str);

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
            if let Ok(content) = self.ssh_service.exec_command(&self.ssh_session_id, &cmd).await {
                if !content.trim().is_empty() {
                    return Ok(content);
                }
            }
        }

        Err("Compose file not found".to_string())
    }

    async fn create_compose_project(&self, request: CreateComposeRequest) -> Result<(), String> {
        let project_path = if let Some(path) = &request.path {
            path.clone()
        } else {
            format!("~/docker-compose/{}", request.name)
        };

        // Create directory
        let mkdir_cmd = format!("mkdir -p {}", shq(&project_path));
        self.ssh_service.exec_command(&self.ssh_session_id, &mkdir_cmd)
            .await
            .map_err(|e| format!("Failed to create project directory: {}", e))?;

        // Write docker-compose.yml
        let compose_file = format!("{}/docker-compose.yml", project_path);
        let write_cmd = format!("echo {} > {}", shq(&request.content), shq(&compose_file));
        self.ssh_service.exec_command(&self.ssh_session_id, &write_cmd)
            .await
            .map_err(|e| format!("Failed to write compose file: {}", e))?;

        // Run docker compose up -d
        let up_cmd = format!("cd {} && docker compose -p {} up -d", shq(&project_path), shq(&request.name));
        self.ssh_service.exec_command(&self.ssh_session_id, &up_cmd)
            .await
            .map_err(|e| format!("docker compose up failed: {}", e))?;

        Ok(())
    }

    async fn update_compose_content(&self, request: UpdateComposeRequest) -> Result<(), String> {
        let projects = self.list_compose_projects().await?;
        let project = projects.iter()
            .find(|p| p.name == request.name)
            .ok_or_else(|| format!("Compose project '{}' not found", request.name))?;

        if project.path.is_empty() {
            return Err("Project path not found".to_string());
        }

        // Find and update compose file
        for filename in ["docker-compose.yml", "docker-compose.yaml", "compose.yml", "compose.yaml"] {
            let file_path = format!("{}/{}", project.path, filename);
            let check_cmd = format!("test -f {} && echo exists", shq(&file_path));
            if let Ok(result) = self.ssh_service.exec_command(&self.ssh_session_id, &check_cmd).await {
                if result.trim() == "exists" {
                    let write_cmd = format!("echo {} > {}", shq(&request.content), shq(&file_path));
                    self.ssh_service.exec_command(&self.ssh_session_id, &write_cmd)
                        .await
                        .map_err(|e| format!("Failed to write compose file: {}", e))?;
                    return Ok(());
                }
            }
        }

        Err("Compose file not found".to_string())
    }

    async fn start_compose(&self, project_name: &str) -> Result<(), String> {
        self.exec_docker_cmd(&format!("compose -p {} start", shq(project_name))).await?;
        Ok(())
    }

    async fn stop_compose(&self, project_name: &str) -> Result<(), String> {
        self.exec_docker_cmd(&format!("compose -p {} stop", shq(project_name))).await?;
        Ok(())
    }

    async fn restart_compose(&self, project_name: &str) -> Result<(), String> {
        self.exec_docker_cmd(&format!("compose -p {} restart", shq(project_name))).await?;
        Ok(())
    }

    async fn remove_compose(&self, project_name: &str, remove_volumes: bool) -> Result<(), String> {
        let volume_flag = if remove_volumes { "-v" } else { "" };
        self.exec_docker_cmd(&format!("compose -p {} down {}", shq(project_name), volume_flag)).await?;
        Ok(())
    }

    async fn get_compose_logs(&self, project_name: &str, tail: Option<u32>, service: Option<&str>) -> Result<String, String> {
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
        let mut registries = load_registries()?;

        // Check for duplicate name
        if registries.iter().any(|r| r.name == request.name) {
            return Err(format!("Registry '{}' already exists", request.name));
        }

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

        let registry = registries
            .iter_mut()
            .find(|r| r.id == request.registry_id)
            .ok_or_else(|| format!("Registry '{}' not found", request.registry_id))?;

        if let Some(name) = request.name {
            registry.name = name;
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
        let original_len = registries.len();

        registries.retain(|r| r.id != registry_id);

        if registries.len() == original_len {
            return Err(format!("Registry '{}' not found", registry_id));
        }

        save_registries(&registries)?;
        Ok(())
    }

    async fn test_registry(&self, registry_id: &str) -> Result<bool, String> {
        let registries = load_registries()?;
        let registry = registries
            .iter()
            .find(|r| r.id == registry_id)
            .ok_or_else(|| format!("Registry '{}' not found", registry_id))?;

        // Build docker login command based on registry type
        let login_result = match registry.registry_type {
            RegistryType::DockerHub => {
                // Docker Hub uses docker.io
                if let (Some(username), Some(password)) = (&registry.username, &registry.password) {
                    let cmd = format!(
                        "echo '{}' | docker login -u '{}' --password-stdin docker.io 2>&1",
                        password.replace("'", "'\"'\"'"),
                        username.replace("'", "'\"'\"'")
                    );
                    self.ssh_service.exec_command(&self.ssh_session_id, &cmd).await
                } else {
                    // Anonymous access - just ping the registry
                    self.ssh_service
                        .exec_command(&self.ssh_session_id, "docker info 2>&1 | grep -i registry")
                        .await
                }
            }
            _ => {
                // Other registries use their URL
                // Strip https:// or http:// prefix and trailing slash as docker login expects just the hostname
                let registry_host = registry.url
                    .trim_start_matches("https://")
                    .trim_start_matches("http://")
                    .trim_end_matches('/');
                if let (Some(username), Some(password)) = (&registry.username, &registry.password) {
                    let cmd = format!(
                        "echo {} | docker login -u {} --password-stdin {} 2>&1",
                        shq(password),
                        shq(username),
                        shq(registry_host)
                    );
                    self.ssh_service.exec_command(&self.ssh_session_id, &cmd).await
                } else {
                    let cmd = format!("docker login {} 2>&1", shq(registry_host));
                    self.ssh_service.exec_command(&self.ssh_session_id, &cmd).await
                }
            }
        };

        // Update registry status based on result
        let (success, error_msg) = match &login_result {
            Ok(output) => {
                let is_success = output.contains("Login Succeeded") || output.contains("Logged in");
                let msg = if is_success { String::new() } else { output.clone() };
                (is_success, msg)
            }
            Err(e) => (false, e.to_string()),
        };

        // Update status in storage
        let mut registries = load_registries()?;
        if let Some(reg) = registries.iter_mut().find(|r| r.id == registry_id) {
            reg.status = if success {
                RegistryStatus::Connected
            } else {
                RegistryStatus::Error(
                    if error_msg.is_empty() { "Login failed".to_string() } else { error_msg }
                )
            };
            reg.updated_at = chrono::Utc::now().timestamp();
            reg.last_sync_at = Some(chrono::Utc::now().timestamp());
        }
        save_registries(&registries)?;

        Ok(success)
    }

    async fn search_registry_images(
        &self,
        registry_id: &str,
        query: Option<&str>,
    ) -> Result<Vec<RegistryImage>, String> {
        let registries = load_registries()?;
        let registry = registries
            .iter()
            .find(|r| r.id == registry_id)
            .ok_or_else(|| format!("Registry '{}' not found", registry_id))?;

        let mut images = Vec::new();

        match registry.registry_type {
            RegistryType::DockerHub => {
                // Use docker search for Docker Hub
                let search_term = query.unwrap_or("library");
                let cmd = format!(
                    "docker search --limit 50 --format '{{{{json .}}}}' '{}'",
                    search_term.replace("'", "'\"'\"'")
                );
                let output = self.ssh_service.exec_command(&self.ssh_session_id, &cmd).await
                    .map_err(|e| format!("Search failed: {}", e))?;

                for line in output.lines() {
                    let line = line.trim();
                    if line.is_empty() {
                        continue;
                    }
                    if let Ok(json) = serde_json::from_str::<serde_json::Value>(line) {
                        let name = json["Name"].as_str().unwrap_or_default().to_string();

                        images.push(RegistryImage {
                            name,
                            tags: vec!["latest".to_string()],
                            size: None,
                            last_updated: None,
                        });
                    }
                }
            }
            RegistryType::Harbor | RegistryType::Nexus | RegistryType::Custom => {
                // For private registries, we would need to use their specific API
                // For now, return a placeholder indicating manual search is needed
                return Err(format!(
                    "Search for {} registries is not yet implemented. Please use the registry's web UI.",
                    match registry.registry_type {
                        RegistryType::Harbor => "Harbor",
                        RegistryType::Nexus => "Nexus",
                        _ => "custom",
                    }
                ));
            }
        }

        Ok(images)
    }

    async fn pull_from_registry(
        &self,
        registry_id: &str,
        images: Vec<String>,
    ) -> Result<(), String> {
        let mut registries = load_registries()?;

        // Update status to syncing
        if let Some(reg) = registries.iter_mut().find(|r| r.id == registry_id) {
            reg.status = RegistryStatus::Syncing;
            reg.updated_at = chrono::Utc::now().timestamp();
        }
        save_registries(&registries)?;

        let registry = registries
            .iter()
            .find(|r| r.id == registry_id)
            .ok_or_else(|| format!("Registry '{}' not found", registry_id))?
            .clone();

        let mut errors = Vec::new();

        for image in &images {
            // Build full image name based on registry type
            let full_image = match registry.registry_type {
                RegistryType::DockerHub => image.clone(),
                _ => {
                    let registry_host = registry.url
                        .trim_start_matches("https://")
                        .trim_start_matches("http://")
                        .trim_end_matches('/');
                    format!("{}/{}", registry_host, image)
                }
            };

            // Pull the image via SSH
            let cmd = format!("docker pull '{}'", full_image.replace("'", "'\"'\"'"));
            if let Err(e) = self.ssh_service.exec_command(&self.ssh_session_id, &cmd).await {
                errors.push(format!("{}: {}", image, e));
            }
        }

        // Update status after sync
        let mut registries = load_registries()?;
        if let Some(reg) = registries.iter_mut().find(|r| r.id == registry_id) {
            reg.status = if errors.is_empty() {
                RegistryStatus::Connected
            } else {
                RegistryStatus::Error(errors.join("; "))
            };
            reg.last_sync_at = Some(chrono::Utc::now().timestamp());
            reg.updated_at = chrono::Utc::now().timestamp();
        }
        save_registries(&registries)?;

        if errors.is_empty() {
            Ok(())
        } else {
            Err(format!("Some images failed to pull: {}", errors.join(", ")))
        }
    }

    async fn close(&self) {
        // SSH session is managed separately
    }
}

impl RemoteDockerDriver {
    /// Get network IPAM info by inspecting (subnet, gateway, container_count)
    async fn get_network_ipam(&self, network_id: &str) -> Result<(Option<String>, Option<String>, u32), String> {
        let output = self.exec_docker_cmd(&format!("network inspect {} --format '{{{{json .}}}}'", network_id)).await?;
        let json: serde_json::Value = serde_json::from_str(&output).unwrap_or_default();

        let ipam_config = json["IPAM"]["Config"]
            .as_array()
            .and_then(|arr| arr.first());

        let subnet = ipam_config.and_then(|c| c["Subnet"].as_str().map(|s| s.to_string()));
        let gateway = ipam_config.and_then(|c| c["Gateway"].as_str().map(|s| s.to_string()));
        let containers_count = json["Containers"]
            .as_object()
            .map(|c| c.len() as u32)
            .unwrap_or(0);

        Ok((subnet, gateway, containers_count))
    }

    /// Get volume details by inspecting (created, labels, size)
    async fn get_volume_details(&self, volume_name: &str) -> Result<(String, HashMap<String, String>, Option<u64>), String> {
        let output = self.exec_docker_cmd(&format!("volume inspect {} --format '{{{{json .}}}}'", volume_name)).await?;
        let json: serde_json::Value = serde_json::from_str(&output).unwrap_or_default();

        let created = json["CreatedAt"].as_str().unwrap_or_default().to_string();

        let labels: HashMap<String, String> = json["Labels"]
            .as_object()
            .map(|obj| {
                obj.iter()
                    .filter_map(|(k, v)| v.as_str().map(|s| (k.clone(), s.to_string())))
                    .collect()
            })
            .unwrap_or_default();

        let size = json["UsageData"]["Size"].as_u64();

        Ok((created, labels, size))
    }

    /// Parse memory usage string (e.g., "100MiB / 8GiB") into (usage, limit) bytes
    fn parse_memory_usage(mem_str: &str) -> (u64, u64) {
        let parts: Vec<&str> = mem_str.split('/').collect();
        if parts.len() != 2 {
            return (0, 0);
        }

        let usage = Self::parse_size_with_unit(parts[0].trim());
        let limit = Self::parse_size_with_unit(parts[1].trim());
        (usage, limit)
    }

    /// Parse I/O values (e.g., "1.5kB / 0B") into (in, out) bytes
    fn parse_io_values(io_str: &str) -> (u64, u64) {
        let parts: Vec<&str> = io_str.split('/').collect();
        if parts.len() != 2 {
            return (0, 0);
        }

        let input = Self::parse_size_with_unit(parts[0].trim());
        let output = Self::parse_size_with_unit(parts[1].trim());
        (input, output)
    }

    /// Parse size with various units (B, kB, KB, MB, MiB, GB, GiB, TB, TiB)
    fn parse_size_with_unit(size_str: &str) -> u64 {
        let size_str = size_str.trim();
        if size_str.is_empty() {
            return 0;
        }

        // Match size units (case insensitive)
        let (num_str, multiplier) = if size_str.ends_with("TiB") {
            (&size_str[..size_str.len() - 3], 1024u64 * 1024 * 1024 * 1024)
        } else if size_str.ends_with("TB") {
            (&size_str[..size_str.len() - 2], 1000u64 * 1000 * 1000 * 1000)
        } else if size_str.ends_with("GiB") {
            (&size_str[..size_str.len() - 3], 1024 * 1024 * 1024)
        } else if size_str.ends_with("GB") {
            (&size_str[..size_str.len() - 2], 1000 * 1000 * 1000)
        } else if size_str.ends_with("MiB") {
            (&size_str[..size_str.len() - 3], 1024 * 1024)
        } else if size_str.ends_with("MB") {
            (&size_str[..size_str.len() - 2], 1000 * 1000)
        } else if size_str.ends_with("KiB") {
            (&size_str[..size_str.len() - 3], 1024)
        } else if size_str.ends_with("kB") || size_str.ends_with("KB") {
            (&size_str[..size_str.len() - 2], 1000)
        } else if size_str.ends_with('B') {
            (&size_str[..size_str.len() - 1], 1)
        } else {
            (size_str, 1)
        };

        num_str.trim().parse::<f64>().unwrap_or(0.0) as u64 * multiplier
    }
}

/// Parse compose status string like "running(2)" or "exited(1), running(1)"
/// Returns (running_count, total_count, status_string)
fn parse_compose_status(status_str: &str) -> (u32, u32, String) {
    let mut running_count = 0u32;
    let mut total_count = 0u32;

    // Simple regex-like parsing without regex crate
    for part in status_str.split(',') {
        let part = part.trim();
        if let Some(paren_start) = part.find('(') {
            if let Some(paren_end) = part.find(')') {
                let state = &part[..paren_start];
                let count_str = &part[paren_start + 1..paren_end];
                if let Ok(count) = count_str.parse::<u32>() {
                    total_count += count;
                    if state == "running" {
                        running_count = count;
                    }
                }
            }
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

// ========== Registry Helper Functions (Shared with LocalDockerDriver) ==========

/// Get the path to the registries configuration file
fn get_registries_file_path() -> Result<std::path::PathBuf, String> {
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .map_err(|_| "Cannot determine home directory".to_string())?;

    let config_dir = std::path::PathBuf::from(&home)
        .join(".zwd-opsbot")
        .join("docker");

    std::fs::create_dir_all(&config_dir)
        .map_err(|e| format!("Failed to create config directory: {}", e))?;

    Ok(config_dir.join("registries.json"))
}

/// Load registries from the configuration file
fn load_registries() -> Result<Vec<RegistryInfo>, String> {
    let file_path = get_registries_file_path()?;

    if !file_path.exists() {
        return Ok(Vec::new());
    }

    let content = std::fs::read_to_string(&file_path)
        .map_err(|e| format!("Failed to read registries file: {}", e))?;

    if content.trim().is_empty() {
        return Ok(Vec::new());
    }

    let mut registries: Vec<RegistryInfo> = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse registries file: {}", e))?;

    // Decrypt passwords
    let crypto = crate::services::crypto_service::CryptoService::new();
    for reg in &mut registries {
        if let Some(encrypted) = &reg.encrypted_password {
            if let Ok(decrypted) = crypto.decrypt_storage(encrypted) {
                reg.password = Some(decrypted);
            }
        }
    }

    Ok(registries)
}

/// Save registries to the configuration file
fn save_registries(registries: &[RegistryInfo]) -> Result<(), String> {
    let file_path = get_registries_file_path()?;

    // Encrypt passwords before saving
    let crypto = crate::services::crypto_service::CryptoService::new();
    let mut registries_to_save: Vec<RegistryInfo> = registries.to_vec();
    for reg in &mut registries_to_save {
        if let Some(password) = &reg.password {
            if !password.is_empty() {
                if let Ok(encrypted) = crypto.encrypt_storage(password) {
                    reg.encrypted_password = Some(encrypted);
                }
            }
        }
    }

    let content = serde_json::to_string_pretty(&registries_to_save)
        .map_err(|e| format!("Failed to serialize registries: {}", e))?;

    std::fs::write(&file_path, content)
        .map_err(|e| format!("Failed to write registries file: {}", e))
}

#[cfg(test)]
mod tests {
    use super::shq;

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
