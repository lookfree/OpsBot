/**
 * Oracle 方言配置
 *
 * Oracle Database 的语法和特性配置，包括：
 * - 双引号标识符引用
 * - IDENTITY 列（12c+）
 * - COMMENT ON 语句
 * - Schema 和 Tablespace 支持
 * - FETCH 分页语法
 */

import type { DatabaseDialectConfig } from './types'

export const oracleDialect: DatabaseDialectConfig = {
  id: 'oracle',
  name: 'Oracle',

  // Oracle 使用双引号引用标识符
  quoteIdentifier: (name: string) => `"${name}"`,
  quoteString: (value: string) => `'${value.replace(/'/g, "''")}'`,

  tableOptions: {
    // Oracle 没有存储引擎概念
    engines: undefined,
    // Oracle 没有表级字符集，使用数据库级别 NLS 设置
    charsets: undefined,
    collations: undefined,
    // Oracle 支持 Schema (用户)
    supportsSchema: true,
    // Oracle 支持表空间
    supportsTablespace: true,
    // Oracle 通过 COMMENT ON 支持注释
    supportsTableComment: true,
    supportsColumnComment: true,
  },

  indexOptions: {
    // Oracle 索引类型
    types: ['BTREE', 'BITMAP', 'FUNCTION-BASED'],
    supportsFulltext: true,  // Oracle Text
    supportsSpatial: true,   // Oracle Spatial
    supportsHash: false,     // Oracle 不直接支持 HASH 索引类型
    supportsUnique: true,
    supportsPartial: false,  // Oracle 使用函数索引替代
    supportsFunctional: true,
  },

  constraintOptions: {
    // Oracle 外键操作 - 注意：不支持 ON UPDATE CASCADE
    foreignKeyActions: ['NO ACTION', 'CASCADE', 'SET NULL'],
    supportsCheck: true,
    supportsExclude: false,
    supportsNamedConstraints: true,
    // Oracle 支持延迟约束
    supportsDeferrable: true,
  },

  autoIncrement: {
    // Oracle 12c+ IDENTITY 语法
    keyword: 'GENERATED ALWAYS AS IDENTITY',
    supportsStartWith: true,
    supportsIncrementBy: true,
    usesIdentity: true,
    // Oracle 也支持传统的序列方式
    usesSequence: true,
  },

  comment: {
    // Oracle 不支持内联注释，必须使用 COMMENT ON 语句
    inline: false,
    separate: true,
  },

  syntax: {
    // Oracle 使用 / 作为 PL/SQL 块分隔符
    batchSeparator: '/',
    // Oracle 不支持 IF NOT EXISTS（需要 PL/SQL 异常处理）
    supportsIfNotExists: false,
    // Oracle 支持 CASCADE CONSTRAINTS
    supportsCascade: true,
    // Oracle 不支持 LIMIT/OFFSET
    supportsLimitOffset: false,
    // Oracle 12c+ 使用 FETCH 语法，旧版本使用 ROWNUM
    paginationType: 'fetch',
    // Oracle 支持 RETURNING INTO
    supportsReturning: true,
    // Oracle 支持 MERGE 语句
    supportsUpsert: true,
  },

  defaults: {
    // Oracle 默认使用用户名作为 Schema
    schema: undefined,
  },
}
