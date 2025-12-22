/**
 * MySQL SQL 生成器
 */

import { DiagramData, TableNode, TableField } from '@/components/database/designer/types'
import { getDataType } from '@/config/datatypes'
import type { DatabaseType } from '@/config/datatypes/types'
import {
  escapeQuotes,
  parseDefault,
  parseTypeSize,
  generateFKName,
  getPrimaryKeyFields,
} from './shared'

/**
 * 生成 MySQL DDL
 */
export function toMySQL(diagram: DiagramData): string {
  const statements: string[] = []

  // 生成表定义
  diagram.tables.forEach((table) => {
    statements.push(generateTableSQL(table, diagram))
  })

  // 生成外键约束（单独的 ALTER TABLE）
  const fkStatements = generateForeignKeys(diagram)
  if (fkStatements) {
    statements.push(fkStatements)
  }

  return statements.join('\n\n')
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
    const pkFields = primaryKeys.map((f) => `\`${f.name}\``).join(', ')
    lines.push(`\tPRIMARY KEY (${pkFields})`)
  }

  // 索引
  table.indices.forEach((index) => {
    const indexFields = index.fields
      .map((fieldName) => `\`${fieldName}\``)
      .join(', ')
    const indexType = index.unique ? 'UNIQUE INDEX' : 'INDEX'
    const indexName = index.name || `idx_${table.name}_${index.fields.join('_')}`
    lines.push(`\t${indexType} \`${indexName}\` (${indexFields})`)
  })

  // 组装 CREATE TABLE
  let sql = `CREATE TABLE IF NOT EXISTS \`${table.name}\` (\n`
  sql += lines.join(',\n')
  sql += '\n)'

  // 表选项
  const options: string[] = []
  options.push('ENGINE=InnoDB')
  options.push('DEFAULT CHARSET=utf8mb4')
  options.push('COLLATE=utf8mb4_general_ci')

  if (table.comment) {
    options.push(`COMMENT='${escapeQuotes(table.comment)}'`)
  }

  sql += ' ' + options.join(' ')
  sql += ';'

  return sql
}

/**
 * 生成单个字段定义
 */
function generateFieldSQL(field: TableField): string {
  const typeDef = getDataType('mysql' as DatabaseType, field.type)

  let def = `\t\`${field.name}\` ${parseTypeSize(field, 'mysql')}`

  // UNSIGNED
  if (typeDef?.signed && field.unsigned) {
    def += ' UNSIGNED'
  }

  // NOT NULL
  if (field.notNull) {
    def += ' NOT NULL'
  }

  // AUTO_INCREMENT
  if (field.increment) {
    def += ' AUTO_INCREMENT'
  }

  // UNIQUE
  if (field.unique && !field.primary) {
    def += ' UNIQUE'
  }

  // DEFAULT
  if (field.default !== '') {
    def += ` DEFAULT ${parseDefault(field, 'mysql')}`
  }

  // CHECK
  if (field.check !== '' && typeDef?.hasCheck) {
    def += ` CHECK(${field.check})`
  }

  // COMMENT
  if (field.comment) {
    def += ` COMMENT '${escapeQuotes(field.comment)}'`
  }

  return def
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
      `ALTER TABLE \`${startTable.name}\`\n` +
        `\tADD CONSTRAINT \`${fkName}\`\n` +
        `\tFOREIGN KEY (\`${startField.name}\`)\n` +
        `\tREFERENCES \`${endTable.name}\`(\`${endField.name}\`)\n` +
        `\tON UPDATE ${rel.updateConstraint}\n` +
        `\tON DELETE ${rel.deleteConstraint};`
    )
  })

  return fkStatements.join('\n\n')
}

export default toMySQL
