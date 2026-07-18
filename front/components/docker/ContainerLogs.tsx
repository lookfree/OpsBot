/**
 * Container Logs Component
 *
 * Displays container logs with auto-scroll and refresh.
 */

import { useState, useCallback, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { RefreshCw, Loader2, AlertCircle, X, ArrowDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useThemeStore } from '@/stores'
import { dockerGetLogs } from '@/services/docker'

interface ContainerLogsProps {
  connectionId: string
  containerId: string
  containerName: string
  onClose?: () => void
}

export function ContainerLogs({
  connectionId,
  containerId,
  containerName,
  onClose,
}: ContainerLogsProps) {
  const { t } = useTranslation()
  const { theme } = useThemeStore()
  const isDark = theme === 'dark'

  const [logs, setLogs] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tailLines, setTailLines] = useState(100)
  const [autoScroll, setAutoScroll] = useState(true)
  const logsEndRef = useRef<HTMLDivElement>(null)
  const logsContainerRef = useRef<HTMLDivElement>(null)

  const reqIdRef = useRef(0)
  const loadLogs = useCallback(async () => {
    const reqId = ++reqIdRef.current
    setLoading(true)
    setError(null)
    try {
      const data = await dockerGetLogs(connectionId, containerId, tailLines)
      // Ignore a response a newer request has superseded (e.g. the user changed
      // the tail count while this one was in flight), and don't let the stale
      // request's finally clear the newer one's loading flag.
      if (reqIdRef.current === reqId) setLogs(data)
    } catch (err) {
      if (reqIdRef.current === reqId) setError(String(err))
    } finally {
      if (reqIdRef.current === reqId) setLoading(false)
    }
  }, [connectionId, containerId, tailLines])

  useEffect(() => {
    loadLogs()
  }, [loadLogs])

  useEffect(() => {
    if (autoScroll && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [logs, autoScroll])

  const handleScroll = useCallback(() => {
    if (!logsContainerRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = logsContainerRef.current
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50
    setAutoScroll(isAtBottom)
  }, [])

  const scrollToBottom = useCallback(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    setAutoScroll(true)
  }, [])

  // Theme styles
  const bgPrimary = isDark ? 'bg-dark-bg-primary' : 'bg-light-bg-primary'
  const bgSecondary = isDark ? 'bg-dark-bg-secondary' : 'bg-light-bg-secondary'
  const borderColor = isDark ? 'border-dark-border' : 'border-light-border'
  const textPrimary = isDark ? 'text-dark-text-primary' : 'text-light-text-primary'
  const textSecondary = isDark ? 'text-dark-text-secondary' : 'text-light-text-secondary'
  const hoverBg = isDark ? 'hover:bg-dark-bg-hover' : 'hover:bg-light-bg-hover'
  const inputBg = isDark ? 'bg-dark-bg-hover' : 'bg-light-bg-primary'

  return (
    <div className={cn('h-full flex flex-col', bgPrimary)}>
      {/* Header */}
      <div className={cn('flex items-center justify-between px-4 py-2 border-b', borderColor)}>
        <div className="flex items-center gap-2">
          <h3 className={cn('font-medium', textPrimary)}>{t('docker.logs')}</h3>
          <span className={cn('text-sm font-mono', textSecondary)}>- {containerName}</span>
        </div>
        <div className="flex items-center gap-2">
          {/* Tail lines selector */}
          <div className="flex items-center gap-1">
            <label className={cn('text-xs', textSecondary)}>{t('docker.tailLines')}:</label>
            <select
              value={tailLines}
              onChange={(e) => setTailLines(Number(e.target.value))}
              className={cn(
                'px-2 py-1 rounded border text-xs',
                'focus:outline-none focus:border-accent-primary',
                inputBg,
                borderColor,
                textPrimary
              )}
            >
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={200}>200</option>
              <option value={500}>500</option>
              <option value={1000}>1000</option>
            </select>
          </div>

          {/* Refresh */}
          <button
            onClick={loadLogs}
            disabled={loading}
            className={cn(
              'p-1.5 rounded transition-colors',
              hoverBg,
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
            title={t('docker.refreshLogs')}
          >
            <RefreshCw className={cn('w-4 h-4', textSecondary, loading && 'animate-spin')} />
          </button>

          {/* Close */}
          {onClose && (
            <button
              onClick={onClose}
              className={cn('p-1.5 rounded transition-colors', hoverBg)}
              title={t('common.close')}
            >
              <X className={cn('w-4 h-4', textSecondary)} />
            </button>
          )}
        </div>
      </div>

      {/* Logs content */}
      <div
        ref={logsContainerRef}
        onScroll={handleScroll}
        className={cn('flex-1 overflow-auto p-4 font-mono text-xs relative', bgSecondary)}
      >
        {loading && !logs ? (
          <div className={cn('flex items-center justify-center h-32', textSecondary)}>
            <Loader2 className="w-6 h-6 animate-spin mr-2" />
            {t('common.loading')}
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-32 text-status-error">
            <AlertCircle className="w-5 h-5 mr-2" />
            {error}
          </div>
        ) : !logs ? (
          <div className={cn('flex items-center justify-center h-32', textSecondary)}>
            {t('docker.noLogs')}
          </div>
        ) : (
          <pre className={cn('whitespace-pre-wrap break-all', textPrimary)}>{logs}</pre>
        )}
        <div ref={logsEndRef} />
      </div>

      {/* Scroll to bottom button */}
      {!autoScroll && (
        <button
          onClick={scrollToBottom}
          className={cn(
            'absolute bottom-20 right-6 p-2 rounded-full shadow-lg transition-colors',
            'bg-accent-primary text-white hover:bg-accent-hover'
          )}
          title="Scroll to bottom"
        >
          <ArrowDown className="w-4 h-4" />
        </button>
      )}
    </div>
  )
}
