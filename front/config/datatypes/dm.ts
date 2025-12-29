/**
 * 达梦 (DM) 数据类型定义
 *
 * 达梦数据库高度兼容 Oracle，数据类型与 Oracle 类似：
 * - NUMBER(p,s) 统一处理所有数字类型
 * - VARCHAR2 代替 VARCHAR
 * - DATE 包含时间信息
 * - 支持 IDENTITY 自增列
 */

import type { DataTypeDefinition, FieldForValidation } from './types'
import { TYPE_COLORS, validators } from './base'

// ============================================================================
// 达梦特有验证函数
// ============================================================================

const dmValidators = {
  /** NUMBER 验证（支持整数和小数） */
  isNumber: (field: FieldForValidation): boolean => {
    return /^-?\d*\.?\d+$/.test(field.default)
  },

  /** 达梦日期验证 (支持 SYSDATE 函数) */
  isDmDate: (field: FieldForValidation): boolean => {
    const upper = field.default.toUpperCase()
    if (upper === 'SYSDATE' || upper === 'SYSTIMESTAMP' || upper === 'CURRENT_DATE' || upper === 'CURRENT_TIMESTAMP') {
      return true
    }
    // 日期格式: YYYY-MM-DD
    return /^\d{4}-\d{2}-\d{2}$/.test(field.default)
  },

  /** 达梦时间戳验证 */
  isDmTimestamp: (field: FieldForValidation): boolean => {
    const upper = field.default.toUpperCase()
    if (upper === 'SYSTIMESTAMP' || upper === 'CURRENT_TIMESTAMP' || upper === 'LOCALTIMESTAMP') {
      return true
    }
    return /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d+)?$/.test(field.default)
  },

  /** SYS_GUID 验证 */
  isSysGuid: (field: FieldForValidation): boolean => {
    const upper = field.default.toUpperCase()
    if (upper === 'SYS_GUID()') {
      return true
    }
    // 32位16进制字符串
    return /^[0-9A-F]{32}$/i.test(field.default)
  },

  /** 达梦布尔值验证 (0 或 1) */
  isDmBoolean: (field: FieldForValidation): boolean => {
    return field.default === '0' || field.default === '1'
  },

  /** INTERVAL YEAR TO MONTH 验证 */
  isIntervalYM: (field: FieldForValidation): boolean => {
    return /^INTERVAL\s+'[\d]+-[\d]+'\s+YEAR\s+TO\s+MONTH$/i.test(field.default) ||
           /^[\d]+-[\d]+$/.test(field.default)
  },

  /** INTERVAL DAY TO SECOND 验证 */
  isIntervalDS: (field: FieldForValidation): boolean => {
    return /^INTERVAL\s+'.+'\s+DAY\s+TO\s+SECOND$/i.test(field.default) ||
           /^\d+\s+\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(field.default)
  },

  /** RAW 类型验证 (16进制) */
  isRaw: (field: FieldForValidation): boolean => {
    return /^[0-9A-F]+$/i.test(field.default)
  },

  /** VARCHAR2 长度验证 */
  isValidVarchar2: (field: FieldForValidation): boolean => {
    const defaultValue = field.default
    const size = field.size || 32767
    if (defaultValue.startsWith("'") && defaultValue.endsWith("'")) {
      return defaultValue.length - 2 <= size
    }
    return defaultValue.length <= size
  },
}

// ============================================================================
// 达梦数据类型定义
// ============================================================================

/**
 * 达梦特有数据类型
 */
const dmSpecificTypes: Record<string, DataTypeDefinition> = {
  // ==== 整数类型 ====
  TINYINT: {
    type: 'TINYINT',
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
  INTEGER: {
    type: 'INTEGER',
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

  // ==== 数字类型 (Oracle 兼容) ====
  NUMBER: {
    type: 'NUMBER',
    color: TYPE_COLORS.decimal,
    checkDefault: dmValidators.isNumber,
    hasCheck: true,
    isSized: false,
    hasPrecision: true,
    defaultPrecision: 10,
    defaultScale: 0,
    canIncrement: true,
    category: 'decimal',
  },
  NUMERIC: {
    type: 'NUMERIC',
    color: TYPE_COLORS.decimal,
    checkDefault: dmValidators.isNumber,
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
    checkDefault: dmValidators.isNumber,
    hasCheck: true,
    isSized: false,
    hasPrecision: true,
    defaultPrecision: 10,
    defaultScale: 0,
    category: 'decimal',
  },
  FLOAT: {
    type: 'FLOAT',
    color: TYPE_COLORS.decimal,
    checkDefault: validators.isDecimal,
    hasCheck: true,
    isSized: false,
    hasPrecision: false,
    category: 'decimal',
  },
  DOUBLE: {
    type: 'DOUBLE',
    color: TYPE_COLORS.decimal,
    checkDefault: validators.isDecimal,
    hasCheck: true,
    isSized: false,
    hasPrecision: false,
    category: 'decimal',
  },
  'DOUBLE PRECISION': {
    type: 'DOUBLE PRECISION',
    color: TYPE_COLORS.decimal,
    checkDefault: validators.isDecimal,
    hasCheck: true,
    isSized: false,
    hasPrecision: false,
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
    checkDefault: dmValidators.isValidVarchar2,
    hasCheck: true,
    isSized: true,
    hasPrecision: false,
    defaultSize: 255,
    hasQuotes: true,
    category: 'string',
  },
  VARCHAR2: {
    type: 'VARCHAR2',
    color: TYPE_COLORS.string,
    checkDefault: dmValidators.isValidVarchar2,
    hasCheck: true,
    isSized: true,
    hasPrecision: false,
    defaultSize: 255,
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
    checkDefault: dmValidators.isValidVarchar2,
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

  // ==== LOB 类型 ====
  CLOB: {
    type: 'CLOB',
    color: TYPE_COLORS.string,
    checkDefault: validators.any,
    hasCheck: false,
    isSized: false,
    hasPrecision: false,
    hasQuotes: true,
    category: 'binary',
  },
  BLOB: {
    type: 'BLOB',
    color: TYPE_COLORS.binary,
    checkDefault: validators.any,
    hasCheck: false,
    isSized: false,
    hasPrecision: false,
    category: 'binary',
  },
  BFILE: {
    type: 'BFILE',
    color: TYPE_COLORS.binary,
    checkDefault: validators.any,
    hasCheck: false,
    isSized: false,
    hasPrecision: false,
    category: 'binary',
  },

  // ==== 二进制类型 ====
  BINARY: {
    type: 'BINARY',
    color: TYPE_COLORS.binary,
    checkDefault: dmValidators.isRaw,
    hasCheck: false,
    isSized: true,
    hasPrecision: false,
    defaultSize: 1,
    category: 'binary',
  },
  VARBINARY: {
    type: 'VARBINARY',
    color: TYPE_COLORS.binary,
    checkDefault: dmValidators.isRaw,
    hasCheck: false,
    isSized: true,
    hasPrecision: false,
    defaultSize: 255,
    category: 'binary',
  },

  // ==== 日期时间类型 ====
  DATE: {
    type: 'DATE',
    color: TYPE_COLORS.datetime,
    checkDefault: dmValidators.isDmDate,
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
    hasPrecision: true,
    defaultPrecision: 0,
    hasQuotes: true,
    category: 'datetime',
  },
  DATETIME: {
    type: 'DATETIME',
    color: TYPE_COLORS.datetime,
    checkDefault: dmValidators.isDmTimestamp,
    hasCheck: false,
    isSized: false,
    hasPrecision: true,
    defaultPrecision: 0,
    hasQuotes: true,
    category: 'datetime',
  },
  TIMESTAMP: {
    type: 'TIMESTAMP',
    color: TYPE_COLORS.datetime,
    checkDefault: dmValidators.isDmTimestamp,
    hasCheck: false,
    isSized: false,
    hasPrecision: true,
    defaultPrecision: 6,
    hasQuotes: true,
    category: 'datetime',
  },
  'TIMESTAMP WITH TIME ZONE': {
    type: 'TIMESTAMP WITH TIME ZONE',
    color: TYPE_COLORS.datetime,
    checkDefault: dmValidators.isDmTimestamp,
    hasCheck: false,
    isSized: false,
    hasPrecision: true,
    defaultPrecision: 6,
    hasQuotes: true,
    category: 'datetime',
  },
  'INTERVAL YEAR TO MONTH': {
    type: 'INTERVAL YEAR TO MONTH',
    color: TYPE_COLORS.datetime,
    checkDefault: dmValidators.isIntervalYM,
    hasCheck: false,
    isSized: false,
    hasPrecision: false,
    category: 'datetime',
  },
  'INTERVAL DAY TO SECOND': {
    type: 'INTERVAL DAY TO SECOND',
    color: TYPE_COLORS.datetime,
    checkDefault: dmValidators.isIntervalDS,
    hasCheck: false,
    isSized: false,
    hasPrecision: false,
    category: 'datetime',
  },

  // ==== 布尔类型 ====
  BIT: {
    type: 'BIT',
    color: TYPE_COLORS.other,
    checkDefault: dmValidators.isDmBoolean,
    hasCheck: true,
    isSized: false,
    hasPrecision: false,
    category: 'other',
  },
  BOOLEAN: {
    type: 'BOOLEAN',
    color: TYPE_COLORS.other,
    checkDefault: validators.isBoolean,
    hasCheck: true,
    isSized: false,
    hasPrecision: false,
    category: 'other',
  },

  // ==== 行标识符类型 ====
  ROWID: {
    type: 'ROWID',
    color: TYPE_COLORS.other,
    checkDefault: validators.any,
    hasCheck: false,
    isSized: false,
    hasPrecision: false,
    category: 'other',
  },
}

/**
 * 达梦完整数据类型映射表
 */
export const dmTypes: Record<string, DataTypeDefinition> = {
  ...dmSpecificTypes,
}

/**
 * 达梦数据类型列表（按分类）
 */
export const dmTypeCategories: Record<string, string[]> = {
  整数: ['TINYINT', 'SMALLINT', 'INT', 'INTEGER', 'BIGINT'],
  浮点: ['FLOAT', 'DOUBLE', 'DOUBLE PRECISION', 'REAL'],
  精确数值: ['NUMBER', 'NUMERIC', 'DECIMAL'],
  字符: ['CHAR', 'VARCHAR', 'VARCHAR2', 'NCHAR', 'NVARCHAR', 'TEXT'],
  大对象: ['CLOB', 'BLOB', 'BFILE'],
  二进制: ['BINARY', 'VARBINARY'],
  日期时间: [
    'DATE',
    'TIME',
    'DATETIME',
    'TIMESTAMP',
    'TIMESTAMP WITH TIME ZONE',
    'INTERVAL YEAR TO MONTH',
    'INTERVAL DAY TO SECOND',
  ],
  布尔: ['BIT', 'BOOLEAN'],
  其他: ['ROWID'],
}

export { dmValidators }
