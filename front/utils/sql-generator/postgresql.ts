/**
 * PostgreSQL SQL 生成器
 */

import { DiagramData, TableNode, TableField } from '@/components/database/designer/types'
import { getDataType } from '@/config/datatypes'
import type { DatabaseType } from '@/config/datatypes/types'
import {
  escapeQuotes,
  parseDefault,
  generateFKName,
  getPrimaryKeyFields,
} from './shared'

/**
 * 生成 PostgreSQL DDL
 */
export function toPostgres(diagram: DiagramData): string {
  const statements: string[] = []

  // 生成表定义
  diagram.tables.forEach((table) => {
    statements.push(generateTableSQL(table, diagram))
  })

  // 生成注释
  diagram.tables.forEach((table) => {
    const comments = generateComments(table)
    if (comments) {
      statements.push(comments)
    }
  })

  // 生成索引
  diagram.tables.forEach((table) => {
    const indices = generateIndices(table)
    if (indices) {
      statements.push(indices)
    }
  })

  // 生成外键约束
  const fkStatements = generateForeignKeys(diagram)
  if (fkStatements) {
    statements.push(fkStatements)
  }

  return statements.join('\n\n')
}

/**
 * 解析 PostgreSQL 类型大小
 */
function parseTypeSize(field: TableField): string {
  const typeDef = getDataType('postgresql' as DatabaseType, field.type)

  // 自增类型特殊处理
  if (field.increment) {
    if (field.type.toUpperCase() === 'INT' || field.type.toUpperCase() === 'INTEGER') {
      return 'SERIAL'
    }
    if (field.type.toUpperCase() === 'BIGINT') {
      return 'BIGSERIAL'
    }
    if (field.type.toUpperCase() === 'SMALLINT') {
      return 'SMALLSERIAL'
    }
  }

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

  // 数组类型
  if (field.isArray) {
    result += '[]'
  }

  return result
}

/**
 * 生成单个表的 CREATE TABLE 语句
 */
function generateTableSQL(table: TableNode, _diagram: DiagramData): string {
  const lines: string[] = []

  // 字段定义
  table.fields.forEach((field) => {
    lines.push(generateFieldSQL(field))
  })

  // 主键约束
  const primaryKeys = getPrimaryKeyFields(table)
  if (primaryKeys.length > 0) {
    const pkFields = primaryKeys.map((f) => `"${f.name}"`).join(', ')
    lines.push(`\tPRIMARY KEY (${pkFields})`)
  }

  // 组装 CREATE TABLE
  let sql = `CREATE TABLE IF NOT EXISTS "${table.name}" (\n`
  sql += lines.join(',\n')
  sql += '\n);'

  return sql
}

/**
 * 生成单个字段定义
 */
function generateFieldSQL(field: TableField): string {
  const typeDef = getDataType('postgresql' as DatabaseType, field.type)

  let def = `\t"${field.name}" ${parseTypeSize(field)}`

  // NOT NULL
  if (field.notNull) {
    def += ' NOT NULL'
  }

  // UNIQUE
  if (field.unique && !field.primary) {
    def += ' UNIQUE'
  }

  // DEFAULT (自增类型不需要默认值)
  if (field.default !== '' && !field.increment) {
    def += ` DEFAULT ${parseDefault(field, 'postgresql')}`
  }

  // CHECK
  if (field.check !== '' && typeDef?.hasCheck) {
    def += ` CHECK(${field.check})`
  }

  return def
}

/**
 * 生成表和字段注释
 */
function generateComments(table: TableNode): string {
  const comments: string[] = []

  // 表注释
  if (table.comment) {
    comments.push(
      `COMMENT ON TABLE "${table.name}" IS '${escapeQuotes(table.comment)}';`
    )
  }

  // 字段注释
  table.fields.forEach((field) => {
    if (field.comment) {
      comments.push(
        `COMMENT ON COLUMN "${table.name}"."${field.name}" IS '${escapeQuotes(
          field.comment
        )}';`
      )
    }
  })

  return comments.join('\n')
}

/**
 * 生成索引
 */
function generateIndices(table: TableNode): string {
  const indices: string[] = []

  table.indices.forEach((index) => {
    const indexFields = index.fields.map((fieldName) => `"${fieldName}"`).join(', ')
    const indexType = index.unique ? 'UNIQUE INDEX' : 'INDEX'
    const indexName = index.name || `idx_${table.name}_${index.fields.join('_')}`

    indices.push(
      `CREATE ${indexType} "${indexName}" ON "${table.name}" (${indexFields});`
    )
  })

  return indices.join('\n')
}

/**
 * 生成外键约束
 */
function generateForeignKeys(diagram: DiagramData): string {
  const fkStatements: string[] = []

  diagram.relationships.forEach((rel) => {
    const startTable = diagram.tables.find((t) => t.id === rel.startTableId)
    const endTable = diagram.tables.find((t) => t.id === rel.endTableId)

    if (!startTable || !endTable) return

    const startField = startTable.fields.find((f) => f.id === rel.startFieldId)
    const endField = endTable.fields.find((f) => f.id === rel.endFieldId)

    if (!startField || !endField) return

    const fkName = rel.name || generateFKName(startTable.name, startField.name, endTable.name)

    fkStatements.push(
      `ALTER TABLE "${startTable.name}"\n` +
        `\tADD CONSTRAINT "${fkName}"\n` +
        `\tFOREIGN KEY ("${startField.name}")\n` +
        `\tREFERENCES "${endTable.name}"("${endField.name}")\n` +
        `\tON UPDATE ${rel.updateConstraint}\n` +
        `\tON DELETE ${rel.deleteConstraint};`
    )
  })

  return fkStatements.join('\n\n')
}

export default toPostgres
