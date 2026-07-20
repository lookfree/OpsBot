//! SshService connection paths: direct/key/jump-host connect, reconnect, local
//! SSH tunnels, and connection testing.

use std::sync::atomic::AtomicU64;
use std::sync::Arc;

use anyhow::{anyhow, Result};
use futures::channel::mpsc;
use russh::*;
use russh_keys::*;
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::Mutex as TokioMutex;
use tokio::sync::RwLock;
use uuid::Uuid;

use super::handler::{PendingKeyVerifications, SshClientHandler};
use super::session::{SshSession, SshTunnelHandle};
use super::SshService;
use crate::services::KnownHostsStore;
use crate::models::{
    DatabaseSshTunnelConfig, JumpHostConfig, SessionStatus, SshAuthType, SshConnectRequest,
    TerminalSize,
};

/// Timeout for the TCP connect + SSH handshake. russh's `inactivity_timeout`
/// only bounds post-handshake idle, so without this a firewalled or black-holed
/// host would hang the task for the OS TCP timeout (~1-2 min).
const CONNECT_TIMEOUT_SECS: u64 = 20;

/// Bound a connect/handshake future so a dead host fails fast with a clear
/// error instead of hanging.
async fn with_connect_timeout<T>(
    fut: impl std::future::Future<Output = Result<T>>,
) -> Result<T> {
    match tokio::time::timeout(std::time::Duration::from_secs(CONNECT_TIMEOUT_SECS), fut).await {
        Ok(res) => res,
        Err(_) => Err(anyhow!("Connection timed out after {}s", CONNECT_TIMEOUT_SECS)),
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

/// Everything needed to (re)establish a database SSH tunnel's connection, so a
/// dropped tunnel can self-heal on the next use instead of staying broken until
/// the app restarts.
struct TunnelConnector {
    config: Arc<client::Config>,
    addr: String,
    host_port: String,
    tunnel: DatabaseSshTunnelConfig,
    known_hosts: Option<Arc<KnownHostsStore>>,
    pending_verifications: PendingKeyVerifications,
    app_handle: Option<tauri::AppHandle>,
}

impl TunnelConnector {
    /// Open a fresh authenticated SSH connection for the tunnel.
    async fn connect(&self) -> Result<client::Handle<SshClientHandler>> {
        let (dummy_tx, _dummy_rx) = mpsc::channel::<Vec<u8>>(1);
        let handler = SshClientHandler {
            session_id: Uuid::new_v4().to_string(),
            data_tx: dummy_tx,
            terminal_channel_id: Arc::new(RwLock::new(None)),
            known_hosts: self.known_hosts.clone(),
            host_port: self.host_port.clone(),
            app_handle: self.app_handle.clone(),
            pending_verifications: self.pending_verifications.clone(),
            last_activity_secs: Arc::new(AtomicU64::new(0)),
        };

        let mut handle =
            with_connect_timeout(client::connect(self.config.clone(), self.addr.clone(), handler))
                .await?;

        match self.tunnel.auth_type {
            SshAuthType::Password => {
                let password = self
                    .tunnel
                    .password
                    .as_ref()
                    .ok_or_else(|| anyhow!("SSH tunnel password is required"))?;
                if !handle
                    .authenticate_password(&self.tunnel.username, password)
                    .await?
                {
                    return Err(anyhow!("SSH tunnel password authentication failed"));
                }
            }
            SshAuthType::Key => {
                let private_key_str = self
                    .tunnel
                    .private_key
                    .as_ref()
                    .ok_or_else(|| anyhow!("SSH tunnel private key is required"))?;
                let key_pair = if let Some(passphrase) = &self.tunnel.passphrase {
                    decode_secret_key(private_key_str, Some(passphrase))?
                } else {
                    decode_secret_key(private_key_str, None)?
                };
                if !handle
                    .authenticate_publickey(&self.tunnel.username, Arc::new(key_pair))
                    .await?
                {
                    return Err(anyhow!("SSH tunnel key authentication failed"));
                }
            }
            SshAuthType::Interactive => {
                return Err(anyhow!(
                    "Interactive auth not supported for database SSH tunnel"
                ));
            }
        }

        Ok(handle)
    }
}

/// SSH session handle for managing a single SSH connection

impl SshService {
    /// Open a local TCP tunnel to `target_host:target_port` through an SSH server.
    pub async fn open_local_tunnel(
        &self,
        tunnel: &DatabaseSshTunnelConfig,
        target_host: String,
        target_port: u16,
        app_handle: Option<tauri::AppHandle>,
    ) -> Result<SshTunnelHandle> {
        let config = Arc::new(client::Config {
            inactivity_timeout: Some(std::time::Duration::from_secs(3600)),
            keepalive_interval: Some(std::time::Duration::from_secs(15)),
            keepalive_max: 3,
            ..Default::default()
        });

        let host_port = format!("{}:{}", tunnel.host, tunnel.port);
        let connector = Arc::new(TunnelConnector {
            config,
            addr: host_port.clone(),
            host_port,
            tunnel: tunnel.clone(),
            known_hosts: self.known_hosts.clone(),
            pending_verifications: self.pending_verifications.clone(),
            app_handle,
        });

        // Establish the initial connection (surfaces auth/host errors up front).
        let handle = Arc::new(TokioMutex::new(connector.connect().await?));

        let listener = TcpListener::bind("127.0.0.1:0").await?;
        let local_port = listener.local_addr()?.port();
        let local_host = "127.0.0.1".to_string();

        let task = {
            let connector = connector.clone();
            let handle = handle.clone();
            tokio::spawn(async move {
                loop {
                    let (local_stream, _) = match listener.accept().await {
                        Ok(pair) => pair,
                        Err(err) => {
                            log::error!("SSH tunnel listener failed: {}", err);
                            break;
                        }
                    };

                    let connector = connector.clone();
                    let handle = handle.clone();
                    let target_host = target_host.clone();
                    tokio::spawn(async move {
                        if let Err(err) = Self::forward_tunnel_stream(
                            connector,
                            handle,
                            local_stream,
                            target_host,
                            target_port,
                        )
                        .await
                        {
                            log::error!("SSH tunnel stream failed: {}", err);
                        }
                    });
                }
            })
        };

        Ok(SshTunnelHandle {
            local_host,
            local_port,
            task,
            handle,
        })
    }

    async fn forward_tunnel_stream(
        connector: Arc<TunnelConnector>,
        handle: Arc<TokioMutex<client::Handle<SshClientHandler>>>,
        mut local_stream: TcpStream,
        target_host: String,
        target_port: u16,
    ) -> Result<()> {
        let channel =
            Self::open_tunnel_channel(&connector, &handle, &target_host, target_port).await?;
        let mut remote_stream = channel.into_stream();
        let _ = tokio::io::copy_bidirectional(&mut local_stream, &mut remote_stream).await?;
        Ok(())
    }

    /// Open a direct-tcpip channel through the tunnel, reconnecting the SSH
    /// connection once if the handle is dead. This is the fix for the tunnel
    /// staying broken (ECONNRESET on every query) until an app restart: a single
    /// caller reconnects under the lock and concurrent callers reuse the fresh
    /// handle. The local listener port is unchanged, so database pools recover
    /// transparently.
    async fn open_tunnel_channel(
        connector: &Arc<TunnelConnector>,
        handle: &Arc<TokioMutex<client::Handle<SshClientHandler>>>,
        target_host: &str,
        target_port: u16,
    ) -> Result<Channel<client::Msg>> {
        {
            let guard = handle.lock().await;
            if let Ok(channel) = guard
                .channel_open_direct_tcpip(target_host, target_port as u32, "127.0.0.1", 0)
                .await
            {
                return Ok(channel);
            }
        }
        // The existing handle is likely dead — reconnect and retry once.
        let mut guard = handle.lock().await;
        // Another task may have already reconnected while we waited for the lock.
        if let Ok(channel) = guard
            .channel_open_direct_tcpip(target_host, target_port as u32, "127.0.0.1", 0)
            .await
        {
            return Ok(channel);
        }
        log::warn!("SSH tunnel connection lost; reconnecting");
        *guard = connector.connect().await?;
        let channel = guard
            .channel_open_direct_tcpip(target_host, target_port as u32, "127.0.0.1", 0)
            .await?;
        Ok(channel)
    }


    /// Connect to SSH server with password authentication
    pub async fn connect_with_password(
        &self,
        request: SshConnectRequest,
        data_tx: mpsc::Sender<Vec<u8>>,
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
            last_activity_secs: session.last_activity_secs.clone(),
        };

        // Connect to server
        let addr = format!("{}:{}", request.host, request.port);
        let mut handle = with_connect_timeout(client::connect(config, addr, handler)).await?;

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
        data_tx: mpsc::Sender<Vec<u8>>,
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
            last_activity_secs: session.last_activity_secs.clone(),
        };

        // Connect to server
        let addr = format!("{}:{}", request.host, request.port);
        let mut handle = with_connect_timeout(client::connect(config, addr, handler)).await?;

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
        data_tx: mpsc::Sender<Vec<u8>>,
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
        let (dummy_tx, _dummy_rx) = mpsc::channel::<Vec<u8>>(1);
        let jump_host_port = format!("{}:{}", jump.host, jump.port);
        let jump_handler = SshClientHandler {
            session_id: format!("{}-jump", session_id),
            data_tx: dummy_tx,
            terminal_channel_id: Arc::new(RwLock::new(None)),
            known_hosts: self.known_hosts.clone(),
            host_port: jump_host_port,
            app_handle: app_handle.clone(),
            pending_verifications: self.pending_verifications.clone(),
            last_activity_secs: session.last_activity_secs.clone(),
        };

        let jump_addr = format!("{}:{}", jump.host, jump.port);
        let mut jump_handle =
            with_connect_timeout(client::connect(jump_config, jump_addr, jump_handler)).await?;

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
            last_activity_secs: session.last_activity_secs.clone(),
        };
        let mut target_handle =
            with_connect_timeout(client::connect_stream(target_config, stream, target_handler))
                .await?;

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
        data_tx: mpsc::Sender<Vec<u8>>,
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
        let (dummy_tx, _dummy_rx) = mpsc::channel::<Vec<u8>>(1);
        let handler = SshClientHandler {
            session_id: format!("test-{}", Uuid::new_v4()),
            data_tx: dummy_tx,
            terminal_channel_id: Arc::new(RwLock::new(None)),
            known_hosts: self.known_hosts.clone(),
            host_port: format!("{}:{}", request.host, request.port),
            app_handle,
            pending_verifications: self.pending_verifications.clone(),
            last_activity_secs: Arc::new(AtomicU64::new(0)),
        };

        // Connect to server
        let addr = format!("{}:{}", request.host, request.port);
        let mut handle = with_connect_timeout(client::connect(config, addr, handler)).await?;

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

}

#[cfg(test)]
mod tunnel_selfheal_tests {
    use super::*;
    use crate::models::{DatabaseSshTunnelConfig, SshAuthType};
    use russh::Disconnect;
    use tokio::io::AsyncReadExt;
    use tokio::net::TcpStream;

    /// Build a key-auth tunnel config from ZWD_TEST_SSH_* env vars (same ones the
    /// other live SSH tests use). Returns None when unset so the test skips.
    fn tunnel_config_from_env() -> Option<DatabaseSshTunnelConfig> {
        let host = std::env::var("ZWD_TEST_SSH_HOST").ok()?;
        let port: u16 = std::env::var("ZWD_TEST_SSH_PORT")
            .ok()
            .and_then(|p| p.parse().ok())
            .unwrap_or(22);
        let username = std::env::var("ZWD_TEST_SSH_USER").ok()?;
        let key_path = std::env::var("ZWD_TEST_SSH_KEY_PATH").ok()?;
        let private_key = std::fs::read_to_string(&key_path).ok()?;
        Some(DatabaseSshTunnelConfig {
            enabled: true,
            host,
            port,
            username,
            auth_type: SshAuthType::Key,
            password: None,
            private_key: Some(private_key),
            passphrase: std::env::var("ZWD_TEST_SSH_PASSPHRASE").ok(),
        })
    }

    /// Connect through the tunnel's local port and read the first bytes the
    /// target greets with — proof the forward is live.
    async fn read_forwarded(local_host: &str, local_port: u16) -> String {
        let mut stream = TcpStream::connect((local_host, local_port))
            .await
            .expect("connect to local tunnel port");
        let mut buf = [0u8; 64];
        let n = tokio::time::timeout(std::time::Duration::from_secs(10), stream.read(&mut buf))
            .await
            .expect("banner read timed out")
            .expect("banner read failed");
        String::from_utf8_lossy(&buf[..n]).to_string()
    }

    /// Regression test for the idle PG-over-SSH disconnect: open a tunnel to the
    /// SSH host's own sshd, prove forwarding works, forcibly disconnect the
    /// tunnel's SSH connection (simulating the idle drop) while leaving the local
    /// listener up, then verify the next connection self-heals and forwards
    /// again — instead of failing until an app restart.
    #[tokio::test]
    #[ignore = "requires a live SSH host via ZWD_TEST_SSH_* env vars"]
    async fn tunnel_reconnects_after_ssh_drop() {
        let Some(cfg) = tunnel_config_from_env() else {
            eprintln!("skipping: set ZWD_TEST_SSH_HOST / ZWD_TEST_SSH_USER / ZWD_TEST_SSH_KEY_PATH");
            return;
        };

        // Target a service on the SSH host that greets on connect. Default 22
        // (sshd banner); tests point ZWD_TEST_TUNNEL_TARGET_PORT at a plain TCP
        // greeter since forwarding to the host's own sshd closes without data.
        let target_port: u16 = std::env::var("ZWD_TEST_TUNNEL_TARGET_PORT")
            .ok()
            .and_then(|p| p.parse().ok())
            .unwrap_or(22);

        let service = SshService::new();
        let tunnel = service
            .open_local_tunnel(&cfg, "127.0.0.1".to_string(), target_port, None)
            .await
            .expect("open tunnel");

        let before = read_forwarded(&tunnel.local_host, tunnel.local_port).await;
        assert!(
            !before.is_empty(),
            "fresh tunnel forwarded no data: {before:?}"
        );

        // Simulate the idle drop: kill the tunnel's SSH connection, leaving the
        // local listener running (the exact state that used to require a restart).
        tunnel
            .handle
            .lock()
            .await
            .disconnect(Disconnect::ByApplication, "test-induced drop", "")
            .await
            .ok();
        tokio::time::sleep(std::time::Duration::from_millis(500)).await;

        let after = read_forwarded(&tunnel.local_host, tunnel.local_port).await;
        assert!(
            !after.is_empty(),
            "tunnel did not self-heal after the SSH connection dropped (no data forwarded): {after:?}"
        );
        assert_eq!(before, after, "self-healed forward returned different data");

        tunnel.close().await;
    }
}
