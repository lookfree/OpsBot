//! Redis data type operations
//!
//! Handles reading and writing for all Redis data types:
//! String, List, Set, Hash, ZSet, Stream

use crate::models::{RedisSetRequest, RedisStreamEntry, RedisValue};

use super::driver::{RedisConnection, RedisDriver};
use super::keys;

/// Get value with auto type detection
pub async fn get_value(driver: &RedisDriver, key: &str) -> Result<RedisValue, String> {
    log::info!("Redis get_value: fetching type for key={}", key);
    let key_type = keys::get_key_type(driver, key).await?;
    log::info!("Redis get_value: key={} type={}", key, key_type);

    match key_type.as_str() {
        "string" => get_string(driver, key).await,
        "list" => get_list(driver, key).await,
        "set" => get_set(driver, key).await,
        "hash" => get_hash(driver, key).await,
        "zset" => get_zset(driver, key).await,
        "stream" => get_stream(driver, key).await,
        "none" => Ok(RedisValue::None),
        _ => Err(format!("Unsupported type: {}", key_type)),
    }
}

/// Set value based on type
pub async fn set_value(driver: &RedisDriver, request: RedisSetRequest) -> Result<(), String> {
    match &request.value {
        RedisValue::String(value) => set_string(driver, &request, value).await,
        RedisValue::List(values) => set_list(driver, &request, values.clone()).await,
        RedisValue::Set(values) => set_set(driver, &request, values.clone()).await,
        RedisValue::Hash(pairs) => set_hash(driver, &request, pairs.clone()).await,
        RedisValue::ZSet(members) => set_zset(driver, &request, members.clone()).await,
        RedisValue::Stream(_) => Err("Stream type is read-only".to_string()),
        RedisValue::None => Err("Cannot set None value".to_string()),
    }
}

// ============ String Operations ============

async fn get_string(driver: &RedisDriver, key: &str) -> Result<RedisValue, String> {
    log::info!("Redis GET: key={}", key);
    let value: String = driver.execute_raw("GET", &[key]).await?;
    log::info!("Redis GET: key={} value_len={}", key, value.len());
    Ok(RedisValue::String(value))
}

async fn set_string(
    driver: &RedisDriver,
    request: &RedisSetRequest,
    value: &str,
) -> Result<(), String> {
    let mut args = vec![request.key.as_str(), value];
    let ttl_str;

    if let Some(ttl) = request.ttl {
        ttl_str = ttl.to_string();
        args.push("EX");
        args.push(&ttl_str);
    }

    if request.nx {
        args.push("NX");
    }
    if request.xx {
        args.push("XX");
    }

    let _: () = driver.execute_raw("SET", &args).await?;
    Ok(())
}

// ============ List Operations ============

async fn get_list(driver: &RedisDriver, key: &str) -> Result<RedisValue, String> {
    let values: Vec<String> = driver.execute_raw("LRANGE", &[key, "0", "-1"]).await?;
    Ok(RedisValue::List(values))
}

async fn set_list(
    driver: &RedisDriver,
    request: &RedisSetRequest,
    values: Vec<String>,
) -> Result<(), String> {
    // Delete existing key first
    let _: i64 = driver.execute_raw("DEL", &[&request.key]).await?;

    if !values.is_empty() {
        let value_refs: Vec<&str> = values.iter().map(|s| s.as_str()).collect();
        let mut args = vec![request.key.as_str()];
        args.extend(value_refs);

        let mut conn = driver.get_connection().await;
        let mut cmd = redis::cmd("RPUSH");
        for arg in &args {
            cmd.arg(*arg);
        }

        match &mut *conn {
            RedisConnection::Standalone(c) => {
                let _: i64 = cmd.query_async(c).await.map_err(|e| format!("RPUSH failed: {}", e))?;
            }
            RedisConnection::Cluster(c) => {
                let _: i64 = cmd.query_async(c).await.map_err(|e| format!("RPUSH failed: {}", e))?;
            }
        }
    }

    set_ttl_if_needed(driver, request).await
}

// ============ Set Operations ============

async fn get_set(driver: &RedisDriver, key: &str) -> Result<RedisValue, String> {
    let values: Vec<String> = driver.execute_raw("SMEMBERS", &[key]).await?;
    Ok(RedisValue::Set(values))
}

async fn set_set(
    driver: &RedisDriver,
    request: &RedisSetRequest,
    values: Vec<String>,
) -> Result<(), String> {
    let _: i64 = driver.execute_raw("DEL", &[&request.key]).await?;

    if !values.is_empty() {
        let value_refs: Vec<&str> = values.iter().map(|s| s.as_str()).collect();
        let mut args = vec![request.key.as_str()];
        args.extend(value_refs);

        let mut conn = driver.get_connection().await;
        let mut cmd = redis::cmd("SADD");
        for arg in &args {
            cmd.arg(*arg);
        }

        match &mut *conn {
            RedisConnection::Standalone(c) => {
                let _: i64 = cmd.query_async(c).await.map_err(|e| format!("SADD failed: {}", e))?;
            }
            RedisConnection::Cluster(c) => {
                let _: i64 = cmd.query_async(c).await.map_err(|e| format!("SADD failed: {}", e))?;
            }
        }
    }

    set_ttl_if_needed(driver, request).await
}

// ============ Hash Operations ============

async fn get_hash(driver: &RedisDriver, key: &str) -> Result<RedisValue, String> {
    let values: Vec<String> = driver.execute_raw("HGETALL", &[key]).await?;

    // Convert flat list to pairs: [k1, v1, k2, v2] -> [(k1, v1), (k2, v2)]
    let pairs: Vec<(String, String)> = values
        .chunks(2)
        .filter_map(|chunk| {
            if chunk.len() == 2 {
                Some((chunk[0].clone(), chunk[1].clone()))
            } else {
                None
            }
        })
        .collect();

    Ok(RedisValue::Hash(pairs))
}

async fn set_hash(
    driver: &RedisDriver,
    request: &RedisSetRequest,
    pairs: Vec<(String, String)>,
) -> Result<(), String> {
    let _: i64 = driver.execute_raw("DEL", &[&request.key]).await?;

    if !pairs.is_empty() {
        let mut args = vec![request.key.clone()];
        for (field, value) in pairs {
            args.push(field);
            args.push(value);
        }

        let _: i64 = driver.execute_raw_string("HSET", &args).await?;
    }

    set_ttl_if_needed(driver, request).await
}

// ============ ZSet Operations ============

async fn get_zset(driver: &RedisDriver, key: &str) -> Result<RedisValue, String> {
    let values: Vec<String> = driver
        .execute_raw("ZRANGE", &[key, "0", "-1", "WITHSCORES"])
        .await?;

    // Convert flat list to pairs: [m1, s1, m2, s2] -> [(m1, s1), (m2, s2)]
    let members: Vec<(String, f64)> = values
        .chunks(2)
        .filter_map(|chunk| {
            if chunk.len() == 2 {
                let score: f64 = chunk[1].parse().unwrap_or(0.0);
                Some((chunk[0].clone(), score))
            } else {
                None
            }
        })
        .collect();

    Ok(RedisValue::ZSet(members))
}

async fn set_zset(
    driver: &RedisDriver,
    request: &RedisSetRequest,
    members: Vec<(String, f64)>,
) -> Result<(), String> {
    let _: i64 = driver.execute_raw("DEL", &[&request.key]).await?;

    if !members.is_empty() {
        let mut args = vec![request.key.clone()];
        for (member, score) in members {
            args.push(score.to_string());
            args.push(member);
        }

        let _: i64 = driver.execute_raw_string("ZADD", &args).await?;
    }

    set_ttl_if_needed(driver, request).await
}

// ============ Stream Operations ============

async fn get_stream(driver: &RedisDriver, key: &str) -> Result<RedisValue, String> {
    // Get last 100 entries from stream
    let result: Vec<(String, Vec<String>)> = driver
        .execute_raw("XREVRANGE", &[key, "+", "-", "COUNT", "100"])
        .await
        .unwrap_or_default();

    let entries: Vec<RedisStreamEntry> = result
        .into_iter()
        .map(|(id, fields)| {
            let field_pairs: Vec<(String, String)> = fields
                .chunks(2)
                .filter_map(|chunk| {
                    if chunk.len() == 2 {
                        Some((chunk[0].clone(), chunk[1].clone()))
                    } else {
                        None
                    }
                })
                .collect();

            RedisStreamEntry {
                id,
                fields: field_pairs,
            }
        })
        .collect();

    Ok(RedisValue::Stream(entries))
}

// ============ Helper Functions ============

/// Set TTL if specified in request
async fn set_ttl_if_needed(driver: &RedisDriver, request: &RedisSetRequest) -> Result<(), String> {
    if let Some(ttl) = request.ttl {
        keys::set_key_ttl(driver, &request.key, ttl).await?;
    }
    Ok(())
}
