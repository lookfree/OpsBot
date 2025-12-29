/**
 * 达梦 (DM) 数据库方言配置
 *
 * 达梦数据库高度兼容 Oracle，语法和特性配置类似：
 * - 双引号标识符引用
 * - IDENTITY 自增列
 * - COMMENT ON 语句（分离式注释）
 * - Schema 支持（Schema = 用户）
 * - 支持 LIMIT/OFFSET 语法（比 Oracle 更灵活）
 */

import type { DatabaseDialectConfig } from './types'

export const dmDialect: DatabaseDialectConfig = {
  id: 'dm',
  name: '达梦',

  // 达梦使用双引号引用标识符（与 Oracle 一致）
  quoteIdentifier: (name: string) => `"${name}"`,
  quoteString: (value: string) => `'${value.replace(/'/g, "''")}'`,

  tableOptions: {
    // 达梦没有存储引擎概念
    engines: undefined,
    // 达梦使用数据库级别字符集设置
    charsets: undefined,
    collations: undefined,
    // 达梦支持 Schema（用户模式）
    supportsSchema: true,
    // 达梦支持表空间
    supportsTablespace: true,
    // 达梦通过 COMMENT ON 支持注释
    supportsTableComment: true,
    supportsColumnComment: true,
  },

  indexOptions: {
    // 达梦索引类型
    types: ['BTREE', 'BITMAP', 'CLUSTER'],
    supportsFulltext: true,   // 达梦全文索引
    supportsSpatial: true,    // 达梦空间索引
    supportsHash: false,      // 达梦不直接支持 HASH 索引
    supportsUnique: true,
    supportsPartial: false,   // 达梦使用函数索引替代
    supportsFunctional: true, // 支持函数索引
  },

  constraintOptions: {
    // 达梦外键操作
    foreignKeyActions: ['NO ACTION', 'CASCADE', 'SET NULL', 'RESTRICT'],
    supportsCheck: true,
    supportsExclude: false,
    supportsNamedConstraints: true,
    // 达梦支持延迟约束
    supportsDeferrable: true,
  },

  autoIncrement: {
    // 达梦 IDENTITY 语法
    keyword: 'IDENTITY',
    supportsStartWith: true,
    supportsIncrementBy: true,
    usesIdentity: true,
    // 达梦也支持序列
    usesSequence: true,
  },

  comment: {
    // 达梦不支持内联注释，必须使用 COMMENT ON 语句
    inline: false,
    separate: true,
  },

  syntax: {
    // 达梦使用分号分隔语句
    batchSeparator: ';',
    // 达梦支持 IF NOT EXISTS（部分场景）
    supportsIfNotExists: true,
    // 达梦支持 CASCADE
    supportsCascade: true,
    // 达梦支持 LIMIT/OFFSET（比 Oracle 更灵活）
    supportsLimitOffset: true,
    // 达梦使用 LIMIT 语法
    paginationType: 'limit',
    // 达梦支持 RETURNING
    supportsReturning: true,
    // 达梦支持 MERGE 语句
    supportsUpsert: true,
  },

  defaults: {
    // 达梦默认使用用户名作为 Schema
    schema: undefined,
  },
}
