//! Database service module
//!
//! Provides database connection management using the strategy pattern.
//! Supports MySQL and PostgreSQL with easy extensibility for new databases.

mod mysql;
mod postgresql;
mod session;
mod traits;

pub use session::DatabaseSession;
pub use traits::DatabaseDriver;

use std::collections::HashMap;
use std::sync::Arc;

use parking_lot::RwLock;

use crate::models::{
    CheckConstraintInfo, DatabaseConnectRequest, DatabaseConnectionInfo, DatabaseObjectsCount,
    DatabaseType, ForeignKeyInfo, QueryResult, RoutineInfo, SqlExecuteRequest, TableInfo,
    TableOptions, TableStructure, TableStructureExt, TriggerInfo, ViewInfo,
};

use mysql::MySqlDriver;
use postgresql::PostgreSqlDriver;

/// Database service managing all database connections
pub struct DatabaseService {
    sessions: RwLock<HashMap<String, Arc<DatabaseSession>>>,
}

impl DatabaseService {
    pub fn new() -> Self {
        Self {
            sessions: RwLock::new(HashMap::new()),
        }
    }

    /// Connect to database
    pub async fn connect(
        &self,
        request: DatabaseConnectRequest,
    ) -> Result<DatabaseConnectionInfo, String> {
        let password = request.password.as_deref().unwrap_or("");

        let (driver, schema): (Arc<dyn DatabaseDriver>, Option<String>) = match request.db_type {
            DatabaseType::MySQL => {
                let database = request.database.as_deref().unwrap_or("mysql");
                let driver = MySqlDriver::connect(
                    &request.host,
                    request.port,
                    &request.username,
                    password,
                    database,
                )
                .await?;
                (Arc::new(driver), None)
            }
            DatabaseType::PostgreSQL => {
                let database = request.database.as_deref().unwrap_or("postgres");
                let driver = PostgreSqlDriver::connect(
                    &request.host,
                    request.port,
                    &request.username,
                    password,
                    database,
                )
                .await?;
                (Arc::new(driver), Some("public".to_string()))
            }
            DatabaseType::SQLite => {
                return Err("SQLite is not supported yet".to_string());
            }
        };

        let session = Arc::new(DatabaseSession::new(
            request.connection_id.clone(),
            request.db_type.clone(),
            request.host.clone(),
            request.port,
            request.database.clone(),
            schema,
            driver,
        ));

        self.sessions
            .write()
            .insert(request.connection_id.clone(), session.clone());

        Ok(DatabaseConnectionInfo {
            connection_id: request.connection_id,
            db_type: request.db_type,
            host: request.host,
            port: request.port,
            database: request.database,
            connected_at: session.connected_at.to_rfc3339(),
        })
    }

    /// Disconnect from database
    pub async fn disconnect(&self, connection_id: &str) -> Result<(), String> {
        let session = self.sessions.write().remove(connection_id);
        if let Some(session) = session {
            session.driver.close().await;
            Ok(())
        } else {
            Err("Connection not found".to_string())
        }
    }

    /// Test database connection
    pub async fn test_connection(&self, request: DatabaseConnectRequest) -> Result<(), String> {
        let password = request.password.as_deref().unwrap_or("");

        match request.db_type {
            DatabaseType::MySQL => {
                let database = request.database.as_deref().unwrap_or("mysql");
                MySqlDriver::test_connection(
                    &request.host,
                    request.port,
                    &request.username,
                    password,
                    database,
                )
                .await
            }
            DatabaseType::PostgreSQL => {
                let database = request.database.as_deref().unwrap_or("postgres");
                PostgreSqlDriver::test_connection(
                    &request.host,
                    request.port,
                    &request.username,
                    password,
                    database,
                )
                .await
            }
            DatabaseType::SQLite => Err("SQLite is not supported yet".to_string()),
        }
    }

    /// Execute SQL query
    pub async fn execute_sql(&self, request: SqlExecuteRequest) -> Result<QueryResult, String> {
        let session = self.get_session(&request.connection_id)?;

        let sql = request.sql.trim();
        let sql_upper = sql.to_uppercase();
        let is_select = sql_upper.starts_with("SELECT")
            || sql_upper.starts_with("SHOW")
            || sql_upper.starts_with("DESCRIBE")
            || sql_upper.starts_with("EXPLAIN")
            || sql_upper.starts_with("\\D");

        if is_select {
            session.driver.execute_query(sql).await
        } else {
            session.driver.execute_update(sql).await
        }
    }

    /// Get all databases
    pub async fn get_databases(&self, connection_id: &str) -> Result<Vec<String>, String> {
        let session = self.get_session(connection_id)?;
        session.driver.get_databases().await
    }

    /// Get all schemas (PostgreSQL only)
    pub async fn get_schemas(&self, connection_id: &str, database: Option<&str>) -> Result<Vec<String>, String> {
        let session = self.get_session(connection_id)?;
        session.driver.get_schemas(database).await
    }

    /// Get tables in a database/schema
    pub async fn get_tables(
        &self,
        connection_id: &str,
        database: &str,
        schema: Option<&str>,
    ) -> Result<Vec<TableInfo>, String> {
        let session = self.get_session(connection_id)?;
        session.driver.get_tables(database, schema).await
    }

    /// Get table structure
    pub async fn get_table_structure(
        &self,
        connection_id: &str,
        database: &str,
        table: &str,
    ) -> Result<TableStructure, String> {
        let session = self.get_session(connection_id)?;
        session.driver.get_table_structure(database, table).await
    }

    /// Get views in a database/schema
    pub async fn get_views(
        &self,
        connection_id: &str,
        database: &str,
        schema: Option<&str>,
    ) -> Result<Vec<ViewInfo>, String> {
        let session = self.get_session(connection_id)?;
        session.driver.get_views(database, schema).await
    }

    /// Get functions and procedures
    pub async fn get_routines(
        &self,
        connection_id: &str,
        database: &str,
        schema: Option<&str>,
    ) -> Result<Vec<RoutineInfo>, String> {
        let session = self.get_session(connection_id)?;
        session.driver.get_routines(database, schema).await
    }

    /// Get database objects count
    pub async fn get_objects_count(
        &self,
        connection_id: &str,
        database: &str,
        schema: Option<&str>,
    ) -> Result<DatabaseObjectsCount, String> {
        let session = self.get_session(connection_id)?;
        session.driver.get_objects_count(database, schema).await
    }

    /// Get table DDL
    pub async fn get_table_ddl(
        &self,
        connection_id: &str,
        database: &str,
        table: &str,
    ) -> Result<String, String> {
        let session = self.get_session(connection_id)?;
        session.driver.get_table_ddl(database, table).await
    }

    /// Rename a table
    pub async fn rename_table(
        &self,
        connection_id: &str,
        database: &str,
        old_name: &str,
        new_name: &str,
    ) -> Result<(), String> {
        let session = self.get_session(connection_id)?;
        session
            .driver
            .rename_table(database, old_name, new_name)
            .await
    }

    /// Drop a table
    pub async fn drop_table(
        &self,
        connection_id: &str,
        database: &str,
        table: &str,
    ) -> Result<(), String> {
        let session = self.get_session(connection_id)?;
        session.driver.drop_table(database, table).await
    }

    /// Get foreign keys for a table
    pub async fn get_foreign_keys(
        &self,
        connection_id: &str,
        database: &str,
        table: &str,
    ) -> Result<Vec<ForeignKeyInfo>, String> {
        let session = self.get_session(connection_id)?;
        session.driver.get_foreign_keys(database, table).await
    }

    /// Get check constraints for a table
    pub async fn get_check_constraints(
        &self,
        connection_id: &str,
        database: &str,
        table: &str,
    ) -> Result<Vec<CheckConstraintInfo>, String> {
        let session = self.get_session(connection_id)?;
        session.driver.get_check_constraints(database, table).await
    }

    /// Get triggers for a table
    pub async fn get_triggers(
        &self,
        connection_id: &str,
        database: &str,
        table: &str,
    ) -> Result<Vec<TriggerInfo>, String> {
        let session = self.get_session(connection_id)?;
        session.driver.get_triggers(database, table).await
    }

    /// Get table options
    pub async fn get_table_options(
        &self,
        connection_id: &str,
        database: &str,
        table: &str,
    ) -> Result<TableOptions, String> {
        let session = self.get_session(connection_id)?;
        session.driver.get_table_options(database, table).await
    }

    /// Get extended table structure with all details
    pub async fn get_table_structure_ext(
        &self,
        connection_id: &str,
        database: &str,
        table: &str,
    ) -> Result<TableStructureExt, String> {
        let basic = self.get_table_structure(connection_id, database, table).await?;
        let foreign_keys = self.get_foreign_keys(connection_id, database, table).await?;
        let check_constraints = self
            .get_check_constraints(connection_id, database, table)
            .await?;
        let triggers = self.get_triggers(connection_id, database, table).await?;
        let options = self.get_table_options(connection_id, database, table).await?;

        Ok(TableStructureExt {
            database: basic.database,
            table_name: basic.table_name,
            columns: basic.columns,
            indexes: basic.indexes,
            foreign_keys,
            check_constraints,
            triggers,
            options,
        })
    }

    /// Check if connection exists
    pub fn is_connected(&self, connection_id: &str) -> bool {
        self.sessions.read().contains_key(connection_id)
    }

    /// Get session by connection ID
    fn get_session(&self, connection_id: &str) -> Result<Arc<DatabaseSession>, String> {
        self.sessions
            .read()
            .get(connection_id)
            .cloned()
            .ok_or_else(|| "Connection not found".to_string())
    }
}

impl Default for DatabaseService {
    fn default() -> Self {
        Self::new()
    }
}
