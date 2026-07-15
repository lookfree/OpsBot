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
async fn pg_table_structure_types_and_pk() {
    let Some(env) = pg_env() else {
        panic!("ZWD_TEST_PG_* env vars are required for this test");
    };
    let service = DatabaseService::new();
    service
        .connect(connect_request(&env, "test-structure"), None)
        .await
        .expect("connect failed");

    // agent.rag_chunks lives in the alt db and has integer/bigint columns
    let st = service
        .get_table_structure("test-structure", &env.alt_db, Some("agent"), "rag_chunks")
        .await
        .expect("get_table_structure failed");

    // Integer columns must not carry a bogus (precision,scale) modifier
    for col in &st.columns {
        assert!(
            !col.column_type.contains("(32,0)") && !col.column_type.contains("(64,0)"),
            "column {} has invalid type modifier: {}",
            col.name,
            col.column_type
        );
    }
    // Exactly one primary-key column (id), not leaked/duplicated across schemas
    let pk_cols: Vec<&str> = st
        .columns
        .iter()
        .filter(|c| c.key.as_deref() == Some("PRI"))
        .map(|c| c.name.as_str())
        .collect();
    assert_eq!(pk_cols, vec!["id"], "unexpected primary key columns");

    service.disconnect("test-structure").await.expect("disconnect failed");
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
async fn pgvector_embedding_decodes_as_text() {
    let Some(env) = pg_env() else {
        panic!("ZWD_TEST_PG_* env vars are required for this test");
    };
    let service = DatabaseService::new();
    service
        .connect(connect_request(&env, "test-pgvector"), None)
        .await
        .expect("connect failed");

    let result = service
        .execute_sql(SqlExecuteRequest {
            connection_id: "test-pgvector".to_string(),
            sql: "SELECT embedding FROM agent.rag_chunks LIMIT 1".to_string(),
            database: Some(env.alt_db.clone()),
        })
        .await
        .expect("embedding query failed");
    assert_eq!(result.rows.len(), 1);
    let value = result.rows[0][0]
        .as_str()
        .expect("embedding should decode to a string, not null");
    assert!(
        value.starts_with('[') && value.ends_with(']') && value.len() > 2,
        "unexpected embedding rendering: {}",
        &value[..value.len().min(80)]
    );

    service.disconnect("test-pgvector").await.expect("disconnect failed");
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
