//! SFTP Data Models
//!
//! Data structures for SFTP file operations.

use serde::{Deserialize, Serialize};

/// File entry information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileEntry {
    /// File or directory name
    pub name: String,
    /// Full path
    pub path: String,
    /// Whether this is a directory
    pub is_dir: bool,
    /// File size in bytes
    pub size: u64,
    /// Last modified time (ISO 8601 format)
    pub modified: String,
    /// Permission string (e.g., "rwxr-xr-x")
    pub permissions: String,
    /// Owner name
    pub owner: String,
    /// Group name
    pub group: String,
}

/// File type enumeration
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum FileType {
    File,
    Directory,
    Symlink,
    Other,
}

/// Transfer task status
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum TransferStatus {
    Pending,
    InProgress,
    Paused,
    Completed,
    Failed,
    Cancelled,
}

/// Transfer direction
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum TransferDirection {
    Upload,
    Download,
}

/// Transfer task information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransferTask {
    /// Unique task ID
    pub id: String,
    /// Session ID this transfer belongs to
    pub session_id: String,
    /// File name
    pub filename: String,
    /// Local path
    pub local_path: String,
    /// Remote path
    pub remote_path: String,
    /// Transfer direction
    pub direction: TransferDirection,
    /// Total size in bytes
    pub total: u64,
    /// Transferred bytes
    pub transferred: u64,
    /// Transfer speed in bytes/second
    pub speed: u64,
    /// Task status
    pub status: TransferStatus,
    /// Error message if failed
    pub error: Option<String>,
}

impl TransferTask {
    /// Calculate progress percentage (0-100)
    pub fn progress(&self) -> u8 {
        if self.total == 0 {
            return 0;
        }
        ((self.transferred as f64 / self.total as f64) * 100.0) as u8
    }
}

/// Transfer progress event payload
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransferProgress {
    pub task_id: String,
    pub transferred: u64,
    pub total: u64,
    pub speed: u64,
    pub status: TransferStatus,
}
