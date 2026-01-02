//! Redis key operations
//!
//! Handles key scanning, TTL management, deletion, and renaming.

use crate::models::{ClusterScanState, RedisKeyInfo, RedisScanRequest, RedisScanResponse};

use super::driver::{RedisConnection, RedisDriver};

/// Scan keys with cursor-based pagination
/// For cluster mode, uses composite cursor format: "nodeIndex:nodeCursor"
pub async fn scan_keys(
    driver: &RedisDriver,
    request: RedisScanRequest,
) -> Result<RedisScanResponse, String> {
    let pattern = request.pattern.as_deref().unwrap_or("*");
    let count = request.count.unwrap_or(100);

    // Check if cluster mode - use sequential node scanning
    if driver.is_cluster_mode() {
        return scan_keys_cluster(driver, &request.cursor, pattern, count).await;
    }

    // Standalone/Sentinel mode - use existing logic
    scan_keys_standalone(driver, &request.cursor, pattern, count, request.key_type.as_deref()).await
}

/// Scan keys in standalone/sentinel mode
async fn scan_keys_standalone(
    driver: &RedisDriver,
    cursor: &str,
    pattern: &str,
    count: i64,
    key_type: Option<&str>,
) -> Result<RedisScanResponse, String> {
    let count_str = count.to_string();

    let mut args: Vec<&str> = vec![cursor, "MATCH", pattern, "COUNT", &count_str];

    // Add TYPE filter if specified (Redis 6.0+)
    if let Some(kt) = key_type {
        args.push("TYPE");
        args.push(kt);
    }

    log::info!("Redis SCAN (standalone): cursor={}, pattern={}, count={}", cursor, pattern, count);

    // Execute SCAN
    let (new_cursor, keys) = driver.execute_scan(&args).await?;

    log::info!("Redis SCAN (standalone): got {} keys, new_cursor={}", keys.len(), new_cursor);

    // Get key metadata
    let key_infos = get_keys_metadata(driver, keys).await;

    Ok(RedisScanResponse {
        finished: new_cursor == "0",
        cursor: new_cursor,
        keys: key_infos,
    })
}

/// Scan keys in cluster mode with composite cursor
/// Composite cursor format: "nodeIndex:nodeCursor" (e.g., "0:1234", "1:0")
async fn scan_keys_cluster(
    driver: &RedisDriver,
    cursor: &str,
    pattern: &str,
    count: i64,
) -> Result<RedisScanResponse, String> {
    // Parse composite cursor
    let mut state = ClusterScanState::from_cursor(cursor)?;

    // Get master nodes list
    let masters = driver.get_cluster_masters().await?;
    if masters.is_empty() {
        return Err("No master nodes found in cluster".to_string());
    }
    state.total_nodes = masters.len();

    log::info!(
        "Redis SCAN (cluster): cursor={}, node_index={}/{}, node_cursor={}, pattern={}",
        cursor, state.node_index, state.total_nodes, state.node_cursor, pattern
    );

    // If already finished all nodes
    if state.is_finished() {
        return Ok(RedisScanResponse {
            finished: true,
            cursor: "0".to_string(),
            keys: vec![],
        });
    }

    // Get current node address
    let current_node = &masters[state.node_index];

    // Scan current node
    let (next_node_cursor, keys) = driver
        .scan_single_node(
            &current_node.address,
            &state.node_cursor,
            Some(pattern),
            Some(count),
        )
        .await?;

    // Update state based on scan result
    if next_node_cursor == "0" {
        // Current node finished, move to next node
        state.next_node();
    } else {
        // Continue scanning current node
        state.node_cursor = next_node_cursor;
    }

    // Check if all nodes are finished
    let finished = state.is_finished();
    let next_cursor = if finished {
        "0".to_string()
    } else {
        state.to_cursor()
    };

    log::info!(
        "Redis SCAN (cluster): got {} keys, next_cursor={}, finished={}",
        keys.len(), next_cursor, finished
    );

    // Get key metadata
    let key_infos = get_keys_metadata(driver, keys).await;

    Ok(RedisScanResponse {
        finished,
        cursor: next_cursor,
        keys: key_infos,
    })
}

/// Get metadata for a list of keys (type, ttl)
async fn get_keys_metadata(driver: &RedisDriver, keys: Vec<String>) -> Vec<RedisKeyInfo> {
    let mut key_infos = Vec::with_capacity(keys.len());
    for key in keys {
        let key_type = get_key_type(driver, &key).await.unwrap_or_else(|_| "unknown".to_string());
        let ttl = get_key_ttl(driver, &key).await.unwrap_or(-2);

        key_infos.push(RedisKeyInfo {
            key,
            key_type,
            ttl,
            size: None, // Memory usage requires DEBUG OBJECT or MEMORY USAGE
        });
    }
    key_infos
}

/// Get total key count using DBSIZE
pub async fn get_key_count(driver: &RedisDriver) -> Result<i64, String> {
    log::info!("Redis DBSIZE: fetching key count");

    // Use cluster-aware execute_dbsize method
    let count = driver.execute_dbsize().await?;

    log::info!("Redis DBSIZE: got count={}", count);
    Ok(count)
}

/// Get key type
pub async fn get_key_type(driver: &RedisDriver, key: &str) -> Result<String, String> {
    driver.execute_raw("TYPE", &[key]).await
}

/// Get key TTL (-1: permanent, -2: not exists)
pub async fn get_key_ttl(driver: &RedisDriver, key: &str) -> Result<i64, String> {
    driver.execute_raw("TTL", &[key]).await
}

/// Set key TTL
/// ttl > 0: set expire in seconds
/// ttl < 0: remove expire (persist)
pub async fn set_key_ttl(driver: &RedisDriver, key: &str, ttl: i64) -> Result<(), String> {
    if ttl < 0 {
        // Remove expiration
        let _: i64 = driver.execute_raw("PERSIST", &[key]).await?;
    } else {
        // Set expiration
        let ttl_str = ttl.to_string();
        let _: i64 = driver.execute_raw("EXPIRE", &[key, &ttl_str]).await?;
    }
    Ok(())
}

/// Delete keys
pub async fn delete_keys(driver: &RedisDriver, keys: Vec<String>) -> Result<i64, String> {
    if keys.is_empty() {
        return Ok(0);
    }

    let key_refs: Vec<&str> = keys.iter().map(|s| s.as_str()).collect();

    let mut conn = driver.get_connection().await;
    let mut cmd = redis::cmd("DEL");
    for key in &key_refs {
        cmd.arg(*key);
    }

    match &mut *conn {
        RedisConnection::Standalone(c) => cmd
            .query_async(c)
            .await
            .map_err(|e| format!("DEL failed: {}", e)),
        RedisConnection::Cluster(c) => cmd
            .query_async(c)
            .await
            .map_err(|e| format!("DEL failed: {}", e)),
    }
}

/// Rename a key
pub async fn rename_key(
    driver: &RedisDriver,
    old_key: &str,
    new_key: &str,
) -> Result<(), String> {
    let _: () = driver.execute_raw("RENAME", &[old_key, new_key]).await?;
    Ok(())
}

/// Check if key exists
pub async fn key_exists(driver: &RedisDriver, key: &str) -> Result<bool, String> {
    let count: i64 = driver.execute_raw("EXISTS", &[key]).await?;
    Ok(count > 0)
}

/// Get key memory usage (Redis 4.0+)
#[allow(dead_code)]
pub async fn get_key_memory(driver: &RedisDriver, key: &str) -> Result<Option<i64>, String> {
    match driver.execute_raw::<i64>("MEMORY", &["USAGE", key]).await {
        Ok(size) => Ok(Some(size)),
        Err(_) => Ok(None), // MEMORY USAGE not supported or key doesn't exist
    }
}
