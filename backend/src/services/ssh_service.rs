//! SSH Service Implementation
//!
//! Provides SSH connection management using russh library.

use std::collections::HashMap;
use std::sync::Arc;

use anyhow::{anyhow, Result};
use async_trait::async_trait;
use futures::channel::mpsc;
use tokio::sync::RwLock;
use russh::*;
use russh_keys::*;
use uuid::Uuid;

use crate::models::{JumpHostConfig, SessionStatus, SshAuthType, SshConnectRequest, SshSessionInfo, TerminalSize};

/// SSH session handle for managing a single SSH connection
pub struct SshSession {
    pub session_id: String,
    pub connection_id: String,
    pub status: SessionStatus,
    pub host: String,
    pub username: String,
    pub port: u16,
    handle: Option<client::Handle<SshClientHandler>>,
    channel: Option<Channel<client::Msg>>,
    tx: Option<mpsc::UnboundedSender<Vec<u8>>>,
    // Store connection parameters for reconnection
    connect_request: Option<SshConnectRequest>,
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
            channel: None,
            tx: None,
            connect_request: Some(request.clone()),
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

/// SSH client handler for russh callbacks
pub struct SshClientHandler {
    pub session_id: String,
    pub data_tx: mpsc::UnboundedSender<Vec<u8>>,
    /// Terminal channel ID - only data from this channel will be forwarded to terminal
    pub terminal_channel_id: Arc<RwLock<Option<ChannelId>>>,
}

#[async_trait]
impl client::Handler for SshClientHandler {
    type Error = anyhow::Error;

    async fn check_server_key(
        &mut self,
        _server_public_key: &key::PublicKey,
    ) -> Result<bool, Self::Error> {
        // TODO: Implement proper host key verification
        // For now, accept all keys (not secure for production)
        Ok(true)
    }

    async fn data(
        &mut self,
        channel: ChannelId,
        data: &[u8],
        _session: &mut client::Session,
    ) -> Result<(), Self::Error> {
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
    ) -> Result<(), Self::Error> {
        // Only forward data from terminal channel
        if let Some(term_ch) = *self.terminal_channel_id.read().await {
            if channel == term_ch {
                let _ = self.data_tx.unbounded_send(data.to_vec());
            }
        }
        Ok(())
    }
}

/// SSH Service for managing multiple SSH sessions
pub struct SshService {
    sessions: Arc<RwLock<HashMap<String, SshSession>>>,
    /// Interactive exec sessions (for docker exec, etc.)
    exec_sessions: Arc<RwLock<HashMap<String, InteractiveExecSession>>>,
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
        }
    }

    /// Connect to SSH server with password authentication
    pub async fn connect_with_password(
        &self,
        request: SshConnectRequest,
        data_tx: mpsc::UnboundedSender<Vec<u8>>,
    ) -> Result<String> {
        let password = request
            .password
            .as_ref()
            .ok_or_else(|| anyhow!("Password is required"))?;

        let mut session = SshSession::new(&request);
        let session_id = session.session_id.clone();

        // Check if jump host is configured
        if let Some(ref jump) = request.jump_host {
            return self.connect_via_jump_host(&request, jump, data_tx).await;
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

        let handler = SshClientHandler {
            session_id: session_id.clone(),
            data_tx: data_tx.clone(),
            terminal_channel_id: terminal_channel_id_clone,
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

        session.handle = Some(handle);
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
    ) -> Result<String> {
        let private_key_str = request
            .private_key
            .as_ref()
            .ok_or_else(|| anyhow!("Private key is required"))?;

        let mut session = SshSession::new(&request);
        let session_id = session.session_id.clone();

        // Check if jump host is configured
        if let Some(ref jump) = request.jump_host {
            return self.connect_via_jump_host(&request, jump, data_tx).await;
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

        let handler = SshClientHandler {
            session_id: session_id.clone(),
            data_tx: data_tx.clone(),
            terminal_channel_id: terminal_channel_id_clone,
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

        session.handle = Some(handle);
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

        // Create a dummy handler for jump host (we won't use its data channel)
        let (dummy_tx, _dummy_rx) = mpsc::unbounded::<Vec<u8>>();
        let jump_handler = SshClientHandler {
            session_id: format!("{}-jump", session_id),
            data_tx: dummy_tx,
            terminal_channel_id: Arc::new(RwLock::new(None)),
        };

        let jump_addr = format!("{}:{}", jump.host, jump.port);
        let mut jump_handle = client::connect(jump_config, jump_addr, jump_handler).await?;

        // Authenticate to jump host
        match jump.auth_type {
            SshAuthType::Password => {
                let password = jump
                    .password
                    .as_ref()
                    .ok_or_else(|| anyhow!("Jump host password is required"))?;
                let auth_result = jump_handle
                    .authenticate_password(&jump.username, password)
                    .await?;
                if !auth_result {
                    return Err(anyhow!("Jump host password authentication failed"));
                }
            }
            SshAuthType::Key => {
                let private_key_str = jump
                    .private_key
                    .as_ref()
                    .ok_or_else(|| anyhow!("Jump host private key is required"))?;
                let key_pair = if let Some(passphrase) = &jump.passphrase {
                    decode_secret_key(private_key_str, Some(passphrase))?
                } else {
                    decode_secret_key(private_key_str, None)?
                };
                let auth_result = jump_handle
                    .authenticate_publickey(&jump.username, Arc::new(key_pair))
                    .await?;
                if !auth_result {
                    return Err(anyhow!("Jump host key authentication failed"));
                }
            }
            SshAuthType::Interactive => {
                return Err(anyhow!("Interactive auth not supported for jump host"));
            }
        }

        // Open a direct-tcpip channel to the target host through the jump host
        let channel = jump_handle
            .channel_open_direct_tcpip(
                &request.host,
                request.port as u32,
                "127.0.0.1",
                0,
            )
            .await?;

        // Note: target_handler was for a more complex tunnel approach
        // Currently using simpler ssh-through-jump-host method
        let _target_handler = SshClientHandler {
            session_id: session_id.clone(),
            data_tx: data_tx.clone(),
            terminal_channel_id: Arc::new(RwLock::new(None)),
        };

        // Create a stream from the channel for the second SSH connection
        // Note: This is a simplified implementation. In production, you'd need
        // to properly bridge the channel I/O with the SSH client.

        // For now, we'll use a simpler approach: execute ssh command on jump host
        // This is more compatible and works in most cases

        // Close the direct-tcpip channel as we'll use a different approach
        let _ = channel.close().await;

        // Open a session channel on jump host and execute ssh command
        let jump_session = jump_handle.channel_open_session().await?;

        // Request PTY on jump host
        jump_session
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

        // Execute ssh command to target
        let ssh_cmd = format!(
            "ssh -o StrictHostKeyChecking=no -p {} {}@{}",
            request.port, request.username, request.host
        );
        jump_session.exec(false, ssh_cmd).await?;

        session.handle = Some(jump_handle);
        session.channel = Some(jump_session);
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
    ) -> Result<String> {
        // Get the stored connection request
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

        // Remove old session
        self.sessions.write().await.remove(session_id);

        // Create new connection with same parameters
        match connect_request.auth_type.as_str() {
            "password" => self.connect_with_password(connect_request, data_tx).await,
            "key" => self.connect_with_key(connect_request, data_tx).await,
            _ => Err(anyhow!("Unsupported auth type for reconnection")),
        }
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
        Ok(())
    }

    /// Disconnect SSH session
    pub async fn disconnect(&self, session_id: &str) -> Result<()> {
        let mut sessions = self.sessions.write().await;
        if let Some(mut session) = sessions.remove(session_id) {
            session.status = SessionStatus::Disconnected;

            // Close channel
            if let Some(channel) = session.channel.take() {
                let _ = channel.close().await;
            }

            // Close handle
            if let Some(handle) = session.handle.take() {
                let _ = handle
                    .disconnect(Disconnect::ByApplication, "User disconnected", "")
                    .await;
            }
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
    /// Returns the channel ready for SFTP subsystem request
    pub async fn open_sftp_channel(&self, session_id: &str) -> Result<Channel<client::Msg>> {
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
            .ok_or_else(|| anyhow!("No handle available"))?;

        let channel = handle.channel_open_session().await?;
        Ok(channel)
    }

    /// Execute a command on the remote server and return output
    pub async fn exec_command(&self, session_id: &str, command: &str) -> Result<String> {
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
            .ok_or_else(|| anyhow!("No handle available"))?;

        let mut channel = handle.channel_open_session().await?;
        channel.exec(true, command).await?;

        let mut output = Vec::new();
        loop {
            match channel.wait().await {
                Some(ChannelMsg::Data { data }) => {
                    output.extend_from_slice(&data);
                }
                Some(ChannelMsg::ExtendedData { data, .. }) => {
                    output.extend_from_slice(&data);
                }
                Some(ChannelMsg::Eof) | Some(ChannelMsg::Close) | None => break,
                _ => {}
            }
        }

        Ok(String::from_utf8_lossy(&output).to_string())
    }

    /// Test SSH connection without creating a session
    pub async fn test_connection(&self, request: &SshConnectRequest) -> Result<()> {
        // Configure SSH client with shorter timeout for testing
        let config = client::Config {
            inactivity_timeout: Some(std::time::Duration::from_secs(10)),
            ..Default::default()
        };
        let config = Arc::new(config);

        // Create a dummy handler for testing
        let (dummy_tx, _dummy_rx) = mpsc::unbounded::<Vec<u8>>();
        let handler = SshClientHandler {
            session_id: "test".to_string(),
            data_tx: dummy_tx,
            terminal_channel_id: Arc::new(RwLock::new(None)),
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
            .ok_or_else(|| anyhow!("No handle available"))?;

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
