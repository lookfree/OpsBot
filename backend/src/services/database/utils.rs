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

/// Escape a value destined for a single-quoted SQL string literal by doubling
/// embedded single quotes. Use for values interpolated into `'...'` (metadata
/// filters, names compared as strings) that cannot be sent as bind parameters.
pub fn escape_string_literal(value: &str) -> String {
    value.replace('\'', "''")
}

/// Maximum number of rows returned by a single query
pub const MAX_QUERY_ROWS: usize = 10_000;

/// Strip leading whitespace and SQL comments (`-- ...` and `/* ... */`).
fn strip_leading_sql_comments(sql: &str) -> &str {
    let mut rest = sql.trim_start();
    loop {
        if let Some(after) = rest.strip_prefix("--") {
            rest = after.split_once('\n').map(|(_, tail)| tail).unwrap_or("");
        } else if let Some(after) = rest.strip_prefix("/*") {
            match after.find("*/") {
                Some(end) => rest = &after[end + 2..],
                None => return "",
            }
        } else {
            return rest;
        }
        rest = rest.trim_start();
    }
}

/// Whether a statement returns rows and should run through the query path
/// (fetch) rather than the update path (execute, rows discarded).
/// `WITH` can also head a data-modifying CTE, but treating it as a query is
/// the safe direction — fetch executes it and keeps any RETURNING rows.
pub fn is_row_returning_sql(sql: &str) -> bool {
    let body = strip_leading_sql_comments(sql);
    let first_word: String = body
        .chars()
        .take_while(|c| !c.is_whitespace() && *c != '(' && *c != ';')
        .collect::<String>()
        .to_uppercase();
    matches!(
        first_word.as_str(),
        "SELECT" | "SHOW" | "DESCRIBE" | "DESC" | "EXPLAIN" | "WITH" | "VALUES" | "TABLE" | "PRAGMA"
    ) || body.starts_with("\\d")
        || body.starts_with("\\D")
}

#[cfg(test)]
mod tests {
    use super::{escape_string_literal, is_row_returning_sql};

    #[test]
    fn escapes_single_quotes_in_literals() {
        assert_eq!(escape_string_literal("O'Brien"), "O''Brien");
        assert_eq!(escape_string_literal("x' OR '1'='1"), "x'' OR ''1''=''1");
        assert_eq!(escape_string_literal("plain"), "plain");
        assert_eq!(escape_string_literal("''"), "''''");
    }

    #[test]
    fn classifies_plain_statements() {
        assert!(is_row_returning_sql("SELECT 1"));
        assert!(is_row_returning_sql("  show tables"));
        assert!(is_row_returning_sql("EXPLAIN SELECT * FROM t"));
        assert!(!is_row_returning_sql("UPDATE t SET a = 1"));
        assert!(!is_row_returning_sql("INSERT INTO t VALUES (1)"));
        assert!(!is_row_returning_sql("DROP TABLE t"));
    }

    #[test]
    fn classifies_cte_values_and_table() {
        assert!(is_row_returning_sql("WITH recent AS (SELECT 1) SELECT * FROM recent"));
        assert!(is_row_returning_sql("VALUES (1), (2)"));
        assert!(is_row_returning_sql("TABLE my_table"));
    }

    #[test]
    fn skips_leading_comments() {
        assert!(is_row_returning_sql("-- note\nSELECT 1"));
        assert!(is_row_returning_sql("/* block */ SELECT 1"));
        assert!(is_row_returning_sql("/* a */\n-- b\n  SELECT 1"));
        assert!(!is_row_returning_sql("-- note\nDELETE FROM t"));
        assert!(!is_row_returning_sql("-- only a comment"));
        assert!(!is_row_returning_sql("/* unterminated"));
    }
}
