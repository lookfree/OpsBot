/**
 * 数据库方言配置接口
 *
 * 定义各数据库的语法差异和特性配置
 */

/**
 * 数据库方言配置
 */
export interface DatabaseDialectConfig {
  /** 数据库标识 */
  id: string

  /** 数据库显示名称 */
  name: string

  // =========================================================================
  // 标识符引用
  // =========================================================================

  /** 标识符引用函数（表名、列名等） */
  quoteIdentifier: (name: string) => string

  /** 字符串字面量引用函数 */
  quoteString: (value: string) => string

  // =========================================================================
  // 表选项
  // =========================================================================

  tableOptions: {
    /** 可用的存储引擎列表 (MySQL/MariaDB) */
    engines?: string[]

    /** 可用的字符集列表 (MySQL/MariaDB) */
    charsets?: string[]

    /** 可用的排序规则列表 */
    collations?: string[]

    /** 是否支持 Schema (PostgreSQL/MSSQL/Oracle) */
    supportsSchema?: boolean

    /** 是否支持表空间 (Oracle) */
    supportsTablespace?: boolean

    /** 是否支持表注释 */
    supportsTableComment?: boolean

    /** 是否支持列注释 */
    supportsColumnComment?: boolean
  }

  // =========================================================================
  // 索引选项
  // =========================================================================

  indexOptions: {
    /** 可用的索引类型 */
    types: string[]

    /** 是否支持全文索引 */
    supportsFulltext: boolean

    /** 是否支持空间索引 */
    supportsSpatial: boolean

    /** 是否支持哈希索引 */
    supportsHash: boolean

    /** 是否支持唯一索引 */
    supportsUnique: boolean

    /** 是否支持部分索引 (PostgreSQL WHERE 子句) */
    supportsPartial?: boolean

    /** 是否支持函数索引 */
    supportsFunctional?: boolean
  }

  // =========================================================================
  // 约束选项
  // =========================================================================

  constraintOptions: {
    /** 可用的外键操作 */
    foreignKeyActions: string[]

    /** 是否支持 CHECK 约束 */
    supportsCheck: boolean

    /** 是否支持 EXCLUDE 约束 (PostgreSQL) */
    supportsExclude?: boolean

    /** 是否支持命名约束 */
    supportsNamedConstraints: boolean

    /** 是否支持延迟约束 */
    supportsDeferrable?: boolean
  }

  // =========================================================================
  // 自增选项
  // =========================================================================

  autoIncrement: {
    /** 自增关键字 */
    keyword: string

    /** 是否支持指定起始值 */
    supportsStartWith: boolean

    /** 是否支持指定步长 */
    supportsIncrementBy: boolean

    /** 是否使用 IDENTITY 语法 (MSSQL/PostgreSQL 12+) */
    usesIdentity?: boolean

    /** 是否使用序列 (PostgreSQL/Oracle) */
    usesSequence?: boolean
  }

  // =========================================================================
  // 注释语法
  // =========================================================================

  comment: {
    /** 是否支持内联注释 (COMMENT 'xxx') */
    inline: boolean

    /** 是否需要单独的 COMMENT ON 语句 */
    separate: boolean
  }

  // =========================================================================
  // SQL 语法特性
  // =========================================================================

  syntax: {
    /** 批处理分隔符 */
    batchSeparator: string

    /** 是否支持 IF NOT EXISTS */
    supportsIfNotExists: boolean

    /** 是否支持 CASCADE/RESTRICT */
    supportsCascade: boolean

    /** 是否支持 LIMIT/OFFSET */
    supportsLimitOffset: boolean

    /** 分页语法类型 */
    paginationType: 'limit' | 'top' | 'rownum' | 'fetch'

    /** 是否支持 RETURNING 子句 */
    supportsReturning?: boolean

    /** 是否支持 UPSERT (INSERT ... ON CONFLICT/DUPLICATE) */
    supportsUpsert?: boolean
  }

  // =========================================================================
  // 默认值
  // =========================================================================

  defaults: {
    /** 默认引擎 */
    engine?: string

    /** 默认字符集 */
    charset?: string

    /** 默认排序规则 */
    collation?: string

    /** 默认 Schema */
    schema?: string
  }
}

/**
 * 支持的数据库类型
 */
export type DatabaseType = 'mysql' | 'postgresql' | 'mariadb' | 'sqlite' | 'mssql' | 'oracle'
