/**
 * AI 模块类型定义
 */

// ============ AI 连接类型 ============

/** AI 服务提供商类型 */
export type AiConnectionType = 'ollama' | 'tensorrt' | 'openai' | 'claude' | 'qwen' | 'custom'

/** 代理类型 */
export type AiProxyType = 'http' | 'https' | 'socks5'

/** AI 代理配置 */
export interface AiProxyConfig {
  proxyType: AiProxyType
  host: string
  port: number
  username?: string
  password?: string
}

/** AI 连接配置 */
export interface AiConnection {
  id: string
  name: string
  connectionType: AiConnectionType
  host?: string
  port?: number
  apiKey?: string
  baseUrl?: string
  proxy?: AiProxyConfig
  sshConnectionId?: string
}

// ============ Ollama 类型 ============

/** Ollama 服务状态 */
export interface OllamaStatus {
  running: boolean
  version?: string
  host: string
  port: number
}

/** Ollama 模型详情 */
export interface OllamaModelDetails {
  format?: string
  family?: string
  parameterSize?: string
  quantizationLevel?: string
}

/** Ollama 模型信息 */
export interface OllamaModel {
  name: string
  size: number
  digest: string
  modifiedAt: string
  details?: OllamaModelDetails
}

/** 模型状态 */
export type ModelStatus = 'idle' | 'running' | 'downloading' | 'error'

/** Ollama 连接请求 */
export interface OllamaConnectRequest {
  host: string
  port: number
  sshConnectionId?: string
}

/** Ollama 运行中的模型 */
export interface OllamaRunningModel {
  name: string
  model: string
  size: number
  digest: string
  expiresAt?: string
  sizeVram?: number
}

/** 拉取模型进度 */
export interface OllamaPullProgress {
  status: string
  digest?: string
  total?: number
  completed?: number
}

// ============ GPU 监控类型 ============

/** GPU 信息 */
export interface GpuInfo {
  index: number
  name: string
  uuid: string
  driverVersion: string
  cudaVersion?: string
  architecture?: string
  computeCapability?: string
  memoryTotal: number    // MB
  memoryUsed: number     // MB
  memoryFree: number     // MB
  utilization: number    // %
  memoryUtilization: number // %
  temperature: number    // °C
  powerDraw?: number     // W
  powerLimit?: number    // W
  fanSpeed?: number      // %
}

/** GPU 进程信息 */
export interface GpuProcess {
  gpuUuid: string
  pid: number
  processName: string
  usedMemory: number     // MB
}

/** GPU 历史记录 */
export interface GpuHistory {
  timestamp: number
  gpuIndex: number
  utilization: number
  memoryUsed: number
  temperature: number
}

/** GPU 监控配置 */
export interface GpuMonitorConfig {
  enabled: boolean
  intervalSeconds: number
  retentionDays: number
  sshConnectionId?: string
}

/** 历史记录时间间隔 */
export type HistoryInterval = 'minute' | 'fiveminutes' | 'hour' | 'day'

// ============ AI 引擎标签类型 ============

/** AI 引擎类型 */
export type AiEngineType = 'ollama' | 'tensorrt' | 'cloudApi' | 'gpu' | 'mcp'

/** AI 模块状态 */
export interface AiModuleState {
  activeEngine: AiEngineType
  ollamaConnected: boolean
  ollamaConnectionId?: string
}

// ============ 云端 API 类型 ============

/** 云端 API 提供商 */
export type CloudApiProvider = 'openai' | 'claude' | 'qwen' | 'custom'

/** 云端 API 配置 */
export interface CloudApiConfig {
  id: string
  name: string
  provider: CloudApiProvider
  apiKey?: string
  baseUrl?: string
  organization?: string      // OpenAI organization
  defaultModel?: string
  proxy?: AiProxyConfig
  enabled: boolean
  createdAt?: string
  updatedAt?: string
}

/** 云端 API 模型信息 */
export interface CloudApiModel {
  id: string
  name: string
  provider: CloudApiProvider
  description?: string
  contextLength?: number
  pricing?: string
}

/** 云端 API 连接测试结果 */
export interface CloudApiTestResult {
  success: boolean
  message: string
  latencyMs?: number
}

/** 云端 API 保存请求 */
export interface CloudApiSaveRequest {
  id?: string               // undefined 表示创建，有值表示更新
  name: string
  provider: CloudApiProvider
  apiKey?: string
  baseUrl?: string
  organization?: string
  defaultModel?: string
  proxy?: AiProxyConfig
  enabled: boolean
}

/** 云端 API 测试请求 */
export interface CloudApiTestRequest {
  provider: CloudApiProvider
  apiKey: string
  baseUrl?: string
  organization?: string
  proxy?: AiProxyConfig
}

// ============ TensorRT LLM 类型 ============

/** TensorRT 模型信息 */
export interface TensorRTModel {
  id: string
  name: string
  version: string
  enginePath: string
  port: number
  status: ModelStatus
  gpuMemoryUsage?: number
  createdAt: string
}

/** TensorRT 模型部署配置 */
export interface TensorRTModelConfig {
  name: string
  modelPath: string           // HuggingFace 模型路径或本地路径
  maxBatchSize: number
  maxInputLen: number
  maxOutputLen: number
  quantization?: string       // fp16, int8, int4
  tensorParallelSize: number  // 多 GPU 并行
}

/** TensorRT 服务状态 */
export interface TensorRTStatus {
  installed: boolean
  version?: string
  cudaVersion?: string
  runningModels: number
}

/** TensorRT 连接请求 */
export interface TensorRTConnectRequest {
  host: string
  port?: number
  sshConnectionId?: string
}

// ============ MCP (Model Context Protocol) 类型 ============

/** MCP 传输类型 */
export type McpTransportType = 'stdio' | 'sse'

/** MCP Stdio 传输配置 */
export interface McpStdioTransport {
  type: 'stdio'
  command: string
  args: string[]
}

/** MCP SSE 传输配置 */
export interface McpSseTransport {
  type: 'sse'
  url: string
}

/** MCP 传输配置 */
export type McpTransport = McpStdioTransport | McpSseTransport

/** MCP Server 状态 */
export type McpServerStatus = 'running' | 'stopped' | { error: string }

/** MCP 工具定义 */
export interface McpTool {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

/** MCP Server 配置 */
export interface McpServerConfig {
  name: string
  description?: string
  transport: McpTransport
  tools: McpTool[]
}

/** MCP Server 信息 */
export interface McpServerInfo {
  id: string
  name: string
  description?: string
  transport: McpTransport
  status: McpServerStatus
  toolCount: number
  createdAt: string
}

/** MCP Server 创建请求 */
export interface McpServerCreateRequest {
  name: string
  description?: string
  transport: McpTransport
  tools?: McpTool[]
}

/** MCP 工具绑定请求 */
export interface McpToolBindRequest {
  serverId: string
  tool: McpTool
}

/** MCP 工具解绑请求 */
export interface McpToolUnbindRequest {
  serverId: string
  toolName: string
}

// ============ OpenWebUI 类型 ============

/** OpenWebUI 来源类型 */
export type OpenWebUISource = 'local' | 'docker' | 'notfound'

/** OpenWebUI 状态信息 */
export interface OpenWebUIStatus {
  available: boolean
  url?: string
  version?: string
  source: OpenWebUISource
}

// ============ 远程 AI 管理类型 ============

/** 远程 AI 环境信息 */
export interface RemoteAiEnvironment {
  ollamaInstalled: boolean
  ollamaVersion?: string
  tensorrtInstalled: boolean
  nvidiaGpuDetected: boolean
  gpuCount: number
}

// ============ 工具函数 ============

/** 格式化文件大小 */
export function formatModelSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

/** 格式化模型修改时间 */
export function formatModelTime(isoTime: string): string {
  const date = new Date(isoTime)
  return date.toLocaleString()
}
