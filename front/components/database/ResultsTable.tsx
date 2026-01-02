/**
 * Results Table Component
 *
 * Displays SQL query results in a table format with column headers.
 * Supports row expand/collapse to view field details (like DBeaver).
 */

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronRight, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { QueryResult, QueryColumn, ThemeStyles } from './types'

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
        {row.map((cell, j) => (
          <td key={j} className={cn('px-3 py-1.5 border-b border-r max-w-xs truncate', borderColor, textPrimary)}>
            {cell === null ? (
              <span className="text-gray-400 italic">NULL</span>
            ) : (
              String(cell)
            )}
          </td>
        ))}
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
  const { borderColor, textPrimary, textSecondary, bgSecondary } = styles

  return (
    <div className={cn('p-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2', bgSecondary)}>
      {columns.map((col, i) => (
        <div key={i} className={cn('flex flex-col p-2 rounded border', borderColor)}>
          <span className={cn('text-xs font-medium mb-1', textSecondary)}>{col.name}</span>
          <span className={cn('text-sm break-all', row[i] === null ? 'text-gray-400 italic' : textPrimary)}>
            {row[i] === null ? 'NULL' : String(row[i])}
          </span>
        </div>
      ))}
    </div>
  )
}
