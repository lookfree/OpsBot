//! Redis server information operations
//!
//! Handles INFO command parsing and database information retrieval.

use std::collections::HashMap;

use crate::models::{
    RedisClientsInfo, RedisDatabaseInfo, RedisInfo, RedisKeyspaceInfo,
    RedisMemoryInfo, RedisServerInfo, RedisStatsInfo,
};

use super::driver::RedisDriver;

/// Get Redis INFO
pub async fn get_info(driver: &RedisDriver, section: Option<&str>) -> Result<RedisInfo, String> {
    let info_str: String = if let Some(sec) = section {
        driver.execute_raw("INFO", &[sec]).await?
    } else {
        driver.execute_raw("INFO", &[]).await?
    };

    parse_info(&info_str)
}

/// Get database list with key counts
pub async fn get_databases(driver: &RedisDriver) -> Result<Vec<RedisDatabaseInfo>, String> {
    let info_str: String = driver.execute_raw("INFO", &["keyspace"]).await?;
    let keyspace = parse_keyspace(&info_str);

    // Always show db0-db15, even if empty
    let databases: Vec<RedisDatabaseInfo> = (0..16)
        .map(|db| {
            let ks = keyspace.iter().find(|k| k.db == db);
            RedisDatabaseInfo {
                db,
                keys: ks.map(|k| k.keys).unwrap_or(0),
                expires: ks.map(|k| k.expires).unwrap_or(0),
            }
        })
        .collect();

    Ok(databases)
}

/// Parse INFO response into structured data
fn parse_info(info_str: &str) -> Result<RedisInfo, String> {
    let sections = parse_info_sections(info_str);

    let server = parse_server_info(&sections);
    let clients = parse_clients_info(&sections);
    let memory = parse_memory_info(&sections);
    let stats = parse_stats_info(&sections);
    let keyspace = parse_keyspace(info_str);

    Ok(RedisInfo {
        server,
        clients,
        memory,
        stats,
        keyspace,
    })
}

/// Parse INFO into section -> key-value map
fn parse_info_sections(info_str: &str) -> HashMap<String, HashMap<String, String>> {
    let mut sections: HashMap<String, HashMap<String, String>> = HashMap::new();
    let mut current_section = String::new();

    for line in info_str.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }

        if line.starts_with('#') {
            current_section = line.trim_start_matches('#').trim().to_lowercase();
            sections.entry(current_section.clone()).or_default();
        } else if let Some((key, value)) = line.split_once(':') {
            if let Some(section) = sections.get_mut(&current_section) {
                section.insert(key.to_string(), value.to_string());
            }
        }
    }

    sections
}

/// Parse server section
fn parse_server_info(sections: &HashMap<String, HashMap<String, String>>) -> RedisServerInfo {
    let server = sections.get("server").cloned().unwrap_or_default();

    RedisServerInfo {
        redis_version: server.get("redis_version").cloned().unwrap_or_default(),
        redis_mode: server.get("redis_mode").cloned().unwrap_or_else(|| "standalone".to_string()),
        os: server.get("os").cloned().unwrap_or_default(),
        uptime_in_seconds: server
            .get("uptime_in_seconds")
            .and_then(|s| s.parse().ok())
            .unwrap_or(0),
        uptime_in_days: server
            .get("uptime_in_days")
            .and_then(|s| s.parse().ok())
            .unwrap_or(0),
    }
}

/// Parse clients section
fn parse_clients_info(sections: &HashMap<String, HashMap<String, String>>) -> RedisClientsInfo {
    let clients = sections.get("clients").cloned().unwrap_or_default();

    RedisClientsInfo {
        connected_clients: clients
            .get("connected_clients")
            .and_then(|s| s.parse().ok())
            .unwrap_or(0),
        blocked_clients: clients
            .get("blocked_clients")
            .and_then(|s| s.parse().ok())
            .unwrap_or(0),
        max_clients: clients
            .get("maxclients")
            .and_then(|s| s.parse().ok())
            .unwrap_or(10000),
    }
}

/// Parse memory section
fn parse_memory_info(sections: &HashMap<String, HashMap<String, String>>) -> RedisMemoryInfo {
    let memory = sections.get("memory").cloned().unwrap_or_default();

    RedisMemoryInfo {
        used_memory: memory
            .get("used_memory")
            .and_then(|s| s.parse().ok())
            .unwrap_or(0),
        used_memory_human: memory
            .get("used_memory_human")
            .cloned()
            .unwrap_or_else(|| "0B".to_string()),
        used_memory_peak: memory
            .get("used_memory_peak")
            .and_then(|s| s.parse().ok())
            .unwrap_or(0),
        used_memory_peak_human: memory
            .get("used_memory_peak_human")
            .cloned()
            .unwrap_or_else(|| "0B".to_string()),
        maxmemory: memory
            .get("maxmemory")
            .and_then(|s| s.parse().ok())
            .unwrap_or(0),
        maxmemory_human: memory
            .get("maxmemory_human")
            .cloned()
            .unwrap_or_else(|| "0B".to_string()),
        mem_fragmentation_ratio: memory
            .get("mem_fragmentation_ratio")
            .and_then(|s| s.parse().ok())
            .unwrap_or(1.0),
    }
}

/// Parse stats section
fn parse_stats_info(sections: &HashMap<String, HashMap<String, String>>) -> RedisStatsInfo {
    let stats = sections.get("stats").cloned().unwrap_or_default();

    let keyspace_hits: i64 = stats
        .get("keyspace_hits")
        .and_then(|s| s.parse().ok())
        .unwrap_or(0);
    let keyspace_misses: i64 = stats
        .get("keyspace_misses")
        .and_then(|s| s.parse().ok())
        .unwrap_or(0);

    let total = keyspace_hits + keyspace_misses;
    let hit_rate = if total > 0 {
        (keyspace_hits as f64 / total as f64) * 100.0
    } else {
        0.0
    };

    RedisStatsInfo {
        total_connections_received: stats
            .get("total_connections_received")
            .and_then(|s| s.parse().ok())
            .unwrap_or(0),
        total_commands_processed: stats
            .get("total_commands_processed")
            .and_then(|s| s.parse().ok())
            .unwrap_or(0),
        instantaneous_ops_per_sec: stats
            .get("instantaneous_ops_per_sec")
            .and_then(|s| s.parse().ok())
            .unwrap_or(0),
        keyspace_hits,
        keyspace_misses,
        hit_rate,
    }
}

/// Parse keyspace section
/// Format: db0:keys=123,expires=45,avg_ttl=1000
fn parse_keyspace(info_str: &str) -> Vec<RedisKeyspaceInfo> {
    let mut keyspace = Vec::new();

    for line in info_str.lines() {
        let line = line.trim();
        if !line.starts_with("db") || !line.contains(':') {
            continue;
        }

        if let Some((db_part, values_part)) = line.split_once(':') {
            let db: u8 = db_part
                .trim_start_matches("db")
                .parse()
                .unwrap_or(0);

            let mut keys: i64 = 0;
            let mut expires: i64 = 0;
            let mut avg_ttl: i64 = 0;

            for kv in values_part.split(',') {
                if let Some((key, value)) = kv.split_once('=') {
                    match key {
                        "keys" => keys = value.parse().unwrap_or(0),
                        "expires" => expires = value.parse().unwrap_or(0),
                        "avg_ttl" => avg_ttl = value.parse().unwrap_or(0),
                        _ => {}
                    }
                }
            }

            keyspace.push(RedisKeyspaceInfo {
                db,
                keys,
                expires,
                avg_ttl,
            });
        }
    }

    keyspace
}
