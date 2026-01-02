/**
 * Elasticsearch Query Component
 *
 * Provides DSL query editor and SQL query interface for Elasticsearch.
 */

import { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import {
  Play,
  Code,
  Database,
  ChevronLeft,
  ChevronRight,
  Clock,
  FileJson,
  AlignLeft,
} from 'lucide-react'
import {
  mwEsSearch,
  mwEsSqlQuery,
  mwEsListIndices,
  type EsSearchRequest,
  type EsSearchResponse,
  type EsSearchHit,
  type EsSqlResponse,
  type EsIndexSummary,
} from '@/services/middleware'
import { useEffect } from 'react'

interface ThemeStyles {
  bgSecondary: string
  borderColor: string
  textPrimary: string
  textSecondary: string
  hoverBg: string
  isDark: boolean
}

interface ElasticsearchQueryProps {
  connectionId: string
  styles: ThemeStyles
}

type QueryMode = 'dsl' | 'sql'

const DEFAULT_DSL_QUERY = `{
  "query": {
    "match_all": {}
  },
  "size": 100
}`

export function ElasticsearchQuery({ connectionId, styles }: ElasticsearchQueryProps) {
  const { t } = useTranslation()
  const [queryMode, setQueryMode] = useState<QueryMode>('dsl')
  const [indices, setIndices] = useState<EsIndexSummary[]>([])
  const [selectedIndex, setSelectedIndex] = useState<string>('')
  const [dslQuery, setDslQuery] = useState(DEFAULT_DSL_QUERY)
  const [sqlQuery, setSqlQuery] = useState('SELECT * FROM "my-index" LIMIT 10')
  const [isExecuting, setIsExecuting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // DSL results
  const [dslResult, setDslResult] = useState<EsSearchResponse | null>(null)
  const [currentPage, setCurrentPage] = useState(0)
  const [pageSize] = useState(10)

  // SQL results
  const [sqlResult, setSqlResult] = useState<EsSqlResponse | null>(null)

  // Load indices for selection
  useEffect(() => {
    mwEsListIndices(connectionId)
      .then((list) => {
        setIndices(list.filter((idx) => !idx.name.startsWith('.')))
        if (list.length > 0 && !selectedIndex) {
          setSelectedIndex(list[0].name)
        }
      })
      .catch(console.error)
  }, [connectionId, selectedIndex])

  // Execute DSL query
  const executeDslQuery = useCallback(async () => {
    if (!selectedIndex) {
      setError(t('elasticsearch.selectIndex', 'Please select an index'))
      return
    }

    setIsExecuting(true)
    setError(null)
    setDslResult(null)

    try {
      const queryObj = JSON.parse(dslQuery)
      const request: EsSearchRequest = {
        index: selectedIndex,
        query: queryObj,
        from: currentPage * pageSize,
        size: pageSize,
      }
      const result = await mwEsSearch(connectionId, request)
      setDslResult(result)
    } catch (err) {
      setError(String(err))
    } finally {
      setIsExecuting(false)
    }
  }, [connectionId, selectedIndex, dslQuery, currentPage, pageSize, t])

  // Execute SQL query
  const executeSqlQuery = useCallback(async () => {
    setIsExecuting(true)
    setError(null)
    setSqlResult(null)

    try {
      const result = await mwEsSqlQuery(connectionId, sqlQuery)
      setSqlResult(result)
    } catch (err) {
      setError(String(err))
    } finally {
      setIsExecuting(false)
    }
  }, [connectionId, sqlQuery])

  // Format JSON
  const formatQuery = useCallback(() => {
    try {
      const parsed = JSON.parse(dslQuery)
      setDslQuery(JSON.stringify(parsed, null, 2))
    } catch {
      // Ignore formatting errors
    }
  }, [dslQuery])

  // Handle page change for DSL results
  const handlePageChange = useCallback((newPage: number) => {
    setCurrentPage(newPage)
  }, [])

  // Re-execute when page changes
  useEffect(() => {
    if (dslResult && currentPage > 0) {
      executeDslQuery()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage])

  return (
    <div className={cn('h-full flex flex-col', styles.textPrimary)}>
      {/* Query Mode Toggle */}
      <div className={cn('flex items-center gap-2 p-3 border-b', styles.borderColor, styles.bgSecondary)}>
        <div className={cn('flex rounded-lg border p-0.5', styles.borderColor)}>
          <button
            onClick={() => setQueryMode('dsl')}
            className={cn(
              'px-3 py-1 text-sm rounded-md transition-colors',
              queryMode === 'dsl' ? 'bg-accent-primary text-white' : styles.hoverBg
            )}
          >
            <span className="flex items-center gap-1">
              <Code className="w-4 h-4" />
              DSL
            </span>
          </button>
          <button
            onClick={() => setQueryMode('sql')}
            className={cn(
              'px-3 py-1 text-sm rounded-md transition-colors',
              queryMode === 'sql' ? 'bg-accent-primary text-white' : styles.hoverBg
            )}
          >
            <span className="flex items-center gap-1">
              <Database className="w-4 h-4" />
              SQL
            </span>
          </button>
        </div>

        {queryMode === 'dsl' && (
          <>
            <select
              value={selectedIndex}
              onChange={(e) => setSelectedIndex(e.target.value)}
              className={cn('px-3 py-1.5 text-sm rounded border', styles.borderColor, styles.bgSecondary)}
            >
              <option value="">{t('elasticsearch.selectIndex', 'Select Index')}</option>
              {indices.map((idx) => (
                <option key={idx.name} value={idx.name}>
                  {idx.name}
                </option>
              ))}
            </select>
            <button
              onClick={formatQuery}
              className={cn('p-1.5 rounded', styles.hoverBg)}
              title={t('elasticsearch.format', 'Format')}
            >
              <AlignLeft className="w-4 h-4" />
            </button>
          </>
        )}

        <button
          onClick={queryMode === 'dsl' ? executeDslQuery : executeSqlQuery}
          disabled={isExecuting}
          className="ml-auto px-4 py-1.5 text-sm rounded bg-accent-primary text-white hover:bg-accent-hover transition-colors flex items-center gap-1 disabled:opacity-50"
        >
          <Play className="w-4 h-4" />
          {isExecuting ? t('common.executing', 'Executing...') : t('common.execute', 'Execute')}
        </button>
      </div>

      {/* Query Editor */}
      <div className={cn('border-b', styles.borderColor)} style={{ height: '40%' }}>
        {queryMode === 'dsl' ? (
          <textarea
            value={dslQuery}
            onChange={(e) => setDslQuery(e.target.value)}
            className={cn(
              'w-full h-full p-4 text-sm font-mono resize-none',
              styles.bgSecondary,
              'focus:outline-none'
            )}
            placeholder={t('elasticsearch.dslPlaceholder', 'Enter DSL query...')}
            spellCheck={false}
          />
        ) : (
          <textarea
            value={sqlQuery}
            onChange={(e) => setSqlQuery(e.target.value)}
            className={cn(
              'w-full h-full p-4 text-sm font-mono resize-none',
              styles.bgSecondary,
              'focus:outline-none'
            )}
            placeholder={t('elasticsearch.sqlPlaceholder', 'Enter SQL query...')}
            spellCheck={false}
          />
        )}
      </div>

      {/* Results */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {/* Error */}
        {error && (
          <div className="m-4 p-3 bg-red-500/10 text-red-500 border border-red-500/30 rounded text-sm">
            {error}
          </div>
        )}

        {/* DSL Results */}
        {queryMode === 'dsl' && dslResult && (
          <>
            <div className={cn('px-4 py-2 border-b flex items-center gap-4 text-sm', styles.borderColor, styles.bgSecondary)}>
              <span className="flex items-center gap-1">
                <Clock className="w-4 h-4" />
                {dslResult.took}ms
              </span>
              <span>
                {t('elasticsearch.totalHits', `${dslResult.total.toLocaleString()} hits`)}
              </span>
              {dslResult.timedOut && (
                <span className="text-yellow-500">{t('elasticsearch.timedOut', 'Timed out')}</span>
              )}
            </div>
            <div className="flex-1 overflow-auto">
              {dslResult.hits.map((hit, idx) => (
                <DslResultItem key={`${hit.id}-${idx}`} hit={hit} styles={styles} />
              ))}
            </div>
            {/* Pagination */}
            <div className={cn('px-4 py-2 border-t flex items-center justify-center gap-2', styles.borderColor, styles.bgSecondary)}>
              <button
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 0}
                className={cn('p-1 rounded disabled:opacity-50', styles.hoverBg)}
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm">
                {currentPage + 1} / {Math.ceil(dslResult.total / pageSize)}
              </span>
              <button
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={(currentPage + 1) * pageSize >= dslResult.total}
                className={cn('p-1 rounded disabled:opacity-50', styles.hoverBg)}
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </>
        )}

        {/* SQL Results */}
        {queryMode === 'sql' && sqlResult && (
          <div className="flex-1 overflow-auto">
            <table className="w-full">
              <thead>
                <tr className={cn('border-b sticky top-0', styles.borderColor, styles.bgSecondary)}>
                  {sqlResult.columns.map((col) => (
                    <th key={col.name} className="px-4 py-2 text-left text-sm font-medium">
                      <div>{col.name}</div>
                      <div className={cn('text-xs font-normal', styles.textSecondary)}>{col.columnType}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sqlResult.rows.map((row, rowIdx) => (
                  <tr key={rowIdx} className={cn('border-b', styles.borderColor, styles.hoverBg)}>
                    {row.map((cell, cellIdx) => (
                      <td key={cellIdx} className="px-4 py-2 text-sm font-mono">
                        {formatCellValue(cell)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Empty State */}
        {!error && ((queryMode === 'dsl' && !dslResult) || (queryMode === 'sql' && !sqlResult)) && (
          <div className={cn('flex-1 flex items-center justify-center', styles.textSecondary)}>
            <div className="text-center">
              <FileJson className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>{t('elasticsearch.noResults', 'Execute a query to see results')}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// DSL Result Item Component
interface DslResultItemProps {
  hit: EsSearchHit
  styles: ThemeStyles
}

function DslResultItem({ hit, styles }: DslResultItemProps) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className={cn('border-b', styles.borderColor)}>
      <div
        onClick={() => setExpanded(!expanded)}
        className={cn('px-4 py-2 cursor-pointer flex items-center gap-4', styles.hoverBg)}
      >
        <span className="text-sm font-mono text-accent-primary">{hit.id}</span>
        <span className={cn('text-xs', styles.textSecondary)}>{hit.index}</span>
        {hit.score !== undefined && (
          <span className={cn('text-xs ml-auto', styles.textSecondary)}>
            score: {hit.score?.toFixed(4)}
          </span>
        )}
      </div>
      {expanded && (
        <pre className={cn('px-4 py-2 text-sm font-mono overflow-x-auto', styles.bgSecondary)}>
          {JSON.stringify(hit.source, null, 2)}
        </pre>
      )}
    </div>
  )
}

// Format cell value for display
function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) return 'null'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}
