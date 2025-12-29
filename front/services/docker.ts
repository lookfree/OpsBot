/**
 * Docker service for container and image management
 */

import { invoke } from '@tauri-apps/api/core'

// Docker connection types
export type DockerConnectionType = 'local' | 'ssh'

// Connect request
export interface DockerConnectRequest {
  connectionId: string
  connectionType: DockerConnectionType
  sshConnectionId?: string // Required for SSH type
}

// Test result
export interface DockerTestResult {
  success: boolean
  version?: string
  apiVersion?: string
  error?: string
}

// Port mapping
export interface PortMapping {
  containerPort: number
  hostPort?: number
  protocol: string
  hostIp?: string
}

// Container info
export interface ContainerInfo {
  id: string
  name: string
  image: string
  status: string
  state: string
  created: number
  ports: PortMapping[]
}

// Image info
export interface ImageInfo {
  id: string
  tags: string[]
  size: number
  created: number
}

// Docker system info (Overview page)
export interface DockerInfo {
  version: string
  apiVersion: string
  os: string
  arch: string
  kernelVersion: string
  rootDir: string
  storageDriver: string
  containersRunning: number
  containersPaused: number
  containersStopped: number
  images: number
  memoryTotal: number
  cpus: number
}

// Docker stats (Overview page)
export interface DockerStats {
  containersRunning: number
  containersStopped: number
  containersTotal: number
  imagesCount: number
  imagesSize: number
}

// Docker settings (Settings page)
export interface DockerSettings {
  registryMirrors: string[]
  storagePath: string
  socketPath: string
  cgroupDriver: string
  liveRestore: boolean
  ipv6Enabled: boolean
}

// ========== Network management types (Phase 2) ==========

// Network info
export interface NetworkInfo {
  id: string
  name: string
  driver: string
  scope: string
  created: string
  ipamSubnet?: string
  ipamGateway?: string
  containersCount: number
  internal: boolean
}

// Container in network
export interface NetworkContainer {
  containerId: string
  name: string
  ipv4Address?: string
  ipv6Address?: string
  macAddress?: string
}

// Network detail
export interface NetworkDetail {
  info: NetworkInfo
  containers: NetworkContainer[]
  options: Record<string, string>
  labels: Record<string, string>
}

// Create network request
export interface CreateNetworkRequest {
  name: string
  driver?: string
  subnet?: string
  gateway?: string
  internal?: boolean
  labels?: Record<string, string>
}

// ========== Volume management types (Phase 2) ==========

// Volume info
export interface VolumeInfo {
  name: string
  driver: string
  mountpoint: string
  created: string
  size?: number
  scope: string
  labels: Record<string, string>
}

// Create volume request
export interface CreateVolumeRequest {
  name: string
  driver?: string
  driverOpts?: Record<string, string>
  labels?: Record<string, string>
}

// Prune result
export interface PruneResult {
  deletedCount: number
  spaceReclaimed: number
}

/**
 * Connect to Docker daemon
 */
export async function dockerConnect(request: DockerConnectRequest): Promise<DockerTestResult> {
  return invoke<DockerTestResult>('docker_connect', { request })
}

/**
 * Test Docker connection
 */
export async function dockerTestConnection(request: DockerConnectRequest): Promise<DockerTestResult> {
  return invoke<DockerTestResult>('docker_test_connection', { request })
}

/**
 * Disconnect from Docker
 */
export async function dockerDisconnect(connectionId: string): Promise<void> {
  return invoke('docker_disconnect', { connectionId })
}

/**
 * Check if Docker connection is active
 */
export async function dockerIsConnected(connectionId: string): Promise<boolean> {
  return invoke<boolean>('docker_is_connected', { connectionId })
}

/**
 * List containers
 */
export async function dockerListContainers(connectionId: string, all: boolean = false): Promise<ContainerInfo[]> {
  return invoke<ContainerInfo[]>('docker_list_containers', { connectionId, all })
}

/**
 * Start a container
 */
export async function dockerStartContainer(connectionId: string, containerId: string): Promise<void> {
  return invoke('docker_start_container', { connectionId, containerId })
}

/**
 * Stop a container
 */
export async function dockerStopContainer(connectionId: string, containerId: string): Promise<void> {
  return invoke('docker_stop_container', { connectionId, containerId })
}

/**
 * Restart a container
 */
export async function dockerRestartContainer(connectionId: string, containerId: string): Promise<void> {
  return invoke('docker_restart_container', { connectionId, containerId })
}

/**
 * Remove a container
 */
export async function dockerRemoveContainer(
  connectionId: string,
  containerId: string,
  force: boolean = false
): Promise<void> {
  return invoke('docker_remove_container', { connectionId, containerId, force })
}

/**
 * Get container logs
 */
export async function dockerGetLogs(
  connectionId: string,
  containerId: string,
  tail?: number
): Promise<string> {
  return invoke<string>('docker_get_logs', { connectionId, containerId, tail })
}

/**
 * List images
 */
export async function dockerListImages(connectionId: string): Promise<ImageInfo[]> {
  return invoke<ImageInfo[]>('docker_list_images', { connectionId })
}

/**
 * Pull an image
 */
export async function dockerPullImage(connectionId: string, image: string): Promise<void> {
  return invoke('docker_pull_image', { connectionId, image })
}

/**
 * Remove an image
 */
export async function dockerRemoveImage(
  connectionId: string,
  imageId: string,
  force: boolean = false
): Promise<void> {
  return invoke('docker_remove_image', { connectionId, imageId, force })
}

// ========== Overview page APIs ==========

/**
 * Get Docker system info
 */
export async function dockerGetInfo(connectionId: string): Promise<DockerInfo> {
  return invoke<DockerInfo>('docker_get_info', { connectionId })
}

/**
 * Get Docker stats (container/image counts)
 */
export async function dockerGetStats(connectionId: string): Promise<DockerStats> {
  return invoke<DockerStats>('docker_get_stats', { connectionId })
}

// ========== Settings page APIs ==========

/**
 * Get Docker daemon settings
 */
export async function dockerGetSettings(connectionId: string): Promise<DockerSettings> {
  return invoke<DockerSettings>('docker_get_settings', { connectionId })
}

/**
 * Update registry mirrors
 */
export async function dockerUpdateRegistryMirrors(
  connectionId: string,
  mirrors: string[]
): Promise<void> {
  return invoke('docker_update_registry_mirrors', { connectionId, mirrors })
}

/**
 * Update insecure registries
 */
export async function dockerUpdateInsecureRegistries(
  connectionId: string,
  registries: string[]
): Promise<void> {
  return invoke('docker_update_insecure_registries', { connectionId, registries })
}

/**
 * Stop Docker daemon
 */
export async function dockerStopDaemon(connectionId: string): Promise<void> {
  return invoke('docker_stop_daemon', { connectionId })
}

/**
 * Restart Docker daemon
 */
export async function dockerRestartDaemon(connectionId: string): Promise<void> {
  return invoke('docker_restart_daemon', { connectionId })
}

/**
 * Format bytes to human readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
}

/**
 * Format timestamp to readable date
 */
export function formatTimestamp(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleString()
}

// ========== Network management APIs (Phase 2) ==========

/**
 * List Docker networks
 */
export async function dockerListNetworks(connectionId: string): Promise<NetworkInfo[]> {
  return invoke<NetworkInfo[]>('docker_list_networks', { connectionId })
}

/**
 * Get network details
 */
export async function dockerInspectNetwork(connectionId: string, networkId: string): Promise<NetworkDetail> {
  return invoke<NetworkDetail>('docker_inspect_network', { connectionId, networkId })
}

/**
 * Create a Docker network
 */
export async function dockerCreateNetwork(
  connectionId: string,
  config: CreateNetworkRequest
): Promise<string> {
  return invoke<string>('docker_create_network', { connectionId, config })
}

/**
 * Remove a Docker network
 */
export async function dockerRemoveNetwork(connectionId: string, networkId: string): Promise<void> {
  return invoke('docker_remove_network', { connectionId, networkId })
}

/**
 * Connect a container to a network
 */
export async function dockerConnectContainerToNetwork(
  connectionId: string,
  networkId: string,
  containerId: string
): Promise<void> {
  return invoke('docker_connect_container_to_network', { connectionId, networkId, containerId })
}

/**
 * Disconnect a container from a network
 */
export async function dockerDisconnectContainerFromNetwork(
  connectionId: string,
  networkId: string,
  containerId: string
): Promise<void> {
  return invoke('docker_disconnect_container_from_network', { connectionId, networkId, containerId })
}

/**
 * Prune unused networks
 */
export async function dockerPruneNetworks(connectionId: string): Promise<PruneResult> {
  return invoke<PruneResult>('docker_prune_networks', { connectionId })
}

// ========== Volume management APIs (Phase 2) ==========

/**
 * List Docker volumes
 */
export async function dockerListVolumes(connectionId: string): Promise<VolumeInfo[]> {
  return invoke<VolumeInfo[]>('docker_list_volumes', { connectionId })
}

/**
 * Create a Docker volume
 */
export async function dockerCreateVolume(
  connectionId: string,
  config: CreateVolumeRequest
): Promise<string> {
  return invoke<string>('docker_create_volume', { connectionId, config })
}

/**
 * Remove a Docker volume
 */
export async function dockerRemoveVolume(
  connectionId: string,
  volumeName: string,
  force: boolean = false
): Promise<void> {
  return invoke('docker_remove_volume', { connectionId, volumeName, force })
}

/**
 * Prune unused volumes
 */
export async function dockerPruneVolumes(connectionId: string): Promise<PruneResult> {
  return invoke<PruneResult>('docker_prune_volumes', { connectionId })
}

// ========== Container stats APIs (Phase 2) ==========

// Container resource stats
export interface ContainerStats {
  containerId: string
  name: string
  cpuPercent: number
  memoryUsage: number
  memoryLimit: number
  memoryPercent: number
  networkRx: number
  networkTx: number
  blockRead: number
  blockWrite: number
  timestamp: number
}

/**
 * Get container resource stats
 */
export async function dockerGetContainerStats(
  connectionId: string,
  containerId: string
): Promise<ContainerStats> {
  return invoke<ContainerStats>('docker_get_container_stats', { connectionId, containerId })
}

// ========== Container exec APIs (Phase 2) ==========

/**
 * Execute a command in a container
 */
export async function dockerExecCommand(
  connectionId: string,
  containerId: string,
  cmd: string[]
): Promise<string> {
  return invoke<string>('docker_exec_command', { connectionId, containerId, cmd })
}

/**
 * Start an interactive exec session in a container
 * Returns exec ID for subsequent operations
 */
export async function dockerExecStart(
  connectionId: string,
  containerId: string,
  cmd: string[],
  cols: number,
  rows: number
): Promise<string> {
  return invoke<string>('docker_exec_start', { connectionId, containerId, cmd, cols, rows })
}

/**
 * Send data to an interactive exec session
 */
export async function dockerExecSendData(
  connectionId: string,
  execId: string,
  data: number[]
): Promise<void> {
  return invoke('docker_exec_send_data', { connectionId, execId, data })
}

/**
 * Resize an interactive exec session
 */
export async function dockerExecResize(
  connectionId: string,
  execId: string,
  cols: number,
  rows: number
): Promise<void> {
  return invoke('docker_exec_resize', { connectionId, execId, cols, rows })
}

/**
 * Close an interactive exec session
 */
export async function dockerExecClose(
  connectionId: string,
  execId: string
): Promise<void> {
  return invoke('docker_exec_close', { connectionId, execId })
}

// ========== Docker Compose APIs (Phase 2) ==========

// Compose project source
export type ComposeSource = 'Local' | 'AppStore' | 'External'

// Compose project info
export interface ComposeProject {
  name: string
  source: ComposeSource
  path: string
  createdAt: number
  runningCount: number
  totalCount: number
  status: string
}

// Compose container info
export interface ComposeContainer {
  id: string
  service: string
  name: string
  image: string
  state: string
  status: string
  cpuPercent?: number
  memoryPercent?: number
  ports: PortMapping[]
}

// Create compose request
export interface CreateComposeRequest {
  name: string
  content: string
  path?: string
}

// Update compose request
export interface UpdateComposeRequest {
  name: string
  content: string
}

/**
 * List all Compose projects
 */
export async function dockerListComposeProjects(connectionId: string): Promise<ComposeProject[]> {
  return invoke<ComposeProject[]>('docker_list_compose_projects', { connectionId })
}

/**
 * Get containers for a Compose project
 */
export async function dockerGetComposeContainers(
  connectionId: string,
  projectName: string
): Promise<ComposeContainer[]> {
  return invoke<ComposeContainer[]>('docker_get_compose_containers', { connectionId, projectName })
}

/**
 * Get Compose file content
 */
export async function dockerGetComposeContent(
  connectionId: string,
  projectName: string
): Promise<string> {
  return invoke<string>('docker_get_compose_content', { connectionId, projectName })
}

/**
 * Create a new Compose project
 */
export async function dockerCreateComposeProject(
  connectionId: string,
  request: CreateComposeRequest
): Promise<void> {
  return invoke('docker_create_compose_project', { connectionId, request })
}

/**
 * Update Compose file content
 */
export async function dockerUpdateComposeContent(
  connectionId: string,
  request: UpdateComposeRequest
): Promise<void> {
  return invoke('docker_update_compose_content', { connectionId, request })
}

/**
 * Start a Compose project
 */
export async function dockerStartCompose(
  connectionId: string,
  projectName: string
): Promise<void> {
  return invoke('docker_start_compose', { connectionId, projectName })
}

/**
 * Stop a Compose project
 */
export async function dockerStopCompose(
  connectionId: string,
  projectName: string
): Promise<void> {
  return invoke('docker_stop_compose', { connectionId, projectName })
}

/**
 * Restart a Compose project
 */
export async function dockerRestartCompose(
  connectionId: string,
  projectName: string
): Promise<void> {
  return invoke('docker_restart_compose', { connectionId, projectName })
}

/**
 * Remove a Compose project
 */
export async function dockerRemoveCompose(
  connectionId: string,
  projectName: string,
  removeVolumes: boolean = false
): Promise<void> {
  return invoke('docker_remove_compose', { connectionId, projectName, removeVolumes })
}

/**
 * Get Compose project logs
 */
export async function dockerGetComposeLogs(
  connectionId: string,
  projectName: string,
  tail?: number,
  service?: string
): Promise<string> {
  return invoke<string>('docker_get_compose_logs', { connectionId, projectName, tail, service })
}

/**
 * Get Compose project directory path
 */
export async function dockerGetComposePath(
  connectionId: string,
  projectName: string
): Promise<string> {
  return invoke<string>('docker_get_compose_path', { connectionId, projectName })
}

// ========== Registry management types (Phase 3) ==========

// Registry type
export type RegistryType = 'dockerHub' | 'harbor' | 'nexus' | 'custom'

// Registry status
export type RegistryStatus =
  | 'Connected'
  | 'Disconnected'
  | 'Syncing'
  | { Error: string }

// Registry info
export interface RegistryInfo {
  id: string
  name: string
  registryType: RegistryType
  url: string
  username?: string
  password?: string
  downloadLimit?: number
  skipTlsVerify: boolean
  status: RegistryStatus
  lastSyncAt?: number
  createdAt: number
  updatedAt: number
}

// Create registry request
export interface CreateRegistryRequest {
  name: string
  registryType: RegistryType
  url: string
  username?: string
  password?: string
  downloadLimit?: number
  skipTlsVerify?: boolean
}

// Update registry request
export interface UpdateRegistryRequest {
  registryId: string
  name?: string
  registryType?: RegistryType
  url?: string
  username?: string
  password?: string
  downloadLimit?: number
  skipTlsVerify?: boolean
}

// Registry image
export interface RegistryImage {
  name: string
  tags: string[]
  size?: number
  lastUpdated?: number
}

// ========== Registry management APIs (Phase 3) ==========

/**
 * List configured registries
 */
export async function dockerListRegistries(connectionId: string): Promise<RegistryInfo[]> {
  return invoke<RegistryInfo[]>('docker_list_registries', { connectionId })
}

/**
 * Create a new registry configuration
 */
export async function dockerCreateRegistry(
  connectionId: string,
  request: CreateRegistryRequest
): Promise<RegistryInfo> {
  return invoke<RegistryInfo>('docker_create_registry', { connectionId, request })
}

/**
 * Update an existing registry configuration
 */
export async function dockerUpdateRegistry(
  connectionId: string,
  request: UpdateRegistryRequest
): Promise<RegistryInfo> {
  return invoke<RegistryInfo>('docker_update_registry', { connectionId, request })
}

/**
 * Delete a registry configuration
 */
export async function dockerDeleteRegistry(
  connectionId: string,
  registryId: string
): Promise<void> {
  return invoke('docker_delete_registry', { connectionId, registryId })
}

/**
 * Test registry connection
 */
export async function dockerTestRegistry(
  connectionId: string,
  registryId: string
): Promise<boolean> {
  return invoke<boolean>('docker_test_registry', { connectionId, registryId })
}

/**
 * Test registry connection directly without saving
 */
export async function dockerTestRegistryDirect(
  url: string,
  username?: string,
  password?: string,
  skipTlsVerify?: boolean
): Promise<string> {
  return invoke<string>('docker_test_registry_direct', {
    url,
    username: username || null,
    password: password || null,
    skipTlsVerify: skipTlsVerify || false
  })
}

/**
 * Search for images in a registry
 */
export async function dockerSearchRegistryImages(
  connectionId: string,
  registryId: string,
  query?: string
): Promise<RegistryImage[]> {
  return invoke<RegistryImage[]>('docker_search_registry_images', { connectionId, registryId, query })
}

/**
 * Pull images from a registry
 */
export async function dockerPullFromRegistry(
  connectionId: string,
  registryId: string,
  images: string[]
): Promise<void> {
  return invoke('docker_pull_from_registry', { connectionId, registryId, images })
}

/**
 * Get registry status display text
 */
export function getRegistryStatusText(status: RegistryStatus): string {
  const statusStr = typeof status === 'string' ? status.toLowerCase() : ''
  if (statusStr === 'connected') return 'Connected'
  if (statusStr === 'disconnected') return 'Disconnected'
  if (statusStr === 'syncing') return 'Syncing'
  if (typeof status === 'object' && 'error' in status) return `Error: ${status.error}`
  return 'Unknown'
}

/**
 * Get registry status color class
 */
export function getRegistryStatusColor(status: RegistryStatus): string {
  const statusStr = typeof status === 'string' ? status.toLowerCase() : ''
  if (statusStr === 'connected') return 'text-status-success'
  if (statusStr === 'disconnected') return 'text-status-warning'
  if (statusStr === 'syncing') return 'text-accent-primary'
  if (typeof status === 'object' && 'error' in status) return 'text-status-error'
  return 'text-dark-text-secondary'
}
