/**
 * SQL Server (T-SQL) 方言配置
 *
 * Microsoft SQL Server 的语法和特性配置，包括：
 * - 方括号标识符引用 [name]
 * - IDENTITY 自增语法
 * - sp_addextendedproperty 扩展属性（注释）
 * - Schema 支持（默认 dbo）
 * - GO 批处理分隔符
 * - OFFSET FETCH 分页语法
 */

import type { DatabaseDialectConfig } from './types'

export const mssqlDialect: DatabaseDialectConfig = {
  id: 'mssql',
  name: 'SQL Server',

  // SQL Server 使用方括号引用标识符
  quoteIdentifier: (name: string) => `[${name}]`,
  quoteString: (value: string) => `'${value.replace(/'/g, "''")}'`,

  tableOptions: {
    // SQL Server 没有存储引擎概念
    engines: undefined,
    // SQL Server 使用排序规则而非字符集
    charsets: undefined,
    // 常用排序规则
    collations: [
      'SQL_Latin1_General_CP1_CI_AS',
      'Latin1_General_CI_AS',
      'Latin1_General_CS_AS',
      'Chinese_PRC_CI_AS',
      'Chinese_PRC_CS_AS',
      'Japanese_CI_AS',
      'Korean_Wansung_CI_AS',
    ],
    // SQL Server 支持 Schema (默认 dbo)
    supportsSchema: true,
    // SQL Server 支持文件组而非表空间
    supportsTablespace: false,
    // SQL Server 通过扩展属性支持注释
    supportsTableComment: true,
    supportsColumnComment: true,
  },

  indexOptions: {
    // SQL Server 索引类型
    types: ['CLUSTERED', 'NONCLUSTERED', 'COLUMNSTORE', 'XML', 'SPATIAL'],
    supportsFulltext: true,
    supportsSpatial: true,
    supportsHash: false,     // 内存优化表支持 HASH
    supportsUnique: true,
    supportsPartial: true,   // 筛选索引 WHERE 子句
    supportsFunctional: true, // 计算列索引
  },

  constraintOptions: {
    // SQL Server 外键操作
    foreignKeyActions: ['NO ACTION', 'CASCADE', 'SET NULL', 'SET DEFAULT'],
    supportsCheck: true,
    supportsExclude: false,
    supportsNamedConstraints: true,
    supportsDeferrable: false, // SQL Server 不支持延迟约束
  },

  autoIncrement: {
    // SQL Server IDENTITY 语法
    keyword: 'IDENTITY(1,1)',
    supportsStartWith: true,
    supportsIncrementBy: true,
    usesIdentity: true,
    usesSequence: true, // SQL Server 2012+ 支持 SEQUENCE
  },

  comment: {
    // SQL Server 不支持内联注释，使用扩展属性
    inline: false,
    separate: true, // sp_addextendedproperty
  },

  syntax: {
    // GO 是客户端批处理分隔符
    batchSeparator: 'GO',
    // SQL Server 2016+ 支持 DROP TABLE IF EXISTS
    supportsIfNotExists: false,
    // SQL Server 支持 CASCADE
    supportsCascade: true,
    // SQL Server 不支持 LIMIT/OFFSET
    supportsLimitOffset: false,
    // SQL Server 2012+ 使用 OFFSET FETCH
    paginationType: 'fetch',
    // SQL Server 支持 OUTPUT 子句
    supportsReturning: true,
    // SQL Server 支持 MERGE 语句
    supportsUpsert: true,
  },

  defaults: {
    // 默认 Schema
    schema: 'dbo',
  },
}
