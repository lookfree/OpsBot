//! Utility commands

use std::fs::OpenOptions;
use std::io::Write;

/// Append content to a file
#[tauri::command]
pub async fn append_to_file(path: String, content: String) -> Result<(), String> {
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|e| format!("Failed to open file: {}", e))?;

    file.write_all(content.as_bytes())
        .map_err(|e| format!("Failed to write to file: {}", e))?;

    Ok(())
}
