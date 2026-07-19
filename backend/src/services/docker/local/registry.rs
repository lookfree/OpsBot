//! Registry connectivity, search and pull for the local Docker driver.
//! Method bodies extracted from `mod.rs` verbatim. No logic changes.

use super::*;
use log::info;
use crate::models::docker::{RegistryStatus, RegistryType};

impl LocalDockerDriver {
    pub(super) async fn test_registry_impl(&self, registry_id: &str) -> Result<bool, String> {
        info!("test_registry called with registry_id: {}", registry_id);

        let registries = load_registries()?;
        let registry = registries.iter()
            .find(|r| r.id == registry_id)
            .ok_or_else(|| format!("Registry '{}' not found", registry_id))?
            .clone();

        info!("Found registry: {} ({})", registry.name, registry.url);

        // Test using HTTP request (supports both Basic Auth and Token Auth).
        // test_registry_connection runs blocking curl; keep it off the async
        // runtime so a slow registry doesn't pin a tokio worker thread.
        let url = registry.url.clone();
        let user = registry.username.clone();
        let pass = registry.password.clone();
        let skip = registry.skip_tls_verify;
        let result = tokio::task::spawn_blocking(move || {
            test_registry_connection(&url, user.as_deref(), pass.as_deref(), skip)
        })
        .await
        .map_err(|e| format!("registry test task failed: {}", e))?;

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

    pub(super) async fn search_registry_images_impl(
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

        let output = tokio::process::Command::new("docker")
            .args(["search", "--limit", "25", "--format", "{{.Name}}\t{{.Description}}\t{{.StarCount}}\t{{.IsOfficial}}", search_term])
            .output()
            .await
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

    pub(super) async fn pull_from_registry_impl(
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

                let output = tokio::process::Command::new("docker")
                    .args(["pull", &full_image])
                    .output()
                    .await
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
}
