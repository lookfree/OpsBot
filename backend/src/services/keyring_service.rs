//! OS Keyring Service for secure storage key management
//!
//! Stores a randomly-generated 256-bit key using dual storage (keyring + file).
//! File backup ensures the key persists even if the keyring loses entries
//! (e.g., unsigned dev builds on macOS).

use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use ring::rand::{SecureRandom, SystemRandom};
use std::path::PathBuf;

const SERVICE_NAME: &str = "com.zwd.opsbot";
const ACCOUNT_NAME: &str = "storage_key";
const KEY_LENGTH: usize = 32;

/// Retrieve or create a 256-bit storage key.
///
/// Strategy: keyring + file dual storage for reliability.
/// 1. Keyring has key → use it, sync to file
/// 2. Keyring lost key but file has it → restore from file to keyring
/// 3. Neither has key → generate new, store in both
pub fn get_or_create_storage_key(app_data_dir: &std::path::Path) -> Result<[u8; KEY_LENGTH], String> {
    let key_path = app_data_dir.join("storage.key");

    // Try keyring first
    match try_get_from_keyring() {
        Ok(key) => {
            log::info!("Storage key loaded from OS keyring");
            sync_key_to_file(&key_path, &key);
            return Ok(key);
        }
        Err(e) => {
            log::debug!("Keyring read failed: {}", e);
        }
    }

    // Keyring missed — try file backup
    if let Ok(key) = read_key_file(&key_path) {
        log::info!("Storage key restored from file backup");
        try_store_in_keyring(&key);
        return Ok(key);
    }

    // No key anywhere — generate new
    let key = generate_random_key()?;
    try_store_in_keyring(&key);
    write_key_to_file(&key_path, &key)?;
    log::info!("Generated and stored new storage key");
    Ok(key)
}

/// Try to read key from OS keyring (non-fatal on failure)
fn try_get_from_keyring() -> Result<[u8; KEY_LENGTH], String> {
    let entry = keyring::Entry::new(SERVICE_NAME, ACCOUNT_NAME)
        .map_err(|e| format!("Keyring entry error: {}", e))?;

    match entry.get_password() {
        Ok(encoded) => decode_key(&encoded),
        Err(e) => Err(format!("Keyring get: {}", e)),
    }
}

/// Try to store key in OS keyring (best-effort, log on failure)
fn try_store_in_keyring(key: &[u8; KEY_LENGTH]) {
    let Ok(entry) = keyring::Entry::new(SERVICE_NAME, ACCOUNT_NAME) else {
        return;
    };
    let encoded = BASE64.encode(key);
    if let Err(e) = entry.set_password(&encoded) {
        log::warn!("Failed to store key in keyring: {}", e);
    }
}

/// Write key to file with restricted permissions
fn write_key_to_file(
    key_path: &std::path::Path,
    key: &[u8; KEY_LENGTH],
) -> Result<(), String> {
    if let Some(parent) = key_path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create app data dir: {}", e))?;
    }

    let encoded = BASE64.encode(key);
    std::fs::write(key_path, encoded.as_bytes())
        .map_err(|e| format!("Failed to write key file: {}", e))?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(key_path, std::fs::Permissions::from_mode(0o600))
            .map_err(|e| format!("Failed to set key file permissions: {}", e))?;
    }
    Ok(())
}

/// Sync key to file backup (best-effort, log on failure)
fn sync_key_to_file(key_path: &std::path::Path, key: &[u8; KEY_LENGTH]) {
    if let Err(e) = write_key_to_file(key_path, key) {
        log::warn!("Failed to sync key to file backup: {}", e);
    }
}

fn read_key_file(path: &PathBuf) -> Result<[u8; KEY_LENGTH], String> {
    let encoded = std::fs::read_to_string(path)
        .map_err(|e| format!("Failed to read key file: {}", e))?;
    decode_key(encoded.trim())
}

fn decode_key(encoded: &str) -> Result<[u8; KEY_LENGTH], String> {
    let bytes = BASE64
        .decode(encoded.trim())
        .map_err(|e| format!("Invalid key encoding: {}", e))?;
    bytes
        .try_into()
        .map_err(|_| "Invalid key length (expected 32 bytes)".to_string())
}

fn generate_random_key() -> Result<[u8; KEY_LENGTH], String> {
    let rng = SystemRandom::new();
    let mut key = [0u8; KEY_LENGTH];
    rng.fill(&mut key)
        .map_err(|_| "Failed to generate random key".to_string())?;
    Ok(key)
}
