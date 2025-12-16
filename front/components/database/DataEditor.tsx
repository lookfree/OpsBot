/**
 * Data Editor Component
 *
 * Professional table data editor with inline editing, filtering, sorting, and pagination.
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  RefreshCw, Plus, Minus, Save, Undo, Filter, ArrowUpDown,
  Settings, ChevronDown, ArrowUp, ArrowDown,
  Loader2, X, Play, ChevronLeft, ChevronRight,
  ChevronsLeft, ChevronsRight,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { dbExecuteSql, dbGetTableDdl } from '@/services/database'
import type { QueryResult, QueryColumn } from '@/services/database'

interface DataEditorProps {
  connectionId: string
  database: string
  tableName: string
  onClose?: () => void
  isDark: boolean
}

interface CellEdit {
  rowIndex: number
  colIndex: number
  originalValue: unknown
  newValue: unknown
}

interface RowData {
  _rowId: string
  _isNew: boolean
  _isDeleted: boolean
  _isModified: boolean
  values: unknown[]
}

interface SortConfig {
  column: string
  direction: 'asc' | 'desc'
}

interface FilterConfig {
  column: string
  operator: string
  value: string
}

export function DataEditor({ connectionId, database, tableName, onClose, isDark }: DataEditorProps) {
  const { t } = useTranslation()

  const [columns, setColumns] = useState<QueryColumn[]>([])
  const [rows, setRows] = useState<RowData[]>([])
  const [originalRows, setOriginalRows] = useState<RowData[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set())
  const [currentRowIndex, setCurrentRowIndex] = useState<number | null>(null)
  const [editingCell, setEditingCell] = useState<{ row: number; col: number } | null>(null)
  const [editValue, setEditValue] = useState<string>('')
  const [, setEdits] = useState<CellEdit[]>([])
  const [sortConfig, setSortConfig] = useState<SortConfig | null>(null)
  const [filters, setFilters] = useState<FilterConfig[]>([])
  const [showFilterPanel, setShowFilterPanel] = useState(false)
  const [limit, setLimit] = useState(500)
  const [offset, setOffset] = useState(0)
  const [totalRows, setTotalRows] = useState(0)
  const [inTransaction, setInTransaction] = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [showDdl, setShowDdl] = useState(false)
  const [ddlContent, setDdlContent] = useState('')

  const inputRef = useRef<HTMLInputElement>(null)

  // Build WHERE clause for filters
  const buildWhereClause = useCallback(() => {
    if (filters.length === 0) return ''
    const conditions = filters.map(f => {
      if (f.operator === 'IS NULL') return `\`${f.column}\` IS NULL`
      if (f.operator === 'IS NOT NULL') return `\`${f.column}\` IS NOT NULL`
      if (f.operator === 'LIKE') return `\`${f.column}\` LIKE '%${f.value}%'`
      return `\`${f.column}\` ${f.operator} '${f.value}'`
    }).join(' AND ')
    return ` WHERE ${conditions}`
  }, [filters])

  // Build SQL query
  const buildQuery = useCallback(() => {
    let sql = `SELECT * FROM \`${database}\`.\`${tableName}\``
    sql += buildWhereClause()
    if (sortConfig) {
      sql += ` ORDER BY \`${sortConfig.column}\` ${sortConfig.direction.toUpperCase()}`
    }
    sql += ` LIMIT ${limit} OFFSET ${offset}`
    return sql
  }, [database, tableName, buildWhereClause, sortConfig, limit, offset])

  const currentSql = useMemo(() => buildQuery(), [buildQuery])

  // Calculate pagination info
  const currentPage = Math.floor(offset / limit) + 1
  const totalPages = Math.ceil(totalRows / limit) || 1

  // Load data
  const loadData = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      // First get total count
      const countSql = `SELECT COUNT(*) as cnt FROM \`${database}\`.\`${tableName}\`${buildWhereClause()}`
      const countResult = await dbExecuteSql({ connectionId, sql: countSql, database })
      const total = Number(countResult.rows[0]?.[0] || 0)
      setTotalRows(total)

      // Then get data
      const result: QueryResult = await dbExecuteSql({ connectionId, sql: currentSql, database })
      setColumns(result.columns)
      const newRows: RowData[] = result.rows.map((r, i) => ({
        _rowId: `row_${i}_${Date.now()}`,
        _isNew: false,
        _isDeleted: false,
        _isModified: false,
        values: r,
      }))
      setRows(newRows)
      setOriginalRows(JSON.parse(JSON.stringify(newRows)))
      setEdits([])
      setSelectedRows(new Set())
    } catch (err) {
      setError(String(err))
    } finally {
      setIsLoading(false)
    }
  }, [connectionId, currentSql, database, buildWhereClause, tableName])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Auto refresh
  useEffect(() => {
    if (!autoRefresh) return
    const interval = setInterval(loadData, 5000)
    return () => clearInterval(interval)
  }, [autoRefresh, loadData])

  // Handle cell click to edit
  const handleCellClick = (rowIndex: number, colIndex: number) => {
    const row = rows[rowIndex]
    if (row._isDeleted) return
    setEditingCell({ row: rowIndex, col: colIndex })
    setEditValue(row.values[colIndex] === null ? '' : String(row.values[colIndex]))
    setCurrentRowIndex(rowIndex)
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  // Handle cell edit complete
  const handleCellEditComplete = () => {
    if (!editingCell) return
    const { row, col } = editingCell
    const originalValue = originalRows[row]?.values[col]
    const newValue = editValue === '' ? null : editValue

    if (String(originalValue ?? '') !== String(newValue ?? '')) {
      setRows(prev => prev.map((r, i) => {
        if (i !== row) return r
        const newValues = [...r.values]
        newValues[col] = newValue
        return { ...r, values: newValues, _isModified: !r._isNew }
      }))
      setEdits(prev => [...prev.filter(e => !(e.rowIndex === row && e.colIndex === col)), {
        rowIndex: row, colIndex: col, originalValue, newValue,
      }])
    }
    setEditingCell(null)
  }

  // Handle key press in edit mode
  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleCellEditComplete()
    } else if (e.key === 'Escape') {
      setEditingCell(null)
    } else if (e.key === 'Tab') {
      e.preventDefault()
      handleCellEditComplete()
      if (editingCell) {
        const nextCol = e.shiftKey ? editingCell.col - 1 : editingCell.col + 1
        if (nextCol >= 0 && nextCol < columns.length) {
          handleCellClick(editingCell.row, nextCol)
        }
      }
    }
  }

  // Add new row
  const handleAddRow = () => {
    const newRow: RowData = {
      _rowId: `new_${Date.now()}`,
      _isNew: true,
      _isDeleted: false,
      _isModified: false,
      values: columns.map(() => null),
    }
    setRows(prev => [...prev, newRow])
    setCurrentRowIndex(rows.length)
  }

  // Delete selected rows
  const handleDeleteRows = () => {
    if (selectedRows.size === 0 && currentRowIndex !== null) {
      setRows(prev => prev.map((r, i) => i === currentRowIndex ? { ...r, _isDeleted: !r._isDeleted } : r))
    } else {
      setRows(prev => prev.map(r => selectedRows.has(r._rowId) ? { ...r, _isDeleted: !r._isDeleted } : r))
    }
  }

  // Undo changes
  const handleUndo = () => {
    setRows(JSON.parse(JSON.stringify(originalRows)))
    setEdits([])
    setSelectedRows(new Set())
  }

  // Save changes
  const handleSave = async () => {
    setIsLoading(true)
    setError(null)
    try {
      // Find primary key column (assume first column for now)
      const pkCol = columns[0]?.name

      // Generate SQL statements
      const statements: string[] = []

      // Delete statements
      rows.filter(r => r._isDeleted && !r._isNew).forEach(r => {
        const pkValue = r.values[0]
        statements.push(`DELETE FROM \`${database}\`.\`${tableName}\` WHERE \`${pkCol}\` = '${pkValue}';`)
      })

      // Insert statements
      rows.filter(r => r._isNew && !r._isDeleted).forEach(r => {
        const cols = columns.map(c => `\`${c.name}\``).join(', ')
        const vals = r.values.map(v => v === null ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`).join(', ')
        statements.push(`INSERT INTO \`${database}\`.\`${tableName}\` (${cols}) VALUES (${vals});`)
      })

      // Update statements
      rows.filter(r => r._isModified && !r._isNew && !r._isDeleted).forEach((r) => {
        const orig = originalRows.find(o => o._rowId === r._rowId)
        if (!orig) return
        const updates: string[] = []
        r.values.forEach((v, i) => {
          if (String(v ?? '') !== String(orig.values[i] ?? '')) {
            updates.push(`\`${columns[i].name}\` = ${v === null ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`}`)
          }
        })
        if (updates.length > 0) {
          const pkValue = orig.values[0]
          statements.push(`UPDATE \`${database}\`.\`${tableName}\` SET ${updates.join(', ')} WHERE \`${pkCol}\` = '${pkValue}';`)
        }
      })

      // Execute statements
      for (const sql of statements) {
        await dbExecuteSql({ connectionId, sql, database })
      }

      // Reload data
      await loadData()
    } catch (err) {
      setError(String(err))
    } finally {
      setIsLoading(false)
    }
  }

  // Toggle sort
  const handleSort = (column: string) => {
    setSortConfig(prev => {
      if (prev?.column === column) {
        if (prev.direction === 'asc') return { column, direction: 'desc' }
        return null
      }
      return { column, direction: 'asc' }
    })
  }

  // Show DDL
  const handleShowDdl = async () => {
    try {
      const ddl = await dbGetTableDdl(connectionId, database, tableName)
      setDdlContent(ddl)
      setShowDdl(true)
    } catch (err) {
      setError(String(err))
    }
  }

  // Check if there are unsaved changes
  const hasChanges = rows.some(r => r._isNew || r._isDeleted || r._isModified)

  // Theme styles
  const bgPrimary = isDark ? 'bg-dark-bg-primary' : 'bg-light-bg-primary'
  const bgSecondary = isDark ? 'bg-dark-bg-secondary' : 'bg-light-bg-secondary'
  const borderColor = isDark ? 'border-dark-border' : 'border-light-border'
  const textPrimary = isDark ? 'text-dark-text-primary' : 'text-light-text-primary'
  const textSecondary = isDark ? 'text-dark-text-secondary' : 'text-light-text-secondary'
  const hoverBg = isDark ? 'hover:bg-dark-bg-hover' : 'hover:bg-light-bg-hover'
  const inputBg = isDark ? 'bg-dark-bg-hover' : 'bg-light-bg-primary'

  const toolbarBtnClass = cn('p-1.5 rounded transition-colors', hoverBg, textSecondary)
  const toolbarBtnActiveClass = cn('p-1.5 rounded transition-colors bg-accent-primary/20 text-accent-primary')

  return (
    <div className={cn('flex flex-col h-full', bgPrimary)}>
      {/* Toolbar */}
      <div className={cn('flex items-center gap-1 px-2 py-1.5 border-b shrink-0', borderColor)}>
        <button
          onClick={() => setInTransaction(!inTransaction)}
          className={cn(inTransaction ? toolbarBtnActiveClass : toolbarBtnClass)}
          title={t('database.startTransaction')}
        >
          <Play className="w-4 h-4" />
          <span className="text-xs ml-1">{t('database.startTransaction')}</span>
        </button>
        <div className={cn('w-px h-5 mx-1', borderColor)} />
        <button onClick={loadData} disabled={isLoading} className={toolbarBtnClass} title={t('common.refresh')}>
          <RefreshCw className={cn('w-4 h-4', isLoading && 'animate-spin')} />
        </button>
        <button onClick={handleAddRow} className={toolbarBtnClass} title={t('common.add')}>
          <Plus className="w-4 h-4" />
        </button>
        <button onClick={handleDeleteRows} className={toolbarBtnClass} title={t('common.delete')}>
          <Minus className="w-4 h-4" />
        </button>
        <button
          onClick={handleSave}
          disabled={!hasChanges || isLoading}
          className={cn(toolbarBtnClass, hasChanges && 'text-accent-primary')}
          title={t('common.save')}
        >
          <Save className="w-4 h-4" />
        </button>
        <button
          onClick={handleUndo}
          disabled={!hasChanges}
          className={toolbarBtnClass}
          title={t('common.undo')}
        >
          <Undo className="w-4 h-4" />
        </button>
        <div className={cn('w-px h-5 mx-1', borderColor)} />
        <button
          onClick={() => setShowFilterPanel(!showFilterPanel)}
          className={cn(filters.length > 0 ? toolbarBtnActiveClass : toolbarBtnClass)}
          title={t('database.filter')}
        >
          <Filter className="w-4 h-4" />
        </button>
        <button
          onClick={() => setSortConfig(null)}
          className={cn(sortConfig ? toolbarBtnActiveClass : toolbarBtnClass)}
          title={t('database.sort')}
        >
          <ArrowUpDown className="w-4 h-4" />
        </button>
        <div className={cn('w-px h-5 mx-1', borderColor)} />
        <button onClick={handleShowDdl} className={toolbarBtnClass} title="DDL">
          <span className="text-xs font-medium">DDL</span>
        </button>
        <button className={toolbarBtnClass} title={t('common.settings')}>
          <Settings className="w-4 h-4" />
        </button>
        <div className="flex-1" />
        {onClose && (
          <button onClick={onClose} className={toolbarBtnClass}>
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Filter Panel */}
      {showFilterPanel && (
        <div className={cn('px-3 py-2 border-b flex items-center gap-2 flex-wrap', borderColor, bgSecondary)}>
          {filters.map((f, i) => (
            <div key={i} className={cn('flex items-center gap-1 px-2 py-1 rounded border text-xs', borderColor)}>
              <span className={textPrimary}>{f.column}</span>
              <span className={textSecondary}>{f.operator}</span>
              <span className={textPrimary}>{f.value}</span>
              <button onClick={() => setFilters(prev => prev.filter((_, j) => j !== i))} className="ml-1 text-status-error">
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
          <select
            className={cn('px-2 py-1 rounded border text-xs', borderColor, inputBg, textPrimary)}
            onChange={(e) => {
              if (e.target.value) {
                setFilters(prev => [...prev, { column: e.target.value, operator: '=', value: '' }])
                e.target.value = ''
              }
            }}
          >
            <option value="">{t('database.addFilter')}</option>
            {columns.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
          </select>
        </div>
      )}

      {/* Data Table */}
      <div className="flex-1 overflow-auto min-h-0">
        {isLoading && rows.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-6 h-6 animate-spin text-accent-primary" />
          </div>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead className={cn('sticky top-0 z-10', bgSecondary)}>
              <tr>
                <th className={cn('px-2 py-1.5 text-center font-medium border-b border-r w-12', borderColor, textSecondary)}>
                  #
                </th>
                {columns.map((col, i) => (
                  <th
                    key={i}
                    className={cn(
                      'px-2 py-1.5 text-left font-medium border-b border-r whitespace-nowrap cursor-pointer select-none group',
                      borderColor, textPrimary, hoverBg
                    )}
                    onClick={() => handleSort(col.name)}
                  >
                    <div className="flex items-center gap-1">
                      <Filter className={cn('w-3 h-3 opacity-0 group-hover:opacity-50', textSecondary)} />
                      <span>{col.name}</span>
                      {sortConfig?.column === col.name && (
                        sortConfig.direction === 'asc'
                          ? <ArrowUp className="w-3 h-3 text-accent-primary" />
                          : <ArrowDown className="w-3 h-3 text-accent-primary" />
                      )}
                      <ChevronDown className={cn('w-3 h-3 opacity-0 group-hover:opacity-50 ml-auto', textSecondary)} />
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.filter(r => !r._isNew || !r._isDeleted).map((row, rowIdx) => (
                <tr
                  key={row._rowId}
                  onClick={() => setCurrentRowIndex(rowIdx)}
                  className={cn(
                    'cursor-pointer',
                    currentRowIndex === rowIdx && 'bg-accent-primary/10',
                    row._isDeleted && 'opacity-50 line-through',
                    row._isNew && 'bg-status-success/10',
                    row._isModified && !row._isNew && 'bg-status-warning/10',
                    hoverBg
                  )}
                >
                  <td className={cn('px-2 py-1 text-center border-b border-r text-xs', borderColor, textSecondary)}>
                    {rowIdx + 1 + offset}
                  </td>
                  {row.values.map((cell, colIdx) => (
                    <td
                      key={colIdx}
                      className={cn('px-2 py-1 border-b border-r', borderColor)}
                      onClick={(e) => { e.stopPropagation(); handleCellClick(rowIdx, colIdx) }}
                    >
                      {editingCell?.row === rowIdx && editingCell?.col === colIdx ? (
                        <input
                          ref={inputRef}
                          type="text"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onBlur={handleCellEditComplete}
                          onKeyDown={handleEditKeyDown}
                          className={cn(
                            'w-full px-1 py-0 border rounded text-sm focus:outline-none focus:border-accent-primary',
                            inputBg, borderColor, textPrimary
                          )}
                        />
                      ) : (
                        <span className={cell === null ? 'text-gray-400 italic' : textPrimary}>
                          {cell === null ? 'NULL' : String(cell)}
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={columns.length + 1} className={cn('px-4 py-8 text-center', textSecondary)}>
                    {error || t('database.noResults')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Status Bar */}
      <div className={cn('flex items-center gap-4 px-3 py-1.5 border-t text-xs shrink-0', borderColor, bgSecondary)}>
        <div className={cn('flex-1 truncate font-mono', textSecondary)} title={currentSql}>
          {currentSql}
        </div>
        <div className={textSecondary}>
          {t('database.selected')}: {selectedRows.size}{t('database.rows')}, {t('database.current')}: {currentRowIndex !== null ? currentRowIndex + 1 : '-'}
        </div>
        <label className={cn('flex items-center gap-1 cursor-pointer', textSecondary)}>
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={(e) => setAutoRefresh(e.target.checked)}
            className="w-3 h-3"
          />
          {t('database.autoRefresh')}
        </label>
        <div className={cn('w-px h-4', borderColor)} />
        {/* Pagination Controls */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setOffset(0)}
            disabled={currentPage <= 1 || isLoading}
            className={cn(toolbarBtnClass, 'p-1', (currentPage <= 1 || isLoading) && 'opacity-30 cursor-not-allowed')}
            title={t('database.firstPage')}
          >
            <ChevronsLeft className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setOffset(Math.max(0, offset - limit))}
            disabled={currentPage <= 1 || isLoading}
            className={cn(toolbarBtnClass, 'p-1', (currentPage <= 1 || isLoading) && 'opacity-30 cursor-not-allowed')}
            title={t('database.prevPage')}
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <span className={cn('px-2', textSecondary)}>
            {currentPage} / {totalPages}
          </span>
          <button
            onClick={() => setOffset(offset + limit)}
            disabled={currentPage >= totalPages || isLoading}
            className={cn(toolbarBtnClass, 'p-1', (currentPage >= totalPages || isLoading) && 'opacity-30 cursor-not-allowed')}
            title={t('database.nextPage')}
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setOffset((totalPages - 1) * limit)}
            disabled={currentPage >= totalPages || isLoading}
            className={cn(toolbarBtnClass, 'p-1', (currentPage >= totalPages || isLoading) && 'opacity-30 cursor-not-allowed')}
            title={t('database.lastPage')}
          >
            <ChevronsRight className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className={cn('w-px h-4', borderColor)} />
        <div className="flex items-center gap-1">
          <span className={textSecondary}>{t('database.pageSize')}:</span>
          <select
            value={limit}
            onChange={(e) => { setLimit(Number(e.target.value)); setOffset(0) }}
            className={cn('px-1 py-0.5 border rounded text-xs', inputBg, borderColor, textPrimary)}
          >
            <option value={100}>100</option>
            <option value={200}>200</option>
            <option value={500}>500</option>
            <option value={1000}>1000</option>
          </select>
        </div>
        <span className={textSecondary}>
          {t('database.totalRows')}: {totalRows.toLocaleString()}
        </span>
      </div>

      {/* DDL Dialog */}
      {showDdl && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center" onClick={() => setShowDdl(false)}>
          <div className={cn('w-[600px] max-h-[80vh] rounded-lg shadow-xl border', bgPrimary, borderColor)} onClick={e => e.stopPropagation()}>
            <div className={cn('flex items-center justify-between px-4 py-3 border-b', borderColor)}>
              <span className={cn('font-medium', textPrimary)}>DDL - {tableName}</span>
              <button onClick={() => setShowDdl(false)} className={toolbarBtnClass}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <pre className={cn('p-4 overflow-auto max-h-[60vh] text-sm font-mono', textPrimary)}>
              {ddlContent}
            </pre>
          </div>
        </div>
      )}

      {/* Error Toast */}
      {error && (
        <div className={cn('absolute bottom-16 left-4 right-4 p-3 rounded-md bg-status-error/10 border border-status-error/30 text-sm text-status-error')}>
          {error}
          <button onClick={() => setError(null)} className="ml-2 text-status-error/70 hover:text-status-error">
            <X className="w-4 h-4 inline" />
          </button>
        </div>
      )}
    </div>
  )
}
