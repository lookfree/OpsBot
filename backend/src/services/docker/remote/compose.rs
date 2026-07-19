//! Docker Compose orchestration for the remote Docker driver.
//! Method bodies extracted from `mod.rs` verbatim.

use super::*;
use super::parsing::parse_compose_status;
use crate::models::docker::ComposeSource;

impl RemoteDockerDriver {
    pub(super) async fn list_compose_projects_impl(&self) -> Result<Vec<ComposeProject>, String> {
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

    pub(super) async fn get_compose_containers_impl(&self, project_name: &str) -> Result<Vec<ComposeContainer>, String> {
        validate_project_name(project_name)?;
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

    pub(super) async fn create_compose_project_impl(&self, request: CreateComposeRequest) -> Result<(), String> {
        validate_project_name(&request.name)?;
        let project_path = if let Some(path) = &request.path {
            path.clone()
        } else {
            format!("~/docker-compose/{}", request.name)
        };

        // Create directory
        let mkdir_cmd = format!("mkdir -p {}", shq(&project_path));
        self.ssh_exec(&mkdir_cmd)
            .await
            .map_err(|e| format!("Failed to create project directory: {}", e))?;

        // Write docker-compose.yml
        let compose_file = format!("{}/docker-compose.yml", project_path);
        let write_cmd = format!("echo {} > {}", shq(&request.content), shq(&compose_file));
        self.ssh_exec(&write_cmd)
            .await
            .map_err(|e| format!("Failed to write compose file: {}", e))?;

        // Run docker compose up -d
        let up_cmd = format!("cd {} && docker compose -p {} up -d", shq(&project_path), shq(&request.name));
        let (up_out, up_exit) = self.ssh_exec_status(&up_cmd)
            .await
            .map_err(|e| format!("docker compose up failed: {}", e))?;
        if up_exit.unwrap_or(0) != 0 {
            return Err(format!("docker compose up failed: {}", up_out.trim()));
        }

        Ok(())
    }

    pub(super) async fn update_compose_content_impl(&self, request: UpdateComposeRequest) -> Result<(), String> {
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
            if let Ok(result) = self.ssh_exec(&check_cmd).await {
                if result.trim() == "exists" {
                    let write_cmd = format!("echo {} > {}", shq(&request.content), shq(&file_path));
                    self.ssh_exec(&write_cmd)
                        .await
                        .map_err(|e| format!("Failed to write compose file: {}", e))?;
                    return Ok(());
                }
            }
        }

        Err("Compose file not found".to_string())
    }
}
