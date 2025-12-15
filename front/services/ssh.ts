/**
 * SSH Service
 *
 * Frontend service for SSH operations via Tauri.
 */

import { invoke } from '@tauri-apps/api/core'
import { listen, UnlistenFn } from '@tauri-apps/api/event'

export interface JumpHostConfig {
  host: string
  port: number
  username: string
  authType: 'password' | 'key'
  password?: string
  privateKey?: string
  passphrase?: string
}

export interface SshConnectRequest {
  connectionId: string
  host: string
  port: number
  username: string
  authType: 'password' | 'key'
  password?: string
  privateKey?: string
  passphrase?: string
  jumpHost?: JumpHostConfig
  terminalSize?: {
    cols: number
    rows: number
  }
}

export interface SshSessionInfo {
  sessionId: string
  connectionId: string
  status: 'connecting' | 'connected' | 'disconnected' | 'error'
  connectedAt?: string
  host: string
  username: string
}

/**
 * Connect to SSH server
 */
export async function sshConnect(request: SshConnectRequest): Promise<string> {
  return await invoke<string>('ssh_connect', { request })
}

/**
 * Send data to SSH session
 */
export async function sshSendData(sessionId: string, data: string): Promise<void> {
  await invoke('ssh_send_data', { sessionId, data })
}

/**
 * Resize SSH terminal
 */
export async function sshResize(
  sessionId: string,
  cols: number,
  rows: number
): Promise<void> {
  await invoke('ssh_resize', { sessionId, cols, rows })
}

/**
 * Disconnect SSH session
 */
export async function sshDisconnect(sessionId: string): Promise<void> {
  await invoke('ssh_disconnect', { sessionId })
}

/**
 * Reconnect SSH session
 */
export async function sshReconnect(sessionId: string): Promise<string> {
  return await invoke<string>('ssh_reconnect', { sessionId })
}

/**
 * Get SSH session info
 */
export async function sshGetSession(
  sessionId: string
): Promise<SshSessionInfo | null> {
  return await invoke<SshSessionInfo | null>('ssh_get_session', { sessionId })
}

/**
 * Get all SSH sessions
 */
export async function sshGetAllSessions(): Promise<SshSessionInfo[]> {
  return await invoke<SshSessionInfo[]>('ssh_get_all_sessions')
}

/**
 * Check if SSH session is connected
 */
export async function sshIsConnected(sessionId: string): Promise<boolean> {
  return await invoke<boolean>('ssh_is_connected', { sessionId })
}

export interface SshTestRequest {
  connectionId: string
  host: string
  port: number
  username: string
  authType: 'password' | 'key' | 'interactive'
  password?: string
  privateKey?: string
  passphrase?: string
}

/**
 * Test SSH connection without creating a session
 */
export async function sshTestConnection(request: SshTestRequest): Promise<void> {
  await invoke('ssh_test_connection', { request })
}

/**
 * Listen for SSH data events
 */
export async function listenSshData(
  sessionId: string,
  callback: (data: string) => void
): Promise<UnlistenFn> {
  return await listen<string>(`ssh-data-${sessionId}`, (event) => {
    callback(event.payload)
  })
}

/**
 * Listen for SSH status events
 */
export async function listenSshStatus(
  sessionId: string,
  callback: (status: string) => void
): Promise<UnlistenFn> {
  return await listen<string>(`ssh-status-${sessionId}`, (event) => {
    callback(event.payload)
  })
}
