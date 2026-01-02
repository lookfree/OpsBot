//! Elasticsearch driver module
//!
//! Implements the SearchEngineDriver trait for Elasticsearch.

mod cluster;
mod document;
mod driver;
mod index;
mod query;

pub use driver::{ElasticsearchDriver, ElasticsearchSession};
