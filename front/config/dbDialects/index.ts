/**
 * 数据库方言配置统一入口
 *
 * 提供跨数据库的方言查询和工具函数
 */

import type { DatabaseDialectConfig, DatabaseType } from './types'
import { mysqlDialect } from './mysql'
import { mariadbDialect } from './mariadb'
import { postgresqlDialect } from './postgresql'
import { oracleDialect } from './oracle'
import { mssqlDialect } from './mssql'

// ============================================================================
// 方言映射表
// ============================================================================

/**
 * 数据库类型到方言配置的映射
 */
const dialectMap: Record<DatabaseType, DatabaseDialectConfig> = {
  mysql: mysqlDialect,
  mariadb: mariadbDialect,
  postgresql: postgresqlDialect,
  oracle: oracleDialect,
  mssql: mssqlDialect,
  // 以下数据库类型暂时使用占位符，待后续实现
  sqlite: {
    ...mysqlDialect,
    id: 'sqlite',
    name: 'SQLite',
    quoteIdentifier: (name: string) => `"${name}"`,
    tableOptions: {
      supportsSchema: false,
      supportsTablespace: false,
      supportsTableComment: false,
      supportsColumnComment: false,
    },
    indexOptions: {
      types: ['BTREE'],
      supportsFulltext: true,
      supportsSpatial: false,
      supportsHash: false,
      supportsUnique: true,
      supportsPartial: true,
    },
    autoIncrement: {
      keyword: 'AUTOINCREMENT',
      supportsStartWith: false,
      supportsIncrementBy: false,
    },
    syntax: {
      ...mysqlDialect.syntax,
      supportsIfNotExists: true,
    },
    defaults: {},
  },
}

// ============================================================================
// 查询函数
// ============================================================================

/**
 * 获取指定数据库的方言配置
 * @param dbType 数据库类型
 * @returns 方言配置
 */
export function getDialect(dbType: DatabaseType): DatabaseDialectConfig {
  return dialectMap[dbType] || mysqlDialect
}

/**
 * 获取指定数据库的可用引擎列表
 * @param dbType 数据库类型
 * @returns 引擎列表，如果不支持则返回空数组
 */
export function getEngines(dbType: DatabaseType): string[] {
  return dialectMap[dbType]?.tableOptions.engines || []
}

/**
 * 获取指定数据库的可用字符集列表
 * @param dbType 数据库类型
 * @returns 字符集列表，如果不支持则返回空数组
 */
export function getCharsets(dbType: DatabaseType): string[] {
  return dialectMap[dbType]?.tableOptions.charsets || []
}

/**
 * 获取指定数据库的可用排序规则列表
 * @param dbType 数据库类型
 * @returns 排序规则列表，如果不支持则返回空数组
 */
export function getCollations(dbType: DatabaseType): string[] {
  return dialectMap[dbType]?.tableOptions.collations || []
}

/**
 * 获取指定数据库的索引类型列表
 * @param dbType 数据库类型
 * @returns 索引类型列表
 */
export function getIndexTypes(dbType: DatabaseType): string[] {
  return dialectMap[dbType]?.indexOptions.types || ['BTREE']
}

/**
 * 获取指定数据库的外键操作列表
 * @param dbType 数据库类型
 * @returns 外键操作列表
 */
export function getForeignKeyActions(dbType: DatabaseType): string[] {
  return dialectMap[dbType]?.constraintOptions.foreignKeyActions ||
    ['NO ACTION', 'RESTRICT', 'CASCADE', 'SET NULL']
}

/**
 * 检查指定数据库是否支持 Schema
 * @param dbType 数据库类型
 * @returns 是否支持 Schema
 */
export function supportsSchema(dbType: DatabaseType): boolean {
  return dialectMap[dbType]?.tableOptions.supportsSchema === true
}

/**
 * 检查指定数据库是否支持表注释
 * @param dbType 数据库类型
 * @returns 是否支持表注释
 */
export function supportsTableComment(dbType: DatabaseType): boolean {
  return dialectMap[dbType]?.tableOptions.supportsTableComment === true
}

/**
 * 检查指定数据库是否支持列注释
 * @param dbType 数据库类型
 * @returns 是否支持列注释
 */
export function supportsColumnComment(dbType: DatabaseType): boolean {
  return dialectMap[dbType]?.tableOptions.supportsColumnComment === true
}

/**
 * 检查指定数据库是否支持 CHECK 约束
 * @param dbType 数据库类型
 * @returns 是否支持 CHECK 约束
 */
export function supportsCheckConstraint(dbType: DatabaseType): boolean {
  return dialectMap[dbType]?.constraintOptions.supportsCheck === true
}

/**
 * 获取指定数据库的自增关键字
 * @param dbType 数据库类型
 * @returns 自增关键字
 */
export function getAutoIncrementKeyword(dbType: DatabaseType): string {
  return dialectMap[dbType]?.autoIncrement.keyword || 'AUTO_INCREMENT'
}

/**
 * 检查指定数据库是否使用内联注释语法
 * @param dbType 数据库类型
 * @returns 是否使用内联注释
 */
export function usesInlineComment(dbType: DatabaseType): boolean {
  return dialectMap[dbType]?.comment.inline === true
}

/**
 * 获取指定数据库的默认配置
 * @param dbType 数据库类型
 * @returns 默认配置
 */
export function getDefaults(dbType: DatabaseType): DatabaseDialectConfig['defaults'] {
  return dialectMap[dbType]?.defaults || {}
}

/**
 * 引用标识符
 * @param dbType 数据库类型
 * @param name 标识符名称
 * @returns 引用后的标识符
 */
export function quoteIdentifier(dbType: DatabaseType, name: string): string {
  return dialectMap[dbType]?.quoteIdentifier(name) || `\`${name}\``
}

/**
 * 引用表名（带数据库/Schema 前缀）
 * @param dbType 数据库类型
 * @param database 数据库名或 Schema 名
 * @param table 表名
 * @returns 引用后的完整表名
 */
export function quoteTableName(dbType: DatabaseType, database: string, table: string): string {
  const dialect = dialectMap[dbType]
  const q = dialect?.quoteIdentifier || ((n: string) => `\`${n}\``)
  return `${q(database)}.${q(table)}`
}

// ============================================================================
// 导出
// ============================================================================

export * from './types'
export { mysqlDialect } from './mysql'
export { mariadbDialect } from './mariadb'
export { postgresqlDialect } from './postgresql'
export { oracleDialect } from './oracle'
export { mssqlDialect } from './mssql'
