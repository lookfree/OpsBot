//! Remote AI management service
//!
//! This module provides AI service management on remote servers via SSH,
//! including environment detection, Ollama model synchronization, and GPU monitoring.

use serde::{Deserialize, Serialize};
use std::sync::Arc;

use crate::models::{GpuInfo, OllamaModel, OllamaModelDetails, RemoteAiEnvironment};
use crate::services::SshService;

/// Remote AI manager for managing AI services on remote servers
pub struct RemoteAiManager {
    ssh_service: Arc<SshService>,
}

impl RemoteAiManager {
    /// Create a new remote AI manager
    pub fn new(ssh_service: Arc<SshService>) -> Self {
        Self { ssh_service }
    }

    /// Detect AI environment on remote server
    pub async fn detect_environment(
        &self,
        ssh_connection_id: &str,
    ) -> Result<RemoteAiEnvironment, String> {
        // Check Ollama installation
        let ollama_check = self
            .execute_command(ssh_connection_id, "ollama --version 2>/dev/null || echo 'NOT_FOUND'")
            .await?;

        let (ollama_installed, ollama_version) = if ollama_check.contains("NOT_FOUND") {
            (false, None)
        } else {
            let version = ollama_check
                .lines()
                .next()
                .map(|s| s.trim().to_string());
            (true, version)
        };

        // Check TensorRT-LLM installation
        let tensorrt_check = self
            .execute_command(
                ssh_connection_id,
                "python3 -c 'import tensorrt_llm; print(tensorrt_llm.__version__)' 2>/dev/null || echo 'NOT_FOUND'",
            )
            .await?;

        let tensorrt_installed = !tensorrt_check.contains("NOT_FOUND");

        // Check NVIDIA GPU
        let gpu_check = self
            .execute_command(
                ssh_connection_id,
                "nvidia-smi --query-gpu=count --format=csv,noheader 2>/dev/null || echo '0'",
            )
            .await?;

        let gpu_count = gpu_check
            .lines()
            .next()
            .and_then(|s| s.trim().parse::<usize>().ok())
            .unwrap_or(0);

        let nvidia_gpu_detected = gpu_count > 0;

        Ok(RemoteAiEnvironment {
            ollama_installed,
            ollama_version,
            tensorrt_installed,
            nvidia_gpu_detected,
            gpu_count,
        })
    }

    /// Execute Ollama command on remote server
    pub async fn execute_ollama_command(
        &self,
        ssh_connection_id: &str,
        command: &str,
    ) -> Result<String, String> {
        // Validate command to prevent injection
        if !Self::is_safe_ollama_command(command) {
            return Err("Invalid or unsafe Ollama command".to_string());
        }

        let full_command = format!("ollama {}", command);
        self.execute_command(ssh_connection_id, &full_command).await
    }

    /// Sync Ollama models from remote server
    pub async fn sync_ollama_models(
        &self,
        ssh_connection_id: &str,
    ) -> Result<Vec<OllamaModel>, String> {
        let output = self
            .execute_command(ssh_connection_id, "ollama list --format json 2>/dev/null || ollama list")
            .await?;

        // Try to parse as JSON first
        if let Ok(models) = serde_json::from_str::<Vec<OllamaListItem>>(&output) {
            return Ok(models.into_iter().map(|m| m.into()).collect());
        }

        // Fall back to parsing text output
        self.parse_ollama_list_text(&output)
    }

    /// Get GPU information from remote server
    pub async fn get_remote_gpu_info(
        &self,
        ssh_connection_id: &str,
    ) -> Result<Vec<GpuInfo>, String> {
        let output = self
            .execute_command(
                ssh_connection_id,
                r#"nvidia-smi --query-gpu=index,name,uuid,driver_version,memory.total,memory.used,memory.free,utilization.gpu,utilization.memory,temperature.gpu,power.draw,power.limit,fan.speed --format=csv,noheader,nounits 2>/dev/null"#,
            )
            .await?;

        if output.trim().is_empty() {
            return Err("No NVIDIA GPU detected on remote server".to_string());
        }

        let mut gpus = Vec::new();
        for line in output.lines() {
            if let Some(gpu) = self.parse_nvidia_smi_line(line) {
                gpus.push(gpu);
            }
        }

        if gpus.is_empty() {
            return Err("Failed to parse GPU information".to_string());
        }

        Ok(gpus)
    }

    /// Detect if NVIDIA GPU is available on remote server
    pub async fn detect_remote_gpu(&self, ssh_connection_id: &str) -> Result<bool, String> {
        let output = self
            .execute_command(
                ssh_connection_id,
                "nvidia-smi -L 2>/dev/null || echo 'NOT_FOUND'",
            )
            .await?;

        Ok(!output.contains("NOT_FOUND") && output.contains("GPU"))
    }

    /// Get GPU processes from remote server
    pub async fn get_remote_gpu_processes(
        &self,
        ssh_connection_id: &str,
    ) -> Result<Vec<crate::models::GpuProcess>, String> {
        let output = self
            .execute_command(
                ssh_connection_id,
                r#"nvidia-smi --query-compute-apps=gpu_uuid,pid,process_name,used_memory --format=csv,noheader,nounits 2>/dev/null"#,
            )
            .await?;

        let mut processes = Vec::new();
        for line in output.lines() {
            let line = line.trim();
            if line.is_empty() || line.contains("No running") {
                continue;
            }

            let parts: Vec<&str> = line.split(',').map(|s| s.trim()).collect();
            if parts.len() >= 4 {
                processes.push(crate::models::GpuProcess {
                    gpu_uuid: parts[0].to_string(),
                    pid: parts[1].parse().unwrap_or(0),
                    process_name: parts[2].to_string(),
                    used_memory: parts[3].parse().unwrap_or(0),
                });
            }
        }

        Ok(processes)
    }

    /// Execute command on remote server via SSH
    async fn execute_command(
        &self,
        ssh_connection_id: &str,
        command: &str,
    ) -> Result<String, String> {
        self.ssh_service
            .exec_command(ssh_connection_id, command)
            .await
            .map_err(|e| e.to_string())
    }

    /// Check if Ollama command is safe to execute
    fn is_safe_ollama_command(command: &str) -> bool {
        let safe_commands = [
            "list",
            "show",
            "pull",
            "rm",
            "run",
            "stop",
            "ps",
            "version",
        ];

        let parts: Vec<&str> = command.split_whitespace().collect();
        if parts.is_empty() {
            return false;
        }

        let base_command = parts[0];
        safe_commands.contains(&base_command)
    }

    /// Parse Ollama list text output
    fn parse_ollama_list_text(&self, output: &str) -> Result<Vec<OllamaModel>, String> {
        let mut models = Vec::new();

        for line in output.lines().skip(1) {
            // Skip header line
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() >= 4 {
                let name = parts[0].to_string();
                let size_str = parts.get(2).unwrap_or(&"0");
                let size = Self::parse_size_string(size_str);

                models.push(OllamaModel {
                    name,
                    size,
                    digest: parts.get(1).unwrap_or(&"").to_string(),
                    modified_at: parts.get(3..).map(|p| p.join(" ")).unwrap_or_default(),
                    details: None,
                });
            }
        }

        Ok(models)
    }

    /// Parse size string like "4.1 GB" to bytes
    fn parse_size_string(size_str: &str) -> u64 {
        let size_str = size_str.trim().to_uppercase();

        // Try to extract number and unit
        let mut num_str = String::new();
        let mut unit = String::new();

        for c in size_str.chars() {
            if c.is_ascii_digit() || c == '.' {
                num_str.push(c);
            } else if c.is_ascii_alphabetic() {
                unit.push(c);
            }
        }

        let num: f64 = num_str.parse().unwrap_or(0.0);

        let multiplier: u64 = match unit.as_str() {
            "B" => 1,
            "KB" | "K" => 1024,
            "MB" | "M" => 1024 * 1024,
            "GB" | "G" => 1024 * 1024 * 1024,
            "TB" | "T" => 1024 * 1024 * 1024 * 1024,
            _ => 1,
        };

        (num * multiplier as f64) as u64
    }

    /// Parse nvidia-smi CSV line to GpuInfo
    fn parse_nvidia_smi_line(&self, line: &str) -> Option<GpuInfo> {
        let parts: Vec<&str> = line.split(',').map(|s| s.trim()).collect();

        if parts.len() < 13 {
            return None;
        }

        Some(GpuInfo {
            index: parts[0].parse().ok()?,
            name: parts[1].to_string(),
            uuid: parts[2].to_string(),
            driver_version: parts[3].to_string(),
            cuda_version: None,
            architecture: None,
            compute_capability: None,
            memory_total: parts[4].parse().unwrap_or(0),
            memory_used: parts[5].parse().unwrap_or(0),
            memory_free: parts[6].parse().unwrap_or(0),
            utilization: parts[7].parse().unwrap_or(0.0),
            memory_utilization: parts[8].parse().unwrap_or(0.0),
            temperature: parts[9].parse().unwrap_or(0.0),
            power_draw: parts[10].parse().ok(),
            power_limit: parts[11].parse().ok(),
            fan_speed: parts[12].parse().ok(),
        })
    }
}

/// Ollama list JSON item
#[derive(Debug, Clone, Deserialize)]
struct OllamaListItem {
    name: String,
    #[serde(default)]
    size: u64,
    #[serde(default)]
    digest: String,
    #[serde(default)]
    modified_at: String,
    #[serde(default)]
    details: Option<OllamaListItemDetails>,
}

#[derive(Debug, Clone, Deserialize)]
struct OllamaListItemDetails {
    format: Option<String>,
    family: Option<String>,
    parameter_size: Option<String>,
    quantization_level: Option<String>,
}

impl From<OllamaListItem> for OllamaModel {
    fn from(item: OllamaListItem) -> Self {
        Self {
            name: item.name,
            size: item.size,
            digest: item.digest,
            modified_at: item.modified_at,
            details: item.details.map(|d| OllamaModelDetails {
                format: d.format,
                family: d.family,
                parameter_size: d.parameter_size,
                quantization_level: d.quantization_level,
            }),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_is_safe_ollama_command() {
        assert!(RemoteAiManager::is_safe_ollama_command("list"));
        assert!(RemoteAiManager::is_safe_ollama_command("pull llama2"));
        assert!(RemoteAiManager::is_safe_ollama_command("show llama2"));
        assert!(!RemoteAiManager::is_safe_ollama_command(""));
        assert!(!RemoteAiManager::is_safe_ollama_command("rm -rf /"));
    }

    #[test]
    fn test_parse_size_string() {
        assert_eq!(RemoteAiManager::parse_size_string("4.1 GB"), 4402341478);
        assert_eq!(RemoteAiManager::parse_size_string("512 MB"), 536870912);
        assert_eq!(RemoteAiManager::parse_size_string("1024 KB"), 1048576);
    }
}
