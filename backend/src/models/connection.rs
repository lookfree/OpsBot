//! Connection configuration models
//!
//! Defines the data structures for various connection types.

use serde::{Deserialize, Serialize};

/// Module type for categorizing connections
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ModuleType {
    Ssh,
    Database,
    Docker,
    Middleware,
}

/// SSH authentication type
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SshAuthType {
    Password,
    Key,
    Interactive,
}

/// Proxy type for SSH connections
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ProxyType {
    Socks5,
    Http,
}

/// Jump host (bastion) configuration
// NOTE: Debug is hand-written (below) to redact secrets. Do NOT add `Debug` to
// this derive.
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JumpHostConfig {
    pub host: String,
    pub port: u16,
    pub username: String,
    pub auth_type: SshAuthType,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub password: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub private_key: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub passphrase: Option<String>,
}

impl std::fmt::Debug for JumpHostConfig {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let redact = |v: &Option<String>| v.as_ref().map(|_| "<redacted>");
        f.debug_struct("JumpHostConfig")
            .field("host", &self.host)
            .field("port", &self.port)
            .field("username", &self.username)
            .field("auth_type", &self.auth_type)
            .field("password", &redact(&self.password))
            .field("private_key", &redact(&self.private_key))
            .field("passphrase", &redact(&self.passphrase))
            .finish()
    }
}

impl Drop for JumpHostConfig {
    /// Scrub the plaintext secrets from memory on drop (core dump / swap defense).
    fn drop(&mut self) {
        use zeroize::Zeroize;
        self.password.zeroize();
        self.private_key.zeroize();
        self.passphrase.zeroize();
    }
}

/// Proxy configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProxyConfig {
    pub proxy_type: ProxyType,
    pub host: String,
    pub port: u16,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub username: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub password: Option<String>,
}

/// Terminal display settings
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalSettings {
    #[serde(default = "default_font_size")]
    pub font_size: u32,
    #[serde(default = "default_font_family")]
    pub font_family: String,
    #[serde(default = "default_color_scheme")]
    pub color_scheme: String,
}

fn default_font_size() -> u32 {
    14
}

fn default_font_family() -> String {
    "JetBrains Mono, Fira Code, monospace".to_string()
}

fn default_color_scheme() -> String {
    "default".to_string()
}

impl Default for TerminalSettings {
    fn default() -> Self {
        Self {
            font_size: default_font_size(),
            font_family: default_font_family(),
            color_scheme: default_color_scheme(),
        }
    }
}

/// SSH connection configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SshConnectionConfig {
    pub id: String,
    pub name: String,
    pub host: String,
    pub port: u16,
    pub username: String,
    pub auth_type: SshAuthType,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub password: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub private_key: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub passphrase: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub jump_host: Option<JumpHostConfig>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub proxy: Option<ProxyConfig>,
    #[serde(default)]
    pub terminal_settings: TerminalSettings,
}
