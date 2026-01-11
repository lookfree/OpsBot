//! Qwen (通义千问) API client
//!
//! Supports Alibaba Cloud Qwen API (DashScope)

use reqwest::Client;
use serde::Deserialize;

use async_trait::async_trait;
use crate::models::{
    AiProxyConfig, AiProxyType, CloudApiConfig, CloudApiModel, CloudApiProvider, CloudApiTestResult,
};

use super::CloudApiClient;

/// Qwen API client (DashScope)
pub struct QwenClient {
    client: Client,
    api_key: String,
    base_url: String,
}

impl QwenClient {
    /// Default Qwen/DashScope API base URL
    const DEFAULT_BASE_URL: &'static str = "https://dashscope.aliyuncs.com/api/v1";

    /// Create a new Qwen client
    pub fn new(config: &CloudApiConfig) -> Result<Self, String> {
        let api_key = config
            .api_key
            .clone()
            .ok_or("API key is required for Qwen")?;

        let base_url = config
            .base_url
            .clone()
            .unwrap_or_else(|| Self::DEFAULT_BASE_URL.to_string());

        let client = Self::build_http_client(&config.proxy)?;

        Ok(Self {
            client,
            api_key,
            base_url,
        })
    }

    /// Build HTTP client with optional proxy
    fn build_http_client(proxy_config: &Option<AiProxyConfig>) -> Result<Client, String> {
        let mut builder = Client::builder()
            .timeout(std::time::Duration::from_secs(30));

        if let Some(proxy) = proxy_config {
            let proxy_url = match proxy.proxy_type {
                AiProxyType::Http | AiProxyType::Https => {
                    format!("http://{}:{}", proxy.host, proxy.port)
                }
                AiProxyType::Socks5 => {
                    format!("socks5://{}:{}", proxy.host, proxy.port)
                }
            };

            let mut proxy_builder = reqwest::Proxy::all(&proxy_url)
                .map_err(|e| format!("Invalid proxy URL: {}", e))?;

            if let (Some(username), Some(password)) = (&proxy.username, &proxy.password) {
                proxy_builder = proxy_builder.basic_auth(username, password);
            }

            builder = builder.proxy(proxy_builder);
        }

        builder
            .build()
            .map_err(|e| format!("Failed to build HTTP client: {}", e))
    }

    /// Test connection by making a simple API call
    async fn test_api(&self) -> Result<(), String> {
        // Test with a minimal chat request
        let url = format!(
            "{}/services/aigc/text-generation/generation",
            self.base_url.trim_end_matches('/')
        );

        let request_body = serde_json::json!({
            "model": "qwen-turbo",
            "input": {
                "messages": [
                    {"role": "user", "content": "Hi"}
                ]
            },
            "parameters": {
                "max_tokens": 1
            }
        });

        let response = self
            .client
            .post(&url)
            .header("Authorization", format!("Bearer {}", self.api_key))
            .header("Content-Type", "application/json")
            .json(&request_body)
            .send()
            .await
            .map_err(|e| format!("Request failed: {}", e))?;

        let status = response.status();
        if !status.is_success() {
            let error_text = response
                .text()
                .await
                .unwrap_or_else(|_| "Unknown error".to_string());

            // Parse error response
            if let Ok(error) = serde_json::from_str::<QwenErrorResponse>(&error_text) {
                return Err(format!("{}: {}", error.code, error.message));
            }
            return Err(format!("API error ({}): {}", status, error_text));
        }

        Ok(())
    }
}

#[async_trait]
impl CloudApiClient for QwenClient {
    fn provider(&self) -> CloudApiProvider {
        CloudApiProvider::Qwen
    }

    async fn test_connection(&self) -> Result<CloudApiTestResult, String> {
        let start = std::time::Instant::now();

        match self.test_api().await {
            Ok(()) => Ok(CloudApiTestResult {
                success: true,
                message: "Connected to Qwen API successfully.".to_string(),
                latency_ms: Some(start.elapsed().as_millis() as u64),
            }),
            Err(e) => Ok(CloudApiTestResult {
                success: false,
                message: e,
                latency_ms: Some(start.elapsed().as_millis() as u64),
            }),
        }
    }

    async fn list_models(&self) -> Result<Vec<CloudApiModel>, String> {
        // Qwen doesn't have a models list API, return known models
        let models = vec![
            CloudApiModel {
                id: "qwen-max".to_string(),
                name: "Qwen Max (通义千问-Max)".to_string(),
                provider: CloudApiProvider::Qwen,
                description: Some("Most powerful Qwen model with best performance".to_string()),
                context_length: Some(30000),
                pricing: Some("¥0.04 / ¥0.12 per 1K tokens".to_string()),
            },
            CloudApiModel {
                id: "qwen-plus".to_string(),
                name: "Qwen Plus (通义千问-Plus)".to_string(),
                provider: CloudApiProvider::Qwen,
                description: Some("Balanced model for most tasks".to_string()),
                context_length: Some(30000),
                pricing: Some("¥0.004 / ¥0.012 per 1K tokens".to_string()),
            },
            CloudApiModel {
                id: "qwen-turbo".to_string(),
                name: "Qwen Turbo (通义千问-Turbo)".to_string(),
                provider: CloudApiProvider::Qwen,
                description: Some("Fast and cost-effective model".to_string()),
                context_length: Some(8000),
                pricing: Some("¥0.002 / ¥0.006 per 1K tokens".to_string()),
            },
            CloudApiModel {
                id: "qwen-long".to_string(),
                name: "Qwen Long (通义千问-Long)".to_string(),
                provider: CloudApiProvider::Qwen,
                description: Some("Long context model up to 10M tokens".to_string()),
                context_length: Some(10000000),
                pricing: Some("¥0.0005 / ¥0.002 per 1K tokens".to_string()),
            },
            CloudApiModel {
                id: "qwen-vl-max".to_string(),
                name: "Qwen VL Max (通义千问-VL-Max)".to_string(),
                provider: CloudApiProvider::Qwen,
                description: Some("Vision-language model with image understanding".to_string()),
                context_length: Some(30000),
                pricing: Some("¥0.02 per image".to_string()),
            },
            CloudApiModel {
                id: "qwen-coder-turbo".to_string(),
                name: "Qwen Coder Turbo (通义千问-Coder)".to_string(),
                provider: CloudApiProvider::Qwen,
                description: Some("Code generation and analysis model".to_string()),
                context_length: Some(128000),
                pricing: Some("¥0.002 / ¥0.006 per 1K tokens".to_string()),
            },
        ];

        Ok(models)
    }
}

// ============ Qwen API Response Types ============

#[derive(Debug, Deserialize)]
struct QwenErrorResponse {
    code: String,
    message: String,
    #[serde(default)]
    request_id: Option<String>,
}
