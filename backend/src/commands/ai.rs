//! Tauri commands for AI operations
//!
//! This module provides Tauri command handlers for AI services including
//! Ollama, cloud APIs, and GPU monitoring.

use std::sync::Arc;

use tauri::State;

use crate::models::{
    CloudApiConfig, CloudApiModel, CloudApiProvider, CloudApiTestResult, GpuInfo,
    OllamaConnectRequest, OllamaModel, OllamaRunningModel, OllamaStatus,
    OpenWebUIStatus, RemoteAiEnvironment,
    TensorRTConnectRequest, TensorRTModel, TensorRTModelConfig, TensorRTStatus,
};
use crate::services::ai::RemoteAiManager;
use crate::services::AiService;
use crate::commands::SshServiceState;

/// State wrapper for AI service
pub struct AiServiceState(pub Arc<AiService>);

// ============ Ollama Connection Commands ============

/// Connect to Ollama service
#[tauri::command]
pub async fn ai_ollama_connect(
    state: State<'_, AiServiceState>,
    connection_id: String,
    request: OllamaConnectRequest,
) -> Result<OllamaStatus, String> {
    state
        .0
        .connect_ollama(&connection_id, &request.host, request.port)
        .await
}

/// Disconnect from Ollama service
#[tauri::command]
pub async fn ai_ollama_disconnect(
    state: State<'_, AiServiceState>,
    connection_id: String,
) -> Result<(), String> {
    state.0.disconnect_ollama(&connection_id).await
}

/// Test Ollama connection
#[tauri::command]
pub async fn ai_ollama_test_connection(
    host: String,
    port: u16,
) -> Result<OllamaStatus, String> {
    AiService::test_ollama_connection(&host, port).await
}

/// Check if Ollama is connected
#[tauri::command]
pub async fn ai_ollama_is_connected(
    state: State<'_, AiServiceState>,
    connection_id: String,
) -> Result<bool, String> {
    Ok(state.0.is_ollama_connected(&connection_id).await)
}

/// Get Ollama status
#[tauri::command]
pub async fn ai_ollama_get_status(
    state: State<'_, AiServiceState>,
    connection_id: String,
) -> Result<OllamaStatus, String> {
    state.0.get_ollama_status(&connection_id).await
}

// ============ Ollama Model Commands ============

/// List all Ollama models
#[tauri::command]
pub async fn ai_ollama_list_models(
    state: State<'_, AiServiceState>,
    connection_id: String,
) -> Result<Vec<OllamaModel>, String> {
    state.0.list_ollama_models(&connection_id).await
}

/// Pull (download) an Ollama model
#[tauri::command]
pub async fn ai_ollama_pull_model(
    state: State<'_, AiServiceState>,
    connection_id: String,
    model_name: String,
) -> Result<(), String> {
    state.0.pull_ollama_model(&connection_id, &model_name).await
}

/// Delete an Ollama model
#[tauri::command]
pub async fn ai_ollama_delete_model(
    state: State<'_, AiServiceState>,
    connection_id: String,
    model_name: String,
) -> Result<(), String> {
    state
        .0
        .delete_ollama_model(&connection_id, &model_name)
        .await
}

/// Get running Ollama models
#[tauri::command]
pub async fn ai_ollama_get_running_models(
    state: State<'_, AiServiceState>,
    connection_id: String,
) -> Result<Vec<OllamaRunningModel>, String> {
    state.0.get_running_models(&connection_id).await
}

// ============ Ollama Service Control Commands ============

/// Start Ollama service
#[tauri::command]
pub async fn ai_ollama_start_service() -> Result<String, String> {
    use crate::services::ai::ollama::OllamaServiceController;

    let result = OllamaServiceController::start_service().await?;
    Ok(result.message)
}

/// Stop Ollama service
#[tauri::command]
pub async fn ai_ollama_stop_service() -> Result<String, String> {
    use crate::services::ai::ollama::OllamaServiceController;

    let result = OllamaServiceController::stop_service().await?;
    Ok(result.message)
}

/// Restart Ollama service
#[tauri::command]
pub async fn ai_ollama_restart_service() -> Result<String, String> {
    use crate::services::ai::ollama::OllamaServiceController;

    let result = OllamaServiceController::restart_service().await?;
    Ok(result.message)
}

/// Check if Ollama service is running
#[tauri::command]
pub async fn ai_ollama_is_service_running() -> Result<bool, String> {
    use crate::services::ai::ollama::OllamaServiceController;

    Ok(OllamaServiceController::is_running().await)
}

// ============ GPU Monitoring Commands ============

/// Detect if NVIDIA GPU is available
#[tauri::command]
pub async fn ai_detect_gpu() -> Result<bool, String> {
    use crate::services::ai::NvidiaGpuMonitor;

    let monitor = NvidiaGpuMonitor::new_local();
    monitor.detect_gpu().await
}

/// Get GPU information
#[tauri::command]
pub async fn ai_get_gpu_info() -> Result<Vec<crate::models::GpuInfo>, String> {
    use crate::services::ai::NvidiaGpuMonitor;

    let monitor = NvidiaGpuMonitor::new_local();
    monitor.get_gpu_info().await
}

/// Get GPU processes
#[tauri::command]
pub async fn ai_get_gpu_processes() -> Result<Vec<crate::models::GpuProcess>, String> {
    use crate::services::ai::NvidiaGpuMonitor;

    let monitor = NvidiaGpuMonitor::new_local();
    monitor.get_gpu_processes().await
}

/// Get GPU history data
#[tauri::command]
pub async fn ai_get_gpu_history(
    gpu_index: i32,
    start_time: i64,
    end_time: i64,
    interval: String,
) -> Result<Vec<crate::models::GpuHistory>, String> {
    use crate::services::ai::{GpuHistoryService, HistoryInterval};

    let interval = HistoryInterval::from_str(&interval)
        .ok_or_else(|| format!("Invalid interval: {}", interval))?;

    // Get app data directory for database
    let db_path = std::env::temp_dir().join("zwd-opsbot-gpu-history.db");
    let mut service = GpuHistoryService::new(db_path);
    service.init()?;

    service.get_history(gpu_index, start_time, end_time, interval)
}

// ============ Cloud API Commands ============

/// Test cloud API connection
#[tauri::command]
pub async fn ai_cloud_api_test_connection(
    provider: String,
    api_key: String,
    base_url: Option<String>,
    organization: Option<String>,
) -> Result<CloudApiTestResult, String> {
    let provider = parse_cloud_api_provider(&provider)?;

    let config = CloudApiConfig {
        id: String::new(),
        name: String::new(),
        provider,
        api_key: Some(api_key),
        base_url,
        organization,
        default_model: None,
        proxy: None,
        enabled: true,
        created_at: None,
        updated_at: None,
    };

    AiService::test_cloud_api_connection(&config).await
}

/// List available models for a cloud API provider
#[tauri::command]
pub async fn ai_cloud_api_list_models(
    provider: String,
    api_key: String,
    base_url: Option<String>,
    organization: Option<String>,
) -> Result<Vec<CloudApiModel>, String> {
    let provider = parse_cloud_api_provider(&provider)?;

    let config = CloudApiConfig {
        id: String::new(),
        name: String::new(),
        provider,
        api_key: Some(api_key),
        base_url,
        organization,
        default_model: None,
        proxy: None,
        enabled: true,
        created_at: None,
        updated_at: None,
    };

    AiService::list_cloud_api_models(&config).await
}

/// Get default models for a cloud API provider (no API key required)
#[tauri::command]
pub async fn ai_cloud_api_get_default_models(
    provider: String,
) -> Result<Vec<CloudApiModel>, String> {
    let provider = parse_cloud_api_provider(&provider)?;

    // Return predefined models based on provider
    let models = match provider {
        CloudApiProvider::OpenAI => vec![
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
        ],
        CloudApiProvider::Claude => vec![
            CloudApiModel {
                id: "claude-3-5-sonnet-20241022".to_string(),
                name: "Claude 3.5 Sonnet".to_string(),
                provider: CloudApiProvider::Claude,
                description: Some("Most intelligent model".to_string()),
                context_length: Some(200000),
                pricing: Some("$3 / $15 per 1M tokens".to_string()),
            },
            CloudApiModel {
                id: "claude-3-5-haiku-20241022".to_string(),
                name: "Claude 3.5 Haiku".to_string(),
                provider: CloudApiProvider::Claude,
                description: Some("Fastest and most affordable".to_string()),
                context_length: Some(200000),
                pricing: Some("$0.25 / $1.25 per 1M tokens".to_string()),
            },
            CloudApiModel {
                id: "claude-3-opus-20240229".to_string(),
                name: "Claude 3 Opus".to_string(),
                provider: CloudApiProvider::Claude,
                description: Some("Most powerful for complex tasks".to_string()),
                context_length: Some(200000),
                pricing: Some("$15 / $75 per 1M tokens".to_string()),
            },
        ],
        CloudApiProvider::Qwen => vec![
            CloudApiModel {
                id: "qwen-max".to_string(),
                name: "Qwen Max".to_string(),
                provider: CloudApiProvider::Qwen,
                description: Some("Most powerful Qwen model".to_string()),
                context_length: Some(30000),
                pricing: Some("¥0.04 / ¥0.12 per 1K tokens".to_string()),
            },
            CloudApiModel {
                id: "qwen-plus".to_string(),
                name: "Qwen Plus".to_string(),
                provider: CloudApiProvider::Qwen,
                description: Some("Balanced model for most tasks".to_string()),
                context_length: Some(30000),
                pricing: Some("¥0.004 / ¥0.012 per 1K tokens".to_string()),
            },
            CloudApiModel {
                id: "qwen-turbo".to_string(),
                name: "Qwen Turbo".to_string(),
                provider: CloudApiProvider::Qwen,
                description: Some("Fast and cost-effective".to_string()),
                context_length: Some(8000),
                pricing: Some("¥0.002 / ¥0.006 per 1K tokens".to_string()),
            },
        ],
        CloudApiProvider::Custom => vec![],
    };

    Ok(models)
}

/// Parse cloud API provider from string
fn parse_cloud_api_provider(provider: &str) -> Result<CloudApiProvider, String> {
    match provider.to_lowercase().as_str() {
        "openai" => Ok(CloudApiProvider::OpenAI),
        "claude" => Ok(CloudApiProvider::Claude),
        "qwen" => Ok(CloudApiProvider::Qwen),
        "custom" => Ok(CloudApiProvider::Custom),
        _ => Err(format!("Unknown cloud API provider: {}", provider)),
    }
}

// ============ TensorRT LLM Commands ============

/// Connect to TensorRT-LLM service
#[tauri::command]
pub async fn ai_tensorrt_connect(
    state: State<'_, AiServiceState>,
    connection_id: String,
    request: TensorRTConnectRequest,
) -> Result<TensorRTStatus, String> {
    state
        .0
        .connect_tensorrt(
            &connection_id,
            &request.host,
            request.port,
            request.ssh_connection_id,
        )
        .await
}

/// Disconnect from TensorRT-LLM service
#[tauri::command]
pub async fn ai_tensorrt_disconnect(
    state: State<'_, AiServiceState>,
    connection_id: String,
) -> Result<(), String> {
    state.0.disconnect_tensorrt(&connection_id).await
}

/// Test TensorRT-LLM connection
#[tauri::command]
pub async fn ai_tensorrt_test_connection(
    host: String,
    port: Option<u16>,
) -> Result<TensorRTStatus, String> {
    AiService::test_tensorrt_connection(&host, port).await
}

/// Check if TensorRT is connected
#[tauri::command]
pub async fn ai_tensorrt_is_connected(
    state: State<'_, AiServiceState>,
    connection_id: String,
) -> Result<bool, String> {
    Ok(state.0.is_tensorrt_connected(&connection_id).await)
}

/// Get TensorRT-LLM status
#[tauri::command]
pub async fn ai_tensorrt_get_status(
    state: State<'_, AiServiceState>,
    connection_id: String,
) -> Result<TensorRTStatus, String> {
    state.0.get_tensorrt_status(&connection_id).await
}

/// List TensorRT-LLM models
#[tauri::command]
pub async fn ai_tensorrt_list_models(
    state: State<'_, AiServiceState>,
    connection_id: String,
) -> Result<Vec<TensorRTModel>, String> {
    state.0.list_tensorrt_models(&connection_id).await
}

/// Deploy a TensorRT-LLM model
#[tauri::command]
pub async fn ai_tensorrt_deploy_model(
    state: State<'_, AiServiceState>,
    connection_id: String,
    config: TensorRTModelConfig,
) -> Result<String, String> {
    state.0.deploy_tensorrt_model(&connection_id, config).await
}

/// Start a TensorRT-LLM model
#[tauri::command]
pub async fn ai_tensorrt_start_model(
    state: State<'_, AiServiceState>,
    connection_id: String,
    model_id: String,
) -> Result<(), String> {
    state
        .0
        .start_tensorrt_model(&connection_id, &model_id)
        .await
}

/// Stop a TensorRT-LLM model
#[tauri::command]
pub async fn ai_tensorrt_stop_model(
    state: State<'_, AiServiceState>,
    connection_id: String,
    model_id: String,
) -> Result<(), String> {
    state
        .0
        .stop_tensorrt_model(&connection_id, &model_id)
        .await
}

/// Get TensorRT-LLM model logs
#[tauri::command]
pub async fn ai_tensorrt_get_logs(
    state: State<'_, AiServiceState>,
    connection_id: String,
    model_id: String,
    lines: u32,
) -> Result<String, String> {
    state
        .0
        .get_tensorrt_logs(&connection_id, &model_id, lines as usize)
        .await
}

// ============ MCP Server Commands ============

/// Create a new MCP server
#[tauri::command]
pub async fn ai_mcp_create_server(
    state: State<'_, AiServiceState>,
    config: crate::models::McpServerConfig,
) -> Result<String, String> {
    state.0.create_mcp_server(config).await
}

/// Delete an MCP server
#[tauri::command]
pub async fn ai_mcp_delete_server(
    state: State<'_, AiServiceState>,
    server_id: String,
) -> Result<(), String> {
    state.0.delete_mcp_server(&server_id).await
}

/// List all MCP servers
#[tauri::command]
pub async fn ai_mcp_list_servers(
    state: State<'_, AiServiceState>,
) -> Result<Vec<crate::models::McpServerInfo>, String> {
    Ok(state.0.list_mcp_servers().await)
}

/// Get MCP server info
#[tauri::command]
pub async fn ai_mcp_get_server(
    state: State<'_, AiServiceState>,
    server_id: String,
) -> Result<Option<crate::models::McpServerInfo>, String> {
    Ok(state.0.get_mcp_server(&server_id).await)
}

/// Start an MCP server
#[tauri::command]
pub async fn ai_mcp_start_server(
    state: State<'_, AiServiceState>,
    server_id: String,
) -> Result<(), String> {
    state.0.start_mcp_server(&server_id).await
}

/// Stop an MCP server
#[tauri::command]
pub async fn ai_mcp_stop_server(
    state: State<'_, AiServiceState>,
    server_id: String,
) -> Result<(), String> {
    state.0.stop_mcp_server(&server_id).await
}

/// Bind a tool to an MCP server
#[tauri::command]
pub async fn ai_mcp_bind_tool(
    state: State<'_, AiServiceState>,
    server_id: String,
    tool: crate::models::McpTool,
) -> Result<(), String> {
    state.0.bind_mcp_tool(&server_id, tool).await
}

/// Unbind a tool from an MCP server
#[tauri::command]
pub async fn ai_mcp_unbind_tool(
    state: State<'_, AiServiceState>,
    server_id: String,
    tool_name: String,
) -> Result<(), String> {
    state.0.unbind_mcp_tool(&server_id, &tool_name).await
}

/// Get tools for an MCP server
#[tauri::command]
pub async fn ai_mcp_get_tools(
    state: State<'_, AiServiceState>,
    server_id: String,
) -> Result<Vec<crate::models::McpTool>, String> {
    state.0.get_mcp_tools(&server_id).await
}

/// Update an MCP server configuration
#[tauri::command]
pub async fn ai_mcp_update_server(
    state: State<'_, AiServiceState>,
    server_id: String,
    config: crate::models::McpServerConfig,
) -> Result<(), String> {
    state.0.update_mcp_server(&server_id, config).await
}

// ============ OpenWebUI Commands ============

/// Detect OpenWebUI installation
#[tauri::command]
pub async fn ai_openwebui_detect(
    custom_url: Option<String>,
) -> Result<OpenWebUIStatus, String> {
    AiService::detect_openwebui(custom_url).await
}

/// Open OpenWebUI in browser
#[tauri::command]
pub async fn ai_openwebui_open(
    url: String,
) -> Result<(), String> {
    AiService::open_openwebui(&url)
}

// ============ Remote AI Management Commands ============

/// Detect AI environment on remote server
#[tauri::command]
pub async fn ai_remote_detect_environment(
    ssh_state: State<'_, SshServiceState>,
    ssh_connection_id: String,
) -> Result<RemoteAiEnvironment, String> {
    let manager = RemoteAiManager::new(ssh_state.0.clone());
    manager.detect_environment(&ssh_connection_id).await
}

/// Execute Ollama command on remote server
#[tauri::command]
pub async fn ai_remote_ollama_command(
    ssh_state: State<'_, SshServiceState>,
    ssh_connection_id: String,
    command: String,
) -> Result<String, String> {
    let manager = RemoteAiManager::new(ssh_state.0.clone());
    manager.execute_ollama_command(&ssh_connection_id, &command).await
}

/// Sync Ollama models from remote server
#[tauri::command]
pub async fn ai_remote_sync_models(
    ssh_state: State<'_, SshServiceState>,
    ssh_connection_id: String,
) -> Result<Vec<OllamaModel>, String> {
    let manager = RemoteAiManager::new(ssh_state.0.clone());
    manager.sync_ollama_models(&ssh_connection_id).await
}

/// Get GPU information from remote server
#[tauri::command]
pub async fn ai_remote_get_gpu_info(
    ssh_state: State<'_, SshServiceState>,
    ssh_connection_id: String,
) -> Result<Vec<GpuInfo>, String> {
    let manager = RemoteAiManager::new(ssh_state.0.clone());
    manager.get_remote_gpu_info(&ssh_connection_id).await
}
