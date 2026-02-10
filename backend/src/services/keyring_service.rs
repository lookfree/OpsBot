//! OS Keyring Service for secure storage key management
//!
//! Stores a randomly-generated 256-bit key in the OS keyring
//! (macOS Keychain, Windows Credential Manager, Linux Secret Service).
//! Falls back to file-based storage if keyring is unavailable.

use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use ring::rand::{SecureRandom, SystemRandom};
use std::path::PathBuf;

const SERVICE_NAME: &str = "com.zwd.opsbot";
const ACCOUNT_NAME: &str = "storage_key";
const KEY_LENGTH: usize = 32;

/// Retrieve or create a 256-bit storage key.
///
/// Tries OS keyring first; falls back to file-based key if unavailable.
pub fn get_or_create_storage_key(app_data_dir: &std::path::Path) -> Result<[u8; KEY_LENGTH], String> {
    match get_or_create_from_keyring() {
        Ok(key) => Ok(key),
        Err(e) => {
            log::warn!("Keyring unavailable ({}), using file-based fallback", e);
            get_or_create_from_file(app_data_dir)
        }
    }
}

/// Try to get/create key from OS keyring
fn get_or_create_from_keyring() -> Result<[u8; KEY_LENGTH], String> {
    let entry = keyring::Entry::new(SERVICE_NAME, ACCOUNT_NAME)
        .map_err(|e| format!("Keyring entry error: {}", e))?;

    // Try to retrieve existing key
    match entry.get_password() {
        Ok(encoded) => decode_key(&encoded),
        Err(keyring::Error::NoEntry) => {
            let key = generate_random_key()?;
            let encoded = BASE64.encode(key);
            entry
                .set_password(&encoded)
                .map_err(|e| format!("Failed to store key in keyring: {}", e))?;
            log::info!("Generated and stored new storage key in OS keyring");
            Ok(key)
        }
        Err(e) => Err(format!("Keyring read error: {}", e)),
    }
}

/// File-based fallback for headless environments
fn get_or_create_from_file(app_data_dir: &std::path::Path) -> Result<[u8; KEY_LENGTH], String> {
    let key_path = app_data_dir.join("storage.key");

    if key_path.exists() {
        return read_key_file(&key_path);
    }

    // Ensure parent directory exists
    if let Some(parent) = key_path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create app data dir: {}", e))?;
    }

    let key = generate_random_key()?;
    let encoded = BASE64.encode(key);
    std::fs::write(&key_path, encoded.as_bytes())
        .map_err(|e| format!("Failed to write key file: {}", e))?;

    // Restrict file permissions on Unix
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&key_path, std::fs::Permissions::from_mode(0o600))
            .map_err(|e| format!("Failed to set key file permissions: {}", e))?;
    }

    log::info!("Generated and stored new storage key in file");
    Ok(key)
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
