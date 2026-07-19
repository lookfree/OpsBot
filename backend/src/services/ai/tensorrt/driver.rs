//! TensorRT-LLM driver implementation
//!
//! Provides management of TensorRT-LLM models and inference services.

use reqwest::Client;
use std::time::Duration;

use crate::models::{
    AiProxyConfig, AiProxyType, TensorRTModel, TensorRTModelConfig, TensorRTStatus,
};

/// TensorRT-LLM driver for model management
pub struct TensorRTDriver {
    host: String,
    port: u16,
    client: Client,
    ssh_connection_id: Option<String>,
}

impl TensorRTDriver {
    /// Default TensorRT-LLM API port
    const DEFAULT_PORT: u16 = 8000;

    /// Create a new TensorRT driver
    pub fn new(
        host: String,
        port: Option<u16>,
        ssh_connection_id: Option<String>,
        proxy: &Option<AiProxyConfig>,
    ) -> Result<Self, String> {
        let client = Self::build_http_client(proxy)?;

        Ok(Self {
            host,
            port: port.unwrap_or(Self::DEFAULT_PORT),
            client,
            ssh_connection_id,
        })
    }

    /// Build HTTP client with optional proxy
    fn build_http_client(proxy_config: &Option<AiProxyConfig>) -> Result<Client, String> {
        let mut builder = Client::builder().timeout(Duration::from_secs(30));

        if let Some(proxy) = proxy_config {
            let proxy_url = match proxy.proxy_type {
                AiProxyType::Http | AiProxyType::Https => {
                    format!("http://{}:{}", proxy.host, proxy.port)
                }
                AiProxyType::Socks5 => {
                    format!("socks5://{}:{}", proxy.host, proxy.port)
                }
            };

            let mut proxy_builder =
                reqwest::Proxy::all(&proxy_url).map_err(|e| format!("Invalid proxy URL: {}", e))?;

            if let (Some(username), Some(password)) = (&proxy.username, &proxy.password) {
                proxy_builder = proxy_builder.basic_auth(username, password);
            }

            builder = builder.proxy(proxy_builder);
        }

        builder
            .build()
            .map_err(|e| format!("Failed to build HTTP client: {}", e))
    }

    /// Get the base URL for the TensorRT-LLM API
    pub(crate) fn base_url(&self) -> String {
        format!("http://{}:{}", self.host, self.port)
    }

    /// Detect if TensorRT-LLM is installed
    pub async fn detect_installation(&self) -> Result<bool, String> {
        // Try to connect to the TensorRT-LLM server
        let url = format!("{}/health", self.base_url());

        match self.client.get(&url).send().await {
            Ok(response) => Ok(response.status().is_success()),
            Err(_) => Ok(false),
        }
    }

    /// Get TensorRT-LLM service status
    pub async fn get_status(&self) -> Result<TensorRTStatus, String> {
        let url = format!("{}/v1/models", self.base_url());

        let response = match self.client.get(&url).send().await {
            Ok(resp) => resp,
            Err(_) => {
                return Ok(TensorRTStatus {
                    installed: false,
                    version: None,
                    cuda_version: None,
                    running_models: 0,
                });
            }
        };

        if !response.status().is_success() {
            return Ok(TensorRTStatus {
                installed: false,
                version: None,
                cuda_version: None,
                running_models: 0,
            });
        }

        // Parse model list to get running models count
        let models: Vec<serde_json::Value> = response
            .json()
            .await
            .unwrap_or_default();

        Ok(TensorRTStatus {
            installed: true,
            version: Some("TensorRT-LLM".to_string()),
            cuda_version: None,
            running_models: models.len(),
        })
    }

    /// List deployed models
    pub async fn list_models(&self) -> Result<Vec<TensorRTModel>, String> {
        let url = format!("{}/v1/models", self.base_url());

        let response = self
            .client
            .get(&url)
            .send()
            .await
            .map_err(|e| format!("Failed to list models: {}", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response
                .text()
                .await
                .unwrap_or_else(|_| "Unknown error".to_string());
            return Err(format!("API error ({}): {}", status, error_text));
        }

        // Parse the response - TensorRT-LLM uses OpenAI-compatible API
        #[derive(serde::Deserialize)]
        struct ModelsResponse {
            data: Vec<ModelData>,
        }

        #[derive(serde::Deserialize)]
        struct ModelData {
            id: String,
        }

        let models_response: ModelsResponse = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse models response: {}", e))?;

        let models = models_response
            .data
            .into_iter()
            .map(|m| TensorRTModel {
                id: m.id.clone(),
                name: m.id,
                version: "1.0".to_string(),
                engine_path: String::new(),
                port: self.port,
                status: crate::models::ModelStatus::Running,
                gpu_memory_usage: None,
                created_at: chrono::Utc::now().to_rfc3339(),
            })
            .collect();

        Ok(models)
    }

    /// Deploy a new model
    pub async fn deploy_model(&self, _config: TensorRTModelConfig) -> Result<String, String> {
        // TensorRT-LLM model deployment is typically done via command line
        // This would require SSH access for remote deployment
        Err("Model deployment requires SSH access. Please use the remote management feature.".to_string())
    }

    /// Start a model service
    pub async fn start_model(&self, model_id: &str) -> Result<(), String> {
        // TensorRT-LLM models are started via the inference server
        // Check if the model is already running
        let models = self.list_models().await?;
        if models.iter().any(|m| m.id == model_id) {
            Ok(())
        } else {
            Err(format!("Model '{}' is not deployed", model_id))
        }
    }

    /// Stop a model service
    pub async fn stop_model(&self, _model_id: &str) -> Result<(), String> {
        // TensorRT-LLM models are managed by the inference server
        Err("Stopping individual models requires server restart or SSH access.".to_string())
    }

    /// Get model logs
    pub async fn get_model_logs(&self, _model_id: &str, _lines: usize) -> Result<String, String> {
        // Logs are typically accessed via file system or SSH
        Err("Log access requires SSH connection to the server.".to_string())
    }

    /// Get SSH connection ID if configured for remote management
    pub fn ssh_connection_id(&self) -> Option<&str> {
        self.ssh_connection_id.as_deref()
    }
}
