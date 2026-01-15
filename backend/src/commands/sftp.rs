//! SFTP Tauri Commands
//!
//! Provides Tauri commands for SFTP file operations.

use std::path::Path;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};
use tokio::io::AsyncWriteExt;

use crate::commands::SshServiceState;
use crate::models::{FileEntry, TransferDirection, TransferProgress, TransferStatus, TransferTask};
use crate::services::SftpService;

/// SFTP service state wrapper
pub struct SftpServiceState(pub Arc<SftpService>);

/// Open SFTP session on existing SSH connection
#[tauri::command]
pub async fn sftp_open(
    ssh_state: State<'_, SshServiceState>,
    sftp_state: State<'_, SftpServiceState>,
    session_id: String,
) -> Result<(), String> {
    let ssh_service = &ssh_state.0;
    let sftp_service = &sftp_state.0;

    // Check if SFTP session already exists
    if sftp_service.has_sftp_session(&session_id).await {
        return Ok(());
    }

    // Open SFTP channel on existing SSH connection
    let channel = ssh_service
        .open_sftp_channel(&session_id)
        .await
        .map_err(|e| e.to_string())?;

    // Open SFTP session using the channel
    sftp_service
        .open_sftp(session_id, channel)
        .await
        .map_err(|e| e.to_string())
}

/// Close SFTP session
#[tauri::command]
pub async fn sftp_close(
    sftp_state: State<'_, SftpServiceState>,
    session_id: String,
) -> Result<(), String> {
    sftp_state
        .0
        .close_sftp(&session_id)
        .await
        .map_err(|e| e.to_string())
}

/// List directory contents
#[tauri::command]
pub async fn sftp_list_dir(
    sftp_state: State<'_, SftpServiceState>,
    session_id: String,
    path: String,
) -> Result<Vec<FileEntry>, String> {
    sftp_state
        .0
        .list_dir(&session_id, &path)
        .await
        .map_err(|e| e.to_string())
}

/// Get current working directory
#[tauri::command]
pub async fn sftp_get_current_path(
    sftp_state: State<'_, SftpServiceState>,
    session_id: String,
) -> Result<String, String> {
    sftp_state
        .0
        .get_current_path(&session_id)
        .await
        .map_err(|e| e.to_string())
}

/// Canonicalize path (resolve to absolute path)
#[tauri::command]
pub async fn sftp_canonicalize(
    sftp_state: State<'_, SftpServiceState>,
    session_id: String,
    path: String,
) -> Result<String, String> {
    sftp_state
        .0
        .canonicalize(&session_id, &path)
        .await
        .map_err(|e| e.to_string())
}

/// Create directory
#[tauri::command]
pub async fn sftp_mkdir(
    sftp_state: State<'_, SftpServiceState>,
    session_id: String,
    path: String,
) -> Result<(), String> {
    sftp_state
        .0
        .mkdir(&session_id, &path)
        .await
        .map_err(|e| e.to_string())
}

/// Remove file
#[tauri::command]
pub async fn sftp_remove_file(
    sftp_state: State<'_, SftpServiceState>,
    session_id: String,
    path: String,
) -> Result<(), String> {
    sftp_state
        .0
        .remove_file(&session_id, &path)
        .await
        .map_err(|e| e.to_string())
}

/// Remove directory
#[tauri::command]
pub async fn sftp_remove_dir(
    sftp_state: State<'_, SftpServiceState>,
    session_id: String,
    path: String,
) -> Result<(), String> {
    sftp_state
        .0
        .remove_dir(&session_id, &path)
        .await
        .map_err(|e| e.to_string())
}

/// Rename file or directory
#[tauri::command]
pub async fn sftp_rename(
    sftp_state: State<'_, SftpServiceState>,
    session_id: String,
    old_path: String,
    new_path: String,
) -> Result<(), String> {
    sftp_state
        .0
        .rename(&session_id, &old_path, &new_path)
        .await
        .map_err(|e| e.to_string())
}

/// Read file contents (returns base64 encoded string)
#[tauri::command]
pub async fn sftp_read_file(
    sftp_state: State<'_, SftpServiceState>,
    session_id: String,
    path: String,
) -> Result<String, String> {
    let data = sftp_state
        .0
        .read_file(&session_id, &path)
        .await
        .map_err(|e| e.to_string())?;

    Ok(base64::Engine::encode(
        &base64::engine::general_purpose::STANDARD,
        &data,
    ))
}

/// Write file contents (accepts base64 encoded string)
#[tauri::command]
pub async fn sftp_write_file(
    sftp_state: State<'_, SftpServiceState>,
    session_id: String,
    path: String,
    data: String,
) -> Result<(), String> {
    let bytes = base64::Engine::decode(&base64::engine::general_purpose::STANDARD, &data)
        .map_err(|e| e.to_string())?;

    sftp_state
        .0
        .write_file(&session_id, &path, &bytes)
        .await
        .map_err(|e| e.to_string())
}

/// Get file/directory metadata
#[tauri::command]
pub async fn sftp_stat(
    sftp_state: State<'_, SftpServiceState>,
    session_id: String,
    path: String,
) -> Result<FileEntry, String> {
    sftp_state
        .0
        .stat(&session_id, &path)
        .await
        .map_err(|e| e.to_string())
}

/// Get all transfer tasks for a session
#[tauri::command]
pub async fn sftp_get_transfers(
    sftp_state: State<'_, SftpServiceState>,
    session_id: String,
) -> Result<Vec<TransferTask>, String> {
    Ok(sftp_state.0.get_transfers(&session_id).await)
}

/// Cleanup completed/cancelled transfers
#[tauri::command]
pub async fn sftp_cleanup_transfers(
    sftp_state: State<'_, SftpServiceState>,
    session_id: String,
) -> Result<(), String> {
    sftp_state.0.cleanup_transfers(&session_id).await;
    Ok(())
}

/// Remove a single transfer task by ID
#[tauri::command]
pub async fn sftp_remove_transfer(
    sftp_state: State<'_, SftpServiceState>,
    task_id: String,
) -> Result<(), String> {
    sftp_state.0.remove_transfer(&task_id).await;
    Ok(())
}

/// Download file from remote to local
#[tauri::command]
pub async fn sftp_download(
    app: AppHandle,
    sftp_state: State<'_, SftpServiceState>,
    session_id: String,
    remote_path: String,
    local_path: String,
) -> Result<String, String> {
    let sftp_service = &sftp_state.0;

    // Get file info for size
    let file_info = sftp_service
        .stat(&session_id, &remote_path)
        .await
        .map_err(|e| e.to_string())?;

    let total_size = file_info.size;

    // Create transfer task with cancellation token
    let (task_id, _cancel_token) = sftp_service
        .create_transfer_task(
            &session_id,
            &local_path,
            &remote_path,
            TransferDirection::Download,
            total_size,
        )
        .await;

    // Update status to in progress
    sftp_service
        .update_transfer(&task_id, 0, 0, TransferStatus::InProgress)
        .await;

    // Emit initial progress
    let _ = app.emit(
        &format!("sftp-transfer-{}", session_id),
        TransferProgress {
            task_id: task_id.clone(),
            transferred: 0,
            total: total_size,
            speed: 0,
            status: TransferStatus::InProgress,
        },
    );

    // Read file from SFTP
    let data = match sftp_service.read_file(&session_id, &remote_path).await {
        Ok(data) => data,
        Err(e) => {
            sftp_service
                .update_transfer(&task_id, 0, 0, TransferStatus::Failed)
                .await;
            sftp_service.remove_cancel_token(&task_id).await;
            return Err(e.to_string());
        }
    };

    // Write to local file
    let local_path_obj = Path::new(&local_path);
    if let Some(parent) = local_path_obj.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|e| e.to_string())?;
    }

    let mut file = tokio::fs::File::create(&local_path)
        .await
        .map_err(|e| e.to_string())?;

    file.write_all(&data).await.map_err(|e| e.to_string())?;
    file.flush().await.map_err(|e| e.to_string())?;

    // Clean up cancellation token
    sftp_service.remove_cancel_token(&task_id).await;

    // Update status to completed
    sftp_service
        .update_transfer(&task_id, total_size, 0, TransferStatus::Completed)
        .await;

    // Emit completion
    let _ = app.emit(
        &format!("sftp-transfer-{}", session_id),
        TransferProgress {
            task_id: task_id.clone(),
            transferred: total_size,
            total: total_size,
            speed: 0,
            status: TransferStatus::Completed,
        },
    );

    Ok(task_id)
}

/// Cancel a transfer task
#[tauri::command]
pub async fn sftp_cancel_transfer(
    app: AppHandle,
    sftp_state: State<'_, SftpServiceState>,
    session_id: String,
    task_id: String,
) -> Result<(), String> {
    let sftp_service = &sftp_state.0;

    sftp_service
        .cancel_transfer(&task_id)
        .await
        .map_err(|e| e.to_string())?;

    // Emit cancellation event
    let _ = app.emit(
        &format!("sftp-transfer-{}", session_id),
        TransferProgress {
            task_id,
            transferred: 0,
            total: 0,
            speed: 0,
            status: TransferStatus::Cancelled,
        },
    );

    Ok(())
}

/// Upload file from local to remote with optional resume support
/// Uses dedicated SFTP sessions to enable parallel uploads (max 3 concurrent)
#[tauri::command]
pub async fn sftp_upload(
    app: AppHandle,
    ssh_state: State<'_, SshServiceState>,
    sftp_state: State<'_, SftpServiceState>,
    session_id: String,
    local_path: String,
    remote_path: String,
    resume: Option<bool>,
) -> Result<String, String> {
    log::info!(
        "[SFTP Upload] Starting upload: {} -> {}, resume: {:?}",
        local_path,
        remote_path,
        resume
    );
    let ssh_service = &ssh_state.0;
    let sftp_service = &sftp_state.0;

    // Get local file size without reading entire file into memory
    let metadata = tokio::fs::metadata(&local_path)
        .await
        .map_err(|e| {
            log::error!("[SFTP Upload] Failed to get file metadata: {}", e);
            e.to_string()
        })?;
    let total_size = metadata.len();
    log::info!("[SFTP Upload] File size: {} bytes", total_size);

    // Check if we should resume from existing file
    let start_offset = if resume.unwrap_or(false) {
        let remote_size = sftp_service
            .get_remote_file_size(&session_id, &remote_path)
            .await;
        // Only resume if remote file is smaller than local file
        if remote_size > 0 && remote_size < total_size {
            log::info!(
                "[SFTP Upload] Resuming from offset: {} bytes (remote file size)",
                remote_size
            );
            remote_size
        } else if remote_size >= total_size {
            // Remote file is corrupted (larger or equal to local), delete it first
            log::warn!(
                "[SFTP Upload] Remote file corrupted: remote_size={} >= total_size={}, deleting...",
                remote_size,
                total_size
            );
            if let Err(e) = sftp_service.remove_file(&session_id, &remote_path).await {
                log::warn!("[SFTP Upload] Failed to delete corrupted file: {}", e);
            }
            0
        } else {
            log::info!(
                "[SFTP Upload] Not resuming: remote_size={}, total_size={}",
                remote_size,
                total_size
            );
            0
        }
    } else {
        0
    };

    log::info!("[SFTP Upload] Final start_offset: {} bytes", start_offset);

    // Create transfer task with cancellation token
    let (task_id, cancel_token) = sftp_service
        .create_transfer_task(
            &session_id,
            &local_path,
            &remote_path,
            TransferDirection::Upload,
            total_size,
        )
        .await;

    // Emit initial progress (pending state while waiting for semaphore)
    let _ = app.emit(
        &format!("sftp-transfer-{}", session_id),
        TransferProgress {
            task_id: task_id.clone(),
            transferred: start_offset,
            total: total_size,
            speed: 0,
            status: TransferStatus::Pending,
        },
    );

    // Clone values for the spawned task
    let app_clone = app.clone();
    let ssh_service_clone = ssh_service.clone();
    let sftp_service_clone = sftp_service.clone();
    let session_id_clone = session_id.clone();
    let local_path_clone = local_path.clone();
    let remote_path_clone = remote_path.clone();
    let task_id_clone = task_id.clone();

    // Spawn the upload task to run in background
    // This allows immediate return and parallel uploads
    tokio::spawn(async move {
        // Acquire semaphore permit to limit concurrent uploads (max 3)
        log::info!("[SFTP Upload] Task {} waiting for upload permit...", task_id_clone);
        let _permit = match sftp_service_clone.acquire_upload_permit().await {
            Ok(permit) => {
                log::info!("[SFTP Upload] Task {} acquired upload permit", task_id_clone);
                permit
            }
            Err(e) => {
                log::error!("[SFTP Upload] Failed to acquire permit: {}", e);
                sftp_service_clone
                    .update_transfer(&task_id_clone, 0, 0, TransferStatus::Failed)
                    .await;
                let _ = app_clone.emit(
                    &format!("sftp-transfer-{}", session_id_clone),
                    TransferProgress {
                        task_id: task_id_clone.clone(),
                        transferred: 0,
                        total: total_size,
                        speed: 0,
                        status: TransferStatus::Failed,
                    },
                );
                return;
            }
        };

        // Create a dedicated SFTP channel for this upload
        log::info!("[SFTP Upload] Creating dedicated SFTP channel for task {}", task_id_clone);
        let channel = match ssh_service_clone.open_sftp_channel(&session_id_clone).await {
            Ok(ch) => ch,
            Err(e) => {
                log::error!("[SFTP Upload] Failed to open SFTP channel: {}", e);
                sftp_service_clone
                    .update_transfer(&task_id_clone, 0, 0, TransferStatus::Failed)
                    .await;
                let _ = app_clone.emit(
                    &format!("sftp-transfer-{}", session_id_clone),
                    TransferProgress {
                        task_id: task_id_clone.clone(),
                        transferred: 0,
                        total: total_size,
                        speed: 0,
                        status: TransferStatus::Failed,
                    },
                );
                return;
            }
        };

        // Create dedicated transfer session
        if let Err(e) = sftp_service_clone.create_transfer_session(&task_id_clone, channel).await {
            log::error!("[SFTP Upload] Failed to create transfer session: {}", e);
            sftp_service_clone
                .update_transfer(&task_id_clone, 0, 0, TransferStatus::Failed)
                .await;
            let _ = app_clone.emit(
                &format!("sftp-transfer-{}", session_id_clone),
                TransferProgress {
                    task_id: task_id_clone.clone(),
                    transferred: 0,
                    total: total_size,
                    speed: 0,
                    status: TransferStatus::Failed,
                },
            );
            return;
        }

        // Update status to in progress
        sftp_service_clone
            .update_transfer(&task_id_clone, start_offset, 0, TransferStatus::InProgress)
            .await;

        let _ = app_clone.emit(
            &format!("sftp-transfer-{}", session_id_clone),
            TransferProgress {
                task_id: task_id_clone.clone(),
                transferred: start_offset,
                total: total_size,
                speed: 0,
                status: TransferStatus::InProgress,
            },
        );

        // Chunk size: 256KB for better throughput on large files
        const CHUNK_SIZE: usize = 256 * 1024;
        let app_progress = app_clone.clone();
        let task_id_progress = task_id_clone.clone();
        let session_id_progress = session_id_clone.clone();
        let sftp_service_progress = sftp_service_clone.clone();
        let start_time = std::time::Instant::now();
        let mut last_emit_time = start_time;

        // Track last transferred bytes for error/cancel reporting
        let last_transferred = std::sync::Arc::new(std::sync::atomic::AtomicU64::new(start_offset));
        let last_transferred_progress = last_transferred.clone();

        // Stream upload with dedicated session
        let result = sftp_service_clone
            .upload_with_dedicated_session(
                &task_id_clone,
                &local_path_clone,
                &remote_path_clone,
                CHUNK_SIZE,
                start_offset,
                cancel_token,
                |transferred| {
                    // Update last transferred for error reporting
                    last_transferred_progress.store(transferred, std::sync::atomic::Ordering::Relaxed);

                    let now = std::time::Instant::now();
                    let elapsed = now.duration_since(start_time).as_secs_f64();
                    let bytes_since_start = transferred - start_offset;
                    let speed = if elapsed > 0.0 {
                        (bytes_since_start as f64 / elapsed) as u64
                    } else {
                        0
                    };

                    // Emit progress every 100ms to avoid flooding
                    if now.duration_since(last_emit_time).as_millis() >= 100 {
                        last_emit_time = now;

                        // Update transfer state
                        let sftp_svc = sftp_service_progress.clone();
                        let tid = task_id_progress.clone();
                        tokio::spawn(async move {
                            sftp_svc
                                .update_transfer(&tid, transferred, speed, TransferStatus::InProgress)
                                .await;
                        });

                        // Emit progress event
                        let _ = app_progress.emit(
                            &format!("sftp-transfer-{}", session_id_progress),
                            TransferProgress {
                                task_id: task_id_progress.clone(),
                                transferred,
                                total: total_size,
                                speed,
                                status: TransferStatus::InProgress,
                            },
                        );
                    }
                },
            )
            .await;

        // Close dedicated transfer session
        sftp_service_clone.close_transfer_session(&task_id_clone).await;

        // Clean up cancellation token
        sftp_service_clone.remove_cancel_token(&task_id_clone).await;

        // Handle result
        match result {
            Ok(completed) => {
                if completed {
                    sftp_service_clone
                        .update_transfer(&task_id_clone, total_size, 0, TransferStatus::Completed)
                        .await;

                    let _ = app_clone.emit(
                        &format!("sftp-transfer-{}", session_id_clone),
                        TransferProgress {
                            task_id: task_id_clone,
                            transferred: total_size,
                            total: total_size,
                            speed: 0,
                            status: TransferStatus::Completed,
                        },
                    );
                } else {
                    // Get actual transferred bytes for cancelled status
                    let actual_transferred = last_transferred.load(std::sync::atomic::Ordering::Relaxed);
                    sftp_service_clone
                        .update_transfer(&task_id_clone, actual_transferred, 0, TransferStatus::Cancelled)
                        .await;

                    let _ = app_clone.emit(
                        &format!("sftp-transfer-{}", session_id_clone),
                        TransferProgress {
                            task_id: task_id_clone,
                            transferred: actual_transferred,
                            total: total_size,
                            speed: 0,
                            status: TransferStatus::Cancelled,
                        },
                    );
                }
            }
            Err(e) => {
                log::error!("[SFTP Upload] Upload failed: {}", e);
                // Get actual transferred bytes for failed status
                let actual_transferred = last_transferred.load(std::sync::atomic::Ordering::Relaxed);
                sftp_service_clone
                    .update_transfer(&task_id_clone, actual_transferred, 0, TransferStatus::Failed)
                    .await;

                let _ = app_clone.emit(
                    &format!("sftp-transfer-{}", session_id_clone),
                    TransferProgress {
                        task_id: task_id_clone,
                        transferred: actual_transferred,
                        total: total_size,
                        speed: 0,
                        status: TransferStatus::Failed,
                    },
                );
            }
        }

        // Permit is automatically released when _permit goes out of scope
    });

    // Return immediately with task_id
    // The upload runs in background
    Ok(task_id)
}
