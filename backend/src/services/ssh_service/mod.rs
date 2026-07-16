//! SSH Service: session lifecycle and management. Connection paths live in
//! `connect`, command/exec paths in `exec`, the russh handler in `handler`, and
//! the session/tunnel types in `session`.

use std::collections::HashMap;
use std::sync::atomic::Ordering;
use std::sync::Arc;

use anyhow::{anyhow, Result};
use tokio::sync::RwLock;

use crate::models::{SessionStatus, SshSessionInfo, TerminalSize};
use crate::services::known_hosts::KnownHostsStore;

mod connect;
mod exec;
mod handler;
mod session;

use handler::PendingKeyVerifications;
use session::{now_secs, InteractiveExecSession, SshSession};
pub use session::SshTunnelHandle;

/// SSH Service for managing multiple SSH sessions
pub struct SshService {
    sessions: Arc<RwLock<HashMap<String, SshSession>>>,
    /// Interactive exec sessions (for docker exec, etc.)
    exec_sessions: Arc<RwLock<HashMap<String, InteractiveExecSession>>>,
    /// Known hosts store for TOFU
    known_hosts: Option<Arc<KnownHostsStore>>,
    /// Pending host key verifications
    pending_verifications: PendingKeyVerifications,
}

impl Default for SshService {
    fn default() -> Self {
        Self::new()
    }
}


impl SshService {
    pub fn new() -> Self {
        Self {
            sessions: Arc::new(RwLock::new(HashMap::new())),
            exec_sessions: Arc::new(RwLock::new(HashMap::new())),
            known_hosts: None,
            pending_verifications: Arc::new(tokio::sync::Mutex::new(HashMap::new())),
        }
    }

    /// Create SshService with a known hosts store for TOFU verification
    pub fn new_with_known_hosts(known_hosts: Arc<KnownHostsStore>) -> Self {
        Self {
            sessions: Arc::new(RwLock::new(HashMap::new())),
            exec_sessions: Arc::new(RwLock::new(HashMap::new())),
            known_hosts: Some(known_hosts),
            pending_verifications: Arc::new(tokio::sync::Mutex::new(HashMap::new())),
        }
    }


    /// Send a user's host key accept/reject response
    pub async fn respond_host_key(&self, session_id: &str, accept: bool) -> Result<()> {
        let tx = self
            .pending_verifications
            .lock()
            .await
            .remove(session_id)
            .ok_or_else(|| anyhow!("No pending verification for session {}", session_id))?;
        let _ = tx.send(accept);
        Ok(())
    }



    /// Send data to SSH session
    pub async fn send_data(&self, session_id: &str, data: &[u8]) -> Result<()> {
        let sessions = self.sessions.read().await;
        let session = sessions
            .get(session_id)
            .ok_or_else(|| anyhow!("Session not found"))?;

        if let Some(channel) = &session.channel {
            channel.data(data).await?;
        }
        session.last_activity_secs.store(now_secs(), Ordering::Relaxed);
        Ok(())
    }

    /// Resize terminal
    pub async fn resize_terminal(&self, session_id: &str, size: TerminalSize) -> Result<()> {
        let sessions = self.sessions.read().await;
        let session = sessions
            .get(session_id)
            .ok_or_else(|| anyhow!("Session not found"))?;

        if let Some(channel) = &session.channel {
            channel
                .window_change(size.cols, size.rows, 0, 0)
                .await?;
        }
        session.last_activity_secs.store(now_secs(), Ordering::Relaxed);
        Ok(())
    }

    /// Start background task to clean up stale SSH sessions
    /// Sessions inactive for more than 30 minutes will be automatically closed.
    pub fn start_cleanup_task(self: &Arc<Self>) {
        const CLEANUP_INTERVAL_SECS: u64 = 300; // 5 minutes
        const STALE_THRESHOLD_SECS: u64 = 1800; // 30 minutes

        let service = Arc::clone(self);
        tauri::async_runtime::spawn(async move {
            let mut interval = tokio::time::interval(
                std::time::Duration::from_secs(CLEANUP_INTERVAL_SECS),
            );
            loop {
                interval.tick().await;

                let now = now_secs();

                // Collect stale session IDs under a read lock
                let stale_ids: Vec<String> = {
                    let sessions = service.sessions.read().await;
                    sessions
                        .iter()
                        .filter(|(_, s)| {
                            let last = s.last_activity_secs.load(Ordering::Relaxed);
                            now.saturating_sub(last) > STALE_THRESHOLD_SECS
                        })
                        .map(|(id, _)| id.clone())
                        .collect()
                };

                if stale_ids.is_empty() {
                    continue;
                }

                log::info!(
                    "SSH cleanup: removing {} stale session(s): {:?}",
                    stale_ids.len(),
                    stale_ids
                );

                // Remove stale sessions under a write lock
                let mut sessions = service.sessions.write().await;
                for id in &stale_ids {
                    if let Some(mut session) = sessions.remove(id) {
                        session.status = SessionStatus::Disconnected;
                        session.close("Session timed out").await;
                    }
                }
                drop(sessions);

                // Also remove associated exec sessions
                let mut exec_sessions = service.exec_sessions.write().await;
                exec_sessions.retain(|_, es| !stale_ids.contains(&es.session_id));
            }
        });
    }

    /// Disconnect SSH session
    pub async fn disconnect(&self, session_id: &str) -> Result<()> {
        // Take the session out under a short lock, then close it (network I/O)
        // without holding the sessions lock.
        let session = self.sessions.write().await.remove(session_id);
        if let Some(mut session) = session {
            session.status = SessionStatus::Disconnected;
            session.close("User disconnected").await;
        }
        // Reap any interactive exec sessions bound to this session so a normal
        // disconnect doesn't orphan them (their child tasks end when dropped).
        self.exec_sessions
            .write()
            .await
            .retain(|_, es| es.session_id != session_id);
        Ok(())
    }

    /// Get session info
    pub async fn get_session_info(&self, session_id: &str) -> Option<SshSessionInfo> {
        self.sessions.read().await.get(session_id).map(|s| s.info())
    }

    /// Get all sessions
    pub async fn get_all_sessions(&self) -> Vec<SshSessionInfo> {
        self.sessions.read().await.values().map(|s| s.info()).collect()
    }

    /// Last-activity timestamp (epoch seconds) for a session, if it exists.
    /// Advances on both user input and inbound server data.
    pub async fn session_last_activity(&self, session_id: &str) -> Option<u64> {
        self.sessions
            .read()
            .await
            .get(session_id)
            .map(|s| s.last_activity_secs.load(Ordering::Relaxed))
    }

    /// Number of live interactive exec sessions (for diagnostics/tests).
    pub async fn exec_session_count(&self) -> usize {
        self.exec_sessions.read().await.len()
    }

    /// Check if session exists and is connected
    pub async fn is_connected(&self, session_id: &str) -> bool {
        self.sessions
            .read()
            .await
            .get(session_id)
            .map(|s| s.status == SessionStatus::Connected)
            .unwrap_or(false)
    }

    /// Check if there's an active session for a given connection_id (saved config ID)
    pub async fn is_connection_active(&self, connection_id: &str) -> bool {
        self.sessions
            .read()
            .await
            .values()
            .any(|s| s.connection_id == connection_id && s.status == SessionStatus::Connected)
    }

    /// Find active session_id by connection_id (saved config ID)
    pub async fn find_session_by_connection_id(&self, connection_id: &str) -> Option<String> {
        self.sessions
            .read()
            .await
            .values()
            .find(|s| s.connection_id == connection_id && s.status == SessionStatus::Connected)
            .map(|s| s.session_id.clone())
    }

}
