//! Integration tests for per-database query routing.
//!
//! These tests need a live PostgreSQL server and are ignored by default.
//! Run with:
//!   ZWD_TEST_PG_HOST=... ZWD_TEST_PG_PORT=5432 ZWD_TEST_PG_USER=... \
//!   ZWD_TEST_PG_PASSWORD=... ZWD_TEST_PG_DB=db1 ZWD_TEST_PG_ALT_DB=db2 \
//!   cargo test --test database_routing -- --ignored

use zwd_opsbot_lib::models::{DatabaseConnectRequest, DatabaseType, SqlExecuteRequest};
use zwd_opsbot_lib::services::DatabaseService;

struct PgTestEnv {
    host: String,
    port: u16,
    user: String,
    password: String,
    db: String,
    alt_db: String,
}

fn pg_env() -> Option<PgTestEnv> {
    Some(PgTestEnv {
        host: std::env::var("ZWD_TEST_PG_HOST").ok()?,
        port: std::env::var("ZWD_TEST_PG_PORT").ok()?.parse().ok()?,
        user: std::env::var("ZWD_TEST_PG_USER").ok()?,
        password: std::env::var("ZWD_TEST_PG_PASSWORD").ok()?,
        db: std::env::var("ZWD_TEST_PG_DB").ok()?,
        alt_db: std::env::var("ZWD_TEST_PG_ALT_DB").ok()?,
    })
}

fn connect_request(env: &PgTestEnv, connection_id: &str) -> DatabaseConnectRequest {
    DatabaseConnectRequest {
        connection_id: connection_id.to_string(),
        db_type: DatabaseType::PostgreSQL,
        host: env.host.clone(),
        port: env.port,
        username: env.user.clone(),
        password: Some(env.password.clone()),
        database: Some(env.db.clone()),
        connection_url: None,
        driver_version: None,
        ssh_tunnel: None,
    }
}

async fn current_database(
    service: &DatabaseService,
    connection_id: &str,
    database: Option<&str>,
) -> String {
    let result = service
        .execute_sql(SqlExecuteRequest {
            connection_id: connection_id.to_string(),
            sql: "SELECT current_database()".to_string(),
            database: database.map(|db| db.to_string()),
        })
        .await
        .expect("execute_sql failed");
    result.rows[0][0]
        .as_str()
        .expect("current_database() should be a string")
        .to_string()
}

#[tokio::test]
#[ignore]
async fn execute_sql_routes_to_requested_database() {
    let Some(env) = pg_env() else {
        panic!("ZWD_TEST_PG_* env vars are required for this test");
    };
    let service = DatabaseService::new();
    service
        .connect(connect_request(&env, "test-routing"), None)
        .await
        .expect("connect failed");

    // No database requested -> session default
    assert_eq!(current_database(&service, "test-routing", None).await, env.db);

    // Explicit session database -> session default
    assert_eq!(
        current_database(&service, "test-routing", Some(&env.db)).await,
        env.db
    );

    // Another real database -> must actually run there
    assert_eq!(
        current_database(&service, "test-routing", Some(&env.alt_db)).await,
        env.alt_db
    );

    // Unknown database names must error (fail closed), never run elsewhere
    let err = service
        .execute_sql(SqlExecuteRequest {
            connection_id: "test-routing".to_string(),
            sql: "SELECT current_database()".to_string(),
            database: Some("no_such_database_zwd".to_string()),
        })
        .await
        .expect_err("unknown database should be an error");
    assert!(err.contains("no_such_database_zwd"), "unexpected error: {err}");

    service.disconnect("test-routing").await.expect("disconnect failed");
}

#[tokio::test]
#[ignore]
async fn url_mode_records_effective_database_and_routes() {
    let Some(env) = pg_env() else {
        panic!("ZWD_TEST_PG_* env vars are required for this test");
    };
    let service = DatabaseService::new();
    let url = format!(
        "postgres://{}:{}@{}:{}/{}",
        env.user, env.password, env.host, env.port, env.db
    );
    let mut request = connect_request(&env, "test-url-routing");
    request.database = None;
    request.connection_url = Some(url);

    let info = service
        .connect(request, None)
        .await
        .expect("URL-mode connect failed");
    // Effective database must be resolved from the URL path
    assert_eq!(info.database.as_deref(), Some(env.db.as_str()));

    // Selecting the session's own database must not error (and stays there)
    assert_eq!(
        current_database(&service, "test-url-routing", Some(&env.db)).await,
        env.db
    );
    // Routing to another database still works in URL mode
    assert_eq!(
        current_database(&service, "test-url-routing", Some(&env.alt_db)).await,
        env.alt_db
    );

    service.disconnect("test-url-routing").await.expect("disconnect failed");
}
