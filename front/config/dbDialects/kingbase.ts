/**
 * KingBase (人大金仓) 方言配置
 *
 * KingBase 基于 PostgreSQL 内核，语法与 PostgreSQL 兼容
 * 使用双引号引用标识符（SQL 标准）
 */

import type { DatabaseDialectConfig } from './types'

export const kingbaseDialect: DatabaseDialectConfig = {
  id: 'kingbase',
  name: 'KingBase',

  // 标识符使用双引号（SQL 标准）
  quoteIdentifier: (name: string) => `"${name}"`,
  quoteString: (value: string) => `'${value.replace(/'/g, "''")}'`,

  tableOptions: {
    supportsSchema: true,
    supportsTablespace: true,
    supportsTableComment: true,
    supportsColumnComment: true,
  },

  indexOptions: {
    types: ['BTREE', 'HASH', 'GIN', 'GIST', 'SPGIST', 'BRIN'],
    supportsFulltext: true,  // 通过 GIN 索引
    supportsSpatial: true,   // 通过 GIST 索引
    supportsHash: true,
    supportsUnique: true,
    supportsPartial: true,   // WHERE 子句
    supportsFunctional: true,
  },

  constraintOptions: {
    foreignKeyActions: ['NO ACTION', 'RESTRICT', 'CASCADE', 'SET NULL', 'SET DEFAULT'],
    supportsCheck: true,
    supportsExclude: true,
    supportsNamedConstraints: true,
    supportsDeferrable: true,
  },

  autoIncrement: {
    keyword: 'SERIAL',  // 或 GENERATED ALWAYS AS IDENTITY
    supportsStartWith: true,
    supportsIncrementBy: true,
    usesIdentity: true,
    usesSequence: true,
  },

  comment: {
    inline: false,
    separate: true,  // COMMENT ON TABLE/COLUMN
  },

  syntax: {
    batchSeparator: ';',
    supportsIfNotExists: true,
    supportsCascade: true,
    supportsLimitOffset: true,
    paginationType: 'limit',
    supportsReturning: true,
    supportsUpsert: true, // INSERT ... ON CONFLICT
  },

  defaults: {
    schema: 'public',
  },
}
