//! Driver construction for database sessions.
//!
//! Builds the initial driver for a connect request, tests connectivity, and
//! opens additional per-database drivers for engines (PostgreSQL family)
//! where one connection is pinned to a single database.

use std::sync::Arc;

use crate::models::{DatabaseConnectRequest, DatabaseType};

use super::session::DatabaseSession;
use super::traits::DatabaseDriver;

#[cfg(feature = "clickhouse")]
use super::clickhouse::ClickHouseDriver;
#[cfg(feature = "dm")]
use super::dm::DmDriver;
use super::kingbase::KingBaseDriver;
use super::mariadb::MariaDBDriver;
#[cfg(feature = "mssql")]
use super::mssql::MssqlDriver;
use super::mysql::MySqlDriver;
#[cfg(feature = "mysql-legacy")]
use super::mysql_legacy::MySqlLegacyDriver;
#[cfg(feature = "oracle")]
use super::oracle::OracleDriver;
use super::postgresql::PostgreSqlDriver;
use super::sqlite::SqliteDriver;

/// Whether `execute_sql` should honor a requested database different from the
/// session's current one (via a dedicated per-database pool).
pub(super) fn supports_database_switch(db_type: &DatabaseType) -> bool {
    matches!(
        db_type,
        DatabaseType::PostgreSQL
            | DatabaseType::KingBase
            | DatabaseType::MySQL
            | DatabaseType::MariaDB
    )
}

/// Whether metadata queries (tables/views/...) must run on a pool connected to
/// the requested database. MySQL-family drivers scope these queries with the
/// database name in SQL, so only the PostgreSQL family needs dedicated pools.
pub(super) fn requires_dedicated_database_pool(db_type: &DatabaseType) -> bool {
    matches!(db_type, DatabaseType::PostgreSQL | DatabaseType::KingBase)
}

/// Create the driver for a connect request. Returns the driver and the
/// default schema for engines that have one.
pub(super) async fn create_driver(
    request: &DatabaseConnectRequest,
) -> Result<(Arc<dyn DatabaseDriver>, Option<String>), String> {
    let password = request.password.as_deref().unwrap_or("");
    match request.db_type {
        DatabaseType::MySQL => Ok((create_mysql_driver(request, password).await?, None)),
        DatabaseType::PostgreSQL => {
            let driver: Arc<dyn DatabaseDriver> = if let Some(url) = request.connection_url.as_deref() {
                Arc::new(PostgreSqlDriver::connect_url(url).await?)
            } else {
                let database = request.database.as_deref().unwrap_or("postgres");
                Arc::new(PostgreSqlDriver::connect(&request.host, request.port, &request.username, password, database).await?)
            };
            Ok((driver, Some("public".to_string())))
        }
        DatabaseType::MariaDB => {
            let driver: Arc<dyn DatabaseDriver> = if let Some(url) = request.connection_url.as_deref() {
                Arc::new(MariaDBDriver::connect_url(url).await?)
            } else {
                Arc::new(MariaDBDriver::connect(&request.host, request.port, &request.username, password, request.database.as_deref()).await?)
            };
            Ok((driver, None))
        }
        DatabaseType::SQLite => {
            // For SQLite, the database field contains the file path
            let file_path = request.database.as_deref().unwrap_or(":memory:");
            Ok((Arc::new(SqliteDriver::connect(file_path).await?), Some("main".to_string())))
        }
        #[cfg(feature = "oracle")]
        DatabaseType::Oracle => {
            let service_name = request.database.as_deref().unwrap_or("ORCL");
            let driver = OracleDriver::connect(&request.host, request.port, &request.username, password, service_name).await?;
            Ok((Arc::new(driver), None))
        }
        #[cfg(not(feature = "oracle"))]
        DatabaseType::Oracle => Err("Oracle support is not enabled. Rebuild with --features oracle".to_string()),
        #[cfg(feature = "mssql")]
        DatabaseType::MSSQL => {
            let database = request.database.as_deref().unwrap_or("master");
            let driver = MssqlDriver::connect(&request.host, request.port, &request.username, password, database).await?;
            Ok((Arc::new(driver), Some("dbo".to_string())))
        }
        #[cfg(not(feature = "mssql"))]
        DatabaseType::MSSQL => Err("SQL Server support is not enabled. Rebuild with --features mssql".to_string()),
        DatabaseType::KingBase => {
            let driver: Arc<dyn DatabaseDriver> = if let Some(url) = request.connection_url.as_deref() {
                Arc::new(KingBaseDriver::connect_url(url).await?)
            } else {
                let database = request.database.as_deref().unwrap_or("TEST");
                Arc::new(KingBaseDriver::connect(&request.host, request.port, &request.username, password, database).await?)
            };
            Ok((driver, Some("public".to_string())))
        }
        #[cfg(feature = "dm")]
        DatabaseType::DM => {
            let database = request.database.as_deref().unwrap_or("SYSDBA");
            let driver = DmDriver::connect(&request.host, request.port, &request.username, password, database).await?;
            Ok((Arc::new(driver), None))
        }
        #[cfg(not(feature = "dm"))]
        DatabaseType::DM => Err("DM Database support is not enabled. Rebuild with --features dm".to_string()),
        #[cfg(feature = "clickhouse")]
        DatabaseType::ClickHouse => {
            let driver: Arc<dyn DatabaseDriver> = if let Some(url) = request.connection_url.as_deref() {
                Arc::new(ClickHouseDriver::connect_url(url).await?)
            } else {
                let database = request.database.as_deref().unwrap_or("default");
                Arc::new(ClickHouseDriver::connect(&request.host, request.port, &request.username, password, database).await?)
            };
            Ok((driver, None))
        }
        #[cfg(not(feature = "clickhouse"))]
        DatabaseType::ClickHouse => Err("ClickHouse support is not enabled. Rebuild with --features clickhouse".to_string()),
    }
}

async fn create_mysql_driver(
    request: &DatabaseConnectRequest,
    password: &str,
) -> Result<Arc<dyn DatabaseDriver>, String> {
    if let Some(url) = request.connection_url.as_deref() {
        return Ok(Arc::new(MySqlDriver::connect_url(url).await?));
    }
    match request.driver_version.as_deref().unwrap_or("5.7+") {
        "5.6" => {
            #[cfg(feature = "mysql-legacy")]
            {
                Ok(Arc::new(MySqlLegacyDriver::connect(&request.host, request.port, &request.username, password, request.database.as_deref()).await?))
            }
            #[cfg(not(feature = "mysql-legacy"))]
            {
                Err("MySQL 5.6 support is not enabled in this build".to_string())
            }
        }
        _ => Ok(Arc::new(MySqlDriver::connect(&request.host, request.port, &request.username, password, request.database.as_deref()).await?)),
    }
}

/// Open an additional driver on the same server but a different database.
pub(super) async fn create_driver_for_database(
    session: &DatabaseSession,
    database: &str,
) -> Result<Arc<dyn DatabaseDriver>, String> {
    let request = DatabaseConnectRequest {
        connection_id: session.connection_id.clone(),
        db_type: session.db_type.clone(),
        host: session.host.clone(),
        port: session.port,
        username: session.username.clone(),
        password: Some(session.password.clone()),
        database: Some(database.to_string()),
        connection_url: session
            .connection_url
            .as_deref()
            .map(|url| rewrite_database_in_url(url, database))
            .transpose()?,
        driver_version: session.driver_version.clone(),
        ssh_tunnel: None,
    };

    if !supports_database_switch(&request.db_type) {
        return Err(format!(
            "Switching database is not supported for {:?}",
            request.db_type
        ));
    }

    let (driver, _) = create_driver(&request).await?;
    Ok(driver)
}

/// Test connectivity for a connect request without keeping a session.
pub(super) async fn test_driver(request: &DatabaseConnectRequest) -> Result<(), String> {
    let password = request.password.as_deref().unwrap_or("");
    match request.db_type {
        DatabaseType::MySQL => test_mysql_driver(request, password).await,
        DatabaseType::PostgreSQL => {
            if let Some(url) = request.connection_url.as_deref() {
                PostgreSqlDriver::test_connection_url(url).await
            } else {
                let database = request.database.as_deref().unwrap_or("postgres");
                PostgreSqlDriver::test_connection(&request.host, request.port, &request.username, password, database).await
            }
        }
        DatabaseType::MariaDB => {
            if let Some(url) = request.connection_url.as_deref() {
                MariaDBDriver::test_connection_url(url).await
            } else {
                MariaDBDriver::test_connection(&request.host, request.port, &request.username, password, request.database.as_deref()).await
            }
        }
        DatabaseType::SQLite => {
            let file_path = request.database.as_deref().unwrap_or(":memory:");
            SqliteDriver::test_connection(file_path).await
        }
        #[cfg(feature = "oracle")]
        DatabaseType::Oracle => {
            let service_name = request.database.as_deref().unwrap_or("ORCL");
            OracleDriver::test_connection(&request.host, request.port, &request.username, password, service_name).await
        }
        #[cfg(not(feature = "oracle"))]
        DatabaseType::Oracle => Err("Oracle support is not enabled. Rebuild with --features oracle".to_string()),
        #[cfg(feature = "mssql")]
        DatabaseType::MSSQL => {
            let database = request.database.as_deref().unwrap_or("master");
            MssqlDriver::test_connection(&request.host, request.port, &request.username, password, database).await
        }
        #[cfg(not(feature = "mssql"))]
        DatabaseType::MSSQL => Err("SQL Server support is not enabled. Rebuild with --features mssql".to_string()),
        DatabaseType::KingBase => {
            if let Some(url) = request.connection_url.as_deref() {
                KingBaseDriver::test_connection_url(url).await
            } else {
                let database = request.database.as_deref().unwrap_or("TEST");
                KingBaseDriver::test_connection(&request.host, request.port, &request.username, password, database).await
            }
        }
        #[cfg(feature = "dm")]
        DatabaseType::DM => {
            let database = request.database.as_deref().unwrap_or("SYSDBA");
            DmDriver::test_connection(&request.host, request.port, &request.username, password, database).await
        }
        #[cfg(not(feature = "dm"))]
        DatabaseType::DM => Err("DM Database support is not enabled. Rebuild with --features dm".to_string()),
        #[cfg(feature = "clickhouse")]
        DatabaseType::ClickHouse => {
            if let Some(url) = request.connection_url.as_deref() {
                ClickHouseDriver::test_connection_url(url).await
            } else {
                let database = request.database.as_deref().unwrap_or("default");
                ClickHouseDriver::test_connection(&request.host, request.port, &request.username, password, database).await
            }
        }
        #[cfg(not(feature = "clickhouse"))]
        DatabaseType::ClickHouse => Err("ClickHouse support is not enabled. Rebuild with --features clickhouse".to_string()),
    }
}

async fn test_mysql_driver(request: &DatabaseConnectRequest, password: &str) -> Result<(), String> {
    if let Some(url) = request.connection_url.as_deref() {
        return MySqlDriver::test_connection_url(url).await;
    }
    match request.driver_version.as_deref().unwrap_or("5.7+") {
        "5.6" => {
            #[cfg(feature = "mysql-legacy")]
            {
                MySqlLegacyDriver::test_connection(&request.host, request.port, &request.username, password, request.database.as_deref()).await
            }
            #[cfg(not(feature = "mysql-legacy"))]
            {
                Err("MySQL 5.6 support is not enabled in this build".to_string())
            }
        }
        _ => MySqlDriver::test_connection(&request.host, request.port, &request.username, password, request.database.as_deref()).await,
    }
}

/// Replace the database (path) segment of a connection URL, keeping the query string.
fn rewrite_database_in_url(url: &str, database: &str) -> Result<String, String> {
    let scheme_end = url
        .find("://")
        .ok_or_else(|| "Invalid connection URL: missing scheme".to_string())?
        + 3;
    let rest = &url[scheme_end..];
    let (authority_and_path, query) = match rest.find('?') {
        Some(idx) => (&rest[..idx], &rest[idx..]),
        None => (rest, ""),
    };
    let authority = match authority_and_path.find('/') {
        Some(idx) => &authority_and_path[..idx],
        None => authority_and_path,
    };
    Ok(format!(
        "{}{}/{}{}",
        &url[..scheme_end],
        authority,
        urlencoding::encode(database),
        query
    ))
}

#[cfg(test)]
mod tests {
    use super::rewrite_database_in_url;

    #[test]
    fn rewrites_path_keeping_query() {
        assert_eq!(
            rewrite_database_in_url("postgres://u:p@h:5432/olddb?sslmode=require", "newdb").unwrap(),
            "postgres://u:p@h:5432/newdb?sslmode=require"
        );
    }

    #[test]
    fn adds_path_when_missing() {
        assert_eq!(
            rewrite_database_in_url("postgres://u:p@h:5432", "newdb").unwrap(),
            "postgres://u:p@h:5432/newdb"
        );
    }

    #[test]
    fn adds_path_before_query_when_missing() {
        assert_eq!(
            rewrite_database_in_url("mysql://u:p@h:3306?charset=utf8", "newdb").unwrap(),
            "mysql://u:p@h:3306/newdb?charset=utf8"
        );
    }

    #[test]
    fn encodes_database_name() {
        assert_eq!(
            rewrite_database_in_url("postgres://u:p@h/db", "my db").unwrap(),
            "postgres://u:p@h/my%20db"
        );
    }

    #[test]
    fn rejects_url_without_scheme() {
        assert!(rewrite_database_in_url("not-a-url", "db").is_err());
    }
}
