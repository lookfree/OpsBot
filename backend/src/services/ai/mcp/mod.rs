//! MCP (Model Context Protocol) Server Management
//!
//! This module provides management for MCP servers, supporting:
//! - Stdio transport (command-line subprocess)
//! - SSE transport (HTTP Server-Sent Events)
//! - Tool binding and management

mod server;

pub use server::{McpServerInstance, McpServerManager};
