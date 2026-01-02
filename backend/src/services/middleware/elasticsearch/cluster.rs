//! Elasticsearch cluster operations
//!
//! Handles cluster health, stats, nodes, and shards queries.

use elasticsearch::cluster::ClusterHealthParts;
use elasticsearch::cat::CatShardsParts;

use crate::models::{EsClusterHealth, EsClusterStats, EsConnectionInfo, EsNodeInfo, EsShardInfo};

use super::driver::ElasticsearchDriver;

/// Test connection and get basic cluster info
pub async fn test_connection(driver: &ElasticsearchDriver) -> Result<EsConnectionInfo, String> {
    let response = driver
        .client()
        .info()
        .send()
        .await
        .map_err(|e| {
            let err_str = e.to_string();
            // Provide more helpful error messages for common issues
            if err_str.contains("certificate") || err_str.contains("ssl") || err_str.contains("tls") {
                format!("TLS/SSL error: {}. Try enabling TLS in connection settings or check if server uses HTTPS.", err_str)
            } else if err_str.contains("Connection refused") {
                format!("Connection refused. Please check if Elasticsearch is running and the URL is correct.")
            } else {
                format!("Connection failed: {}", err_str)
            }
        })?;

    // Check status code first
    let status = response.status_code();
    if !status.is_success() {
        let body = response.text().await.unwrap_or_default();
        return Err(format!(
            "Server returned error status {}: {}",
            status.as_u16(),
            if body.is_empty() { "empty response" } else { &body }
        ));
    }

    let json: serde_json::Value = response
        .json()
        .await
        .map_err(|e| {
            let err_str = e.to_string();
            if err_str.contains("EOF") {
                format!(
                    "Empty response from server. Possible causes:\n\
                    1. Protocol mismatch: Check if the URL uses the correct protocol (http:// vs https://)\n\
                    2. TLS configuration: If using HTTPS, enable TLS in connection settings\n\
                    3. Authentication failure: Server may require authentication"
                )
            } else {
                format!("Failed to parse response: {}", err_str)
            }
        })?;

    Ok(EsConnectionInfo {
        connection_id: String::new(), // Will be set by the service layer
        cluster_name: json["cluster_name"]
            .as_str()
            .unwrap_or("")
            .to_string(),
        cluster_uuid: json["cluster_uuid"]
            .as_str()
            .unwrap_or("")
            .to_string(),
        version: json["version"]["number"]
            .as_str()
            .unwrap_or("")
            .to_string(),
        connected_at: chrono::Utc::now().to_rfc3339(),
    })
}

/// Get cluster health status
pub async fn get_cluster_health(
    driver: &ElasticsearchDriver,
) -> Result<EsClusterHealth, String> {
    let response = driver
        .client()
        .cluster()
        .health(ClusterHealthParts::None)
        .send()
        .await
        .map_err(|e| format!("Failed to get cluster health: {}", e))?;

    let json: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    Ok(EsClusterHealth {
        cluster_name: json["cluster_name"].as_str().unwrap_or("").to_string(),
        status: json["status"].as_str().unwrap_or("unknown").to_string(),
        number_of_nodes: json["number_of_nodes"].as_i64().unwrap_or(0) as i32,
        number_of_data_nodes: json["number_of_data_nodes"].as_i64().unwrap_or(0) as i32,
        active_primary_shards: json["active_primary_shards"].as_i64().unwrap_or(0) as i32,
        active_shards: json["active_shards"].as_i64().unwrap_or(0) as i32,
        relocating_shards: json["relocating_shards"].as_i64().unwrap_or(0) as i32,
        initializing_shards: json["initializing_shards"].as_i64().unwrap_or(0) as i32,
        unassigned_shards: json["unassigned_shards"].as_i64().unwrap_or(0) as i32,
        delayed_unassigned_shards: json["delayed_unassigned_shards"].as_i64().unwrap_or(0) as i32,
        number_of_pending_tasks: json["number_of_pending_tasks"].as_i64().unwrap_or(0) as i32,
        number_of_in_flight_fetch: json["number_of_in_flight_fetch"].as_i64().unwrap_or(0) as i32,
        task_max_waiting_in_queue_millis: json["task_max_waiting_in_queue_millis"]
            .as_i64()
            .unwrap_or(0),
        active_shards_percent_as_number: json["active_shards_percent_as_number"]
            .as_f64()
            .unwrap_or(0.0),
    })
}

/// Get cluster statistics
pub async fn get_cluster_stats(driver: &ElasticsearchDriver) -> Result<EsClusterStats, String> {
    let response = driver
        .client()
        .cluster()
        .stats(elasticsearch::cluster::ClusterStatsParts::None)
        .send()
        .await
        .map_err(|e| format!("Failed to get cluster stats: {}", e))?;

    let json: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    let store_size_bytes = json["indices"]["store"]["size_in_bytes"].as_i64().unwrap_or(0);
    let store_size = format_bytes(store_size_bytes);

    Ok(EsClusterStats {
        cluster_name: json["cluster_name"].as_str().unwrap_or("").to_string(),
        cluster_uuid: json["cluster_uuid"].as_str().unwrap_or("").to_string(),
        status: json["status"].as_str().unwrap_or("unknown").to_string(),
        indices_count: json["indices"]["count"].as_i64().unwrap_or(0) as i32,
        total_shards: json["indices"]["shards"]["total"].as_i64().unwrap_or(0) as i32,
        docs_count: json["indices"]["docs"]["count"].as_i64().unwrap_or(0),
        store_size_bytes,
        store_size,
    })
}

/// Get nodes information
pub async fn get_nodes(driver: &ElasticsearchDriver) -> Result<Vec<EsNodeInfo>, String> {
    let response = driver
        .client()
        .cat()
        .nodes()
        .format("json")
        .h(&[
            "id", "name", "ip", "node.role", "version", "heap.percent", "heap.current", "heap.max",
            "disk.used_percent", "disk.used", "disk.total", "cpu", "load_1m", "master",
        ])
        .send()
        .await
        .map_err(|e| format!("Failed to get nodes: {}", e))?;

    let nodes: Vec<serde_json::Value> = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    Ok(nodes
        .iter()
        .map(|node| {
            let roles = parse_node_roles(node["node.role"].as_str().unwrap_or(""));
            EsNodeInfo {
                id: node["id"].as_str().unwrap_or("").to_string(),
                name: node["name"].as_str().unwrap_or("").to_string(),
                ip: node["ip"].as_str().unwrap_or("").to_string(),
                roles,
                version: node["version"].as_str().unwrap_or("").to_string(),
                heap_percent: parse_percent(node["heap.percent"].as_str()),
                heap_current: node["heap.current"].as_str().unwrap_or("0b").to_string(),
                heap_max: node["heap.max"].as_str().unwrap_or("0b").to_string(),
                disk_percent: node["disk.used_percent"]
                    .as_str()
                    .and_then(|s| s.parse().ok()),
                disk_used: node["disk.used"].as_str().map(String::from),
                disk_total: node["disk.total"].as_str().map(String::from),
                cpu_percent: node["cpu"].as_str().and_then(|s| s.parse().ok()),
                load_1m: node["load_1m"].as_str().and_then(|s| s.parse().ok()),
                master: node["master"].as_str() == Some("*"),
            }
        })
        .collect())
}

/// Get shards information
pub async fn get_shards(driver: &ElasticsearchDriver) -> Result<Vec<EsShardInfo>, String> {
    let response = driver
        .client()
        .cat()
        .shards(CatShardsParts::None)
        .format("json")
        .h(&["index", "shard", "prirep", "state", "docs", "store", "node", "unassigned.reason"])
        .send()
        .await
        .map_err(|e| format!("Failed to get shards: {}", e))?;

    let shards: Vec<serde_json::Value> = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    Ok(shards
        .iter()
        .map(|shard| EsShardInfo {
            index: shard["index"].as_str().unwrap_or("").to_string(),
            shard: shard["shard"]
                .as_str()
                .and_then(|s| s.parse().ok())
                .unwrap_or(0),
            primary: shard["prirep"].as_str() == Some("p"),
            state: shard["state"].as_str().unwrap_or("UNKNOWN").to_string(),
            docs: shard["docs"].as_str().and_then(|s| s.parse().ok()),
            size: shard["store"].as_str().map(String::from),
            node: shard["node"].as_str().map(String::from),
            unassigned_reason: shard["unassigned.reason"].as_str().map(String::from),
        })
        .collect())
}

/// Parse node role string into role list
fn parse_node_roles(role_str: &str) -> Vec<String> {
    role_str
        .chars()
        .filter_map(|c| match c {
            'd' => Some("data".to_string()),
            'i' => Some("ingest".to_string()),
            'l' => Some("ml".to_string()),
            'm' => Some("master".to_string()),
            'r' => Some("remote_cluster_client".to_string()),
            's' => Some("content".to_string()),
            't' => Some("transform".to_string()),
            'v' => Some("voting_only".to_string()),
            'w' => Some("warm".to_string()),
            'c' => Some("cold".to_string()),
            'f' => Some("frozen".to_string()),
            'h' => Some("hot".to_string()),
            '-' => None,
            _ => Some(c.to_string()),
        })
        .collect()
}

/// Parse percentage string to i32
fn parse_percent(s: Option<&str>) -> i32 {
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
