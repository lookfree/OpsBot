//! SSH Known Hosts Store
//!
//! Implements Trust On First Use (TOFU) host key verification.
//! Stores host keys in a file similar to OpenSSH known_hosts format.

use std::collections::HashMap;
use std::path::PathBuf;
use tokio::sync::RwLock;

/// Result of looking up a host key
pub enum HostKeyLookup {
    /// Host is known and the key matches
    Match,
    /// Host is known but the key has changed
    Mismatch { old_key: String },
    /// Host is not in the known_hosts store
    Unknown,
}

/// A known host entry
struct KnownHostEntry {
    key_type: String,
    key_base64: String,
    #[allow(dead_code)]
    timestamp: String,
}

/// Persistent known hosts store with file-backed storage
pub struct KnownHostsStore {
    path: PathBuf,
    entries: RwLock<HashMap<String, KnownHostEntry>>,
}

impl KnownHostsStore {
    /// Create an empty store with the given file path
    pub fn new(path: PathBuf) -> Self {
        Self {
            path,
            entries: RwLock::new(HashMap::new()),
        }
    }

    /// Load known hosts from file. Creates empty store if file doesn't exist.
    pub fn load(app_data_dir: &std::path::Path) -> Result<Self, String> {
        let path = app_data_dir.join("known_hosts");
        let mut entries = HashMap::new();

        if path.exists() {
            let content = std::fs::read_to_string(&path)
                .map_err(|e| format!("Failed to read known_hosts: {}", e))?;
            for line in content.lines() {
                if let Some(entry) = Self::parse_line(line) {
                    entries.insert(entry.0, entry.1);
                }
            }
            log::info!("Loaded {} known host(s)", entries.len());
        }

        Ok(Self {
            path,
            entries: RwLock::new(entries),
        })
    }

    /// Parse a single line: "host:port key_type base64_key timestamp"
    fn parse_line(line: &str) -> Option<(String, KnownHostEntry)> {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            return None;
        }
        let parts: Vec<&str> = line.splitn(4, ' ').collect();
        if parts.len() < 3 {
            return None;
        }
        let host_port = parts[0].to_string();
        let entry = KnownHostEntry {
            key_type: parts[1].to_string(),
            key_base64: parts[2].to_string(),
            timestamp: parts.get(3).unwrap_or(&"").to_string(),
        };
        Some((host_port, entry))
    }

    /// Look up a host key
    pub async fn lookup(&self, host_port: &str, key_base64: &str) -> HostKeyLookup {
        let entries = self.entries.read().await;
        match entries.get(host_port) {
            Some(entry) => {
                if entry.key_base64 == key_base64 {
                    HostKeyLookup::Match
                } else {
                    HostKeyLookup::Mismatch {
                        old_key: entry.key_base64.clone(),
                    }
                }
            }
            None => HostKeyLookup::Unknown,
        }
    }

    /// Add or replace a host key entry and persist to file
    pub async fn add(
        &self,
        host_port: &str,
        key_type: &str,
        key_base64: &str,
    ) -> Result<(), String> {
        let timestamp = chrono::Utc::now().to_rfc3339();
        {
            let mut entries = self.entries.write().await;
            entries.insert(
                host_port.to_string(),
                KnownHostEntry {
                    key_type: key_type.to_string(),
                    key_base64: key_base64.to_string(),
                    timestamp: timestamp.clone(),
                },
            );
        }
        self.persist().await
    }

    /// Write all entries to disk
    async fn persist(&self) -> Result<(), String> {
        if let Some(parent) = self.path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create dir: {}", e))?;
        }

        let entries = self.entries.read().await;
        let mut content = String::new();
        for (host_port, entry) in entries.iter() {
            content.push_str(&format!(
                "{} {} {} {}\n",
                host_port, entry.key_type, entry.key_base64, entry.timestamp
            ));
        }

        std::fs::write(&self.path, content.as_bytes())
            .map_err(|e| format!("Failed to write known_hosts: {}", e))
    }
}
