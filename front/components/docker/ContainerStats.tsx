/**
 * Container Stats Component
 *
 * Displays real-time resource usage for a Docker container.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import {
  X,
  RefreshCw,
  Cpu,
  HardDrive,
  Network,
  Database,
  Loader2,
  AlertCircle,
  Play,
  Pause,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useThemeStore } from '@/stores'
import { dockerGetContainerStats, formatBytes, type ContainerStats } from '@/services/docker'

interface ContainerStatsProps {
  connectionId: string
  containerId: string
  containerName: string
  onClose: () => void
}

export function ContainerStatsView({
  connectionId,
  containerId,
  containerName,
  onClose,
}: ContainerStatsProps) {
  const { t } = useTranslation()
  const { theme } = useThemeStore()
  const isDark = theme === 'dark'

  const [stats, setStats] = useState<ContainerStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const intervalRef = useRef<number | null>(null)

  // Theme styles
  const bgPrimary = isDark ? 'bg-dark-bg-primary' : 'bg-light-bg-primary'
  const bgSecondary = isDark ? 'bg-dark-bg-secondary' : 'bg-light-bg-secondary'
  const borderColor = isDark ? 'border-dark-border' : 'border-light-border'
  const textPrimary = isDark ? 'text-dark-text-primary' : 'text-light-text-primary'
  const textSecondary = isDark ? 'text-dark-text-secondary' : 'text-light-text-secondary'
  const hoverBg = isDark ? 'hover:bg-dark-bg-hover' : 'hover:bg-light-bg-hover'

  const inFlightRef = useRef(false)
  const loadStats = useCallback(async () => {
    // Don't stack requests: `docker stats` routinely takes >1-2s, so a fixed 3s
    // interval would otherwise overlap and let responses arrive out of order,
    // flickering the display back to older samples.
    if (inFlightRef.current) return
    inFlightRef.current = true
    try {
      const data = await dockerGetContainerStats(connectionId, containerId)
      setStats(data)
      setError(null)
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
      inFlightRef.current = false
    }
  }, [connectionId, containerId])

  // Initial load
  useEffect(() => {
    loadStats()
  }, [loadStats])

  // Auto-refresh every 3 seconds
  useEffect(() => {
    if (autoRefresh) {
      intervalRef.current = window.setInterval(loadStats, 3000)
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [autoRefresh, loadStats])

  const formatPercent = (value: number): string => {
    return `${value.toFixed(1)}%`
  }

  const formatTimestamp = (timestamp: number): string => {
    return new Date(timestamp * 1000).toLocaleTimeString()
  }

  return (
    <div className={cn('flex flex-col h-full', bgPrimary)}>
      {/* Header */}
      <div className={cn('flex items-center justify-between px-4 py-2 border-b', borderColor)}>
        <div className="flex items-center gap-2">
          <Cpu className={cn('w-5 h-5', textSecondary)} />
          <h3 className={cn('font-medium', textPrimary)}>
            {t('docker.containerStats')}: {containerName}
          </h3>
        </div>
        <div className="flex items-center gap-2">
          {/* Auto-refresh toggle */}
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={cn(
              'flex items-center gap-1 px-2 py-1 rounded text-sm transition-colors',
              autoRefresh ? 'text-status-success' : textSecondary,
              hoverBg
            )}
            title={autoRefresh ? t('docker.pauseAutoRefresh') : t('docker.resumeAutoRefresh')}
          >
            {autoRefresh ? (
              <>
                <Pause className="w-4 h-4" />
                <span>{t('docker.autoRefreshOn')}</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                <span>{t('docker.autoRefreshOff')}</span>
              </>
            )}
          </button>

          {/* Manual refresh */}
          <button
            onClick={loadStats}
            disabled={loading}
            className={cn(
              'p-1.5 rounded transition-colors',
              hoverBg,
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
            title={t('common.refresh')}
          >
            <RefreshCw className={cn('w-4 h-4', textSecondary, loading && 'animate-spin')} />
          </button>

          {/* Close button */}
          <button
            onClick={onClose}
            className={cn('p-1.5 rounded transition-colors', hoverBg)}
            title={t('common.close')}
          >
            <X className={cn('w-4 h-4', textSecondary)} />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        {loading && !stats ? (
          <div className={cn('flex items-center justify-center h-32', textSecondary)}>
            <Loader2 className="w-6 h-6 animate-spin mr-2" />
            {t('common.loading')}
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-32 text-status-error">
            <AlertCircle className="w-5 h-5 mr-2" />
            {error}
          </div>
        ) : stats ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* CPU Usage */}
            <StatCard
              icon={<Cpu className="w-5 h-5" />}
              title={t('docker.cpuUsage')}
              isDark={isDark}
            >
              <div className="mt-2">
                <div className="flex items-center justify-between mb-1">
                  <span className={textSecondary}>{t('docker.usage')}</span>
                  <span className={cn('font-mono', textPrimary)}>
                    {formatPercent(stats.cpuPercent)}
                  </span>
                </div>
                <div className={cn('h-2 rounded-full overflow-hidden', bgSecondary)}>
                  <div
                    className="h-full bg-accent-primary transition-all duration-300"
                    style={{ width: `${Math.min(stats.cpuPercent, 100)}%` }}
                  />
                </div>
              </div>
            </StatCard>

            {/* Memory Usage */}
            <StatCard
              icon={<HardDrive className="w-5 h-5" />}
              title={t('docker.memoryUsage')}
              isDark={isDark}
            >
              <div className="mt-2">
                <div className="flex items-center justify-between mb-1">
                  <span className={textSecondary}>
                    {formatBytes(stats.memoryUsage)} / {formatBytes(stats.memoryLimit)}
                  </span>
                  <span className={cn('font-mono', textPrimary)}>
                    {formatPercent(stats.memoryPercent)}
                  </span>
                </div>
                <div className={cn('h-2 rounded-full overflow-hidden', bgSecondary)}>
                  <div
                    className={cn(
                      'h-full transition-all duration-300',
                      stats.memoryPercent > 90 ? 'bg-status-error' :
                      stats.memoryPercent > 80 ? 'bg-status-warning' : 'bg-status-success'
                    )}
                    style={{ width: `${Math.min(stats.memoryPercent, 100)}%` }}
                  />
                </div>
              </div>
            </StatCard>

            {/* Network I/O */}
            <StatCard
              icon={<Network className="w-5 h-5" />}
              title={t('docker.networkIO')}
              isDark={isDark}
            >
              <div className="mt-2 grid grid-cols-2 gap-4">
                <div>
                  <span className={cn('text-xs', textSecondary)}>{t('docker.received')}</span>
                  <p className={cn('font-mono text-lg', textPrimary)}>
                    {formatBytes(stats.networkRx)}
                  </p>
                </div>
                <div>
                  <span className={cn('text-xs', textSecondary)}>{t('docker.transmitted')}</span>
                  <p className={cn('font-mono text-lg', textPrimary)}>
                    {formatBytes(stats.networkTx)}
                  </p>
                </div>
              </div>
            </StatCard>

            {/* Block I/O */}
            <StatCard
              icon={<Database className="w-5 h-5" />}
              title={t('docker.blockIO')}
              isDark={isDark}
            >
              <div className="mt-2 grid grid-cols-2 gap-4">
                <div>
                  <span className={cn('text-xs', textSecondary)}>{t('docker.read')}</span>
                  <p className={cn('font-mono text-lg', textPrimary)}>
                    {formatBytes(stats.blockRead)}
                  </p>
                </div>
                <div>
                  <span className={cn('text-xs', textSecondary)}>{t('docker.write')}</span>
                  <p className={cn('font-mono text-lg', textPrimary)}>
                    {formatBytes(stats.blockWrite)}
                  </p>
                </div>
              </div>
            </StatCard>
          </div>
        ) : null}

        {/* Last updated */}
        {stats && (
          <div className={cn('mt-4 text-xs text-right', textSecondary)}>
            {t('docker.lastUpdated')}: {formatTimestamp(stats.timestamp)}
          </div>
        )}
      </div>
    </div>
  )
}

// Stat Card Component
interface StatCardProps {
  icon: React.ReactNode
  title: string
  children: React.ReactNode
  isDark: boolean
}

function StatCard({ icon, title, children, isDark }: StatCardProps) {
  const bgSecondary = isDark ? 'bg-dark-bg-secondary' : 'bg-light-bg-secondary'
  const borderColor = isDark ? 'border-dark-border' : 'border-light-border'
  const textPrimary = isDark ? 'text-dark-text-primary' : 'text-light-text-primary'

  return (
    <div className={cn('p-4 rounded-lg border', bgSecondary, borderColor)}>
      <div className="flex items-center gap-2">
        <span className="text-accent-primary">{icon}</span>
        <h4 className={cn('font-medium', textPrimary)}>{title}</h4>
      </div>
      {children}
    </div>
  )
}
