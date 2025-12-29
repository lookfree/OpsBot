//! Redis key operations
//!
//! Handles key scanning, TTL management, deletion, and renaming.

use crate::models::{RedisKeyInfo, RedisScanRequest, RedisScanResponse};

use super::driver::{RedisConnection, RedisDriver};

/// Scan keys with cursor-based pagination
pub async fn scan_keys(
    driver: &RedisDriver,
    request: RedisScanRequest,
) -> Result<RedisScanResponse, String> {
    let pattern = request.pattern.as_deref().unwrap_or("*");
    let count = request.count.unwrap_or(100);

    // Build SCAN command arguments
    let cursor_str = request.cursor.clone();
    let count_str = count.to_string();

    let mut args: Vec<&str> = vec![&cursor_str, "MATCH", pattern, "COUNT", &count_str];

    // Add TYPE filter if specified (Redis 6.0+)
    let type_filter = request.key_type.as_deref();
    if let Some(kt) = type_filter {
        args.push("TYPE");
        args.push(kt);
    }

    // Execute SCAN
    let result: (String, Vec<String>) = driver.execute_raw("SCAN", &args).await?;
    let (new_cursor, keys) = result;

    // Get key metadata
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

    Ok(RedisScanResponse {
        finished: new_cursor == "0",
        cursor: new_cursor,
        keys: key_infos,
    })
}

/// Get total key count using DBSIZE
pub async fn get_key_count(driver: &RedisDriver) -> Result<i64, String> {
    driver.execute_raw("DBSIZE", &[]).await
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
