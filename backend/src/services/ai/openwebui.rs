//! OpenWebUI integration service
//!
//! This module provides integration with OpenWebUI, a self-hosted WebUI for LLMs.
//! It supports detection of local and Docker installations, and opening the UI.

use reqwest::Client;
use std::process::Command;
use std::time::Duration;

// Use the shared model types directly instead of redeclaring identical twins
// (which forced AiService::detect_openwebui to hand-map field-for-field).
use crate::models::{OpenWebUISource, OpenWebUIStatus};

/// Common ports for OpenWebUI
const COMMON_PORTS: [u16; 4] = [3000, 8080, 8000, 5000];

/// OpenWebUI service for detecting and managing OpenWebUI instances
pub struct OpenWebUIService {
    client: Client,
    custom_url: Option<String>,
}

impl OpenWebUIService {
    /// Create a new OpenWebUI service
    pub fn new(custom_url: Option<String>) -> Self {
        let client = Client::builder()
            .timeout(Duration::from_secs(5))
            .build()
            .unwrap_or_default();

        Self { client, custom_url }
    }

    /// Detect OpenWebUI from any source (custom URL, local, or Docker)
    pub async fn detect(&self) -> Result<OpenWebUIStatus, String> {
        // First, try custom URL if provided
        if let Some(url) = &self.custom_url {
            if let Ok(status) = self.check_url(url).await {
                if status.available {
                    return Ok(status);
                }
            }
        }

        // Try to detect local installation
        if let Ok(status) = self.detect_local().await {
            if status.available {
                return Ok(status);
            }
        }

        // Try to detect Docker installation
        if let Ok(status) = self.detect_docker().await {
            if status.available {
                return Ok(status);
            }
        }

        // Not found
        Ok(OpenWebUIStatus {
            available: false,
            url: None,
            version: None,
            source: OpenWebUISource::NotFound,
        })
    }

    /// Detect local OpenWebUI installation by checking common ports
    pub async fn detect_local(&self) -> Result<OpenWebUIStatus, String> {
        for port in COMMON_PORTS {
            let url = format!("http://localhost:{}", port);
            if let Ok(status) = self.check_url(&url).await {
                if status.available {
                    return Ok(OpenWebUIStatus {
                        source: OpenWebUISource::Local,
                        ..status
                    });
                }
            }
        }

        Ok(OpenWebUIStatus {
            available: false,
            url: None,
            version: None,
            source: OpenWebUISource::NotFound,
        })
    }

    /// Detect OpenWebUI running in Docker
    pub async fn detect_docker(&self) -> Result<OpenWebUIStatus, String> {
        // Check if Docker is available
        let docker_check = Command::new("docker")
            .args(["ps", "--format", "{{.Names}}\t{{.Ports}}"])
            .output();

        let output = match docker_check {
            Ok(output) if output.status.success() => output,
            _ => {
                return Ok(OpenWebUIStatus {
                    available: false,
                    url: None,
                    version: None,
                    source: OpenWebUISource::NotFound,
                });
            }
        };

        let stdout = String::from_utf8_lossy(&output.stdout);

        // Look for OpenWebUI container
        for line in stdout.lines() {
            let lower_line = line.to_lowercase();
            if lower_line.contains("open-webui")
                || lower_line.contains("openwebui")
                || lower_line.contains("ollama-webui")
            {
                // Try to extract port from the line
                if let Some(port) = self.extract_port_from_docker_line(line) {
                    let url = format!("http://localhost:{}", port);
                    if let Ok(status) = self.check_url(&url).await {
                        if status.available {
                            return Ok(OpenWebUIStatus {
                                source: OpenWebUISource::Docker,
                                ..status
                            });
                        }
                    }
                }
            }
        }

        // Also try common Docker container names
        let container_names = ["open-webui", "openwebui", "ollama-webui"];
        for name in container_names {
            let port_output = Command::new("docker")
                .args(["port", name, "8080"])
                .output();

            if let Ok(output) = port_output {
                if output.status.success() {
                    let port_str = String::from_utf8_lossy(&output.stdout);
                    if let Some(port) = self.parse_docker_port(&port_str) {
                        let url = format!("http://localhost:{}", port);
                        if let Ok(status) = self.check_url(&url).await {
                            if status.available {
                                return Ok(OpenWebUIStatus {
                                    source: OpenWebUISource::Docker,
                                    ..status
                                });
                            }
                        }
                    }
                }
            }
        }

        Ok(OpenWebUIStatus {
            available: false,
            url: None,
            version: None,
            source: OpenWebUISource::NotFound,
        })
    }

    /// Check if a URL is running OpenWebUI
    async fn check_url(&self, url: &str) -> Result<OpenWebUIStatus, String> {
        // Try to fetch the main page or API endpoint
        let api_url = format!("{}/api/version", url.trim_end_matches('/'));

        match self.client.get(&api_url).send().await {
            Ok(response) if response.status().is_success() => {
                // OpenWebUI's /api/version returns {"version":"x.y.z"}. Require
                // that exact shape — otherwise a SPA / dev server that answers
                // 200 (its index.html) for any path is misdetected as OpenWebUI.
                let version = response
                    .json::<serde_json::Value>()
                    .await
                    .ok()
                    .and_then(|v| v.get("version").and_then(|v| v.as_str()).map(String::from));

                match version {
                    Some(version) => Ok(OpenWebUIStatus {
                        available: true,
                        url: Some(url.to_string()),
                        version: Some(version),
                        source: OpenWebUISource::Local,
                    }),
                    None => Ok(OpenWebUIStatus {
                        available: false,
                        url: None,
                        version: None,
                        source: OpenWebUISource::NotFound,
                    }),
                }
            }
            Ok(_) => {
                // Non-2xx at /api/version: only trust an explicit OpenWebUI
                // Server header, NOT a generic 200 at the root (which Grafana,
                // a React dev server, or any web app returns).
                match self.client.get(url).send().await {
                    Ok(response) => {
                        let is_openwebui = response
                            .headers()
                            .get("server")
                            .and_then(|v| v.to_str().ok())
                            .map(|s| s.to_lowercase().contains("openwebui"))
                            .unwrap_or(false);

                        if is_openwebui {
                            Ok(OpenWebUIStatus {
                                available: true,
                                url: Some(url.to_string()),
                                version: None,
                                source: OpenWebUISource::Local,
                            })
                        } else {
                            Ok(OpenWebUIStatus {
                                available: false,
                                url: None,
                                version: None,
                                source: OpenWebUISource::NotFound,
                            })
                        }
                    }
                    Err(_) => Ok(OpenWebUIStatus {
                        available: false,
                        url: None,
                        version: None,
                        source: OpenWebUISource::NotFound,
                    }),
                }
            }
            Err(_) => Ok(OpenWebUIStatus {
                available: false,
                url: None,
                version: None,
                source: OpenWebUISource::NotFound,
            }),
        }
    }

    /// Extract port from Docker ps output line
    fn extract_port_from_docker_line(&self, line: &str) -> Option<u16> {
        // Format: "container_name    0.0.0.0:3000->8080/tcp"
        // We want to extract the host port (3000 in this case)
        let parts: Vec<&str> = line.split('\t').collect();
        if parts.len() >= 2 {
            let ports = parts[1];
            // Look for pattern like "0.0.0.0:PORT->" or ":::PORT->"
            for segment in ports.split(',') {
                let segment = segment.trim();
                if let Some(arrow_pos) = segment.find("->") {
                    let host_part = &segment[..arrow_pos];
                    if let Some(colon_pos) = host_part.rfind(':') {
                        if let Ok(port) = host_part[colon_pos + 1..].parse::<u16>() {
                            return Some(port);
                        }
                    }
                }
            }
        }
        None
    }

    /// Parse Docker port output (e.g., "0.0.0.0:3000")
    fn parse_docker_port(&self, port_str: &str) -> Option<u16> {
        let port_str = port_str.trim();
        if let Some(colon_pos) = port_str.rfind(':') {
            port_str[colon_pos + 1..].parse::<u16>().ok()
        } else {
            None
        }
    }

    /// Open OpenWebUI in the default browser
    pub fn open_in_browser(&self, url: &str) -> Result<(), String> {
        #[cfg(target_os = "macos")]
        {
            Command::new("open")
                .arg(url)
                .spawn()
                .map_err(|e| format!("Failed to open browser: {}", e))?;
        }

        #[cfg(target_os = "windows")]
        {
            // Use explorer rather than `cmd /C start`: the latter runs the URL
            // through cmd.exe, which treats '&' as a command separator and
            // truncates any URL containing query parameters (e.g. ?a=1&b=2).
            // explorer receives the URL as a single argument and opens it in the
            // default browser intact.
            Command::new("explorer")
                .arg(url)
                .spawn()
                .map_err(|e| format!("Failed to open browser: {}", e))?;
        }

        #[cfg(target_os = "linux")]
        {
            Command::new("xdg-open")
                .arg(url)
                .spawn()
                .map_err(|e| format!("Failed to open browser: {}", e))?;
        }

        Ok(())
    }

    /// Get the status of OpenWebUI
    pub async fn get_status(&self) -> Result<OpenWebUIStatus, String> {
        self.detect().await
    }
}

impl Default for OpenWebUIService {
    fn default() -> Self {
        Self::new(None)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_port_from_docker_line() {
        let service = OpenWebUIService::new(None);

        // Test standard format
        let line = "open-webui\t0.0.0.0:3000->8080/tcp";
        assert_eq!(service.extract_port_from_docker_line(line), Some(3000));

        // Test IPv6 format
        let line = "open-webui\t:::3000->8080/tcp";
        assert_eq!(service.extract_port_from_docker_line(line), Some(3000));

        // Test no port mapping
        let line = "open-webui\t";
        assert_eq!(service.extract_port_from_docker_line(line), None);
    }

    #[test]
    fn test_parse_docker_port() {
        let service = OpenWebUIService::new(None);

        assert_eq!(service.parse_docker_port("0.0.0.0:3000"), Some(3000));
        assert_eq!(service.parse_docker_port(":::8080"), Some(8080));
        assert_eq!(service.parse_docker_port("invalid"), None);
    }
}
