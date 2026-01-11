//! Ollama service module
//!
//! This module provides:
//! - HTTP client for interacting with Ollama API
//! - Service lifecycle control (start/stop/restart)

mod client;
mod service;

pub use client::OllamaClient;
pub use service::{OllamaServiceController, ServiceOperationResult};
