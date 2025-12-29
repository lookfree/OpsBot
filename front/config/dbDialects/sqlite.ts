/**
 * SQLite 方言配置
 *
 * SQLite 是一个轻量级嵌入式数据库，不需要服务器进程。
 * 它使用单个文件存储整个数据库，支持大部分 SQL 标准。
 */

import type { DatabaseDialectConfig } from './types'

export const sqliteDialect: DatabaseDialectConfig = {
  id: 'sqlite',
  name: 'SQLite',

  // 标识符使用双引号（SQL 标准）
  quoteIdentifier: (name: string) => `"${name}"`,
  quoteString: (value: string) => `'${value.replace(/'/g, "''")}'`,

  tableOptions: {
    // SQLite 无存储引擎概念
    engines: [],
    // SQLite 默认使用 UTF-8
    charsets: [],
    // SQLite 排序规则
    collations: ['BINARY', 'NOCASE', 'RTRIM'],
    // SQLite 无 Schema 概念（虽然可以 ATTACH 其他数据库）
    supportsSchema: false,
    // SQLite 无表空间概念
    supportsTablespace: false,
    // SQLite 不支持表注释
    supportsTableComment: false,
    // SQLite 不支持列注释
    supportsColumnComment: false,
  },

  indexOptions: {
    // SQLite 仅支持 B-tree 索引
    types: ['BTREE'],
    // SQLite 支持全文索引 (FTS)
    supportsFulltext: true,
    // SQLite R*Tree 扩展支持空间索引
    supportsSpatial: true,
    // SQLite 不支持哈希索引
    supportsHash: false,
    // SQLite 支持唯一索引
    supportsUnique: true,
    // SQLite 支持部分索引 (WHERE 子句)
    supportsPartial: true,
    // SQLite 不支持函数索引
    supportsFunctional: false,
  },

  constraintOptions: {
    // 外键操作
    foreignKeyActions: ['NO ACTION', 'RESTRICT', 'CASCADE', 'SET NULL', 'SET DEFAULT'],
    // SQLite 支持 CHECK 约束
    supportsCheck: true,
    // SQLite 不支持 EXCLUDE 约束
    supportsExclude: false,
    // SQLite 支持命名约束
    supportsNamedConstraints: true,
    // SQLite 不支持延迟约束
    supportsDeferrable: false,
  },

  autoIncrement: {
    // SQLite 使用 AUTOINCREMENT 关键字
    // 注意：INTEGER PRIMARY KEY 自动具有自增特性
    keyword: 'AUTOINCREMENT',
    // SQLite 不支持指定起始值（可通过 sqlite_sequence 表修改）
    supportsStartWith: false,
    // SQLite 不支持指定步长
    supportsIncrementBy: false,
    // SQLite 不使用 IDENTITY 语法
    usesIdentity: false,
    // SQLite 不使用序列
    usesSequence: false,
  },

  comment: {
    // SQLite 不支持内联注释
    inline: false,
    // SQLite 不支持单独的 COMMENT ON 语句
    separate: false,
  },

  syntax: {
    // SQLite 使用分号分隔语句
    batchSeparator: ';',
    // SQLite 支持 IF NOT EXISTS
    supportsIfNotExists: true,
    // SQLite 不支持 CASCADE/RESTRICT 用于 DROP TABLE（但外键支持）
    supportsCascade: false,
    // SQLite 支持 LIMIT/OFFSET
    supportsLimitOffset: true,
    // SQLite 使用 LIMIT 语法分页
    paginationType: 'limit',
    // SQLite 3.35+ 支持 RETURNING 子句
    supportsReturning: true,
    // SQLite 支持 UPSERT (INSERT ... ON CONFLICT)
    supportsUpsert: true,
  },

  defaults: {
    // SQLite 无引擎概念
    engine: undefined,
    // SQLite 默认使用 UTF-8
    charset: 'UTF-8',
    // SQLite 默认排序规则
    collation: 'BINARY',
    // SQLite 默认 schema 是 "main"
    schema: 'main',
  },
}
