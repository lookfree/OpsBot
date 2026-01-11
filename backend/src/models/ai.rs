//! AI module data models
//!
//! This module contains data structures for AI service management,
//! including Ollama, TensorRT LLM, and cloud APIs.

use serde::{Deserialize, Serialize};

// ============ AI Connection Types ============

/// AI service provider types
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum AiConnectionType {
    Ollama,
    TensorRT,
    OpenAI,
    Claude,
    Qwen,
    Custom,
}

/// AI connection configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiConnection {
    pub id: String,
    pub name: String,
    pub connection_type: AiConnectionType,
    pub host: Option<String>,
    pub port: Option<u16>,
    pub api_key: Option<String>,
    pub base_url: Option<String>,
    pub proxy: Option<AiProxyConfig>,
    pub ssh_connection_id: Option<String>,
}

/// Proxy configuration for AI services
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiProxyConfig {
    pub proxy_type: AiProxyType,
    pub host: String,
    pub port: u16,
    pub username: Option<String>,
    pub password: Option<String>,
}

/// Proxy type for AI services
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum AiProxyType {
    Http,
    Https,
    Socks5,
}

// ============ Ollama Models ============

/// Ollama service status
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OllamaStatus {
    pub running: bool,
    pub version: Option<String>,
    pub host: String,
    pub port: u16,
}

/// Ollama model information
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OllamaModel {
    pub name: String,
    pub size: u64,
    pub digest: String,
    pub modified_at: String,
    #[serde(default)]
    pub details: Option<OllamaModelDetails>,
}

/// Ollama model details
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OllamaModelDetails {
    pub format: Option<String>,
    pub family: Option<String>,
    pub parameter_size: Option<String>,
    pub quantization_level: Option<String>,
}

/// Model status
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ModelStatus {
    Idle,
    Running,
    Downloading,
    Error,
}

/// Ollama connect request
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OllamaConnectRequest {
    pub host: String,
    pub port: u16,
    pub ssh_connection_id: Option<String>,
}

/// Pull model request
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PullModelRequest {
    pub model_name: String,
}

/// Pull model progress for Ollama
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OllamaPullProgress {
    pub status: String,
    pub digest: Option<String>,
    pub total: Option<u64>,
    pub completed: Option<u64>,
}

// ============ Ollama API Response Types ============

/// Ollama API version response
#[derive(Debug, Clone, Deserialize)]
pub struct OllamaVersionResponse {
    pub version: String,
}

/// Ollama API tags (models) response
#[derive(Debug, Clone, Deserialize)]
pub struct OllamaTagsResponse {
    pub models: Vec<OllamaApiModel>,
}

/// Ollama API model info
#[derive(Debug, Clone, Deserialize)]
pub struct OllamaApiModel {
    pub name: String,
    pub size: u64,
    pub digest: String,
    pub modified_at: String,
    pub details: Option<OllamaApiModelDetails>,
}

/// Ollama API model details
#[derive(Debug, Clone, Deserialize)]
pub struct OllamaApiModelDetails {
    pub format: Option<String>,
    pub family: Option<String>,
    pub parameter_size: Option<String>,
    pub quantization_level: Option<String>,
}

impl From<OllamaApiModel> for OllamaModel {
    fn from(api_model: OllamaApiModel) -> Self {
        Self {
            name: api_model.name,
            size: api_model.size,
            digest: api_model.digest,
            modified_at: api_model.modified_at,
            details: api_model.details.map(|d| OllamaModelDetails {
                format: d.format,
                family: d.family,
                parameter_size: d.parameter_size,
                quantization_level: d.quantization_level,
            }),
        }
    }
}

/// Ollama pull response (streaming)
#[derive(Debug, Clone, Deserialize)]
pub struct OllamaPullResponse {
    pub status: String,
    pub digest: Option<String>,
    pub total: Option<u64>,
    pub completed: Option<u64>,
}

/// Ollama running models response
#[derive(Debug, Clone, Deserialize)]
pub struct OllamaRunningModelsResponse {
    pub models: Option<Vec<OllamaRunningModel>>,
}

/// Ollama running model info
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OllamaRunningModel {
    pub name: String,
    pub model: String,
    pub size: u64,
    pub digest: String,
    pub expires_at: Option<String>,
    pub size_vram: Option<u64>,
}

// ============ GPU Monitoring Models ============

/// GPU information from nvidia-smi
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GpuInfo {
    pub index: i32,
    pub name: String,
    pub uuid: String,
    pub driver_version: String,
    pub cuda_version: Option<String>,
    pub architecture: Option<String>,
    pub compute_capability: Option<String>,
    pub memory_total: u64,       // MB
    pub memory_used: u64,        // MB
    pub memory_free: u64,        // MB
    pub utilization: f32,        // %
    pub memory_utilization: f32, // %
    pub temperature: f32,        // °C
    pub power_draw: Option<f32>, // W
    pub power_limit: Option<f32>, // W
    pub fan_speed: Option<f32>,  // %
}

/// GPU process information
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GpuProcess {
    pub gpu_uuid: String,
    pub pid: u32,
    pub process_name: String,
    pub used_memory: u64, // MB
}

/// GPU history record
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GpuHistory {
    pub timestamp: i64,
    pub gpu_index: i32,
    pub utilization: f32,
    pub memory_used: u64,
    pub temperature: f32,
}

/// GPU monitor configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GpuMonitorConfig {
    pub enabled: bool,
    pub interval_seconds: u32,            // 采集间隔
    pub retention_days: u32,              // 数据保留天数
    pub ssh_connection_id: Option<String>, // 远程监控
}

// ============ Cloud API Models ============

/// Cloud API provider types
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum CloudApiProvider {
    OpenAI,
    Claude,
    Qwen,
    Custom,
}

impl std::fmt::Display for CloudApiProvider {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            CloudApiProvider::OpenAI => write!(f, "OpenAI"),
            CloudApiProvider::Claude => write!(f, "Claude"),
            CloudApiProvider::Qwen => write!(f, "Qwen"),
            CloudApiProvider::Custom => write!(f, "Custom"),
        }
    }
}

/// Cloud API configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudApiConfig {
    pub id: String,
    pub name: String,
    pub provider: CloudApiProvider,
    pub api_key: Option<String>,
    pub base_url: Option<String>,
    pub organization: Option<String>,      // OpenAI organization
    pub default_model: Option<String>,
    pub proxy: Option<AiProxyConfig>,
    pub enabled: bool,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

/// Cloud API model information
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudApiModel {
    pub id: String,
    pub name: String,
    pub provider: CloudApiProvider,
    pub description: Option<String>,
    pub context_length: Option<u64>,
    pub pricing: Option<String>,
}

/// Cloud API test connection result
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudApiTestResult {
    pub success: bool,
    pub message: String,
    pub latency_ms: Option<u64>,
}

/// Cloud API save request (for creating/updating config)
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudApiSaveRequest {
    pub id: Option<String>,               // None for create, Some for update
    pub name: String,
    pub provider: CloudApiProvider,
    pub api_key: Option<String>,
    pub base_url: Option<String>,
    pub organization: Option<String>,
    pub default_model: Option<String>,
    pub proxy: Option<AiProxyConfig>,
    pub enabled: bool,
}

/// Cloud API test request
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudApiTestRequest {
    pub provider: CloudApiProvider,
    pub api_key: String,
    pub base_url: Option<String>,
    pub organization: Option<String>,
    pub proxy: Option<AiProxyConfig>,
}

// ============ TensorRT LLM Models ============

/// TensorRT-LLM model information
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TensorRTModel {
    pub id: String,
    pub name: String,
    pub version: String,
    pub engine_path: String,
    pub port: u16,
    pub status: ModelStatus,
    pub gpu_memory_usage: Option<u64>,
    pub created_at: String,
}

/// TensorRT-LLM model deployment configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TensorRTModelConfig {
    pub name: String,
    pub model_path: String,           // HuggingFace model path or local path
    pub max_batch_size: u32,
    pub max_input_len: u32,
    pub max_output_len: u32,
    pub quantization: Option<String>, // fp16, int8, int4
    pub tensor_parallel_size: u32,    // Multi-GPU parallelism
}

/// TensorRT-LLM service status
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TensorRTStatus {
    pub installed: bool,
    pub version: Option<String>,
    pub cuda_version: Option<String>,
    pub running_models: usize,
}

/// TensorRT connect request
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TensorRTConnectRequest {
    pub host: String,
    pub port: Option<u16>,
    pub ssh_connection_id: Option<String>,
}

// ============ MCP (Model Context Protocol) Models ============

/// MCP transport type
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum McpTransport {
    /// Stdio transport - runs command as subprocess
    Stdio {
        command: String,
        #[serde(default)]
        args: Vec<String>,
    },
    /// SSE transport - connects to HTTP endpoint
    Sse {
        url: String,
    },
}

/// MCP server configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpServerConfig {
    pub name: String,
    pub description: Option<String>,
    pub transport: McpTransport,
    #[serde(default)]
    pub tools: Vec<McpTool>,
}

/// MCP server status
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum McpServerStatus {
    Running,
    Stopped,
    Error(String),
}

/// MCP server information
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpServerInfo {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub transport: McpTransport,
    pub status: McpServerStatus,
    pub tool_count: usize,
    pub created_at: String,
}

/// MCP tool definition
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpTool {
    pub name: String,
    pub description: String,
    pub input_schema: serde_json::Value,
}

/// MCP server create request
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpServerCreateRequest {
    pub name: String,
    pub description: Option<String>,
    pub transport: McpTransport,
    #[serde(default)]
    pub tools: Vec<McpTool>,
}

/// MCP tool bind request
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpToolBindRequest {
    pub server_id: String,
    pub tool: McpTool,
}

/// MCP tool unbind request
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpToolUnbindRequest {
    pub server_id: String,
    pub tool_name: String,
}

// ============ OpenWebUI Models ============

/// OpenWebUI source type
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum OpenWebUISource {
    /// Local installation (e.g., pip install)
    Local,
    /// Docker container
    Docker,
    /// Not found
    NotFound,
}

/// OpenWebUI status information
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenWebUIStatus {
    pub available: bool,
    pub url: Option<String>,
    pub version: Option<String>,
    pub source: OpenWebUISource,
}

// ============ Remote AI Management Models ============

/// Remote AI environment information
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteAiEnvironment {
    pub ollama_installed: bool,
    pub ollama_version: Option<String>,
    pub tensorrt_installed: bool,
    pub nvidia_gpu_detected: bool,
    pub gpu_count: usize,
}

/// Remote AI detection request
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteAiDetectRequest {
    pub ssh_connection_id: String,
}

/// Remote Ollama command request
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteOllamaCommandRequest {
    pub ssh_connection_id: String,
    pub command: String,
}

/// Remote model sync request
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteModelSyncRequest {
    pub ssh_connection_id: String,
}
