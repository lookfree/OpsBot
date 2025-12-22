/**
 * 数据类型配置统一入口
 *
 * 提供跨数据库的类型查询和工具函数
 */

import type { DataTypeDefinition, DataTypeMap, DatabaseType, TypesByCategory } from './types'
import { mysqlTypes, mysqlTypeCategories } from './mysql'
import { mariadbTypes, mariadbTypeCategories } from './mariadb'
import { postgresqlTypes, postgresqlTypeCategories } from './postgresql'
import { oracleTypes, oracleTypeCategories } from './oracle'
import { mssqlTypes, mssqlTypeCategories } from './mssql'

// ============================================================================
// 类型映射表
// ============================================================================

/**
 * 数据库类型到数据类型映射表的映射
 */
const dbToTypesMap: Record<DatabaseType, DataTypeMap> = {
  mysql: mysqlTypes,
  mariadb: mariadbTypes,
  postgresql: postgresqlTypes,
  oracle: oracleTypes,
  mssql: mssqlTypes,
  // 以下数据库类型暂时使用 MySQL 类型作为占位符，待后续实现
  sqlite: mysqlTypes,  // 待实现
}

/**
 * 数据库类型到分类映射表的映射
 */
const dbToCategoriesMap: Record<DatabaseType, Record<string, string[]>> = {
  mysql: mysqlTypeCategories,
  mariadb: mariadbTypeCategories,
  postgresql: postgresqlTypeCategories,
  oracle: oracleTypeCategories,
  mssql: mssqlTypeCategories,
  sqlite: mysqlTypeCategories,
}

// ============================================================================
// 查询函数
// ============================================================================

/**
 * 获取指定数据库的所有数据类型
 * @param dbType 数据库类型
 * @returns 数据类型映射表
 */
export function getDataTypes(dbType: DatabaseType): DataTypeMap {
  return dbToTypesMap[dbType] || mysqlTypes
}

/**
 * 获取指定数据库的单个数据类型定义
 * @param dbType 数据库类型
 * @param typeName 类型名称
 * @returns 数据类型定义，如果不存在则返回 undefined
 */
export function getDataType(dbType: DatabaseType, typeName: string): DataTypeDefinition | undefined {
  const types = getDataTypes(dbType)
  // 尝试直接匹配
  if (types[typeName]) {
    return types[typeName]
  }
  // 尝试大写匹配
  const upperName = typeName.toUpperCase()
  if (types[upperName]) {
    return types[upperName]
  }
  // 尝试替换空格为下划线匹配
  const normalizedName = upperName.replace(/ /g, '_')
  return types[normalizedName]
}

/**
 * 获取指定数据库的所有数据类型名称列表
 * @param dbType 数据库类型
 * @returns 类型名称数组
 */
export function getDataTypeNames(dbType: DatabaseType): string[] {
  return Object.keys(getDataTypes(dbType))
}

/**
 * 获取指定数据库的数据类型按分类组织
 * @param dbType 数据库类型
 * @returns 按分类组织的类型名称
 */
export function getTypesByCategory(dbType: DatabaseType): TypesByCategory {
  return dbToCategoriesMap[dbType] || mysqlTypeCategories
}

/**
 * 获取指定数据库指定分类的数据类型
 * @param dbType 数据库类型
 * @param category 分类名称
 * @returns 类型名称数组
 */
export function getTypesBySpecificCategory(dbType: DatabaseType, category: string): string[] {
  const categories = getTypesByCategory(dbType)
  return categories[category] || []
}

// ============================================================================
// 验证函数
// ============================================================================

/**
 * 验证字段默认值是否合法
 * @param dbType 数据库类型
 * @param typeName 类型名称
 * @param defaultValue 默认值
 * @param size 长度（可选）
 * @returns 是否合法
 */
export function validateDefaultValue(
  dbType: DatabaseType,
  typeName: string,
  defaultValue: string,
  size?: number
): boolean {
  const typeConfig = getDataType(dbType, typeName)
  if (!typeConfig || !typeConfig.checkDefault) {
    return true // 没有验证函数，默认通过
  }
  return typeConfig.checkDefault({
    name: '',
    type: typeName,
    default: defaultValue,
    size,
  })
}

/**
 * 检查类型是否支持自增
 * @param dbType 数据库类型
 * @param typeName 类型名称
 * @returns 是否支持自增
 */
export function canTypeAutoIncrement(dbType: DatabaseType, typeName: string): boolean {
  const typeConfig = getDataType(dbType, typeName)
  return typeConfig?.canIncrement === true
}

/**
 * 检查类型是否需要指定长度
 * @param dbType 数据库类型
 * @param typeName 类型名称
 * @returns 是否需要长度
 */
export function isTypeSized(dbType: DatabaseType, typeName: string): boolean {
  const typeConfig = getDataType(dbType, typeName)
  return typeConfig?.isSized === true
}

/**
 * 检查类型是否需要指定精度
 * @param dbType 数据库类型
 * @param typeName 类型名称
 * @returns 是否需要精度
 */
export function hasTypePrecision(dbType: DatabaseType, typeName: string): boolean {
  const typeConfig = getDataType(dbType, typeName)
  return typeConfig?.hasPrecision === true
}

/**
 * 检查类型是否支持 UNSIGNED (MySQL/MariaDB)
 * @param dbType 数据库类型
 * @param typeName 类型名称
 * @returns 是否支持 UNSIGNED
 */
export function isTypeSigned(dbType: DatabaseType, typeName: string): boolean {
  const typeConfig = getDataType(dbType, typeName)
  return typeConfig?.signed === true
}

/**
 * 获取类型的默认长度
 * @param dbType 数据库类型
 * @param typeName 类型名称
 * @returns 默认长度，如果类型不需要长度则返回 undefined
 */
export function getTypeDefaultSize(dbType: DatabaseType, typeName: string): number | undefined {
  const typeConfig = getDataType(dbType, typeName)
  return typeConfig?.defaultSize
}

/**
 * 获取类型的默认精度
 * @param dbType 数据库类型
 * @param typeName 类型名称
 * @returns { precision, scale } 或 undefined
 */
export function getTypeDefaultPrecision(
  dbType: DatabaseType,
  typeName: string
): { precision: number; scale: number } | undefined {
  const typeConfig = getDataType(dbType, typeName)
  if (typeConfig?.defaultPrecision !== undefined) {
    return {
      precision: typeConfig.defaultPrecision,
      scale: typeConfig.defaultScale || 0,
    }
  }
  return undefined
}

/**
 * 获取类型的 UI 颜色类名
 * @param dbType 数据库类型
 * @param typeName 类型名称
 * @returns Tailwind CSS 颜色类名
 */
export function getTypeColor(dbType: DatabaseType, typeName: string): string {
  const typeConfig = getDataType(dbType, typeName)
  return typeConfig?.color || 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
}

// ============================================================================
// 导出
// ============================================================================

export * from './types'
export { TYPE_COLORS, validators } from './base'
export { mysqlTypes, mysqlTypeCategories } from './mysql'
export { mariadbTypes, mariadbTypeCategories } from './mariadb'
export { postgresqlTypes, postgresqlTypeCategories } from './postgresql'
export { oracleTypes, oracleTypeCategories } from './oracle'
export { mssqlTypes, mssqlTypeCategories } from './mssql'
