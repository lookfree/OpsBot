//! SSH Tauri Commands
//!
//! Provides Tauri commands for SSH operations.

use futures::channel::mpsc;
use futures::StreamExt;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};

use crate::models::{SshConnectRequest, SshSessionInfo, TerminalSize};
use crate::services::SshService;

/// SSH service state wrapper
pub struct SshServiceState(pub Arc<SshService>);

/// Connect to SSH server
#[tauri::command]
pub async fn ssh_connect(
    app: AppHandle,
    state: State<'_, SshServiceState>,
    request: SshConnectRequest,
) -> Result<String, String> {
    let service = &state.0;

    // Create channel for data streaming
    let (tx, mut rx) = mpsc::unbounded::<Vec<u8>>();

    // Connect based on auth type
    let session_id = match request.auth_type.as_str() {
        "password" => service
            .connect_with_password(request, tx)
            .await
            .map_err(|e| e.to_string())?,
        "key" => service
            .connect_with_key(request, tx)
            .await
            .map_err(|e| e.to_string())?,
        _ => return Err("Unsupported authentication type".to_string()),
    };

    // Spawn task to forward SSH data to frontend
    let session_id_clone = session_id.clone();
    let app_clone = app.clone();
    tokio::spawn(async move {
        while let Some(data) = rx.next().await {
            // Emit data event to frontend
            let _ = app_clone.emit(
                &format!("ssh-data-{}", session_id_clone),
                base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &data),
            );
        }
        // Session ended, emit disconnect event
        let _ = app_clone.emit(&format!("ssh-status-{}", session_id_clone), "disconnected");
    });

    Ok(session_id)
}

/// Send data to SSH session
#[tauri::command]
pub async fn ssh_send_data(
    state: State<'_, SshServiceState>,
    session_id: String,
    data: String,
) -> Result<(), String> {
    let service = &state.0;

    // Decode base64 data
    let bytes = base64::Engine::decode(&base64::engine::general_purpose::STANDARD, &data)
        .map_err(|e| e.to_string())?;

    service
        .send_data(&session_id, &bytes)
        .await
        .map_err(|e| e.to_string())
}

/// Resize SSH terminal
#[tauri::command]
pub async fn ssh_resize(
    state: State<'_, SshServiceState>,
    session_id: String,
    cols: u32,
    rows: u32,
) -> Result<(), String> {
    let service = &state.0;
    let size = TerminalSize { cols, rows };
    service
        .resize_terminal(&session_id, size)
        .await
        .map_err(|e| e.to_string())
}

/// Disconnect SSH session
#[tauri::command]
pub async fn ssh_disconnect(
    state: State<'_, SshServiceState>,
    session_id: String,
) -> Result<(), String> {
    let service = &state.0;
    service
        .disconnect(&session_id)
        .await
        .map_err(|e| e.to_string())
}

/// Get SSH session info
#[tauri::command]
pub async fn ssh_get_session(
    state: State<'_, SshServiceState>,
    session_id: String,
) -> Result<Option<SshSessionInfo>, String> {
    let service = &state.0;
    Ok(service.get_session_info(&session_id).await)
}

/// Get all SSH sessions
#[tauri::command]
pub async fn ssh_get_all_sessions(state: State<'_, SshServiceState>) -> Result<Vec<SshSessionInfo>, String> {
    let service = &state.0;
    Ok(service.get_all_sessions().await)
}

/// Check if SSH session is connected
#[tauri::command]
pub async fn ssh_is_connected(state: State<'_, SshServiceState>, session_id: String) -> Result<bool, String> {
    let service = &state.0;
    Ok(service.is_connected(&session_id).await)
}

/// Test SSH connection without creating a session
#[tauri::command]
pub async fn ssh_test_connection(
    state: State<'_, SshServiceState>,
    request: SshConnectRequest,
) -> Result<(), String> {
    let service = &state.0;
    service
        .test_connection(&request)
        .await
        .map_err(|e| e.to_string())
}

/// Reconnect SSH session
#[tauri::command]
pub async fn ssh_reconnect(
    app: AppHandle,
    state: State<'_, SshServiceState>,
    session_id: String,
) -> Result<String, String> {
    let service = &state.0;

    // Create channel for data streaming
    let (tx, mut rx) = mpsc::unbounded::<Vec<u8>>();

    // Reconnect
    let new_session_id = service
        .reconnect(&session_id, tx)
        .await
        .map_err(|e| e.to_string())?;

    // Spawn task to forward SSH data to frontend
    let new_session_id_clone = new_session_id.clone();
    let app_clone = app.clone();
    tokio::spawn(async move {
        while let Some(data) = rx.next().await {
            let _ = app_clone.emit(
                &format!("ssh-data-{}", new_session_id_clone),
                base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &data),
            );
        }
        let _ = app_clone.emit(&format!("ssh-status-{}", new_session_id_clone), "disconnected");
    });

    Ok(new_session_id)
}

/// Execute a command on the remote server
#[tauri::command]
pub async fn ssh_exec_command(
    state: State<'_, SshServiceState>,
    session_id: String,
    command: String,
) -> Result<String, String> {
    let service = &state.0;
    service
        .exec_command(&session_id, &command)
        .await
        .map_err(|e| e.to_string())
}
