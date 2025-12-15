/**
 * Results Table Component
 *
 * Displays SQL query results in a table format with column headers.
 */

import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import type { QueryResult, ThemeStyles } from './types'

interface ResultsTableProps {
  queryResult: QueryResult | null
  queryError: string | null
  styles: ThemeStyles
}

export function ResultsTable({ queryResult, queryError, styles }: ResultsTableProps) {
  const { t } = useTranslation()
  const { bgSecondary, borderColor, textPrimary, textSecondary, hoverBg } = styles

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
                {queryResult.columns.map((col, i) => (
                  <th
                    key={i}
                    className={cn(
                      'px-3 py-2 text-left font-medium border-b border-r whitespace-nowrap select-none',
                      borderColor,
                      textPrimary,
                      bgSecondary
                    )}
                  >
                    {col.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {queryResult.rows.map((row, i) => (
                <tr key={i} className={hoverBg}>
                  {row.map((cell, j) => (
                    <td
                      key={j}
                      className={cn('px-3 py-1.5 border-b border-r', borderColor, textPrimary)}
                    >
                      {cell === null ? (
                        <span className="text-gray-400 italic">NULL</span>
                      ) : (
                        String(cell)
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
