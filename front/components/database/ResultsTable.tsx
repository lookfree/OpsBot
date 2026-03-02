/**
 * Results Table Component
 *
 * Displays SQL query results in a table format with column headers.
 * Supports row expand/collapse to view field details (like DBeaver).
 */

import { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronRight, ChevronDown, Copy, Check } from 'lucide-react'
import { writeText } from '@tauri-apps/plugin-clipboard-manager'
import { cn } from '@/lib/utils'
import type { QueryResult, QueryColumn, ThemeStyles } from './types'

function useCopyToClipboard() {
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  const copy = useCallback(async (text: string, key?: string) => {
    try {
      await writeText(text)
      setCopiedKey(key ?? text)
      setTimeout(() => setCopiedKey(null), 1500)
    } catch {
      // fallback to browser API
      try {
        await navigator.clipboard.writeText(text)
        setCopiedKey(key ?? text)
        setTimeout(() => setCopiedKey(null), 1500)
      } catch { /* ignore */ }
    }
  }, [])

  return { copiedKey, copy }
}

interface ResultsTableProps {
  queryResult: QueryResult | null
  queryError: string | null
  styles: ThemeStyles
}

export function ResultsTable({ queryResult, queryError, styles }: ResultsTableProps) {
  const { t } = useTranslation()
  const { bgSecondary, borderColor, textPrimary, textSecondary } = styles
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set())

  const toggleRowExpand = (rowIndex: number) => {
    setExpandedRows(prev => {
      const next = new Set(prev)
      if (next.has(rowIndex)) {
        next.delete(rowIndex)
      } else {
        next.add(rowIndex)
      }
      return next
    })
  }

  return (
    <div className={cn('h-full flex flex-col overflow-hidden', bgSecondary)}>
      {/* Results Header */}
      <div className={cn('px-3 py-2 border-b text-sm shrink-0', borderColor, textSecondary)}>
        {queryResult ? (
          queryResult.columns && queryResult.columns.length > 0 ? (
            `${t('database.resultRows')}: ${queryResult.rows?.length || 0} (${queryResult.executionTimeMs}ms)`
          ) : (
            `${t('database.affectedRows')}: ${queryResult.affectedRows} (${queryResult.executionTimeMs}ms)`
          )
        ) : queryError ? (
          <span className="text-status-error">{queryError}</span>
        ) : (
          t('database.noResults')
        )}
      </div>

      {/* Results Table */}
      <div className="overflow-auto flex-1 min-h-0">
        {queryResult?.columns && queryResult.columns.length > 0 && queryResult.rows && (
          <table className="w-full text-sm border-collapse table-auto">
            <thead>
              <tr className={cn('sticky top-0 z-10', bgSecondary)}>
                <th className={cn('px-1 py-2 w-6 border-b border-r', borderColor, bgSecondary)} />
                {queryResult.columns.map((col, i) => (
                  <th
                    key={i}
                    className={cn(
                      'px-3 py-2 text-left font-medium border-b border-r whitespace-nowrap select-none',
                      borderColor, textPrimary, bgSecondary
                    )}
                  >
                    {col.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {queryResult.rows.map((row, i) => (
                <ResultRow
                  key={i}
                  row={row}
                  columns={queryResult.columns}
                  isExpanded={expandedRows.has(i)}
                  onToggle={() => toggleRowExpand(i)}
                  styles={styles}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

/** Single result row with expand/collapse capability */
function ResultRow({
  row, columns, isExpanded, onToggle, styles
}: {
  row: unknown[]
  columns: QueryColumn[]
  isExpanded: boolean
  onToggle: () => void
  styles: ThemeStyles
}) {
  const { borderColor, textPrimary, hoverBg } = styles
  const { copiedKey, copy } = useCopyToClipboard()

  return (
    <>
      <tr className={hoverBg}>
        <td
          className={cn('px-1 py-1.5 border-b border-r cursor-pointer text-center', borderColor)}
          onClick={onToggle}
        >
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 inline text-dark-text-secondary" />
          ) : (
            <ChevronRight className="w-4 h-4 inline text-dark-text-secondary" />
          )}
        </td>
        {row.map((cell, j) => {
          const cellValue = cell === null ? 'NULL' : String(cell)
          const cellKey = `cell-${j}`
          return (
            <td
              key={j}
              className={cn(
                'px-3 py-1.5 border-b border-r max-w-xs truncate select-text cursor-default',
                borderColor, textPrimary
              )}
              title={cellValue}
              onDoubleClick={(e) => {
                e.stopPropagation()
                copy(cellValue, cellKey)
              }}
            >
              {cell === null ? (
                <span className="text-gray-400 italic">NULL</span>
              ) : (
                String(cell)
              )}
              {copiedKey === cellKey && (
                <span className="ml-1 text-green-400 text-xs">
                  <Check className="w-3 h-3 inline" />
                </span>
              )}
            </td>
          )
        })}
      </tr>
      {isExpanded && (
        <tr>
          <td colSpan={columns.length + 1} className={cn('p-0 border-b', borderColor)}>
            <RowDetailPanel row={row} columns={columns} styles={styles} />
          </td>
        </tr>
      )}
    </>
  )
}

/** Expanded row detail panel showing all fields as key-value pairs */
function RowDetailPanel({
  row, columns, styles
}: {
  row: unknown[]
  columns: QueryColumn[]
  styles: ThemeStyles
}) {
  const { t } = useTranslation()
  const { borderColor, textPrimary, textSecondary, bgSecondary } = styles
  const { copiedKey, copy } = useCopyToClipboard()

  return (
    <div className={cn('p-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2', bgSecondary)}>
      {columns.map((col, i) => {
        const value = row[i] === null ? 'NULL' : String(row[i])
        const fieldKey = `detail-${i}`
        return (
          <div key={i} className={cn('flex flex-col p-2 rounded border group', borderColor)}>
            <div className="flex items-center justify-between mb-1">
              <span className={cn('text-xs font-medium', textSecondary)}>{col.name}</span>
              <button
                className={cn(
                  'p-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity',
                  'hover:bg-white/10'
                )}
                title={t('common.copy')}
                onClick={() => copy(value, fieldKey)}
              >
                {copiedKey === fieldKey ? (
                  <Check className="w-3.5 h-3.5 text-green-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5 text-dark-text-secondary" />
                )}
              </button>
            </div>
            <span
              className={cn(
                'text-sm break-all select-text cursor-text',
                row[i] === null ? 'text-gray-400 italic' : textPrimary
              )}
            >
              {value}
            </span>
          </div>
        )
      })}
    </div>
  )
}
