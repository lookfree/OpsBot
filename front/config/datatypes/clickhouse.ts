/**
 * ClickHouse 数据类型定义
 *
 * ClickHouse 是列式分析数据库，具有独特的数据类型系统，
 * 包括多种整数类型、Nullable 包装和复合类型。
 */

import type { DataTypeDefinition } from './types'
import { TYPE_COLORS, validators } from './base'

/**
 * ClickHouse 数据类型定义
 */
export const clickhouseTypes: Record<string, DataTypeDefinition> = {
  // ==== 有符号整数类型 ====
  Int8: {
    type: 'Int8',
    color: TYPE_COLORS.integer,
    checkDefault: validators.isInteger,
    hasCheck: false,
    isSized: false,
    hasPrecision: false,
    category: 'integer',
  },
  Int16: {
    type: 'Int16',
    color: TYPE_COLORS.integer,
    checkDefault: validators.isInteger,
    hasCheck: false,
    isSized: false,
    hasPrecision: false,
    category: 'integer',
  },
  Int32: {
    type: 'Int32',
    color: TYPE_COLORS.integer,
    checkDefault: validators.isInteger,
    hasCheck: false,
    isSized: false,
    hasPrecision: false,
    category: 'integer',
  },
  Int64: {
    type: 'Int64',
    color: TYPE_COLORS.integer,
    checkDefault: validators.isInteger,
    hasCheck: false,
    isSized: false,
    hasPrecision: false,
    category: 'integer',
  },
  Int128: {
    type: 'Int128',
    color: TYPE_COLORS.integer,
    checkDefault: validators.isInteger,
    hasCheck: false,
    isSized: false,
    hasPrecision: false,
    category: 'integer',
  },
  Int256: {
    type: 'Int256',
    color: TYPE_COLORS.integer,
    checkDefault: validators.isInteger,
    hasCheck: false,
    isSized: false,
    hasPrecision: false,
    category: 'integer',
  },

  // ==== 无符号整数类型 ====
  UInt8: {
    type: 'UInt8',
    color: TYPE_COLORS.integer,
    checkDefault: validators.isInteger,
    hasCheck: false,
    isSized: false,
    hasPrecision: false,
    category: 'integer',
  },
  UInt16: {
    type: 'UInt16',
    color: TYPE_COLORS.integer,
    checkDefault: validators.isInteger,
    hasCheck: false,
    isSized: false,
    hasPrecision: false,
    category: 'integer',
  },
  UInt32: {
    type: 'UInt32',
    color: TYPE_COLORS.integer,
    checkDefault: validators.isInteger,
    hasCheck: false,
    isSized: false,
    hasPrecision: false,
    category: 'integer',
  },
  UInt64: {
    type: 'UInt64',
    color: TYPE_COLORS.integer,
    checkDefault: validators.isInteger,
    hasCheck: false,
    isSized: false,
    hasPrecision: false,
    category: 'integer',
  },
  UInt128: {
    type: 'UInt128',
    color: TYPE_COLORS.integer,
    checkDefault: validators.isInteger,
    hasCheck: false,
    isSized: false,
    hasPrecision: false,
    category: 'integer',
  },
  UInt256: {
    type: 'UInt256',
    color: TYPE_COLORS.integer,
    checkDefault: validators.isInteger,
    hasCheck: false,
    isSized: false,
    hasPrecision: false,
    category: 'integer',
  },

  // ==== 浮点类型 ====
  Float32: {
    type: 'Float32',
    color: TYPE_COLORS.decimal,
    checkDefault: validators.isDecimal,
    hasCheck: false,
    isSized: false,
    hasPrecision: false,
    category: 'decimal',
  },
  Float64: {
    type: 'Float64',
    color: TYPE_COLORS.decimal,
    checkDefault: validators.isDecimal,
    hasCheck: false,
    isSized: false,
    hasPrecision: false,
    category: 'decimal',
  },

  // ==== 定点数类型 ====
  Decimal: {
    type: 'Decimal',
    color: TYPE_COLORS.decimal,
    checkDefault: validators.isDecimal,
    hasCheck: false,
    isSized: false,
    hasPrecision: true,
    defaultPrecision: 10,
    defaultScale: 2,
    category: 'decimal',
  },
  Decimal32: {
    type: 'Decimal32',
    color: TYPE_COLORS.decimal,
    checkDefault: validators.isDecimal,
    hasCheck: false,
    isSized: true,
    hasPrecision: false,
    defaultSize: 2,
    category: 'decimal',
  },
  Decimal64: {
    type: 'Decimal64',
    color: TYPE_COLORS.decimal,
    checkDefault: validators.isDecimal,
    hasCheck: false,
    isSized: true,
    hasPrecision: false,
    defaultSize: 2,
    category: 'decimal',
  },
  Decimal128: {
    type: 'Decimal128',
    color: TYPE_COLORS.decimal,
    checkDefault: validators.isDecimal,
    hasCheck: false,
    isSized: true,
    hasPrecision: false,
    defaultSize: 2,
    category: 'decimal',
  },
  Decimal256: {
    type: 'Decimal256',
    color: TYPE_COLORS.decimal,
    checkDefault: validators.isDecimal,
    hasCheck: false,
    isSized: true,
    hasPrecision: false,
    defaultSize: 2,
    category: 'decimal',
  },

  // ==== 字符串类型 ====
  String: {
    type: 'String',
    color: TYPE_COLORS.string,
    checkDefault: validators.any,
    hasCheck: false,
    isSized: false,
    hasPrecision: false,
    hasQuotes: true,
    category: 'string',
  },
  FixedString: {
    type: 'FixedString',
    color: TYPE_COLORS.string,
    checkDefault: validators.any,
    hasCheck: false,
    isSized: true,
    hasPrecision: false,
    defaultSize: 32,
    hasQuotes: true,
    category: 'string',
  },
  UUID: {
    type: 'UUID',
    color: TYPE_COLORS.string,
    checkDefault: validators.any,
    hasCheck: false,
    isSized: false,
    hasPrecision: false,
    hasQuotes: true,
    category: 'string',
  },

  // ==== 日期时间类型 ====
  Date: {
    type: 'Date',
    color: TYPE_COLORS.datetime,
    checkDefault: validators.isDate,
    hasCheck: false,
    isSized: false,
    hasPrecision: false,
    hasQuotes: true,
    category: 'datetime',
  },
  Date32: {
    type: 'Date32',
    color: TYPE_COLORS.datetime,
    checkDefault: validators.isDate,
    hasCheck: false,
    isSized: false,
    hasPrecision: false,
    hasQuotes: true,
    category: 'datetime',
  },
  DateTime: {
    type: 'DateTime',
    color: TYPE_COLORS.datetime,
    checkDefault: validators.isDateTime,
    hasCheck: false,
    isSized: false,
    hasPrecision: false,
    hasQuotes: true,
    category: 'datetime',
  },
  DateTime64: {
    type: 'DateTime64',
    color: TYPE_COLORS.datetime,
    checkDefault: validators.isDateTime,
    hasCheck: false,
    isSized: true,
    hasPrecision: false,
    defaultSize: 3,
    hasQuotes: true,
    category: 'datetime',
  },

  // ==== 布尔类型 ====
  Bool: {
    type: 'Bool',
    color: TYPE_COLORS.boolean,
    checkDefault: validators.isBoolean,
    hasCheck: false,
    isSized: false,
    hasPrecision: false,
    category: 'boolean',
  },

  // ==== 网络类型 ====
  IPv4: {
    type: 'IPv4',
    color: TYPE_COLORS.network,
    checkDefault: validators.any,
    hasCheck: false,
    isSized: false,
    hasPrecision: false,
    hasQuotes: true,
    category: 'network',
  },
  IPv6: {
    type: 'IPv6',
    color: TYPE_COLORS.network,
    checkDefault: validators.any,
    hasCheck: false,
    isSized: false,
    hasPrecision: false,
    hasQuotes: true,
    category: 'network',
  },

  // ==== JSON 类型 ====
  JSON: {
    type: 'JSON',
    color: TYPE_COLORS.json,
    checkDefault: validators.any,
    hasCheck: false,
    isSized: false,
    hasPrecision: false,
    category: 'json',
  },

  // ==== 枚举类型 ====
  Enum8: {
    type: 'Enum8',
    color: TYPE_COLORS.string,
    checkDefault: validators.any,
    hasCheck: false,
    isSized: false,
    hasPrecision: false,
    hasQuotes: true,
    category: 'string',
  },
  Enum16: {
    type: 'Enum16',
    color: TYPE_COLORS.string,
    checkDefault: validators.any,
    hasCheck: false,
    isSized: false,
    hasPrecision: false,
    hasQuotes: true,
    category: 'string',
  },

  // ==== 低基数优化 ====
  LowCardinality: {
    type: 'LowCardinality',
    color: TYPE_COLORS.string,
    checkDefault: validators.any,
    hasCheck: false,
    isSized: false,
    hasPrecision: false,
    category: 'other',
  },
}

/**
 * ClickHouse 数据类型分类
 */
export const clickhouseTypeCategories: Record<string, string[]> = {
  有符号整数: ['Int8', 'Int16', 'Int32', 'Int64', 'Int128', 'Int256'],
  无符号整数: ['UInt8', 'UInt16', 'UInt32', 'UInt64', 'UInt128', 'UInt256'],
  浮点数: ['Float32', 'Float64'],
  定点数: ['Decimal', 'Decimal32', 'Decimal64', 'Decimal128', 'Decimal256'],
  字符串: ['String', 'FixedString', 'UUID'],
  日期时间: ['Date', 'Date32', 'DateTime', 'DateTime64'],
  布尔: ['Bool'],
  网络: ['IPv4', 'IPv6'],
  JSON: ['JSON'],
  枚举: ['Enum8', 'Enum16'],
  特殊: ['LowCardinality'],
}
