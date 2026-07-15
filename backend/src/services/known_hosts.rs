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
    /// Host is known for this key type but the key has changed
    Mismatch { old_key: String },
    /// No stored key for this host / key-type combination
    Unknown,
}

/// A known host entry
#[derive(Clone)]
struct KnownHostEntry {
    key_type: String,
    key_base64: String,
    #[allow(dead_code)]
    timestamp: String,
}

/// Persistent known hosts store with file-backed storage.
///
/// Keyed by host:port with one entry per host-key algorithm (key type), like
/// OpenSSH's known_hosts. Keeping keys per type means a change in the negotiated
/// key type is treated as a NEW key (prompt to trust) rather than a spurious
/// "host key changed" MITM warning.
pub struct KnownHostsStore {
    path: PathBuf,
    entries: RwLock<HashMap<String, Vec<KnownHostEntry>>>,
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
        let mut entries: HashMap<String, Vec<KnownHostEntry>> = HashMap::new();

        if path.exists() {
            let content = std::fs::read_to_string(&path)
                .map_err(|e| format!("Failed to read known_hosts: {}", e))?;
            let mut count = 0;
            for line in content.lines() {
                if let Some((host_port, entry)) = Self::parse_line(line) {
                    let list = entries.entry(host_port).or_default();
                    // At most one entry per key type; last line wins.
                    list.retain(|e| e.key_type != entry.key_type);
                    list.push(entry);
                    count += 1;
                }
            }
            log::info!("Loaded {} known host key(s)", count);
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

    /// Look up a host key for the given key type.
    pub async fn lookup(&self, host_port: &str, key_type: &str, key_base64: &str) -> HostKeyLookup {
        let entries = self.entries.read().await;
        let existing = entries
            .get(host_port)
            .and_then(|list| list.iter().find(|e| e.key_type == key_type));
        match existing {
            Some(entry) if entry.key_base64 == key_base64 => HostKeyLookup::Match,
            Some(entry) => HostKeyLookup::Mismatch {
                old_key: entry.key_base64.clone(),
            },
            None => HostKeyLookup::Unknown,
        }
    }

    /// Add or replace the entry for this host and key type, then persist.
    pub async fn add(
        &self,
        host_port: &str,
        key_type: &str,
        key_base64: &str,
    ) -> Result<(), String> {
        let timestamp = chrono::Utc::now().to_rfc3339();
        {
            let mut entries = self.entries.write().await;
            let list = entries.entry(host_port.to_string()).or_default();
            list.retain(|e| e.key_type != key_type);
            list.push(KnownHostEntry {
                key_type: key_type.to_string(),
                key_base64: key_base64.to_string(),
                timestamp,
            });
        }
        self.persist().await
    }

    /// Number of stored keys for a host, across key types (diagnostics/tests).
    pub async fn host_key_count(&self, host_port: &str) -> usize {
        self.entries
            .read()
            .await
            .get(host_port)
            .map(|list| list.len())
            .unwrap_or(0)
    }

    /// Write all entries to disk without blocking the async runtime.
    async fn persist(&self) -> Result<(), String> {
        if let Some(parent) = self.path.parent() {
            tokio::fs::create_dir_all(parent)
                .await
                .map_err(|e| format!("Failed to create dir: {}", e))?;
        }

        // Serialize under the lock, then release it before the file write.
        let content = {
            let entries = self.entries.read().await;
            let mut content = String::new();
            for (host_port, list) in entries.iter() {
                for entry in list {
                    content.push_str(&format!(
                        "{} {} {} {}\n",
                        host_port, entry.key_type, entry.key_base64, entry.timestamp
                    ));
                }
            }
            content
        };

        tokio::fs::write(&self.path, content.as_bytes())
            .await
            .map_err(|e| format!("Failed to write known_hosts: {}", e))
    }
}
