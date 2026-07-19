//! Parsing helpers for the remote Docker driver.
//!
//! Pure output/parse helpers plus the two inspect-based lookups, extracted
//! from `mod.rs` verbatim. No logic changes.

use super::*;
use crate::models::docker::PortMapping;

impl RemoteDockerDriver {
    /// Parse container list from docker ps --format json
    pub(super) fn parse_containers(&self, output: &str) -> Result<Vec<ContainerInfo>, String> {
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
    pub(super) fn parse_ports(ports_str: &str) -> Vec<PortMapping> {
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
    pub(super) fn parse_images(&self, output: &str) -> Result<Vec<ImageInfo>, String> {
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
    /// Parse a Docker size string (e.g. "1.2GB", "512MiB", "900kB") into bytes.
    ///
    /// Handles both IEC binary units (KiB/MiB/GiB/TiB = 1024-based) and SI
    /// decimal units (kB/MB/GB/TB = 1000-based), matching how the Docker CLI
    /// formats sizes across `images`, `system df`, and `stats` output.
    pub(super) fn parse_size(size_str: &str) -> u64 {
        let size_str = size_str.trim();
        if size_str.is_empty() {
            return 0;
        }

        // Match size units (case insensitive), longest suffix first.
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

        (num_str.trim().parse::<f64>().unwrap_or(0.0) * multiplier as f64) as u64
    }

    /// Get network IPAM info by inspecting (subnet, gateway, container_count)
    pub(super) async fn get_network_ipam(&self, network_id: &str) -> Result<(Option<String>, Option<String>, u32), String> {
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
    pub(super) async fn get_volume_details(&self, volume_name: &str) -> Result<(String, HashMap<String, String>, Option<u64>), String> {
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
    pub(super) fn parse_memory_usage(mem_str: &str) -> (u64, u64) {
        let parts: Vec<&str> = mem_str.split('/').collect();
        if parts.len() != 2 {
            return (0, 0);
        }

        let usage = Self::parse_size(parts[0].trim());
        let limit = Self::parse_size(parts[1].trim());
        (usage, limit)
    }

    /// Parse I/O values (e.g., "1.5kB / 0B") into (in, out) bytes
    pub(super) fn parse_io_values(io_str: &str) -> (u64, u64) {
        let parts: Vec<&str> = io_str.split('/').collect();
        if parts.len() != 2 {
            return (0, 0);
        }

        let input = Self::parse_size(parts[0].trim());
        let output = Self::parse_size(parts[1].trim());
        (input, output)
    }
}

/// Parse compose status string like "running(2)" or "exited(1), running(1)"
/// Returns (running_count, total_count, status_string)
pub(super) fn parse_compose_status(status_str: &str) -> (u32, u32, String) {
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
