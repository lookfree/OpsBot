//! SshService command/exec paths: run-command, SFTP channel, and interactive
//! (PTY) exec sessions for docker exec etc.

use std::sync::Arc;

use anyhow::{anyhow, Result};
use futures::channel::mpsc;
use russh::*;
use uuid::Uuid;

use super::handler::SshClientHandler;
use super::session::{ExecCommand, InteractiveExecSession};
use super::SshService;
use crate::models::SessionStatus;

impl SshService {
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

    /// Execute a command and return its combined stdout+stderr. The remote exit
    /// status is NOT surfaced; use `exec_command_status` when the caller must
    /// distinguish success from failure (e.g. docker mutations).
    pub async fn exec_command(&self, session_id: &str, command: &str) -> Result<String> {
        let (output, _exit) = self.exec_command_status(session_id, command).await?;
        Ok(output)
    }

    /// Execute a command and return (combined stdout+stderr, exit_code). The
    /// exit code is None if the server closed the channel without sending an
    /// exit status. Callers that mutate remote state must check the exit code:
    /// a command that failed still produces output, so treating any output as
    /// success silently swallows errors.
    pub async fn exec_command_status(
        &self,
        session_id: &str,
        command: &str,
    ) -> Result<(String, Option<u32>)> {
        let handle = self.connected_handle(session_id).await?;

        let mut channel = handle.channel_open_session().await?;
        channel.exec(true, command).await?;

        const MAX_EXEC_OUTPUT_SIZE: usize = 10 * 1024 * 1024; // 10MB

        let mut output = Vec::new();
        let mut truncated = false;
        let mut exit_code: Option<u32> = None;
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
                Some(ChannelMsg::ExitStatus { exit_status }) => {
                    exit_code = Some(exit_status);
                }
                // Do NOT break on Eof: the server sends exit-status (and then
                // Close) AFTER Eof, so breaking on Eof loses the exit code.
                Some(ChannelMsg::Eof) => {}
                Some(ChannelMsg::Close) | None => break,
                _ => {}
            }
        }

        let mut result = String::from_utf8_lossy(&output).to_string();
        if truncated {
            result.push_str("\n\n[Output truncated: exceeded 10MB limit]");
        }
        Ok((result, exit_code))
    }


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
