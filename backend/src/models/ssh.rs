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
// NOTE: Debug is hand-written (below) to redact secrets. Do NOT add `Debug` to
// this derive — it would print the password/private key/passphrase verbatim.
#[derive(Clone, Serialize, Deserialize)]
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

/// Render `Some("secret")` as `Some("<redacted>")` for Debug output.
fn redacted(value: &Option<String>) -> Option<&'static str> {
    value.as_ref().map(|_| "<redacted>")
}

impl std::fmt::Debug for SshConnectRequest {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("SshConnectRequest")
            .field("connection_id", &self.connection_id)
            .field("host", &self.host)
            .field("port", &self.port)
            .field("username", &self.username)
            .field("auth_type", &self.auth_type)
            .field("password", &redacted(&self.password))
            .field("private_key", &redacted(&self.private_key))
            .field("passphrase", &redacted(&self.passphrase))
            .field("jump_host", &self.jump_host)
            .field("terminal_size", &self.terminal_size)
            .finish()
    }
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
