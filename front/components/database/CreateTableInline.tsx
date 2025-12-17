/**
 * Create Table Inline Component
 *
 * Inline component for creating a new database table with inline editing for all fields.
 * This is a version of CreateTableDialog without the dialog wrapper.
 */

import { useState, useEffect, useCallback } from 'react'
import { Plus, ChevronDown, ChevronUp, Save, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { useThemeStore, useConnectionStore } from '@/stores'
import { dbExecuteSql } from '@/services/database'
import type { DatabaseConnection } from '@/types'

interface CreateTableInlineProps {
  connectionId: string
  database: string
  onSuccess: () => void
  onClose: () => void
}

interface ColumnDef {
  id: string
  name: string
  type: string
  length: string
  scale: string
  nullable: boolean
  isPrimaryKey: boolean
  autoIncrement: boolean
  defaultValue: string
  comment: string
}

interface IndexDef {
  id: string
  name: string
  unique: boolean
  indexType: string
  columns: string[]
}

interface ForeignKeyDef {
  id: string
  name: string
  column: string
  refTable: string
  refColumn: string
  onDelete: string
  onUpdate: string
}

interface CheckConstraintDef {
  id: string
  name: string
  expression: string
}

interface TriggerDef {
  id: string
  name: string
  timing: string
  event: string
  statement: string
}

const COLUMN_TYPES = [
  'INT', 'BIGINT', 'SMALLINT', 'TINYINT', 'MEDIUMINT',
  'VARCHAR', 'CHAR', 'TEXT', 'MEDIUMTEXT', 'LONGTEXT',
  'DATETIME', 'DATE', 'TIME', 'TIMESTAMP',
  'DECIMAL', 'FLOAT', 'DOUBLE',
  'BOOLEAN', 'JSON', 'BLOB',
]

const ENGINES = ['InnoDB', 'MyISAM', 'MEMORY', 'CSV', 'ARCHIVE']
const CHARSETS = ['utf8mb4', 'utf8', 'latin1', 'gbk', 'gb2312']
const FK_ACTIONS = ['NO ACTION', 'RESTRICT', 'CASCADE', 'SET NULL', 'SET DEFAULT']

type TabType = 'columns' | 'indexes' | 'foreignKeys' | 'constraints' | 'triggers' | 'advanced'

export function CreateTableInline({
  connectionId,
  database,
  onSuccess,
  onClose,
}: CreateTableInlineProps) {
  const { t } = useTranslation()
  const { theme } = useThemeStore()
  const isDark = theme === 'dark'
  const { connections } = useConnectionStore()
  const connection = connections.find((c) => c.id === connectionId) as DatabaseConnection | undefined
  const dbType = connection?.dbType || 'mysql'

  // Quote identifier based on database type (MySQL uses backticks, PostgreSQL uses double quotes)
  const q = useCallback((identifier: string) => {
    if (dbType === 'postgresql') {
      return `"${identifier}"`
    }
    return `\`${identifier}\``
  }, [dbType])

  // Quote table with schema/database prefix
  const qTable = useCallback((db: string, table: string) => {
    if (dbType === 'postgresql') {
      return `"${db}"."${table}"`
    }
    return `\`${db}\`.\`${table}\``
  }, [dbType])

  const [tableName, setTableName] = useState('')
  const [tableComment, setTableComment] = useState('')
  const [engine, setEngine] = useState('InnoDB')
  const [charset, setCharset] = useState('utf8mb4')
  const [activeTab, setActiveTab] = useState<TabType>('columns')
  const [columns, setColumns] = useState<ColumnDef[]>([])
  const [indexes, setIndexes] = useState<IndexDef[]>([])
  const [foreignKeys, setForeignKeys] = useState<ForeignKeyDef[]>([])
  const [checkConstraints, setCheckConstraints] = useState<CheckConstraintDef[]>([])
  const [triggers, setTriggers] = useState<TriggerDef[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showSqlPreview, setShowSqlPreview] = useState(false)

  useEffect(() => {
    setTableName('')
    setTableComment('')
    setEngine('InnoDB')
    setCharset('utf8mb4')
    setColumns([createEmptyColumn()])
    setIndexes([])
    setForeignKeys([])
    setCheckConstraints([])
    setTriggers([])
    setActiveTab('columns')
    setError(null)
  }, [database])

  const createEmptyColumn = (): ColumnDef => ({
    id: crypto.randomUUID(),
    name: '',
    type: 'VARCHAR',
    length: '255',
    scale: '',
    nullable: true,
    isPrimaryKey: false,
    autoIncrement: false,
    defaultValue: '',
    comment: '',
  })

  const updateColumn = (id: string, updates: Partial<ColumnDef>) => {
    setColumns((cols) => cols.map((c) => (c.id === id ? { ...c, ...updates } : c)))
  }

  const addColumn = () => setColumns((cols) => [...cols, createEmptyColumn()])

  const removeColumn = (id: string) => {
    if (columns.length > 1) setColumns((cols) => cols.filter((c) => c.id !== id))
  }

  const addIndex = () => {
    setIndexes((idxs) => [...idxs, {
      id: crypto.randomUUID(),
      name: `idx_${Date.now()}`,
      unique: false,
      indexType: 'BTREE',
      columns: [],
    }])
  }

  const updateIndex = (id: string, updates: Partial<IndexDef>) => {
    setIndexes((idxs) => idxs.map((i) => (i.id === id ? { ...i, ...updates } : i)))
  }

  const removeIndex = (id: string) => setIndexes((idxs) => idxs.filter((i) => i.id !== id))

  const toggleIndexColumn = (indexId: string, colName: string) => {
    setIndexes((idxs) => idxs.map((idx) => {
      if (idx.id !== indexId) return idx
      const cols = idx.columns.includes(colName)
        ? idx.columns.filter((c) => c !== colName)
        : [...idx.columns, colName]
      return { ...idx, columns: cols }
    }))
  }

  const addForeignKey = () => {
    setForeignKeys((fks) => [...fks, {
      id: crypto.randomUUID(),
      name: `fk_${Date.now()}`,
      column: '',
      refTable: '',
      refColumn: '',
      onDelete: 'NO ACTION',
      onUpdate: 'NO ACTION',
    }])
  }

  const updateForeignKey = (id: string, updates: Partial<ForeignKeyDef>) => {
    setForeignKeys((fks) => fks.map((f) => (f.id === id ? { ...f, ...updates } : f)))
  }

  const removeForeignKey = (id: string) => setForeignKeys((fks) => fks.filter((f) => f.id !== id))

  const addCheckConstraint = () => {
    setCheckConstraints((cs) => [...cs, {
      id: crypto.randomUUID(),
      name: `chk_${Date.now()}`,
      expression: '',
    }])
  }

  const updateCheckConstraint = (id: string, updates: Partial<CheckConstraintDef>) => {
    setCheckConstraints((cs) => cs.map((c) => (c.id === id ? { ...c, ...updates } : c)))
  }

  const removeCheckConstraint = (id: string) => setCheckConstraints((cs) => cs.filter((c) => c.id !== id))

  const addTrigger = () => {
    setTriggers((ts) => [...ts, {
      id: crypto.randomUUID(),
      name: `trg_${Date.now()}`,
      timing: 'BEFORE',
      event: 'INSERT',
      statement: 'BEGIN\n  \nEND',
    }])
  }

  const updateTrigger = (id: string, updates: Partial<TriggerDef>) => {
    setTriggers((ts) => ts.map((t) => (t.id === id ? { ...t, ...updates } : t)))
  }

  const removeTrigger = (id: string) => setTriggers((ts) => ts.filter((t) => t.id !== id))

  const handleAdd = () => {
    switch (activeTab) {
      case 'columns': addColumn(); break
      case 'indexes': addIndex(); break
      case 'foreignKeys': addForeignKey(); break
      case 'constraints': addCheckConstraint(); break
      case 'triggers': addTrigger(); break
    }
  }

  const generateSql = (): string => {
    if (!tableName.trim()) return ''
    const validColumns = columns.filter((c) => c.name.trim())
    if (validColumns.length === 0) return ''

    const defs: string[] = []
    const isPostgres = dbType === 'postgresql'

    validColumns.forEach((col) => {
      let def = `  ${q(col.name)} ${col.type}`
      if (['VARCHAR', 'CHAR', 'VARBINARY', 'BINARY'].includes(col.type) && col.length) {
        def += `(${col.length})`
      } else if (['DECIMAL', 'NUMERIC'].includes(col.type) && col.length) {
        def += col.scale ? `(${col.length},${col.scale})` : `(${col.length})`
      }
      if (!col.nullable) def += ' NOT NULL'
      if (col.autoIncrement) {
        // PostgreSQL uses SERIAL/BIGSERIAL, MySQL uses AUTO_INCREMENT
        if (!isPostgres) def += ' AUTO_INCREMENT'
      }
      if (col.defaultValue) def += ` DEFAULT ${col.defaultValue}`
      // COMMENT syntax is MySQL-specific
      if (col.comment && !isPostgres) def += ` COMMENT '${col.comment.replace(/'/g, "''")}'`
      defs.push(def)
    })

    const pkCols = validColumns.filter((c) => c.isPrimaryKey).map((c) => q(c.name))
    if (pkCols.length > 0) defs.push(`  PRIMARY KEY (${pkCols.join(', ')})`)

    indexes.filter((i) => i.columns.length > 0).forEach((idx) => {
      const indexType = idx.unique ? 'UNIQUE KEY' : 'KEY'
      const colList = idx.columns.map((c) => q(c)).join(', ')
      // MySQL inline index syntax
      if (!isPostgres) {
        defs.push(`  ${indexType} ${q(idx.name)} (${colList}) USING ${idx.indexType}`)
      }
    })

    foreignKeys.filter((f) => f.column && f.refTable && f.refColumn).forEach((fk) => {
      defs.push(`  CONSTRAINT ${q(fk.name)} FOREIGN KEY (${q(fk.column)}) REFERENCES ${q(fk.refTable)}(${q(fk.refColumn)}) ON DELETE ${fk.onDelete} ON UPDATE ${fk.onUpdate}`)
    })

    checkConstraints.filter((c) => c.expression).forEach((chk) => {
      defs.push(`  CONSTRAINT ${q(chk.name)} CHECK (${chk.expression})`)
    })

    let sql = `CREATE TABLE ${qTable(database, tableName)} (\n${defs.join(',\n')}\n)`
    // Engine and charset are MySQL-specific
    if (!isPostgres) {
      sql += ` ENGINE=${engine} DEFAULT CHARSET=${charset}`
      if (tableComment) sql += ` COMMENT='${tableComment.replace(/'/g, "''")}'`
    }
    sql += ';'

    // PostgreSQL index creation is separate
    if (isPostgres) {
      indexes.filter((i) => i.columns.length > 0).forEach((idx) => {
        const uniqueStr = idx.unique ? 'UNIQUE ' : ''
        const colList = idx.columns.map((c) => q(c)).join(', ')
        sql += `\n\nCREATE ${uniqueStr}INDEX ${q(idx.name)} ON ${qTable(database, tableName)} USING ${idx.indexType} (${colList});`
      })
    }

    triggers.filter((t) => t.statement).forEach((trg) => {
      if (isPostgres) {
        // PostgreSQL trigger syntax is different
        sql += `\n\nCREATE TRIGGER ${q(trg.name)} ${trg.timing} ${trg.event} ON ${qTable(database, tableName)} FOR EACH ROW EXECUTE FUNCTION ${trg.statement}`
      } else {
        sql += `\n\nCREATE TRIGGER ${q(trg.name)} ${trg.timing} ${trg.event} ON ${qTable(database, tableName)} FOR EACH ROW ${trg.statement}`
      }
    })

    return sql
  }

  const handleCreate = async () => {
    const sql = generateSql()
    if (!sql) return

    setIsLoading(true)
    setError(null)

    try {
      const statements = sql.split(/;\s*\n\n/).filter(s => s.trim())
      for (const stmt of statements) {
        await dbExecuteSql({ connectionId, sql: stmt.endsWith(';') ? stmt : stmt + ';', database })
      }
      onSuccess()
    } catch (err) {
      setError(String(err))
    } finally {
      setIsLoading(false)
    }
  }

  const canCreate = tableName.trim() && columns.some((c) => c.name.trim())
  const canAdd = activeTab !== 'advanced'
  const availableColumns = columns.filter(c => c.name.trim()).map(c => c.name)

  // Theme styles
  const borderColor = isDark ? 'border-dark-border' : 'border-light-border'
  const textPrimary = isDark ? 'text-dark-text-primary' : 'text-light-text-primary'
  const textSecondary = isDark ? 'text-dark-text-secondary' : 'text-light-text-secondary'
  const inputBg = isDark ? 'bg-dark-bg-hover' : 'bg-light-bg-primary'
  const hoverBg = isDark ? 'hover:bg-dark-bg-hover' : 'hover:bg-light-bg-hover'
  const codeBg = isDark ? 'bg-dark-bg-secondary' : 'bg-light-bg-secondary'

  const inputClass = cn(
    'px-2 py-1 rounded text-sm border focus:outline-none focus:border-accent-primary',
    inputBg, borderColor, textPrimary
  )

  const tabs: { key: TabType; label: string }[] = [
    { key: 'columns', label: t('database.columns') },
    { key: 'indexes', label: t('database.indexes') },
    { key: 'foreignKeys', label: t('database.foreignKeys') },
    { key: 'constraints', label: t('database.constraints') },
    { key: 'triggers', label: t('database.triggers') },
    { key: 'advanced', label: t('database.advanced') },
  ]

  return (
    <div className="flex flex-col h-full">
      {/* Table name input */}
      <div className={cn('flex items-center gap-4 px-4 py-2 border-b', borderColor)}>
        <div className="flex items-center gap-2">
          <label className={cn('text-sm', textSecondary)}>{t('database.tableName')}:</label>
          <input
            type="text"
            value={tableName}
            onChange={(e) => setTableName(e.target.value)}
            placeholder={t('database.enterTableName')}
            className={cn(inputClass, 'w-48')}
          />
        </div>
        <div className="flex items-center gap-2">
          <label className={cn('text-sm', textSecondary)}>{t('database.tableComment')}:</label>
          <input
            type="text"
            value={tableComment}
            onChange={(e) => setTableComment(e.target.value)}
            placeholder={t('database.optional')}
            className={cn(inputClass, 'w-48')}
          />
        </div>
      </div>

      {/* Toolbar */}
      <div className={cn('flex items-center gap-2 px-4 py-2 border-b', borderColor)}>
        <button
          onClick={handleCreate}
          disabled={!canCreate || isLoading}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 text-sm rounded transition-colors',
            canCreate ? 'text-accent-primary hover:bg-accent-primary/10' : cn(textSecondary, 'cursor-not-allowed')
          )}
        >
          <Save className="w-4 h-4" />
          {t('database.create')}
        </button>
        {canAdd && (
          <button
            onClick={handleAdd}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded text-accent-primary hover:bg-accent-primary/10"
          >
            <Plus className="w-4 h-4" />
            {t('common.add')}
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className={cn('flex border-b px-4', borderColor)}>
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
              activeTab === tab.key
                ? 'border-accent-primary text-accent-primary'
                : cn('border-transparent', textSecondary, hoverBg)
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {/* Columns Tab */}
        {activeTab === 'columns' && (
          <table className="w-full text-sm">
            <thead className={cn('sticky top-0', codeBg)}>
              <tr>
                <th className={cn('px-2 py-2 text-left font-medium', textSecondary)}>{t('database.columnName')}</th>
                <th className={cn('px-2 py-2 text-left font-medium w-28', textSecondary)}>{t('database.type')}</th>
                <th className={cn('px-2 py-2 text-left font-medium w-16', textSecondary)}>{t('database.length')}</th>
                <th className={cn('px-2 py-2 text-center font-medium w-10', textSecondary)}>NN</th>
                <th className={cn('px-2 py-2 text-center font-medium w-10', textSecondary)}>PK</th>
                <th className={cn('px-2 py-2 text-center font-medium w-10', textSecondary)}>AI</th>
                <th className={cn('px-2 py-2 text-left font-medium w-24', textSecondary)}>{t('database.defaultValue')}</th>
                <th className={cn('px-2 py-2 text-left font-medium', textSecondary)}>{t('database.comment')}</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {columns.map((col) => (
                <tr key={col.id} className={cn('border-t', borderColor)}>
                  <td className="px-2 py-1">
                    <input
                      type="text"
                      value={col.name}
                      onChange={(e) => updateColumn(col.id, { name: e.target.value })}
                      className={cn(inputClass, 'w-full')}
                    />
                  </td>
                  <td className="px-2 py-1">
                    <select
                      value={col.type}
                      onChange={(e) => updateColumn(col.id, { type: e.target.value })}
                      className={cn(inputClass, 'w-full')}
                    >
                      {COLUMN_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </td>
                  <td className="px-2 py-1">
                    <input
                      type="text"
                      value={col.length}
                      onChange={(e) => updateColumn(col.id, { length: e.target.value })}
                      className={cn(inputClass, 'w-full')}
                    />
                  </td>
                  <td className="px-2 py-1 text-center">
                    <input
                      type="checkbox"
                      checked={!col.nullable}
                      onChange={(e) => updateColumn(col.id, { nullable: !e.target.checked })}
                      className="w-4 h-4"
                    />
                  </td>
                  <td className="px-2 py-1 text-center">
                    <input
                      type="checkbox"
                      checked={col.isPrimaryKey}
                      onChange={(e) => updateColumn(col.id, { isPrimaryKey: e.target.checked })}
                      className="w-4 h-4"
                    />
                  </td>
                  <td className="px-2 py-1 text-center">
                    <input
                      type="checkbox"
                      checked={col.autoIncrement}
                      onChange={(e) => updateColumn(col.id, { autoIncrement: e.target.checked })}
                      className="w-4 h-4"
                    />
                  </td>
                  <td className="px-2 py-1">
                    <input
                      type="text"
                      value={col.defaultValue}
                      onChange={(e) => updateColumn(col.id, { defaultValue: e.target.value })}
                      placeholder="NULL"
                      className={cn(inputClass, 'w-full')}
                    />
                  </td>
                  <td className="px-2 py-1">
                    <input
                      type="text"
                      value={col.comment}
                      onChange={(e) => updateColumn(col.id, { comment: e.target.value })}
                      className={cn(inputClass, 'w-full')}
                    />
                  </td>
                  <td className="px-2 py-1">
                    <button
                      onClick={() => removeColumn(col.id)}
                      disabled={columns.length <= 1}
                      className="p-1 text-status-error hover:bg-status-error/10 rounded disabled:opacity-30"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Indexes Tab */}
        {activeTab === 'indexes' && (
          <table className="w-full text-sm">
            <thead className={cn('sticky top-0', codeBg)}>
              <tr>
                <th className={cn('px-2 py-2 text-left font-medium', textSecondary)}>{t('database.indexName')}</th>
                <th className={cn('px-2 py-2 text-left font-medium w-24', textSecondary)}>{t('database.indexType')}</th>
                <th className={cn('px-2 py-2 text-left font-medium w-24', textSecondary)}>{t('database.method')}</th>
                <th className={cn('px-2 py-2 text-left font-medium', textSecondary)}>{t('database.selectColumns')}</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {indexes.map((idx) => (
                <tr key={idx.id} className={cn('border-t', borderColor)}>
                  <td className="px-2 py-1">
                    <input
                      type="text"
                      value={idx.name}
                      onChange={(e) => updateIndex(idx.id, { name: e.target.value })}
                      className={cn(inputClass, 'w-full')}
                    />
                  </td>
                  <td className="px-2 py-1">
                    <select
                      value={idx.unique ? 'unique' : 'normal'}
                      onChange={(e) => updateIndex(idx.id, { unique: e.target.value === 'unique' })}
                      className={cn(inputClass, 'w-full')}
                    >
                      <option value="normal">{t('database.normal')}</option>
                      <option value="unique">{t('database.unique')}</option>
                    </select>
                  </td>
                  <td className="px-2 py-1">
                    <select
                      value={idx.indexType}
                      onChange={(e) => updateIndex(idx.id, { indexType: e.target.value })}
                      className={cn(inputClass, 'w-full')}
                    >
                      <option value="BTREE">BTREE</option>
                      <option value="HASH">HASH</option>
                    </select>
                  </td>
                  <td className="px-2 py-1">
                    <div className="flex flex-wrap gap-1">
                      {availableColumns.map((col) => (
                        <label
                          key={col}
                          className={cn(
                            'inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs cursor-pointer border',
                            idx.columns.includes(col)
                              ? 'bg-accent-primary/20 border-accent-primary text-accent-primary'
                              : cn(borderColor, textSecondary, hoverBg)
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={idx.columns.includes(col)}
                            onChange={() => toggleIndexColumn(idx.id, col)}
                            className="hidden"
                          />
                          {col}
                        </label>
                      ))}
                      {availableColumns.length === 0 && (
                        <span className={textSecondary}>{t('database.addColumn')}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-2 py-1">
                    <button onClick={() => removeIndex(idx.id)} className="p-1 text-status-error hover:bg-status-error/10 rounded">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {indexes.length === 0 && (
                <tr><td colSpan={5} className={cn('px-4 py-8 text-center', textSecondary)}>{t('database.noIndexes')}</td></tr>
              )}
            </tbody>
          </table>
        )}

        {/* Foreign Keys Tab */}
        {activeTab === 'foreignKeys' && (
          <table className="w-full text-sm">
            <thead className={cn('sticky top-0', codeBg)}>
              <tr>
                <th className={cn('px-2 py-2 text-left font-medium', textSecondary)}>{t('database.fkName')}</th>
                <th className={cn('px-2 py-2 text-left font-medium', textSecondary)}>{t('database.column')}</th>
                <th className={cn('px-2 py-2 text-left font-medium', textSecondary)}>{t('database.refTable')}</th>
                <th className={cn('px-2 py-2 text-left font-medium', textSecondary)}>{t('database.refColumn')}</th>
                <th className={cn('px-2 py-2 text-left font-medium w-28', textSecondary)}>{t('database.onDelete')}</th>
                <th className={cn('px-2 py-2 text-left font-medium w-28', textSecondary)}>{t('database.onUpdate')}</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {foreignKeys.map((fk) => (
                <tr key={fk.id} className={cn('border-t', borderColor)}>
                  <td className="px-2 py-1">
                    <input
                      type="text"
                      value={fk.name}
                      onChange={(e) => updateForeignKey(fk.id, { name: e.target.value })}
                      className={cn(inputClass, 'w-full')}
                    />
                  </td>
                  <td className="px-2 py-1">
                    <select
                      value={fk.column}
                      onChange={(e) => updateForeignKey(fk.id, { column: e.target.value })}
                      className={cn(inputClass, 'w-full')}
                    >
                      <option value="">--</option>
                      {availableColumns.map((col) => <option key={col} value={col}>{col}</option>)}
                    </select>
                  </td>
                  <td className="px-2 py-1">
                    <input
                      type="text"
                      value={fk.refTable}
                      onChange={(e) => updateForeignKey(fk.id, { refTable: e.target.value })}
                      placeholder="table_name"
                      className={cn(inputClass, 'w-full')}
                    />
                  </td>
                  <td className="px-2 py-1">
                    <input
                      type="text"
                      value={fk.refColumn}
                      onChange={(e) => updateForeignKey(fk.id, { refColumn: e.target.value })}
                      placeholder="column_name"
                      className={cn(inputClass, 'w-full')}
                    />
                  </td>
                  <td className="px-2 py-1">
                    <select
                      value={fk.onDelete}
                      onChange={(e) => updateForeignKey(fk.id, { onDelete: e.target.value })}
                      className={cn(inputClass, 'w-full')}
                    >
                      {FK_ACTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
                    </select>
                  </td>
                  <td className="px-2 py-1">
                    <select
                      value={fk.onUpdate}
                      onChange={(e) => updateForeignKey(fk.id, { onUpdate: e.target.value })}
                      className={cn(inputClass, 'w-full')}
                    >
                      {FK_ACTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
                    </select>
                  </td>
                  <td className="px-2 py-1">
                    <button onClick={() => removeForeignKey(fk.id)} className="p-1 text-status-error hover:bg-status-error/10 rounded">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {foreignKeys.length === 0 && (
                <tr><td colSpan={7} className={cn('px-4 py-8 text-center', textSecondary)}>{t('database.noForeignKeys')}</td></tr>
              )}
            </tbody>
          </table>
        )}

        {/* Check Constraints Tab */}
        {activeTab === 'constraints' && (
          <table className="w-full text-sm">
            <thead className={cn('sticky top-0', codeBg)}>
              <tr>
                <th className={cn('px-2 py-2 text-left font-medium w-48', textSecondary)}>{t('database.constraintName')}</th>
                <th className={cn('px-2 py-2 text-left font-medium', textSecondary)}>{t('database.expression')}</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {checkConstraints.map((chk) => (
                <tr key={chk.id} className={cn('border-t', borderColor)}>
                  <td className="px-2 py-1">
                    <input
                      type="text"
                      value={chk.name}
                      onChange={(e) => updateCheckConstraint(chk.id, { name: e.target.value })}
                      className={cn(inputClass, 'w-full')}
                    />
                  </td>
                  <td className="px-2 py-1">
                    <input
                      type="text"
                      value={chk.expression}
                      onChange={(e) => updateCheckConstraint(chk.id, { expression: e.target.value })}
                      placeholder="e.g. price > 0"
                      className={cn(inputClass, 'w-full')}
                    />
                  </td>
                  <td className="px-2 py-1">
                    <button onClick={() => removeCheckConstraint(chk.id)} className="p-1 text-status-error hover:bg-status-error/10 rounded">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {checkConstraints.length === 0 && (
                <tr><td colSpan={3} className={cn('px-4 py-8 text-center', textSecondary)}>{t('database.noCheckConstraints')}</td></tr>
              )}
            </tbody>
          </table>
        )}

        {/* Triggers Tab */}
        {activeTab === 'triggers' && (
          <div className="p-4 space-y-4">
            {triggers.map((trg) => (
              <div key={trg.id} className={cn('border rounded-md p-3', borderColor)}>
                <div className="flex items-center gap-4 mb-3">
                  <div className="flex items-center gap-2">
                    <label className={cn('text-sm', textSecondary)}>{t('database.triggerName')}:</label>
                    <input
                      type="text"
                      value={trg.name}
                      onChange={(e) => updateTrigger(trg.id, { name: e.target.value })}
                      className={cn(inputClass, 'w-40')}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <label className={cn('text-sm', textSecondary)}>{t('database.timing')}:</label>
                    <select
                      value={trg.timing}
                      onChange={(e) => updateTrigger(trg.id, { timing: e.target.value })}
                      className={cn(inputClass, 'w-24')}
                    >
                      <option value="BEFORE">BEFORE</option>
                      <option value="AFTER">AFTER</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className={cn('text-sm', textSecondary)}>{t('database.event')}:</label>
                    <select
                      value={trg.event}
                      onChange={(e) => updateTrigger(trg.id, { event: e.target.value })}
                      className={cn(inputClass, 'w-24')}
                    >
                      <option value="INSERT">INSERT</option>
                      <option value="UPDATE">UPDATE</option>
                      <option value="DELETE">DELETE</option>
                    </select>
                  </div>
                  <button onClick={() => removeTrigger(trg.id)} className="p-1 text-status-error hover:bg-status-error/10 rounded ml-auto">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <textarea
                  value={trg.statement}
                  onChange={(e) => updateTrigger(trg.id, { statement: e.target.value })}
                  rows={4}
                  placeholder="BEGIN ... END"
                  className={cn(inputClass, 'w-full font-mono text-xs resize-none', codeBg)}
                />
              </div>
            ))}
            {triggers.length === 0 && (
              <div className={cn('text-center py-8', textSecondary)}>{t('database.noTriggers')}</div>
            )}
          </div>
        )}

        {/* Advanced Tab */}
        {activeTab === 'advanced' && (
          <div className="p-4">
            <div className="grid grid-cols-3 gap-4 max-w-2xl">
              <div>
                <label className={cn('block text-sm mb-1', textSecondary)}>{t('database.engine')}</label>
                <select className={cn(inputClass, 'w-full')} value={engine} onChange={(e) => setEngine(e.target.value)}>
                  {ENGINES.map((e) => <option key={e} value={e}>{e}</option>)}
                </select>
              </div>
              <div>
                <label className={cn('block text-sm mb-1', textSecondary)}>{t('database.charset')}</label>
                <select className={cn(inputClass, 'w-full')} value={charset} onChange={(e) => setCharset(e.target.value)}>
                  {CHARSETS.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* SQL Preview */}
      <div className={cn('border-t p-3 shrink-0', borderColor)}>
        <button
          onClick={() => setShowSqlPreview(!showSqlPreview)}
          className={cn('flex items-center gap-1 text-sm font-medium', textPrimary)}
        >
          {showSqlPreview ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          {t('database.sqlPreview')}
        </button>
        {showSqlPreview && (
          <pre className={cn('mt-2 p-3 rounded-md text-sm border overflow-x-auto whitespace-pre-wrap max-h-32', codeBg, borderColor, textPrimary)}>
            {generateSql() || t('database.enterTableName')}
          </pre>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className={cn('mx-4 mb-3 p-3 rounded-md bg-status-error/10 border border-status-error/30 text-sm text-status-error')}>
          {error}
        </div>
      )}
    </div>
  )
}
