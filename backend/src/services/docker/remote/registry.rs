//! Registry connectivity, search and pull for the remote Docker driver.
//! Method bodies extracted from `mod.rs` verbatim.

use super::*;
use crate::models::docker::{RegistryStatus, RegistryType};

impl RemoteDockerDriver {
    pub(super) async fn test_registry_impl(&self, registry_id: &str) -> Result<bool, String> {
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
                    self.ssh_exec(&cmd).await
                } else {
                    // Anonymous access - just ping the registry
                    self.ssh_exec("docker info 2>&1 | grep -i registry")
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
                    self.ssh_exec(&cmd).await
                } else {
                    let cmd = format!("docker login {} 2>&1", shq(registry_host));
                    self.ssh_exec(&cmd).await
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

    pub(super) async fn search_registry_images_impl(
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
                let output = self.ssh_exec(&cmd).await
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

    pub(super) async fn pull_from_registry_impl(
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
            if let Err(e) = self.ssh_exec(&cmd).await {
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
}
