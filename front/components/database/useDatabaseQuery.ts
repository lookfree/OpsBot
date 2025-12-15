/**
 * Database Query Hook
 *
 * Custom hook for managing SQL query execution, formatting, and export.
 */

import { useState, useCallback } from 'react'
import { format as formatSql } from 'sql-formatter'
import { dbExecuteSql } from '@/services/database'
import type { QueryResult } from './types'

interface UseDatabaseQueryOptions {
  connectionId: string
  selectedDatabase: string
}

export function useDatabaseQuery({ connectionId, selectedDatabase }: UseDatabaseQueryOptions) {
  const [sql, setSql] = useState('')
  const [queryResult, setQueryResult] = useState<QueryResult | null>(null)
  const [isExecuting, setIsExecuting] = useState(false)
  const [queryError, setQueryError] = useState<string | null>(null)

  // Execute SQL
  const handleExecuteSql = useCallback(async () => {
    if (!connectionId || !sql.trim()) return

    setIsExecuting(true)
    setQueryError(null)
    setQueryResult(null)

    try {
      const result = await dbExecuteSql({
        connectionId,
        sql,
        database: selectedDatabase || undefined,
      })
      setQueryResult(result)
    } catch (err) {
      setQueryError(String(err))
    } finally {
      setIsExecuting(false)
    }
  }, [connectionId, sql, selectedDatabase])

  // Execute EXPLAIN
  const handleExplain = useCallback(async () => {
    if (!connectionId || !sql.trim()) return

    setIsExecuting(true)
    setQueryError(null)
    setQueryResult(null)

    try {
      const explainSql = `EXPLAIN ${sql.trim().replace(/;$/, '')}`
      const result = await dbExecuteSql({
        connectionId,
        sql: explainSql,
        database: selectedDatabase || undefined,
      })
      setQueryResult(result)
    } catch (err) {
      setQueryError(String(err))
    } finally {
      setIsExecuting(false)
    }
  }, [connectionId, sql, selectedDatabase])

  // Format SQL
  const handleFormatSql = useCallback(() => {
    if (!sql.trim()) return
    try {
      const formatted = formatSql(sql, {
        language: 'mysql',
        tabWidth: 2,
        keywordCase: 'upper',
      })
      setSql(formatted)
    } catch (err) {
      console.error('Format SQL error:', err)
    }
  }, [sql])

  // Compress SQL (single line)
  const handleCompressSql = useCallback(() => {
    if (!sql.trim()) return
    const compressed = sql
      .replace(/\s+/g, ' ')
      .replace(/\s*,\s*/g, ',')
      .replace(/\s*;\s*/g, ';')
      .trim()
    setSql(compressed)
  }, [sql])

  // Export to CSV
  const handleExportCsv = useCallback(() => {
    if (!queryResult?.columns || !queryResult.rows) return

    const headers = queryResult.columns.map((c) => c.name).join(',')
    const rows = queryResult.rows
      .map((row) =>
        row
          .map((cell) => {
            if (cell === null) return ''
            const str = String(cell)
            if (str.includes(',') || str.includes('"') || str.includes('\n')) {
              return `"${str.replace(/"/g, '""')}"`
            }
            return str
          })
          .join(',')
      )
      .join('\n')

    const csv = `${headers}\n${rows}`
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `query_result_${Date.now()}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }, [queryResult])

  // Export to JSON
  const handleExportJson = useCallback(() => {
    if (!queryResult?.columns || !queryResult.rows) return

    const data = queryResult.rows.map((row) => {
      const obj: Record<string, unknown> = {}
      queryResult.columns.forEach((col, i) => {
        obj[col.name] = row[i]
      })
      return obj
    })

    const json = JSON.stringify(data, null, 2)
    const blob = new Blob([json], { type: 'application/json;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `query_result_${Date.now()}.json`
    link.click()
    URL.revokeObjectURL(url)
  }, [queryResult])

  // Clear editor
  const handleClear = useCallback(() => {
    setSql('')
  }, [])

  return {
    sql,
    setSql,
    queryResult,
    isExecuting,
    queryError,
    handleExecuteSql,
    handleExplain,
    handleFormatSql,
    handleCompressSql,
    handleExportCsv,
    handleExportJson,
    handleClear,
  }
}
