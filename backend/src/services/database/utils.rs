//! SQL identifier validation and escaping utilities

/// Validate a SQL identifier (database name, table name, schema name).
/// Only allows alphanumeric characters, underscores, dots, and hyphens.
pub fn validate_sql_identifier(name: &str) -> Result<(), String> {
    if name.is_empty() {
        return Err("Identifier cannot be empty".to_string());
    }
    if name.len() > 128 {
        return Err("Identifier too long (max 128 chars)".to_string());
    }
    if !name
        .chars()
        .all(|c| c.is_alphanumeric() || matches!(c, '_' | '.' | '-'))
    {
        return Err(format!(
            "Invalid identifier '{}': contains forbidden characters",
            name
        ));
    }
    if name.starts_with('.') || name.ends_with('.') || name.contains("..") {
        return Err(format!(
            "Invalid identifier '{}': invalid dot placement",
            name
        ));
    }
    Ok(())
}

/// Escape a MySQL/MariaDB/ClickHouse backtick-quoted identifier
pub fn escape_backtick_identifier(name: &str) -> String {
    name.replace('`', "``")
}

/// Escape a PostgreSQL/Oracle/DM/KingBase/SQLite double-quote identifier
pub fn escape_double_quote_identifier(name: &str) -> String {
    name.replace('"', "\"\"")
}

/// Escape a MSSQL bracket-quoted identifier
pub fn escape_bracket_identifier(name: &str) -> String {
    name.replace(']', "]]")
}

/// Maximum number of rows returned by a single query
pub const MAX_QUERY_ROWS: usize = 10_000;
