//! Ollama Service Control
//!
//! This module provides functionality to control the Ollama service lifecycle,
//! including starting, stopping, and restarting the service.

use std::process::Command;

/// Result of a service operation
#[derive(Debug)]
pub struct ServiceOperationResult {
    pub success: bool,
    pub message: String,
}

/// Ollama service controller
pub struct OllamaServiceController;

impl OllamaServiceController {
    /// Create a new service controller
    pub fn new() -> Self {
        Self
    }

    /// Start the Ollama service
    ///
    /// Attempts to start Ollama using system-appropriate methods:
    /// - macOS: `brew services start ollama` or direct binary
    /// - Linux: `systemctl start ollama` or direct binary
    /// - Windows: Direct binary execution
    pub async fn start_service() -> Result<ServiceOperationResult, String> {
        #[cfg(target_os = "macos")]
        {
            // Try brew services first
            let output = Command::new("brew")
                .args(["services", "start", "ollama"])
                .output();

            if let Ok(output) = output {
                if output.status.success() {
                    return Ok(ServiceOperationResult {
                        success: true,
                        message: "Ollama service started via Homebrew".to_string(),
                    });
                }
            }

            // Fallback: start ollama directly in background
            match Command::new("ollama").args(["serve"]).spawn() {
                Ok(mut child) => {
                    // spawn() only means the process launched; it can exit
                    // immediately (e.g. port 11434 already in use). Wait briefly
                    // and verify it is still alive before claiming success.
                    tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
                    match child.try_wait() {
                        Ok(Some(status)) => {
                            let _ = child.wait();
                            Err(format!("Ollama exited immediately (status {})", status))
                        }
                        _ => Ok(ServiceOperationResult {
                            success: true,
                            message: "Ollama service started directly".to_string(),
                        }),
                    }
                }
                Err(e) => Err(format!("Failed to start Ollama: {}", e)),
            }
        }

        #[cfg(target_os = "linux")]
        {
            // Try systemctl first
            let output = Command::new("systemctl")
                .args(["start", "ollama"])
                .output();

            if let Ok(output) = output {
                if output.status.success() {
                    return Ok(ServiceOperationResult {
                        success: true,
                        message: "Ollama service started via systemctl".to_string(),
                    });
                }
            }

            // Fallback: start ollama directly
            match Command::new("ollama").args(["serve"]).spawn() {
                Ok(mut child) => {
                    // spawn() only means the process launched; it can exit
                    // immediately (e.g. port 11434 already in use). Wait briefly
                    // and verify it is still alive before claiming success.
                    tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
                    match child.try_wait() {
                        Ok(Some(status)) => {
                            let _ = child.wait();
                            Err(format!("Ollama exited immediately (status {})", status))
                        }
                        _ => Ok(ServiceOperationResult {
                            success: true,
                            message: "Ollama service started directly".to_string(),
                        }),
                    }
                }
                Err(e) => Err(format!("Failed to start Ollama: {}", e)),
            }
        }

        #[cfg(target_os = "windows")]
        {
            // On Windows, try to start ollama directly
            match Command::new("ollama").args(["serve"]).spawn() {
                Ok(mut child) => {
                    // Verify it stayed alive rather than exiting instantly.
                    tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
                    match child.try_wait() {
                        Ok(Some(status)) => {
                            let _ = child.wait();
                            Err(format!("Ollama exited immediately (status {})", status))
                        }
                        _ => Ok(ServiceOperationResult {
                            success: true,
                            message: "Ollama service started".to_string(),
                        }),
                    }
                }
                Err(e) => Err(format!("Failed to start Ollama: {}", e)),
            }
        }

        #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
        {
            Err("Unsupported operating system".to_string())
        }
    }

    /// Stop the Ollama service
    pub async fn stop_service() -> Result<ServiceOperationResult, String> {
        #[cfg(target_os = "macos")]
        {
            // Try brew services first
            let output = Command::new("brew")
                .args(["services", "stop", "ollama"])
                .output();

            if let Ok(output) = output {
                if output.status.success() {
                    return Ok(ServiceOperationResult {
                        success: true,
                        message: "Ollama service stopped via Homebrew".to_string(),
                    });
                }
            }

            // Fallback: kill ollama process
            let output = Command::new("pkill")
                .args(["-x", "ollama"])
                .output();

            match output {
                Ok(output) if output.status.success() => Ok(ServiceOperationResult {
                    success: true,
                    message: "Ollama process terminated".to_string(),
                }),
                // pkill exits 1 when nothing matched: report honestly instead
                // of claiming a process was terminated.
                Ok(_) => Ok(ServiceOperationResult {
                    success: false,
                    message: "No running Ollama process found".to_string(),
                }),
                Err(e) => Err(format!("Failed to stop Ollama: {}", e)),
            }
        }

        #[cfg(target_os = "linux")]
        {
            // Try systemctl first
            let output = Command::new("systemctl")
                .args(["stop", "ollama"])
                .output();

            if let Ok(output) = output {
                if output.status.success() {
                    return Ok(ServiceOperationResult {
                        success: true,
                        message: "Ollama service stopped via systemctl".to_string(),
                    });
                }
            }

            // Fallback: kill ollama process
            let output = Command::new("pkill")
                .args(["-x", "ollama"])
                .output();

            match output {
                Ok(output) if output.status.success() => Ok(ServiceOperationResult {
                    success: true,
                    message: "Ollama process terminated".to_string(),
                }),
                // pkill exits 1 when nothing matched: report honestly instead
                // of claiming a process was terminated.
                Ok(_) => Ok(ServiceOperationResult {
                    success: false,
                    message: "No running Ollama process found".to_string(),
                }),
                Err(e) => Err(format!("Failed to stop Ollama: {}", e)),
            }
        }

        #[cfg(target_os = "windows")]
        {
            // On Windows, use taskkill
            let output = Command::new("taskkill")
                .args(["/F", "/IM", "ollama.exe"])
                .output();

            match output {
                Ok(output) if output.status.success() => Ok(ServiceOperationResult {
                    success: true,
                    message: "Ollama service stopped".to_string(),
                }),
                Ok(_) => Err("Failed to stop Ollama: process not found".to_string()),
                Err(e) => Err(format!("Failed to stop Ollama: {}", e)),
            }
        }

        #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
        {
            Err("Unsupported operating system".to_string())
        }
    }

    /// Restart the Ollama service
    pub async fn restart_service() -> Result<ServiceOperationResult, String> {
        #[cfg(target_os = "macos")]
        {
            // Try brew services first
            let output = Command::new("brew")
                .args(["services", "restart", "ollama"])
                .output();

            if let Ok(output) = output {
                if output.status.success() {
                    return Ok(ServiceOperationResult {
                        success: true,
                        message: "Ollama service restarted via Homebrew".to_string(),
                    });
                }
            }

            // Fallback: stop then start
            let _ = Self::stop_service().await;
            tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;
            Self::start_service().await
        }

        #[cfg(target_os = "linux")]
        {
            // Try systemctl first
            let output = Command::new("systemctl")
                .args(["restart", "ollama"])
                .output();

            if let Ok(output) = output {
                if output.status.success() {
                    return Ok(ServiceOperationResult {
                        success: true,
                        message: "Ollama service restarted via systemctl".to_string(),
                    });
                }
            }

            // Fallback: stop then start
            let _ = Self::stop_service().await;
            tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;
            Self::start_service().await
        }

        #[cfg(target_os = "windows")]
        {
            // Stop then start
            let _ = Self::stop_service().await;
            tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;
            Self::start_service().await
        }

        #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
        {
            Err("Unsupported operating system".to_string())
        }
    }

    /// Check if Ollama service is running
    pub async fn is_running() -> bool {
        #[cfg(target_os = "macos")]
        {
            // Check if ollama process is running
            let output = Command::new("pgrep")
                .args(["-x", "ollama"])
                .output();

            matches!(output, Ok(output) if output.status.success())
        }

        #[cfg(target_os = "linux")]
        {
            let output = Command::new("pgrep")
                .args(["-x", "ollama"])
                .output();

            matches!(output, Ok(output) if output.status.success())
        }

        #[cfg(target_os = "windows")]
        {
            let output = Command::new("tasklist")
                .args(["/FI", "IMAGENAME eq ollama.exe"])
                .output();

            if let Ok(output) = output {
                let stdout = String::from_utf8_lossy(&output.stdout);
                return stdout.contains("ollama.exe");
            }
            false
        }

        #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
        {
            false
        }
    }
}

impl Default for OllamaServiceController {
    fn default() -> Self {
        Self::new()
    }
}
