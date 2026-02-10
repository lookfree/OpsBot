//! Business logic services for ZWD-OpsBot
//!
//! This module contains all service implementations.

pub mod ai;
pub mod crypto_service;
pub mod database;
pub mod docker;
pub mod keyring_service;
pub mod known_hosts;
#[cfg(any(feature = "kafka", feature = "redis", feature = "elasticsearch"))]
pub mod middleware;
pub mod sftp_service;
pub mod ssh_service;

pub use ai::AiService;
pub use crypto_service::CryptoService;
pub use database::DatabaseService;
pub use docker::DockerService;
pub use keyring_service::get_or_create_storage_key;
pub use known_hosts::KnownHostsStore;
#[cfg(any(feature = "kafka", feature = "redis", feature = "elasticsearch"))]
pub use middleware::MiddlewareService;
pub use sftp_service::*;
pub use ssh_service::*;
