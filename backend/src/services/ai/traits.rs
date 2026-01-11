//! AI Driver Traits
//!
//! This module defines common traits for AI service drivers.

use async_trait::async_trait;

/// Status of an AI driver
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DriverStatus {
    /// Driver is connected and ready
    Connected,
    /// Driver is disconnected
    Disconnected,
    /// Driver encountered an error
    Error(String),
}

/// Common trait for AI service drivers
///
/// All AI drivers (Ollama, TensorRT, Cloud APIs) should implement this trait
/// to provide a consistent interface for connection management.
#[async_trait]
pub trait AiDriver: Send + Sync {
    /// Connect to the AI service
    ///
    /// # Arguments
    /// * `host` - The host address of the service
    /// * `port` - The port number of the service
    async fn connect(&self, host: &str, port: u16) -> Result<(), String>;

    /// Disconnect from the AI service
    async fn disconnect(&self) -> Result<(), String>;

    /// Test the connection to the AI service
    ///
    /// # Returns
    /// `true` if the connection is valid, `false` otherwise
    async fn test_connection(&self) -> Result<bool, String>;

    /// Get the current status of the driver
    fn get_status(&self) -> DriverStatus;
}

/// Trait for AI services that support model management
#[async_trait]
pub trait ModelManager: Send + Sync {
    /// List available models
    async fn list_models(&self) -> Result<Vec<String>, String>;

    /// Download/pull a model
    async fn pull_model(&self, model_name: &str) -> Result<(), String>;

    /// Delete a model
    async fn delete_model(&self, model_name: &str) -> Result<(), String>;

    /// Get information about a specific model
    async fn get_model_info(&self, model_name: &str) -> Result<String, String>;
}

/// Trait for AI services that support service lifecycle management
#[async_trait]
pub trait ServiceController: Send + Sync {
    /// Start the AI service
    async fn start_service(&self) -> Result<(), String>;

    /// Stop the AI service
    async fn stop_service(&self) -> Result<(), String>;

    /// Restart the AI service
    async fn restart_service(&self) -> Result<(), String>;

    /// Get the current service status
    async fn get_service_status(&self) -> Result<ServiceStatus, String>;

    /// Get the service version
    async fn get_version(&self) -> Result<String, String>;
}

/// Service status information
#[derive(Debug, Clone)]
pub struct ServiceStatus {
    /// Whether the service is running
    pub is_running: bool,
    /// Service version (if available)
    pub version: Option<String>,
    /// Uptime in seconds (if available)
    pub uptime: Option<u64>,
    /// Additional status message
    pub message: Option<String>,
}
