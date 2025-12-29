/**
 * ClickHouse SQL 生成器
 *
 * ClickHouse 特点：
 * - MergeTree 系列引擎需要 ORDER BY 子句
 * - 不支持外键约束
 * - 不支持传统自增，使用 generateUUIDv4() 或其他函数
 * - 使用反引号引用标识符
 */

import { DiagramData, TableNode, TableField } from '@/components/database/designer/types'
import {
  escapeQuotes,
  parseDefault,
  parseTypeSize,
  getPrimaryKeyFields,
} from './shared'

/**
 * 生成 ClickHouse DDL
 */
export function toClickHouse(diagram: DiagramData): string {
  const statements: string[] = []

  // 生成表定义
  diagram.tables.forEach((table) => {
    statements.push(generateTableSQL(table, diagram))
  })

  // ClickHouse 不支持外键，跳过外键生成
  // 如果有外键关系，添加注释说明
  if (diagram.relationships.length > 0) {
    statements.push(generateRelationshipComments(diagram))
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

  // ClickHouse 不使用 PRIMARY KEY 约束，而是使用 ORDER BY
  // PRIMARY KEY 在 MergeTree 引擎中是可选的，默认与 ORDER BY 相同

  // 组装 CREATE TABLE
  let sql = `CREATE TABLE IF NOT EXISTS \`${table.name}\` (\n`
  sql += lines.join(',\n')
  sql += '\n)'

  // 表引擎和选项
  const primaryKeys = getPrimaryKeyFields(table)

  // 默认使用 MergeTree 引擎
  sql += '\nENGINE = MergeTree()'

  // ORDER BY 是 MergeTree 必需的
  if (primaryKeys.length > 0) {
    const orderByFields = primaryKeys.map((f) => `\`${f.name}\``).join(', ')
    sql += `\nORDER BY (${orderByFields})`
  } else {
    // 如果没有主键，使用第一个字段或 tuple()
    if (table.fields.length > 0) {
      sql += `\nORDER BY \`${table.fields[0].name}\``
    } else {
      sql += '\nORDER BY tuple()'
    }
  }

  // 表注释
  if (table.comment) {
    sql += `\nCOMMENT '${escapeQuotes(table.comment)}'`
  }

  sql += ';'

  return sql
}

/**
 * 生成单个字段定义
 */
function generateFieldSQL(field: TableField): string {
  // ClickHouse 类型处理
  let fieldType = parseTypeSize(field, 'clickhouse')

  // 处理 Nullable 包装
  if (!field.notNull && !field.primary) {
    fieldType = `Nullable(${fieldType})`
  }

  let def = `\t\`${field.name}\` ${fieldType}`

  // ClickHouse 不支持 AUTO_INCREMENT
  // 但可以使用 DEFAULT 表达式
  if (field.increment) {
    // 使用 rowNumberInAllBlocks() 或其他替代方案
    // 这里添加注释说明
    def += ' -- Note: ClickHouse does not support AUTO_INCREMENT'
  }

  // DEFAULT
  if (field.default !== '') {
    def += ` DEFAULT ${parseDefault(field, 'clickhouse')}`
  }

  // COMMENT
  if (field.comment) {
    def += ` COMMENT '${escapeQuotes(field.comment)}'`
  }

  return def
}

/**
 * 生成关系注释（ClickHouse 不支持外键）
 */
function generateRelationshipComments(diagram: DiagramData): string {
  const comments: string[] = ['-- ClickHouse does not support foreign key constraints.']
  comments.push('-- The following relationships are documented for reference only:')
  comments.push('')

  diagram.relationships.forEach((rel) => {
    const startTable = diagram.tables.find((t) => t.id === rel.startTableId)
    const endTable = diagram.tables.find((t) => t.id === rel.endTableId)

    if (!startTable || !endTable) return

    const startField = startTable.fields.find((f) => f.id === rel.startFieldId)
    const endField = endTable.fields.find((f) => f.id === rel.endFieldId)

    if (!startField || !endField) return

    comments.push(
      `-- ${startTable.name}.${startField.name} -> ${endTable.name}.${endField.name} (ON UPDATE ${rel.updateConstraint}, ON DELETE ${rel.deleteConstraint})`
    )
  })

  return comments.join('\n')
}

export default toClickHouse
