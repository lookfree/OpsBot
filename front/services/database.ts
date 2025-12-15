/**
 * Database service for MySQL connections
 */

import { invoke } from '@tauri-apps/api/core'

// Database types
export type DatabaseType = 'mysql' | 'postgresql' | 'sqlite'

// Connect request
export interface DatabaseConnectRequest {
  connectionId: string
  dbType: DatabaseType
  host: string
  port: number
  username: string
  password?: string
  database?: string
}

// Connection info
export interface DatabaseConnectionInfo {
  connectionId: string
  dbType: DatabaseType
  host: string
  port: number
  database?: string
  connectedAt: string
}

// SQL execute request
export interface SqlExecuteRequest {
  connectionId: string
  sql: string
  database?: string
}

// Query column
export interface QueryColumn {
  name: string
  columnType: string
  nullable: boolean
}

// Query result
export interface QueryResult {
  columns: QueryColumn[]
  rows: unknown[][]
  affectedRows: number
  executionTimeMs: number
}

// Table info
export interface TableInfo {
  name: string
  tableType: string
  rowCount?: number
}

// Column detail
export interface ColumnDetail {
  name: string
  columnType: string
  nullable: boolean
  key?: string
  defaultValue?: string
  extra?: string
  comment?: string
}

// Index info
export interface IndexInfo {
  name: string
  columns: string[]
  unique: boolean
  indexType: string
}

// Table structure
export interface TableStructure {
  database: string
  tableName: string
  columns: ColumnDetail[]
  indexes: IndexInfo[]
}

// View info
export interface ViewInfo {
  name: string
  definer?: string
  securityType?: string
}

// Routine (function/procedure) info
export interface RoutineInfo {
  name: string
  routineType: string // FUNCTION or PROCEDURE
  definer?: string
  created?: string
}

// Database objects count
export interface DatabaseObjectsCount {
  tables: number
  views: number
  functions: number
  procedures: number
}

// Foreign key info
export interface ForeignKeyInfo {
  name: string
  column: string
  refTable: string
  refColumn: string
  onDelete: string
  onUpdate: string
}

// Check constraint info
export interface CheckConstraintInfo {
  name: string
  expression: string
}

// Trigger info
export interface TriggerInfo {
  name: string
  event: string      // INSERT, UPDATE, DELETE
  timing: string     // BEFORE, AFTER
  statement: string
  created?: string
}

// Table options (advanced settings)
export interface TableOptions {
  engine: string
  charset: string
  collation: string
  comment: string
  autoIncrement?: number
  rowFormat?: string
}

// Extended table structure with all details
export interface TableStructureExt {
  database: string
  tableName: string
  columns: ColumnDetail[]
  indexes: IndexInfo[]
  foreignKeys: ForeignKeyInfo[]
  checkConstraints: CheckConstraintInfo[]
  triggers: TriggerInfo[]
  options: TableOptions
}

/**
 * Connect to database
 */
export async function dbConnect(request: DatabaseConnectRequest): Promise<DatabaseConnectionInfo> {
  return invoke<DatabaseConnectionInfo>('db_connect', { request })
}

/**
 * Disconnect from database
 */
export async function dbDisconnect(connectionId: string): Promise<void> {
  return invoke('db_disconnect', { connectionId })
}

/**
 * Test database connection
 */
export async function dbTestConnection(request: DatabaseConnectRequest): Promise<void> {
  return invoke('db_test_connection', { request })
}

/**
 * Check if connection is active
 */
export async function dbIsConnected(connectionId: string): Promise<boolean> {
  return invoke<boolean>('db_is_connected', { connectionId })
}

/**
 * Execute SQL query
 */
export async function dbExecuteSql(request: SqlExecuteRequest): Promise<QueryResult> {
  return invoke<QueryResult>('db_execute_sql', { request })
}

/**
 * Get all databases
 */
export async function dbGetDatabases(connectionId: string): Promise<string[]> {
  return invoke<string[]>('db_get_databases', { connectionId })
}

/**
 * Get tables in a database
 */
export async function dbGetTables(connectionId: string, database: string): Promise<TableInfo[]> {
  return invoke<TableInfo[]>('db_get_tables', { connectionId, database })
}

/**
 * Get table structure
 */
export async function dbGetTableStructure(
  connectionId: string,
  database: string,
  table: string
): Promise<TableStructure> {
  return invoke<TableStructure>('db_get_table_structure', { connectionId, database, table })
}

/**
 * Get views in a database
 */
export async function dbGetViews(connectionId: string, database: string): Promise<ViewInfo[]> {
  return invoke<ViewInfo[]>('db_get_views', { connectionId, database })
}

/**
 * Get functions and procedures in a database
 */
export async function dbGetRoutines(connectionId: string, database: string): Promise<RoutineInfo[]> {
  return invoke<RoutineInfo[]>('db_get_routines', { connectionId, database })
}

/**
 * Get database objects count
 */
export async function dbGetObjectsCount(
  connectionId: string,
  database: string
): Promise<DatabaseObjectsCount> {
  return invoke<DatabaseObjectsCount>('db_get_objects_count', { connectionId, database })
}

/**
 * Get table DDL
 */
export async function dbGetTableDdl(
  connectionId: string,
  database: string,
  table: string
): Promise<string> {
  return invoke<string>('db_get_table_ddl', { connectionId, database, table })
}

/**
 * Rename a table
 */
export async function dbRenameTable(
  connectionId: string,
  database: string,
  oldName: string,
  newName: string
): Promise<void> {
  return invoke('db_rename_table', { connectionId, database, oldName, newName })
}

/**
 * Drop a table
 */
export async function dbDropTable(
  connectionId: string,
  database: string,
  table: string
): Promise<void> {
  return invoke('db_drop_table', { connectionId, database, table })
}

/**
 * Get foreign keys for a table
 */
export async function dbGetForeignKeys(
  connectionId: string,
  database: string,
  table: string
): Promise<ForeignKeyInfo[]> {
  return invoke<ForeignKeyInfo[]>('db_get_foreign_keys', { connectionId, database, table })
}

/**
 * Get check constraints for a table
 */
export async function dbGetCheckConstraints(
  connectionId: string,
  database: string,
  table: string
): Promise<CheckConstraintInfo[]> {
  return invoke<CheckConstraintInfo[]>('db_get_check_constraints', { connectionId, database, table })
}

/**
 * Get triggers for a table
 */
export async function dbGetTriggers(
  connectionId: string,
  database: string,
  table: string
): Promise<TriggerInfo[]> {
  return invoke<TriggerInfo[]>('db_get_triggers', { connectionId, database, table })
}

/**
 * Get table options
 */
export async function dbGetTableOptions(
  connectionId: string,
  database: string,
  table: string
): Promise<TableOptions> {
  return invoke<TableOptions>('db_get_table_options', { connectionId, database, table })
}

/**
 * Get extended table structure with all details
 */
export async function dbGetTableStructureExt(
  connectionId: string,
  database: string,
  table: string
): Promise<TableStructureExt> {
  return invoke<TableStructureExt>('db_get_table_structure_ext', { connectionId, database, table })
}
