/**
 * ClickHouse 方言配置
 *
 * ClickHouse 是一个列式 OLAP 数据库，具有独特的表引擎系统和 SQL 语法。
 * 主要特点：
 * - MergeTree 系列引擎是核心
 * - ORDER BY 是表定义的必需部分（MergeTree 引擎）
 * - 不支持传统的外键和 CHECK 约束
 * - 不支持传统的自增，使用 generateUUIDv4() 或物化列
 */

import type { DatabaseDialectConfig } from './types'

export const clickhouseDialect: DatabaseDialectConfig = {
  id: 'clickhouse',
  name: 'ClickHouse',

  // 标识符使用反引号（也支持双引号，但反引号更常用）
  quoteIdentifier: (name: string) => `\`${name}\``,
  quoteString: (value: string) => `'${value.replace(/'/g, "''")}'`,

  tableOptions: {
    // ClickHouse 表引擎
    engines: [
      // MergeTree 系列（最常用）
      'MergeTree',
      'ReplacingMergeTree',
      'SummingMergeTree',
      'AggregatingMergeTree',
      'CollapsingMergeTree',
      'VersionedCollapsingMergeTree',
      'GraphiteMergeTree',
      // Log 系列（简单存储）
      'Log',
      'TinyLog',
      'StripeLog',
      // 特殊引擎
      'Memory',
      'Buffer',
      'Null',
      'Set',
      'Join',
      'URL',
      'File',
      'Distributed',
      'MaterializedView',
      'Dictionary',
      'Merge',
      // 外部集成
      'MySQL',
      'PostgreSQL',
      'JDBC',
      'ODBC',
      'HDFS',
      'S3',
      'Kafka',
      'RabbitMQ',
    ],
    // ClickHouse 不使用传统字符集，字符串默认 UTF-8
    charsets: undefined,
    collations: undefined,
    supportsSchema: false, // ClickHouse 使用数据库，不使用 Schema
    supportsTablespace: false,
    supportsTableComment: true,
    supportsColumnComment: true,
  },

  indexOptions: {
    // ClickHouse 索引类型
    types: [
      'minmax',      // 最小最大值索引
      'set',         // 集合索引
      'bloom_filter', // 布隆过滤器
      'tokenbf_v1',  // Token 布隆过滤器
      'ngrambf_v1',  // N-gram 布隆过滤器
    ],
    supportsFulltext: false, // 使用 tokenbf_v1 或 ngrambf_v1 代替
    supportsSpatial: false,
    supportsHash: false,
    supportsUnique: false, // ClickHouse 没有唯一索引约束
    supportsPartial: false,
    supportsFunctional: true, // 支持表达式索引
  },

  constraintOptions: {
    // ClickHouse 不支持外键
    foreignKeyActions: [],
    supportsCheck: false, // ClickHouse 不支持传统 CHECK 约束
    supportsExclude: false,
    supportsNamedConstraints: false,
    supportsDeferrable: false,
  },

  autoIncrement: {
    // ClickHouse 不支持传统自增
    keyword: '', // 无自增关键字
    supportsStartWith: false,
    supportsIncrementBy: false,
    usesIdentity: false,
    usesSequence: false,
  },

  comment: {
    inline: true,  // COMMENT 'xxx' 语法
    separate: false,
  },

  syntax: {
    batchSeparator: ';',
    supportsIfNotExists: true,
    supportsCascade: false, // ClickHouse 不支持 CASCADE
    supportsLimitOffset: true,
    paginationType: 'limit',
    supportsReturning: false,
    supportsUpsert: false, // 使用 ReplacingMergeTree 实现类似功能
  },

  defaults: {
    engine: 'MergeTree',
    charset: undefined,
    collation: undefined,
  },
}
