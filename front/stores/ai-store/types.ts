/**
 * AI Store Types
 */

import type {
  AiEngineType,
  OllamaStatus,
  OllamaModel,
  OllamaRunningModel,
  GpuInfo,
  GpuProcess,
  GpuHistory,
  HistoryInterval,
  CloudApiConfig,
  CloudApiModel,
  CloudApiProvider,
  CloudApiTestResult,
  TensorRTStatus,
  TensorRTModel,
  TensorRTModelConfig,
  McpServerInfo,
  McpServerConfig,
  McpTool,
  RemoteAiEnvironment,
} from '@/types'

// Ollama State
export interface OllamaState {
  ollamaConnectionId: string | null
  ollamaStatus: OllamaStatus | null
  ollamaModels: OllamaModel[]
  ollamaRunningModels: OllamaRunningModel[]
  isConnecting: boolean
  isLoadingModels: boolean
  isPullingModel: boolean
  pullingModelName: string | null
  isControllingService: boolean
  error: string | null
}

// Ollama Actions
export interface OllamaActions {
  connectOllama: (host: string, port: number) => Promise<void>
  disconnectOllama: () => Promise<void>
  testOllamaConnection: (host: string, port: number) => Promise<OllamaStatus>
  refreshOllamaStatus: () => Promise<void>
  fetchOllamaModels: () => Promise<void>
  pullOllamaModel: (modelName: string) => Promise<void>
  deleteOllamaModel: (modelName: string) => Promise<void>
  fetchRunningModels: () => Promise<void>
  startOllamaService: () => Promise<string>
  stopOllamaService: () => Promise<string>
  restartOllamaService: () => Promise<string>
  checkOllamaServiceRunning: () => Promise<boolean>
}

// Remote Mode State
export interface RemoteState {
  isRemoteMode: boolean
  remoteSshConnectionId: string | null
  remoteEnvironment: RemoteAiEnvironment | null
  remoteModels: OllamaModel[]
  isRemoteDetecting: boolean
  isRemoteSyncing: boolean
  remoteError: string | null
}

// Remote Mode Actions
export interface RemoteActions {
  setRemoteMode: (isRemote: boolean) => void
  setRemoteSshConnection: (connectionId: string | null) => void
  detectRemoteEnvironment: (sshConnectionId: string) => Promise<RemoteAiEnvironment>
  executeRemoteOllamaCommand: (command: string) => Promise<string>
  syncRemoteModels: () => Promise<void>
  clearRemoteError: () => void
}

// GPU State
export interface GpuState {
  // Local GPU state
  gpuDetected: boolean
  gpuInfo: GpuInfo[]
  gpuProcesses: GpuProcess[]
  gpuHistory: GpuHistory[]
  isLoadingGpu: boolean
  gpuError: string | null
  // Remote GPU state
  isGpuRemoteMode: boolean
  gpuRemoteSshConnectionId: string | null
  remoteGpuDetected: boolean
  remoteGpuInfo: GpuInfo[]
  remoteGpuProcesses: GpuProcess[]
  isLoadingRemoteGpu: boolean
  remoteGpuError: string | null
}

// GPU Actions
export interface GpuActions {
  // Local GPU actions
  detectGpu: () => Promise<void>
  fetchGpuInfo: () => Promise<void>
  fetchGpuProcesses: () => Promise<void>
  fetchGpuHistory: (gpuIndex: number, startTime: number, endTime: number, interval: HistoryInterval) => Promise<void>
  // Remote GPU actions
  setGpuRemoteMode: (isRemote: boolean) => void
  setGpuRemoteSshConnection: (connectionId: string | null) => void
  detectRemoteGpu: (sshConnectionId: string) => Promise<void>
  fetchRemoteGpuInfo: (sshConnectionId: string) => Promise<void>
  fetchRemoteGpuProcesses: (sshConnectionId: string) => Promise<void>
  clearRemoteGpuError: () => void
}

// Cloud API State
export interface CloudApiState {
  cloudApiConfigs: CloudApiConfig[]
  cloudApiModels: CloudApiModel[]
  cloudApiError: string | null
  isLoadingCloudApi: boolean
  isTestingCloudApi: boolean
}

// Cloud API Actions
export interface CloudApiActions {
  testCloudApiConnection: (
    provider: CloudApiProvider,
    apiKey: string,
    baseUrl?: string,
    organization?: string
  ) => Promise<CloudApiTestResult>
  fetchCloudApiModels: (
    provider: CloudApiProvider,
    apiKey: string,
    baseUrl?: string,
    organization?: string
  ) => Promise<void>
  fetchCloudApiDefaultModels: (provider: CloudApiProvider) => Promise<void>
  addCloudApiConfig: (config: Omit<CloudApiConfig, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>
  updateCloudApiConfig: (id: string, config: Partial<CloudApiConfig>) => Promise<void>
  deleteCloudApiConfig: (id: string) => Promise<void>
}

// TensorRT State
export interface TensorrtState {
  tensorrtConnectionId: string | null
  tensorrtStatus: TensorRTStatus | null
  tensorrtModels: TensorRTModel[]
  isTensorrtConnecting: boolean
  isTensorrtLoadingModels: boolean
  isTensorrtDeploying: boolean
  tensorrtError: string | null
}

// TensorRT Actions
export interface TensorrtActions {
  connectTensorrt: (host: string, port?: number) => Promise<void>
  disconnectTensorrt: () => Promise<void>
  testTensorrtConnection: (host: string, port?: number) => Promise<TensorRTStatus>
  fetchTensorrtModels: (connectionId: string) => Promise<void>
  deployTensorrtModel: (connectionId: string, config: TensorRTModelConfig) => Promise<void>
  startTensorrtModel: (connectionId: string, modelId: string) => Promise<void>
  stopTensorrtModel: (connectionId: string, modelId: string) => Promise<void>
  clearTensorrtError: () => void
}

// MCP State
export interface McpState {
  mcpServers: McpServerInfo[]
  mcpServerTools: Record<string, McpTool[]>
  isMcpLoading: boolean
  isMcpCreating: boolean
  mcpError: string | null
}

// MCP Actions
export interface McpActions {
  fetchMcpServers: () => Promise<void>
  createMcpServer: (config: McpServerConfig) => Promise<string>
  deleteMcpServer: (serverId: string) => Promise<void>
  startMcpServer: (serverId: string) => Promise<void>
  stopMcpServer: (serverId: string) => Promise<void>
  updateMcpServer: (serverId: string, config: McpServerConfig) => Promise<void>
  fetchMcpServerTools: (serverId: string) => Promise<void>
  bindMcpTool: (serverId: string, tool: McpTool) => Promise<void>
  unbindMcpTool: (serverId: string, toolName: string) => Promise<void>
  clearMcpError: () => void
}

// Core State
export interface CoreState {
  activeEngine: AiEngineType
}

// Core Actions
export interface CoreActions {
  setActiveEngine: (engine: AiEngineType) => void
  clearError: () => void
}

// Combined AI State
export interface AiState extends
  CoreState,
  OllamaState,
  RemoteState,
  GpuState,
  CloudApiState,
  TensorrtState,
  McpState,
  CoreActions,
  OllamaActions,
  RemoteActions,
  GpuActions,
  CloudApiActions,
  TensorrtActions,
  McpActions {}

// Slice creator type
export type StateCreator<T> = (
  set: (partial: Partial<AiState> | ((state: AiState) => Partial<AiState>)) => void,
  get: () => AiState
) => T
