//! TensorRT-LLM integration module
//!
//! This module provides integration with NVIDIA TensorRT-LLM for high-performance
//! inference on NVIDIA GPUs.

mod driver;

pub use driver::TensorRTDriver;
