/**
 * MySQL 方言配置
 */

import type { DatabaseDialectConfig } from './types'

export const mysqlDialect: DatabaseDialectConfig = {
  id: 'mysql',
  name: 'MySQL',

  // 标识符使用反引号
  quoteIdentifier: (name: string) => `\`${name}\``,
  quoteString: (value: string) => `'${value.replace(/'/g, "''")}'`,

  tableOptions: {
    engines: ['InnoDB', 'MyISAM', 'MEMORY', 'CSV', 'ARCHIVE', 'BLACKHOLE', 'MERGE', 'FEDERATED'],
    charsets: ['utf8mb4', 'utf8', 'latin1', 'gbk', 'gb2312', 'big5', 'binary', 'ascii'],
    collations: [
      'utf8mb4_general_ci',
      'utf8mb4_unicode_ci',
      'utf8mb4_bin',
      'utf8mb4_0900_ai_ci',
      'utf8_general_ci',
      'utf8_unicode_ci',
      'latin1_swedish_ci',
      'gbk_chinese_ci',
    ],
    supportsSchema: false,
    supportsTablespace: false,
    supportsTableComment: true,
    supportsColumnComment: true,
  },

  indexOptions: {
    types: ['BTREE', 'HASH'],
    supportsFulltext: true,
    supportsSpatial: true,
    supportsHash: true,
    supportsUnique: true,
    supportsPartial: false,
    supportsFunctional: true, // MySQL 8.0+
  },

  constraintOptions: {
    foreignKeyActions: ['NO ACTION', 'RESTRICT', 'CASCADE', 'SET NULL', 'SET DEFAULT'],
    supportsCheck: true, // MySQL 8.0.16+
    supportsExclude: false,
    supportsNamedConstraints: true,
    supportsDeferrable: false,
  },

  autoIncrement: {
    keyword: 'AUTO_INCREMENT',
    supportsStartWith: true,
    supportsIncrementBy: true,
    usesIdentity: false,
    usesSequence: false,
  },

  comment: {
    inline: true,  // COMMENT 'xxx'
    separate: false,
  },

  syntax: {
    batchSeparator: ';',
    supportsIfNotExists: true,
    supportsCascade: true,
    supportsLimitOffset: true,
    paginationType: 'limit',
    supportsReturning: false,
    supportsUpsert: true, // INSERT ... ON DUPLICATE KEY UPDATE
  },

  defaults: {
    engine: 'InnoDB',
    charset: 'utf8mb4',
    collation: 'utf8mb4_general_ci',
  },
}
