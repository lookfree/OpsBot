//! Elasticsearch driver module
//!
//! Implements the SearchEngineDriver trait for Elasticsearch.

mod cluster;
mod document;
mod driver;
mod index;
mod query;

pub use driver::{ElasticsearchDriver, ElasticsearchSession};

use elasticsearch::http::response::Response;

/// Parse an Elasticsearch response as JSON, returning an error for any
/// non-2xx status. Without this, an error body (404/403/503) parses as data
/// and downstream `unwrap_or` defaults fabricate an empty/zero result that
/// looks like success.
pub(crate) async fn es_json<T: serde::de::DeserializeOwned>(
    response: Response,
    context: &str,
) -> Result<T, String> {
    let status = response.status_code();
    if !status.is_success() {
        let body = response.text().await.unwrap_or_default();
        return Err(format!("{} ({}): {}", context, status.as_u16(), body));
    }
    response
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))
}
