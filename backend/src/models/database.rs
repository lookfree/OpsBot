//! Database models for MySQL/PostgreSQL/SQLite connections

use serde::{Deserialize, Serialize};

/// Database types supported
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum DatabaseType {
    MySQL,
    PostgreSQL,
    SQLite,
}

/// Database connection request
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DatabaseConnectRequest {
    pub connection_id: String,
    pub db_type: DatabaseType,
    pub host: String,
    pub port: u16,
    pub username: String,
    pub password: Option<String>,
    pub database: Option<String>,
}

/// Database connection info
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DatabaseConnectionInfo {
    pub connection_id: String,
    pub db_type: DatabaseType,
    pub host: String,
    pub port: u16,
    pub database: Option<String>,
    pub connected_at: String,
}

/// SQL execution request
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SqlExecuteRequest {
    pub connection_id: String,
    pub sql: String,
    pub database: Option<String>,
}

/// Column information in query result
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QueryColumn {
    pub name: String,
    pub column_type: String,
    pub nullable: bool,
}

/// Query result
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QueryResult {
    pub columns: Vec<QueryColumn>,
    pub rows: Vec<Vec<serde_json::Value>>,
    pub affected_rows: u64,
    pub execution_time_ms: u64,
}

/// Database schema info
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DatabaseInfo {
    pub name: String,
    pub tables: Vec<TableInfo>,
}

/// Table info
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TableInfo {
    pub name: String,
    pub table_type: String, // TABLE, VIEW, etc.
    pub row_count: Option<i64>,
}

/// Table column detail
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ColumnDetail {
    pub name: String,
    pub column_type: String,
    pub nullable: bool,
    pub key: Option<String>,      // PRI, UNI, MUL
    pub default_value: Option<String>,
    pub extra: Option<String>,    // auto_increment, etc.
    pub comment: Option<String>,
}

/// Table structure
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TableStructure {
    pub database: String,
    pub table_name: String,
    pub columns: Vec<ColumnDetail>,
    pub indexes: Vec<IndexInfo>,
}

/// Index info
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IndexInfo {
    pub name: String,
    pub columns: Vec<String>,
    pub unique: bool,
    pub index_type: String,
}

/// View info
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ViewInfo {
    pub name: String,
    pub definer: Option<String>,
    pub security_type: Option<String>,
}

/// Function/Procedure info
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RoutineInfo {
    pub name: String,
    pub routine_type: String, // FUNCTION or PROCEDURE
    pub definer: Option<String>,
    pub created: Option<String>,
}

/// Database objects count
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DatabaseObjectsCount {
    pub tables: usize,
    pub views: usize,
    pub functions: usize,
    pub procedures: usize,
}

/// Foreign key info
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ForeignKeyInfo {
    pub name: String,
    pub column: String,
    pub ref_table: String,
    pub ref_column: String,
    pub on_delete: String,
    pub on_update: String,
}

/// Check constraint info
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckConstraintInfo {
    pub name: String,
    pub expression: String,
}

/// Trigger info
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TriggerInfo {
    pub name: String,
    pub event: String,      // INSERT, UPDATE, DELETE
    pub timing: String,     // BEFORE, AFTER
    pub statement: String,
    pub created: Option<String>,
}

/// Table options (advanced settings)
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TableOptions {
    pub engine: String,
    pub charset: String,
    pub collation: String,
    pub comment: String,
    pub auto_increment: Option<i64>,
    pub row_format: Option<String>,
}

/// Extended table structure with all details
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TableStructureExt {
    pub database: String,
    pub table_name: String,
    pub columns: Vec<ColumnDetail>,
    pub indexes: Vec<IndexInfo>,
    pub foreign_keys: Vec<ForeignKeyInfo>,
    pub check_constraints: Vec<CheckConstraintInfo>,
    pub triggers: Vec<TriggerInfo>,
    pub options: TableOptions,
}
