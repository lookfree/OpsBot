/**
 * SQL Server (T-SQL) 数据类型定义
 *
 * Microsoft SQL Server 的数据类型配置，包括：
 * - 精确数值类型（INT、BIGINT、DECIMAL、MONEY）
 * - 近似数值类型（FLOAT、REAL）
 * - 字符串类型（VARCHAR、NVARCHAR、CHAR、NCHAR）
 * - 日期时间类型（DATE、TIME、DATETIME2、DATETIMEOFFSET）
 * - 二进制类型（BINARY、VARBINARY）
 * - 其他类型（BIT、UNIQUEIDENTIFIER、XML、GEOGRAPHY、GEOMETRY）
 */

import type { DataTypeDefinition, FieldForValidation } from './types'
import { TYPE_COLORS, validators } from './base'

// ============================================================================
// SQL Server 特有验证函数
// ============================================================================

const mssqlValidators = {
  /** 整数验证 */
  isInteger: (field: FieldForValidation): boolean => {
    return /^-?\d+$/.test(field.default)
  },

  /** TINYINT 验证 (0-255 无符号) */
  isTinyInt: (field: FieldForValidation): boolean => {
    const num = parseInt(field.default, 10)
    return !isNaN(num) && num >= 0 && num <= 255
  },

  /** 小数验证 */
  isDecimal: (field: FieldForValidation): boolean => {
    return /^-?\d*\.?\d+$/.test(field.default)
  },

  /** 货币验证 */
  isMoney: (field: FieldForValidation): boolean => {
    // 支持带货币符号的格式
    return /^-?\$?\d{1,3}(,\d{3})*(\.\d{1,4})?$/.test(field.default) ||
           /^-?\d*\.?\d{1,4}$/.test(field.default)
  },

  /** SQL Server 日期验证 */
  isMssqlDate: (field: FieldForValidation): boolean => {
    const upper = field.default.toUpperCase()
    if (upper === 'GETDATE()' || upper === 'SYSDATETIME()' ||
        upper === 'GETUTCDATE()' || upper === 'CURRENT_TIMESTAMP') {
      return true
    }
    return /^\d{4}-\d{2}-\d{2}$/.test(field.default)
  },

  /** SQL Server 日期时间验证 */
  isMssqlDateTime: (field: FieldForValidation): boolean => {
    const upper = field.default.toUpperCase()
    if (upper === 'GETDATE()' || upper === 'SYSDATETIME()' ||
        upper === 'GETUTCDATE()' || upper === 'SYSDATETIMEOFFSET()' ||
        upper === 'CURRENT_TIMESTAMP') {
      return true
    }
    return /^\d{4}-\d{2}-\d{2}( \d{2}:\d{2}:\d{2}(\.\d+)?)?$/.test(field.default)
  },

  /** SQL Server 时间验证 */
  isMssqlTime: (field: FieldForValidation): boolean => {
    return /^([01]?\d|2[0-3]):[0-5]\d:[0-5]\d(\.\d+)?$/.test(field.default)
  },

  /** BIT 验证 */
  isBit: (field: FieldForValidation): boolean => {
    const val = field.default.toLowerCase()
    return val === '0' || val === '1' || val === 'true' || val === 'false'
  },

  /** UNIQUEIDENTIFIER 验证 */
  isGuid: (field: FieldForValidation): boolean => {
    const upper = field.default.toUpperCase()
    if (upper === 'NEWID()' || upper === 'NEWSEQUENTIALID()') {
      return true
    }
    // GUID 格式: XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX
    return /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/i.test(field.default)
  },

  /** VARCHAR 长度验证 */
  isValidVarchar: (field: FieldForValidation): boolean => {
    const defaultValue = field.default
    const size = field.size || 8000
    if (defaultValue.startsWith("'") && defaultValue.endsWith("'")) {
      return defaultValue.length - 2 <= size
    }
    return defaultValue.length <= size
  },
}

// ============================================================================
// SQL Server 数据类型定义
// ============================================================================

const mssqlSpecificTypes: Record<string, DataTypeDefinition> = {
  // ==== 精确数值类型 ====
  TINYINT: {
    type: 'TINYINT',
    color: TYPE_COLORS.integer,
    checkDefault: mssqlValidators.isTinyInt,
    hasCheck: true,
    isSized: false,
    hasPrecision: false,
    canIncrement: true,
    category: 'integer',
  },
  SMALLINT: {
    type: 'SMALLINT',
    color: TYPE_COLORS.integer,
    checkDefault: mssqlValidators.isInteger,
    hasCheck: true,
    isSized: false,
    hasPrecision: false,
    canIncrement: true,
    category: 'integer',
  },
  INT: {
    type: 'INT',
    color: TYPE_COLORS.integer,
    checkDefault: mssqlValidators.isInteger,
    hasCheck: true,
    isSized: false,
    hasPrecision: false,
    canIncrement: true,
    category: 'integer',
  },
  BIGINT: {
    type: 'BIGINT',
    color: TYPE_COLORS.integer,
    checkDefault: mssqlValidators.isInteger,
    hasCheck: true,
    isSized: false,
    hasPrecision: false,
    canIncrement: true,
    category: 'integer',
  },
  DECIMAL: {
    type: 'DECIMAL',
    color: TYPE_COLORS.decimal,
    checkDefault: mssqlValidators.isDecimal,
    hasCheck: true,
    isSized: false,
    hasPrecision: true,
    defaultPrecision: 18,
    defaultScale: 0,
    category: 'decimal',
  },
  NUMERIC: {
    type: 'NUMERIC',
    color: TYPE_COLORS.decimal,
    checkDefault: mssqlValidators.isDecimal,
    hasCheck: true,
    isSized: false,
    hasPrecision: true,
    defaultPrecision: 18,
    defaultScale: 0,
    category: 'decimal',
  },
  MONEY: {
    type: 'MONEY',
    color: TYPE_COLORS.decimal,
    checkDefault: mssqlValidators.isMoney,
    hasCheck: true,
    isSized: false,
    hasPrecision: false,
    category: 'decimal',
  },
  SMALLMONEY: {
    type: 'SMALLMONEY',
    color: TYPE_COLORS.decimal,
    checkDefault: mssqlValidators.isMoney,
    hasCheck: true,
    isSized: false,
    hasPrecision: false,
    category: 'decimal',
  },

  // ==== 近似数值类型 ====
  FLOAT: {
    type: 'FLOAT',
    color: TYPE_COLORS.decimal,
    checkDefault: mssqlValidators.isDecimal,
    hasCheck: true,
    isSized: false,
    hasPrecision: true, // FLOAT(n) where n is mantissa bits
    defaultPrecision: 53,
    category: 'decimal',
  },
  REAL: {
    type: 'REAL',
    color: TYPE_COLORS.decimal,
    checkDefault: mssqlValidators.isDecimal,
    hasCheck: true,
    isSized: false,
    hasPrecision: false,
    category: 'decimal',
  },

  // ==== 字符类型 ====
  CHAR: {
    type: 'CHAR',
    color: TYPE_COLORS.string,
    checkDefault: validators.isValidString,
    hasCheck: true,
    isSized: true,
    hasPrecision: false,
    defaultSize: 1,
    hasQuotes: true,
    category: 'string',
  },
  VARCHAR: {
    type: 'VARCHAR',
    color: TYPE_COLORS.string,
    checkDefault: mssqlValidators.isValidVarchar,
    hasCheck: true,
    isSized: true,
    hasPrecision: false,
    defaultSize: 255,
    hasQuotes: true,
    category: 'string',
  },
  'VARCHAR(MAX)': {
    type: 'VARCHAR(MAX)',
    color: TYPE_COLORS.string,
    checkDefault: validators.any,
    hasCheck: false,
    isSized: false,
    hasPrecision: false,
    hasQuotes: true,
    category: 'string',
  },
  NCHAR: {
    type: 'NCHAR',
    color: TYPE_COLORS.string,
    checkDefault: validators.isValidString,
    hasCheck: true,
    isSized: true,
    hasPrecision: false,
    defaultSize: 1,
    hasQuotes: true,
    category: 'string',
  },
  NVARCHAR: {
    type: 'NVARCHAR',
    color: TYPE_COLORS.string,
    checkDefault: mssqlValidators.isValidVarchar,
    hasCheck: true,
    isSized: true,
    hasPrecision: false,
    defaultSize: 255,
    hasQuotes: true,
    category: 'string',
  },
  'NVARCHAR(MAX)': {
    type: 'NVARCHAR(MAX)',
    color: TYPE_COLORS.string,
    checkDefault: validators.any,
    hasCheck: false,
    isSized: false,
    hasPrecision: false,
    hasQuotes: true,
    category: 'string',
  },
  TEXT: {
    type: 'TEXT',
    color: TYPE_COLORS.string,
    checkDefault: validators.any,
    hasCheck: false,
    isSized: false,
    hasPrecision: false,
    hasQuotes: true,
    category: 'string',
  },
  NTEXT: {
    type: 'NTEXT',
    color: TYPE_COLORS.string,
    checkDefault: validators.any,
    hasCheck: false,
    isSized: false,
    hasPrecision: false,
    hasQuotes: true,
    category: 'string',
  },

  // ==== 日期时间类型 ====
  DATE: {
    type: 'DATE',
    color: TYPE_COLORS.datetime,
    checkDefault: mssqlValidators.isMssqlDate,
    hasCheck: false,
    isSized: false,
    hasPrecision: false,
    hasQuotes: true,
    category: 'datetime',
  },
  TIME: {
    type: 'TIME',
    color: TYPE_COLORS.datetime,
    checkDefault: mssqlValidators.isMssqlTime,
    hasCheck: false,
    isSized: false,
    hasPrecision: true, // TIME(n) precision 0-7
    defaultPrecision: 7,
    hasQuotes: true,
    category: 'datetime',
  },
  DATETIME: {
    type: 'DATETIME',
    color: TYPE_COLORS.datetime,
    checkDefault: mssqlValidators.isMssqlDateTime,
    hasCheck: false,
    isSized: false,
    hasPrecision: false,
    hasQuotes: true,
    category: 'datetime',
  },
  DATETIME2: {
    type: 'DATETIME2',
    color: TYPE_COLORS.datetime,
    checkDefault: mssqlValidators.isMssqlDateTime,
    hasCheck: false,
    isSized: false,
    hasPrecision: true, // DATETIME2(n) precision 0-7
    defaultPrecision: 7,
    hasQuotes: true,
    category: 'datetime',
  },
  SMALLDATETIME: {
    type: 'SMALLDATETIME',
    color: TYPE_COLORS.datetime,
    checkDefault: mssqlValidators.isMssqlDateTime,
    hasCheck: false,
    isSized: false,
    hasPrecision: false,
    hasQuotes: true,
    category: 'datetime',
  },
  DATETIMEOFFSET: {
    type: 'DATETIMEOFFSET',
    color: TYPE_COLORS.datetime,
    checkDefault: mssqlValidators.isMssqlDateTime,
    hasCheck: false,
    isSized: false,
    hasPrecision: true, // DATETIMEOFFSET(n) precision 0-7
    defaultPrecision: 7,
    hasQuotes: true,
    category: 'datetime',
  },

  // ==== 二进制类型 ====
  BINARY: {
    type: 'BINARY',
    color: TYPE_COLORS.binary,
    checkDefault: validators.any,
    hasCheck: false,
    isSized: true,
    hasPrecision: false,
    defaultSize: 1,
    category: 'binary',
  },
  VARBINARY: {
    type: 'VARBINARY',
    color: TYPE_COLORS.binary,
    checkDefault: validators.any,
    hasCheck: false,
    isSized: true,
    hasPrecision: false,
    defaultSize: 255,
    category: 'binary',
  },
  'VARBINARY(MAX)': {
    type: 'VARBINARY(MAX)',
    color: TYPE_COLORS.binary,
    checkDefault: validators.any,
    hasCheck: false,
    isSized: false,
    hasPrecision: false,
    category: 'binary',
  },
  IMAGE: {
    type: 'IMAGE',
    color: TYPE_COLORS.binary,
    checkDefault: validators.any,
    hasCheck: false,
    isSized: false,
    hasPrecision: false,
    category: 'binary',
  },

  // ==== 其他类型 ====
  BIT: {
    type: 'BIT',
    color: TYPE_COLORS.boolean,
    checkDefault: mssqlValidators.isBit,
    hasCheck: false,
    isSized: false,
    hasPrecision: false,
    category: 'boolean',
  },
  UNIQUEIDENTIFIER: {
    type: 'UNIQUEIDENTIFIER',
    color: TYPE_COLORS.string,
    checkDefault: mssqlValidators.isGuid,
    hasCheck: false,
    isSized: false,
    hasPrecision: false,
    hasQuotes: true,
    category: 'other',
  },
  XML: {
    type: 'XML',
    color: TYPE_COLORS.json,
    checkDefault: validators.any,
    hasCheck: false,
    isSized: false,
    hasPrecision: false,
    category: 'other',
  },
  GEOGRAPHY: {
    type: 'GEOGRAPHY',
    color: TYPE_COLORS.geometric,
    checkDefault: validators.any,
    hasCheck: false,
    isSized: false,
    hasPrecision: false,
    category: 'geometric',
  },
  GEOMETRY: {
    type: 'GEOMETRY',
    color: TYPE_COLORS.geometric,
    checkDefault: validators.any,
    hasCheck: false,
    isSized: false,
    hasPrecision: false,
    category: 'geometric',
  },
  HIERARCHYID: {
    type: 'HIERARCHYID',
    color: TYPE_COLORS.other,
    checkDefault: validators.any,
    hasCheck: false,
    isSized: false,
    hasPrecision: false,
    category: 'other',
  },
  SQL_VARIANT: {
    type: 'SQL_VARIANT',
    color: TYPE_COLORS.other,
    checkDefault: validators.any,
    hasCheck: false,
    isSized: false,
    hasPrecision: false,
    category: 'other',
  },
  ROWVERSION: {
    type: 'ROWVERSION',
    color: TYPE_COLORS.binary,
    checkDefault: validators.any,
    hasCheck: false,
    isSized: false,
    hasPrecision: false,
    category: 'other',
  },
}

/**
 * SQL Server 完整数据类型映射表
 */
export const mssqlTypes: Record<string, DataTypeDefinition> = {
  ...mssqlSpecificTypes,
}

/**
 * SQL Server 数据类型列表（按分类）
 */
export const mssqlTypeCategories: Record<string, string[]> = {
  整数: ['TINYINT', 'SMALLINT', 'INT', 'BIGINT'],
  小数: ['DECIMAL', 'NUMERIC', 'MONEY', 'SMALLMONEY', 'FLOAT', 'REAL'],
  字符串: ['CHAR', 'VARCHAR', 'VARCHAR(MAX)', 'NCHAR', 'NVARCHAR', 'NVARCHAR(MAX)', 'TEXT', 'NTEXT'],
  日期时间: ['DATE', 'TIME', 'DATETIME', 'DATETIME2', 'SMALLDATETIME', 'DATETIMEOFFSET'],
  二进制: ['BINARY', 'VARBINARY', 'VARBINARY(MAX)', 'IMAGE'],
  布尔: ['BIT'],
  其他: ['UNIQUEIDENTIFIER', 'XML', 'GEOGRAPHY', 'GEOMETRY', 'HIERARCHYID', 'SQL_VARIANT', 'ROWVERSION'],
}

export { mssqlValidators }
