//! SSH Service Implementation
//!
//! Provides SSH connection management using russh library.

use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;

use anyhow::{anyhow, Result};
use async_trait::async_trait;
use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use futures::channel::mpsc;
use russh::*;
use russh_keys::*;
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::Mutex as TokioMutex;
use tokio::sync::RwLock;
use tokio::task::JoinHandle;
use uuid::Uuid;

use super::known_hosts::{HostKeyLookup, KnownHostsStore};
use crate::models::{
    DatabaseSshTunnelConfig, JumpHostConfig, SessionStatus, SshAuthType, SshConnectRequest,
    SshSessionInfo, TerminalSize,
};

/// Get current epoch seconds
fn now_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

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

/// Authenticate a freshly-connected handle using the target credentials carried
/// in the connect request (password or private key). Returns Err on failure.
async fn authenticate_target(
    handle: &mut client::Handle<SshClientHandler>,
    request: &SshConnectRequest,
) -> Result<()> {
    let ok = match request.auth_type.as_str() {
        "password" => {
            let password = request
                .password
                .as_ref()
                .ok_or_else(|| anyhow!("Password is required"))?;
            handle.authenticate_password(&request.username, password).await?
        }
        "key" => {
            let private_key_str = request
                .private_key
                .as_ref()
                .ok_or_else(|| anyhow!("Private key is required"))?;
            let key_pair = decode_secret_key(private_key_str, request.passphrase.as_deref())?;
            handle
                .authenticate_publickey(&request.username, Arc::new(key_pair))
                .await?
        }
        _ => return Err(anyhow!("Unsupported authentication type")),
    };
    if !ok {
        return Err(anyhow!("Authentication failed"));
    }
    Ok(())
}

/// Authenticate to a jump host (bastion) using its own credentials.
async fn authenticate_jump(
    handle: &mut client::Handle<SshClientHandler>,
    jump: &JumpHostConfig,
) -> Result<()> {
    let ok = match jump.auth_type {
        SshAuthType::Password => {
            let password = jump
                .password
                .as_ref()
                .ok_or_else(|| anyhow!("Jump host password is required"))?;
            handle.authenticate_password(&jump.username, password).await?
        }
        SshAuthType::Key => {
            let private_key_str = jump
                .private_key
                .as_ref()
                .ok_or_else(|| anyhow!("Jump host private key is required"))?;
            let key_pair = decode_secret_key(private_key_str, jump.passphrase.as_deref())?;
            handle
                .authenticate_publickey(&jump.username, Arc::new(key_pair))
                .await?
        }
        SshAuthType::Interactive => {
            return Err(anyhow!("Interactive auth not supported for jump host"))
        }
    };
    if !ok {
        return Err(anyhow!("Jump host authentication failed"));
    }
    Ok(())
}

/// Open a shell channel with a PTY and UTF-8 locale, recording the channel id
/// so only its output is forwarded to the terminal.
async fn open_terminal_shell(
    handle: &client::Handle<SshClientHandler>,
    size: TerminalSize,
    terminal_channel_id: &Arc<RwLock<Option<ChannelId>>>,
) -> Result<Channel<client::Msg>> {
    let channel = handle.channel_open_session().await?;
    *terminal_channel_id.write().await = Some(channel.id());
    channel
        .request_pty(false, "xterm-256color", size.cols, size.rows, 0, 0, &[])
        .await?;
    let _ = channel.set_env(false, "LANG", "en_US.UTF-8").await;
    let _ = channel.set_env(false, "LC_ALL", "en_US.UTF-8").await;
    channel.request_shell(false).await?;
    Ok(channel)
}

/// SSH session handle for managing a single SSH connection
pub struct SshSession {
    pub session_id: String,
    pub connection_id: String,
    pub status: SessionStatus,
    pub host: String,
    pub username: String,
    pub port: u16,
    /// Shared so exec/SFTP paths can clone it out and release the sessions lock
    /// before doing network I/O (russh's Handle is not Clone; Arc is).
    handle: Option<Arc<client::Handle<SshClientHandler>>>,
    /// Bastion connection kept alive for jump-host sessions so the direct-tcpip
    /// channel carrying the target session stays open. None for direct sessions.
    jump_handle: Option<Arc<client::Handle<SshClientHandler>>>,
    channel: Option<Channel<client::Msg>>,
    tx: Option<mpsc::UnboundedSender<Vec<u8>>>,
    // Store connection parameters for reconnection
    connect_request: Option<SshConnectRequest>,
    /// Last activity timestamp (epoch seconds) for auto-cleanup
    last_activity_secs: Arc<AtomicU64>,
}

/// Commands for interactive exec sessions
pub enum ExecCommand {
    WriteData(Vec<u8>),
    Resize(u16, u16),
    Close,
}

/// Interactive exec session for docker exec or other PTY commands
pub struct InteractiveExecSession {
    pub exec_id: String,
    pub session_id: String,
    command_tx: tokio::sync::mpsc::UnboundedSender<ExecCommand>,
}

/// Local SSH tunnel handle. Dropping it aborts the listener and disconnects the SSH client.
pub struct SshTunnelHandle {
    pub local_host: String,
    pub local_port: u16,
    task: JoinHandle<()>,
    handle: Arc<TokioMutex<client::Handle<SshClientHandler>>>,
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
    fn new(request: &SshConnectRequest) -> Self {
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
    async fn close(&mut self, reason: &str) {
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
    pub data_tx: mpsc::UnboundedSender<Vec<u8>>,
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

        match known_hosts.lookup(&self.host_port, &key_base64).await {
            HostKeyLookup::Match => Ok(true),
            HostKeyLookup::Unknown => {
                let accepted = self.ask_user_verify("", &key_type, &fingerprint).await;
                if accepted {
                    let _ = known_hosts.add(&self.host_port, &key_type, &key_base64).await;
                }
                Ok(accepted)
            }
            HostKeyLookup::Mismatch { old_key } => {
                let old_fingerprint = fingerprint_from_stored_key(&old_key);
                let accepted = self
                    .ask_user_key_changed(&key_type, &fingerprint, &old_fingerprint)
                    .await;
                if accepted {
                    let _ = known_hosts.add(&self.host_port, &key_type, &key_base64).await;
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
        // Only forward data from terminal channel to avoid SFTP binary data in terminal
        if let Some(term_ch) = *self.terminal_channel_id.read().await {
            if channel == term_ch {
                let _ = self.data_tx.unbounded_send(data.to_vec());
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
        // Only forward data from terminal channel
        if let Some(term_ch) = *self.terminal_channel_id.read().await {
            if channel == term_ch {
                let _ = self.data_tx.unbounded_send(data.to_vec());
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

    /// Open a local TCP tunnel to `target_host:target_port` through an SSH server.
    pub async fn open_local_tunnel(
        &self,
        tunnel: &DatabaseSshTunnelConfig,
        target_host: String,
        target_port: u16,
        app_handle: Option<tauri::AppHandle>,
    ) -> Result<SshTunnelHandle> {
        let config = client::Config {
            inactivity_timeout: Some(std::time::Duration::from_secs(3600)),
            keepalive_interval: Some(std::time::Duration::from_secs(15)),
            keepalive_max: 3,
            ..Default::default()
        };
        let config = Arc::new(config);

        let (dummy_tx, _dummy_rx) = mpsc::unbounded::<Vec<u8>>();
        let session_id = Uuid::new_v4().to_string();
        let host_port = format!("{}:{}", tunnel.host, tunnel.port);
        let handler = SshClientHandler {
            session_id,
            data_tx: dummy_tx,
            terminal_channel_id: Arc::new(RwLock::new(None)),
            known_hosts: self.known_hosts.clone(),
            host_port,
            app_handle,
            pending_verifications: self.pending_verifications.clone(),
        };

        let addr = format!("{}:{}", tunnel.host, tunnel.port);
        let mut handle = client::connect(config, addr, handler).await?;

        match tunnel.auth_type {
            SshAuthType::Password => {
                let password = tunnel
                    .password
                    .as_ref()
                    .ok_or_else(|| anyhow!("SSH tunnel password is required"))?;
                let auth_result = handle
                    .authenticate_password(&tunnel.username, password)
                    .await?;
                if !auth_result {
                    return Err(anyhow!("SSH tunnel password authentication failed"));
                }
            }
            SshAuthType::Key => {
                let private_key_str = tunnel
                    .private_key
                    .as_ref()
                    .ok_or_else(|| anyhow!("SSH tunnel private key is required"))?;
                let key_pair = if let Some(passphrase) = &tunnel.passphrase {
                    decode_secret_key(private_key_str, Some(passphrase))?
                } else {
                    decode_secret_key(private_key_str, None)?
                };
                let auth_result = handle
                    .authenticate_publickey(&tunnel.username, Arc::new(key_pair))
                    .await?;
                if !auth_result {
                    return Err(anyhow!("SSH tunnel key authentication failed"));
                }
            }
            SshAuthType::Interactive => {
                return Err(anyhow!("Interactive auth not supported for database SSH tunnel"));
            }
        }

        let listener = TcpListener::bind("127.0.0.1:0").await?;
        let local_port = listener.local_addr()?.port();
        let local_host = "127.0.0.1".to_string();
        let handle = Arc::new(TokioMutex::new(handle));
        let tunnel_handle = handle.clone();

        let task = tokio::spawn(async move {
            loop {
                let (local_stream, _) = match listener.accept().await {
                    Ok(pair) => pair,
                    Err(err) => {
                        log::error!("SSH tunnel listener failed: {}", err);
                        break;
                    }
                };

                let handle = tunnel_handle.clone();
                let target_host = target_host.clone();
                tokio::spawn(async move {
                    if let Err(err) = Self::forward_tunnel_stream(handle, local_stream, target_host, target_port).await {
                        log::error!("SSH tunnel stream failed: {}", err);
                    }
                });
            }
        });

        Ok(SshTunnelHandle {
            local_host,
            local_port,
            task,
            handle,
        })
    }

    async fn forward_tunnel_stream(
        handle: Arc<TokioMutex<client::Handle<SshClientHandler>>>,
        mut local_stream: TcpStream,
        target_host: String,
        target_port: u16,
    ) -> Result<()> {
        let channel = handle
            .lock()
            .await
            .channel_open_direct_tcpip(&target_host, target_port as u32, "127.0.0.1", 0)
            .await?;
        let mut remote_stream = channel.into_stream();
        let _ = tokio::io::copy_bidirectional(&mut local_stream, &mut remote_stream).await?;
        Ok(())
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


    /// Connect to SSH server with password authentication
    pub async fn connect_with_password(
        &self,
        request: SshConnectRequest,
        data_tx: mpsc::UnboundedSender<Vec<u8>>,
        app_handle: Option<tauri::AppHandle>,
    ) -> Result<String> {
        let password = request
            .password
            .as_ref()
            .ok_or_else(|| anyhow!("Password is required"))?;

        let mut session = SshSession::new(&request);
        let session_id = session.session_id.clone();

        // Check if jump host is configured
        if let Some(ref jump) = request.jump_host {
            return self.connect_via_jump_host(&request, jump, data_tx, app_handle).await;
        }

        // Configure SSH client with keepalive to prevent timeout during file transfers
        let config = client::Config {
            inactivity_timeout: Some(std::time::Duration::from_secs(3600)),
            keepalive_interval: Some(std::time::Duration::from_secs(15)),
            keepalive_max: 3,
            ..Default::default()
        };
        let config = Arc::new(config);

        // Create shared terminal channel ID for filtering data
        let terminal_channel_id = Arc::new(RwLock::new(None));
        let terminal_channel_id_clone = terminal_channel_id.clone();

        let host_port = format!("{}:{}", request.host, request.port);
        let handler = SshClientHandler {
            session_id: session_id.clone(),
            data_tx: data_tx.clone(),
            terminal_channel_id: terminal_channel_id_clone,
            known_hosts: self.known_hosts.clone(),
            host_port,
            app_handle: app_handle.clone(),
            pending_verifications: self.pending_verifications.clone(),
        };

        // Connect to server
        let addr = format!("{}:{}", request.host, request.port);
        let mut handle = client::connect(config, addr, handler).await?;

        // Authenticate with password
        let auth_result = handle
            .authenticate_password(&request.username, password)
            .await?;

        if !auth_result {
            return Err(anyhow!("Password authentication failed"));
        }

        // Open a shell channel
        let channel = handle.channel_open_session().await?;

        // Store terminal channel ID for filtering data
        *terminal_channel_id.write().await = Some(channel.id());

        // Request PTY
        channel
            .request_pty(
                false,
                "xterm-256color",
                request.terminal_size.cols,
                request.terminal_size.rows,
                0,
                0,
                &[],
            )
            .await?;

        // Set UTF-8 locale environment variables
        let _ = channel.set_env(false, "LANG", "en_US.UTF-8").await;
        let _ = channel.set_env(false, "LC_ALL", "en_US.UTF-8").await;

        // Request shell
        channel.request_shell(false).await?;

        session.handle = Some(Arc::new(handle));
        session.channel = Some(channel);
        session.tx = Some(data_tx);
        session.status = SessionStatus::Connected;

        // Store session
        self.sessions.write().await.insert(session_id.clone(), session);

        Ok(session_id)
    }

    /// Connect to SSH server with private key authentication
    pub async fn connect_with_key(
        &self,
        request: SshConnectRequest,
        data_tx: mpsc::UnboundedSender<Vec<u8>>,
        app_handle: Option<tauri::AppHandle>,
    ) -> Result<String> {
        let private_key_str = request
            .private_key
            .as_ref()
            .ok_or_else(|| anyhow!("Private key is required"))?;

        let mut session = SshSession::new(&request);
        let session_id = session.session_id.clone();

        // Check if jump host is configured
        if let Some(ref jump) = request.jump_host {
            return self.connect_via_jump_host(&request, jump, data_tx, app_handle).await;
        }

        // Parse private key
        let key_pair = if let Some(passphrase) = &request.passphrase {
            decode_secret_key(private_key_str, Some(passphrase))?
        } else {
            decode_secret_key(private_key_str, None)?
        };

        // Configure SSH client with keepalive to prevent timeout during file transfers
        let config = client::Config {
            inactivity_timeout: Some(std::time::Duration::from_secs(3600)),
            keepalive_interval: Some(std::time::Duration::from_secs(15)),
            keepalive_max: 3,
            ..Default::default()
        };
        let config = Arc::new(config);

        // Create shared terminal channel ID for filtering data
        let terminal_channel_id = Arc::new(RwLock::new(None));
        let terminal_channel_id_clone = terminal_channel_id.clone();

        let host_port = format!("{}:{}", request.host, request.port);
        let handler = SshClientHandler {
            session_id: session_id.clone(),
            data_tx: data_tx.clone(),
            terminal_channel_id: terminal_channel_id_clone,
            known_hosts: self.known_hosts.clone(),
            host_port,
            app_handle: app_handle.clone(),
            pending_verifications: self.pending_verifications.clone(),
        };

        // Connect to server
        let addr = format!("{}:{}", request.host, request.port);
        let mut handle = client::connect(config, addr, handler).await?;

        // Authenticate with public key
        let auth_result = handle
            .authenticate_publickey(&request.username, Arc::new(key_pair))
            .await?;

        if !auth_result {
            return Err(anyhow!("Public key authentication failed"));
        }

        // Open a shell channel
        let channel = handle.channel_open_session().await?;

        // Store terminal channel ID for filtering data
        *terminal_channel_id.write().await = Some(channel.id());

        // Request PTY
        channel
            .request_pty(
                false,
                "xterm-256color",
                request.terminal_size.cols,
                request.terminal_size.rows,
                0,
                0,
                &[],
            )
            .await?;

        // Set UTF-8 locale environment variables
        let _ = channel.set_env(false, "LANG", "en_US.UTF-8").await;
        let _ = channel.set_env(false, "LC_ALL", "en_US.UTF-8").await;

        // Request shell
        channel.request_shell(false).await?;

        session.handle = Some(Arc::new(handle));
        session.channel = Some(channel);
        session.tx = Some(data_tx);
        session.status = SessionStatus::Connected;

        // Store session
        self.sessions.write().await.insert(session_id.clone(), session);

        Ok(session_id)
    }

    /// Connect via jump host (bastion/proxy)
    async fn connect_via_jump_host(
        &self,
        request: &SshConnectRequest,
        jump: &JumpHostConfig,
        data_tx: mpsc::UnboundedSender<Vec<u8>>,
        app_handle: Option<tauri::AppHandle>,
    ) -> Result<String> {
        let mut session = SshSession::new(request);
        let session_id = session.session_id.clone();

        // First, connect to jump host with keepalive
        let jump_config = client::Config {
            inactivity_timeout: Some(std::time::Duration::from_secs(3600)),
            keepalive_interval: Some(std::time::Duration::from_secs(15)),
            keepalive_max: 3,
            ..Default::default()
        };
        let jump_config = Arc::new(jump_config);

        // Create handler for jump host with TOFU
        let (dummy_tx, _dummy_rx) = mpsc::unbounded::<Vec<u8>>();
        let jump_host_port = format!("{}:{}", jump.host, jump.port);
        let jump_handler = SshClientHandler {
            session_id: format!("{}-jump", session_id),
            data_tx: dummy_tx,
            terminal_channel_id: Arc::new(RwLock::new(None)),
            known_hosts: self.known_hosts.clone(),
            host_port: jump_host_port,
            app_handle: app_handle.clone(),
            pending_verifications: self.pending_verifications.clone(),
        };

        let jump_addr = format!("{}:{}", jump.host, jump.port);
        let mut jump_handle = client::connect(jump_config, jump_addr, jump_handler).await?;

        // Authenticate to the jump host with its own credentials.
        authenticate_jump(&mut jump_handle, jump).await?;

        // Open a direct-tcpip channel through the bastion to the target, then run
        // a full second SSH session over it. The target handler verifies the
        // TARGET's host key against the app's known_hosts store (real TOFU) — the
        // bastion is never asked to trust the target on our behalf, and no shell
        // `ssh` command (with its accept-new bypass) is ever executed.
        let channel = jump_handle
            .channel_open_direct_tcpip(&request.host, request.port as u32, "127.0.0.1", 0)
            .await?;
        let stream = channel.into_stream();

        let target_config = Arc::new(client::Config {
            inactivity_timeout: Some(std::time::Duration::from_secs(3600)),
            keepalive_interval: Some(std::time::Duration::from_secs(15)),
            keepalive_max: 3,
            ..Default::default()
        });
        let terminal_channel_id = Arc::new(RwLock::new(None));
        let target_handler = SshClientHandler {
            session_id: session_id.clone(),
            data_tx: data_tx.clone(),
            terminal_channel_id: terminal_channel_id.clone(),
            known_hosts: self.known_hosts.clone(),
            host_port: format!("{}:{}", request.host, request.port),
            app_handle: app_handle.clone(),
            pending_verifications: self.pending_verifications.clone(),
        };
        let mut target_handle =
            client::connect_stream(target_config, stream, target_handler).await?;

        // Authenticate to the target with the target's own credentials.
        authenticate_target(&mut target_handle, request).await?;

        // Open the interactive shell on the target.
        let channel =
            open_terminal_shell(&target_handle, request.terminal_size, &terminal_channel_id)
                .await?;

        session.handle = Some(Arc::new(target_handle));
        session.jump_handle = Some(Arc::new(jump_handle));
        session.channel = Some(channel);
        session.tx = Some(data_tx);
        session.status = SessionStatus::Connected;

        // Store session
        self.sessions.write().await.insert(session_id.clone(), session);

        Ok(session_id)
    }

    /// Reconnect a disconnected session
    pub async fn reconnect(
        &self,
        session_id: &str,
        data_tx: mpsc::UnboundedSender<Vec<u8>>,
        app_handle: Option<tauri::AppHandle>,
    ) -> Result<String> {
        // Get the stored connection request.
        let connect_request = {
            let sessions = self.sessions.read().await;
            let session = sessions
                .get(session_id)
                .ok_or_else(|| anyhow!("Session not found"))?;
            session
                .connect_request
                .clone()
                .ok_or_else(|| anyhow!("No connection info stored for reconnection"))?
        };

        // Cleanly tear down the old session (channel + target + bastion) before
        // reconnecting, rather than dropping it and leaking an unclean close.
        if let Some(mut old) = self.sessions.write().await.remove(session_id) {
            old.close("Reconnecting").await;
        }

        // Reconnect with the same parameters. connect_* stores the fresh session
        // under a brand-new id.
        let temp_id = match connect_request.auth_type.as_str() {
            "password" => {
                self.connect_with_password(connect_request, data_tx, app_handle)
                    .await?
            }
            "key" => self.connect_with_key(connect_request, data_tx, app_handle).await?,
            _ => return Err(anyhow!("Unsupported auth type for reconnection")),
        };

        // Re-key the fresh session back to the ORIGINAL session id. The frontend
        // keeps listening on ssh-data-<id> / ssh-status-<id> for the id it already
        // holds; reusing it keeps the reconnected terminal live instead of leaving
        // the UI bound to an orphaned id (a silently-dead terminal).
        if temp_id != session_id {
            let mut sessions = self.sessions.write().await;
            if let Some(mut sess) = sessions.remove(&temp_id) {
                sess.session_id = session_id.to_string();
                sessions.insert(session_id.to_string(), sess);
            }
        }

        Ok(session_id.to_string())
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
        let mut sessions = self.sessions.write().await;
        if let Some(mut session) = sessions.remove(session_id) {
            session.status = SessionStatus::Disconnected;
            session.close("User disconnected").await;
        }
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

    /// Open a new channel for SFTP on an existing SSH connection
    /// Clone out a connected session's SSH handle under a short read lock, so
    /// callers can perform network I/O (channel open, exec, output drain)
    /// without holding the sessions lock across an await. Holding it would let a
    /// slow/hung command block every writer (connect/disconnect/reconnect) and,
    /// via the write-fair RwLock, freeze the whole SSH service.
    async fn connected_handle(
        &self,
        session_id: &str,
    ) -> Result<Arc<client::Handle<SshClientHandler>>> {
        let sessions = self.sessions.read().await;
        let session = sessions
            .get(session_id)
            .ok_or_else(|| anyhow!("Session not found"))?;
        if session.status != SessionStatus::Connected {
            return Err(anyhow!("Session not connected"));
        }
        let handle = session
            .handle
            .as_ref()
            .ok_or_else(|| anyhow!("No handle available"))?
            .clone();
        Ok(handle)
    }

    /// Returns the channel ready for SFTP subsystem request
    pub async fn open_sftp_channel(&self, session_id: &str) -> Result<Channel<client::Msg>> {
        let handle = self.connected_handle(session_id).await?;
        let channel = handle.channel_open_session().await?;
        Ok(channel)
    }

    /// Execute a command on the remote server and return output
    pub async fn exec_command(&self, session_id: &str, command: &str) -> Result<String> {
        let handle = self.connected_handle(session_id).await?;

        let mut channel = handle.channel_open_session().await?;
        channel.exec(true, command).await?;

        const MAX_EXEC_OUTPUT_SIZE: usize = 10 * 1024 * 1024; // 10MB

        let mut output = Vec::new();
        let mut truncated = false;
        loop {
            match channel.wait().await {
                Some(ChannelMsg::Data { data }) => {
                    if output.len() + data.len() > MAX_EXEC_OUTPUT_SIZE {
                        let remaining = MAX_EXEC_OUTPUT_SIZE - output.len();
                        output.extend_from_slice(&data[..remaining]);
                        truncated = true;
                        break;
                    }
                    output.extend_from_slice(&data);
                }
                Some(ChannelMsg::ExtendedData { data, .. }) => {
                    if output.len() + data.len() > MAX_EXEC_OUTPUT_SIZE {
                        let remaining = MAX_EXEC_OUTPUT_SIZE - output.len();
                        output.extend_from_slice(&data[..remaining]);
                        truncated = true;
                        break;
                    }
                    output.extend_from_slice(&data);
                }
                Some(ChannelMsg::Eof) | Some(ChannelMsg::Close) | None => break,
                _ => {}
            }
        }

        let mut result = String::from_utf8_lossy(&output).to_string();
        if truncated {
            result.push_str("\n\n[Output truncated: exceeded 10MB limit]");
        }
        Ok(result)
    }

    /// Test SSH connection without creating a session
    pub async fn test_connection(
        &self,
        request: &SshConnectRequest,
        app_handle: Option<tauri::AppHandle>,
    ) -> Result<()> {
        // Configure SSH client with shorter timeout for testing
        let config = client::Config {
            inactivity_timeout: Some(std::time::Duration::from_secs(10)),
            ..Default::default()
        };
        let config = Arc::new(config);

        // Verify the host key against the real known-hosts store (same TOFU path
        // as a real connection). A spoofed host must not silently pass the test
        // and harvest the credentials we are about to send.
        let (dummy_tx, _dummy_rx) = mpsc::unbounded::<Vec<u8>>();
        let handler = SshClientHandler {
            session_id: format!("test-{}", Uuid::new_v4()),
            data_tx: dummy_tx,
            terminal_channel_id: Arc::new(RwLock::new(None)),
            known_hosts: self.known_hosts.clone(),
            host_port: format!("{}:{}", request.host, request.port),
            app_handle,
            pending_verifications: self.pending_verifications.clone(),
        };

        // Connect to server
        let addr = format!("{}:{}", request.host, request.port);
        let mut handle = client::connect(config, addr, handler).await?;

        // Authenticate based on auth type
        let auth_result = match request.auth_type.as_str() {
            "password" => {
                let password = request
                    .password
                    .as_ref()
                    .ok_or_else(|| anyhow!("Password is required"))?;
                handle.authenticate_password(&request.username, password).await?
            }
            "key" => {
                let private_key_str = request
                    .private_key
                    .as_ref()
                    .ok_or_else(|| anyhow!("Private key is required"))?;
                let key_pair = if let Some(passphrase) = &request.passphrase {
                    decode_secret_key(private_key_str, Some(passphrase))?
                } else {
                    decode_secret_key(private_key_str, None)?
                };
                handle.authenticate_publickey(&request.username, Arc::new(key_pair)).await?
            }
            _ => return Err(anyhow!("Unsupported authentication type")),
        };

        if !auth_result {
            return Err(anyhow!("Authentication failed"));
        }

        // Disconnect immediately after successful test
        let _ = handle
            .disconnect(Disconnect::ByApplication, "Connection test completed", "")
            .await;

        Ok(())
    }

    // ========== Interactive Exec Methods (for docker exec, etc.) ==========

    /// Start an interactive exec session with PTY
    /// Returns exec_id for subsequent operations
    pub async fn exec_interactive_start(
        &self,
        session_id: &str,
        command: &str,
        cols: u16,
        rows: u16,
        output_tx: mpsc::UnboundedSender<Vec<u8>>,
    ) -> Result<String> {
        let handle = self.connected_handle(session_id).await?;

        // Open a new channel
        let mut channel = handle.channel_open_session().await?;

        // Request PTY
        channel
            .request_pty(
                false,
                "xterm-256color",
                cols.into(),
                rows.into(),
                0,
                0,
                &[],
            )
            .await?;

        // Execute the command
        channel.exec(true, command).await?;

        let exec_id = Uuid::new_v4().to_string();
        let exec_id_clone = exec_id.clone();

        // Create command channel for sending data/resize/close commands
        let (command_tx, mut command_rx) = tokio::sync::mpsc::unbounded_channel::<ExecCommand>();

        // Spawn a task that owns the channel, reads output, and handles commands
        tokio::spawn(async move {
            log::debug!("Interactive exec task started for {}", exec_id_clone);
            loop {
                tokio::select! {
                    // Handle incoming commands
                    cmd = command_rx.recv() => {
                        match cmd {
                            Some(ExecCommand::WriteData(data)) => {
                                if let Err(e) = channel.data(&data[..]).await {
                                    log::error!("Failed to write data to exec session: {}", e);
                                    break;
                                }
                            }
                            Some(ExecCommand::Resize(cols, rows)) => {
                                log::debug!("Exec {} resize to {}x{}", exec_id_clone, cols, rows);
                                if let Err(e) = channel.window_change(cols.into(), rows.into(), 0, 0).await {
                                    log::error!("Failed to resize exec session: {}", e);
                                }
                            }
                            Some(ExecCommand::Close) | None => {
                                log::debug!("Exec {} received close command", exec_id_clone);
                                let _ = channel.close().await;
                                break;
                            }
                        }
                    }
                    // Handle channel output
                    msg = channel.wait() => {
                        match msg {
                            Some(ChannelMsg::Data { data }) => {
                                if output_tx.unbounded_send(data.to_vec()).is_err() {
                                    log::error!("Exec {} failed to forward data to output_tx", exec_id_clone);
                                    break;
                                }
                            }
                            Some(ChannelMsg::ExtendedData { data, .. }) => {
                                if output_tx.unbounded_send(data.to_vec()).is_err() {
                                    log::error!("Exec {} failed to forward extended data to output_tx", exec_id_clone);
                                    break;
                                }
                            }
                            Some(ChannelMsg::Eof) | Some(ChannelMsg::Close) | None => {
                                log::debug!("Exec {} channel EOF/Close/None", exec_id_clone);
                                break;
                            }
                            _ => {}
                        }
                    }
                }
            }
            log::debug!("Interactive exec session {} ended", exec_id_clone);
        });

        // Store the session with command sender
        let exec_session = InteractiveExecSession {
            exec_id: exec_id.clone(),
            session_id: session_id.to_string(),
            command_tx,
        };

        self.exec_sessions.write().await.insert(exec_id.clone(), exec_session);

        Ok(exec_id)
    }

    /// Send data to an interactive exec session
    pub async fn exec_interactive_send_data(&self, exec_id: &str, data: &[u8]) -> Result<()> {
        let exec_sessions = self.exec_sessions.read().await;
        let exec_session = exec_sessions
            .get(exec_id)
            .ok_or_else(|| anyhow!("Exec session not found"))?;

        exec_session
            .command_tx
            .send(ExecCommand::WriteData(data.to_vec()))
            .map_err(|e| {
                log::error!("Failed to send data to exec session: {:?}", e);
                anyhow!("Failed to send data to exec session")
            })?;

        Ok(())
    }

    /// Resize an interactive exec session's PTY
    pub async fn exec_interactive_resize(&self, exec_id: &str, cols: u16, rows: u16) -> Result<()> {
        let exec_sessions = self.exec_sessions.read().await;
        let exec_session = exec_sessions
            .get(exec_id)
            .ok_or_else(|| anyhow!("Exec session not found"))?;

        exec_session
            .command_tx
            .send(ExecCommand::Resize(cols, rows))
            .map_err(|_| anyhow!("Failed to send resize to exec session"))?;
        Ok(())
    }

    /// Close an interactive exec session
    pub async fn exec_interactive_close(&self, exec_id: &str) -> Result<()> {
        if let Some(exec_session) = self.exec_sessions.write().await.remove(exec_id) {
            let _ = exec_session.command_tx.send(ExecCommand::Close);
        }
        Ok(())
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
