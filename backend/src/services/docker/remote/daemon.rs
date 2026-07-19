//! Daemon info, settings, registry-mirror config and container stats for the
//! remote Docker driver. Method bodies extracted from `mod.rs` verbatim.

use super::*;

impl RemoteDockerDriver {
    pub(super) async fn get_info_impl(&self) -> Result<DockerInfo, String> {
        // Get version info
        let version_output = self.exec_docker_cmd("version --format '{{json .}}' 2>/dev/null").await?;
        let version_json: serde_json::Value = serde_json::from_str(&version_output)
            .unwrap_or_default();

        // Get system info
        let info_output = self.exec_docker_cmd("info --format '{{json .}}' 2>/dev/null").await?;
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

    pub(super) async fn get_settings_impl(&self) -> Result<DockerSettings, String> {
        // Get system info for registry settings
        let info_output = self.exec_docker_cmd("info --format '{{json .}}' 2>/dev/null").await?;
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

    pub(super) async fn update_registry_mirrors_impl(&self, mirrors: Vec<String>) -> Result<(), String> {
        // Read current daemon.json
        let read_cmd = "cat /etc/docker/daemon.json 2>/dev/null || echo '{}'";
        let current_config = self.ssh_exec(read_cmd)
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
        self.ssh_exec(&write_cmd)
            .await
            .map_err(|e| format!("Failed to write daemon.json: {}", e))?;

        Ok(())
    }

    pub(super) async fn get_container_stats_impl(&self, container_id: &str) -> Result<ContainerStats, String> {
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
}
