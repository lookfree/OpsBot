/**
 * Oracle 数据类型定义
 *
 * Oracle 数据库使用独特的类型系统，与 MySQL 有显著差异：
 * - NUMBER(p,s) 统一处理所有数字类型
 * - VARCHAR2 代替 VARCHAR
 * - DATE 包含时间信息
 * - 无原生 BOOLEAN，使用 NUMBER(1)
 */

import type { DataTypeDefinition, FieldForValidation } from './types'
import { TYPE_COLORS, validators } from './base'

// ============================================================================
// Oracle 特有验证函数
// ============================================================================

const oracleValidators = {
  /** NUMBER 验证（支持整数和小数） */
  isNumber: (field: FieldForValidation): boolean => {
    return /^-?\d*\.?\d+$/.test(field.default)
  },

  /** Oracle 日期验证 (支持 SYSDATE 函数) */
  isOracleDate: (field: FieldForValidation): boolean => {
    const upper = field.default.toUpperCase()
    if (upper === 'SYSDATE' || upper === 'SYSTIMESTAMP' || upper === 'CURRENT_DATE' || upper === 'CURRENT_TIMESTAMP') {
      return true
    }
    // Oracle 日期格式: YYYY-MM-DD 或 DD-MON-YYYY
    return /^\d{4}-\d{2}-\d{2}$/.test(field.default) ||
           /^\d{2}-[A-Z]{3}-\d{4}$/i.test(field.default)
  },

  /** Oracle 时间戳验证 */
  isOracleTimestamp: (field: FieldForValidation): boolean => {
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

  /** Oracle 布尔值验证 (0 或 1) */
  isOracleBoolean: (field: FieldForValidation): boolean => {
    return field.default === '0' || field.default === '1'
  },

  /** INTERVAL YEAR TO MONTH 验证 */
  isIntervalYM: (field: FieldForValidation): boolean => {
    // 格式: INTERVAL 'Y-M' YEAR TO MONTH
    return /^INTERVAL\s+'[\d]+-[\d]+'\s+YEAR\s+TO\s+MONTH$/i.test(field.default) ||
           /^[\d]+-[\d]+$/.test(field.default)
  },

  /** INTERVAL DAY TO SECOND 验证 */
  isIntervalDS: (field: FieldForValidation): boolean => {
    // 格式: INTERVAL 'D HH:MI:SS' DAY TO SECOND
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
    const size = field.size || 4000
    if (defaultValue.startsWith("'") && defaultValue.endsWith("'")) {
      return defaultValue.length - 2 <= size
    }
    return defaultValue.length <= size
  },
}

// ============================================================================
// Oracle 数据类型定义
// ============================================================================

/**
 * Oracle 数据类型
 */
const oracleSpecificTypes: Record<string, DataTypeDefinition> = {
  // ==== 数字类型 ====
  NUMBER: {
    type: 'NUMBER',
    color: TYPE_COLORS.decimal,
    checkDefault: oracleValidators.isNumber,
    hasCheck: true,
    isSized: false,
    hasPrecision: true,
    defaultPrecision: 10,
    defaultScale: 0,
    canIncrement: true, // 通过 IDENTITY 实现
    category: 'decimal',
  },
  BINARY_FLOAT: {
    type: 'BINARY_FLOAT',
    color: TYPE_COLORS.decimal,
    checkDefault: validators.isDecimal,
    hasCheck: true,
    isSized: false,
    hasPrecision: false,
    category: 'decimal',
  },
  BINARY_DOUBLE: {
    type: 'BINARY_DOUBLE',
    color: TYPE_COLORS.decimal,
    checkDefault: validators.isDecimal,
    hasCheck: true,
    isSized: false,
    hasPrecision: false,
    category: 'decimal',
  },
  FLOAT: {
    type: 'FLOAT',
    color: TYPE_COLORS.decimal,
    checkDefault: validators.isDecimal,
    hasCheck: true,
    isSized: false,
    hasPrecision: true, // FLOAT(p) where p is binary precision
    category: 'decimal',
  },

  // ==== 字符类型 ====
  VARCHAR2: {
    type: 'VARCHAR2',
    color: TYPE_COLORS.string,
    checkDefault: oracleValidators.isValidVarchar2,
    hasCheck: true,
    isSized: true,
    hasPrecision: false,
    defaultSize: 255,
    hasQuotes: true,
    category: 'string',
  },
  NVARCHAR2: {
    type: 'NVARCHAR2',
    color: TYPE_COLORS.string,
    checkDefault: oracleValidators.isValidVarchar2,
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

  // ==== LOB 类型 ====
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
  NCLOB: {
    type: 'NCLOB',
    color: TYPE_COLORS.string,
    checkDefault: validators.any,
    hasCheck: false,
    isSized: false,
    hasPrecision: false,
    hasQuotes: true,
    category: 'string',
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

  // ==== 日期时间类型 ====
  DATE: {
    type: 'DATE',
    color: TYPE_COLORS.datetime,
    checkDefault: oracleValidators.isOracleDate,
    hasCheck: false,
    isSized: false,
    hasPrecision: false,
    hasQuotes: true,
    category: 'datetime',
  },
  TIMESTAMP: {
    type: 'TIMESTAMP',
    color: TYPE_COLORS.datetime,
    checkDefault: oracleValidators.isOracleTimestamp,
    hasCheck: false,
    isSized: false,
    hasPrecision: true, // TIMESTAMP(p) 精度 0-9，默认 6
    defaultPrecision: 6,
    hasQuotes: true,
    category: 'datetime',
  },
  'TIMESTAMP WITH TIME ZONE': {
    type: 'TIMESTAMP WITH TIME ZONE',
    color: TYPE_COLORS.datetime,
    checkDefault: oracleValidators.isOracleTimestamp,
    hasCheck: false,
    isSized: false,
    hasPrecision: true,
    defaultPrecision: 6,
    hasQuotes: true,
    category: 'datetime',
  },
  'TIMESTAMP WITH LOCAL TIME ZONE': {
    type: 'TIMESTAMP WITH LOCAL TIME ZONE',
    color: TYPE_COLORS.datetime,
    checkDefault: oracleValidators.isOracleTimestamp,
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
    checkDefault: oracleValidators.isIntervalYM,
    hasCheck: false,
    isSized: false,
    hasPrecision: false,
    category: 'datetime',
  },
  'INTERVAL DAY TO SECOND': {
    type: 'INTERVAL DAY TO SECOND',
    color: TYPE_COLORS.datetime,
    checkDefault: oracleValidators.isIntervalDS,
    hasCheck: false,
    isSized: false,
    hasPrecision: false,
    category: 'datetime',
  },

  // ==== 二进制类型 ====
  RAW: {
    type: 'RAW',
    color: TYPE_COLORS.binary,
    checkDefault: oracleValidators.isRaw,
    hasCheck: false,
    isSized: true,
    hasPrecision: false,
    defaultSize: 16,
    category: 'binary',
  },
  'LONG RAW': {
    type: 'LONG RAW',
    color: TYPE_COLORS.binary,
    checkDefault: validators.any,
    hasCheck: false,
    isSized: false,
    hasPrecision: false,
    category: 'binary',
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
  UROWID: {
    type: 'UROWID',
    color: TYPE_COLORS.other,
    checkDefault: validators.any,
    hasCheck: false,
    isSized: true, // UROWID(size)
    hasPrecision: false,
    defaultSize: 4000,
    category: 'other',
  },

  // ==== 其他类型 ====
  XMLTYPE: {
    type: 'XMLTYPE',
    color: TYPE_COLORS.json,
    checkDefault: validators.any,
    hasCheck: false,
    isSized: false,
    hasPrecision: false,
    category: 'other',
  },
  JSON: {
    type: 'JSON',
    color: TYPE_COLORS.json,
    checkDefault: validators.isJSON,
    hasCheck: false,
    isSized: false,
    hasPrecision: false,
    category: 'json',
  },
  SDO_GEOMETRY: {
    type: 'SDO_GEOMETRY',
    color: TYPE_COLORS.geometric,
    checkDefault: validators.any,
    hasCheck: false,
    isSized: false,
    hasPrecision: false,
    category: 'geometric',
  },

  // ==== LONG 类型 (已废弃，但仍支持) ====
  LONG: {
    type: 'LONG',
    color: TYPE_COLORS.string,
    checkDefault: validators.any,
    hasCheck: false,
    isSized: false,
    hasPrecision: false,
    hasQuotes: true,
    category: 'string',
  },
}

/**
 * Oracle 完整数据类型映射表
 */
export const oracleTypes: Record<string, DataTypeDefinition> = {
  ...oracleSpecificTypes,
}

/**
 * Oracle 数据类型列表（按分类）
 */
export const oracleTypeCategories: Record<string, string[]> = {
  数字: ['NUMBER', 'BINARY_FLOAT', 'BINARY_DOUBLE', 'FLOAT'],
  字符: ['VARCHAR2', 'NVARCHAR2', 'CHAR', 'NCHAR', 'LONG'],
  大对象: ['CLOB', 'NCLOB', 'BLOB', 'BFILE'],
  日期时间: [
    'DATE',
    'TIMESTAMP',
    'TIMESTAMP WITH TIME ZONE',
    'TIMESTAMP WITH LOCAL TIME ZONE',
    'INTERVAL YEAR TO MONTH',
    'INTERVAL DAY TO SECOND',
  ],
  二进制: ['RAW', 'LONG RAW'],
  行标识: ['ROWID', 'UROWID'],
  其他: ['XMLTYPE', 'JSON', 'SDO_GEOMETRY'],
}

export { oracleValidators }
