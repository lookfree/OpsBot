/**
 * MySQL 数据类型定义
 */

import type { DataTypeDefinition } from './types'
import { baseTypes, TYPE_COLORS, validators } from './base'

/**
 * MySQL 特有的数据类型
 */
const mysqlSpecificTypes: Record<string, DataTypeDefinition> = {
  // MySQL 特有整数类型
  TINYINT: {
    type: 'TINYINT',
    color: TYPE_COLORS.integer,
    checkDefault: validators.isInteger,
    hasCheck: true,
    isSized: false,
    hasPrecision: false,
    canIncrement: true,
    signed: true,
    category: 'integer',
  },
  MEDIUMINT: {
    type: 'MEDIUMINT',
    color: TYPE_COLORS.integer,
    checkDefault: validators.isInteger,
    hasCheck: true,
    isSized: false,
    hasPrecision: false,
    canIncrement: true,
    signed: true,
    category: 'integer',
  },

  // 为基础整数类型添加 signed 支持
  INT: {
    ...baseTypes.INT,
    signed: true,
  },
  SMALLINT: {
    ...baseTypes.SMALLINT,
    signed: true,
  },
  BIGINT: {
    ...baseTypes.BIGINT,
    signed: true,
  },

  // MySQL 特有字符串类型
  TINYTEXT: {
    type: 'TINYTEXT',
    color: TYPE_COLORS.string,
    checkDefault: validators.any,
    hasCheck: false,
    isSized: false,
    hasPrecision: false,
    hasQuotes: true,
    category: 'string',
  },
  MEDIUMTEXT: {
    type: 'MEDIUMTEXT',
    color: TYPE_COLORS.string,
    checkDefault: validators.any,
    hasCheck: false,
    isSized: false,
    hasPrecision: false,
    hasQuotes: true,
    category: 'string',
  },
  LONGTEXT: {
    type: 'LONGTEXT',
    color: TYPE_COLORS.string,
    checkDefault: validators.any,
    hasCheck: false,
    isSized: false,
    hasPrecision: false,
    hasQuotes: true,
    category: 'string',
  },

  // MySQL 特有二进制类型
  TINYBLOB: {
    type: 'TINYBLOB',
    color: TYPE_COLORS.binary,
    checkDefault: validators.any,
    hasCheck: false,
    isSized: false,
    hasPrecision: false,
    category: 'binary',
  },
  MEDIUMBLOB: {
    type: 'MEDIUMBLOB',
    color: TYPE_COLORS.binary,
    checkDefault: validators.any,
    hasCheck: false,
    isSized: false,
    hasPrecision: false,
    category: 'binary',
  },
  LONGBLOB: {
    type: 'LONGBLOB',
    color: TYPE_COLORS.binary,
    checkDefault: validators.any,
    hasCheck: false,
    isSized: false,
    hasPrecision: false,
    category: 'binary',
  },

  // MySQL 特有日期类型
  YEAR: {
    type: 'YEAR',
    color: TYPE_COLORS.datetime,
    checkDefault: validators.isYear,
    hasCheck: false,
    isSized: false,
    hasPrecision: false,
    category: 'datetime',
  },

  // MySQL 枚举和集合类型
  ENUM: {
    type: 'ENUM',
    color: TYPE_COLORS.string,
    checkDefault: validators.any,
    hasCheck: false,
    isSized: false,
    hasPrecision: false,
    hasQuotes: true,
    category: 'string',
  },
  SET: {
    type: 'SET',
    color: TYPE_COLORS.string,
    checkDefault: validators.any,
    hasCheck: false,
    isSized: false,
    hasPrecision: false,
    hasQuotes: true,
    category: 'string',
  },

  // MySQL 位类型
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

  // MySQL 几何类型
  GEOMETRY: {
    type: 'GEOMETRY',
    color: TYPE_COLORS.geometric,
    checkDefault: validators.any,
    hasCheck: false,
    isSized: false,
    hasPrecision: false,
    category: 'geometric',
  },
  POINT: {
    type: 'POINT',
    color: TYPE_COLORS.geometric,
    checkDefault: validators.any,
    hasCheck: false,
    isSized: false,
    hasPrecision: false,
    category: 'geometric',
  },
  LINESTRING: {
    type: 'LINESTRING',
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
  MULTIPOINT: {
    type: 'MULTIPOINT',
    color: TYPE_COLORS.geometric,
    checkDefault: validators.any,
    hasCheck: false,
    isSized: false,
    hasPrecision: false,
    category: 'geometric',
  },
  MULTILINESTRING: {
    type: 'MULTILINESTRING',
    color: TYPE_COLORS.geometric,
    checkDefault: validators.any,
    hasCheck: false,
    isSized: false,
    hasPrecision: false,
    category: 'geometric',
  },
  MULTIPOLYGON: {
    type: 'MULTIPOLYGON',
    color: TYPE_COLORS.geometric,
    checkDefault: validators.any,
    hasCheck: false,
    isSized: false,
    hasPrecision: false,
    category: 'geometric',
  },
  GEOMETRYCOLLECTION: {
    type: 'GEOMETRYCOLLECTION',
    color: TYPE_COLORS.geometric,
    checkDefault: validators.any,
    hasCheck: false,
    isSized: false,
    hasPrecision: false,
    category: 'geometric',
  },
}

/**
 * MySQL 完整数据类型映射表
 */
export const mysqlTypes: Record<string, DataTypeDefinition> = {
  ...baseTypes,
  ...mysqlSpecificTypes,
}

/**
 * MySQL 数据类型列表（按分类）
 */
export const mysqlTypeCategories = {
  整数: ['TINYINT', 'SMALLINT', 'MEDIUMINT', 'INT', 'BIGINT'],
  小数: ['DECIMAL', 'NUMERIC', 'FLOAT', 'DOUBLE', 'REAL'],
  字符串: ['CHAR', 'VARCHAR', 'TINYTEXT', 'TEXT', 'MEDIUMTEXT', 'LONGTEXT', 'ENUM', 'SET'],
  日期时间: ['DATE', 'TIME', 'DATETIME', 'TIMESTAMP', 'YEAR'],
  二进制: ['BINARY', 'VARBINARY', 'TINYBLOB', 'BLOB', 'MEDIUMBLOB', 'LONGBLOB', 'BIT'],
  JSON: ['JSON'],
  几何: ['GEOMETRY', 'POINT', 'LINESTRING', 'POLYGON', 'MULTIPOINT', 'MULTILINESTRING', 'MULTIPOLYGON', 'GEOMETRYCOLLECTION'],
}
