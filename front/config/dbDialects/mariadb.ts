/**
 * MariaDB 方言配置
 *
 * MariaDB 是 MySQL 的开源分支，语法高度兼容 MySQL，
 * 但有一些独特的存储引擎和功能特性。
 */

import type { DatabaseDialectConfig } from './types'

export const mariadbDialect: DatabaseDialectConfig = {
  id: 'mariadb',
  name: 'MariaDB',

  // 标识符使用反引号（与 MySQL 相同）
  quoteIdentifier: (name: string) => `\`${name}\``,
  quoteString: (value: string) => `'${value.replace(/'/g, "''")}'`,

  tableOptions: {
    // MariaDB 特有引擎和 MySQL 兼容引擎
    engines: [
      'InnoDB', // 默认事务引擎
      'Aria', // MariaDB 增强的崩溃安全引擎（替代 MyISAM）
      'MyISAM', // 传统非事务引擎
      'MEMORY', // 内存表
      'ColumnStore', // 列式存储分析引擎
      'CONNECT', // 外部数据访问引擎
      'Spider', // 分片引擎
      'S3', // Amazon S3 存储引擎
      'ARCHIVE', // 归档压缩存储
      'CSV', // CSV 文件存储
      'BLACKHOLE', // 黑洞引擎（用于复制）
      'MERGE', // 合并表引擎
    ],
    charsets: ['utf8mb4', 'utf8', 'latin1', 'gbk', 'gb2312', 'big5', 'binary', 'ascii'],
    collations: [
      'utf8mb4_uca1400_ai_ci', // MariaDB 10.10+ 默认
      'utf8mb4_general_ci',
      'utf8mb4_unicode_ci',
      'utf8mb4_bin',
      'utf8mb4_unicode_520_ci',
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
    types: ['BTREE', 'HASH', 'RTREE'],
    supportsFulltext: true,
    supportsSpatial: true,
    supportsHash: true,
    supportsUnique: true,
    supportsPartial: false,
    supportsFunctional: true, // MariaDB 10.2+
  },

  constraintOptions: {
    foreignKeyActions: ['NO ACTION', 'RESTRICT', 'CASCADE', 'SET NULL', 'SET DEFAULT'],
    supportsCheck: true, // MariaDB 10.2.1+
    supportsExclude: false,
    supportsNamedConstraints: true,
    supportsDeferrable: false,
  },

  autoIncrement: {
    keyword: 'AUTO_INCREMENT',
    supportsStartWith: true,
    supportsIncrementBy: true,
    usesIdentity: false,
    usesSequence: true, // MariaDB 10.3+ 支持 SEQUENCE
  },

  comment: {
    inline: true, // COMMENT 'xxx'
    separate: false,
  },

  syntax: {
    batchSeparator: ';',
    supportsIfNotExists: true,
    supportsCascade: true,
    supportsLimitOffset: true,
    paginationType: 'limit',
    supportsReturning: true, // MariaDB 10.5+
    supportsUpsert: true, // INSERT ... ON DUPLICATE KEY UPDATE
  },

  defaults: {
    engine: 'InnoDB',
    charset: 'utf8mb4',
    collation: 'utf8mb4_general_ci',
  },
}
