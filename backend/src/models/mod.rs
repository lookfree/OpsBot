//! Data models for ZWD-OpsBot
//!
//! This module contains all data structures used across the application.

pub mod ai;
pub mod connection;
pub mod database;
pub mod docker;
#[cfg(feature = "elasticsearch")]
pub mod elasticsearch;
#[cfg(feature = "kafka")]
pub mod middleware;
#[cfg(feature = "redis")]
pub mod redis;
pub mod sftp;
pub mod ssh;

pub use ai::*;
pub use connection::*;
pub use database::*;
pub use docker::*;
#[cfg(feature = "elasticsearch")]
pub use elasticsearch::*;
#[cfg(feature = "kafka")]
pub use middleware::*;
#[cfg(feature = "redis")]
pub use redis::*;
pub use sftp::*;
pub use ssh::*;
