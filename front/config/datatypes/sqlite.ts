/**
 * SQLite 数据类型定义
 *
 * SQLite 使用动态类型系统，有 5 种存储类：NULL, INTEGER, REAL, TEXT, BLOB
 * 声明的类型会被映射到这些存储类（类型亲和性）
 */

import type { DataTypeDefinition, FieldForValidation } from './types'
import { TYPE_COLORS, validators } from './base'

// ============================================================================
// SQLite 特有验证函数
// ============================================================================

const sqliteValidators = {
  /** SQLite 整数验证 */
  isInteger: (field: FieldForValidation): boolean => {
    return /^-?\d+$/.test(field.default)
  },

  /** SQLite 实数验证 */
  isReal: (field: FieldForValidation): boolean => {
    return /^-?\d*\.?\d+([eE][+-]?\d+)?$/.test(field.default)
  },

  /** SQLite 日期验证 */
  isDate: (field: FieldForValidation): boolean => {
    const upper = field.default.toUpperCase()
    // SQLite 内置日期函数
    if (['CURRENT_DATE', 'CURRENT_TIME', 'CURRENT_TIMESTAMP'].includes(upper)) {
      return true
    }
    // 函数调用形式
    if (/^(DATE|TIME|DATETIME|STRFTIME)\s*\(/.test(upper)) {
      return true
    }
    // ISO 格式日期
    return /^\d{4}-\d{2}-\d{2}/.test(field.default)
  },

  /** SQLite 布尔验证 (0 或 1) */
  isBoolean: (field: FieldForValidation): boolean => {
    const v = field.default.toLowerCase()
    return ['0', '1', 'true', 'false'].includes(v)
  },
}

// ============================================================================
// SQLite 数据类型定义
// ============================================================================

export const sqliteTypes: Record<string, DataTypeDefinition> = {
  // ==== 整数类型 (INTEGER 亲和性) ====
  INTEGER: {
    type: 'INTEGER',
    color: TYPE_COLORS.integer,
    checkDefault: sqliteValidators.isInteger,
    hasCheck: true,
    isSized: false,
    hasPrecision: false,
    canIncrement: true, // INTEGER PRIMARY KEY 自动自增
    category: 'integer',
  },
  INT: {
    type: 'INT',
    color: TYPE_COLORS.integer,
    checkDefault: sqliteValidators.isInteger,
    hasCheck: true,
    isSized: false,
    hasPrecision: false,
    canIncrement: true,
    category: 'integer',
  },
  TINYINT: {
    type: 'TINYINT',
    color: TYPE_COLORS.integer,
    checkDefault: sqliteValidators.isInteger,
    hasCheck: true,
    isSized: false,
    hasPrecision: false,
    category: 'integer',
  },
  SMALLINT: {
    type: 'SMALLINT',
    color: TYPE_COLORS.integer,
    checkDefault: sqliteValidators.isInteger,
    hasCheck: true,
    isSized: false,
    hasPrecision: false,
    category: 'integer',
  },
  MEDIUMINT: {
    type: 'MEDIUMINT',
    color: TYPE_COLORS.integer,
    checkDefault: sqliteValidators.isInteger,
    hasCheck: true,
    isSized: false,
    hasPrecision: false,
    category: 'integer',
  },
  BIGINT: {
    type: 'BIGINT',
    color: TYPE_COLORS.integer,
    checkDefault: sqliteValidators.isInteger,
    hasCheck: true,
    isSized: false,
    hasPrecision: false,
    category: 'integer',
  },

  // ==== 浮点类型 (REAL 亲和性) ====
  REAL: {
    type: 'REAL',
    color: TYPE_COLORS.decimal,
    checkDefault: sqliteValidators.isReal,
    hasCheck: true,
    isSized: false,
    hasPrecision: false,
    category: 'decimal',
  },
  DOUBLE: {
    type: 'DOUBLE',
    color: TYPE_COLORS.decimal,
    checkDefault: sqliteValidators.isReal,
    hasCheck: true,
    isSized: false,
    hasPrecision: false,
    category: 'decimal',
  },
  'DOUBLE PRECISION': {
    type: 'DOUBLE PRECISION',
    color: TYPE_COLORS.decimal,
    checkDefault: sqliteValidators.isReal,
    hasCheck: true,
    isSized: false,
    hasPrecision: false,
    category: 'decimal',
  },
  FLOAT: {
    type: 'FLOAT',
    color: TYPE_COLORS.decimal,
    checkDefault: sqliteValidators.isReal,
    hasCheck: true,
    isSized: false,
    hasPrecision: false,
    category: 'decimal',
  },

  // ==== 数值类型 (NUMERIC 亲和性) ====
  NUMERIC: {
    type: 'NUMERIC',
    color: TYPE_COLORS.decimal,
    checkDefault: sqliteValidators.isReal,
    hasCheck: true,
    isSized: false,
    hasPrecision: true,
    defaultPrecision: 10,
    defaultScale: 0,
    category: 'decimal',
  },
  DECIMAL: {
    type: 'DECIMAL',
    color: TYPE_COLORS.decimal,
    checkDefault: sqliteValidators.isReal,
    hasCheck: true,
    isSized: false,
    hasPrecision: true,
    defaultPrecision: 10,
    defaultScale: 0,
    category: 'decimal',
  },
  BOOLEAN: {
    type: 'BOOLEAN',
    color: TYPE_COLORS.boolean,
    checkDefault: sqliteValidators.isBoolean,
    hasCheck: true,
    isSized: false,
    hasPrecision: false,
    category: 'boolean',
  },

  // ==== 文本类型 (TEXT 亲和性) ====
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
  VARCHAR: {
    type: 'VARCHAR',
    color: TYPE_COLORS.string,
    checkDefault: validators.isValidString,
    hasCheck: true,
    isSized: true,
    hasPrecision: false,
    defaultSize: 255,
    hasQuotes: true,
    category: 'string',
  },
  'CHARACTER VARYING': {
    type: 'CHARACTER VARYING',
    color: TYPE_COLORS.string,
    checkDefault: validators.isValidString,
    hasCheck: true,
    isSized: true,
    hasPrecision: false,
    defaultSize: 255,
    hasQuotes: true,
    category: 'string',
  },
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
  CHARACTER: {
    type: 'CHARACTER',
    color: TYPE_COLORS.string,
    checkDefault: validators.isValidString,
    hasCheck: true,
    isSized: true,
    hasPrecision: false,
    defaultSize: 1,
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
    checkDefault: validators.isValidString,
    hasCheck: true,
    isSized: true,
    hasPrecision: false,
    defaultSize: 255,
    hasQuotes: true,
    category: 'string',
  },
  CLOB: {
    type: 'CLOB',
    color: TYPE_COLORS.string,
    checkDefault: validators.any,
    hasCheck: false,
    isSized: false,
    hasPrecision: false,
    hasQuotes: true,
    category: 'string',
  },

  // ==== 二进制类型 (BLOB 亲和性) ====
  BLOB: {
    type: 'BLOB',
    color: TYPE_COLORS.binary,
    checkDefault: validators.any,
    hasCheck: false,
    isSized: false,
    hasPrecision: false,
    category: 'binary',
  },

  // ==== 日期时间类型 (NUMERIC 亲和性存储) ====
  DATE: {
    type: 'DATE',
    color: TYPE_COLORS.datetime,
    checkDefault: sqliteValidators.isDate,
    hasCheck: false,
    isSized: false,
    hasPrecision: false,
    hasQuotes: true,
    category: 'datetime',
  },
  TIME: {
    type: 'TIME',
    color: TYPE_COLORS.datetime,
    checkDefault: validators.isTime,
    hasCheck: false,
    isSized: false,
    hasPrecision: false,
    hasQuotes: true,
    category: 'datetime',
  },
  DATETIME: {
    type: 'DATETIME',
    color: TYPE_COLORS.datetime,
    checkDefault: sqliteValidators.isDate,
    hasCheck: false,
    isSized: false,
    hasPrecision: false,
    hasQuotes: true,
    category: 'datetime',
  },
  TIMESTAMP: {
    type: 'TIMESTAMP',
    color: TYPE_COLORS.datetime,
    checkDefault: sqliteValidators.isDate,
    hasCheck: false,
    isSized: false,
    hasPrecision: false,
    hasQuotes: true,
    category: 'datetime',
  },
}

// ============================================================================
// SQLite 数据类型分类
// ============================================================================

export const sqliteTypeCategories: Record<string, string[]> = {
  整数: ['INTEGER', 'INT', 'TINYINT', 'SMALLINT', 'MEDIUMINT', 'BIGINT'],
  实数: ['REAL', 'DOUBLE', 'DOUBLE PRECISION', 'FLOAT'],
  数值: ['NUMERIC', 'DECIMAL', 'BOOLEAN'],
  文本: ['TEXT', 'VARCHAR', 'CHARACTER VARYING', 'CHAR', 'CHARACTER', 'NCHAR', 'NVARCHAR', 'CLOB'],
  二进制: ['BLOB'],
  日期时间: ['DATE', 'TIME', 'DATETIME', 'TIMESTAMP'],
}

export { sqliteValidators }
