//! Remote AI management service
//!
//! This module provides AI service management on remote servers via SSH,
//! including environment detection, Ollama model synchronization, and GPU monitoring.

use std::sync::Arc;

use crate::models::{GpuInfo, OllamaModel, RemoteAiEnvironment};
use crate::services::SshService;

/// Single-quote a token for safe interpolation into a remote shell command.
/// Wraps in single quotes and escapes any embedded single quote with the
/// `'"'"'` idiom, so shell metacharacters inside the token are inert.
fn shq(s: &str) -> String {
    format!("'{}'", s.replace('\'', "'\"'\"'"))
}

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

        // Defense in depth: even though is_safe_ollama_command already
        // allow-lists the characters, single-quote every token so an argument
        // can never be interpreted by the remote login shell (execute_command
        // runs the string via `sh -c`).
        let quoted = command
            .split_whitespace()
            .map(shq)
            .collect::<Vec<_>>()
            .join(" ");
        let full_command = format!("ollama {}", quoted);
        self.execute_command(ssh_connection_id, &full_command).await
    }

    /// Sync Ollama models from remote server
    pub async fn sync_ollama_models(
        &self,
        ssh_connection_id: &str,
    ) -> Result<Vec<OllamaModel>, String> {
        // `ollama list` prints a text table; it has no --format json flag, so
        // parse the table directly.
        let output = self
            .execute_command(ssh_connection_id, "ollama list")
            .await?;

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
        log::info!(
            "[Remote GPU] Detecting GPU on connection: {}",
            ssh_connection_id
        );

        let output = self
            .execute_command(
                ssh_connection_id,
                "nvidia-smi -L 2>/dev/null || echo 'NOT_FOUND'",
            )
            .await?;

        log::info!("[Remote GPU] nvidia-smi -L output: {:?}", output);

        let detected = !output.contains("NOT_FOUND") && output.contains("GPU");
        log::info!("[Remote GPU] GPU detected: {}", detected);

        Ok(detected)
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
        log::info!(
            "[Remote AI] Executing command on connection {}: {}",
            ssh_connection_id,
            command
        );

        // Find the active session_id from connection_id
        let session_id = self
            .ssh_service
            .find_session_by_connection_id(ssh_connection_id)
            .await
            .ok_or_else(|| {
                log::error!(
                    "[Remote AI] No active SSH session found for connection: {}",
                    ssh_connection_id
                );
                format!(
                    "No active SSH session found. Please open a terminal to this connection first."
                )
            })?;

        log::info!("[Remote AI] Found session_id: {}", session_id);

        let result = self
            .ssh_service
            .exec_command(&session_id, command)
            .await
            .map_err(|e| {
                log::error!("[Remote AI] Command execution failed: {}", e);
                e.to_string()
            })?;

        log::debug!("[Remote AI] Command output: {:?}", result);
        Ok(result)
    }

    /// Check if an Ollama command is safe to send to the remote login shell.
    ///
    /// Two gates: the first token must be a known read/model subcommand, and
    /// EVERY character must be in an allow-list covering what a legitimate
    /// `ollama <sub> <model-ref>` needs (model refs like `library/qwen2.5:7b`).
    /// Anything a shell could interpret (`;`, `|`, `&`, `$`, backticks, quotes,
    /// parentheses, redirects, newlines) is absent from the allow-list and thus
    /// rejected — closing the injection where only the first token used to be
    /// checked while the rest was interpolated raw.
    fn is_safe_ollama_command(command: &str) -> bool {
        const SAFE_SUBCOMMANDS: [&str; 8] =
            ["list", "show", "pull", "rm", "run", "stop", "ps", "version"];

        let base = match command.split_whitespace().next() {
            Some(b) => b,
            None => return false,
        };
        if !SAFE_SUBCOMMANDS.contains(&base) {
            return false;
        }

        command
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c.is_ascii_whitespace() || ":/._-@+".contains(c))
    }

    /// Parse Ollama list text output
    fn parse_ollama_list_text(&self, output: &str) -> Result<Vec<OllamaModel>, String> {
        let mut models = Vec::new();

        for line in output.lines().skip(1) {
            // ollama list columns: NAME  ID  SIZE  MODIFIED. SIZE prints as two
            // whitespace-separated tokens ("3.8 GB") and MODIFIED as several
            // ("2 days ago"), so join the size number with its unit and take the
            // rest as modified. (The old code read only parts[2]="3.8", dropping
            // the unit → ~3 bytes, and left "GB" prefixing modified_at.)
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() >= 4 {
                let name = parts[0].to_string();
                let size = Self::parse_size_string(&format!("{} {}", parts[2], parts[3]));

                models.push(OllamaModel {
                    name,
                    size,
                    digest: parts.get(1).unwrap_or(&"").to_string(),
                    modified_at: parts.get(4..).map(|p| p.join(" ")).unwrap_or_default(),
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_is_safe_ollama_command() {
        // Legitimate subcommands and model references pass.
        assert!(RemoteAiManager::is_safe_ollama_command("list"));
        assert!(RemoteAiManager::is_safe_ollama_command("pull llama2"));
        assert!(RemoteAiManager::is_safe_ollama_command("show library/qwen2.5:7b"));
        // Empty / non-whitelisted subcommand.
        assert!(!RemoteAiManager::is_safe_ollama_command(""));
        assert!(!RemoteAiManager::is_safe_ollama_command("serve"));
        // Shell-injection payloads: whitelisted first token, metacharacters
        // after — these are exactly what the first-token-only check let through.
        assert!(!RemoteAiManager::is_safe_ollama_command("list; rm -rf /"));
        assert!(!RemoteAiManager::is_safe_ollama_command("pull $(reboot)"));
        assert!(!RemoteAiManager::is_safe_ollama_command("run x | sh"));
        assert!(!RemoteAiManager::is_safe_ollama_command("pull a && curl evil"));
    }

    #[test]
    fn test_parse_size_string() {
        assert_eq!(RemoteAiManager::parse_size_string("4.1 GB"), 4402341478);
        assert_eq!(RemoteAiManager::parse_size_string("512 MB"), 536870912);
        assert_eq!(RemoteAiManager::parse_size_string("1024 KB"), 1048576);
    }
}
