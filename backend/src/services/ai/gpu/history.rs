//! GPU History Service
//!
//! This module provides storage and retrieval of GPU metrics history.

use std::path::PathBuf;

use crate::models::{GpuHistory, GpuInfo};

/// History interval for data aggregation
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HistoryInterval {
    /// 1 minute granularity
    Minute,
    /// 5 minutes granularity
    FiveMinutes,
    /// 1 hour granularity
    Hour,
    /// 1 day granularity
    Day,
}

impl HistoryInterval {
    /// Parse from string
    pub fn from_str(s: &str) -> Option<Self> {
        match s.to_lowercase().as_str() {
            "minute" => Some(Self::Minute),
            "fiveminutes" | "five_minutes" | "5min" => Some(Self::FiveMinutes),
            "hour" => Some(Self::Hour),
            "day" => Some(Self::Day),
            _ => None,
        }
    }

    /// Get the interval in seconds
    pub fn seconds(&self) -> i64 {
        match self {
            Self::Minute => 60,
            Self::FiveMinutes => 300,
            Self::Hour => 3600,
            Self::Day => 86400,
        }
    }
}

/// GPU History Service for storing and retrieving GPU metrics
pub struct GpuHistoryService {
    /// SQLite database path
    db_path: PathBuf,
    /// Connection pool (lazy initialized)
    connection: Option<rusqlite::Connection>,
}

impl GpuHistoryService {
    /// Create a new history service
    pub fn new(db_path: PathBuf) -> Self {
        Self {
            db_path,
            connection: None,
        }
    }

    /// Stable on-disk location for the history database: a per-user path under
    /// the home directory, NOT the OS temp dir (which gets purged on reboot and
    /// loses all history).
    pub fn default_db_path() -> Result<PathBuf, String> {
        let home = std::env::var("HOME")
            .or_else(|_| std::env::var("USERPROFILE"))
            .map_err(|_| "Cannot determine home directory".to_string())?;
        let dir = PathBuf::from(home).join(".zwd-opsbot").join("ai");
        std::fs::create_dir_all(&dir)
            .map_err(|e| format!("Failed to create AI data directory: {}", e))?;
        Ok(dir.join("gpu-history.db"))
    }

    /// Initialize the database
    pub fn init(&mut self) -> Result<(), String> {
        let conn = rusqlite::Connection::open(&self.db_path)
            .map_err(|e| format!("Failed to open GPU history database: {}", e))?;

        conn.execute(
            "CREATE TABLE IF NOT EXISTS gpu_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                gpu_index INTEGER NOT NULL,
                timestamp INTEGER NOT NULL,
                utilization REAL NOT NULL,
                memory_used INTEGER NOT NULL,
                memory_total INTEGER NOT NULL,
                temperature REAL NOT NULL,
                power_draw REAL,
                UNIQUE(gpu_index, timestamp)
            )",
            [],
        )
        .map_err(|e| format!("Failed to create gpu_history table: {}", e))?;

        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_gpu_history_time 
             ON gpu_history(gpu_index, timestamp)",
            [],
        )
        .map_err(|e| format!("Failed to create index: {}", e))?;

        self.connection = Some(conn);
        Ok(())
    }

    /// Save a GPU snapshot
    pub fn save_snapshot(&self, gpu_info: &[GpuInfo]) -> Result<(), String> {
        let conn = self.connection.as_ref()
            .ok_or_else(|| "Database not initialized".to_string())?;

        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_err(|e| format!("Time error: {}", e))?
            .as_secs() as i64;

        for gpu in gpu_info {
            conn.execute(
                "INSERT OR REPLACE INTO gpu_history 
                 (gpu_index, timestamp, utilization, memory_used, memory_total, temperature, power_draw) 
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                rusqlite::params![
                    gpu.index,
                    timestamp,
                    gpu.utilization,
                    gpu.memory_used,
                    gpu.memory_total,
                    gpu.temperature,
                    gpu.power_draw,
                ],
            )
            .map_err(|e| format!("Failed to save GPU snapshot: {}", e))?;
        }

        Ok(())
    }

    /// Get history data
    pub fn get_history(
        &self,
        gpu_index: i32,
        start_time: i64,
        end_time: i64,
        interval: HistoryInterval,
    ) -> Result<Vec<GpuHistory>, String> {
        let conn = self.connection.as_ref()
            .ok_or_else(|| "Database not initialized".to_string())?;

        let interval_seconds = interval.seconds();

        // Use GROUP BY with time buckets for aggregation
        let sql = format!(
            "SELECT 
                (timestamp / {}) * {} as bucket_time,
                gpu_index,
                AVG(utilization) as avg_utilization,
                AVG(memory_used) as avg_memory_used,
                AVG(temperature) as avg_temperature
             FROM gpu_history
             WHERE gpu_index = ?1 AND timestamp >= ?2 AND timestamp <= ?3
             GROUP BY bucket_time, gpu_index
             ORDER BY bucket_time ASC",
            interval_seconds, interval_seconds
        );

        let mut stmt = conn.prepare(&sql)
            .map_err(|e| format!("Failed to prepare query: {}", e))?;

        let history_iter = stmt.query_map(
            rusqlite::params![gpu_index, start_time, end_time],
            |row| {
                Ok(GpuHistory {
                    timestamp: row.get(0)?,
                    gpu_index: row.get(1)?,
                    utilization: row.get(2)?,
                    // AVG(memory_used) is a SQLite REAL even over an INTEGER
                    // column; read it as f64 then narrow, else rusqlite errors
                    // with InvalidColumnType on any non-empty result.
                    memory_used: row.get::<_, f64>(3)? as u64,
                    temperature: row.get(4)?,
                })
            },
        )
        .map_err(|e| format!("Failed to query history: {}", e))?;

        let mut results = Vec::new();
        for item in history_iter {
            results.push(item.map_err(|e| format!("Failed to read history row: {}", e))?);
        }

        Ok(results)
    }

    /// Cleanup old data
    pub fn cleanup(&self, retention_days: u32) -> Result<u64, String> {
        let conn = self.connection.as_ref()
            .ok_or_else(|| "Database not initialized".to_string())?;

        let cutoff_time = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_err(|e| format!("Time error: {}", e))?
            .as_secs() as i64 - (retention_days as i64 * 86400);

        let deleted = conn.execute(
            "DELETE FROM gpu_history WHERE timestamp < ?1",
            rusqlite::params![cutoff_time],
        )
        .map_err(|e| format!("Failed to cleanup old data: {}", e))?;

        Ok(deleted as u64)
    }
}
