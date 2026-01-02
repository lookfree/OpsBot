//! Elasticsearch query operations
//!
//! Handles DSL search and SQL queries.

use elasticsearch::SearchParts;

use crate::models::{EsSearchHit, EsSearchRequest, EsSearchResponse, EsSqlColumn, EsSqlResponse};

use super::driver::ElasticsearchDriver;

/// Execute a search query
pub async fn search(
    driver: &ElasticsearchDriver,
    request: EsSearchRequest,
) -> Result<EsSearchResponse, String> {
    let mut body = serde_json::json!({
        "query": request.query
    });

    // Add optional parameters
    if let Some(from) = request.from {
        body["from"] = serde_json::json!(from);
    }
    if let Some(size) = request.size {
        body["size"] = serde_json::json!(size);
    }
    if let Some(sort) = request.sort {
        body["sort"] = serde_json::json!(sort);
    }
    if let Some(source) = request.source {
        body["_source"] = source;
    }

    let response = driver
        .client()
        .search(SearchParts::Index(&[&request.index]))
        .body(body)
        .send()
        .await
        .map_err(|e| format!("Search failed: {}", e))?;

    let status = response.status_code();
    if !status.is_success() {
        let error_body: serde_json::Value = response
            .json()
            .await
            .unwrap_or(serde_json::json!({"error": "Unknown error"}));
        return Err(format!(
            "Search failed: {}",
            error_body.get("error").unwrap_or(&serde_json::json!("Unknown"))
        ));
    }

    let json: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    let hits = parse_search_hits(&json);

    // Handle both ES 7.x (total as object) and ES 6.x (total as number) formats
    let total = json["hits"]["total"]["value"]
        .as_i64()
        .or_else(|| json["hits"]["total"].as_i64())
        .unwrap_or(0);

    Ok(EsSearchResponse {
        took: json["took"].as_i64().unwrap_or(0),
        timed_out: json["timed_out"].as_bool().unwrap_or(false),
        total,
        max_score: json["hits"]["max_score"].as_f64(),
        hits,
    })
}

/// Execute a SQL query (ES 6.3+)
pub async fn sql_query(
    driver: &ElasticsearchDriver,
    sql: &str,
) -> Result<EsSqlResponse, String> {
    let body = serde_json::json!({
        "query": sql
    });

    // Use the SQL translate API endpoint
    let response = driver
        .client()
        .sql()
        .query()
        .body(body)
        .send()
        .await
        .map_err(|e| format!("SQL query failed: {}", e))?;

    let status = response.status_code();
    if !status.is_success() {
        let error_body: serde_json::Value = response
            .json()
            .await
            .unwrap_or(serde_json::json!({"error": "Unknown error"}));

        let error_msg = error_body
            .get("error")
            .and_then(|e| e.get("reason"))
            .or_else(|| error_body.get("error"))
            .map(|e| e.to_string())
            .unwrap_or_else(|| "Unknown error".to_string());

        return Err(format!("SQL query failed: {}", error_msg));
    }

    let json: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    let columns = parse_sql_columns(&json);
    let rows = parse_sql_rows(&json);

    Ok(EsSqlResponse { columns, rows })
}

/// Parse search hits from response
fn parse_search_hits(json: &serde_json::Value) -> Vec<EsSearchHit> {
    json["hits"]["hits"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .map(|hit| EsSearchHit {
                    index: hit["_index"].as_str().unwrap_or("").to_string(),
                    id: hit["_id"].as_str().unwrap_or("").to_string(),
                    score: hit["_score"].as_f64(),
                    source: hit["_source"].clone(),
                })
                .collect()
        })
        .unwrap_or_default()
}

/// Parse SQL columns from response
fn parse_sql_columns(json: &serde_json::Value) -> Vec<EsSqlColumn> {
    json["columns"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .map(|col| EsSqlColumn {
                    name: col["name"].as_str().unwrap_or("").to_string(),
                    column_type: col["type"].as_str().unwrap_or("").to_string(),
                })
                .collect()
        })
        .unwrap_or_default()
}

/// Parse SQL rows from response
fn parse_sql_rows(json: &serde_json::Value) -> Vec<Vec<serde_json::Value>> {
    json["rows"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .map(|row| {
                    row.as_array()
                        .map(|r| r.clone())
                        .unwrap_or_default()
                })
                .collect()
        })
        .unwrap_or_default()
}
