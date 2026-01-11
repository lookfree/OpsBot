//! Ollama HTTP client implementation
//!
//! This module provides the HTTP client for Ollama API operations.

use reqwest::Client;
use serde_json::json;

use crate::models::{
    OllamaModel, OllamaRunningModel, OllamaRunningModelsResponse, OllamaStatus,
    OllamaTagsResponse, OllamaVersionResponse,
};

/// Ollama API client
pub struct OllamaClient {
    host: String,
    port: u16,
    client: Client,
}

impl OllamaClient {
    /// Create a new Ollama client
    pub fn new(host: &str, port: u16) -> Self {
        Self {
            host: host.to_string(),
            port,
            client: Client::builder()
                .timeout(std::time::Duration::from_secs(30))
                .no_proxy() // Disable proxy for local connections
                .build()
                .unwrap_or_default(),
        }
    }

    /// Get base URL
    fn base_url(&self) -> String {
        format!("http://{}:{}", self.host, self.port)
    }

    /// Get Ollama status (version and connection test)
    pub async fn get_status(&self) -> Result<OllamaStatus, String> {
        let url = format!("{}/api/version", self.base_url());

        let response = self
            .client
            .get(&url)
            .send()
            .await
            .map_err(|e| format!("Failed to connect to Ollama: {}", e))?;

        if !response.status().is_success() {
            return Err(format!(
                "Ollama returned error status: {}",
                response.status()
            ));
        }

        let version_response: OllamaVersionResponse = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse version response: {}", e))?;

        Ok(OllamaStatus {
            running: true,
            version: Some(version_response.version),
            host: self.host.clone(),
            port: self.port,
        })
    }

    /// List all installed models
    pub async fn list_models(&self) -> Result<Vec<OllamaModel>, String> {
        let url = format!("{}/api/tags", self.base_url());

        let response = self
            .client
            .get(&url)
            .send()
            .await
            .map_err(|e| format!("Failed to list models: {}", e))?;

        if !response.status().is_success() {
            return Err(format!(
                "Failed to list models: {}",
                response.status()
            ));
        }

        let tags_response: OllamaTagsResponse = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse models response: {}", e))?;

        Ok(tags_response.models.into_iter().map(|m| m.into()).collect())
    }

    /// Pull (download) a model
    pub async fn pull_model(&self, model_name: &str) -> Result<(), String> {
        let url = format!("{}/api/pull", self.base_url());

        let response = self
            .client
            .post(&url)
            .json(&json!({
                "name": model_name,
                "stream": false
            }))
            .timeout(std::time::Duration::from_secs(3600)) // 1 hour timeout for large models
            .send()
            .await
            .map_err(|e| format!("Failed to pull model: {}", e))?;

        if !response.status().is_success() {
            let error_text = response.text().await.unwrap_or_default();
            return Err(format!("Failed to pull model: {}", error_text));
        }

        Ok(())
    }

    /// Delete a model
    pub async fn delete_model(&self, model_name: &str) -> Result<(), String> {
        let url = format!("{}/api/delete", self.base_url());

        let response = self
            .client
            .delete(&url)
            .json(&json!({
                "name": model_name
            }))
            .send()
            .await
            .map_err(|e| format!("Failed to delete model: {}", e))?;

        if !response.status().is_success() {
            let error_text = response.text().await.unwrap_or_default();
            return Err(format!("Failed to delete model: {}", error_text));
        }

        Ok(())
    }

    /// Get running models (models loaded in memory)
    pub async fn get_running_models(&self) -> Result<Vec<OllamaRunningModel>, String> {
        let url = format!("{}/api/ps", self.base_url());

        let response = self
            .client
            .get(&url)
            .send()
            .await
            .map_err(|e| format!("Failed to get running models: {}", e))?;

        if !response.status().is_success() {
            return Err(format!(
                "Failed to get running models: {}",
                response.status()
            ));
        }

        let running_response: OllamaRunningModelsResponse = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse running models response: {}", e))?;

        Ok(running_response.models.unwrap_or_default())
    }

    /// Generate completion (load model into memory)
    pub async fn load_model(&self, model_name: &str) -> Result<(), String> {
        let url = format!("{}/api/generate", self.base_url());

        let response = self
            .client
            .post(&url)
            .json(&json!({
                "model": model_name,
                "prompt": "",
                "stream": false,
                "keep_alive": "10m"
            }))
            .send()
            .await
            .map_err(|e| format!("Failed to load model: {}", e))?;

        if !response.status().is_success() {
            let error_text = response.text().await.unwrap_or_default();
            return Err(format!("Failed to load model: {}", error_text));
        }

        Ok(())
    }

    /// Unload model from memory
    pub async fn unload_model(&self, model_name: &str) -> Result<(), String> {
        let url = format!("{}/api/generate", self.base_url());

        let response = self
            .client
            .post(&url)
            .json(&json!({
                "model": model_name,
                "keep_alive": 0
            }))
            .send()
            .await
            .map_err(|e| format!("Failed to unload model: {}", e))?;

        if !response.status().is_success() {
            let error_text = response.text().await.unwrap_or_default();
            return Err(format!("Failed to unload model: {}", error_text));
        }

        Ok(())
    }
}
