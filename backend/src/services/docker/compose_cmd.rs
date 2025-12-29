//! Docker Compose command execution utilities
//!
//! Provides async command execution to avoid blocking Tokio runtime.

use tokio::process::Command;

/// Docker Compose command result
pub struct ComposeOutput {
    pub stdout: String,
    pub stderr: String,
    pub success: bool,
}

/// Execute a docker compose command asynchronously
pub async fn run_compose(args: &[&str]) -> Result<ComposeOutput, String> {
    let output = Command::new("docker")
        .args(args)
        .output()
        .await
        .map_err(|e| format!("Failed to execute docker compose: {}", e))?;

    Ok(ComposeOutput {
        stdout: String::from_utf8_lossy(&output.stdout).to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).to_string(),
        success: output.status.success(),
    })
}

/// Execute compose command and return stdout on success, error on failure
pub async fn run_compose_checked(args: &[&str], operation: &str) -> Result<String, String> {
    let output = run_compose(args).await?;

    if !output.success {
        return Err(format!("{} failed: {}", operation, output.stderr.trim()));
    }

    Ok(output.stdout)
}

/// Execute compose command that only needs success/failure result
pub async fn run_compose_action(args: &[&str], operation: &str) -> Result<(), String> {
    run_compose_checked(args, operation).await?;
    Ok(())
}

/// Helper to build common compose project args
pub fn project_args(project_name: &str) -> Vec<&str> {
    vec!["compose", "-p", project_name]
}

/// Validate project name to prevent command injection
pub fn validate_project_name(name: &str) -> Result<(), String> {
    // Docker compose project name rules:
    // - must start with lowercase letter or number
    // - can contain lowercase letters, numbers, hyphens, and underscores
    if name.is_empty() {
        return Err("Project name cannot be empty".to_string());
    }

    let first_char = name.chars().next().unwrap();
    if !first_char.is_ascii_lowercase() && !first_char.is_ascii_digit() {
        return Err("Project name must start with a lowercase letter or number".to_string());
    }

    for ch in name.chars() {
        if !ch.is_ascii_lowercase() && !ch.is_ascii_digit() && ch != '-' && ch != '_' {
            return Err(format!("Invalid character '{}' in project name", ch));
        }
    }

    // Prevent path traversal attempts
    if name.contains("..") || name.contains('/') || name.contains('\\') {
        return Err("Project name contains invalid path characters".to_string());
    }

    Ok(())
}

/// Validate and sanitize compose file path
pub fn validate_compose_path(path: &str) -> Result<std::path::PathBuf, String> {
    use std::path::Path;

    if path.is_empty() {
        return Err("Path cannot be empty".to_string());
    }

    let path = Path::new(path);

    // Normalize the path to resolve any .. or . components
    let canonical = if path.exists() {
        path.canonicalize()
            .map_err(|e| format!("Failed to resolve path: {}", e))?
    } else {
        // For new paths, check parent exists
        if let Some(parent) = path.parent() {
            if parent.exists() {
                let canonical_parent = parent.canonicalize()
                    .map_err(|e| format!("Failed to resolve parent path: {}", e))?;
                canonical_parent.join(path.file_name().unwrap_or_default())
            } else {
                return Err("Parent directory does not exist".to_string());
            }
        } else {
            return Err("Invalid path".to_string());
        }
    };

    // Check for unsafe paths (system directories)
    let path_str = canonical.to_string_lossy();
    let unsafe_prefixes = ["/bin", "/sbin", "/usr/bin", "/usr/sbin", "/etc", "/var/run", "/sys", "/proc"];

    for prefix in unsafe_prefixes {
        if path_str.starts_with(prefix) {
            return Err(format!("Cannot use system directory: {}", prefix));
        }
    }

    Ok(canonical)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validate_project_name() {
        assert!(validate_project_name("myproject").is_ok());
        assert!(validate_project_name("my-project").is_ok());
        assert!(validate_project_name("my_project").is_ok());
        assert!(validate_project_name("123project").is_ok());

        assert!(validate_project_name("").is_err());
        assert!(validate_project_name("MyProject").is_err());
        assert!(validate_project_name("-project").is_err());
        assert!(validate_project_name("../etc").is_err());
        assert!(validate_project_name("project;rm -rf /").is_err());
    }
}
