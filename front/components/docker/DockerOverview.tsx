/**
 * Docker Overview Component
 *
 * Displays Docker system information, container and image statistics.
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { useThemeStore } from '@/stores'
import {
  RefreshCw,
  Container,
  Box,
  Cpu,
  HardDrive,
  Info,
  Server,
} from 'lucide-react'
import {
  dockerGetInfo,
  dockerGetStats,
  formatBytes,
  type DockerInfo,
  type DockerStats,
} from '@/services/docker'

interface DockerOverviewProps {
  connectionId: string
}

export function DockerOverview({ connectionId }: DockerOverviewProps) {
  const { t } = useTranslation()
  const { theme } = useThemeStore()
  const isDark = theme === 'dark'

  const [info, setInfo] = useState<DockerInfo | null>(null)
  const [stats, setStats] = useState<DockerStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Theme styles
  const styles = useMemo(
    () => ({
      bgPrimary: isDark ? 'bg-dark-bg-primary' : 'bg-light-bg-primary',
      bgSecondary: isDark ? 'bg-dark-bg-secondary' : 'bg-light-bg-secondary',
      borderColor: isDark ? 'border-dark-border' : 'border-light-border',
      textPrimary: isDark ? 'text-dark-text-primary' : 'text-light-text-primary',
      textSecondary: isDark ? 'text-dark-text-secondary' : 'text-light-text-secondary',
      cardBg: isDark ? 'bg-dark-bg-tertiary' : 'bg-white',
      cardBorder: isDark ? 'border-dark-border' : 'border-gray-200',
    }),
    [isDark]
  )

  // Load data
  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [infoData, statsData] = await Promise.all([
        dockerGetInfo(connectionId),
        dockerGetStats(connectionId),
      ])
      setInfo(infoData)
      setStats(statsData)
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }, [connectionId])

  useEffect(() => {
    loadData()
  }, [loadData])

  if (loading) {
    return (
      <div className={cn('flex items-center justify-center h-full', styles.textSecondary)}>
        <RefreshCw className="w-6 h-6 animate-spin mr-2" />
        {t('common.loading')}
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <p className="text-status-error mb-4">{error}</p>
        <button
          onClick={loadData}
          className="px-4 py-2 bg-accent-primary text-white rounded hover:bg-accent-hover"
        >
          {t('common.retry')}
        </button>
      </div>
    )
  }

  return (
    <div className={cn('h-full overflow-auto p-4', styles.bgPrimary)}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className={cn('text-lg font-semibold', styles.textPrimary)}>
          {t('docker.overview')}
        </h2>
        <button
          onClick={loadData}
          disabled={loading}
          className={cn(
            'p-2 rounded transition-colors',
            styles.textSecondary,
            'hover:bg-accent-primary/10'
          )}
          title={t('common.refresh')}
        >
          <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {/* Containers Running */}
        <StatCard
          icon={<Container className="w-8 h-8 text-status-success" />}
          label={t('docker.containersRunning')}
          value={stats?.containersRunning ?? 0}
          styles={styles}
        />
        {/* Containers Stopped */}
        <StatCard
          icon={<Container className="w-8 h-8 text-status-warning" />}
          label={t('docker.containersStopped')}
          value={stats?.containersStopped ?? 0}
          styles={styles}
        />
        {/* Total Containers */}
        <StatCard
          icon={<Container className="w-8 h-8 text-accent-primary" />}
          label={t('docker.containersTotal')}
          value={stats?.containersTotal ?? 0}
          styles={styles}
        />
        {/* Images */}
        <StatCard
          icon={<Box className="w-8 h-8 text-accent-secondary" />}
          label={t('docker.images')}
          value={`${stats?.imagesCount ?? 0} (${formatBytes(stats?.imagesSize ?? 0)})`}
          styles={styles}
        />
      </div>

      {/* System Info */}
      <div className={cn('rounded-lg border p-4', styles.cardBg, styles.cardBorder)}>
        <h3 className={cn('text-md font-medium mb-4 flex items-center', styles.textPrimary)}>
          <Info className="w-5 h-5 mr-2" />
          {t('docker.systemInfo')}
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Docker Version */}
          <InfoRow
            icon={<Server className="w-4 h-4" />}
            label={t('docker.version')}
            value={info?.version ?? '-'}
            styles={styles}
          />
          {/* API Version */}
          <InfoRow
            label={t('docker.apiVersion')}
            value={info?.apiVersion ?? '-'}
            styles={styles}
          />
          {/* OS */}
          <InfoRow
            label={t('docker.os')}
            value={info?.os ?? '-'}
            styles={styles}
          />
          {/* Architecture */}
          <InfoRow
            label={t('docker.arch')}
            value={info?.arch ?? '-'}
            styles={styles}
          />
          {/* Kernel Version */}
          <InfoRow
            label={t('docker.kernelVersion')}
            value={info?.kernelVersion ?? '-'}
            styles={styles}
          />
          {/* Storage Driver */}
          <InfoRow
            label={t('docker.storageDriver')}
            value={info?.storageDriver ?? '-'}
            styles={styles}
          />
          {/* CPUs */}
          <InfoRow
            icon={<Cpu className="w-4 h-4" />}
            label={t('docker.cpus')}
            value={info?.cpus ?? '-'}
            styles={styles}
          />
          {/* Memory */}
          <InfoRow
            icon={<HardDrive className="w-4 h-4" />}
            label={t('docker.memory')}
            value={formatBytes(info?.memoryTotal ?? 0)}
            styles={styles}
          />
          {/* Root Dir */}
          <InfoRow
            label={t('docker.rootDir')}
            value={info?.rootDir ?? '-'}
            styles={styles}
            fullWidth
          />
        </div>
      </div>
    </div>
  )
}

// Stat Card Component
interface StatCardProps {
  icon: React.ReactNode
  label: string
  value: string | number
  styles: {
    cardBg: string
    cardBorder: string
    textPrimary: string
    textSecondary: string
  }
}

function StatCard({ icon, label, value, styles }: StatCardProps) {
  return (
    <div className={cn('rounded-lg border p-4 flex items-center', styles.cardBg, styles.cardBorder)}>
      <div className="mr-4">{icon}</div>
      <div>
        <p className={cn('text-sm', styles.textSecondary)}>{label}</p>
        <p className={cn('text-xl font-semibold', styles.textPrimary)}>{value}</p>
      </div>
    </div>
  )
}

// Info Row Component
interface InfoRowProps {
  icon?: React.ReactNode
  label: string
  value: string | number
  styles: {
    textPrimary: string
    textSecondary: string
  }
  fullWidth?: boolean
}

function InfoRow({ icon, label, value, styles, fullWidth }: InfoRowProps) {
  return (
    <div className={cn('flex items-center', fullWidth && 'md:col-span-2')}>
      {icon && <span className={cn('mr-2', styles.textSecondary)}>{icon}</span>}
      <span className={cn('text-sm mr-2', styles.textSecondary)}>{label}:</span>
      <span className={cn('text-sm font-medium', styles.textPrimary)}>{value}</span>
    </div>
  )
}
