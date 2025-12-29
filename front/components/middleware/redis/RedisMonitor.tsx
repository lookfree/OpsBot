/**
 * Redis Monitor Component
 *
 * Real-time monitoring for Redis server.
 * Displays server info, memory usage, client connections, QPS, and hit rate.
 */

import { useState, useCallback, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import {
  RefreshCw,
  Activity,
  HardDrive,
  Users,
  Zap,
  TrendingUp,
  Pause,
  Play,
} from 'lucide-react'
import { mwRedisGetInfo, type RedisInfo } from '@/services/middleware'

interface ThemeStyles {
  bgSecondary: string
  borderColor: string
  textPrimary: string
  textSecondary: string
  hoverBg: string
  isDark: boolean
}

interface RedisMonitorProps {
  connectionId: string
  styles: ThemeStyles
}

interface MetricHistory {
  timestamp: number
  opsPerSec: number
  usedMemory: number
  connectedClients: number
  hitRate: number
}

const MAX_HISTORY_POINTS = 60 // 60 seconds of history

export function RedisMonitor({ connectionId, styles }: RedisMonitorProps) {
  const { t } = useTranslation()
  const [redisInfo, setRedisInfo] = useState<RedisInfo | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPaused, setIsPaused] = useState(false)
  const [refreshInterval, setRefreshInterval] = useState(1000) // 1 second
  const [history, setHistory] = useState<MetricHistory[]>([])
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Fetch Redis info
  const fetchInfo = useCallback(async () => {
    if (isPaused) return

    setLoading(true)
    try {
      const info = await mwRedisGetInfo(connectionId)
      setRedisInfo(info)
      setError(null)

      // Update history
      setHistory((prev) => {
        const newEntry: MetricHistory = {
          timestamp: Date.now(),
          opsPerSec: info.stats.instantaneousOpsPerSec,
          usedMemory: info.memory.usedMemory,
          connectedClients: info.clients.connectedClients,
          hitRate: info.stats.hitRate,
        }
        const updated = [...prev, newEntry]
        return updated.slice(-MAX_HISTORY_POINTS)
      })
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }, [connectionId, isPaused])

  // Start/stop auto-refresh
  useEffect(() => {
    fetchInfo()

    if (!isPaused) {
      intervalRef.current = setInterval(fetchInfo, refreshInterval)
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [fetchInfo, refreshInterval, isPaused])

  // Format bytes to human readable
  const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
  }

  // Calculate trend (comparing last two values)
  const getTrend = (metric: keyof MetricHistory): 'up' | 'down' | 'stable' => {
    if (history.length < 2) return 'stable'
    const latest = history[history.length - 1][metric]
    const previous = history[history.length - 2][metric]
    if (latest > previous * 1.05) return 'up'
    if (latest < previous * 0.95) return 'down'
    return 'stable'
  }

  // Get min/max/avg from history
  const getStats = (metric: keyof MetricHistory) => {
    if (history.length === 0) return { min: 0, max: 0, avg: 0 }
    const values = history.map((h) => h[metric] as number)
    return {
      min: Math.min(...values),
      max: Math.max(...values),
      avg: values.reduce((a, b) => a + b, 0) / values.length,
    }
  }

  if (error && !redisInfo) {
    return (
      <div className={cn('flex flex-col items-center justify-center h-full', styles.textSecondary)}>
        <Activity className="w-12 h-12 mb-4 text-status-error" />
        <p className="text-status-error mb-2">{t('redis.monitor.error', '获取监控数据失败')}</p>
        <p className="text-sm">{error}</p>
        <button
          onClick={fetchInfo}
          className={cn(
            'mt-4 px-4 py-2 rounded',
            'bg-accent-primary text-white',
            'hover:bg-accent-hover transition-colors'
          )}
        >
          {t('common.refresh', '刷新')}
        </button>
      </div>
    )
  }

  return (
    <div className={cn('h-full overflow-auto p-4', styles.textPrimary)}>
      {/* Header with Controls */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <Activity className="w-5 h-5 text-accent-primary" />
          {t('redis.monitor.title', '实时监控')}
        </h2>
        <div className="flex items-center gap-2">
          {/* Refresh Interval Selector */}
          <select
            value={refreshInterval}
            onChange={(e) => setRefreshInterval(Number(e.target.value))}
            className={cn(
              'px-2 py-1 rounded border text-sm',
              styles.borderColor,
              styles.isDark ? 'bg-dark-bg-hover' : 'bg-light-bg-primary'
            )}
          >
            <option value={1000}>1s</option>
            <option value={2000}>2s</option>
            <option value={5000}>5s</option>
            <option value={10000}>10s</option>
          </select>

          {/* Pause/Resume Button */}
          <button
            onClick={() => setIsPaused(!isPaused)}
            className={cn(
              'p-2 rounded transition-colors',
              isPaused ? 'bg-accent-primary text-white' : styles.hoverBg
            )}
            title={isPaused ? t('redis.monitor.resume', '恢复') : t('redis.monitor.pause', '暂停')}
          >
            {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
          </button>

          {/* Manual Refresh Button */}
          <button
            onClick={fetchInfo}
            disabled={loading}
            className={cn('p-2 rounded', styles.hoverBg, 'transition-colors disabled:opacity-50')}
            title={t('common.refresh', '刷新')}
          >
            <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
          </button>
        </div>
      </div>

      {/* Status Indicator */}
      <div className={cn('mb-4 flex items-center gap-2 text-sm', styles.textSecondary)}>
        <span
          className={cn(
            'w-2 h-2 rounded-full',
            isPaused ? 'bg-yellow-500' : 'bg-green-500 animate-pulse'
          )}
        />
        {isPaused
          ? t('redis.monitor.paused', '已暂停')
          : t('redis.monitor.monitoring', '监控中...')}
        {history.length > 0 && (
          <span className="ml-auto">
            {t('redis.monitor.dataPoints', '数据点: {{count}}').replace(
              '{{count}}',
              String(history.length)
            )}
          </span>
        )}
      </div>

      {redisInfo && (
        <>
          {/* Primary Metrics Row */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <MonitorCard
              icon={<Zap className="w-5 h-5" />}
              label={t('redis.opsPerSec', '每秒操作')}
              value={redisInfo.stats.instantaneousOpsPerSec.toLocaleString()}
              unit="ops/s"
              trend={getTrend('opsPerSec')}
              stats={getStats('opsPerSec')}
              formatValue={(v) => v.toFixed(0)}
              styles={styles}
            />
            <MonitorCard
              icon={<HardDrive className="w-5 h-5" />}
              label={t('redis.usedMemory', '已用内存')}
              value={redisInfo.memory.usedMemoryHuman}
              trend={getTrend('usedMemory')}
              stats={getStats('usedMemory')}
              formatValue={formatBytes}
              styles={styles}
            />
            <MonitorCard
              icon={<Users className="w-5 h-5" />}
              label={t('redis.connectedClients', '客户端连接')}
              value={`${redisInfo.clients.connectedClients}`}
              subValue={`/ ${redisInfo.clients.maxClients}`}
              trend={getTrend('connectedClients')}
              stats={getStats('connectedClients')}
              formatValue={(v) => v.toFixed(0)}
              styles={styles}
            />
            <MonitorCard
              icon={<TrendingUp className="w-5 h-5" />}
              label={t('redis.hitRate', '命中率')}
              value={`${(redisInfo.stats.hitRate * 100).toFixed(1)}%`}
              trend={getTrend('hitRate')}
              stats={getStats('hitRate')}
              formatValue={(v) => `${(v * 100).toFixed(1)}%`}
              styles={styles}
            />
          </div>

          {/* Server Info Section */}
          <div className={cn('rounded-lg border mb-6', styles.borderColor)}>
            <div className={cn('px-4 py-3 font-medium border-b', styles.bgSecondary, styles.borderColor)}>
              {t('redis.serverInfo', '服务器信息')} (INFO)
            </div>
            <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <InfoItem
                label={t('redis.version', '版本')}
                value={redisInfo.server.redisVersion}
                styles={styles}
              />
              <InfoItem
                label={t('redis.mode', '模式')}
                value={redisInfo.server.redisMode}
                styles={styles}
              />
              <InfoItem
                label={t('redis.os', '操作系统')}
                value={redisInfo.server.os.split(' ')[0]}
                styles={styles}
              />
              <InfoItem
                label={t('redis.uptime', '运行时间')}
                value={`${redisInfo.server.uptimeInDays}d`}
                styles={styles}
              />
            </div>
          </div>

          {/* Memory Details Section */}
          <div className={cn('rounded-lg border mb-6', styles.borderColor)}>
            <div className={cn('px-4 py-3 font-medium border-b', styles.bgSecondary, styles.borderColor)}>
              {t('redis.monitor.memoryDetails', '内存详情')}
            </div>
            <div className="p-4">
              {/* Memory Usage Bar */}
              <div className="mb-4">
                <div className="flex justify-between text-sm mb-1">
                  <span>{t('redis.usedMemory', '已用内存')}</span>
                  <span>
                    {redisInfo.memory.usedMemoryHuman}
                    {redisInfo.memory.maxmemory > 0 && ` / ${redisInfo.memory.maxmemoryHuman}`}
                  </span>
                </div>
                <div className={cn('h-2 rounded-full overflow-hidden', styles.bgSecondary)}>
                  <div
                    className="h-full bg-accent-primary transition-all duration-300"
                    style={{
                      width:
                        redisInfo.memory.maxmemory > 0
                          ? `${(redisInfo.memory.usedMemory / redisInfo.memory.maxmemory) * 100}%`
                          : '50%',
                    }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <InfoItem
                  label={t('redis.peakMemory', '峰值内存')}
                  value={redisInfo.memory.usedMemoryPeakHuman}
                  styles={styles}
                />
                <InfoItem
                  label={t('redis.fragmentationRatio', '碎片率')}
                  value={redisInfo.memory.memFragmentationRatio.toFixed(2)}
                  styles={styles}
                />
                <InfoItem
                  label={t('redis.monitor.blockedClients', '阻塞客户端')}
                  value={String(redisInfo.clients.blockedClients)}
                  styles={styles}
                />
                <InfoItem
                  label={t('redis.totalConnections', '总连接数')}
                  value={redisInfo.stats.totalConnectionsReceived.toLocaleString()}
                  styles={styles}
                />
              </div>
            </div>
          </div>

          {/* Stats Section */}
          <div className={cn('rounded-lg border', styles.borderColor)}>
            <div className={cn('px-4 py-3 font-medium border-b', styles.bgSecondary, styles.borderColor)}>
              {t('redis.monitor.statistics', '统计信息')}
            </div>
            <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <InfoItem
                label={t('redis.totalCommands', '总命令数')}
                value={redisInfo.stats.totalCommandsProcessed.toLocaleString()}
                styles={styles}
              />
              <InfoItem
                label={t('redis.monitor.keyspaceHits', '键空间命中')}
                value={redisInfo.stats.keyspaceHits.toLocaleString()}
                styles={styles}
              />
              <InfoItem
                label={t('redis.monitor.keyspaceMisses', '键空间未命中')}
                value={redisInfo.stats.keyspaceMisses.toLocaleString()}
                styles={styles}
              />
              <InfoItem
                label={t('redis.opsPerSec', '每秒操作')}
                value={redisInfo.stats.instantaneousOpsPerSec.toLocaleString()}
                styles={styles}
              />
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// Monitor Card Component with Trend and Stats
interface MonitorCardProps {
  icon: React.ReactNode
  label: string
  value: string
  unit?: string
  subValue?: string
  trend: 'up' | 'down' | 'stable'
  stats: { min: number; max: number; avg: number }
  formatValue: (v: number) => string
  styles: ThemeStyles
}

function MonitorCard({
  icon,
  label,
  value,
  unit,
  subValue,
  trend,
  stats,
  formatValue,
  styles,
}: MonitorCardProps) {
  const trendColors = {
    up: 'text-green-500',
    down: 'text-red-500',
    stable: 'text-gray-500',
  }
  const trendSymbols = {
    up: '↑',
    down: '↓',
    stable: '→',
  }

  return (
    <div className={cn('p-4 rounded-lg border', styles.bgSecondary, styles.borderColor)}>
      <div className="flex items-center gap-3 mb-2">
        <div className="p-2 rounded-lg bg-accent-primary/20 text-accent-primary">{icon}</div>
        <div className="min-w-0 flex-1">
          <div className={cn('text-sm truncate', styles.textSecondary)}>{label}</div>
          <div className="flex items-baseline gap-1">
            <span className="text-xl font-semibold">{value}</span>
            {unit && <span className={cn('text-xs', styles.textSecondary)}>{unit}</span>}
            {subValue && <span className={cn('text-sm', styles.textSecondary)}>{subValue}</span>}
            <span className={cn('text-sm ml-1', trendColors[trend])}>{trendSymbols[trend]}</span>
          </div>
        </div>
      </div>
      {/* Mini stats */}
      <div className={cn('flex justify-between text-xs', styles.textSecondary)}>
        <span>Min: {formatValue(stats.min)}</span>
        <span>Avg: {formatValue(stats.avg)}</span>
        <span>Max: {formatValue(stats.max)}</span>
      </div>
    </div>
  )
}

// Info Item Component
interface InfoItemProps {
  label: string
  value: string
  styles: ThemeStyles
}

function InfoItem({ label, value, styles }: InfoItemProps) {
  return (
    <div>
      <div className={cn('text-xs mb-1', styles.textSecondary)}>{label}</div>
      <div className="font-mono">{value}</div>
    </div>
  )
}
