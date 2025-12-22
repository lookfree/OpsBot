/**
 * 数据类型基础定义
 *
 * 包含通用的类型定义和颜色常量
 */

import type { DataTypeDefinition, FieldForValidation } from './types'

// ============================================================================
// 颜色常量（Tailwind CSS 类名）
// ============================================================================

export const TYPE_COLORS = {
  integer: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  decimal: 'bg-lime-100 text-lime-800 dark:bg-lime-900 dark:text-lime-200',
  string: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  datetime: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200',
  boolean: 'bg-violet-100 text-violet-800 dark:bg-violet-900 dark:text-violet-200',
  binary: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
  json: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200',
  geometric: 'bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200',
  network: 'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200',
  other: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200',
} as const

// ============================================================================
// 验证正则表达式
// ============================================================================

const intRegex = /^-?\d*$/
const doubleRegex = /^-?\d*\.?\d+$/
const binaryRegex = /^[01]+$/

// ============================================================================
// 通用验证函数
// ============================================================================

export const validators = {
  /** 整数验证 */
  isInteger: (field: FieldForValidation): boolean => {
    return intRegex.test(field.default)
  },

  /** 小数验证 */
  isDecimal: (field: FieldForValidation): boolean => {
    return doubleRegex.test(field.default)
  },

  /** 字符串长度验证 */
  isValidString: (field: FieldForValidation): boolean => {
    const defaultValue = field.default
    const size = field.size || 255
    // 检查是否有引号包裹
    if (defaultValue.startsWith("'") && defaultValue.endsWith("'")) {
      return defaultValue.length - 2 <= size
    }
    return defaultValue.length <= size
  },

  /** 二进制验证 */
  isBinary: (field: FieldForValidation): boolean => {
    return binaryRegex.test(field.default)
  },

  /** 布尔值验证 */
  isBoolean: (field: FieldForValidation): boolean => {
    const lower = field.default.toLowerCase()
    return lower === 'true' || lower === 'false' || field.default === '0' || field.default === '1'
  },

  /** 日期验证 (YYYY-MM-DD) */
  isDate: (field: FieldForValidation): boolean => {
    return /^\d{4}-\d{2}-\d{2}$/.test(field.default)
  },

  /** 时间验证 (HH:MM:SS) */
  isTime: (field: FieldForValidation): boolean => {
    return /^(?:[01]?\d|2[0-3]):[0-5]?\d:[0-5]?\d$/.test(field.default)
  },

  /** 日期时间验证 (YYYY-MM-DD HH:MM:SS) */
  isDateTime: (field: FieldForValidation): boolean => {
    const upper = field.default.toUpperCase()
    if (upper === 'CURRENT_TIMESTAMP' || upper === 'NOW()') {
      return true
    }
    return /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(field.default)
  },

  /** 年份验证 */
  isYear: (field: FieldForValidation): boolean => {
    return /^\d{4}$/.test(field.default)
  },

  /** UUID 验证 */
  isUUID: (field: FieldForValidation): boolean => {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(field.default)
  },

  /** JSON 验证 */
  isJSON: (field: FieldForValidation): boolean => {
    try {
      JSON.parse(field.default)
      return true
    } catch {
      return false
    }
  },

  /** 任意值（不验证） */
  any: (): boolean => true,
}

// ============================================================================
// 通用数据类型（跨数据库共享）
// ============================================================================

export const baseTypes: Record<string, DataTypeDefinition> = {
  // 整数类型
  INT: {
    type: 'INT',
    color: TYPE_COLORS.integer,
    checkDefault: validators.isInteger,
    hasCheck: true,
    isSized: false,
    hasPrecision: false,
    canIncrement: true,
    category: 'integer',
  },
  SMALLINT: {
    type: 'SMALLINT',
    color: TYPE_COLORS.integer,
    checkDefault: validators.isInteger,
    hasCheck: true,
    isSized: false,
    hasPrecision: false,
    canIncrement: true,
    category: 'integer',
  },
  BIGINT: {
    type: 'BIGINT',
    color: TYPE_COLORS.integer,
    checkDefault: validators.isInteger,
    hasCheck: true,
    isSized: false,
    hasPrecision: false,
    canIncrement: true,
    category: 'integer',
  },

  // 小数类型
  DECIMAL: {
    type: 'DECIMAL',
    color: TYPE_COLORS.decimal,
    checkDefault: validators.isDecimal,
    hasCheck: true,
    isSized: false,
    hasPrecision: true,
    defaultPrecision: 10,
    defaultScale: 2,
    category: 'decimal',
  },
  NUMERIC: {
    type: 'NUMERIC',
    color: TYPE_COLORS.decimal,
    checkDefault: validators.isDecimal,
    hasCheck: true,
    isSized: false,
    hasPrecision: true,
    defaultPrecision: 10,
    defaultScale: 2,
    category: 'decimal',
  },
  FLOAT: {
    type: 'FLOAT',
    color: TYPE_COLORS.decimal,
    checkDefault: validators.isDecimal,
    hasCheck: true,
    isSized: false,
    hasPrecision: true,
    category: 'decimal',
  },
  DOUBLE: {
    type: 'DOUBLE',
    color: TYPE_COLORS.decimal,
    checkDefault: validators.isDecimal,
    hasCheck: true,
    isSized: false,
    hasPrecision: true,
    category: 'decimal',
  },
  REAL: {
    type: 'REAL',
    color: TYPE_COLORS.decimal,
    checkDefault: validators.isDecimal,
    hasCheck: true,
    isSized: false,
    hasPrecision: false,
    category: 'decimal',
  },

  // 字符串类型
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
    checkDefault: validators.isValidString,
    hasCheck: true,
    isSized: true,
    hasPrecision: false,
    defaultSize: 255,
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

  // 日期时间类型
  DATE: {
    type: 'DATE',
    color: TYPE_COLORS.datetime,
    checkDefault: validators.isDate,
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
    checkDefault: validators.isDateTime,
    hasCheck: false,
    isSized: false,
    hasPrecision: false,
    hasQuotes: true,
    category: 'datetime',
  },
  TIMESTAMP: {
    type: 'TIMESTAMP',
    color: TYPE_COLORS.datetime,
    checkDefault: validators.isDateTime,
    hasCheck: false,
    isSized: false,
    hasPrecision: false,
    hasQuotes: true,
    category: 'datetime',
  },

  // 布尔类型
  BOOLEAN: {
    type: 'BOOLEAN',
    color: TYPE_COLORS.boolean,
    checkDefault: validators.isBoolean,
    hasCheck: false,
    isSized: false,
    hasPrecision: false,
    category: 'boolean',
  },

  // 二进制类型
  BLOB: {
    type: 'BLOB',
    color: TYPE_COLORS.binary,
    checkDefault: validators.any,
    hasCheck: false,
    isSized: false,
    hasPrecision: false,
    category: 'binary',
  },
  BINARY: {
    type: 'BINARY',
    color: TYPE_COLORS.binary,
    checkDefault: validators.isBinary,
    hasCheck: false,
    isSized: true,
    hasPrecision: false,
    defaultSize: 1,
    hasQuotes: true,
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
    hasQuotes: true,
    category: 'binary',
  },

  // JSON 类型
  JSON: {
    type: 'JSON',
    color: TYPE_COLORS.json,
    checkDefault: validators.isJSON,
    hasCheck: false,
    isSized: false,
    hasPrecision: false,
    category: 'json',
  },
}
