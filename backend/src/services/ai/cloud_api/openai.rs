//! OpenAI API client
//!
//! Supports OpenAI API and OpenAI-compatible APIs (like Azure OpenAI, LocalAI, etc.)

use reqwest::Client;
use serde::Deserialize;

use async_trait::async_trait;
use crate::models::{
    AiProxyConfig, AiProxyType, CloudApiConfig, CloudApiModel, CloudApiProvider, CloudApiTestResult,
};

use super::CloudApiClient;

/// OpenAI API client
pub struct OpenAiClient {
    client: Client,
    api_key: String,
    base_url: String,
    organization: Option<String>,
}

impl OpenAiClient {
    /// Default OpenAI API base URL
    const DEFAULT_BASE_URL: &'static str = "https://api.openai.com/v1";

    /// Create a new OpenAI client
    pub fn new(config: &CloudApiConfig) -> Result<Self, String> {
        let api_key = config
            .api_key
            .clone()
            .ok_or("API key is required for OpenAI")?;

        let base_url = config
            .base_url
            .clone()
            .unwrap_or_else(|| Self::DEFAULT_BASE_URL.to_string());

        let client = Self::build_http_client(&config.proxy)?;

        Ok(Self {
            client,
            api_key,
            base_url,
            organization: config.organization.clone(),
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

    /// Make API request with authentication headers
    async fn request<T: for<'de> Deserialize<'de>>(
        &self,
        endpoint: &str,
    ) -> Result<T, String> {
        let url = format!("{}/{}", self.base_url.trim_end_matches('/'), endpoint);

        let mut request = self
            .client
            .get(&url)
            .header("Authorization", format!("Bearer {}", self.api_key))
            .header("Content-Type", "application/json");

        if let Some(org) = &self.organization {
            request = request.header("OpenAI-Organization", org);
        }

        let response = request
            .send()
            .await
            .map_err(|e| format!("Request failed: {}", e))?;

        let status = response.status();
        if !status.is_success() {
            let error_text = response
                .text()
                .await
                .unwrap_or_else(|_| "Unknown error".to_string());
            return Err(format!("API error ({}): {}", status, error_text));
        }

        response
            .json::<T>()
            .await
            .map_err(|e| format!("Failed to parse response: {}", e))
    }
}

#[async_trait]
impl CloudApiClient for OpenAiClient {
    fn provider(&self) -> CloudApiProvider {
        CloudApiProvider::OpenAI
    }

    async fn test_connection(&self) -> Result<CloudApiTestResult, String> {
        // Try to list models to verify connection
        match self.request::<OpenAiModelsResponse>("models").await {
            Ok(response) => Ok(CloudApiTestResult {
                success: true,
                message: format!("Connected successfully. {} models available.", response.data.len()),
                latency_ms: None,
            }),
            Err(e) => Ok(CloudApiTestResult {
                success: false,
                message: e,
                latency_ms: None,
            }),
        }
    }

    async fn list_models(&self) -> Result<Vec<CloudApiModel>, String> {
        let response: OpenAiModelsResponse = self.request("models").await?;

        let models = response
            .data
            .into_iter()
            .filter(|m| {
                // Filter to only show GPT models and embeddings
                m.id.starts_with("gpt-")
                    || m.id.starts_with("text-embedding-")
                    || m.id.starts_with("dall-e")
                    || m.id.starts_with("whisper")
                    || m.id.starts_with("tts")
            })
            .map(|m| CloudApiModel {
                id: m.id.clone(),
                name: m.id,
                provider: CloudApiProvider::OpenAI,
                description: None,
                context_length: None,
                pricing: None,
            })
            .collect();

        Ok(models)
    }
}

// ============ OpenAI API Response Types ============

#[derive(Debug, Deserialize)]
struct OpenAiModelsResponse {
    data: Vec<OpenAiModel>,
}

#[derive(Debug, Deserialize)]
struct OpenAiModel {
    id: String,
    #[serde(default)]
    object: String,
    #[serde(default)]
    created: i64,
    #[serde(default)]
    owned_by: String,
}
