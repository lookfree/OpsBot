//! Cloud API drivers module
//!
//! This module provides integration with cloud LLM APIs:
//! - OpenAI (GPT-4, GPT-3.5, etc.)
//! - Claude (Anthropic)
//! - Qwen (Alibaba/通义千问)
//! - Custom OpenAI-compatible APIs

mod openai;
mod claude;
mod qwen;

pub use openai::OpenAiClient;
pub use claude::ClaudeClient;
pub use qwen::QwenClient;

use async_trait::async_trait;
use reqwest::Client;
use crate::models::{
    AiProxyConfig, AiProxyType, CloudApiConfig, CloudApiModel, CloudApiProvider, CloudApiTestResult,
};

/// Unified cloud API client trait
#[async_trait]
pub trait CloudApiClient: Send + Sync {
    /// Get provider type
    fn provider(&self) -> CloudApiProvider;

    /// Test API connection
    async fn test_connection(&self) -> Result<CloudApiTestResult, String>;

    /// List available models
    async fn list_models(&self) -> Result<Vec<CloudApiModel>, String>;
}

/// Create a cloud API client based on provider type
pub fn create_client(config: &CloudApiConfig) -> Result<Box<dyn CloudApiClient>, String> {
    match config.provider {
        CloudApiProvider::OpenAI => {
            let client = OpenAiClient::new(config)?;
            Ok(Box::new(client))
        }
        CloudApiProvider::Claude => {
            let client = ClaudeClient::new(config)?;
            Ok(Box::new(client))
        }
        CloudApiProvider::Qwen => {
            let client = QwenClient::new(config)?;
            Ok(Box::new(client))
        }
        CloudApiProvider::Custom => {
            // Custom uses OpenAI-compatible API
            let client = OpenAiClient::new(config)?;
            Ok(Box::new(client))
        }
    }
}

/// Build an HTTP client with an optional proxy.
///
/// Shared by all cloud API clients and the TensorRT driver so the proxy and
/// timeout behaviour stays identical across them.
pub(crate) fn build_http_client(proxy_config: &Option<AiProxyConfig>) -> Result<Client, String> {
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

/// Predefined ("fallback") model catalog for a cloud provider.
///
/// Single source of truth used both by the no-API-key default-models command
/// and by the Claude/Qwen `list_models` fallbacks (neither provider exposes a
/// live models endpoint). OpenAI is fetched live via its API, so the entry here
/// is only the no-key default set.
pub(crate) fn default_models(provider: CloudApiProvider) -> Vec<CloudApiModel> {
    match provider {
        CloudApiProvider::OpenAI => openai_default_models(),
        CloudApiProvider::Claude => claude_default_models(),
        CloudApiProvider::Qwen => qwen_default_models(),
        CloudApiProvider::Custom => vec![],
    }
}

fn openai_default_models() -> Vec<CloudApiModel> {
    vec![
        CloudApiModel {
            id: "gpt-4o".to_string(),
            name: "GPT-4o".to_string(),
            provider: CloudApiProvider::OpenAI,
            description: Some("Most capable GPT-4 model with vision".to_string()),
            context_length: Some(128000),
            pricing: Some("$2.50 / $10 per 1M tokens".to_string()),
        },
        CloudApiModel {
            id: "gpt-4o-mini".to_string(),
            name: "GPT-4o Mini".to_string(),
            provider: CloudApiProvider::OpenAI,
            description: Some("Fast and affordable GPT-4 variant".to_string()),
            context_length: Some(128000),
            pricing: Some("$0.15 / $0.60 per 1M tokens".to_string()),
        },
        CloudApiModel {
            id: "gpt-4-turbo".to_string(),
            name: "GPT-4 Turbo".to_string(),
            provider: CloudApiProvider::OpenAI,
            description: Some("GPT-4 Turbo with 128K context".to_string()),
            context_length: Some(128000),
            pricing: Some("$10 / $30 per 1M tokens".to_string()),
        },
        CloudApiModel {
            id: "gpt-3.5-turbo".to_string(),
            name: "GPT-3.5 Turbo".to_string(),
            provider: CloudApiProvider::OpenAI,
            description: Some("Fast and cost-effective model".to_string()),
            context_length: Some(16385),
            pricing: Some("$0.50 / $1.50 per 1M tokens".to_string()),
        },
    ]
}

fn claude_default_models() -> Vec<CloudApiModel> {
    vec![
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
    ]
}

fn qwen_default_models() -> Vec<CloudApiModel> {
    vec![
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
    ]
}
