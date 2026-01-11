//! GPU monitoring module
//!
//! This module provides GPU monitoring functionality:
//! - NVIDIA GPU detection and monitoring via nvidia-smi
//! - Real-time GPU metrics collection
//! - Historical data storage and retrieval

mod nvidia;
mod history;

pub use nvidia::NvidiaGpuMonitor;
pub use history::{GpuHistoryService, HistoryInterval};
