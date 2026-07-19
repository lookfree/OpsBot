//! Claude (Anthropic) API client
//!
//! Supports Claude API for conversational AI

use reqwest::Client;
use serde::Deserialize;

use async_trait::async_trait;
use crate::models::{
    CloudApiConfig, CloudApiModel, CloudApiProvider, CloudApiTestResult,
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

        let client = super::build_http_client(&config.proxy)?;

        Ok(Self {
            client,
            api_key,
            base_url,
        })
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
        // Claude has no live models-list endpoint; return the shared fallback catalog.
        Ok(super::default_models(CloudApiProvider::Claude))
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
