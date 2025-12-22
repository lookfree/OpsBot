/**
 * PostgreSQL 数据类型定义
 */

import type { DataTypeDefinition } from './types'
import { baseTypes, TYPE_COLORS, validators } from './base'

/**
 * PostgreSQL 特有的数据类型
 */
const postgresSpecificTypes: Record<string, DataTypeDefinition> = {
  // PostgreSQL 序列类型（自增）
  SERIAL: {
    type: 'SERIAL',
    color: TYPE_COLORS.integer,
    checkDefault: validators.isInteger,
    hasCheck: true,
    isSized: false,
    hasPrecision: false,
    canIncrement: true,
    category: 'integer',
  },
  SMALLSERIAL: {
    type: 'SMALLSERIAL',
    color: TYPE_COLORS.integer,
    checkDefault: validators.isInteger,
    hasCheck: true,
    isSized: false,
    hasPrecision: false,
    canIncrement: true,
    category: 'integer',
  },
  BIGSERIAL: {
    type: 'BIGSERIAL',
    color: TYPE_COLORS.integer,
    checkDefault: validators.isInteger,
    hasCheck: true,
    isSized: false,
    hasPrecision: false,
    canIncrement: true,
    category: 'integer',
  },

  // PostgreSQL 特有精度类型
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
  DOUBLE_PRECISION: {
    type: 'DOUBLE PRECISION',
    color: TYPE_COLORS.decimal,
    checkDefault: validators.isDecimal,
    hasCheck: true,
    isSized: false,
    hasPrecision: false,
    category: 'decimal',
  },
  MONEY: {
    type: 'MONEY',
    color: TYPE_COLORS.decimal,
    checkDefault: validators.isDecimal,
    hasCheck: true,
    isSized: false,
    hasPrecision: false,
    category: 'decimal',
  },

  // PostgreSQL 字符串类型
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
  CHARACTER_VARYING: {
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

  // PostgreSQL UUID 类型
  UUID: {
    type: 'UUID',
    color: TYPE_COLORS.string,
    checkDefault: validators.isUUID,
    hasCheck: false,
    isSized: false,
    hasPrecision: false,
    hasQuotes: true,
    category: 'string',
  },

  // PostgreSQL JSON 类型
  JSONB: {
    type: 'JSONB',
    color: TYPE_COLORS.json,
    checkDefault: validators.isJSON,
    hasCheck: false,
    isSized: false,
    hasPrecision: false,
    category: 'json',
  },

  // PostgreSQL 数组类型
  ARRAY: {
    type: 'ARRAY',
    color: TYPE_COLORS.other,
    checkDefault: validators.any,
    hasCheck: false,
    isSized: false,
    hasPrecision: false,
    category: 'other',
  },

  // PostgreSQL 二进制类型
  BYTEA: {
    type: 'BYTEA',
    color: TYPE_COLORS.binary,
    checkDefault: validators.any,
    hasCheck: false,
    isSized: false,
    hasPrecision: false,
    category: 'binary',
  },

  // PostgreSQL 日期时间类型
  TIMESTAMPTZ: {
    type: 'TIMESTAMPTZ',
    color: TYPE_COLORS.datetime,
    checkDefault: validators.isDateTime,
    hasCheck: false,
    isSized: false,
    hasPrecision: false,
    hasQuotes: true,
    category: 'datetime',
  },
  TIMESTAMP_WITH_TIME_ZONE: {
    type: 'TIMESTAMP WITH TIME ZONE',
    color: TYPE_COLORS.datetime,
    checkDefault: validators.isDateTime,
    hasCheck: false,
    isSized: false,
    hasPrecision: false,
    hasQuotes: true,
    category: 'datetime',
  },
  TIMETZ: {
    type: 'TIMETZ',
    color: TYPE_COLORS.datetime,
    checkDefault: validators.isTime,
    hasCheck: false,
    isSized: false,
    hasPrecision: false,
    hasQuotes: true,
    category: 'datetime',
  },
  TIME_WITH_TIME_ZONE: {
    type: 'TIME WITH TIME ZONE',
    color: TYPE_COLORS.datetime,
    checkDefault: validators.isTime,
    hasCheck: false,
    isSized: false,
    hasPrecision: false,
    hasQuotes: true,
    category: 'datetime',
  },
  INTERVAL: {
    type: 'INTERVAL',
    color: TYPE_COLORS.datetime,
    checkDefault: validators.any,
    hasCheck: false,
    isSized: false,
    hasPrecision: false,
    hasQuotes: true,
    category: 'datetime',
  },

  // PostgreSQL 网络类型
  CIDR: {
    type: 'CIDR',
    color: TYPE_COLORS.network,
    checkDefault: validators.any,
    hasCheck: false,
    isSized: false,
    hasPrecision: false,
    hasQuotes: true,
    category: 'network',
  },
  INET: {
    type: 'INET',
    color: TYPE_COLORS.network,
    checkDefault: validators.any,
    hasCheck: false,
    isSized: false,
    hasPrecision: false,
    hasQuotes: true,
    category: 'network',
  },
  MACADDR: {
    type: 'MACADDR',
    color: TYPE_COLORS.network,
    checkDefault: validators.any,
    hasCheck: false,
    isSized: false,
    hasPrecision: false,
    hasQuotes: true,
    category: 'network',
  },
  MACADDR8: {
    type: 'MACADDR8',
    color: TYPE_COLORS.network,
    checkDefault: validators.any,
    hasCheck: false,
    isSized: false,
    hasPrecision: false,
    hasQuotes: true,
    category: 'network',
  },

  // PostgreSQL 几何类型
  POINT: {
    type: 'POINT',
    color: TYPE_COLORS.geometric,
    checkDefault: validators.any,
    hasCheck: false,
    isSized: false,
    hasPrecision: false,
    category: 'geometric',
  },
  LINE: {
    type: 'LINE',
    color: TYPE_COLORS.geometric,
    checkDefault: validators.any,
    hasCheck: false,
    isSized: false,
    hasPrecision: false,
    category: 'geometric',
  },
  LSEG: {
    type: 'LSEG',
    color: TYPE_COLORS.geometric,
    checkDefault: validators.any,
    hasCheck: false,
    isSized: false,
    hasPrecision: false,
    category: 'geometric',
  },
  BOX: {
    type: 'BOX',
    color: TYPE_COLORS.geometric,
    checkDefault: validators.any,
    hasCheck: false,
    isSized: false,
    hasPrecision: false,
    category: 'geometric',
  },
  PATH: {
    type: 'PATH',
    color: TYPE_COLORS.geometric,
    checkDefault: validators.any,
    hasCheck: false,
    isSized: false,
    hasPrecision: false,
    category: 'geometric',
  },
  POLYGON: {
    type: 'POLYGON',
    color: TYPE_COLORS.geometric,
    checkDefault: validators.any,
    hasCheck: false,
    isSized: false,
    hasPrecision: false,
    category: 'geometric',
  },
  CIRCLE: {
    type: 'CIRCLE',
    color: TYPE_COLORS.geometric,
    checkDefault: validators.any,
    hasCheck: false,
    isSized: false,
    hasPrecision: false,
    category: 'geometric',
  },

  // PostgreSQL 全文搜索类型
  TSVECTOR: {
    type: 'TSVECTOR',
    color: TYPE_COLORS.other,
    checkDefault: validators.any,
    hasCheck: false,
    isSized: false,
    hasPrecision: false,
    category: 'other',
  },
  TSQUERY: {
    type: 'TSQUERY',
    color: TYPE_COLORS.other,
    checkDefault: validators.any,
    hasCheck: false,
    isSized: false,
    hasPrecision: false,
    category: 'other',
  },

  // PostgreSQL 范围类型
  INT4RANGE: {
    type: 'INT4RANGE',
    color: TYPE_COLORS.other,
    checkDefault: validators.any,
    hasCheck: false,
    isSized: false,
    hasPrecision: false,
    category: 'other',
  },
  INT8RANGE: {
    type: 'INT8RANGE',
    color: TYPE_COLORS.other,
    checkDefault: validators.any,
    hasCheck: false,
    isSized: false,
    hasPrecision: false,
    category: 'other',
  },
  NUMRANGE: {
    type: 'NUMRANGE',
    color: TYPE_COLORS.other,
    checkDefault: validators.any,
    hasCheck: false,
    isSized: false,
    hasPrecision: false,
    category: 'other',
  },
  TSRANGE: {
    type: 'TSRANGE',
    color: TYPE_COLORS.other,
    checkDefault: validators.any,
    hasCheck: false,
    isSized: false,
    hasPrecision: false,
    category: 'other',
  },
  TSTZRANGE: {
    type: 'TSTZRANGE',
    color: TYPE_COLORS.other,
    checkDefault: validators.any,
    hasCheck: false,
    isSized: false,
    hasPrecision: false,
    category: 'other',
  },
  DATERANGE: {
    type: 'DATERANGE',
    color: TYPE_COLORS.other,
    checkDefault: validators.any,
    hasCheck: false,
    isSized: false,
    hasPrecision: false,
    category: 'other',
  },

  // PostgreSQL XML 类型
  XML: {
    type: 'XML',
    color: TYPE_COLORS.other,
    checkDefault: validators.any,
    hasCheck: false,
    isSized: false,
    hasPrecision: false,
    category: 'other',
  },

  // PostgreSQL 位类型
  BIT: {
    type: 'BIT',
    color: TYPE_COLORS.binary,
    checkDefault: (field) => field.default === '0' || field.default === '1',
    hasCheck: true,
    isSized: true,
    hasPrecision: false,
    defaultSize: 1,
    category: 'binary',
  },
  BIT_VARYING: {
    type: 'BIT VARYING',
    color: TYPE_COLORS.binary,
    checkDefault: validators.isBinary,
    hasCheck: false,
    isSized: true,
    hasPrecision: false,
    category: 'binary',
  },

  // PostgreSQL 布尔类型
  BOOL: {
    type: 'BOOL',
    color: TYPE_COLORS.boolean,
    checkDefault: validators.isBoolean,
    hasCheck: false,
    isSized: false,
    hasPrecision: false,
    category: 'boolean',
  },
}

/**
 * PostgreSQL 完整数据类型映射表
 */
export const postgresqlTypes: Record<string, DataTypeDefinition> = {
  ...baseTypes,
  ...postgresSpecificTypes,
}

/**
 * PostgreSQL 数据类型列表（按分类）
 */
export const postgresqlTypeCategories = {
  整数: ['SMALLINT', 'INTEGER', 'INT', 'BIGINT', 'SMALLSERIAL', 'SERIAL', 'BIGSERIAL'],
  小数: ['DECIMAL', 'NUMERIC', 'REAL', 'DOUBLE_PRECISION', 'MONEY'],
  字符串: ['CHAR', 'CHARACTER', 'VARCHAR', 'CHARACTER_VARYING', 'TEXT', 'UUID'],
  日期时间: ['DATE', 'TIME', 'TIMETZ', 'TIME_WITH_TIME_ZONE', 'TIMESTAMP', 'TIMESTAMPTZ', 'TIMESTAMP_WITH_TIME_ZONE', 'INTERVAL'],
  布尔: ['BOOLEAN', 'BOOL'],
  二进制: ['BYTEA', 'BIT', 'BIT_VARYING'],
  JSON: ['JSON', 'JSONB'],
  几何: ['POINT', 'LINE', 'LSEG', 'BOX', 'PATH', 'POLYGON', 'CIRCLE'],
  网络: ['CIDR', 'INET', 'MACADDR', 'MACADDR8'],
  全文搜索: ['TSVECTOR', 'TSQUERY'],
  范围: ['INT4RANGE', 'INT8RANGE', 'NUMRANGE', 'TSRANGE', 'TSTZRANGE', 'DATERANGE'],
  其他: ['ARRAY', 'XML'],
}
