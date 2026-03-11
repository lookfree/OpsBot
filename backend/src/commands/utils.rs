//! Utility commands

use std::fs::OpenOptions;
use std::io::Write;
use std::path::{Component, Path};

/// Append content to a file
#[tauri::command]
pub async fn append_to_file(path: String, content: String) -> Result<(), String> {
    let path = Path::new(&path);

    // Reject path traversal
    if path
        .components()
        .any(|c| matches!(c, Component::ParentDir))
    {
        return Err("Path traversal not allowed".to_string());
    }

    // Resolve the path for validation
    let check_path = if path.exists() {
        path.canonicalize()
            .map_err(|e| {
                log::error!("Path validation failed: {}", e);
                "Invalid path".to_string()
            })?
    } else if let Some(parent) = path.parent() {
        if parent.as_os_str().is_empty() || !parent.exists() {
            return Err("Parent directory does not exist".to_string());
        }
        parent
            .canonicalize()
            .map_err(|e| {
                log::error!("Parent path validation failed: {}", e);
                "Invalid path".to_string()
            })?
    } else {
        return Err("Invalid path".to_string());
    };

    // Block known system directories
    let blocked_prefixes = ["/etc", "/usr", "/bin", "/sbin", "/var", "/System"];
    let check_str = check_path.to_string_lossy();
    for prefix in &blocked_prefixes {
        if check_str.starts_with(prefix) {
            return Err(format!(
                "Writing to system directory '{}' is not allowed",
                prefix
            ));
        }
    }

    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|e| {
            log::error!("Failed to open file '{}': {}", path.display(), e);
            "Failed to open file".to_string()
        })?;

    file.write_all(content.as_bytes())
        .map_err(|e| {
            log::error!("Failed to write to file '{}': {}", path.display(), e);
            "Failed to write to file".to_string()
        })?;

    Ok(())
}

/// Read a PEM/private key file and return its text content
///
/// Only `.pem` and `.key` files are accepted, and path traversal is rejected.
#[tauri::command]
pub async fn read_pem_file(path: String) -> Result<String, String> {
    let path = Path::new(&path);

    // Reject path traversal
    if path
        .components()
        .any(|c| matches!(c, Component::ParentDir))
    {
        return Err("Path traversal not allowed".to_string());
    }

    // Only allow .pem and .key extensions
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase());
    match ext.as_deref() {
        Some("pem") | Some("key") | Some("ppk") => {}
        _ => return Err("Only .pem, .key, and .ppk files are supported".to_string()),
    }

    std::fs::read_to_string(path).map_err(|e| {
        log::error!("Failed to read PEM file '{}': {}", path.display(), e);
        format!("Failed to read file: {}", e)
    })
}
