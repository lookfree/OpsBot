//! SSH session types (session handle, interactive-exec handle, local tunnel).

use std::sync::atomic::AtomicU64;
use std::sync::Arc;

use futures::channel::mpsc;
use russh::*;
use tokio::sync::Mutex as TokioMutex;
use tokio::task::JoinHandle;
use uuid::Uuid;

use super::handler::SshClientHandler;
use crate::models::{SessionStatus, SshConnectRequest, SshSessionInfo};

/// Get current epoch seconds
pub(crate) fn now_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

pub struct SshSession {
    pub session_id: String,
    pub connection_id: String,
    pub status: SessionStatus,
    pub host: String,
    pub username: String,
    #[allow(dead_code)] // kept for diagnostics; not read internally
    pub port: u16,
    /// Shared so exec/SFTP paths can clone it out and release the sessions lock
    /// before doing network I/O (russh's Handle is not Clone; Arc is).
    pub(crate) handle: Option<Arc<client::Handle<SshClientHandler>>>,
    /// Bastion connection kept alive for jump-host sessions so the direct-tcpip
    /// channel carrying the target session stays open. None for direct sessions.
    pub(crate) jump_handle: Option<Arc<client::Handle<SshClientHandler>>>,
    pub(crate) channel: Option<Channel<client::Msg>>,
    pub(crate) tx: Option<mpsc::Sender<Vec<u8>>>,
    // Store connection parameters for reconnection
    pub(crate) connect_request: Option<SshConnectRequest>,
    /// Last activity timestamp (epoch seconds) for auto-cleanup
    pub(crate) last_activity_secs: Arc<AtomicU64>,
}

/// Commands for interactive exec sessions
pub enum ExecCommand {
    WriteData(Vec<u8>),
    Resize(u16, u16),
    Close,
}

/// Interactive exec session for docker exec or other PTY commands
pub struct InteractiveExecSession {
    #[allow(dead_code)] // matches the exec_sessions map key; kept for clarity
    pub exec_id: String,
    pub session_id: String,
    pub(crate) command_tx: tokio::sync::mpsc::UnboundedSender<ExecCommand>,
}

/// Local SSH tunnel handle. Dropping it aborts the listener and disconnects the SSH client.
pub struct SshTunnelHandle {
    pub local_host: String,
    pub local_port: u16,
    pub(crate) task: JoinHandle<()>,
    pub(crate) handle: Arc<TokioMutex<client::Handle<SshClientHandler>>>,
}

impl SshTunnelHandle {
    pub async fn close(&self) {
        self.task.abort();
        let handle = self.handle.lock().await;
        let _ = handle
            .disconnect(Disconnect::ByApplication, "Tunnel closed", "")
            .await;
    }
}

impl Drop for SshTunnelHandle {
    fn drop(&mut self) {
        self.task.abort();
    }
}

impl SshSession {
    pub(crate) fn new(request: &SshConnectRequest) -> Self {
        Self {
            session_id: Uuid::new_v4().to_string(),
            connection_id: request.connection_id.clone(),
            status: SessionStatus::Connecting,
            host: request.host.clone(),
            username: request.username.clone(),
            port: request.port,
            handle: None,
            jump_handle: None,
            channel: None,
            tx: None,
            connect_request: Some(request.clone()),
            last_activity_secs: Arc::new(AtomicU64::new(now_secs())),
        }
    }

    /// Close the terminal channel and both the target and bastion connections.
    pub(crate) async fn close(&mut self, reason: &str) {
        if let Some(channel) = self.channel.take() {
            let _ = channel.close().await;
        }
        if let Some(handle) = self.handle.take() {
            let _ = handle
                .disconnect(Disconnect::ByApplication, reason, "")
                .await;
        }
        if let Some(jump) = self.jump_handle.take() {
            let _ = jump
                .disconnect(Disconnect::ByApplication, reason, "")
                .await;
        }
    }

    pub fn info(&self) -> SshSessionInfo {
        SshSessionInfo {
            session_id: self.session_id.clone(),
            connection_id: self.connection_id.clone(),
            status: self.status,
            connected_at: None,
            host: self.host.clone(),
            username: self.username.clone(),
        }
    }
}
