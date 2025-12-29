/**
 * Create Table Inline Component
 *
 * Inline component for creating a new database table with inline editing for all fields.
 * This is a version of CreateTableDialog without the dialog wrapper.
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Plus, ChevronDown, ChevronUp, Save, Trash2, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { invoke } from '@tauri-apps/api/core'
import { cn } from '@/lib/utils'
import { useThemeStore, useConnectionStore } from '@/stores'
import { dbExecuteSql } from '@/services/database'

// ClickHouse cluster info from backend
interface ClusterInfo {
  name: string
  shard_count: number
  replica_count: number
}
import type { DatabaseConnection } from '@/types'
import {
  getEngines,
  getCharsets,
  getIndexTypes,
  getForeignKeyActions,
  quoteIdentifier,
  quoteTableName,
  type DatabaseType,
} from '@/config/dbDialects'
import { getDataTypeNames } from '@/config/datatypes'
// These utility functions are available for advanced features:
// import { getTypesByCategory, isTypeSized, hasTypePrecision, canTypeAutoIncrement, isTypeSigned } from '@/config/datatypes'

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
  unsigned: boolean  // MySQL/MariaDB UNSIGNED
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

type TabType = 'columns' | 'indexes' | 'foreignKeys' | 'constraints' | 'triggers' | 'advanced'

export function CreateTableInline({
  connectionId,
  database,
  onSuccess,
  onClose: _onClose,
}: CreateTableInlineProps) {
  const { t } = useTranslation()
  const { theme } = useThemeStore()
  const isDark = theme === 'dark'
  const { connections } = useConnectionStore()
  const connection = connections.find((c) => c.id === connectionId) as DatabaseConnection | undefined
  const dbType = connection?.dbType || 'mysql'

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

  // ClickHouse distributed table options
  const [chTableType, setChTableType] = useState<'local' | 'distributed'>('local')
  const [chCluster, setChCluster] = useState('')
  const [chShardingKey, setChShardingKey] = useState('rand()')
  const [chLocalTableName, setChLocalTableName] = useState('')
  const [chClusters, setChClusters] = useState<ClusterInfo[]>([])
  const [chClustersLoading, setChClustersLoading] = useState(false)

  // Database type flags (defined early for use in useEffect)
  const isClickHouse = dbType === 'clickhouse'
  const isOracle = dbType === 'oracle'

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
    // Reset ClickHouse distributed table options
    setChTableType('local')
    setChCluster('')
    setChShardingKey('rand()')
    setChLocalTableName('')
    setChClusters([])
  }, [database])

  // Fetch ClickHouse clusters when distributed table is selected
  useEffect(() => {
    if (!isClickHouse || chTableType !== 'distributed') return
    if (chClusters.length > 0) return // Already loaded

    const fetchClusters = async () => {
      setChClustersLoading(true)
      try {
        const clusters = await invoke<ClusterInfo[]>('db_get_clickhouse_clusters', {
          connectionId,
        })
        setChClusters(clusters)
        // Auto-select first cluster if available
        if (clusters.length > 0 && !chCluster) {
          setChCluster(clusters[0].name)
        }
      } catch (err) {
        console.error('Failed to load clusters:', err)
      } finally {
        setChClustersLoading(false)
      }
    }
    fetchClusters()
  }, [isClickHouse, chTableType, connectionId, chCluster, chClusters.length])

  // Get dynamic configuration based on database type
  const columnTypes = useMemo(() => getDataTypeNames(dbType as DatabaseType), [dbType])
  const engines = useMemo(() => getEngines(dbType as DatabaseType), [dbType])
  const charsets = useMemo(() => getCharsets(dbType as DatabaseType), [dbType])
  const indexTypes = useMemo(() => getIndexTypes(dbType as DatabaseType), [dbType])
  const fkActions = useMemo(() => getForeignKeyActions(dbType as DatabaseType), [dbType])

  // Oracle doesn't support ON UPDATE for foreign keys
  const supportsOnUpdate = !isOracle

  // Use dialect's quote functions
  const q = useCallback((identifier: string) => {
    return quoteIdentifier(dbType as DatabaseType, identifier)
  }, [dbType])

  const qTable = useCallback((db: string, table: string) => {
    return quoteTableName(dbType as DatabaseType, db, table)
  }, [dbType])

  // Default column type based on database
  const defaultColumnType = useMemo(() => {
    if (dbType === 'postgresql') return 'VARCHAR'
    return 'VARCHAR'
  }, [dbType])

  const createEmptyColumn = useCallback((): ColumnDef => ({
    id: crypto.randomUUID(),
    name: '',
    type: defaultColumnType,
    length: '255',
    scale: '',
    nullable: true,
    isPrimaryKey: false,
    autoIncrement: false,
    unsigned: false,
    defaultValue: '',
    comment: '',
  }), [defaultColumnType])

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
    const isMySQLLike = dbType === 'mysql' || dbType === 'mariadb'
    const isCH = dbType === 'clickhouse'

    validColumns.forEach((col) => {
      let def = `  ${q(col.name)} ${col.type}`
      if (['VARCHAR', 'CHAR', 'VARBINARY', 'BINARY', 'VARCHAR2', 'NVARCHAR2', 'RAW'].includes(col.type) && col.length) {
        def += `(${col.length})`
      } else if (['DECIMAL', 'NUMERIC', 'NUMBER'].includes(col.type) && col.length) {
        def += col.scale ? `(${col.length},${col.scale})` : `(${col.length})`
      }
      if (!col.nullable) def += ' NOT NULL'
      if (col.autoIncrement && !isCH) {
        // PostgreSQL uses SERIAL/BIGSERIAL, MySQL uses AUTO_INCREMENT, Oracle uses GENERATED AS IDENTITY
        // ClickHouse doesn't support auto increment
        if (isOracle) def += ' GENERATED ALWAYS AS IDENTITY'
        else if (!isPostgres) def += ' AUTO_INCREMENT'
      }
      if (col.defaultValue) def += ` DEFAULT ${col.defaultValue}`
      // COMMENT syntax is MySQL/MariaDB/ClickHouse-specific (inline)
      if (col.comment && (isMySQLLike || isCH)) def += ` COMMENT '${col.comment.replace(/'/g, "''")}'`
      defs.push(def)
    })

    const pkCols = validColumns.filter((c) => c.isPrimaryKey).map((c) => q(c.name))
    if (pkCols.length > 0) defs.push(`  PRIMARY KEY (${pkCols.join(', ')})`)

    indexes.filter((i) => i.columns.length > 0).forEach((idx) => {
      const colList = idx.columns.map((c) => q(c)).join(', ')
      // MySQL inline index syntax (Oracle and PostgreSQL use separate CREATE INDEX)
      if (isMySQLLike) {
        const indexType = idx.unique ? 'UNIQUE KEY' : 'KEY'
        defs.push(`  ${indexType} ${q(idx.name)} (${colList}) USING ${idx.indexType}`)
      }
    })

    foreignKeys.filter((f) => f.column && f.refTable && f.refColumn).forEach((fk) => {
      // Oracle doesn't support ON UPDATE
      const onUpdate = isOracle ? '' : ` ON UPDATE ${fk.onUpdate}`
      defs.push(`  CONSTRAINT ${q(fk.name)} FOREIGN KEY (${q(fk.column)}) REFERENCES ${q(fk.refTable)}(${q(fk.refColumn)}) ON DELETE ${fk.onDelete}${onUpdate}`)
    })

    checkConstraints.filter((c) => c.expression).forEach((chk) => {
      defs.push(`  CONSTRAINT ${q(chk.name)} CHECK (${chk.expression})`)
    })

    let sql = ''

    // ClickHouse distributed table requires special handling
    if (isCH && chTableType === 'distributed') {
      // Generate SQL for distributed table (creates both local and distributed tables)
      const localName = chLocalTableName.trim() || `${tableName}_local`

      // First create the local table
      sql = `-- Create local table on each node\n`
      sql += `CREATE TABLE ${qTable(database, localName)} ON CLUSTER ${q(chCluster)} (\n${defs.join(',\n')}\n)`
      sql += `\nENGINE = ${engine || 'MergeTree'}`
      const orderByCols = pkCols.length > 0 ? pkCols : [q(validColumns[0].name)]
      sql += `\nORDER BY (${orderByCols.join(', ')})`
      if (tableComment) sql += `\nCOMMENT '${tableComment.replace(/'/g, "''")}'`
      sql += ';\n\n'

      // Then create the distributed table
      sql += `-- Create distributed table\n`
      sql += `CREATE TABLE ${qTable(database, tableName)} ON CLUSTER ${q(chCluster)} AS ${qTable(database, localName)}`
      sql += `\nENGINE = Distributed(${q(chCluster)}, ${q(database)}, ${q(localName)}, ${chShardingKey || 'rand()'})`
      sql += ';'
    } else {
      sql = `CREATE TABLE ${qTable(database, tableName)} (\n${defs.join(',\n')}\n)`
      // Engine and charset are MySQL/MariaDB-specific
      if (isMySQLLike) {
        sql += ` ENGINE=${engine} DEFAULT CHARSET=${charset}`
        if (tableComment) sql += ` COMMENT='${tableComment.replace(/'/g, "''")}'`
      } else if (isCH) {
        // ClickHouse requires ENGINE and ORDER BY for MergeTree family
        sql += `\nENGINE = ${engine || 'MergeTree'}`
        // Use primary key columns for ORDER BY if available, otherwise use first column
        const orderByCols = pkCols.length > 0 ? pkCols : [q(validColumns[0].name)]
        sql += `\nORDER BY (${orderByCols.join(', ')})`
        if (tableComment) sql += `\nCOMMENT '${tableComment.replace(/'/g, "''")}'`
      }
      sql += ';'
    }

    // PostgreSQL and Oracle index creation is separate
    if (isPostgres || isOracle) {
      indexes.filter((i) => i.columns.length > 0).forEach((idx) => {
        const uniqueStr = idx.unique ? 'UNIQUE ' : ''
        const colList = idx.columns.map((c) => q(c)).join(', ')
        if (isOracle) {
          // Oracle doesn't support USING for index type in CREATE INDEX
          sql += `\n\nCREATE ${uniqueStr}INDEX ${q(idx.name)} ON ${qTable(database, tableName)} (${colList});`
        } else {
          sql += `\n\nCREATE ${uniqueStr}INDEX ${q(idx.name)} ON ${qTable(database, tableName)} USING ${idx.indexType} (${colList});`
        }
      })
    }

    triggers.filter((t) => t.statement).forEach((trg) => {
      if (isPostgres) {
        // PostgreSQL trigger syntax is different
        sql += `\n\nCREATE TRIGGER ${q(trg.name)} ${trg.timing} ${trg.event} ON ${qTable(database, tableName)} FOR EACH ROW EXECUTE FUNCTION ${trg.statement}`
      } else if (isOracle) {
        // Oracle trigger syntax
        sql += `\n\nCREATE OR REPLACE TRIGGER ${q(trg.name)} ${trg.timing} ${trg.event} ON ${qTable(database, tableName)} FOR EACH ROW\n${trg.statement}`
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

  // ClickHouse distributed tables require cluster name
  const canCreate = tableName.trim() && columns.some((c) => c.name.trim()) &&
    (!isClickHouse || chTableType !== 'distributed' || chCluster.trim())
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

  // ClickHouse doesn't support foreign keys, CHECK constraints, or triggers
  const allTabs: { key: TabType; label: string; supported: boolean }[] = [
    { key: 'columns', label: t('database.columns'), supported: true },
    { key: 'indexes', label: t('database.indexes'), supported: true },
    { key: 'foreignKeys', label: t('database.foreignKeys'), supported: !isClickHouse },
    { key: 'constraints', label: t('database.constraints'), supported: !isClickHouse },
    { key: 'triggers', label: t('database.triggers'), supported: !isClickHouse },
    { key: 'advanced', label: t('database.advanced'), supported: true },
  ]
  const tabs = allTabs.filter(tab => tab.supported)

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
                {!isClickHouse && <th className={cn('px-2 py-2 text-center font-medium w-10', textSecondary)}>AI</th>}
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
                      {columnTypes.map((typeName) => <option key={typeName} value={typeName}>{typeName}</option>)}
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
                  {!isClickHouse && (
                    <td className="px-2 py-1 text-center">
                      <input
                        type="checkbox"
                        checked={col.autoIncrement}
                        onChange={(e) => updateColumn(col.id, { autoIncrement: e.target.checked })}
                        className="w-4 h-4"
                      />
                    </td>
                  )}
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
                      {indexTypes.map((idxType) => <option key={idxType} value={idxType}>{idxType}</option>)}
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
                {supportsOnUpdate && (
                  <th className={cn('px-2 py-2 text-left font-medium w-28', textSecondary)}>{t('database.onUpdate')}</th>
                )}
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
                      {fkActions.map((action) => <option key={action} value={action}>{action}</option>)}
                    </select>
                  </td>
                  {supportsOnUpdate && (
                    <td className="px-2 py-1">
                      <select
                        value={fk.onUpdate}
                        onChange={(e) => updateForeignKey(fk.id, { onUpdate: e.target.value })}
                        className={cn(inputClass, 'w-full')}
                      >
                        {fkActions.map((action) => <option key={action} value={action}>{action}</option>)}
                      </select>
                    </td>
                  )}
                  <td className="px-2 py-1">
                    <button onClick={() => removeForeignKey(fk.id)} className="p-1 text-status-error hover:bg-status-error/10 rounded">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {foreignKeys.length === 0 && (
                <tr><td colSpan={supportsOnUpdate ? 7 : 6} className={cn('px-4 py-8 text-center', textSecondary)}>{t('database.noForeignKeys')}</td></tr>
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
            <div className="grid grid-cols-3 gap-4 max-w-3xl">
              {/* ClickHouse table type selector */}
              {isClickHouse && (
                <div>
                  <label className={cn('block text-sm mb-1', textSecondary)}>{t('database.tableType', { defaultValue: 'Table Type' })}</label>
                  <select className={cn(inputClass, 'w-full')} value={chTableType} onChange={(e) => setChTableType(e.target.value as 'local' | 'distributed')}>
                    <option value="local">{t('database.localTable', { defaultValue: 'Local Table' })}</option>
                    <option value="distributed">{t('database.distributedTable', { defaultValue: 'Distributed Table' })}</option>
                  </select>
                </div>
              )}
              {/* Engine selector - MySQL/MariaDB/ClickHouse */}
              {engines.length > 0 && (
                <div>
                  <label className={cn('block text-sm mb-1', textSecondary)}>{t('database.engine')}</label>
                  <select className={cn(inputClass, 'w-full')} value={engine} onChange={(e) => setEngine(e.target.value)}>
                    {engines.map((eng) => <option key={eng} value={eng}>{eng}</option>)}
                  </select>
                </div>
              )}
              {/* Charset selector - MySQL/MariaDB only */}
              {charsets.length > 0 && (
                <div>
                  <label className={cn('block text-sm mb-1', textSecondary)}>{t('database.charset')}</label>
                  <select className={cn(inputClass, 'w-full')} value={charset} onChange={(e) => setCharset(e.target.value)}>
                    {charsets.map((cs) => <option key={cs} value={cs}>{cs}</option>)}
                  </select>
                </div>
              )}
              {/* ClickHouse distributed table options */}
              {isClickHouse && chTableType === 'distributed' && (
                <>
                  <div>
                    <label className={cn('block text-sm mb-1', textSecondary)}>{t('database.clusterName', { defaultValue: 'Cluster Name' })}</label>
                    <div className="relative">
                      <select
                        className={cn(inputClass, 'w-full', chClustersLoading && 'opacity-50')}
                        value={chCluster}
                        onChange={(e) => setChCluster(e.target.value)}
                        disabled={chClustersLoading}
                      >
                        {chClusters.length === 0 && !chClustersLoading && (
                          <option value="">{t('database.noClusters', { defaultValue: 'No clusters found' })}</option>
                        )}
                        {chClusters.map((cluster) => (
                          <option key={cluster.name} value={cluster.name}>
                            {cluster.name} ({cluster.shard_count} shards, {cluster.replica_count} replicas)
                          </option>
                        ))}
                      </select>
                      {chClustersLoading && (
                        <Loader2 className="absolute right-8 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-accent-primary" />
                      )}
                    </div>
                  </div>
                  <div>
                    <label className={cn('block text-sm mb-1', textSecondary)}>{t('database.shardingKey', { defaultValue: 'Sharding Key' })}</label>
                    <input
                      type="text"
                      placeholder="rand()"
                      className={cn(inputClass, 'w-full')}
                      value={chShardingKey}
                      onChange={(e) => setChShardingKey(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className={cn('block text-sm mb-1', textSecondary)}>{t('database.localTableName', { defaultValue: 'Local Table Name' })}</label>
                    <input
                      type="text"
                      placeholder={tableName ? `${tableName}_local` : 'auto'}
                      className={cn(inputClass, 'w-full')}
                      value={chLocalTableName}
                      onChange={(e) => setChLocalTableName(e.target.value)}
                    />
                  </div>
                </>
              )}
              {/* Show message if no advanced options available */}
              {engines.length === 0 && charsets.length === 0 && !isClickHouse && (
                <div className={cn('col-span-3 text-center py-4', textSecondary)}>
                  {t('database.noAdvancedOptions', { defaultValue: 'No advanced options available for this database type' })}
                </div>
              )}
            </div>
            {/* ClickHouse sharding key examples */}
            {isClickHouse && chTableType === 'distributed' && (
              <div className={cn('mt-4 p-3 rounded text-xs', codeBg, textSecondary)}>
                <div className="font-medium mb-1">{t('database.shardingKeyExamples', { defaultValue: 'Common Sharding Keys:' })}</div>
                <ul className="space-y-1 ml-2">
                  <li><code>rand()</code> - {t('database.shardingRandom', { defaultValue: 'Random distribution' })}</li>
                  <li><code>xxHash64(user_id)</code> - {t('database.shardingHash', { defaultValue: 'Hash by user ID' })}</li>
                  <li><code>intHash64(order_id)</code> - {t('database.shardingIntHash', { defaultValue: 'Hash by integer order ID' })}</li>
                </ul>
              </div>
            )}
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
