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
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::sync::RwLock;
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
    /// Map of session_id -> SftpSessionWrapper
    sessions: Arc<RwLock<HashMap<String, SftpSessionWrapper>>>,
    /// Transfer tasks
    transfers: Arc<RwLock<HashMap<String, TransferTask>>>,
}

impl Default for SftpService {
    fn default() -> Self {
        Self::new()
    }
}

impl SftpService {
    pub fn new() -> Self {
        Self {
            sessions: Arc::new(RwLock::new(HashMap::new())),
            transfers: Arc::new(RwLock::new(HashMap::new())),
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
        let sessions = self.sessions.read().await;
        let wrapper = sessions
            .get(session_id)
            .ok_or_else(|| anyhow!("SFTP session not found"))?;

        let mut file = wrapper.sftp.open(path).await?;
        let metadata = file.metadata().await?;
        let size = metadata.size.unwrap_or(0) as usize;

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

    /// Create a new transfer task
    pub async fn create_transfer_task(
        &self,
        session_id: &str,
        local_path: &str,
        remote_path: &str,
        direction: TransferDirection,
        total: u64,
    ) -> String {
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

        self.transfers.write().await.insert(task_id.clone(), task);
        task_id
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
