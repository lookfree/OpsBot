//! Qwen (通义千问) API client
//!
//! Supports Alibaba Cloud Qwen API (DashScope)

use reqwest::Client;
use serde::Deserialize;

use async_trait::async_trait;
use crate::models::{
    CloudApiConfig, CloudApiModel, CloudApiProvider, CloudApiTestResult,
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
        // Qwen appends "/services/..." to a base that must carry the "/api/v1"
        // segment; add it if the user entered only the host so we don't 404.
        let trimmed = base_url.trim_end_matches('/');
        let base_url = if trimmed.ends_with("/api/v1") {
            trimmed.to_string()
        } else {
            format!("{}/api/v1", trimmed)
        };

        let client = super::build_http_client(&config.proxy)?;

        Ok(Self {
            client,
            api_key,
            base_url,
        })
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
        // Qwen has no live models-list endpoint; return the shared fallback catalog.
        Ok(super::default_models(CloudApiProvider::Qwen))
    }
}

// ============ Qwen API Response Types ============

#[derive(Debug, Deserialize)]
struct QwenErrorResponse {
    code: String,
    message: String,
}
