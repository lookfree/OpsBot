/**
 * SFTP Service
 *
 * Frontend service for SFTP file operations.
 */

import { invoke } from '@tauri-apps/api/core'

export interface FileEntry {
  name: string
  path: string
  is_dir: boolean
  size: number
  modified: string
  permissions: string
  owner: string
  group: string
}

export interface TransferTask {
  id: string
  session_id: string
  filename: string
  local_path: string
  remote_path: string
  direction: 'Upload' | 'Download'
  total: number
  transferred: number
  speed: number
  status: 'Pending' | 'InProgress' | 'Paused' | 'Completed' | 'Failed' | 'Cancelled'
  error?: string
}

/**
 * Open SFTP session on existing SSH connection
 */
export async function sftpOpen(sessionId: string): Promise<void> {
  await invoke('sftp_open', { sessionId })
}

/**
 * Close SFTP session
 */
export async function sftpClose(sessionId: string): Promise<void> {
  await invoke('sftp_close', { sessionId })
}

/**
 * List directory contents
 */
export async function sftpListDir(sessionId: string, path: string): Promise<FileEntry[]> {
  return invoke('sftp_list_dir', { sessionId, path })
}

/**
 * Get current working directory
 */
export async function sftpGetCurrentPath(sessionId: string): Promise<string> {
  return invoke('sftp_get_current_path', { sessionId })
}

/**
 * Canonicalize path (resolve to absolute path)
 */
export async function sftpCanonicalize(sessionId: string, path: string): Promise<string> {
  return invoke('sftp_canonicalize', { sessionId, path })
}

/**
 * Create directory
 */
export async function sftpMkdir(sessionId: string, path: string): Promise<void> {
  await invoke('sftp_mkdir', { sessionId, path })
}

/**
 * Remove file
 */
export async function sftpRemoveFile(sessionId: string, path: string): Promise<void> {
  await invoke('sftp_remove_file', { sessionId, path })
}

/**
 * Remove directory
 */
export async function sftpRemoveDir(sessionId: string, path: string): Promise<void> {
  await invoke('sftp_remove_dir', { sessionId, path })
}

/**
 * Rename file or directory
 */
export async function sftpRename(
  sessionId: string,
  oldPath: string,
  newPath: string
): Promise<void> {
  await invoke('sftp_rename', { sessionId, oldPath, newPath })
}

/**
 * Read file contents (returns base64 encoded string)
 */
export async function sftpReadFile(sessionId: string, path: string): Promise<string> {
  return invoke('sftp_read_file', { sessionId, path })
}

/**
 * Write file contents (accepts base64 encoded string)
 */
export async function sftpWriteFile(
  sessionId: string,
  path: string,
  data: string
): Promise<void> {
  await invoke('sftp_write_file', { sessionId, path, data })
}

/**
 * Get file/directory metadata
 */
export async function sftpStat(sessionId: string, path: string): Promise<FileEntry> {
  return invoke('sftp_stat', { sessionId, path })
}

/**
 * Get all transfer tasks for a session
 */
export async function sftpGetTransfers(sessionId: string): Promise<TransferTask[]> {
  return invoke('sftp_get_transfers', { sessionId })
}

/**
 * Cleanup completed/cancelled transfers
 */
export async function sftpCleanupTransfers(sessionId: string): Promise<void> {
  await invoke('sftp_cleanup_transfers', { sessionId })
}

/**
 * Download file from remote to local
 */
export async function sftpDownload(
  sessionId: string,
  remotePath: string,
  localPath: string
): Promise<string> {
  return invoke('sftp_download', { sessionId, remotePath, localPath })
}

/**
 * Upload file from local to remote
 * @param resume - If true, will resume from existing partial file on server
 */
export async function sftpUpload(
  sessionId: string,
  localPath: string,
  remotePath: string,
  resume: boolean = false
): Promise<string> {
  return invoke('sftp_upload', { sessionId, localPath, remotePath, resume })
}

/**
 * Cancel a transfer task
 */
export async function sftpCancelTransfer(
  sessionId: string,
  taskId: string
): Promise<void> {
  await invoke('sftp_cancel_transfer', { sessionId, taskId })
}

/**
 * Format file size to human readable string
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}
