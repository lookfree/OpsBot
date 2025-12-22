/**
 * SQL Server (T-SQL) SQL 生成器
 *
 * 生成 Microsoft SQL Server DDL 语句，包括：
 * - CREATE TABLE（使用 IDENTITY 列）
 * - GO 批处理分隔符
 * - sp_addextendedproperty（表和列注释）
 * - CREATE INDEX（聚集/非聚集索引）
 * - ALTER TABLE ADD CONSTRAINT（外键约束）
 */

import { DiagramData, TableNode, TableField } from '@/components/database/designer/types'
import { getDataType } from '@/config/datatypes'
import type { DatabaseType } from '@/config/datatypes/types'
import {
  escapeQuotes,
  generateFKName,
  getPrimaryKeyFields,
} from './shared'

// SQL Server 特有函数关键字
const MSSQL_FUNCTIONS = [
  'GETDATE()',
  'SYSDATETIME()',
  'GETUTCDATE()',
  'SYSDATETIMEOFFSET()',
  'SYSUTCDATETIME()',
  'CURRENT_TIMESTAMP',
  'NEWID()',
  'NEWSEQUENTIALID()',
  'USER_NAME()',
  'SYSTEM_USER',
  'SUSER_SNAME()',
]

// SQL Server 关键字
const MSSQL_KEYWORDS = ['NULL', 'DEFAULT']

// 默认 Schema
const DEFAULT_SCHEMA = 'dbo'

/**
 * 判断是否为 SQL Server 函数或关键字
 */
function isMssqlFunctionOrKeyword(value: string): boolean {
  const upper = value.toUpperCase().trim()
  return MSSQL_FUNCTIONS.some((fn) => upper.includes(fn.toUpperCase())) ||
         MSSQL_KEYWORDS.includes(upper)
}

/**
 * 解析 SQL Server 默认值
 */
function parseMssqlDefault(field: TableField): string {
  if (!field.default || field.default === '') return ''

  // 函数和关键字不需要引号
  if (isMssqlFunctionOrKeyword(field.default)) {
    return field.default
  }

  const typeDef = getDataType('mssql' as DatabaseType, field.type)
  if (typeDef && !typeDef.hasQuotes) {
    return field.default
  }

  // Unicode 字符串需要 N 前缀
  if (field.type.startsWith('N')) {
    return `N'${escapeQuotes(field.default)}'`
  }

  return `'${escapeQuotes(field.default)}'`
}

/**
 * 解析 SQL Server 类型大小
 */
function parseMssqlTypeSize(field: TableField): string {
  const typeDef = getDataType('mssql' as DatabaseType, field.type)

  // 已包含大小的类型（如 VARCHAR(MAX)）直接返回
  if (field.type.includes('(')) {
    return field.type
  }

  let result = field.type

  // 需要大小的类型 (VARCHAR, NVARCHAR, CHAR, NCHAR, BINARY, VARBINARY)
  if (typeDef?.isSized && field.size) {
    result += `(${field.size})`
  }

  // 需要精度的类型 (DECIMAL, NUMERIC, DATETIME2, TIME, DATETIMEOFFSET)
  if (typeDef?.hasPrecision && field.precision !== undefined) {
    if (field.type === 'DECIMAL' || field.type === 'NUMERIC') {
      const scale = field.scale ?? 0
      result += `(${field.precision},${scale})`
    } else if (field.type === 'FLOAT') {
      result += `(${field.precision})`
    } else {
      // TIME, DATETIME2, DATETIMEOFFSET
      result += `(${field.precision})`
    }
  }

  return result
}

/**
 * 生成 SQL Server DDL
 */
export function toMSSQL(diagram: DiagramData): string {
  const statements: string[] = []

  // 生成表定义
  diagram.tables.forEach((table) => {
    statements.push(generateTableSQL(table))
    statements.push('GO')
  })

  // 生成表和列注释（扩展属性）
  diagram.tables.forEach((table) => {
    const commentStatements = generateComments(table)
    if (commentStatements) {
      statements.push(commentStatements)
      statements.push('GO')
    }
  })

  // 生成索引
  diagram.tables.forEach((table) => {
    const indexStatements = generateIndices(table)
    if (indexStatements) {
      statements.push(indexStatements)
      statements.push('GO')
    }
  })

  // 生成外键约束
  const fkStatements = generateForeignKeys(diagram)
  if (fkStatements) {
    statements.push(fkStatements)
    statements.push('GO')
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
    const pkFields = primaryKeys.map((f) => `[${f.name}]`).join(', ')
    const pkName = `PK_${table.name}`
    lines.push(`\tCONSTRAINT [${pkName}] PRIMARY KEY CLUSTERED (${pkFields})`)
  }

  // 组装 CREATE TABLE
  let sql = `CREATE TABLE [${DEFAULT_SCHEMA}].[${table.name}] (\n`
  sql += lines.join(',\n')
  sql += '\n);'

  return sql
}

/**
 * 生成单个字段定义
 */
function generateFieldSQL(field: TableField): string {
  const typeDef = getDataType('mssql' as DatabaseType, field.type)

  let def = `\t[${field.name}] ${parseMssqlTypeSize(field)}`

  // IDENTITY (自增)
  if (field.increment) {
    def += ' IDENTITY(1,1)'
  }

  // NOT NULL
  if (field.notNull) {
    def += ' NOT NULL'
  } else if (!field.increment) {
    def += ' NULL'
  }

  // UNIQUE
  if (field.unique && !field.primary) {
    def += ' UNIQUE'
  }

  // DEFAULT (IDENTITY 列不能有 DEFAULT)
  if (field.default !== '' && !field.increment) {
    def += ` DEFAULT ${parseMssqlDefault(field)}`
  }

  // CHECK
  if (field.check !== '' && typeDef?.hasCheck) {
    def += ` CHECK(${field.check})`
  }

  // 注意：SQL Server 列注释通过 sp_addextendedproperty 单独生成

  return def
}

/**
 * 生成表和列注释 (sp_addextendedproperty)
 */
function generateComments(table: TableNode): string {
  const comments: string[] = []

  // 表注释
  if (table.comment) {
    comments.push(
      `EXEC sp_addextendedproperty\n` +
      `\t@name = N'MS_Description',\n` +
      `\t@value = N'${escapeQuotes(table.comment)}',\n` +
      `\t@level0type = N'SCHEMA', @level0name = N'${DEFAULT_SCHEMA}',\n` +
      `\t@level1type = N'TABLE', @level1name = N'${table.name}';`
    )
  }

  // 列注释
  table.fields.forEach((field) => {
    if (field.comment) {
      comments.push(
        `EXEC sp_addextendedproperty\n` +
        `\t@name = N'MS_Description',\n` +
        `\t@value = N'${escapeQuotes(field.comment)}',\n` +
        `\t@level0type = N'SCHEMA', @level0name = N'${DEFAULT_SCHEMA}',\n` +
        `\t@level1type = N'TABLE', @level1name = N'${table.name}',\n` +
        `\t@level2type = N'COLUMN', @level2name = N'${field.name}';`
      )
    }
  })

  return comments.join('\n\n')
}

/**
 * 生成索引
 */
function generateIndices(table: TableNode): string {
  if (table.indices.length === 0) return ''

  const indexStatements: string[] = []

  table.indices.forEach((index) => {
    const indexFields = index.fields
      .map((fieldName) => `[${fieldName}]`)
      .join(', ')
    const indexName = index.name || `IX_${table.name}_${index.fields.join('_')}`

    let indexType = 'NONCLUSTERED'
    if (index.unique) {
      indexType = 'UNIQUE NONCLUSTERED'
    }

    indexStatements.push(
      `CREATE ${indexType} INDEX [${indexName}]\n` +
      `\tON [${DEFAULT_SCHEMA}].[${table.name}] (${indexFields});`
    )
  })

  return indexStatements.join('\n\n')
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

    let fkStatement =
      `ALTER TABLE [${DEFAULT_SCHEMA}].[${startTable.name}]\n` +
      `\tADD CONSTRAINT [${fkName}]\n` +
      `\tFOREIGN KEY ([${startField.name}])\n` +
      `\tREFERENCES [${DEFAULT_SCHEMA}].[${endTable.name}]([${endField.name}])`

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

export default toMSSQL
