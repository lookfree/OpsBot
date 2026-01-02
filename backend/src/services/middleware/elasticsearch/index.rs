//! Elasticsearch index operations
//!
//! Handles index CRUD, mapping, settings, and stats.

use elasticsearch::cat::CatIndicesParts;
use elasticsearch::indices::{
    IndicesCloseParts, IndicesCreateParts, IndicesDeleteParts, IndicesGetMappingParts,
    IndicesGetSettingsParts, IndicesOpenParts, IndicesPutMappingParts, IndicesPutSettingsParts,
    IndicesRefreshParts, IndicesStatsParts,
};

use crate::models::{EsCreateIndexRequest, EsIndexStats, EsIndexSummary};

use super::driver::ElasticsearchDriver;

/// Get indices list (optionally filtered by pattern)
pub async fn get_indices(
    driver: &ElasticsearchDriver,
    pattern: Option<&str>,
) -> Result<Vec<EsIndexSummary>, String> {
    let index_pattern = pattern.unwrap_or("*");

    let response = driver
        .client()
        .cat()
        .indices(CatIndicesParts::Index(&[index_pattern]))
        .format("json")
        .h(&[
            "index", "health", "status", "uuid", "docs.count", "docs.deleted",
            "store.size", "pri", "rep",
        ])
        .send()
        .await
        .map_err(|e| format!("Failed to get indices: {}", e))?;

    let indices: Vec<serde_json::Value> = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    Ok(indices
        .iter()
        .map(|idx| EsIndexSummary {
            name: idx["index"].as_str().unwrap_or("").to_string(),
            health: idx["health"].as_str().unwrap_or("").to_string(),
            status: idx["status"].as_str().unwrap_or("").to_string(),
            uuid: idx["uuid"].as_str().unwrap_or("").to_string(),
            docs_count: parse_i64_str(idx["docs.count"].as_str()),
            docs_deleted: parse_i64_str(idx["docs.deleted"].as_str()),
            store_size: idx["store.size"].as_str().unwrap_or("0b").to_string(),
            primary_shards: parse_i32_str(idx["pri"].as_str()),
            replica_shards: parse_i32_str(idx["rep"].as_str()),
        })
        .collect())
}

/// Get index mapping
pub async fn get_index_mapping(
    driver: &ElasticsearchDriver,
    index_name: &str,
) -> Result<serde_json::Value, String> {
    let response = driver
        .client()
        .indices()
        .get_mapping(IndicesGetMappingParts::Index(&[index_name]))
        .send()
        .await
        .map_err(|e| format!("Failed to get index mapping: {}", e))?;

    let json: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    // Return the mappings for the specific index
    Ok(json.get(index_name)
        .and_then(|v| v.get("mappings"))
        .cloned()
        .unwrap_or(serde_json::json!({})))
}

/// Get index settings
pub async fn get_index_settings(
    driver: &ElasticsearchDriver,
    index_name: &str,
) -> Result<serde_json::Value, String> {
    let response = driver
        .client()
        .indices()
        .get_settings(IndicesGetSettingsParts::Index(&[index_name]))
        .send()
        .await
        .map_err(|e| format!("Failed to get index settings: {}", e))?;

    let json: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    // Return the settings for the specific index
    Ok(json.get(index_name)
        .and_then(|v| v.get("settings"))
        .cloned()
        .unwrap_or(serde_json::json!({})))
}

/// Get index statistics
pub async fn get_index_stats(
    driver: &ElasticsearchDriver,
    index_name: &str,
) -> Result<EsIndexStats, String> {
    let response = driver
        .client()
        .indices()
        .stats(IndicesStatsParts::Index(&[index_name]))
        .send()
        .await
        .map_err(|e| format!("Failed to get index stats: {}", e))?;

    let json: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    let index_stats = json
        .get("indices")
        .and_then(|i| i.get(index_name))
        .ok_or_else(|| format!("Index '{}' not found in stats", index_name))?;

    let empty_obj = serde_json::json!({});
    let primaries = index_stats.get("primaries").unwrap_or(&empty_obj);
    let total = index_stats.get("total").unwrap_or(&empty_obj);

    let store_size_bytes = primaries["store"]["size_in_bytes"].as_i64().unwrap_or(0);

    Ok(EsIndexStats {
        name: index_name.to_string(),
        docs_count: primaries["docs"]["count"].as_i64().unwrap_or(0),
        docs_deleted: primaries["docs"]["deleted"].as_i64().unwrap_or(0),
        store_size_bytes,
        store_size: format_bytes(store_size_bytes),
        primary_shards: json["_shards"]["successful"].as_i64().unwrap_or(0) as i32,
        replica_shards: 0, // Would need separate calculation
        indexing_total: total["indexing"]["index_total"].as_i64().unwrap_or(0),
        search_query_total: total["search"]["query_total"].as_i64().unwrap_or(0),
    })
}

/// Create a new index
pub async fn create_index(
    driver: &ElasticsearchDriver,
    request: EsCreateIndexRequest,
) -> Result<(), String> {
    let mut body = serde_json::json!({});

    if let Some(settings) = request.settings {
        body["settings"] = settings;
    }
    if let Some(mappings) = request.mappings {
        body["mappings"] = mappings;
    }

    let response = driver
        .client()
        .indices()
        .create(IndicesCreateParts::Index(&request.name))
        .body(body)
        .send()
        .await
        .map_err(|e| format!("Failed to create index: {}", e))?;

    let status = response.status_code();
    if !status.is_success() {
        let error_body: serde_json::Value = response
            .json()
            .await
            .unwrap_or(serde_json::json!({"error": "Unknown error"}));
        return Err(format!(
            "Failed to create index '{}': {}",
            request.name,
            error_body.get("error").unwrap_or(&serde_json::json!("Unknown"))
        ));
    }

    Ok(())
}

/// Delete an index
pub async fn delete_index(driver: &ElasticsearchDriver, index_name: &str) -> Result<(), String> {
    let response = driver
        .client()
        .indices()
        .delete(IndicesDeleteParts::Index(&[index_name]))
        .send()
        .await
        .map_err(|e| format!("Failed to delete index: {}", e))?;

    let status = response.status_code();
    if !status.is_success() {
        let error_body: serde_json::Value = response
            .json()
            .await
            .unwrap_or(serde_json::json!({"error": "Unknown error"}));
        return Err(format!(
            "Failed to delete index '{}': {}",
            index_name,
            error_body.get("error").unwrap_or(&serde_json::json!("Unknown"))
        ));
    }

    Ok(())
}

/// Open an index
pub async fn open_index(driver: &ElasticsearchDriver, index_name: &str) -> Result<(), String> {
    let response = driver
        .client()
        .indices()
        .open(IndicesOpenParts::Index(&[index_name]))
        .send()
        .await
        .map_err(|e| format!("Failed to open index: {}", e))?;

    let status = response.status_code();
    if !status.is_success() {
        return Err(format!("Failed to open index '{}'", index_name));
    }

    Ok(())
}

/// Close an index
pub async fn close_index(driver: &ElasticsearchDriver, index_name: &str) -> Result<(), String> {
    let response = driver
        .client()
        .indices()
        .close(IndicesCloseParts::Index(&[index_name]))
        .send()
        .await
        .map_err(|e| format!("Failed to close index: {}", e))?;

    let status = response.status_code();
    if !status.is_success() {
        return Err(format!("Failed to close index '{}'", index_name));
    }

    Ok(())
}

/// Refresh an index
pub async fn refresh_index(driver: &ElasticsearchDriver, index_name: &str) -> Result<(), String> {
    let response = driver
        .client()
        .indices()
        .refresh(IndicesRefreshParts::Index(&[index_name]))
        .send()
        .await
        .map_err(|e| format!("Failed to refresh index: {}", e))?;

    let status = response.status_code();
    if !status.is_success() {
        return Err(format!("Failed to refresh index '{}'", index_name));
    }

    Ok(())
}

/// Update index mapping (add new fields only)
/// Note: ES doesn't support modifying existing field mappings
pub async fn update_index_mapping(
    driver: &ElasticsearchDriver,
    index_name: &str,
    mapping: serde_json::Value,
) -> Result<(), String> {
    let response = driver
        .client()
        .indices()
        .put_mapping(IndicesPutMappingParts::Index(&[index_name]))
        .body(mapping)
        .send()
        .await
        .map_err(|e| format!("Failed to update index mapping: {}", e))?;

    let status = response.status_code();
    if !status.is_success() {
        let error_body: serde_json::Value = response
            .json()
            .await
            .unwrap_or(serde_json::json!({"error": "Unknown error"}));
        return Err(format!(
            "Failed to update mapping for '{}': {}",
            index_name,
            error_body.get("error").unwrap_or(&serde_json::json!("Unknown"))
        ));
    }

    Ok(())
}

/// Update index settings (dynamic settings only)
/// Note: Some settings (like number_of_shards) cannot be changed after creation
pub async fn update_index_settings(
    driver: &ElasticsearchDriver,
    index_name: &str,
    settings: serde_json::Value,
) -> Result<(), String> {
    let response = driver
        .client()
        .indices()
        .put_settings(IndicesPutSettingsParts::Index(&[index_name]))
        .body(settings)
        .send()
        .await
        .map_err(|e| format!("Failed to update index settings: {}", e))?;

    let status = response.status_code();
    if !status.is_success() {
        let error_body: serde_json::Value = response
            .json()
            .await
            .unwrap_or(serde_json::json!({"error": "Unknown error"}));
        return Err(format!(
            "Failed to update settings for '{}': {}",
            index_name,
            error_body.get("error").unwrap_or(&serde_json::json!("Unknown"))
        ));
    }

    Ok(())
}

/// Parse string to i64
fn parse_i64_str(s: Option<&str>) -> i64 {
    s.and_then(|v| v.parse().ok()).unwrap_or(0)
}

/// Parse string to i32
fn parse_i32_str(s: Option<&str>) -> i32 {
    s.and_then(|v| v.parse().ok()).unwrap_or(0)
}

/// Format bytes to human readable string
fn format_bytes(bytes: i64) -> String {
    const UNITS: &[&str] = &["B", "KB", "MB", "GB", "TB", "PB"];
    let mut size = bytes as f64;
    let mut unit_idx = 0;

    while size >= 1024.0 && unit_idx < UNITS.len() - 1 {
        size /= 1024.0;
        unit_idx += 1;
    }

    if unit_idx == 0 {
        format!("{}B", bytes)
    } else {
        format!("{:.2}{}", size, UNITS[unit_idx])
    }
}
