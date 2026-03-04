//! MySQL 5.6 及以下版本兼容驱动
//!
//! 使用 mysql_async crate，支持 MySQL 4.1 ~ 8.x 全系列。
//! 主要用于无法升级的遗留 MySQL 5.6 生产环境。

use std::collections::HashMap;
use std::time::Instant;

use async_trait::async_trait;
use mysql_async::prelude::*;
use mysql_async::{OptsBuilder, Pool, PoolConstraints, PoolOpts, Row, Value};

use crate::models::{
    CheckConstraintInfo, DatabaseObjectsCount, ForeignKeyInfo, QueryColumn, QueryResult,
    RoutineInfo, TableInfo, TableOptions, TableStructure, TriggerInfo, ViewInfo,
};

use super::traits::{build_column_detail, build_index_map, DatabaseDriver};
use super::utils::{escape_backtick_identifier, validate_sql_identifier, MAX_QUERY_ROWS};

/// MySQL 5.6 兼容驱动（基于 mysql_async crate）
pub struct MySqlLegacyDriver {
    pool: Pool,
}

impl MySqlLegacyDriver {
    pub async fn connect(
        host: &str,
        port: u16,
        username: &str,
        password: &str,
        database: Option<&str>,
    ) -> Result<Self, String> {
        log::info!("Connecting to MySQL (legacy driver): {}:{}/{}", host, port, database.unwrap_or("(none)"));

        let constraints = PoolConstraints::new(2, 10)
            .ok_or_else(|| "Invalid pool constraints".to_string())?;
        let pool_opts = PoolOpts::default().with_constraints(constraints);
        let opts = OptsBuilder::default()
            .ip_or_hostname(host)
            .tcp_port(port)
            .user(Some(username))
            .pass(Some(password))
            .db_name(database)
            .prefer_socket(false)
            .pool_opts(pool_opts);
        let pool = Pool::new(opts);

        // 验证连接可用
        let mut conn = pool.get_conn().await.map_err(|e| {
            log::error!("Failed to connect to MySQL (legacy): {}", e);
            format!("Failed to connect to MySQL 5.6: {}", e)
        })?;
        conn.query_drop("SELECT 1").await.map_err(|e| format!("Connection test failed: {}", e))?;
        drop(conn);

        log::info!("MySQL legacy connection established successfully");
        Ok(Self { pool })
    }

    pub async fn test_connection(
        host: &str,
        port: u16,
        username: &str,
        password: &str,
        database: Option<&str>,
    ) -> Result<(), String> {
        let driver = Self::connect(host, port, username, password, database).await?;
        driver.pool.disconnect().await.map_err(|e| format!("Disconnect failed: {}", e))
    }

    fn value_to_json(val: Value) -> serde_json::Value {
        match val {
            Value::NULL => serde_json::Value::Null,
            Value::Bytes(b) => serde_json::Value::String(String::from_utf8_lossy(&b).to_string()),
            Value::Int(i) => serde_json::Value::from(i),
            Value::UInt(u) => serde_json::Value::from(u),
            Value::Float(f) => serde_json::Value::from(f as f64),
            Value::Double(d) => serde_json::Value::from(d),
            Value::Date(y, mo, d, h, mi, s, _) => serde_json::Value::String(
                format!("{:04}-{:02}-{:02} {:02}:{:02}:{:02}", y, mo, d, h, mi, s),
            ),
            Value::Time(neg, _d, h, mi, s, _) => serde_json::Value::String(
                format!("{}{:02}:{:02}:{:02}", if neg { "-" } else { "" }, h, mi, s),
            ),
        }
    }

    async fn query_rows(&self, sql: &str) -> Result<Vec<Row>, String> {
        let mut conn = self.pool.get_conn().await
            .map_err(|e| format!("Failed to get connection: {}", e))?;
        conn.query(sql).await.map_err(|e| format!("Query failed: {}", e))
    }

    async fn query_rows_bind(&self, sql: &str, params: impl Into<mysql_async::Params> + Send)
        -> Result<Vec<Row>, String>
    {
        let mut conn = self.pool.get_conn().await
            .map_err(|e| format!("Failed to get connection: {}", e))?;
        conn.exec(sql, params).await.map_err(|e| format!("Query failed: {}", e))
    }

    fn rows_to_result(rows: Vec<Row>, start: Instant) -> QueryResult {
        let total = rows.len();
        let truncated = total > MAX_QUERY_ROWS;
        let display = if truncated { &rows[..MAX_QUERY_ROWS] } else { &rows[..] };

        let columns: Vec<QueryColumn> = rows.first().map(|r| {
            r.columns_ref().iter().map(|c| QueryColumn {
                name: c.name_str().to_string(),
                column_type: format!("{:?}", c.column_type()),
                nullable: true,
            }).collect()
        }).unwrap_or_default();

        let mut data: Vec<Vec<serde_json::Value>> = display.iter().map(|row| {
            (0..row.len())
                .map(|i| Self::value_to_json(row.clone().take(i).unwrap_or(Value::NULL)))
                .collect()
        }).collect();

        if truncated {
            data.push(vec![serde_json::Value::String(
                format!("[Result truncated: showing {} of {} rows]", MAX_QUERY_ROWS, total),
            )]);
        }

        QueryResult {
            columns,
            rows: data,
            affected_rows: total as u64,
            execution_time_ms: start.elapsed().as_millis() as u64,
        }
    }
}

#[async_trait]
impl DatabaseDriver for MySqlLegacyDriver {
    async fn execute_query(&self, sql: &str) -> Result<QueryResult, String> {
        let start = Instant::now();
        let rows = self.query_rows(sql).await?;
        Ok(Self::rows_to_result(rows, start))
    }

    async fn execute_update(&self, sql: &str) -> Result<QueryResult, String> {
        let start = Instant::now();
        let mut conn = self.pool.get_conn().await
            .map_err(|e| format!("Failed to get connection: {}", e))?;
        conn.query_drop(sql).await.map_err(|e| format!("Execute failed: {}", e))?;
        let affected = conn.affected_rows();
        Ok(QueryResult {
            columns: vec![],
            rows: vec![],
            affected_rows: affected,
            execution_time_ms: start.elapsed().as_millis() as u64,
        })
    }

    async fn get_databases(&self) -> Result<Vec<String>, String> {
        let rows = self.query_rows("SHOW DATABASES").await?;
        Ok(rows.into_iter()
            .filter_map(|mut r| r.take::<String, _>(0))
            .collect())
    }

    async fn get_schemas(&self, _database: Option<&str>) -> Result<Vec<String>, String> {
        Ok(vec![])
    }

    async fn get_tables(&self, database: &str, _schema: Option<&str>) -> Result<Vec<TableInfo>, String> {
        let sql = "SELECT TABLE_NAME FROM information_schema.TABLES \
                   WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME";
        let rows = self.query_rows_bind(sql, (database,)).await?;
        Ok(rows.into_iter()
            .filter_map(|mut r| Some(TableInfo {
                name: r.take::<String, _>(0)?,
                table_type: "BASE TABLE".to_string(),
                row_count: None,
            }))
            .collect())
    }

    async fn get_table_structure(&self, database: &str, table: &str) -> Result<TableStructure, String> {
        validate_sql_identifier(database)?;
        validate_sql_identifier(table)?;

        let col_sql = format!(
            "SHOW FULL COLUMNS FROM `{}`.`{}`",
            escape_backtick_identifier(database),
            escape_backtick_identifier(table)
        );
        let col_rows = self.query_rows(&col_sql).await?;

        let columns = col_rows.into_iter().filter_map(|mut row| {
            let name = row.take::<String, _>("Field")?;
            let col_type = row.take::<String, _>("Type")?;
            let nullable = row.take::<String, _>("Null").map(|v| v == "YES").unwrap_or(true);
            let key = row.take::<Option<String>, _>("Key").flatten();
            let default_val = row.take::<Option<String>, _>("Default").flatten();
            let extra = row.take::<Option<String>, _>("Extra").flatten();
            let comment = row.take::<Option<String>, _>("Comment").flatten();
            Some(build_column_detail(name, col_type, nullable, key, default_val, extra, comment))
        }).collect();

        let idx_sql = format!(
            "SHOW INDEX FROM `{}`.`{}`",
            escape_backtick_identifier(database),
            escape_backtick_identifier(table)
        );
        let idx_rows = self.query_rows(&idx_sql).await?;
        let mut index_map = HashMap::new();
        for mut row in idx_rows {
            let key_name: String = row.take("Key_name").unwrap_or_default();
            let column_name: String = row.take("Column_name").unwrap_or_default();
            let non_unique: i64 = row.take("Non_unique").unwrap_or(1);
            let index_type: String = row.take("Index_type").unwrap_or_default();
            build_index_map(key_name, column_name, non_unique == 0, index_type, &mut index_map);
        }

        Ok(TableStructure {
            database: database.to_string(),
            table_name: table.to_string(),
            columns,
            indexes: index_map.into_values().collect(),
        })
    }

    async fn get_views(&self, database: &str, _schema: Option<&str>) -> Result<Vec<ViewInfo>, String> {
        let sql = "SELECT TABLE_NAME, DEFINER, SECURITY_TYPE FROM information_schema.VIEWS \
                   WHERE TABLE_SCHEMA = ?";
        let rows = self.query_rows_bind(sql, (database,)).await?;
        Ok(rows.into_iter().filter_map(|mut r| Some(ViewInfo {
            name: r.take::<String, _>("TABLE_NAME")?,
            definer: r.take::<Option<String>, _>("DEFINER").flatten(),
            security_type: r.take::<Option<String>, _>("SECURITY_TYPE").flatten(),
        })).collect())
    }

    async fn get_routines(&self, database: &str, _schema: Option<&str>) -> Result<Vec<RoutineInfo>, String> {
        let sql = "SELECT ROUTINE_NAME, ROUTINE_TYPE, DEFINER FROM information_schema.ROUTINES \
                   WHERE ROUTINE_SCHEMA = ?";
        let rows = self.query_rows_bind(sql, (database,)).await?;
        Ok(rows.into_iter().filter_map(|mut r| Some(RoutineInfo {
            name: r.take::<String, _>("ROUTINE_NAME")?,
            routine_type: r.take::<String, _>("ROUTINE_TYPE")?,
            definer: r.take::<Option<String>, _>("DEFINER").flatten(),
            created: None,
        })).collect())
    }

    async fn get_objects_count(&self, database: &str, _schema: Option<&str>) -> Result<DatabaseObjectsCount, String> {
        log::info!("[MySQL5.6] get_objects_count for database: {}", database);
        let mut conn = self.pool.get_conn().await
            .map_err(|e| {
                log::error!("[MySQL5.6] Failed to get connection for get_objects_count: {}", e);
                format!("Failed to get connection: {}", e)
            })?;
        let db = database.to_string();

        let tables: u64 = conn.exec_first(
            "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=? AND TABLE_TYPE='BASE TABLE'",
            (&db,)
        ).await.map_err(|e| {
            log::error!("[MySQL5.6] Tables count query failed: {}", e);
            format!("Query failed: {}", e)
        })?
            .and_then(|mut r: Row| r.take::<u64, _>(0)).unwrap_or(0);

        let views: u64 = conn.exec_first(
            "SELECT COUNT(*) FROM information_schema.VIEWS WHERE TABLE_SCHEMA=?",
            (&db,)
        ).await.map_err(|e| {
            log::error!("[MySQL5.6] Views count query failed: {}", e);
            format!("Query failed: {}", e)
        })?
            .and_then(|mut r: Row| r.take::<u64, _>(0)).unwrap_or(0);

        let functions: u64 = conn.exec_first(
            "SELECT COUNT(*) FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA=? AND ROUTINE_TYPE='FUNCTION'",
            (&db,)
        ).await.map_err(|e| {
            log::error!("[MySQL5.6] Functions count query failed: {}", e);
            format!("Query failed: {}", e)
        })?
            .and_then(|mut r: Row| r.take::<u64, _>(0)).unwrap_or(0);

        let procedures: u64 = conn.exec_first(
            "SELECT COUNT(*) FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA=? AND ROUTINE_TYPE='PROCEDURE'",
            (&db,)
        ).await.map_err(|e| {
            log::error!("[MySQL5.6] Procedures count query failed: {}", e);
            format!("Query failed: {}", e)
        })?
            .and_then(|mut r: Row| r.take::<u64, _>(0)).unwrap_or(0);

        log::info!("[MySQL5.6] get_objects_count result: tables={}, views={}, functions={}, procedures={}", tables, views, functions, procedures);
        Ok(DatabaseObjectsCount {
            tables: tables as usize,
            views: views as usize,
            functions: functions as usize,
            procedures: procedures as usize,
        })
    }

    async fn get_table_ddl(&self, database: &str, table: &str) -> Result<String, String> {
        validate_sql_identifier(database)?;
        validate_sql_identifier(table)?;
        let sql = format!(
            "SHOW CREATE TABLE `{}`.`{}`",
            escape_backtick_identifier(database),
            escape_backtick_identifier(table)
        );
        let mut rows = self.query_rows(&sql).await?;
        Ok(rows.first_mut()
            .and_then(|r| r.take::<String, _>(1))
            .unwrap_or_default())
    }

    async fn rename_table(&self, database: &str, old_name: &str, new_name: &str) -> Result<(), String> {
        validate_sql_identifier(database)?;
        validate_sql_identifier(old_name)?;
        validate_sql_identifier(new_name)?;
        let sql = format!(
            "RENAME TABLE `{}`.`{}` TO `{}`.`{}`",
            escape_backtick_identifier(database), escape_backtick_identifier(old_name),
            escape_backtick_identifier(database), escape_backtick_identifier(new_name)
        );
        let mut conn = self.pool.get_conn().await
            .map_err(|e| format!("Failed to get connection: {}", e))?;
        conn.query_drop(sql).await.map_err(|e| format!("Failed to rename table: {}", e))
    }

    async fn drop_table(&self, database: &str, table: &str) -> Result<(), String> {
        validate_sql_identifier(database)?;
        validate_sql_identifier(table)?;
        let sql = format!(
            "DROP TABLE `{}`.`{}`",
            escape_backtick_identifier(database),
            escape_backtick_identifier(table)
        );
        let mut conn = self.pool.get_conn().await
            .map_err(|e| format!("Failed to get connection: {}", e))?;
        conn.query_drop(sql).await.map_err(|e| format!("Failed to drop table: {}", e))
    }

    async fn get_foreign_keys(&self, database: &str, table: &str) -> Result<Vec<ForeignKeyInfo>, String> {
        let sql = "SELECT CONSTRAINT_NAME as name, COLUMN_NAME as col, \
                   REFERENCED_TABLE_NAME as ref_table, REFERENCED_COLUMN_NAME as ref_col \
                   FROM information_schema.KEY_COLUMN_USAGE \
                   WHERE TABLE_SCHEMA=? AND TABLE_NAME=? AND REFERENCED_TABLE_NAME IS NOT NULL \
                   ORDER BY CONSTRAINT_NAME, ORDINAL_POSITION";
        let rows = self.query_rows_bind(sql, (database, table)).await?;
        Ok(rows.into_iter().filter_map(|mut r| Some(ForeignKeyInfo {
            name: r.take::<String, _>("name")?,
            column: r.take::<String, _>("col")?,
            ref_table: r.take::<String, _>("ref_table")?,
            ref_column: r.take::<String, _>("ref_col")?,
            on_delete: "RESTRICT".to_string(),
            on_update: "RESTRICT".to_string(),
        })).collect())
    }

    async fn get_check_constraints(&self, _database: &str, _table: &str) -> Result<Vec<CheckConstraintInfo>, String> {
        // MySQL 5.6 does not support CHECK constraints
        Ok(vec![])
    }

    async fn get_triggers(&self, database: &str, table: &str) -> Result<Vec<TriggerInfo>, String> {
        let sql = "SELECT TRIGGER_NAME, EVENT_MANIPULATION, ACTION_TIMING, ACTION_STATEMENT \
                   FROM information_schema.TRIGGERS \
                   WHERE EVENT_OBJECT_SCHEMA=? AND EVENT_OBJECT_TABLE=?";
        let rows = self.query_rows_bind(sql, (database, table)).await?;
        Ok(rows.into_iter().filter_map(|mut r| Some(TriggerInfo {
            name: r.take::<String, _>("TRIGGER_NAME")?,
            event: r.take::<String, _>("EVENT_MANIPULATION")?,
            timing: r.take::<String, _>("ACTION_TIMING")?,
            statement: r.take::<String, _>("ACTION_STATEMENT")?,
            created: None,
        })).collect())
    }

    async fn get_table_options(&self, database: &str, table: &str) -> Result<TableOptions, String> {
        let sql = "SELECT ENGINE, TABLE_COLLATION, TABLE_COMMENT, AUTO_INCREMENT, ROW_FORMAT \
                   FROM information_schema.TABLES WHERE TABLE_SCHEMA=? AND TABLE_NAME=?";
        let mut rows = self.query_rows_bind(sql, (database, table)).await?;
        let row = rows.first_mut().ok_or("Table not found")?;
        let collation: String = row.take("TABLE_COLLATION").unwrap_or_default();
        let charset = collation.split('_').next().unwrap_or("utf8").to_string();
        Ok(TableOptions {
            engine: row.take("ENGINE").unwrap_or_else(|| "InnoDB".to_string()),
            charset,
            collation,
            comment: row.take("TABLE_COMMENT").unwrap_or_default(),
            auto_increment: row.take::<Option<i64>, _>("AUTO_INCREMENT").flatten(),
            row_format: row.take::<Option<String>, _>("ROW_FORMAT").flatten(),
        })
    }

    async fn close(&self) {
        let _ = self.pool.clone().disconnect().await;
    }
}
