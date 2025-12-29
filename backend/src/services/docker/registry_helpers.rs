//! Registry storage and authentication helpers
//!
//! Provides utilities for managing Docker registry configurations and testing connections.

use crate::models::docker::RegistryInfo;

/// Get the path to the registries configuration file
pub fn get_registries_file_path() -> Result<std::path::PathBuf, String> {
    let home = std::env::var("HOME").or_else(|_| std::env::var("USERPROFILE"))
        .map_err(|_| "Cannot determine home directory".to_string())?;

    let config_dir = std::path::PathBuf::from(&home)
        .join(".zwd-opsbot")
        .join("docker");

    // Ensure directory exists
    std::fs::create_dir_all(&config_dir)
        .map_err(|e| format!("Failed to create config directory: {}", e))?;

    Ok(config_dir.join("registries.json"))
}

/// Test registry connection using HTTP request
/// Supports both Basic Auth and Docker Registry Token Auth (Bearer)
pub fn test_registry_connection(
    url: &str,
    username: Option<&str>,
    password: Option<&str>,
    skip_tls_verify: bool,
) -> Result<String, String> {
    // Normalize URL - ensure it has a protocol
    let base_urls = if url.starts_with("http://") || url.starts_with("https://") {
        vec![url.trim_end_matches('/').to_string()]
    } else {
        vec![
            format!("https://{}", url.trim_end_matches('/')),
            format!("http://{}", url.trim_end_matches('/')),
        ]
    };

    let mut last_error = String::new();

    for base_url in base_urls {
        match test_registry_url_internal(&base_url, username, password, skip_tls_verify) {
            Ok(msg) => return Ok(msg),
            Err(e) => {
                if e.contains("连接失败") || e.contains("无法连接") {
                    last_error = e;
                    continue;
                }
                return Err(e);
            }
        }
    }

    Err(last_error)
}

fn test_registry_url_internal(
    base_url: &str,
    username: Option<&str>,
    password: Option<&str>,
    skip_tls_verify: bool,
) -> Result<String, String> {
    let test_url = format!("{}/v2/", base_url);

    let mut curl_args = vec![
        "-sI".to_string(),
        "-m".to_string(), "10".to_string(),
        "--noproxy".to_string(), "*".to_string(),
    ];

    if skip_tls_verify {
        curl_args.push("-k".to_string());
    }
    curl_args.push(test_url.clone());

    let output = std::process::Command::new("curl")
        .args(&curl_args)
        .output()
        .map_err(|e| format!("Failed to run curl: {}", e))?;

    if !output.status.success() && output.stdout.is_empty() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("无法连接到 Registry: {}", stderr.trim()));
    }

    let headers = String::from_utf8_lossy(&output.stdout);
    let first_line = headers.lines().next().unwrap_or("");

    let status = if first_line.contains(" 200 ") { 200 }
        else if first_line.contains(" 401 ") { 401 }
        else if first_line.contains(" 301 ") || first_line.contains(" 302 ") { 301 }
        else { 0 };

    match status {
        200 | 301 => Ok("连接成功".to_string()),
        401 => {
            // Check credentials
            let has_username = username.map(|s| !s.is_empty()).unwrap_or(false);
            let has_password = password.map(|s| !s.is_empty()).unwrap_or(false);

            if !has_username && !has_password {
                return Ok("连接成功（需要认证）".to_string());
            }

            if has_username != has_password {
                return Err("请同时填写用户名和密码".to_string());
            }

            let www_auth = headers.lines()
                .find(|l| l.to_lowercase().starts_with("www-authenticate:"))
                .unwrap_or("");

            if www_auth.to_lowercase().contains("bearer") {
                test_token_auth_internal(base_url, www_auth, username, password, skip_tls_verify)
            } else {
                test_basic_auth_internal(&test_url, username, password, skip_tls_verify)
            }
        }
        _ => Err(format!("连接失败，服务器响应: {}", first_line)),
    }
}

fn test_token_auth_internal(
    base_url: &str,
    www_auth: &str,
    username: Option<&str>,
    password: Option<&str>,
    skip_tls_verify: bool,
) -> Result<String, String> {
    let realm = www_auth.split("realm=\"").nth(1).and_then(|s| s.split('"').next());

    if let Some(realm_url) = realm {
        let service = www_auth.split("service=\"").nth(1).and_then(|s| s.split('"').next());
        let token_url = if let Some(svc) = service {
            format!("{}?service={}", realm_url, svc)
        } else {
            realm_url.to_string()
        };

        let mut curl_args = vec![
            "-s".to_string(),
            "-m".to_string(), "5".to_string(),
            "--noproxy".to_string(), "*".to_string(),
        ];

        if skip_tls_verify {
            curl_args.push("-k".to_string());
        }

        if let (Some(user), Some(pass)) = (username, password) {
            curl_args.push("-u".to_string());
            curl_args.push(format!("{}:{}", user, pass));
        }
        curl_args.push(token_url);

        if let Ok(output) = std::process::Command::new("curl").args(&curl_args).output() {
            let response = String::from_utf8_lossy(&output.stdout);
            if response.contains("\"token\"") || response.contains("\"access_token\"") {
                return Ok("连接成功".to_string());
            } else if response.contains("unauthorized") || response.contains("UNAUTHORIZED") {
                return Err("认证失败：用户名或密码错误".to_string());
            }
        }
    }

    test_harbor_api_internal(base_url, username, password, skip_tls_verify)
}

fn test_harbor_api_internal(
    base_url: &str,
    username: Option<&str>,
    password: Option<&str>,
    skip_tls_verify: bool,
) -> Result<String, String> {
    let api_url = format!("{}/api/v2.0/users/current", base_url);

    let mut curl_args = vec![
        "-s".to_string(),
        "-o".to_string(), "/dev/null".to_string(),
        "-w".to_string(), "%{http_code}".to_string(),
        "-m".to_string(), "10".to_string(),
        "--noproxy".to_string(), "*".to_string(),
    ];

    if skip_tls_verify {
        curl_args.push("-k".to_string());
    }

    if let (Some(user), Some(pass)) = (username, password) {
        curl_args.push("-u".to_string());
        curl_args.push(format!("{}:{}", user, pass));
    }
    curl_args.push(api_url);

    let output = std::process::Command::new("curl")
        .args(&curl_args)
        .output()
        .map_err(|e| format!("Failed to check Harbor API: {}", e))?;

    let status = String::from_utf8_lossy(&output.stdout).trim().to_string();

    match status.as_str() {
        "200" => Ok("连接成功".to_string()),
        "401" => Err("认证失败：用户名或密码错误".to_string()),
        _ => Err(format!("认证失败，HTTP 状态码: {}", status)),
    }
}

fn test_basic_auth_internal(
    url: &str,
    username: Option<&str>,
    password: Option<&str>,
    skip_tls_verify: bool,
) -> Result<String, String> {
    let mut curl_args = vec![
        "-s".to_string(),
        "-o".to_string(), "/dev/null".to_string(),
        "-w".to_string(), "%{http_code}".to_string(),
        "-m".to_string(), "10".to_string(),
        "--noproxy".to_string(), "*".to_string(),
    ];

    if skip_tls_verify {
        curl_args.push("-k".to_string());
    }

    if let (Some(user), Some(pass)) = (username, password) {
        curl_args.push("-u".to_string());
        curl_args.push(format!("{}:{}", user, pass));
    }
    curl_args.push(url.to_string());

    let output = std::process::Command::new("curl")
        .args(&curl_args)
        .output()
        .map_err(|e| format!("Failed to run curl: {}", e))?;

    let status = String::from_utf8_lossy(&output.stdout).trim().to_string();

    match status.as_str() {
        "200" => Ok("连接成功".to_string()),
        "401" => Err("认证失败：用户名或密码错误".to_string()),
        _ => Err(format!("认证失败，HTTP 状态码: {}", status)),
    }
}

/// Load registries from disk
pub fn load_registries() -> Result<Vec<RegistryInfo>, String> {
    let path = get_registries_file_path()?;

    if !path.exists() {
        return Ok(Vec::new());
    }

    let content = std::fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read registries file: {}", e))?;

    let mut registries: Vec<RegistryInfo> = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse registries file: {}", e))?;

    // Decrypt passwords
    let crypto = crate::services::crypto_service::CryptoService::new();
    for reg in &mut registries {
        if let Some(encrypted) = &reg.encrypted_password {
            if let Ok(decrypted) = crypto.decrypt_storage(encrypted) {
                reg.password = Some(decrypted);
            }
        }
    }

    Ok(registries)
}

/// Save registries to disk
pub fn save_registries(registries: &[RegistryInfo]) -> Result<(), String> {
    let path = get_registries_file_path()?;

    // Encrypt passwords before saving
    let crypto = crate::services::crypto_service::CryptoService::new();
    let mut registries_to_save: Vec<RegistryInfo> = registries.to_vec();
    for reg in &mut registries_to_save {
        if let Some(password) = &reg.password {
            if !password.is_empty() {
                if let Ok(encrypted) = crypto.encrypt_storage(password) {
                    reg.encrypted_password = Some(encrypted);
                }
            }
        }
    }

    let content = serde_json::to_string_pretty(&registries_to_save)
        .map_err(|e| format!("Failed to serialize registries: {}", e))?;

    std::fs::write(&path, content)
        .map_err(|e| format!("Failed to write registries file: {}", e))
}
