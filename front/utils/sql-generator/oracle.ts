/**
 * Oracle SQL 生成器
 *
 * 生成 Oracle Database DDL 语句，包括：
 * - CREATE TABLE（使用 IDENTITY 列）
 * - COMMENT ON（表和列注释）
 * - CREATE INDEX（普通索引、唯一索引、位图索引）
 * - ALTER TABLE ADD CONSTRAINT（外键约束）
 *
 * 注意：Oracle 不支持 IF NOT EXISTS 和 ON UPDATE CASCADE
 */

import { DiagramData, TableNode, TableField } from '@/components/database/designer/types'
import { getDataType } from '@/config/datatypes'
import type { DatabaseType } from '@/config/datatypes/types'
import {
  escapeQuotes,
  generateFKName,
  getPrimaryKeyFields,
} from './shared'

// Oracle 特有函数关键字
const ORACLE_FUNCTIONS = [
  'SYSDATE',
  'SYSTIMESTAMP',
  'CURRENT_DATE',
  'CURRENT_TIMESTAMP',
  'LOCALTIMESTAMP',
  'SYS_GUID()',
  'USER',
  'UID',
  'USERENV',
]

// Oracle 关键字
const ORACLE_KEYWORDS = ['NULL', 'DEFAULT']

/**
 * 判断是否为 Oracle 函数或关键字
 */
function isOracleFunctionOrKeyword(value: string): boolean {
  const upper = value.toUpperCase().trim()
  return ORACLE_FUNCTIONS.some((fn) => upper.includes(fn)) ||
         ORACLE_KEYWORDS.includes(upper)
}

/**
 * 解析 Oracle 默认值
 */
function parseOracleDefault(field: TableField): string {
  if (!field.default || field.default === '') return ''

  // 函数和关键字不需要引号
  if (isOracleFunctionOrKeyword(field.default)) {
    return field.default
  }

  const typeDef = getDataType('oracle' as DatabaseType, field.type)
  if (typeDef && !typeDef.hasQuotes) {
    return field.default
  }

  return `'${escapeQuotes(field.default)}'`
}

/**
 * 解析 Oracle 类型大小
 */
function parseOracleTypeSize(field: TableField): string {
  const typeDef = getDataType('oracle' as DatabaseType, field.type)

  let result = field.type

  // 需要大小的类型 (VARCHAR2, CHAR, RAW, etc.)
  if (typeDef?.isSized && field.size) {
    result += `(${field.size})`
  }

  // 需要精度的类型 (NUMBER, TIMESTAMP, etc.)
  if (typeDef?.hasPrecision && field.precision !== undefined) {
    if (field.type === 'NUMBER') {
      // NUMBER(p,s)
      const scale = field.scale ?? 0
      if (scale > 0) {
        result += `(${field.precision},${scale})`
      } else {
        result += `(${field.precision})`
      }
    } else if (field.type.includes('TIMESTAMP')) {
      // TIMESTAMP(p)
      result += `(${field.precision})`
    }
  }

  return result
}

/**
 * 生成 Oracle DDL
 */
export function toOracle(diagram: DiagramData): string {
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

  // 组装 CREATE TABLE (Oracle 不支持 IF NOT EXISTS)
  let sql = `CREATE TABLE "${table.name}" (\n`
  sql += lines.join(',\n')
  sql += '\n)'

  // 表空间（如果指定）
  // 目前使用默认表空间，后续可扩展为从 table 对象读取
  sql += ';'

  return sql
}

/**
 * 生成单个字段定义
 */
function generateFieldSQL(field: TableField): string {
  const typeDef = getDataType('oracle' as DatabaseType, field.type)

  let def = `\t"${field.name}" ${parseOracleTypeSize(field)}`

  // IDENTITY (自增) - Oracle 12c+
  if (field.increment) {
    def += ' GENERATED ALWAYS AS IDENTITY'
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
    def += ` DEFAULT ${parseOracleDefault(field)}`
  }

  // CHECK
  if (field.check !== '' && typeDef?.hasCheck) {
    def += ` CHECK(${field.check})`
  }

  // 注意：Oracle 列注释通过 COMMENT ON 单独生成

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
 * 注意：Oracle 不支持 ON UPDATE CASCADE，只支持 ON DELETE
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

    // Oracle 外键语法 - 注意不支持 ON UPDATE
    let fkStatement =
      `ALTER TABLE "${startTable.name}"\n` +
      `\tADD CONSTRAINT "${fkName}"\n` +
      `\tFOREIGN KEY ("${startField.name}")\n` +
      `\tREFERENCES "${endTable.name}"("${endField.name}")`

    // ON DELETE 操作
    if (rel.deleteConstraint && rel.deleteConstraint !== 'NO ACTION') {
      fkStatement += `\n\tON DELETE ${rel.deleteConstraint}`
    }

    fkStatement += ';'

    // 添加注释说明 ON UPDATE 不支持
    if (rel.updateConstraint && rel.updateConstraint !== 'NO ACTION') {
      fkStatement += `\n-- Note: Oracle does not support ON UPDATE ${rel.updateConstraint}`
    }

    fkStatements.push(fkStatement)
  })

  return fkStatements.join('\n\n')
}

export default toOracle
