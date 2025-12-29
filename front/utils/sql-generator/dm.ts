/**
 * 达梦 (DM) SQL 生成器
 *
 * 生成达梦数据库 DDL 语句，包括：
 * - CREATE TABLE（使用 IDENTITY 列）
 * - COMMENT ON（表和列注释）
 * - CREATE INDEX（普通索引、唯一索引、位图索引）
 * - ALTER TABLE ADD CONSTRAINT（外键约束）
 *
 * 达梦高度兼容 Oracle，但有以下差异：
 * - 支持 LIMIT/OFFSET 语法
 * - 支持 IF NOT EXISTS
 * - 支持 ON UPDATE CASCADE
 */

import { DiagramData, TableNode, TableField } from '@/components/database/designer/types'
import { getDataType } from '@/config/datatypes'
import type { DatabaseType } from '@/config/datatypes/types'
import {
  escapeQuotes,
  generateFKName,
  getPrimaryKeyFields,
} from './shared'

// 达梦特有函数关键字
const DM_FUNCTIONS = [
  'SYSDATE',
  'SYSTIMESTAMP',
  'CURRENT_DATE',
  'CURRENT_TIMESTAMP',
  'LOCALTIMESTAMP',
  'SYS_GUID()',
  'NOW()',
  'USER',
  'CURRENT_USER',
]

// 达梦关键字
const DM_KEYWORDS = ['NULL', 'DEFAULT', 'TRUE', 'FALSE']

/**
 * 判断是否为达梦函数或关键字
 */
function isDmFunctionOrKeyword(value: string): boolean {
  const upper = value.toUpperCase().trim()
  return DM_FUNCTIONS.some((fn) => upper.includes(fn)) ||
         DM_KEYWORDS.includes(upper)
}

/**
 * 解析达梦默认值
 */
function parseDmDefault(field: TableField): string {
  if (!field.default || field.default === '') return ''

  // 函数和关键字不需要引号
  if (isDmFunctionOrKeyword(field.default)) {
    return field.default
  }

  const typeDef = getDataType('dm' as DatabaseType, field.type)
  if (typeDef && !typeDef.hasQuotes) {
    return field.default
  }

  return `'${escapeQuotes(field.default)}'`
}

/**
 * 解析达梦类型大小
 */
function parseDmTypeSize(field: TableField): string {
  const typeDef = getDataType('dm' as DatabaseType, field.type)

  let result = field.type

  // 需要大小的类型 (VARCHAR2, CHAR, BINARY, etc.)
  if (typeDef?.isSized && field.size) {
    result += `(${field.size})`
  }

  // 需要精度的类型 (NUMBER, NUMERIC, DECIMAL, TIMESTAMP, etc.)
  if (typeDef?.hasPrecision && field.precision !== undefined) {
    if (['NUMBER', 'NUMERIC', 'DECIMAL'].includes(field.type)) {
      // NUMBER(p,s)
      const scale = field.scale ?? 0
      if (scale > 0) {
        result += `(${field.precision},${scale})`
      } else {
        result += `(${field.precision})`
      }
    } else if (field.type.includes('TIMESTAMP') || field.type === 'TIME' || field.type === 'DATETIME') {
      // TIMESTAMP(p)
      result += `(${field.precision})`
    }
  }

  return result
}

/**
 * 生成达梦 DDL
 */
export function toDM(diagram: DiagramData): string {
  const statements: string[] = []

  // 生成表定义
  diagram.tables.forEach((table) => {
    statements.push(generateTableSQL(table))
  })

  // 生成表和列注释
  diagram.tables.forEach((table) => {
    const commentStatements = generateComments(table)
    if (commentStatements) {
      statements.push(commentStatements)
    }
  })

  // 生成索引
  diagram.tables.forEach((table) => {
    const indexStatements = generateIndices(table)
    if (indexStatements) {
      statements.push(indexStatements)
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
 * 生成单个表的 CREATE TABLE 语句
 */
function generateTableSQL(table: TableNode): string {
  const lines: string[] = []

  // 字段定义
  table.fields.forEach((field) => {
    lines.push(generateFieldSQL(field))
  })

  // 主键约束
  const primaryKeys = getPrimaryKeyFields(table)
  if (primaryKeys.length > 0) {
    const pkFields = primaryKeys.map((f) => `"${f.name}"`).join(', ')
    const pkName = `pk_${table.name}`
    lines.push(`\tCONSTRAINT "${pkName}" PRIMARY KEY (${pkFields})`)
  }

  // 组装 CREATE TABLE（达梦支持 IF NOT EXISTS）
  let sql = `CREATE TABLE IF NOT EXISTS "${table.name}" (\n`
  sql += lines.join(',\n')
  sql += '\n);'

  return sql
}

/**
 * 生成单个字段定义
 */
function generateFieldSQL(field: TableField): string {
  const typeDef = getDataType('dm' as DatabaseType, field.type)

  let def = `\t"${field.name}" ${parseDmTypeSize(field)}`

  // IDENTITY (自增)
  if (field.increment) {
    def += ' IDENTITY'
  }

  // NOT NULL
  if (field.notNull && !field.increment) {
    // IDENTITY 列隐式 NOT NULL
    def += ' NOT NULL'
  }

  // UNIQUE
  if (field.unique && !field.primary) {
    def += ' UNIQUE'
  }

  // DEFAULT (IDENTITY 列不能有 DEFAULT)
  if (field.default !== '' && !field.increment) {
    def += ` DEFAULT ${parseDmDefault(field)}`
  }

  // CHECK
  if (field.check !== '' && typeDef?.hasCheck) {
    def += ` CHECK(${field.check})`
  }

  // 注意：达梦列注释通过 COMMENT ON 单独生成

  return def
}

/**
 * 生成表和列注释 (COMMENT ON 语句)
 */
function generateComments(table: TableNode): string {
  const comments: string[] = []

  // 表注释
  if (table.comment) {
    comments.push(
      `COMMENT ON TABLE "${table.name}" IS '${escapeQuotes(table.comment)}';`
    )
  }

  // 列注释
  table.fields.forEach((field) => {
    if (field.comment) {
      comments.push(
        `COMMENT ON COLUMN "${table.name}"."${field.name}" IS '${escapeQuotes(field.comment)}';`
      )
    }
  })

  return comments.join('\n')
}

/**
 * 生成索引
 */
function generateIndices(table: TableNode): string {
  if (table.indices.length === 0) return ''

  const indexStatements: string[] = []

  table.indices.forEach((index) => {
    const indexFields = index.fields
      .map((fieldName) => `"${fieldName}"`)
      .join(', ')
    const indexName = index.name || `idx_${table.name}_${index.fields.join('_')}`

    let indexType = 'INDEX'
    if (index.unique) {
      indexType = 'UNIQUE INDEX'
    }
    // 可扩展支持 BITMAP INDEX: index.type === 'BITMAP'

    indexStatements.push(
      `CREATE ${indexType} "${indexName}" ON "${table.name}" (${indexFields});`
    )
  })

  return indexStatements.join('\n')
}

/**
 * 生成外键约束
 *
 * 达梦支持 ON UPDATE 和 ON DELETE
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

    // 达梦外键语法
    let fkStatement =
      `ALTER TABLE "${startTable.name}"\n` +
      `\tADD CONSTRAINT "${fkName}"\n` +
      `\tFOREIGN KEY ("${startField.name}")\n` +
      `\tREFERENCES "${endTable.name}"("${endField.name}")`

    // ON UPDATE 操作
    if (rel.updateConstraint && rel.updateConstraint !== 'NO ACTION') {
      fkStatement += `\n\tON UPDATE ${rel.updateConstraint}`
    }

    // ON DELETE 操作
    if (rel.deleteConstraint && rel.deleteConstraint !== 'NO ACTION') {
      fkStatement += `\n\tON DELETE ${rel.deleteConstraint}`
    }

    fkStatement += ';'

    fkStatements.push(fkStatement)
  })

  return fkStatements.join('\n\n')
}

export default toDM
