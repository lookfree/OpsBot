//! Docker daemon overview (info/stats) and settings for the local Docker
//! driver. Method bodies extracted from `mod.rs` verbatim. No logic changes.

use super::*;

impl LocalDockerDriver {
    pub(super) async fn get_info_impl(&self) -> Result<DockerInfo, String> {
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

    pub(super) async fn get_stats_impl(&self) -> Result<DockerStats, String> {
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

    pub(super) async fn get_settings_impl(&self) -> Result<DockerSettings, String> {
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
}
