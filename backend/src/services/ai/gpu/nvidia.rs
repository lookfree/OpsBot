//! NVIDIA GPU Monitor
//!
//! This module provides functionality to monitor NVIDIA GPUs using nvidia-smi.

use tokio::process::Command;

use crate::models::{GpuInfo, GpuProcess};

/// NVIDIA GPU Monitor for local and remote monitoring
pub struct NvidiaGpuMonitor {
    /// SSH connection ID for remote monitoring (None for local)
    ssh_connection_id: Option<String>,
}

impl NvidiaGpuMonitor {
    /// Create a new local GPU monitor
    pub fn new_local() -> Self {
        Self {
            ssh_connection_id: None,
        }
    }

    /// Create a new remote GPU monitor
    pub fn new_remote(ssh_connection_id: String) -> Self {
        Self {
            ssh_connection_id: Some(ssh_connection_id),
        }
    }

    /// Detect if NVIDIA GPU is available
    pub async fn detect_gpu(&self) -> Result<bool, String> {
        let output = self.execute_nvidia_smi(&["-L"]).await;
        match output {
            Ok(out) => Ok(!out.trim().is_empty() && out.contains("GPU")),
            Err(_) => Ok(false),
        }
    }

    /// Get all GPU information
    pub async fn get_gpu_info(&self) -> Result<Vec<GpuInfo>, String> {
        let query_args = [
            "--query-gpu=index,name,uuid,driver_version,memory.total,memory.used,memory.free,utilization.gpu,utilization.memory,temperature.gpu,power.draw,power.limit,fan.speed",
            "--format=csv,noheader,nounits",
        ];

        let output = self.execute_nvidia_smi(&query_args).await?;
        self.parse_gpu_info_csv(&output)
    }

    /// Get GPU processes
    pub async fn get_gpu_processes(&self) -> Result<Vec<GpuProcess>, String> {
        let query_args = [
            "--query-compute-apps=gpu_uuid,pid,process_name,used_memory",
            "--format=csv,noheader,nounits",
        ];

        let output = self.execute_nvidia_smi(&query_args).await?;
        self.parse_gpu_processes_csv(&output)
    }

    /// Execute nvidia-smi command
    async fn execute_nvidia_smi(&self, args: &[&str]) -> Result<String, String> {
        if self.ssh_connection_id.is_some() {
            // Remote execution via SSH - TODO: integrate with SSH service
            return Err("Remote GPU monitoring not yet implemented".to_string());
        }

        // Local execution
        let nvidia_smi_path = Self::get_nvidia_smi_path();
        
        let output = Command::new(&nvidia_smi_path)
            .args(args)
            .output()
            .await
            .map_err(|e| format!("Failed to execute nvidia-smi: {}", e))?;

        if output.status.success() {
            String::from_utf8(output.stdout)
                .map_err(|e| format!("Failed to parse nvidia-smi output: {}", e))
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr);
            Err(format!("nvidia-smi error: {}", stderr))
        }
    }

    /// Get nvidia-smi executable path based on platform
    fn get_nvidia_smi_path() -> String {
        #[cfg(target_os = "windows")]
        {
            // Try common Windows paths
            let paths = [
                "C:\\Program Files\\NVIDIA Corporation\\NVSMI\\nvidia-smi.exe",
                "C:\\Windows\\System32\\nvidia-smi.exe",
                "nvidia-smi.exe",
            ];
            for path in paths {
                if std::path::Path::new(path).exists() {
                    return path.to_string();
                }
            }
            "nvidia-smi.exe".to_string()
        }

        #[cfg(not(target_os = "windows"))]
        {
            "nvidia-smi".to_string()
        }
    }

    /// Parse nvidia-smi CSV output for GPU info
    fn parse_gpu_info_csv(&self, output: &str) -> Result<Vec<GpuInfo>, String> {
        let mut gpus = Vec::new();

        for line in output.lines() {
            let line = line.trim();
            if line.is_empty() {
                continue;
            }

            let parts: Vec<&str> = line.split(',').map(|s| s.trim()).collect();
            if parts.len() < 13 {
                continue;
            }

            let gpu = GpuInfo {
                index: parts[0].parse().unwrap_or(0),
                name: parts[1].to_string(),
                uuid: parts[2].to_string(),
                driver_version: parts[3].to_string(),
                cuda_version: None, // nvidia-smi doesn't provide this directly
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
            };

            gpus.push(gpu);
        }

        Ok(gpus)
    }

    /// Parse nvidia-smi CSV output for GPU processes
    fn parse_gpu_processes_csv(&self, output: &str) -> Result<Vec<GpuProcess>, String> {
        let mut processes = Vec::new();

        for line in output.lines() {
            let line = line.trim();
            if line.is_empty() || line.contains("No running") {
                continue;
            }

            let parts: Vec<&str> = line.split(',').map(|s| s.trim()).collect();
            if parts.len() < 4 {
                continue;
            }

            let process = GpuProcess {
                gpu_uuid: parts[0].to_string(),
                pid: parts[1].parse().unwrap_or(0),
                process_name: parts[2].to_string(),
                used_memory: parts[3].parse().unwrap_or(0),
            };

            processes.push(process);
        }

        Ok(processes)
    }
}

impl Default for NvidiaGpuMonitor {
    fn default() -> Self {
        Self::new_local()
    }
}
