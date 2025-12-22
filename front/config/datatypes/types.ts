/**
 * 数据类型定义接口
 *
 * 参考 DrawDB 的数据类型系统设计，为每种数据类型定义元数据，
 * 用于控制 UI 显示和默认值验证。
 */

/**
 * 字段定义（用于验证函数）
 */
export interface FieldForValidation {
  name: string
  type: string
  default: string
  size?: number
  precision?: number
  scale?: number
}

/**
 * 数据类型定义
 */
export interface DataTypeDefinition {
  /** 类型名称 */
  type: string

  /** UI 显示颜色（Tailwind 颜色类名） */
  color: string

  /** 默认值验证函数 */
  checkDefault?: (field: FieldForValidation) => boolean

  /** 是否支持 CHECK 约束 */
  hasCheck: boolean

  /** 是否需要指定长度 (如 VARCHAR(255)) */
  isSized: boolean

  /** 是否需要指定精度 (如 DECIMAL(10,2)) */
  hasPrecision: boolean

  /** 默认长度 */
  defaultSize?: number

  /** 默认精度 */
  defaultPrecision?: number

  /** 默认小数位 */
  defaultScale?: number

  /** 是否支持自增 */
  canIncrement?: boolean

  /** 是否支持 UNSIGNED (MySQL/MariaDB) */
  signed?: boolean

  /** 默认值是否需要引号包裹 */
  hasQuotes?: boolean

  /** 类型分类 */
  category?: 'integer' | 'decimal' | 'string' | 'datetime' | 'boolean' | 'binary' | 'json' | 'geometric' | 'network' | 'other'
}

/**
 * 数据类型映射表
 */
export type DataTypeMap = Record<string, DataTypeDefinition>

/**
 * 支持的数据库类型
 */
export type DatabaseType = 'mysql' | 'postgresql' | 'mariadb' | 'sqlite' | 'mssql' | 'oracle'

/**
 * 类型分类
 */
export interface TypeCategory {
  name: string
  types: string[]
}

/**
 * 按分类组织的类型
 */
export type TypesByCategory = Record<string, string[]>
