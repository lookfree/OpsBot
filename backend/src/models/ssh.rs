//! SSH session models
//!
//! Defines data structures for SSH sessions and events.

use serde::{Deserialize, Serialize};

/// SSH session status
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SessionStatus {
    Connecting,
    Connected,
    Disconnected,
    Error,
}

/// SSH session information
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SshSessionInfo {
    pub session_id: String,
    pub connection_id: String,
    pub status: SessionStatus,
    pub connected_at: Option<String>,
    pub host: String,
    pub username: String,
}

/// Terminal size configuration
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalSize {
    pub cols: u32,
    pub rows: u32,
}

impl Default for TerminalSize {
    fn default() -> Self {
        Self { cols: 80, rows: 24 }
    }
}

// JumpHostConfig is defined in connection.rs
use super::connection::JumpHostConfig;

/// SSH connect request from frontend
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SshConnectRequest {
    pub connection_id: String,
    pub host: String,
    pub port: u16,
    pub username: String,
    pub auth_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub password: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub private_key: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub passphrase: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub jump_host: Option<JumpHostConfig>,
    #[serde(default)]
    pub terminal_size: TerminalSize,
}

/// SSH data event for streaming
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SshDataEvent {
    pub session_id: String,
    pub data: Vec<u8>,
}

/// SSH status event
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SshStatusEvent {
    pub session_id: String,
    pub status: SessionStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}
