/**
 * SQL 生成器共享工具函数
 */

import { TableField, TableNode, DiagramData, DatabaseDialect } from '@/components/database/designer/types'
import { getDataType } from '@/config/datatypes'
import type { DatabaseType } from '@/config/datatypes/types'

// SQL 函数关键字
const SQL_FUNCTIONS = [
  'NOW()',
  'CURRENT_TIMESTAMP',
  'CURRENT_DATE',
  'CURRENT_TIME',
  'GETDATE()',
  'SYSDATE',
  'UUID()',
  'GEN_RANDOM_UUID()',
  'NEWID()',
]

// SQL 关键字
const SQL_KEYWORDS = ['NULL', 'TRUE', 'FALSE', 'DEFAULT']

/**
 * 判断是否为 SQL 函数
 */
export function isFunction(value: string): boolean {
  const upper = value.toUpperCase().trim()
  return SQL_FUNCTIONS.some((fn) => upper.includes(fn.toUpperCase()))
}

/**
 * 判断是否为 SQL 关键字
 */
export function isKeyword(value: string): boolean {
  return SQL_KEYWORDS.includes(value.toUpperCase().trim())
}

/**
 * 转义单引号
 */
export function escapeQuotes(str: string): string {
  return str.replace(/'/g, "''")
}

/**
 * 解析默认值（根据是否需要引号）
 */
export function parseDefault(field: TableField, database: DatabaseDialect): string {
  if (!field.default || field.default === '') return ''

  // 函数和关键字不需要引号
  if (isFunction(field.default) || isKeyword(field.default)) {
    return field.default
  }

  const typeDef = getDataType(database as DatabaseType, field.type)
  if (typeDef && !typeDef.hasQuotes) {
    return field.default
  }

  return `'${escapeQuotes(field.default)}'`
}

/**
 * 解析类型大小
 */
export function parseTypeSize(field: TableField, database: DatabaseDialect): string {
  const typeDef = getDataType(database as DatabaseType, field.type)

  let result = field.type

  // 需要大小的类型
  if (typeDef?.isSized && field.size) {
    result += `(${field.size})`
  }

  // 需要精度的类型
  if (typeDef?.hasPrecision && field.precision !== undefined) {
    const scale = field.scale ?? 0
    result += `(${field.precision},${scale})`
  }

  return result
}

/**
 * 生成字段注释（作为行内注释）
 */
export function exportFieldComment(comment: string | undefined): string {
  if (!comment || comment.trim() === '') return ''
  return `-- ${comment}\n`
}

/**
 * 获取表之间的外键关系
 */
export function getInlineFK(table: TableNode, diagram: DiagramData): string {
  const fks = diagram.relationships.filter((r) => r.startTableId === table.id)

  if (fks.length === 0) return ''

  return fks
    .map((fk) => {
      const endTable = diagram.tables.find((t) => t.id === fk.endTableId)
      if (!endTable) return ''

      const startField = table.fields.find((f) => f.id === fk.startFieldId)
      const endField = endTable.fields.find((f) => f.id === fk.endFieldId)
      if (!startField || !endField) return ''

      return `\tFOREIGN KEY ("${startField.name}") REFERENCES "${endTable.name}"("${endField.name}") ON UPDATE ${fk.updateConstraint} ON DELETE ${fk.deleteConstraint}`
    })
    .filter(Boolean)
    .join(',\n')
}

/**
 * 生成外键约束名称
 */
export function generateFKName(
  startTable: string,
  startField: string,
  endTable: string
): string {
  return `fk_${startTable}_${startField}_${endTable}`.substring(0, 64)
}

/**
 * 获取主键字段
 */
export function getPrimaryKeyFields(table: TableNode): TableField[] {
  return table.fields.filter((f) => f.primary)
}

/**
 * 检查表是否有自增字段
 */
export function hasAutoIncrement(table: TableNode): boolean {
  return table.fields.some((f) => f.increment)
}
