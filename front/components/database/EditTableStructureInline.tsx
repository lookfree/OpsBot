/**
 * Edit Table Structure Inline Component
 *
 * Inline component for editing an existing table's structure.
 * This is a version of EditTableStructureDialog without the dialog wrapper.
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Plus, ChevronDown, ChevronUp, Loader2, Save, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { useThemeStore, useConnectionStore } from '@/stores'
import { dbGetTableStructureExt, dbExecuteSql } from '@/services/database'
import type { DatabaseConnection } from '@/types'
import type { ColumnDetail, IndexInfo, ForeignKeyInfo, CheckConstraintInfo, TriggerInfo, TableOptions } from '@/services/database'
import {
  getIndexTypes,
  getForeignKeyActions,
  quoteIdentifier,
  quoteTableName,
  type DatabaseType,
} from '@/config/dbDialects'
import { getDataTypeNames } from '@/config/datatypes'

interface EditTableStructureInlineProps {
  connectionId: string
  database: string
  tableName: string
  onSuccess: () => void
  onClose: () => void
}

interface ColumnDef {
  id: string
  originalName: string
  name: string
  type: string
  length: string
  nullable: boolean
  isPrimaryKey: boolean
  autoIncrement: boolean
  defaultValue: string
  comment: string
  isNew: boolean
  isDeleted: boolean
  isModified: boolean
}

interface IndexDef {
  id: string
  originalName: string
  name: string
  unique: boolean
  indexType: string
  columns: string[]
  isNew: boolean
  isDeleted: boolean
}

interface ForeignKeyDef {
  id: string
  originalName: string
  name: string
  column: string
  refTable: string
  refColumn: string
  onDelete: string
  onUpdate: string
  isNew: boolean
  isDeleted: boolean
}

interface CheckConstraintDef {
  id: string
  originalName: string
  name: string
  expression: string
  isNew: boolean
  isDeleted: boolean
}

interface TriggerDef {
  id: string
  originalName: string
  name: string
  timing: string
  event: string
  statement: string
  isNew: boolean
  isDeleted: boolean
}

type TabType = 'columns' | 'indexes' | 'foreignKeys' | 'constraints' | 'triggers' | 'advanced'

export function EditTableStructureInline({
  connectionId, database, tableName, onSuccess, onClose,
}: EditTableStructureInlineProps) {
  const { t } = useTranslation()
  const { theme } = useThemeStore()
  const isDark = theme === 'dark'
  const { connections } = useConnectionStore()
  const connection = connections.find((c) => c.id === connectionId) as DatabaseConnection | undefined
  const dbType = connection?.dbType || 'mysql'

  // Get dynamic configuration based on database type
  const columnTypes = useMemo(() => getDataTypeNames(dbType as DatabaseType), [dbType])
  const indexTypes = useMemo(() => getIndexTypes(dbType as DatabaseType), [dbType])
  const fkActions = useMemo(() => getForeignKeyActions(dbType as DatabaseType), [dbType])
  const supportsOnUpdate = dbType !== 'oracle' // Oracle doesn't support ON UPDATE

  // Use dialect's quote functions
  const q = useCallback((identifier: string) => {
    return quoteIdentifier(dbType as DatabaseType, identifier)
  }, [dbType])

  const qTable = useCallback((db: string, table: string) => {
    return quoteTableName(dbType as DatabaseType, db, table)
  }, [dbType])

  const [activeTab, setActiveTab] = useState<TabType>('columns')
  const [columns, setColumns] = useState<ColumnDef[]>([])
  const [indexes, setIndexes] = useState<IndexDef[]>([])
  const [foreignKeys, setForeignKeys] = useState<ForeignKeyDef[]>([])
  const [checkConstraints, setCheckConstraints] = useState<CheckConstraintDef[]>([])
  const [triggers, setTriggers] = useState<TriggerDef[]>([])
  const [tableOptions, setTableOptions] = useState<TableOptions | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showSqlPreview, setShowSqlPreview] = useState(false)

  useEffect(() => {
    if (connectionId && database && tableName) {
      resetState()
      loadTableStructure()
    }
  }, [connectionId, database, tableName])

  const resetState = () => {
    setColumns([]); setIndexes([]); setForeignKeys([])
    setCheckConstraints([]); setTriggers([]); setTableOptions(null)
    setError(null); setActiveTab('columns')
  }

  const loadTableStructure = async () => {
    setIsLoading(true); setError(null)
    try {
      const s = await dbGetTableStructureExt(connectionId, database, tableName)
      setColumns(s.columns.map(mapColumn))
      setIndexes(s.indexes.map(mapIndex))
      setForeignKeys(s.foreignKeys.map(mapForeignKey))
      setCheckConstraints(s.checkConstraints.map(mapConstraint))
      setTriggers(s.triggers.map(mapTrigger))
      setTableOptions(s.options)
    } catch (err) { setError(String(err)) }
    finally { setIsLoading(false) }
  }

  const mapColumn = (col: ColumnDetail): ColumnDef => {
    const m = col.columnType.match(/^(\w+)(?:\(([^)]+)\))?/)
    return {
      id: crypto.randomUUID(), originalName: col.name, name: col.name,
      type: m?.[1]?.toUpperCase() || col.columnType, length: m?.[2] || '',
      nullable: col.nullable, isPrimaryKey: col.key === 'PRI',
      autoIncrement: col.extra?.includes('auto_increment') || false,
      defaultValue: col.defaultValue || '', comment: col.comment || '',
      isNew: false, isDeleted: false, isModified: false,
    }
  }

  const mapIndex = (idx: IndexInfo): IndexDef => ({
    id: crypto.randomUUID(), originalName: idx.name, name: idx.name,
    columns: idx.columns, unique: idx.unique, indexType: idx.indexType,
    isNew: false, isDeleted: false,
  })

  const mapForeignKey = (fk: ForeignKeyInfo): ForeignKeyDef => ({
    id: crypto.randomUUID(), originalName: fk.name, name: fk.name,
    column: fk.column, refTable: fk.refTable, refColumn: fk.refColumn,
    onDelete: fk.onDelete, onUpdate: fk.onUpdate, isNew: false, isDeleted: false,
  })

  const mapConstraint = (c: CheckConstraintInfo): CheckConstraintDef => ({
    id: crypto.randomUUID(), originalName: c.name, name: c.name,
    expression: c.expression, isNew: false, isDeleted: false,
  })

  const mapTrigger = (t: TriggerInfo): TriggerDef => ({
    id: crypto.randomUUID(), originalName: t.name, name: t.name,
    timing: t.timing, event: t.event, statement: t.statement,
    isNew: false, isDeleted: false,
  })

  const updateColumn = (id: string, updates: Partial<ColumnDef>) => {
    setColumns(cols => cols.map(c => {
      if (c.id !== id) return c
      const u = { ...c, ...updates }
      if (!c.isNew) u.isModified = u.name !== c.originalName || u.type !== c.type || u.length !== c.length ||
        u.nullable !== c.nullable || u.comment !== c.comment || u.defaultValue !== c.defaultValue || u.autoIncrement !== c.autoIncrement
      return u
    }))
  }

  const addColumn = () => setColumns(cols => [...cols, {
    id: crypto.randomUUID(), originalName: '', name: '', type: 'VARCHAR', length: '255',
    nullable: true, isPrimaryKey: false, autoIncrement: false, defaultValue: '', comment: '',
    isNew: true, isDeleted: false, isModified: false,
  }])

  const removeColumn = (id: string) => setColumns(cols => cols.map(c =>
    c.id !== id ? c : c.isNew ? { ...c, isDeleted: true } : { ...c, isDeleted: !c.isDeleted }
  ).filter(c => !(c.isNew && c.isDeleted)))

  const addIndex = () => setIndexes(idxs => [...idxs, {
    id: crypto.randomUUID(), originalName: '', name: `idx_${Date.now()}`,
    unique: false, indexType: 'BTREE', columns: [], isNew: true, isDeleted: false,
  }])

  const updateIndex = (id: string, updates: Partial<IndexDef>) => setIndexes(idxs => idxs.map(i => i.id === id ? { ...i, ...updates } : i))

  const removeIndex = (id: string) => setIndexes(idxs => idxs.map(i =>
    i.id !== id || i.name === 'PRIMARY' ? i : i.isNew ? { ...i, isDeleted: true } : { ...i, isDeleted: !i.isDeleted }
  ).filter(i => !(i.isNew && i.isDeleted)))

  const toggleIndexColumn = (indexId: string, colName: string) => {
    setIndexes(idxs => idxs.map(idx => {
      if (idx.id !== indexId) return idx
      const cols = idx.columns.includes(colName) ? idx.columns.filter(c => c !== colName) : [...idx.columns, colName]
      return { ...idx, columns: cols }
    }))
  }

  const addForeignKey = () => setForeignKeys(fks => [...fks, {
    id: crypto.randomUUID(), originalName: '', name: `fk_${Date.now()}`,
    column: '', refTable: '', refColumn: '', onDelete: 'NO ACTION', onUpdate: 'NO ACTION',
    isNew: true, isDeleted: false,
  }])

  const updateForeignKey = (id: string, updates: Partial<ForeignKeyDef>) => setForeignKeys(fks => fks.map(f => f.id === id ? { ...f, ...updates } : f))

  const removeForeignKey = (id: string) => setForeignKeys(fks => fks.map(f =>
    f.id !== id ? f : f.isNew ? { ...f, isDeleted: true } : { ...f, isDeleted: !f.isDeleted }
  ).filter(f => !(f.isNew && f.isDeleted)))

  const addCheckConstraint = () => setCheckConstraints(cs => [...cs, {
    id: crypto.randomUUID(), originalName: '', name: `chk_${Date.now()}`,
    expression: '', isNew: true, isDeleted: false,
  }])

  const updateCheckConstraint = (id: string, updates: Partial<CheckConstraintDef>) => setCheckConstraints(cs => cs.map(c => c.id === id ? { ...c, ...updates } : c))

  const removeCheckConstraint = (id: string) => setCheckConstraints(cs => cs.map(c =>
    c.id !== id ? c : c.isNew ? { ...c, isDeleted: true } : { ...c, isDeleted: !c.isDeleted }
  ).filter(c => !(c.isNew && c.isDeleted)))

  const addTrigger = () => setTriggers(ts => [...ts, {
    id: crypto.randomUUID(), originalName: '', name: `trg_${Date.now()}`,
    timing: 'BEFORE', event: 'INSERT', statement: 'BEGIN\n  \nEND', isNew: true, isDeleted: false,
  }])

  const updateTrigger = (id: string, updates: Partial<TriggerDef>) => setTriggers(ts => ts.map(t => t.id === id ? { ...t, ...updates } : t))

  const removeTrigger = (id: string) => setTriggers(ts => ts.map(t =>
    t.id !== id ? t : t.isNew ? { ...t, isDeleted: true } : { ...t, isDeleted: !t.isDeleted }
  ).filter(t => !(t.isNew && t.isDeleted)))

  const handleAdd = () => {
    switch (activeTab) {
      case 'columns': addColumn(); break
      case 'indexes': addIndex(); break
      case 'foreignKeys': addForeignKey(); break
      case 'constraints': addCheckConstraint(); break
      case 'triggers': addTrigger(); break
    }
  }

  const generateAlterStatements = (): string[] => {
    const stmts: string[] = []
    const tbl = qTable(database, tableName)
    const isPg = dbType === 'postgresql'
    const isOracle = dbType === 'oracle'

    // Drop indexes first
    indexes.filter(i => i.isDeleted && !i.isNew && i.originalName !== 'PRIMARY').forEach(i => {
      if (isPg) {
        stmts.push(`DROP INDEX IF EXISTS ${q(i.originalName)};`)
      } else {
        stmts.push(`ALTER TABLE ${tbl} DROP INDEX ${q(i.originalName)};`)
      }
    })

    // Drop columns
    columns.filter(c => c.isDeleted && !c.isNew).forEach(c =>
      stmts.push(`ALTER TABLE ${tbl} DROP COLUMN ${q(c.originalName)};`))

    // Modify columns
    columns.filter(c => c.isModified && !c.isNew && !c.isDeleted).forEach(c => {
      if (isPg) {
        // PostgreSQL uses ALTER COLUMN for modifications
        const colName = q(c.name)
        if (c.name !== c.originalName) {
          stmts.push(`ALTER TABLE ${tbl} RENAME COLUMN ${q(c.originalName)} TO ${colName};`)
        }
        stmts.push(`ALTER TABLE ${tbl} ALTER COLUMN ${colName} TYPE ${c.type}${c.length ? `(${c.length})` : ''};`)
        stmts.push(`ALTER TABLE ${tbl} ALTER COLUMN ${colName} ${c.nullable ? 'DROP NOT NULL' : 'SET NOT NULL'};`)
        if (c.defaultValue) {
          stmts.push(`ALTER TABLE ${tbl} ALTER COLUMN ${colName} SET DEFAULT ${c.defaultValue};`)
        }
      } else {
        // MySQL uses MODIFY/CHANGE COLUMN
        let def = `${q(c.name)} ${c.type}${c.length ? `(${c.length})` : ''}`
        if (!c.nullable) def += ' NOT NULL'
        if (c.autoIncrement) def += ' AUTO_INCREMENT'
        if (c.defaultValue) def += ` DEFAULT ${c.defaultValue}`
        if (c.comment) def += ` COMMENT '${c.comment.replace(/'/g, "''")}'`
        stmts.push(c.name !== c.originalName
          ? `ALTER TABLE ${tbl} CHANGE COLUMN ${q(c.originalName)} ${def};`
          : `ALTER TABLE ${tbl} MODIFY COLUMN ${def};`)
      }
    })

    // Add new columns
    columns.filter(c => c.isNew && !c.isDeleted && c.name.trim()).forEach(c => {
      let def = `${q(c.name)} ${c.type}${c.length ? `(${c.length})` : ''}`
      if (!c.nullable) def += ' NOT NULL'
      if (!isPg && c.autoIncrement) def += ' AUTO_INCREMENT'
      if (c.defaultValue) def += ` DEFAULT ${c.defaultValue}`
      if (!isPg && c.comment) def += ` COMMENT '${c.comment.replace(/'/g, "''")}'`
      stmts.push(`ALTER TABLE ${tbl} ADD COLUMN ${def};`)
    })

    // Add new indexes
    indexes.filter(i => i.isNew && !i.isDeleted && i.columns.length > 0).forEach(i => {
      const colList = i.columns.map(c => q(c)).join(', ')
      if (isPg) {
        const unique = i.unique ? 'UNIQUE ' : ''
        stmts.push(`CREATE ${unique}INDEX ${q(i.name)} ON ${tbl} (${colList});`)
      } else {
        const type = i.unique ? 'UNIQUE INDEX' : 'INDEX'
        stmts.push(`ALTER TABLE ${tbl} ADD ${type} ${q(i.name)} (${colList}) USING ${i.indexType};`)
      }
    })

    // Drop foreign keys
    foreignKeys.filter(f => f.isDeleted && !f.isNew).forEach(f => {
      if (isPg) {
        stmts.push(`ALTER TABLE ${tbl} DROP CONSTRAINT ${q(f.originalName)};`)
      } else {
        stmts.push(`ALTER TABLE ${tbl} DROP FOREIGN KEY ${q(f.originalName)};`)
      }
    })

    // Add foreign keys
    foreignKeys.filter(f => f.isNew && !f.isDeleted && f.column && f.refTable && f.refColumn).forEach(f => {
      // Oracle doesn't support ON UPDATE
      const onUpdate = isOracle ? '' : ` ON UPDATE ${f.onUpdate}`
      stmts.push(`ALTER TABLE ${tbl} ADD CONSTRAINT ${q(f.name)} FOREIGN KEY (${q(f.column)}) REFERENCES ${q(f.refTable)}(${q(f.refColumn)}) ON DELETE ${f.onDelete}${onUpdate};`)
    })

    // Drop check constraints
    checkConstraints.filter(c => c.isDeleted && !c.isNew).forEach(c =>
      stmts.push(`ALTER TABLE ${tbl} DROP CONSTRAINT ${q(c.originalName)};`))

    // Add check constraints
    checkConstraints.filter(c => c.isNew && !c.isDeleted && c.expression).forEach(c =>
      stmts.push(`ALTER TABLE ${tbl} ADD CONSTRAINT ${q(c.name)} CHECK (${c.expression});`))

    // Drop triggers
    triggers.filter(t => t.isDeleted && !t.isNew).forEach(t => {
      if (isPg) {
        stmts.push(`DROP TRIGGER IF EXISTS ${q(t.originalName)} ON ${tbl};`)
      } else {
        stmts.push(`DROP TRIGGER IF EXISTS ${qTable(database, t.originalName)};`)
      }
    })

    // Add triggers
    triggers.filter(t => t.isNew && !t.isDeleted && t.statement).forEach(t => {
      if (isPg) {
        // PostgreSQL triggers require a function
        stmts.push(`-- Note: PostgreSQL triggers require a trigger function`)
        stmts.push(`CREATE TRIGGER ${q(t.name)} ${t.timing} ${t.event} ON ${tbl} FOR EACH ROW EXECUTE FUNCTION ${t.statement}`)
      } else {
        stmts.push(`CREATE TRIGGER ${q(t.name)} ${t.timing} ${t.event} ON ${tbl} FOR EACH ROW ${t.statement}`)
      }
    })

    return stmts
  }

  const handleSave = async () => {
    const stmts = generateAlterStatements()
    if (stmts.length === 0) { onClose(); return }

    setIsSaving(true); setError(null)
    try {
      for (const sql of stmts) await dbExecuteSql({ connectionId, sql, database })
      onSuccess()
    } catch (err) { setError(String(err)) }
    finally { setIsSaving(false) }
  }

  const hasChanges = columns.some(c => c.isNew || c.isDeleted || c.isModified) ||
    indexes.some(i => i.isNew || i.isDeleted) || foreignKeys.some(f => f.isNew || f.isDeleted) ||
    checkConstraints.some(c => c.isNew || c.isDeleted) || triggers.some(t => t.isNew || t.isDeleted)

  const sqlPreview = generateAlterStatements().join('\n\n')
  const visibleColumns = columns.filter(c => !(c.isNew && c.isDeleted))
  const availableColumns = columns.filter(c => !c.isDeleted && c.name.trim()).map(c => c.name)

  // Theme styles
  const borderColor = isDark ? 'border-dark-border' : 'border-light-border'
  const textPrimary = isDark ? 'text-dark-text-primary' : 'text-light-text-primary'
  const textSecondary = isDark ? 'text-dark-text-secondary' : 'text-light-text-secondary'
  const inputBg = isDark ? 'bg-dark-bg-hover' : 'bg-light-bg-primary'
  const hoverBg = isDark ? 'hover:bg-dark-bg-hover' : 'hover:bg-light-bg-hover'
  const codeBg = isDark ? 'bg-dark-bg-secondary' : 'bg-light-bg-secondary'

  const inputClass = cn('px-2 py-1 rounded text-sm border focus:outline-none focus:border-accent-primary', inputBg, borderColor, textPrimary)

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
      {/* Toolbar */}
      <div className={cn('flex items-center gap-2 px-4 py-2 border-b', borderColor)}>
        <button
          onClick={handleSave}
          disabled={!hasChanges || isSaving}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 text-sm rounded transition-colors',
            hasChanges ? 'text-accent-primary hover:bg-accent-primary/10' : cn(textSecondary, 'cursor-not-allowed')
          )}
        >
          <Save className="w-4 h-4" />
          {t('database.apply')}
        </button>
        {activeTab !== 'advanced' && (
          <button onClick={handleAdd} className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded text-accent-primary hover:bg-accent-primary/10">
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
              activeTab === tab.key ? 'border-accent-primary text-accent-primary' : cn('border-transparent', textSecondary, hoverBg)
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex-1 flex items-center justify-center h-full">
            <Loader2 className="w-6 h-6 animate-spin text-accent-primary" />
          </div>
        ) : (
          <>
            {/* Columns Tab */}
            {activeTab === 'columns' && (
              <table className="w-full text-sm">
                <thead className={cn('sticky top-0', codeBg)}>
                  <tr>
                    <th className={cn('px-2 py-2 text-left font-medium', textSecondary)}>{t('database.columnName')}</th>
                    <th className={cn('px-2 py-2 text-left font-medium w-28', textSecondary)}>{t('database.type')}</th>
                    <th className={cn('px-2 py-2 text-left font-medium w-16', textSecondary)}>{t('database.length')}</th>
                    <th className={cn('px-2 py-2 text-center font-medium w-10', textSecondary)}>NN</th>
                    <th className={cn('px-2 py-2 text-center font-medium w-10', textSecondary)}>AI</th>
                    <th className={cn('px-2 py-2 text-left font-medium w-24', textSecondary)}>{t('database.defaultValue')}</th>
                    <th className={cn('px-2 py-2 text-left font-medium', textSecondary)}>{t('database.comment')}</th>
                    <th className="w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {visibleColumns.map((col) => (
                    <tr key={col.id} className={cn(
                      'border-t', borderColor,
                      col.isDeleted && 'opacity-50 line-through',
                      col.isNew && 'bg-status-success/10',
                      col.isModified && !col.isNew && 'bg-status-warning/10'
                    )}>
                      <td className="px-2 py-1">
                        <input type="text" value={col.name} onChange={(e) => updateColumn(col.id, { name: e.target.value })}
                          disabled={col.isDeleted} className={cn(inputClass, 'w-full')} />
                      </td>
                      <td className="px-2 py-1">
                        <select value={col.type} onChange={(e) => updateColumn(col.id, { type: e.target.value })}
                          disabled={col.isDeleted || !col.isNew} className={cn(inputClass, 'w-full')}>
                          {columnTypes.map((typeName) => <option key={typeName} value={typeName}>{typeName}</option>)}
                        </select>
                      </td>
                      <td className="px-2 py-1">
                        <input type="text" value={col.length} onChange={(e) => updateColumn(col.id, { length: e.target.value })}
                          disabled={col.isDeleted} className={cn(inputClass, 'w-full')} />
                      </td>
                      <td className="px-2 py-1 text-center">
                        <input type="checkbox" checked={!col.nullable} onChange={(e) => updateColumn(col.id, { nullable: !e.target.checked })}
                          disabled={col.isDeleted} className="w-4 h-4" />
                      </td>
                      <td className="px-2 py-1 text-center">
                        <input type="checkbox" checked={col.autoIncrement} onChange={(e) => updateColumn(col.id, { autoIncrement: e.target.checked })}
                          disabled={col.isDeleted} className="w-4 h-4" />
                      </td>
                      <td className="px-2 py-1">
                        <input type="text" value={col.defaultValue} onChange={(e) => updateColumn(col.id, { defaultValue: e.target.value })}
                          disabled={col.isDeleted} placeholder="NULL" className={cn(inputClass, 'w-full')} />
                      </td>
                      <td className="px-2 py-1">
                        <input type="text" value={col.comment} onChange={(e) => updateColumn(col.id, { comment: e.target.value })}
                          disabled={col.isDeleted} className={cn(inputClass, 'w-full')} />
                      </td>
                      <td className="px-2 py-1">
                        <button onClick={() => removeColumn(col.id)} className="p-1 text-status-error hover:bg-status-error/10 rounded">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {visibleColumns.length === 0 && (
                    <tr><td colSpan={8} className={cn('px-4 py-8 text-center', textSecondary)}>{t('database.noResults')}</td></tr>
                  )}
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
                  {indexes.filter(i => !(i.isNew && i.isDeleted)).map((idx) => (
                    <tr key={idx.id} className={cn('border-t', borderColor, idx.isDeleted && 'opacity-50 line-through')}>
                      <td className="px-2 py-1">
                        <input type="text" value={idx.name} onChange={(e) => updateIndex(idx.id, { name: e.target.value })}
                          disabled={!idx.isNew} className={cn(inputClass, 'w-full')} />
                      </td>
                      <td className="px-2 py-1">
                        <select value={idx.unique ? 'unique' : 'normal'} onChange={(e) => updateIndex(idx.id, { unique: e.target.value === 'unique' })}
                          disabled={!idx.isNew} className={cn(inputClass, 'w-full')}>
                          <option value="normal">{t('database.normal')}</option>
                          <option value="unique">{t('database.unique')}</option>
                        </select>
                      </td>
                      <td className="px-2 py-1">
                        <select value={idx.indexType} onChange={(e) => updateIndex(idx.id, { indexType: e.target.value })}
                          disabled={!idx.isNew} className={cn(inputClass, 'w-full')}>
                          {indexTypes.map((idxType) => <option key={idxType} value={idxType}>{idxType}</option>)}
                        </select>
                      </td>
                      <td className="px-2 py-1">
                        <div className="flex flex-wrap gap-1">
                          {availableColumns.map((col) => (
                            <label key={col} className={cn(
                              'inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs cursor-pointer border',
                              idx.columns.includes(col) ? 'bg-accent-primary/20 border-accent-primary text-accent-primary' : cn(borderColor, textSecondary, hoverBg)
                            )}>
                              <input type="checkbox" checked={idx.columns.includes(col)} onChange={() => toggleIndexColumn(idx.id, col)}
                                disabled={!idx.isNew} className="hidden" />
                              {col}
                            </label>
                          ))}
                        </div>
                      </td>
                      <td className="px-2 py-1">
                        {idx.name !== 'PRIMARY' && (
                          <button onClick={() => removeIndex(idx.id)} className="p-1 text-status-error hover:bg-status-error/10 rounded">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {indexes.filter(i => !(i.isNew && i.isDeleted)).length === 0 && (
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
                  {foreignKeys.filter(f => !(f.isNew && f.isDeleted)).map((fk) => (
                    <tr key={fk.id} className={cn('border-t', borderColor, fk.isDeleted && 'opacity-50 line-through', fk.isNew && 'bg-status-success/10')}>
                      <td className="px-2 py-1">
                        <input type="text" value={fk.name} onChange={(e) => updateForeignKey(fk.id, { name: e.target.value })}
                          disabled={!fk.isNew} className={cn(inputClass, 'w-full')} />
                      </td>
                      <td className="px-2 py-1">
                        <select value={fk.column} onChange={(e) => updateForeignKey(fk.id, { column: e.target.value })}
                          disabled={!fk.isNew} className={cn(inputClass, 'w-full')}>
                          <option value="">--</option>
                          {availableColumns.map((col) => <option key={col} value={col}>{col}</option>)}
                        </select>
                      </td>
                      <td className="px-2 py-1">
                        <input type="text" value={fk.refTable} onChange={(e) => updateForeignKey(fk.id, { refTable: e.target.value })}
                          disabled={!fk.isNew} placeholder="table_name" className={cn(inputClass, 'w-full')} />
                      </td>
                      <td className="px-2 py-1">
                        <input type="text" value={fk.refColumn} onChange={(e) => updateForeignKey(fk.id, { refColumn: e.target.value })}
                          disabled={!fk.isNew} placeholder="column_name" className={cn(inputClass, 'w-full')} />
                      </td>
                      <td className="px-2 py-1">
                        <select value={fk.onDelete} onChange={(e) => updateForeignKey(fk.id, { onDelete: e.target.value })}
                          disabled={!fk.isNew} className={cn(inputClass, 'w-full')}>
                          {fkActions.map((action) => <option key={action} value={action}>{action}</option>)}
                        </select>
                      </td>
                      {supportsOnUpdate && (
                        <td className="px-2 py-1">
                          <select value={fk.onUpdate} onChange={(e) => updateForeignKey(fk.id, { onUpdate: e.target.value })}
                            disabled={!fk.isNew} className={cn(inputClass, 'w-full')}>
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
                  {foreignKeys.filter(f => !(f.isNew && f.isDeleted)).length === 0 && (
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
                  {checkConstraints.filter(c => !(c.isNew && c.isDeleted)).map((chk) => (
                    <tr key={chk.id} className={cn('border-t', borderColor, chk.isDeleted && 'opacity-50 line-through', chk.isNew && 'bg-status-success/10')}>
                      <td className="px-2 py-1">
                        <input type="text" value={chk.name} onChange={(e) => updateCheckConstraint(chk.id, { name: e.target.value })}
                          disabled={!chk.isNew} className={cn(inputClass, 'w-full')} />
                      </td>
                      <td className="px-2 py-1">
                        <input type="text" value={chk.expression} onChange={(e) => updateCheckConstraint(chk.id, { expression: e.target.value })}
                          disabled={!chk.isNew} placeholder="e.g. price > 0" className={cn(inputClass, 'w-full')} />
                      </td>
                      <td className="px-2 py-1">
                        <button onClick={() => removeCheckConstraint(chk.id)} className="p-1 text-status-error hover:bg-status-error/10 rounded">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {checkConstraints.filter(c => !(c.isNew && c.isDeleted)).length === 0 && (
                    <tr><td colSpan={3} className={cn('px-4 py-8 text-center', textSecondary)}>{t('database.noCheckConstraints')}</td></tr>
                  )}
                </tbody>
              </table>
            )}

            {/* Triggers Tab */}
            {activeTab === 'triggers' && (
              <div className="p-4 space-y-4">
                {triggers.filter(t => !(t.isNew && t.isDeleted)).map((trg) => (
                  <div key={trg.id} className={cn('border rounded-md p-3', borderColor, trg.isDeleted && 'opacity-50', trg.isNew && 'bg-status-success/10')}>
                    <div className="flex items-center gap-4 mb-3">
                      <div className="flex items-center gap-2">
                        <label className={cn('text-sm', textSecondary)}>{t('database.triggerName')}:</label>
                        <input type="text" value={trg.name} onChange={(e) => updateTrigger(trg.id, { name: e.target.value })}
                          disabled={!trg.isNew} className={cn(inputClass, 'w-40')} />
                      </div>
                      <div className="flex items-center gap-2">
                        <label className={cn('text-sm', textSecondary)}>{t('database.timing')}:</label>
                        <select value={trg.timing} onChange={(e) => updateTrigger(trg.id, { timing: e.target.value })}
                          disabled={!trg.isNew} className={cn(inputClass, 'w-24')}>
                          <option value="BEFORE">BEFORE</option>
                          <option value="AFTER">AFTER</option>
                        </select>
                      </div>
                      <div className="flex items-center gap-2">
                        <label className={cn('text-sm', textSecondary)}>{t('database.event')}:</label>
                        <select value={trg.event} onChange={(e) => updateTrigger(trg.id, { event: e.target.value })}
                          disabled={!trg.isNew} className={cn(inputClass, 'w-24')}>
                          <option value="INSERT">INSERT</option>
                          <option value="UPDATE">UPDATE</option>
                          <option value="DELETE">DELETE</option>
                        </select>
                      </div>
                      <button onClick={() => removeTrigger(trg.id)} className="p-1 text-status-error hover:bg-status-error/10 rounded ml-auto">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <textarea value={trg.statement} onChange={(e) => updateTrigger(trg.id, { statement: e.target.value })}
                      disabled={!trg.isNew} rows={4} placeholder="BEGIN ... END"
                      className={cn(inputClass, 'w-full font-mono text-xs resize-none', codeBg)} />
                  </div>
                ))}
                {triggers.filter(t => !(t.isNew && t.isDeleted)).length === 0 && (
                  <div className={cn('text-center py-8', textSecondary)}>{t('database.noTriggers')}</div>
                )}
              </div>
            )}

            {/* Advanced Tab */}
            {activeTab === 'advanced' && tableOptions && (
              <div className="p-4">
                <div className="grid grid-cols-3 gap-4 max-w-2xl">
                  <div>
                    <label className={cn('block text-sm mb-1', textSecondary)}>{t('database.engine')}</label>
                    <input type="text" value={tableOptions.engine} disabled className={cn(inputClass, 'w-full')} />
                  </div>
                  <div>
                    <label className={cn('block text-sm mb-1', textSecondary)}>{t('database.charset')}</label>
                    <input type="text" value={tableOptions.charset} disabled className={cn(inputClass, 'w-full')} />
                  </div>
                  <div>
                    <label className={cn('block text-sm mb-1', textSecondary)}>{t('database.collation')}</label>
                    <input type="text" value={tableOptions.collation} disabled className={cn(inputClass, 'w-full')} />
                  </div>
                </div>
                <p className={cn('mt-4 text-sm', textSecondary)}>{t('database.advancedOptionsReadOnly')}</p>
              </div>
            )}
          </>
        )}
      </div>

      {/* SQL Preview */}
      {hasChanges && (
        <div className={cn('border-t p-3 shrink-0', borderColor)}>
          <button onClick={() => setShowSqlPreview(!showSqlPreview)} className={cn('flex items-center gap-1 text-sm font-medium', textPrimary)}>
            {showSqlPreview ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            {t('database.sqlPreview')}
          </button>
          {showSqlPreview && (
            <pre className={cn('mt-2 p-3 rounded-md text-sm border overflow-x-auto whitespace-pre-wrap max-h-32', codeBg, borderColor, textPrimary)}>
              {sqlPreview || t('database.noChanges')}
            </pre>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className={cn('mx-4 mb-3 p-3 rounded-md bg-status-error/10 border border-status-error/30 text-sm text-status-error')}>
          {error}
        </div>
      )}
    </div>
  )
}
