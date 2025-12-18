//! Tauri commands for config encryption/decryption

use crate::services::CryptoService;
use std::sync::Arc;
use tauri::State;

/// State wrapper for CryptoService
pub struct CryptoServiceState(pub Arc<CryptoService>);

/// Encrypt config data with password (for export)
#[tauri::command]
pub async fn encrypt_config(
    state: State<'_, CryptoServiceState>,
    data: String,
    password: String,
) -> Result<String, String> {
    state
        .0
        .encrypt(&data, &password)
        .map_err(|e| e.to_string())
}

/// Decrypt config data with password (for import)
#[tauri::command]
pub async fn decrypt_config(
    state: State<'_, CryptoServiceState>,
    data: String,
    password: String,
) -> Result<String, String> {
    state
        .0
        .decrypt(&data, &password)
        .map_err(|e| e.to_string())
}

/// Check if data is encrypted (password-based)
#[tauri::command]
pub async fn is_config_encrypted(
    state: State<'_, CryptoServiceState>,
    data: String,
) -> Result<bool, String> {
    Ok(state.0.is_encrypted(&data))
}

/// Encrypt data for local storage (fixed key)
#[tauri::command]
pub async fn encrypt_storage(
    state: State<'_, CryptoServiceState>,
    data: String,
) -> Result<String, String> {
    state
        .0
        .encrypt_storage(&data)
        .map_err(|e| e.to_string())
}

/// Decrypt data from local storage (fixed key)
#[tauri::command]
pub async fn decrypt_storage(
    state: State<'_, CryptoServiceState>,
    data: String,
) -> Result<String, String> {
    state
        .0
        .decrypt_storage(&data)
        .map_err(|e| e.to_string())
}

/// Check if data is storage encrypted
#[tauri::command]
pub async fn is_storage_encrypted(
    state: State<'_, CryptoServiceState>,
    data: String,
) -> Result<bool, String> {
    Ok(state.0.is_storage_encrypted(&data))
}
