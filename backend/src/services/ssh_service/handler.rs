//! SSH client handler (russh callbacks): host-key TOFU verification and the
//! terminal data pump.

use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;

use anyhow::Result;
use async_trait::async_trait;
use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use futures::channel::mpsc;
use futures::SinkExt;
use russh::*;
use russh_keys::*;
use tokio::sync::RwLock;

use super::session::now_secs;
use crate::services::known_hosts::{HostKeyLookup, KnownHostsStore};

/// Compute the OpenSSH SHA256 fingerprint (base64, no padding) from a stored
/// host key. `key_base64` is the standard-base64 SSH public-key blob as saved
/// in known_hosts; the result matches russh's `PublicKey::fingerprint()` so the
/// changed-key dialog can show the old and new fingerprints side by side.
fn fingerprint_from_stored_key(key_base64: &str) -> String {
    match BASE64.decode(key_base64) {
        Ok(blob) => {
            let digest = ring::digest::digest(&ring::digest::SHA256, &blob);
            base64::engine::general_purpose::STANDARD_NO_PAD.encode(digest.as_ref())
        }
        Err(_) => String::new(),
    }
}

/// Payload emitted to the frontend for host key verification
#[derive(Clone, serde::Serialize)]
pub struct HostKeyVerifyPayload {
    pub session_id: String,
    pub host_port: String,
    pub key_type: String,
    pub fingerprint: String,
    /// Old fingerprint when key has changed; empty for new hosts
    pub old_fingerprint: String,
}

/// Map of pending host key verifications awaiting user response
pub type PendingKeyVerifications =
    Arc<tokio::sync::Mutex<HashMap<String, tokio::sync::oneshot::Sender<bool>>>>;

/// SSH client handler for russh callbacks
pub struct SshClientHandler {
    pub session_id: String,
    pub data_tx: mpsc::Sender<Vec<u8>>,
    /// Terminal channel ID - only data from this channel will be forwarded to terminal
    pub terminal_channel_id: Arc<RwLock<Option<ChannelId>>>,
    /// Known hosts store for TOFU verification
    pub known_hosts: Option<Arc<KnownHostsStore>>,
    /// host:port string for this connection
    pub host_port: String,
    /// Tauri AppHandle for emitting events
    pub app_handle: Option<tauri::AppHandle>,
    /// Shared map for receiving user verification responses
    pub pending_verifications: PendingKeyVerifications,
    /// The owning session's activity clock, bumped on inbound data so an
    /// actively-streaming but keyboard-idle session isn't reaped as stale.
    pub last_activity_secs: Arc<AtomicU64>,
}

#[async_trait]
impl client::Handler for SshClientHandler {
    type Error = anyhow::Error;

    async fn check_server_key(
        &mut self,
        server_public_key: &key::PublicKey,
    ) -> Result<bool, Self::Error> {
        let known_hosts = match &self.known_hosts {
            Some(kh) => kh.clone(),
            None => return Ok(true), // No store available, accept (test connections)
        };

        let key_base64 = BASE64.encode(server_public_key.public_key_bytes());
        let key_type = server_public_key.name().to_string();
        let fingerprint = server_public_key.fingerprint();

        match known_hosts.lookup(&self.host_port, &key_type, &key_base64).await {
            HostKeyLookup::Match => Ok(true),
            HostKeyLookup::Unknown => {
                let accepted = self.ask_user_verify("", &key_type, &fingerprint).await;
                if accepted {
                    self.persist_host_key(&known_hosts, &key_type, &key_base64).await;
                }
                Ok(accepted)
            }
            HostKeyLookup::Mismatch { old_key } => {
                let old_fingerprint = fingerprint_from_stored_key(&old_key);
                let accepted = self
                    .ask_user_key_changed(&key_type, &fingerprint, &old_fingerprint)
                    .await;
                if accepted {
                    self.persist_host_key(&known_hosts, &key_type, &key_base64).await;
                }
                Ok(accepted)
            }
        }
    }

    async fn data(
        &mut self,
        channel: ChannelId,
        data: &[u8],
        _session: &mut client::Session,
    ) -> std::result::Result<(), Self::Error> {
        // Inbound data means the session is alive; keep it off the stale reaper
        // even when the user isn't typing (e.g. tail -f / top).
        self.last_activity_secs.store(now_secs(), Ordering::Relaxed);
        // Only forward data from terminal channel to avoid SFTP binary data in terminal
        if let Some(term_ch) = *self.terminal_channel_id.read().await {
            if channel == term_ch {
                let _ = self.data_tx.send(data.to_vec()).await;
            }
        }
        Ok(())
    }

    async fn extended_data(
        &mut self,
        channel: ChannelId,
        _ext: u32,
        data: &[u8],
        _session: &mut client::Session,
    ) -> std::result::Result<(), Self::Error> {
        self.last_activity_secs.store(now_secs(), Ordering::Relaxed);
        // Only forward data from terminal channel
        if let Some(term_ch) = *self.terminal_channel_id.read().await {
            if channel == term_ch {
                let _ = self.data_tx.send(data.to_vec()).await;
            }
        }
        Ok(())
    }
}

impl SshClientHandler {
    /// Ask the user to verify a new (unknown) host key via Tauri event
    async fn ask_user_verify(&self, _old_fp: &str, key_type: &str, fingerprint: &str) -> bool {
        self.emit_and_await("ssh-host-key-verify", key_type, fingerprint, "").await
    }

    /// Persist an accepted host key, logging (not swallowing) a write failure so
    /// the user isn't silently re-prompted for the same host on every restart.
    async fn persist_host_key(&self, store: &KnownHostsStore, key_type: &str, key_base64: &str) {
        if let Err(e) = store.add(&self.host_port, key_type, key_base64).await {
            log::warn!("Failed to persist host key for {}: {}", self.host_port, e);
        }
    }

    /// Ask the user about a changed host key via Tauri event
    async fn ask_user_key_changed(
        &self,
        key_type: &str,
        fingerprint: &str,
        old_fingerprint: &str,
    ) -> bool {
        self.emit_and_await("ssh-host-key-changed", key_type, fingerprint, old_fingerprint)
            .await
    }

    /// Emit a host key event and wait for user response
    async fn emit_and_await(
        &self,
        event_prefix: &str,
        key_type: &str,
        fingerprint: &str,
        old_fingerprint: &str,
    ) -> bool {
        let app_handle = match &self.app_handle {
            Some(h) => h,
            None => return true, // No app handle => accept (test mode)
        };

        let payload = HostKeyVerifyPayload {
            session_id: self.session_id.clone(),
            host_port: self.host_port.clone(),
            key_type: key_type.to_string(),
            fingerprint: fingerprint.to_string(),
            old_fingerprint: old_fingerprint.to_string(),
        };

        let (tx, rx) = tokio::sync::oneshot::channel::<bool>();
        {
            let mut pending = self.pending_verifications.lock().await;
            pending.insert(self.session_id.clone(), tx);
        }

        // Emit without session_id suffix; session_id is in the payload
        let event_name = event_prefix.to_string();
        if let Err(e) = tauri::Emitter::emit(app_handle, &event_name, payload) {
            log::error!("Failed to emit host key event: {}", e);
            self.pending_verifications.lock().await.remove(&self.session_id);
            return false;
        }

        // Wait for user response with a timeout
        match tokio::time::timeout(std::time::Duration::from_secs(120), rx).await {
            Ok(Ok(accepted)) => accepted,
            _ => {
                self.pending_verifications.lock().await.remove(&self.session_id);
                false
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The fingerprint computed from a stored key must match OpenSSH /
    /// russh output (`SHA256:<base64-nopad>`) so the changed-key dialog shows a
    /// real, comparable fingerprint. Vector from `ssh-keygen -t ed25519`.
    #[test]
    fn fingerprint_matches_openssh() {
        let blob = "AAAAC3NzaC1lZDI1NTE5AAAAIL9FPZ1VL8PpD8ZMQGYmr9AhQA2ff72aoIwapTuG2iop";
        let expected = "fZPJbgZc8Eq+RJLq6xjhBBCKLkXgTSaE36ikExiz7Gw";
        assert_eq!(fingerprint_from_stored_key(blob), expected);
    }

    /// A corrupt / non-base64 stored key yields an empty fingerprint instead of
    /// panicking.
    #[test]
    fn fingerprint_of_garbage_is_empty() {
        assert_eq!(fingerprint_from_stored_key("!!!not-base64!!!"), "");
    }
}
