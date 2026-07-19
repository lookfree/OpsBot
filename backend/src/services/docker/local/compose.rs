//! Docker Compose orchestration for the local Docker driver.
//! Method bodies extracted from `mod.rs` verbatim. No logic changes.

use super::*;
use super::parsing::{parse_compose_status, parse_ports_string};
use crate::models::docker::ComposeSource;

impl LocalDockerDriver {
    pub(super) async fn list_compose_projects_impl(&self) -> Result<Vec<ComposeProject>, String> {
        use chrono::Utc;

        // Run docker compose ls --format json (async)
        let stdout = run_compose_checked(
            &["compose", "ls", "--format", "json"],
            "docker compose ls"
        ).await?;
        if stdout.trim().is_empty() {
            return Ok(Vec::new());
        }

        // Parse JSON output
        let projects: Vec<serde_json::Value> = serde_json::from_str(&stdout)
            .map_err(|e| format!("Failed to parse compose ls output: {}", e))?;

        let mut result = Vec::new();
        for project in projects {
            let name = project["Name"].as_str().unwrap_or("").to_string();
            let status_str = project["Status"].as_str().unwrap_or("");
            let config_files = project["ConfigFiles"].as_str().unwrap_or("");

            // Parse status like "running(2)" or "exited(1)"
            let (running_count, total_count, status) = parse_compose_status(status_str);

            // Determine source based on path
            let source = if config_files.contains("/1panel/") || config_files.contains("/app-store/") {
                ComposeSource::AppStore
            } else {
                ComposeSource::Local
            };

            // Get path (first config file's directory)
            let path = if let Some(first_file) = config_files.split(',').next() {
                Path::new(first_file.trim())
                    .parent()
                    .map(|p| p.to_string_lossy().to_string())
                    .unwrap_or_default()
            } else {
                String::new()
            };

            // Get creation time from docker-compose.yml file
            let created_at = if !path.is_empty() {
                let compose_file = Path::new(&path).join("docker-compose.yml");
                if compose_file.exists() {
                    std::fs::metadata(&compose_file)
                        .ok()
                        .and_then(|m| m.created().ok())
                        .map(|t| t.duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_secs() as i64)
                        .unwrap_or_else(|| Utc::now().timestamp())
                } else {
                    Utc::now().timestamp()
                }
            } else {
                Utc::now().timestamp()
            };

            result.push(ComposeProject {
                name,
                source,
                path,
                created_at,
                running_count,
                total_count,
                status,
            });
        }

        Ok(result)
    }

    pub(super) async fn get_compose_containers_impl(&self, project_name: &str) -> Result<Vec<ComposeContainer>, String> {
        // Validate project name
        validate_project_name(project_name)?;

        // Run docker compose ps --format json (async)
        let stdout = run_compose_checked(
            &["compose", "-p", project_name, "ps", "--format", "json", "-a"],
            "docker compose ps"
        ).await?;
        if stdout.trim().is_empty() {
            return Ok(Vec::new());
        }

        // Parse JSON output - each line is a separate JSON object
        let mut result = Vec::new();
        for line in stdout.lines() {
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

            // Parse ports
            let ports_str = container["Ports"].as_str().unwrap_or("");
            let ports = parse_ports_string(ports_str);

            // Get container stats if running
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
        // Validate project name
        validate_project_name(&request.name)?;

        // Determine and validate the project path
        let project_path = if let Some(path) = &request.path {
            validate_compose_path(path)?
        } else {
            // Default to ~/docker-compose/{name}
            let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".to_string());
            let default_path = Path::new(&home).join("docker-compose").join(&request.name);
            default_path
        };

        // Create directory if it doesn't exist
        std::fs::create_dir_all(&project_path)
            .map_err(|e| format!("Failed to create project directory: {}", e))?;

        // Write docker-compose.yml
        let compose_file = project_path.join("docker-compose.yml");
        std::fs::write(&compose_file, &request.content)
            .map_err(|e| format!("Failed to write compose file: {}", e))?;

        // Run docker compose up -d (async)
        let compose_file_str = compose_file.to_string_lossy().to_string();
        run_compose_action(
            &["compose", "-p", &request.name, "-f", &compose_file_str, "up", "-d"],
            "docker compose up"
        ).await
    }

    pub(super) async fn update_compose_content_impl(&self, request: UpdateComposeRequest) -> Result<(), String> {
        // Get the project path
        let projects = self.list_compose_projects().await?;
        let project = projects.iter()
            .find(|p| p.name == request.name)
            .ok_or_else(|| format!("Compose project '{}' not found", request.name))?;

        if project.path.is_empty() {
            return Err("Project path not found".to_string());
        }

        // Find the compose file
        let yml_path = Path::new(&project.path).join("docker-compose.yml");
        let yaml_path = Path::new(&project.path).join("docker-compose.yaml");
        let compose_path = Path::new(&project.path).join("compose.yml");
        let compose_yaml_path = Path::new(&project.path).join("compose.yaml");

        let file_path = if yml_path.exists() {
            yml_path
        } else if yaml_path.exists() {
            yaml_path
        } else if compose_path.exists() {
            compose_path
        } else if compose_yaml_path.exists() {
            compose_yaml_path
        } else {
            return Err("Compose file not found".to_string());
        };

        // Write updated content
        std::fs::write(&file_path, &request.content)
            .map_err(|e| format!("Failed to write compose file: {}", e))?;

        Ok(())
    }
}
