//! Tauri commands for database operations

use std::sync::Arc;

use tauri::{AppHandle, State};

use crate::models::{
    CheckConstraintInfo, DatabaseConnectRequest, DatabaseConnectionInfo, DatabaseObjectsCount,
    ForeignKeyInfo, QueryResult, RoutineInfo, SqlExecuteRequest, TableInfo, TableOptions,
    TableStructure, TableStructureExt, TriggerInfo, ViewInfo,
};
use crate::services::DatabaseService;
#[cfg(feature = "clickhouse")]
use crate::services::database::ClusterInfo;

/// State wrapper for database service
pub struct DatabaseServiceState(pub Arc<DatabaseService>);

/// Connect to MySQL database
#[tauri::command]
pub async fn db_connect(
    app: AppHandle,
    state: State<'_, DatabaseServiceState>,
    request: DatabaseConnectRequest,
) -> Result<DatabaseConnectionInfo, String> {
    state.0.connect(request, Some(app)).await
}

/// Disconnect from database
#[tauri::command]
pub async fn db_disconnect(
    state: State<'_, DatabaseServiceState>,
    connection_id: String,
) -> Result<(), String> {
    state.0.disconnect(&connection_id).await
}

/// Test database connection
#[tauri::command]
pub async fn db_test_connection(
    app: AppHandle,
    state: State<'_, DatabaseServiceState>,
    request: DatabaseConnectRequest,
) -> Result<(), String> {
    state.0.test_connection(request, Some(app)).await
}

/// Check if connection is active
#[tauri::command]
pub async fn db_is_connected(
    state: State<'_, DatabaseServiceState>,
    connection_id: String,
) -> Result<bool, String> {
    Ok(state.0.is_connected(&connection_id))
}

/// Execute SQL query
#[tauri::command]
pub async fn db_execute_sql(
    state: State<'_, DatabaseServiceState>,
    request: SqlExecuteRequest,
) -> Result<QueryResult, String> {
    state.0.execute_sql(request).await
}

/// Get all databases
#[tauri::command]
pub async fn db_get_databases(
    state: State<'_, DatabaseServiceState>,
    connection_id: String,
) -> Result<Vec<String>, String> {
    log::info!("[DB_CMD] db_get_databases id={}", connection_id);
    let result = state.0.get_databases(&connection_id).await;
    if let Ok(databases) = &result {
        log::info!(
            "[DB_CMD] db_get_databases done id={} count={} names={}",
            connection_id,
            databases.len(),
            databases.iter().take(10).cloned().collect::<Vec<_>>().join(",")
        );
    }
    result
}

/// Get all schemas (PostgreSQL only)
#[tauri::command]
pub async fn db_get_schemas(
    state: State<'_, DatabaseServiceState>,
    connection_id: String,
    database: Option<String>,
) -> Result<Vec<String>, String> {
    state.0.get_schemas(&connection_id, database.as_deref()).await
}

/// Get tables in a database
#[tauri::command]
pub async fn db_get_tables(
    state: State<'_, DatabaseServiceState>,
    connection_id: String,
    database: String,
    schema: Option<String>,
) -> Result<Vec<TableInfo>, String> {
    log::info!(
        "[DB_CMD] db_get_tables id={} database={} schema={}",
        connection_id,
        database,
        schema.as_deref().unwrap_or("")
    );
    let result = state.0.get_tables(&connection_id, &database, schema.as_deref()).await;
    if let Ok(tables) = &result {
        log::info!(
            "[DB_CMD] db_get_tables done id={} database={} count={} sample={}",
            connection_id,
            database,
            tables.len(),
            tables
                .iter()
                .take(10)
                .map(|table| table.name.as_str())
                .collect::<Vec<_>>()
                .join(",")
        );
    }
    result
}

/// Get table structure
#[tauri::command]
pub async fn db_get_table_structure(
    state: State<'_, DatabaseServiceState>,
    connection_id: String,
    database: String,
    schema: Option<String>,
    table: String,
) -> Result<TableStructure, String> {
    state.0.get_table_structure(&connection_id, &database, schema.as_deref(), &table).await
}

/// Get views in a database
#[tauri::command]
pub async fn db_get_views(
    state: State<'_, DatabaseServiceState>,
    connection_id: String,
    database: String,
    schema: Option<String>,
) -> Result<Vec<ViewInfo>, String> {
    state.0.get_views(&connection_id, &database, schema.as_deref()).await
}

/// Get functions and procedures in a database
#[tauri::command]
pub async fn db_get_routines(
    state: State<'_, DatabaseServiceState>,
    connection_id: String,
    database: String,
    schema: Option<String>,
) -> Result<Vec<RoutineInfo>, String> {
    state.0.get_routines(&connection_id, &database, schema.as_deref()).await
}

/// Get database objects count
#[tauri::command]
pub async fn db_get_objects_count(
    state: State<'_, DatabaseServiceState>,
    connection_id: String,
    database: String,
    schema: Option<String>,
) -> Result<DatabaseObjectsCount, String> {
    log::info!(
        "[DB_CMD] db_get_objects_count id={} database={} schema={}",
        connection_id,
        database,
        schema.as_deref().unwrap_or("")
    );
    let result = state.0.get_objects_count(&connection_id, &database, schema.as_deref()).await;
    if let Ok(counts) = &result {
        log::info!(
            "[DB_CMD] db_get_objects_count done id={} database={} tables={} views={} functions={} procedures={}",
            connection_id,
            database,
            counts.tables,
            counts.views,
            counts.functions,
            counts.procedures
        );
    }
    result
}

/// Get table DDL
#[tauri::command]
pub async fn db_get_table_ddl(
    state: State<'_, DatabaseServiceState>,
    connection_id: String,
    database: String,
    schema: Option<String>,
    table: String,
) -> Result<String, String> {
    state.0.get_table_ddl(&connection_id, &database, schema.as_deref(), &table).await
}

/// Rename a table
#[tauri::command]
pub async fn db_rename_table(
    state: State<'_, DatabaseServiceState>,
    connection_id: String,
    database: String,
    schema: Option<String>,
    old_name: String,
    new_name: String,
) -> Result<(), String> {
    state.0.rename_table(&connection_id, &database, schema.as_deref(), &old_name, &new_name).await
}

/// Drop a table
#[tauri::command]
pub async fn db_drop_table(
    state: State<'_, DatabaseServiceState>,
    connection_id: String,
    database: String,
    schema: Option<String>,
    table: String,
) -> Result<(), String> {
    state.0.drop_table(&connection_id, &database, schema.as_deref(), &table).await
}

/// Get foreign keys for a table
#[tauri::command]
pub async fn db_get_foreign_keys(
    state: State<'_, DatabaseServiceState>,
    connection_id: String,
    database: String,
    schema: Option<String>,
    table: String,
) -> Result<Vec<ForeignKeyInfo>, String> {
    state.0.get_foreign_keys(&connection_id, &database, schema.as_deref(), &table).await
}

/// Get check constraints for a table
#[tauri::command]
pub async fn db_get_check_constraints(
    state: State<'_, DatabaseServiceState>,
    connection_id: String,
    database: String,
    schema: Option<String>,
    table: String,
) -> Result<Vec<CheckConstraintInfo>, String> {
    state.0.get_check_constraints(&connection_id, &database, schema.as_deref(), &table).await
}

/// Get triggers for a table
#[tauri::command]
pub async fn db_get_triggers(
    state: State<'_, DatabaseServiceState>,
    connection_id: String,
    database: String,
    schema: Option<String>,
    table: String,
) -> Result<Vec<TriggerInfo>, String> {
    state.0.get_triggers(&connection_id, &database, schema.as_deref(), &table).await
}

/// Get table options
#[tauri::command]
pub async fn db_get_table_options(
    state: State<'_, DatabaseServiceState>,
    connection_id: String,
    database: String,
    schema: Option<String>,
    table: String,
) -> Result<TableOptions, String> {
    state.0.get_table_options(&connection_id, &database, schema.as_deref(), &table).await
}

/// Get extended table structure with all details
#[tauri::command]
pub async fn db_get_table_structure_ext(
    state: State<'_, DatabaseServiceState>,
    connection_id: String,
    database: String,
    schema: Option<String>,
    table: String,
) -> Result<TableStructureExt, String> {
    state.0.get_table_structure_ext(&connection_id, &database, schema.as_deref(), &table).await
}

/// Get ClickHouse clusters (ClickHouse only)
#[cfg(feature = "clickhouse")]
#[tauri::command]
pub async fn db_get_clickhouse_clusters(
    state: State<'_, DatabaseServiceState>,
    connection_id: String,
) -> Result<Vec<ClusterInfo>, String> {
    state.0.get_clickhouse_clusters(&connection_id).await
}
