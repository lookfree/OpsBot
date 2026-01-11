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
use crate::models::{
    CloudApiConfig, CloudApiModel, CloudApiProvider, CloudApiTestResult,
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
