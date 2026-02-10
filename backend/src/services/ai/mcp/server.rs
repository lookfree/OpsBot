//! MCP Server Manager
//!
//! Manages MCP server instances with support for Stdio and SSE transports.

use std::collections::HashMap;
use std::path::Path;
use std::process::{Child, Command, Stdio};
use std::sync::Arc;
use tokio::sync::RwLock;
use chrono::Utc;
use uuid::Uuid;

use crate::models::{
    McpServerConfig, McpServerInfo, McpServerStatus, McpTool, McpTransport,
};

/// Allowed MCP server commands (basename only)
const ALLOWED_MCP_COMMANDS: &[&str] = &[
    "npx", "node", "python", "python3", "uvx", "docker", "deno", "bun",
];

/// Shell metacharacters that could enable command injection
const SHELL_METACHARACTERS: &[char] = &[
    ';', '&', '|', '`', '$', '(', ')', '{', '}', '<', '>', '\n', '\r',
];

/// Validate an MCP command and its arguments before execution
fn validate_mcp_command(command: &str, args: &[String]) -> Result<(), String> {
    // Extract basename from the command path
    let basename = Path::new(command)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or(command);

    if !ALLOWED_MCP_COMMANDS.contains(&basename) {
        return Err(format!(
            "MCP command '{}' is not allowed. Allowed commands: {}",
            basename,
            ALLOWED_MCP_COMMANDS.join(", ")
        ));
    }

    // Check args for shell metacharacters
    for arg in args {
        if arg.contains(SHELL_METACHARACTERS) {
            return Err(format!(
                "MCP argument '{}' contains forbidden shell metacharacters",
                arg
            ));
        }
    }

    Ok(())
}

/// MCP Server instance
pub struct McpServerInstance {
    pub id: String,
    pub config: McpServerConfig,
    pub status: McpServerStatus,
    pub created_at: String,
    process: Option<Child>,
}

impl McpServerInstance {
    /// Create a new MCP server instance
    pub fn new(id: String, config: McpServerConfig) -> Self {
        Self {
            id,
            config,
            status: McpServerStatus::Stopped,
            created_at: Utc::now().to_rfc3339(),
            process: None,
        }
    }

    /// Get server info
    pub fn get_info(&self) -> McpServerInfo {
        McpServerInfo {
            id: self.id.clone(),
            name: self.config.name.clone(),
            description: self.config.description.clone(),
            transport: self.config.transport.clone(),
            status: self.status.clone(),
            tool_count: self.config.tools.len(),
            created_at: self.created_at.clone(),
        }
    }

    /// Start the server (for Stdio transport)
    pub fn start(&mut self) -> Result<(), String> {
        match &self.config.transport {
            McpTransport::Stdio { command, args } => {
                validate_mcp_command(command, args)?;

                let child = Command::new(command)
                    .args(args)
                    .stdin(Stdio::piped())
                    .stdout(Stdio::piped())
                    .stderr(Stdio::piped())
                    .spawn()
                    .map_err(|e| format!("Failed to start MCP server: {}", e))?;

                self.process = Some(child);
                self.status = McpServerStatus::Running;
                Ok(())
            }
            McpTransport::Sse { url: _ } => {
                // SSE servers are external, just mark as running
                self.status = McpServerStatus::Running;
                Ok(())
            }
        }
    }

    /// Stop the server
    pub fn stop(&mut self) -> Result<(), String> {
        if let Some(mut child) = self.process.take() {
            child.kill().map_err(|e| format!("Failed to stop MCP server: {}", e))?;
        }
        self.status = McpServerStatus::Stopped;
        Ok(())
    }

    /// Check if server is running
    pub fn is_running(&self) -> bool {
        matches!(self.status, McpServerStatus::Running)
    }

    /// Add a tool to the server
    pub fn add_tool(&mut self, tool: McpTool) {
        self.config.tools.push(tool);
    }

    /// Remove a tool from the server
    pub fn remove_tool(&mut self, tool_name: &str) -> bool {
        let initial_len = self.config.tools.len();
        self.config.tools.retain(|t| t.name != tool_name);
        self.config.tools.len() < initial_len
    }
}

impl Drop for McpServerInstance {
    fn drop(&mut self) {
        // Ensure process is killed when instance is dropped
        if let Some(mut child) = self.process.take() {
            let _ = child.kill();
        }
    }
}

/// MCP Server Manager
pub struct McpServerManager {
    servers: Arc<RwLock<HashMap<String, McpServerInstance>>>,
}

impl McpServerManager {
    /// Create a new MCP server manager
    pub fn new() -> Self {
        Self {
            servers: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Create a new MCP server
    pub async fn create_server(&self, config: McpServerConfig) -> Result<String, String> {
        let id = Uuid::new_v4().to_string();
        let instance = McpServerInstance::new(id.clone(), config);

        let mut servers = self.servers.write().await;
        servers.insert(id.clone(), instance);

        Ok(id)
    }

    /// Delete an MCP server
    pub async fn delete_server(&self, server_id: &str) -> Result<(), String> {
        let mut servers = self.servers.write().await;

        if let Some(mut instance) = servers.remove(server_id) {
            // Stop the server if running
            if instance.is_running() {
                instance.stop()?;
            }
            Ok(())
        } else {
            Err(format!("MCP server not found: {}", server_id))
        }
    }

    /// Start an MCP server
    pub async fn start_server(&self, server_id: &str) -> Result<(), String> {
        let mut servers = self.servers.write().await;

        if let Some(instance) = servers.get_mut(server_id) {
            if instance.is_running() {
                return Err("Server is already running".to_string());
            }
            instance.start()
        } else {
            Err(format!("MCP server not found: {}", server_id))
        }
    }

    /// Stop an MCP server
    pub async fn stop_server(&self, server_id: &str) -> Result<(), String> {
        let mut servers = self.servers.write().await;

        if let Some(instance) = servers.get_mut(server_id) {
            if !instance.is_running() {
                return Err("Server is not running".to_string());
            }
            instance.stop()
        } else {
            Err(format!("MCP server not found: {}", server_id))
        }
    }

    /// Get server status
    pub async fn get_server_status(&self, server_id: &str) -> Option<McpServerStatus> {
        let servers = self.servers.read().await;
        servers.get(server_id).map(|s| s.status.clone())
    }

    /// Get server info
    pub async fn get_server_info(&self, server_id: &str) -> Option<McpServerInfo> {
        let servers = self.servers.read().await;
        servers.get(server_id).map(|s| s.get_info())
    }

    /// List all servers
    pub async fn list_servers(&self) -> Vec<McpServerInfo> {
        let servers = self.servers.read().await;
        servers.values().map(|s| s.get_info()).collect()
    }

    /// Bind a tool to a server
    pub async fn bind_tool(&self, server_id: &str, tool: McpTool) -> Result<(), String> {
        let mut servers = self.servers.write().await;

        if let Some(instance) = servers.get_mut(server_id) {
            // Check if tool with same name already exists
            if instance.config.tools.iter().any(|t| t.name == tool.name) {
                return Err(format!("Tool '{}' already exists", tool.name));
            }
            instance.add_tool(tool);
            Ok(())
        } else {
            Err(format!("MCP server not found: {}", server_id))
        }
    }

    /// Unbind a tool from a server
    pub async fn unbind_tool(&self, server_id: &str, tool_name: &str) -> Result<(), String> {
        let mut servers = self.servers.write().await;

        if let Some(instance) = servers.get_mut(server_id) {
            if instance.remove_tool(tool_name) {
                Ok(())
            } else {
                Err(format!("Tool '{}' not found", tool_name))
            }
        } else {
            Err(format!("MCP server not found: {}", server_id))
        }
    }

    /// Get tools for a server
    pub async fn get_server_tools(&self, server_id: &str) -> Result<Vec<McpTool>, String> {
        let servers = self.servers.read().await;

        if let Some(instance) = servers.get(server_id) {
            Ok(instance.config.tools.clone())
        } else {
            Err(format!("MCP server not found: {}", server_id))
        }
    }

    /// Update server configuration
    pub async fn update_server(&self, server_id: &str, config: McpServerConfig) -> Result<(), String> {
        let mut servers = self.servers.write().await;

        if let Some(instance) = servers.get_mut(server_id) {
            // If server is running, stop it first
            if instance.is_running() {
                instance.stop()?;
            }
            instance.config = config;
            Ok(())
        } else {
            Err(format!("MCP server not found: {}", server_id))
        }
    }
}

impl Default for McpServerManager {
    fn default() -> Self {
        Self::new()
    }
}
