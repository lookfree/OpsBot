//! AI services module
//!
//! This module provides AI service management, including:
//! - Ollama local LLM management
//! - TensorRT-LLM high-performance inference
//! - Cloud API integration (OpenAI, Claude, Qwen)
//! - GPU monitoring
//! - MCP server management

pub mod cloud_api;
pub mod gpu;
pub mod mcp;
pub mod ollama;
pub mod openwebui;
pub mod remote;
pub mod tensorrt;
pub mod traits;

pub use cloud_api::{CloudApiClient, ClaudeClient, OpenAiClient, QwenClient};
pub use gpu::{GpuHistoryService, HistoryInterval, NvidiaGpuMonitor};
pub use mcp::{McpServerInstance, McpServerManager};
pub use openwebui::OpenWebUIService;
pub use remote::RemoteAiManager;
pub use tensorrt::TensorRTDriver;
pub use traits::{AiDriver, DriverStatus, ModelManager, ServiceController, ServiceStatus};

use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;

use crate::models::{
    McpServerConfig, McpServerInfo, McpTool,
    OllamaModel, OllamaRunningModel, OllamaStatus,
    TensorRTModel, TensorRTModelConfig, TensorRTStatus,
};
use ollama::OllamaClient;

/// AI Service for managing AI-related operations
pub struct AiService {
    /// Ollama client instances by connection ID
    ollama_clients: RwLock<HashMap<String, Arc<OllamaClient>>>,
    /// TensorRT driver instances by connection ID
    tensorrt_drivers: RwLock<HashMap<String, Arc<TensorRTDriver>>>,
    /// MCP server manager
    mcp_manager: McpServerManager,
}

impl AiService {
    /// Create a new AI service
    pub fn new() -> Self {
        Self {
            ollama_clients: RwLock::new(HashMap::new()),
            tensorrt_drivers: RwLock::new(HashMap::new()),
            mcp_manager: McpServerManager::new(),
        }
    }

    // ============ Ollama Operations ============

    /// Connect to Ollama service
    pub async fn connect_ollama(
        &self,
        connection_id: &str,
        host: &str,
        port: u16,
    ) -> Result<OllamaStatus, String> {
        let client = OllamaClient::new(host, port);

        // Test connection by getting version
        let status = client.get_status().await?;

        // Store client
        let mut clients = self.ollama_clients.write().await;
        clients.insert(connection_id.to_string(), Arc::new(client));

        Ok(status)
    }

    /// Disconnect from Ollama service
    pub async fn disconnect_ollama(&self, connection_id: &str) -> Result<(), String> {
        let mut clients = self.ollama_clients.write().await;
        clients.remove(connection_id);
        Ok(())
    }

    /// Check if Ollama is connected
    pub async fn is_ollama_connected(&self, connection_id: &str) -> bool {
        let clients = self.ollama_clients.read().await;
        clients.contains_key(connection_id)
    }

    /// Get Ollama client
    async fn get_ollama_client(&self, connection_id: &str) -> Result<Arc<OllamaClient>, String> {
        let clients = self.ollama_clients.read().await;
        clients
            .get(connection_id)
            .cloned()
            .ok_or_else(|| format!("Ollama not connected: {}", connection_id))
    }

    /// Get Ollama status
    pub async fn get_ollama_status(&self, connection_id: &str) -> Result<OllamaStatus, String> {
        let client = self.get_ollama_client(connection_id).await?;
        client.get_status().await
    }

    /// List Ollama models
    pub async fn list_ollama_models(&self, connection_id: &str) -> Result<Vec<OllamaModel>, String> {
        let client = self.get_ollama_client(connection_id).await?;
        client.list_models().await
    }

    /// Pull Ollama model
    pub async fn pull_ollama_model(
        &self,
        connection_id: &str,
        model_name: &str,
    ) -> Result<(), String> {
        let client = self.get_ollama_client(connection_id).await?;
        client.pull_model(model_name).await
    }

    /// Delete Ollama model
    pub async fn delete_ollama_model(
        &self,
        connection_id: &str,
        model_name: &str,
    ) -> Result<(), String> {
        let client = self.get_ollama_client(connection_id).await?;
        client.delete_model(model_name).await
    }

    /// Get running models
    pub async fn get_running_models(
        &self,
        connection_id: &str,
    ) -> Result<Vec<OllamaRunningModel>, String> {
        let client = self.get_ollama_client(connection_id).await?;
        client.get_running_models().await
    }

    /// Test Ollama connection without storing
    pub async fn test_ollama_connection(host: &str, port: u16) -> Result<OllamaStatus, String> {
        let client = OllamaClient::new(host, port);
        client.get_status().await
    }

    // ============ Cloud API Operations ============

    /// Test cloud API connection
    pub async fn test_cloud_api_connection(
        config: &crate::models::CloudApiConfig,
    ) -> Result<crate::models::CloudApiTestResult, String> {
        let client = cloud_api::create_client(config)?;
        client.test_connection().await
    }

    /// List available models for a cloud API provider
    pub async fn list_cloud_api_models(
        config: &crate::models::CloudApiConfig,
    ) -> Result<Vec<crate::models::CloudApiModel>, String> {
        let client = cloud_api::create_client(config)?;
        client.list_models().await
    }

    // ============ TensorRT Operations ============

    /// Connect to TensorRT-LLM service
    pub async fn connect_tensorrt(
        &self,
        connection_id: &str,
        host: &str,
        port: Option<u16>,
        ssh_connection_id: Option<String>,
    ) -> Result<TensorRTStatus, String> {
        let driver = TensorRTDriver::new(
            host.to_string(),
            port,
            ssh_connection_id,
            &None,
        )?;

        // Test connection by getting status. get_status maps an unreachable /
        // erroring endpoint to installed:false (it never returns Err), so gate
        // on that explicitly — otherwise a wrong host/port would be stored as a
        // live driver and the UI would show "connected" for a dead endpoint.
        let status = driver.get_status().await?;
        if !status.installed {
            return Err(format!(
                "TensorRT-LLM endpoint not reachable at {}",
                driver.base_url()
            ));
        }

        // Store driver
        let mut drivers = self.tensorrt_drivers.write().await;
        drivers.insert(connection_id.to_string(), Arc::new(driver));

        Ok(status)
    }

    /// Disconnect from TensorRT-LLM service
    pub async fn disconnect_tensorrt(&self, connection_id: &str) -> Result<(), String> {
        let mut drivers = self.tensorrt_drivers.write().await;
        drivers.remove(connection_id);
        Ok(())
    }

    /// Check if TensorRT is connected
    pub async fn is_tensorrt_connected(&self, connection_id: &str) -> bool {
        let drivers = self.tensorrt_drivers.read().await;
        drivers.contains_key(connection_id)
    }

    /// Get TensorRT driver
    async fn get_tensorrt_driver(&self, connection_id: &str) -> Result<Arc<TensorRTDriver>, String> {
        let drivers = self.tensorrt_drivers.read().await;
        drivers
            .get(connection_id)
            .cloned()
            .ok_or_else(|| format!("TensorRT not connected: {}", connection_id))
    }

    /// Get TensorRT status
    pub async fn get_tensorrt_status(&self, connection_id: &str) -> Result<TensorRTStatus, String> {
        let driver = self.get_tensorrt_driver(connection_id).await?;
        driver.get_status().await
    }

    /// List TensorRT models
    pub async fn list_tensorrt_models(&self, connection_id: &str) -> Result<Vec<TensorRTModel>, String> {
        let driver = self.get_tensorrt_driver(connection_id).await?;
        driver.list_models().await
    }

    /// Deploy TensorRT model
    pub async fn deploy_tensorrt_model(
        &self,
        connection_id: &str,
        config: TensorRTModelConfig,
    ) -> Result<String, String> {
        let driver = self.get_tensorrt_driver(connection_id).await?;
        driver.deploy_model(config).await
    }

    /// Start TensorRT model
    pub async fn start_tensorrt_model(
        &self,
        connection_id: &str,
        model_id: &str,
    ) -> Result<(), String> {
        let driver = self.get_tensorrt_driver(connection_id).await?;
        driver.start_model(model_id).await
    }

    /// Stop TensorRT model
    pub async fn stop_tensorrt_model(
        &self,
        connection_id: &str,
        model_id: &str,
    ) -> Result<(), String> {
        let driver = self.get_tensorrt_driver(connection_id).await?;
        driver.stop_model(model_id).await
    }

    /// Get TensorRT model logs
    pub async fn get_tensorrt_logs(
        &self,
        connection_id: &str,
        model_id: &str,
        lines: usize,
    ) -> Result<String, String> {
        let driver = self.get_tensorrt_driver(connection_id).await?;
        driver.get_model_logs(model_id, lines).await
    }

    /// Test TensorRT connection without storing
    pub async fn test_tensorrt_connection(
        host: &str,
        port: Option<u16>,
    ) -> Result<TensorRTStatus, String> {
        let driver = TensorRTDriver::new(host.to_string(), port, None, &None)?;
        driver.get_status().await
    }

    // ============ MCP Operations ============

    /// Create a new MCP server
    pub async fn create_mcp_server(&self, config: McpServerConfig) -> Result<String, String> {
        self.mcp_manager.create_server(config).await
    }

    /// Delete an MCP server
    pub async fn delete_mcp_server(&self, server_id: &str) -> Result<(), String> {
        self.mcp_manager.delete_server(server_id).await
    }

    /// List all MCP servers
    pub async fn list_mcp_servers(&self) -> Vec<McpServerInfo> {
        self.mcp_manager.list_servers().await
    }

    /// Get MCP server info
    pub async fn get_mcp_server(&self, server_id: &str) -> Option<McpServerInfo> {
        self.mcp_manager.get_server_info(server_id).await
    }

    /// Start an MCP server
    pub async fn start_mcp_server(&self, server_id: &str) -> Result<(), String> {
        self.mcp_manager.start_server(server_id).await
    }

    /// Stop an MCP server
    pub async fn stop_mcp_server(&self, server_id: &str) -> Result<(), String> {
        self.mcp_manager.stop_server(server_id).await
    }

    /// Bind a tool to an MCP server
    pub async fn bind_mcp_tool(&self, server_id: &str, tool: McpTool) -> Result<(), String> {
        self.mcp_manager.bind_tool(server_id, tool).await
    }

    /// Unbind a tool from an MCP server
    pub async fn unbind_mcp_tool(&self, server_id: &str, tool_name: &str) -> Result<(), String> {
        self.mcp_manager.unbind_tool(server_id, tool_name).await
    }

    /// Get tools for an MCP server
    pub async fn get_mcp_tools(&self, server_id: &str) -> Result<Vec<McpTool>, String> {
        self.mcp_manager.get_server_tools(server_id).await
    }

    /// Update an MCP server configuration
    pub async fn update_mcp_server(&self, server_id: &str, config: McpServerConfig) -> Result<(), String> {
        self.mcp_manager.update_server(server_id, config).await
    }

    // ============ OpenWebUI Operations ============

    /// Detect OpenWebUI installation
    pub async fn detect_openwebui(
        custom_url: Option<String>,
    ) -> Result<crate::models::OpenWebUIStatus, String> {
        let service = OpenWebUIService::new(custom_url);
        let status = service.detect().await?;

        Ok(crate::models::OpenWebUIStatus {
            available: status.available,
            url: status.url,
            version: status.version,
            source: match status.source {
                openwebui::OpenWebUISource::Local => crate::models::OpenWebUISource::Local,
                openwebui::OpenWebUISource::Docker => crate::models::OpenWebUISource::Docker,
                openwebui::OpenWebUISource::NotFound => crate::models::OpenWebUISource::NotFound,
            },
        })
    }

    /// Open OpenWebUI in browser
    pub fn open_openwebui(url: &str) -> Result<(), String> {
        let service = OpenWebUIService::new(None);
        service.open_in_browser(url)
    }
}

impl Default for AiService {
    fn default() -> Self {
        Self::new()
    }
}
