//! Database driver trait definition
//!
//! Defines the interface for database drivers using the strategy pattern.

use async_trait::async_trait;

use crate::models::{
    CheckConstraintInfo, ColumnDetail, DatabaseObjectsCount, ForeignKeyInfo, IndexInfo,
    QueryResult, RoutineInfo, TableInfo, TableOptions, TableStructure, TriggerInfo, ViewInfo,
};

/// Database driver trait - defines the interface for all database implementations
#[async_trait]
pub trait DatabaseDriver: Send + Sync {
    /// Execute a SQL query (SELECT, SHOW, etc.)
    async fn execute_query(&self, sql: &str) -> Result<QueryResult, String>;

    /// Execute a SQL statement (INSERT, UPDATE, DELETE, etc.)
    async fn execute_update(&self, sql: &str) -> Result<QueryResult, String>;

    /// Get all databases
    async fn get_databases(&self) -> Result<Vec<String>, String>;

    /// Get all schemas (PostgreSQL only, returns empty for MySQL)
    /// For PostgreSQL, database parameter specifies which database to get schemas from
    async fn get_schemas(&self, database: Option<&str>) -> Result<Vec<String>, String>;

    /// Get tables in a database/schema
    /// For PostgreSQL, schema specifies the schema within the database
    async fn get_tables(&self, database: &str, schema: Option<&str>) -> Result<Vec<TableInfo>, String>;

    /// Get table structure with columns and indexes
    async fn get_table_structure(
        &self,
        database: &str,
        table: &str,
    ) -> Result<TableStructure, String>;

    /// Get views in a database/schema
    async fn get_views(&self, database: &str, schema: Option<&str>) -> Result<Vec<ViewInfo>, String>;

    /// Get functions and procedures
    async fn get_routines(&self, database: &str, schema: Option<&str>) -> Result<Vec<RoutineInfo>, String>;

    /// Get database objects count
    async fn get_objects_count(&self, database: &str, schema: Option<&str>) -> Result<DatabaseObjectsCount, String>;

    /// Get table DDL (CREATE TABLE statement)
    async fn get_table_ddl(&self, database: &str, table: &str) -> Result<String, String>;

    /// Rename a table
    async fn rename_table(
        &self,
        database: &str,
        old_name: &str,
        new_name: &str,
    ) -> Result<(), String>;

    /// Drop a table
    async fn drop_table(&self, database: &str, table: &str) -> Result<(), String>;

    /// Get foreign keys for a table
    async fn get_foreign_keys(
        &self,
        database: &str,
        table: &str,
    ) -> Result<Vec<ForeignKeyInfo>, String>;

    /// Get check constraints for a table
    async fn get_check_constraints(
        &self,
        database: &str,
        table: &str,
    ) -> Result<Vec<CheckConstraintInfo>, String>;

    /// Get triggers for a table
    async fn get_triggers(&self, database: &str, table: &str) -> Result<Vec<TriggerInfo>, String>;

    /// Get table options (engine, charset, etc.)
    async fn get_table_options(&self, database: &str, table: &str) -> Result<TableOptions, String>;

    /// Close the connection pool
    async fn close(&self);
}

/// Common helper for building table structure
pub fn build_index_map(
    index_name: String,
    column_name: String,
    is_unique: bool,
    index_type: String,
    map: &mut std::collections::HashMap<String, IndexInfo>,
) {
    map.entry(index_name.clone())
        .and_modify(|idx| idx.columns.push(column_name.clone()))
        .or_insert(IndexInfo {
            name: index_name,
            columns: vec![column_name],
            unique: is_unique,
            index_type,
        });
}

/// Parse column details from raw data
pub fn build_column_detail(
    name: String,
    column_type: String,
    nullable: bool,
    key: Option<String>,
    default_value: Option<String>,
    extra: Option<String>,
    comment: Option<String>,
) -> ColumnDetail {
    ColumnDetail {
        name,
        column_type,
        nullable,
        key,
        default_value,
        extra,
        comment,
    }
}
