//! Container exec (one-shot and interactive TTY) for the local Docker driver.
//! Method bodies extracted from `mod.rs` verbatim. No logic changes.

use super::*;
use tokio::io::AsyncWriteExt;

impl LocalDockerDriver {
    pub(super) async fn exec_command_impl(
        &self,
        container_id: &str,
        cmd: Vec<String>,
    ) -> Result<String, String> {
        with_docker_timeout(DOCKER_TIMEOUT_SECS, "exec_command", async {
            use bollard::exec::{CreateExecOptions, StartExecResults};
            use futures::StreamExt;

            let exec = self.client
                .create_exec(
                    container_id,
                    CreateExecOptions {
                        attach_stdout: Some(true),
                        attach_stderr: Some(true),
                        cmd: Some(cmd),
                        ..Default::default()
                    },
                )
                .await
                .map_err(|e| e.to_string())?;

            let output = self.client
                .start_exec(&exec.id, None)
                .await
                .map_err(|e| e.to_string())?;

            // Accumulate raw bytes; decode once so a multibyte char split across
            // exec output frames isn't corrupted into U+FFFD.
            let mut bytes: Vec<u8> = Vec::new();
            if let StartExecResults::Attached { mut output, .. } = output {
                while let Some(msg) = output.next().await {
                    match msg {
                        Ok(log_output) => {
                            bytes.extend_from_slice(&log_output.into_bytes());
                        }
                        Err(e) => {
                            return Err(e.to_string());
                        }
                    }
                }
            }

            Ok(String::from_utf8_lossy(&bytes).to_string())
        }).await
    }

    pub(super) async fn exec_start_interactive_impl(
        &self,
        container_id: &str,
        cmd: Vec<String>,
        cols: u16,
        rows: u16,
        output_tx: futures::channel::mpsc::UnboundedSender<Vec<u8>>,
    ) -> Result<String, String> {
        use bollard::exec::{CreateExecOptions, ResizeExecOptions, StartExecOptions, StartExecResults};
        use futures::channel::mpsc;
        use futures::SinkExt;

        log::info!("[Docker] exec_start_interactive: container={}, cmd={:?}, cols={}, rows={}", container_id, cmd, cols, rows);

        // Create exec instance with TTY
        let exec = self.client
            .create_exec(
                container_id,
                CreateExecOptions {
                    attach_stdin: Some(true),
                    attach_stdout: Some(true),
                    attach_stderr: Some(true),
                    tty: Some(true),
                    cmd: Some(cmd),
                    env: Some(vec![
                        "TERM=xterm-256color".to_string(),
                        "COLORTERM=truecolor".to_string(),
                    ]),
                    ..Default::default()
                },
            )
            .await
            .map_err(|e| { log::error!("[Docker] create_exec failed: {}", e); e.to_string() })?;

        let exec_id = exec.id.clone();
        log::info!("[Docker] exec created: {}", exec_id);

        // Start exec with TTY (resize_exec must be called AFTER start_exec)
        log::info!("[Docker] starting exec...");
        let start_result = self.client
            .start_exec(
                &exec_id,
                Some(StartExecOptions {
                    detach: false,
                    tty: true,
                    output_capacity: None,
                }),
            )
            .await
            .map_err(|e| { log::error!("[Docker] start_exec failed: {}", e); e.to_string() })?;

        log::info!("[Docker] exec started successfully");

        // Create input channel for this session
        let (input_tx, mut input_rx) = mpsc::unbounded::<Vec<u8>>();

        // Store the session
        {
            let mut sessions = self.exec_sessions.write();
            sessions.insert(exec_id.clone(), ExecSession {
                input_tx,
                _container_id: container_id.to_string(),
            });
        }

        // Spawn task to handle bidirectional streaming
        if let StartExecResults::Attached { mut output, mut input } = start_result {
            let exec_id_clone = exec_id.clone();
            let exec_sessions = self.exec_sessions.clone();

            tokio::spawn(async move {
                // Spawn input handler
                let input_handle = tokio::spawn(async move {
                    while let Some(data) = input_rx.next().await {
                        if input.write_all(&data).await.is_err() {
                            break;
                        }
                    }
                });

                // Handle output
                let mut output_tx = output_tx;
                while let Some(msg) = output.next().await {
                    match msg {
                        Ok(log_output) => {
                            let bytes = log_output.into_bytes().to_vec();
                            if output_tx.send(bytes).await.is_err() {
                                break;
                            }
                        }
                        Err(e) => {
                            log::warn!("[Docker] exec output error: {}", e);
                            break;
                        }
                    }
                }

                log::info!("[Docker] exec stream ended: {}", exec_id_clone);
                // Cleanup
                input_handle.abort();
                exec_sessions.write().remove(&exec_id_clone);
            });
        } else {
            log::warn!("[Docker] start_exec returned Detached (unexpected for interactive session)");
            return Err("Exec session is detached, cannot start interactive terminal".to_string());
        }

        // Resize PTY after exec is running (non-fatal - ResizeObserver handles this)
        if cols > 0 && rows > 0 {
            if let Err(e) = self.client
                .resize_exec(&exec_id, ResizeExecOptions { height: rows, width: cols })
                .await
            {
                log::warn!("[Docker] Initial resize failed (will be handled by frontend ResizeObserver): {}", e);
            }
        }

        log::info!("[Docker] exec_start_interactive returning exec_id={}", exec_id);
        Ok(exec_id)
    }
}
