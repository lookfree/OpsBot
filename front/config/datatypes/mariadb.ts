/**
 * MariaDB 数据类型定义
 *
 * MariaDB 是 MySQL 的开源分支，兼容 MySQL 的所有类型，
 * 同时增加了一些 MariaDB 特有的类型。
 */

import type { DataTypeDefinition, FieldForValidation } from './types'
import { baseTypes, TYPE_COLORS, validators } from './base'

/**
 * MariaDB 特有验证函数
 */
const mariadbValidators = {
  /** IPv4 地址验证 */
  isIPv4: (field: FieldForValidation): boolean => {
    return /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/.test(
      field.default
    )
  },

  /** IPv6 地址验证 */
  isIPv6: (field: FieldForValidation): boolean => {
    // 简化的 IPv6 验证
    return /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/.test(field.default)
  },

  /** UUID 或 UUID() 函数验证 */
  isUUIDOrFunction: (field: FieldForValidation): boolean => {
    const upper = field.default.toUpperCase()
    if (upper === 'UUID()') {
      return true
    }
    return validators.isUUID(field)
  },
}

/**
 * MariaDB 特有的数据类型（与 MySQL 共享的部分）
 */
const mysqlCompatibleTypes: Record<string, DataTypeDefinition> = {
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

  // 文本类型
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

  // 二进制类型
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

  // 日期类型
  YEAR: {
    type: 'YEAR',
    color: TYPE_COLORS.datetime,
    checkDefault: validators.isYear,
    hasCheck: false,
    isSized: false,
    hasPrecision: false,
    category: 'datetime',
  },

  // 枚举和集合类型
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

  // 位类型
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

  // 几何类型
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
 * MariaDB 独有的数据类型
 */
const mariadbOnlyTypes: Record<string, DataTypeDefinition> = {
  // UUID 类型 (MariaDB 10.7+)
  UUID: {
    type: 'UUID',
    color: TYPE_COLORS.string,
    checkDefault: mariadbValidators.isUUIDOrFunction,
    hasCheck: false,
    isSized: false,
    hasPrecision: false,
    hasQuotes: true,
    category: 'string',
  },

  // 网络类型 (MariaDB 10.10+)
  INET4: {
    type: 'INET4',
    color: TYPE_COLORS.network,
    checkDefault: mariadbValidators.isIPv4,
    hasCheck: false,
    isSized: false,
    hasPrecision: false,
    hasQuotes: true,
    category: 'network',
  },
  INET6: {
    type: 'INET6',
    color: TYPE_COLORS.network,
    checkDefault: mariadbValidators.isIPv6,
    hasCheck: false,
    isSized: false,
    hasPrecision: false,
    hasQuotes: true,
    category: 'network',
  },
}

/**
 * MariaDB 完整数据类型映射表
 */
export const mariadbTypes: Record<string, DataTypeDefinition> = {
  ...baseTypes,
  ...mysqlCompatibleTypes,
  ...mariadbOnlyTypes,
}

/**
 * MariaDB 数据类型列表（按分类）
 */
export const mariadbTypeCategories = {
  整数: ['TINYINT', 'SMALLINT', 'MEDIUMINT', 'INT', 'BIGINT'],
  小数: ['DECIMAL', 'NUMERIC', 'FLOAT', 'DOUBLE', 'REAL'],
  字符串: ['CHAR', 'VARCHAR', 'TINYTEXT', 'TEXT', 'MEDIUMTEXT', 'LONGTEXT', 'ENUM', 'SET', 'UUID'],
  日期时间: ['DATE', 'TIME', 'DATETIME', 'TIMESTAMP', 'YEAR'],
  二进制: ['BINARY', 'VARBINARY', 'TINYBLOB', 'BLOB', 'MEDIUMBLOB', 'LONGBLOB', 'BIT'],
  JSON: ['JSON'],
  网络: ['INET4', 'INET6'],
  几何: [
    'GEOMETRY',
    'POINT',
    'LINESTRING',
    'POLYGON',
    'MULTIPOINT',
    'MULTILINESTRING',
    'MULTIPOLYGON',
    'GEOMETRYCOLLECTION',
  ],
}
