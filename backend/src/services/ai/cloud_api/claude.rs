//! Claude (Anthropic) API client
//!
//! Supports Claude API for conversational AI

use reqwest::Client;
use serde::Deserialize;

use async_trait::async_trait;
use crate::models::{
    AiProxyConfig, AiProxyType, CloudApiConfig, CloudApiModel, CloudApiProvider, CloudApiTestResult,
};

use super::CloudApiClient;

/// Claude API client
pub struct ClaudeClient {
    client: Client,
    api_key: String,
    base_url: String,
}

impl ClaudeClient {
    /// Default Claude API base URL
    const DEFAULT_BASE_URL: &'static str = "https://api.anthropic.com";

    /// Current API version
    const API_VERSION: &'static str = "2023-06-01";

    /// Create a new Claude client
    pub fn new(config: &CloudApiConfig) -> Result<Self, String> {
        let api_key = config
            .api_key
            .clone()
            .ok_or("API key is required for Claude")?;

        let base_url = config
            .base_url
            .clone()
            .unwrap_or_else(|| Self::DEFAULT_BASE_URL.to_string());
        // Claude appends the "/v1/..." path itself; strip a trailing "/v1" the
        // user may have pasted (e.g. copied from an OpenAI config) so we don't
        // build ".../v1/v1/messages" and 404.
        let base_url = base_url
            .trim_end_matches('/')
            .trim_end_matches("/v1")
            .to_string();

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

    /// Test connection with a free models-list GET rather than a billable
    /// inference request. Anthropic exposes GET /v1/models; it returns 401/403
    /// on a bad key just like /v1/messages but costs nothing and is faster.
    async fn test_api(&self) -> Result<(), String> {
        let url = format!("{}/v1/models", self.base_url.trim_end_matches('/'));

        let response = self
            .client
            .get(&url)
            .header("x-api-key", &self.api_key)
            .header("anthropic-version", Self::API_VERSION)
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
            if let Ok(error) = serde_json::from_str::<ClaudeErrorResponse>(&error_text) {
                return Err(format!("{}: {}", error.error.error_type, error.error.message));
            }
            return Err(format!("API error ({}): {}", status, error_text));
        }

        Ok(())
    }
}

#[async_trait]
impl CloudApiClient for ClaudeClient {
    fn provider(&self) -> CloudApiProvider {
        CloudApiProvider::Claude
    }

    async fn test_connection(&self) -> Result<CloudApiTestResult, String> {
        let start = std::time::Instant::now();

        match self.test_api().await {
            Ok(()) => Ok(CloudApiTestResult {
                success: true,
                message: "Connected to Claude API successfully.".to_string(),
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
        // Claude doesn't have a models list API, return known models
        let models = vec![
            CloudApiModel {
                id: "claude-3-5-sonnet-20241022".to_string(),
                name: "Claude 3.5 Sonnet".to_string(),
                provider: CloudApiProvider::Claude,
                description: Some("Most intelligent model with best balance of capability and speed".to_string()),
                context_length: Some(200000),
                pricing: Some("$3 / $15 per 1M tokens".to_string()),
            },
            CloudApiModel {
                id: "claude-3-5-haiku-20241022".to_string(),
                name: "Claude 3.5 Haiku".to_string(),
                provider: CloudApiProvider::Claude,
                description: Some("Fastest and most cost-effective model".to_string()),
                context_length: Some(200000),
                pricing: Some("$0.25 / $1.25 per 1M tokens".to_string()),
            },
            CloudApiModel {
                id: "claude-3-opus-20240229".to_string(),
                name: "Claude 3 Opus".to_string(),
                provider: CloudApiProvider::Claude,
                description: Some("Most powerful model for complex tasks".to_string()),
                context_length: Some(200000),
                pricing: Some("$15 / $75 per 1M tokens".to_string()),
            },
            CloudApiModel {
                id: "claude-3-sonnet-20240229".to_string(),
                name: "Claude 3 Sonnet".to_string(),
                provider: CloudApiProvider::Claude,
                description: Some("Balanced model for most tasks".to_string()),
                context_length: Some(200000),
                pricing: Some("$3 / $15 per 1M tokens".to_string()),
            },
            CloudApiModel {
                id: "claude-3-haiku-20240307".to_string(),
                name: "Claude 3 Haiku".to_string(),
                provider: CloudApiProvider::Claude,
                description: Some("Fast and affordable model".to_string()),
                context_length: Some(200000),
                pricing: Some("$0.25 / $1.25 per 1M tokens".to_string()),
            },
        ];

        Ok(models)
    }
}

// ============ Claude API Response Types ============

#[derive(Debug, Deserialize)]
struct ClaudeErrorResponse {
    error: ClaudeError,
}

#[derive(Debug, Deserialize)]
struct ClaudeError {
    #[serde(rename = "type")]
    error_type: String,
    message: String,
}
