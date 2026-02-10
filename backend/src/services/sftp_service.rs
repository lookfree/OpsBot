//! SFTP Service Implementation
//!
//! Provides SFTP file operations using russh-sftp library.

use std::collections::HashMap;
use std::path::Path;
use std::sync::Arc;

use anyhow::{anyhow, Result};
use chrono::{DateTime, Utc};
use russh::Channel;
use russh_sftp::client::SftpSession;
use tokio::fs::File as TokioFile;
use tokio::io::{AsyncReadExt, AsyncWriteExt, BufReader};
use tokio::sync::{RwLock, Semaphore, OwnedSemaphorePermit};
use tokio_util::sync::CancellationToken;
use uuid::Uuid;

use crate::models::{FileEntry, TransferDirection, TransferStatus, TransferTask};

/// SFTP session wrapper
pub struct SftpSessionWrapper {
    pub session_id: String,
    pub sftp: SftpSession,
    pub current_path: String,
}

/// SFTP Service for managing file operations
pub struct SftpService {
    /// Map of session_id -> SftpSessionWrapper (main sessions for browsing)
    sessions: Arc<RwLock<HashMap<String, SftpSessionWrapper>>>,
    /// Map of task_id -> Arc<SftpSession> (dedicated sessions for parallel uploads)
    /// Using Arc allows cloning the reference and releasing the lock quickly
    transfer_sessions: Arc<RwLock<HashMap<String, Arc<SftpSession>>>>,
    /// Transfer tasks
    transfers: Arc<RwLock<HashMap<String, TransferTask>>>,
    /// Cancellation tokens for transfer tasks
    cancel_tokens: Arc<RwLock<HashMap<String, CancellationToken>>>,
    /// Semaphore to limit concurrent uploads (default: 3)
    max_concurrent_uploads: Arc<Semaphore>,
}

impl Default for SftpService {
    fn default() -> Self {
        Self::new()
    }
}

/// Maximum number of concurrent uploads (reduced from 3 to 2 to avoid bandwidth saturation)
const MAX_CONCURRENT_UPLOADS: usize = 2;

impl SftpService {
    pub fn new() -> Self {
        Self {
            sessions: Arc::new(RwLock::new(HashMap::new())),
            transfer_sessions: Arc::new(RwLock::new(HashMap::new())),
            transfers: Arc::new(RwLock::new(HashMap::new())),
            cancel_tokens: Arc::new(RwLock::new(HashMap::new())),
            max_concurrent_uploads: Arc::new(Semaphore::new(MAX_CONCURRENT_UPLOADS)),
        }
    }

    /// Open SFTP session on existing SSH channel
    pub async fn open_sftp(
        &self,
        session_id: String,
        channel: Channel<russh::client::Msg>,
    ) -> Result<()> {
        // Request SFTP subsystem
        channel.request_subsystem(true, "sftp").await?;

        // Create SFTP session
        let sftp = SftpSession::new(channel.into_stream()).await?;

        // Get home directory as initial path
        let current_path = sftp
            .canonicalize(".")
            .await
            .unwrap_or_else(|_| "/".to_string());

        let wrapper = SftpSessionWrapper {
            session_id: session_id.clone(),
            sftp,
            current_path,
        };

        self.sessions.write().await.insert(session_id, wrapper);
        Ok(())
    }

    /// Close SFTP session
    pub async fn close_sftp(&self, session_id: &str) -> Result<()> {
        self.sessions.write().await.remove(session_id);
        Ok(())
    }

    /// Check if SFTP session exists
    pub async fn has_sftp_session(&self, session_id: &str) -> bool {
        self.sessions.read().await.contains_key(session_id)
    }

    /// List directory contents
    pub async fn list_dir(&self, session_id: &str, path: &str) -> Result<Vec<FileEntry>> {
        let sessions = self.sessions.read().await;
        let wrapper = sessions
            .get(session_id)
            .ok_or_else(|| anyhow!("SFTP session not found"))?;

        let entries = wrapper.sftp.read_dir(path).await?;
        let mut files = Vec::new();

        for entry in entries {
            let metadata = entry.metadata();
            let file_type = metadata.file_type();

            let permissions = format_permissions(metadata.permissions);
            let modified = format_timestamp(metadata.mtime);

            files.push(FileEntry {
                name: entry.file_name(),
                path: format!("{}/{}", path.trim_end_matches('/'), entry.file_name()),
                is_dir: file_type.is_dir(),
                size: metadata.size.unwrap_or(0),
                modified,
                permissions,
                owner: metadata.uid.map(|u| u.to_string()).unwrap_or_default(),
                group: metadata.gid.map(|g| g.to_string()).unwrap_or_default(),
            });
        }

        // Sort: directories first, then by name
        files.sort_by(|a, b| {
            match (a.is_dir, b.is_dir) {
                (true, false) => std::cmp::Ordering::Less,
                (false, true) => std::cmp::Ordering::Greater,
                _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
            }
        });

        Ok(files)
    }

    /// Get current working directory
    pub async fn get_current_path(&self, session_id: &str) -> Result<String> {
        let sessions = self.sessions.read().await;
        let wrapper = sessions
            .get(session_id)
            .ok_or_else(|| anyhow!("SFTP session not found"))?;
        Ok(wrapper.current_path.clone())
    }

    /// Canonicalize path (resolve to absolute path)
    pub async fn canonicalize(&self, session_id: &str, path: &str) -> Result<String> {
        let sessions = self.sessions.read().await;
        let wrapper = sessions
            .get(session_id)
            .ok_or_else(|| anyhow!("SFTP session not found"))?;
        let canonical = wrapper.sftp.canonicalize(path).await?;
        Ok(canonical)
    }

    /// Create directory
    pub async fn mkdir(&self, session_id: &str, path: &str) -> Result<()> {
        let sessions = self.sessions.read().await;
        let wrapper = sessions
            .get(session_id)
            .ok_or_else(|| anyhow!("SFTP session not found"))?;
        wrapper.sftp.create_dir(path).await?;
        Ok(())
    }

    /// Remove file
    pub async fn remove_file(&self, session_id: &str, path: &str) -> Result<()> {
        let sessions = self.sessions.read().await;
        let wrapper = sessions
            .get(session_id)
            .ok_or_else(|| anyhow!("SFTP session not found"))?;
        wrapper.sftp.remove_file(path).await?;
        Ok(())
    }

    /// Remove directory
    pub async fn remove_dir(&self, session_id: &str, path: &str) -> Result<()> {
        let sessions = self.sessions.read().await;
        let wrapper = sessions
            .get(session_id)
            .ok_or_else(|| anyhow!("SFTP session not found"))?;
        wrapper.sftp.remove_dir(path).await?;
        Ok(())
    }

    /// Rename file or directory
    pub async fn rename(&self, session_id: &str, old_path: &str, new_path: &str) -> Result<()> {
        let sessions = self.sessions.read().await;
        let wrapper = sessions
            .get(session_id)
            .ok_or_else(|| anyhow!("SFTP session not found"))?;
        wrapper.sftp.rename(old_path, new_path).await?;
        Ok(())
    }

    /// Read file contents
    pub async fn read_file(&self, session_id: &str, path: &str) -> Result<Vec<u8>> {
        const MAX_READ_FILE_SIZE: usize = 100 * 1024 * 1024; // 100MB

        let sessions = self.sessions.read().await;
        let wrapper = sessions
            .get(session_id)
            .ok_or_else(|| anyhow!("SFTP session not found"))?;

        let mut file = wrapper.sftp.open(path).await?;
        let metadata = file.metadata().await?;
        let size = metadata.size.unwrap_or(0) as usize;

        if size > MAX_READ_FILE_SIZE {
            return Err(anyhow!(
                "File too large for direct read ({} bytes, max {} bytes). Use SFTP download instead.",
                size,
                MAX_READ_FILE_SIZE
            ));
        }

        let mut buffer = vec![0u8; size];
        let _bytes_read = file.read(&mut buffer).await?;
        Ok(buffer)
    }

    /// Write file contents
    pub async fn write_file(&self, session_id: &str, path: &str, data: &[u8]) -> Result<()> {
        let sessions = self.sessions.read().await;
        let wrapper = sessions
            .get(session_id)
            .ok_or_else(|| anyhow!("SFTP session not found"))?;

        let mut file = wrapper.sftp.create(path).await?;
        file.write_all(data).await?;
        file.sync_all().await?;
        Ok(())
    }

    /// Write file contents with chunked upload (for progress reporting)
    /// Returns Ok(true) if completed, Ok(false) if cancelled
    pub async fn write_file_chunked<F>(
        &self,
        session_id: &str,
        path: &str,
        data: &[u8],
        chunk_size: usize,
        cancel_token: CancellationToken,
        mut progress_callback: F,
    ) -> Result<bool>
    where
        F: FnMut(u64) + Send,
    {
        let sessions = self.sessions.read().await;
        let wrapper = sessions
            .get(session_id)
            .ok_or_else(|| anyhow!("SFTP session not found"))?;

        let mut file = wrapper.sftp.create(path).await?;
        let mut written: u64 = 0;

        for chunk in data.chunks(chunk_size) {
            // Check for cancellation before each chunk
            if cancel_token.is_cancelled() {
                // File will be partially written, clean up handled by caller
                return Ok(false);
            }

            file.write_all(chunk).await?;
            written += chunk.len() as u64;
            progress_callback(written);
        }

        file.sync_all().await?;
        Ok(true)
    }

    /// Write file contents with chunked upload supporting resume
    /// Returns Ok(true) if completed, Ok(false) if cancelled
    pub async fn write_file_chunked_resume<F>(
        &self,
        session_id: &str,
        path: &str,
        data: &[u8],
        chunk_size: usize,
        start_offset: u64,
        cancel_token: CancellationToken,
        mut progress_callback: F,
    ) -> Result<bool>
    where
        F: FnMut(u64) + Send,
    {
        let sessions = self.sessions.read().await;
        let wrapper = sessions
            .get(session_id)
            .ok_or_else(|| anyhow!("SFTP session not found"))?;

        // Open file for writing with append/write mode
        let mut file = if start_offset > 0 {
            // Open existing file for appending
            let options = russh_sftp::protocol::OpenFlags::WRITE | russh_sftp::protocol::OpenFlags::APPEND;
            wrapper.sftp.open_with_flags(path, options).await?
        } else {
            // Create new file
            wrapper.sftp.create(path).await?
        };

        let mut written: u64 = start_offset;
        let data_to_write = &data[start_offset as usize..];

        for chunk in data_to_write.chunks(chunk_size) {
            // Check for cancellation before each chunk
            if cancel_token.is_cancelled() {
                return Ok(false);
            }

            file.write_all(chunk).await?;
            written += chunk.len() as u64;
            progress_callback(written);
        }

        file.sync_all().await?;
        Ok(true)
    }

    /// Get remote file size, returns 0 if file doesn't exist
    pub async fn get_remote_file_size(&self, session_id: &str, path: &str) -> u64 {
        log::info!("[SFTP Resume] Checking remote file size: {}", path);
        match self.stat(session_id, path).await {
            Ok(entry) if !entry.is_dir => {
                log::info!("[SFTP Resume] Remote file exists, size: {} bytes", entry.size);
                entry.size
            }
            Ok(_entry) => {
                log::info!("[SFTP Resume] Path is a directory, returning 0");
                0
            }
            Err(e) => {
                log::info!("[SFTP Resume] Remote file not found or error: {}", e);
                0
            }
        }
    }

    /// Stream upload file from local path to remote path
    /// This method reads file in chunks to avoid loading entire file into memory
    /// Returns Ok(true) if completed, Ok(false) if cancelled
    pub async fn upload_file_streaming<F>(
        &self,
        session_id: &str,
        local_path: &str,
        remote_path: &str,
        chunk_size: usize,
        start_offset: u64,
        cancel_token: CancellationToken,
        mut progress_callback: F,
    ) -> Result<bool>
    where
        F: FnMut(u64) + Send,
    {
        log::info!("[SFTP Stream] Opening local file: {}", local_path);
        // Open local file
        let local_file = TokioFile::open(local_path).await?;
        let file_size = local_file.metadata().await?.len();
        log::info!("[SFTP Stream] Local file opened, size: {} bytes", file_size);
        let mut reader = BufReader::with_capacity(chunk_size, local_file);

        // Skip to start offset if resuming
        if start_offset > 0 {
            let mut skipped = 0u64;
            let mut skip_buf = vec![0u8; chunk_size.min(1024 * 1024)];
            while skipped < start_offset {
                let to_skip = (start_offset - skipped).min(skip_buf.len() as u64) as usize;
                let n = reader.read(&mut skip_buf[..to_skip]).await?;
                if n == 0 {
                    break;
                }
                skipped += n as u64;
            }
        }

        // Get SFTP session and create remote file
        log::info!("[SFTP Stream] Getting SFTP session: {}", session_id);
        let sessions = self.sessions.read().await;
        let wrapper = sessions
            .get(session_id)
            .ok_or_else(|| anyhow!("SFTP session not found"))?;
        log::info!("[SFTP Stream] SFTP session found");

        // Open file for writing
        log::info!("[SFTP Stream] Creating remote file: {}", remote_path);
        let mut remote_file = if start_offset > 0 {
            let options =
                russh_sftp::protocol::OpenFlags::WRITE | russh_sftp::protocol::OpenFlags::APPEND;
            wrapper.sftp.open_with_flags(remote_path, options).await?
        } else {
            wrapper.sftp.create(remote_path).await?
        };
        log::info!("[SFTP Stream] Remote file created successfully");

        let mut written = start_offset;
        let mut buffer = vec![0u8; chunk_size];
        let mut chunk_count = 0u64;

        log::info!(
            "[SFTP Stream] Starting upload loop, chunk_size: {}, start_offset: {}",
            chunk_size,
            start_offset
        );
        loop {
            // Check for cancellation
            if cancel_token.is_cancelled() {
                log::info!(
                    "[SFTP Stream] Upload cancelled at {} bytes, syncing file...",
                    written
                );
                // Sync the file to ensure partial data is written to disk
                if let Err(e) = remote_file.sync_all().await {
                    log::warn!("[SFTP Stream] Failed to sync on cancel: {}", e);
                }
                return Ok(false);
            }

            // Read chunk from local file
            let bytes_read = reader.read(&mut buffer).await?;
            if bytes_read == 0 {
                log::info!("[SFTP Stream] EOF reached");
                break; // EOF
            }

            // Write chunk to remote file
            if let Err(e) = remote_file.write_all(&buffer[..bytes_read]).await {
                log::error!("[SFTP Stream] Write error at chunk {}: {}", chunk_count, e);
                return Err(e.into());
            }
            written += bytes_read as u64;
            chunk_count += 1;

            // Log progress every 100 chunks
            if chunk_count % 100 == 0 {
                log::info!("[SFTP Stream] Progress: {} bytes written, {} chunks", written, chunk_count);
            }

            progress_callback(written);

            // Check if we've written the expected amount
            if written >= file_size {
                break;
            }
        }

        log::info!("[SFTP Stream] Upload loop finished, syncing file...");
        remote_file.sync_all().await?;
        log::info!("[SFTP Stream] Upload completed: {} bytes, {} chunks", written, chunk_count);
        Ok(true)
    }

    /// Get file/directory metadata
    pub async fn stat(&self, session_id: &str, path: &str) -> Result<FileEntry> {
        let sessions = self.sessions.read().await;
        let wrapper = sessions
            .get(session_id)
            .ok_or_else(|| anyhow!("SFTP session not found"))?;

        let metadata = wrapper.sftp.metadata(path).await?;
        let file_type = metadata.file_type();
        let permissions = format_permissions(metadata.permissions);
        let modified = format_timestamp(metadata.mtime);

        let name = Path::new(path)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or(path)
            .to_string();

        Ok(FileEntry {
            name,
            path: path.to_string(),
            is_dir: file_type.is_dir(),
            size: metadata.size.unwrap_or(0),
            modified,
            permissions,
            owner: metadata.uid.map(|u| u.to_string()).unwrap_or_default(),
            group: metadata.gid.map(|g| g.to_string()).unwrap_or_default(),
        })
    }

    /// Create a new transfer task with cancellation token
    pub async fn create_transfer_task(
        &self,
        session_id: &str,
        local_path: &str,
        remote_path: &str,
        direction: TransferDirection,
        total: u64,
    ) -> (String, CancellationToken) {
        let task_id = Uuid::new_v4().to_string();
        let filename = Path::new(if direction == TransferDirection::Upload {
            local_path
        } else {
            remote_path
        })
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown")
        .to_string();

        let task = TransferTask {
            id: task_id.clone(),
            session_id: session_id.to_string(),
            filename,
            local_path: local_path.to_string(),
            remote_path: remote_path.to_string(),
            direction,
            total,
            transferred: 0,
            speed: 0,
            status: TransferStatus::Pending,
            error: None,
        };

        let cancel_token = CancellationToken::new();
        self.transfers.write().await.insert(task_id.clone(), task);
        self.cancel_tokens
            .write()
            .await
            .insert(task_id.clone(), cancel_token.clone());

        (task_id, cancel_token)
    }

    /// Cancel a transfer task
    pub async fn cancel_transfer(&self, task_id: &str) -> Result<()> {
        // Get and trigger the cancellation token
        if let Some(token) = self.cancel_tokens.read().await.get(task_id) {
            token.cancel();
        }

        // Update task status to cancelled
        if let Some(task) = self.transfers.write().await.get_mut(task_id) {
            task.status = TransferStatus::Cancelled;
        }

        Ok(())
    }

    /// Remove cancellation token for a task
    pub async fn remove_cancel_token(&self, task_id: &str) {
        self.cancel_tokens.write().await.remove(task_id);
    }

    /// Get all transfer tasks for a session
    pub async fn get_transfers(&self, session_id: &str) -> Vec<TransferTask> {
        self.transfers
            .read()
            .await
            .values()
            .filter(|t| t.session_id == session_id)
            .cloned()
            .collect()
    }

    /// Update transfer task status
    pub async fn update_transfer(
        &self,
        task_id: &str,
        transferred: u64,
        speed: u64,
        status: TransferStatus,
    ) {
        if let Some(task) = self.transfers.write().await.get_mut(task_id) {
            task.transferred = transferred;
            task.speed = speed;
            task.status = status;
        }
    }

    /// Remove completed/cancelled transfers
    pub async fn cleanup_transfers(&self, session_id: &str) {
        self.transfers.write().await.retain(|_, t| {
            t.session_id != session_id
                || !matches!(
                    t.status,
                    TransferStatus::Completed | TransferStatus::Cancelled
                )
        });
    }

    /// Remove a single transfer task by ID
    pub async fn remove_transfer(&self, task_id: &str) {
        self.transfers.write().await.remove(task_id);
        self.cancel_tokens.write().await.remove(task_id);
    }

    /// Acquire a permit for concurrent upload
    /// Returns the permit which must be held during upload
    pub async fn acquire_upload_permit(&self) -> Result<OwnedSemaphorePermit> {
        self.max_concurrent_uploads
            .clone()
            .acquire_owned()
            .await
            .map_err(|e| anyhow!("Failed to acquire upload permit: {}", e))
    }

    /// Create a dedicated SFTP session for a transfer task
    /// This allows parallel uploads without blocking the main session
    pub async fn create_transfer_session(
        &self,
        task_id: &str,
        channel: Channel<russh::client::Msg>,
    ) -> Result<()> {
        log::info!("[SFTP Transfer] Creating dedicated session for task: {}", task_id);

        // Request SFTP subsystem on the new channel
        channel.request_subsystem(true, "sftp").await?;

        // Create SFTP session wrapped in Arc for safe concurrent access
        let sftp = Arc::new(SftpSession::new(channel.into_stream()).await?);

        self.transfer_sessions.write().await.insert(task_id.to_string(), sftp);
        log::info!("[SFTP Transfer] Dedicated session created for task: {}", task_id);
        Ok(())
    }

    /// Close and remove a dedicated transfer session
    pub async fn close_transfer_session(&self, task_id: &str) {
        log::info!("[SFTP Transfer] Closing dedicated session for task: {}", task_id);
        self.transfer_sessions.write().await.remove(task_id);
    }

    /// Stream upload file using a dedicated transfer session
    /// This method uses the transfer_sessions map instead of main sessions
    /// Returns Ok(true) if completed, Ok(false) if cancelled
    pub async fn upload_with_dedicated_session<F>(
        &self,
        task_id: &str,
        local_path: &str,
        remote_path: &str,
        chunk_size: usize,
        start_offset: u64,
        cancel_token: CancellationToken,
        mut progress_callback: F,
    ) -> Result<bool>
    where
        F: FnMut(u64) + Send,
    {
        log::info!("[SFTP Dedicated] Opening local file: {}", local_path);
        // Open local file
        let local_file = TokioFile::open(local_path).await?;
        let file_size = local_file.metadata().await?.len();
        log::info!("[SFTP Dedicated] Local file opened, size: {} bytes", file_size);
        let mut reader = BufReader::with_capacity(chunk_size, local_file);

        // Skip to start offset if resuming
        if start_offset > 0 {
            let mut skipped = 0u64;
            let mut skip_buf = vec![0u8; chunk_size.min(1024 * 1024)];
            while skipped < start_offset {
                let to_skip = (start_offset - skipped).min(skip_buf.len() as u64) as usize;
                let n = reader.read(&mut skip_buf[..to_skip]).await?;
                if n == 0 {
                    break;
                }
                skipped += n as u64;
            }
        }

        // Get the dedicated transfer session (clone Arc to release lock quickly)
        log::info!("[SFTP Dedicated] Getting transfer session for task: {}", task_id);
        let sftp = {
            let transfer_sessions = self.transfer_sessions.read().await;
            transfer_sessions
                .get(task_id)
                .ok_or_else(|| anyhow!("Transfer session not found for task: {}", task_id))?
                .clone() // Clone the Arc, not the session itself
        }; // Lock is released here
        log::info!("[SFTP Dedicated] Transfer session found");

        // Open file for writing
        log::info!("[SFTP Dedicated] Creating remote file: {}", remote_path);
        let mut remote_file = if start_offset > 0 {
            let options =
                russh_sftp::protocol::OpenFlags::WRITE | russh_sftp::protocol::OpenFlags::APPEND;
            sftp.open_with_flags(remote_path, options).await?
        } else {
            sftp.create(remote_path).await?
        };
        log::info!("[SFTP Dedicated] Remote file created successfully");

        let mut written = start_offset;
        let mut buffer = vec![0u8; chunk_size];
        let mut chunk_count = 0u64;

        log::info!(
            "[SFTP Dedicated] Starting upload loop, chunk_size: {}, start_offset: {}",
            chunk_size,
            start_offset
        );
        loop {
            // Check for cancellation
            if cancel_token.is_cancelled() {
                log::info!(
                    "[SFTP Dedicated] Upload cancelled at {} bytes, syncing file...",
                    written
                );
                if let Err(e) = remote_file.sync_all().await {
                    log::warn!("[SFTP Dedicated] Failed to sync on cancel: {}", e);
                }
                return Ok(false);
            }

            // Read chunk from local file
            let bytes_read = reader.read(&mut buffer).await?;
            if bytes_read == 0 {
                log::info!("[SFTP Dedicated] EOF reached");
                break; // EOF
            }

            // Write chunk to remote file
            if let Err(e) = remote_file.write_all(&buffer[..bytes_read]).await {
                log::error!("[SFTP Dedicated] Write error at chunk {}: {}", chunk_count, e);
                return Err(e.into());
            }
            written += bytes_read as u64;
            chunk_count += 1;

            // Log progress every 100 chunks
            if chunk_count % 100 == 0 {
                log::info!("[SFTP Dedicated] Progress: {} bytes written, {} chunks", written, chunk_count);
            }

            progress_callback(written);

            // Check if we've written the expected amount
            if written >= file_size {
                break;
            }
        }

        log::info!("[SFTP Dedicated] Upload loop finished, syncing file...");
        remote_file.sync_all().await?;
        log::info!("[SFTP Dedicated] Upload completed: {} bytes, {} chunks", written, chunk_count);
        Ok(true)
    }
}

/// Format Unix permissions to string (e.g., "rwxr-xr-x")
fn format_permissions(mode: Option<u32>) -> String {
    match mode {
        Some(m) => {
            let mut s = String::with_capacity(9);
            // Owner
            s.push(if m & 0o400 != 0 { 'r' } else { '-' });
            s.push(if m & 0o200 != 0 { 'w' } else { '-' });
            s.push(if m & 0o100 != 0 { 'x' } else { '-' });
            // Group
            s.push(if m & 0o040 != 0 { 'r' } else { '-' });
            s.push(if m & 0o020 != 0 { 'w' } else { '-' });
            s.push(if m & 0o010 != 0 { 'x' } else { '-' });
            // Others
            s.push(if m & 0o004 != 0 { 'r' } else { '-' });
            s.push(if m & 0o002 != 0 { 'w' } else { '-' });
            s.push(if m & 0o001 != 0 { 'x' } else { '-' });
            s
        }
        None => "---------".to_string(),
    }
}

/// Format Unix timestamp to ISO 8601 string
fn format_timestamp(timestamp: Option<u32>) -> String {
    match timestamp {
        Some(ts) => {
            let dt = DateTime::<Utc>::from_timestamp(ts as i64, 0);
            dt.map(|d| d.format("%Y-%m-%d %H:%M").to_string())
                .unwrap_or_else(|| "-".to_string())
        }
        None => "-".to_string(),
    }
}
