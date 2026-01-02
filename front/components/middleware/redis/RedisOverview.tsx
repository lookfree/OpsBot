/**
 * Redis Overview Component
 *
 * Displays Redis server information including version, memory, clients, stats, and keyspace.
 */

import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import {
  RefreshCw,
  Server,
  Database,
  Users,
  HardDrive,
  Activity,
  Clock,
  Zap,
  TrendingUp,
} from 'lucide-react'
import type { RedisInfo, RedisDatabaseInfo } from '@/services/middleware'

interface ThemeStyles {
  bgSecondary: string
  borderColor: string
  textPrimary: string
  textSecondary: string
  hoverBg: string
  isDark: boolean
}

interface RedisOverviewProps {
  redisInfo: RedisInfo
  databases: RedisDatabaseInfo[]
  onRefresh: () => void
  onSelectDatabase: (db: number) => void
  currentDb: number
  isClusterMode?: boolean
  styles: ThemeStyles
}

export function RedisOverview({
  redisInfo,
  databases,
  onRefresh,
  onSelectDatabase,
  currentDb,
  isClusterMode = false,
  styles,
}: RedisOverviewProps) {
  const { t } = useTranslation()

  // Format uptime
  const formatUptime = (seconds: number): string => {
    const days = Math.floor(seconds / 86400)
    const hours = Math.floor((seconds % 86400) / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    if (days > 0) return `${days}d ${hours}h ${minutes}m`
    if (hours > 0) return `${hours}h ${minutes}m`
    return `${minutes}m`
  }

  return (
    <div className={cn('h-full overflow-auto p-4', styles.textPrimary)}>
      {/* Header with Refresh */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold">{t('redis.serverInfo', 'Server Info')}</h2>
        <button
          onClick={onRefresh}
          className={cn('p-2 rounded', styles.hoverBg, 'transition-colors')}
          title={t('common.refresh')}
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Server Info Cards - Row 1 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <StatCard
          icon={<Server className="w-5 h-5" />}
          label={t('redis.version', 'Version')}
          value={redisInfo.server.redisVersion}
          styles={styles}
        />
        <StatCard
          icon={<Activity className="w-5 h-5" />}
          label={t('redis.mode', 'Mode')}
          value={redisInfo.server.redisMode}
          styles={styles}
        />
        <StatCard
          icon={<Clock className="w-5 h-5" />}
          label={t('redis.uptime', 'Uptime')}
          value={formatUptime(redisInfo.server.uptimeInSeconds)}
          styles={styles}
        />
        <StatCard
          icon={<Server className="w-5 h-5" />}
          label={t('redis.os', 'OS')}
          value={redisInfo.server.os.split(' ')[0]}
          styles={styles}
        />
      </div>

      {/* Memory & Client Stats - Row 2 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <StatCard
          icon={<HardDrive className="w-5 h-5" />}
          label={t('redis.usedMemory', 'Used Memory')}
          value={redisInfo.memory.usedMemoryHuman}
          styles={styles}
        />
        <StatCard
          icon={<HardDrive className="w-5 h-5" />}
          label={t('redis.peakMemory', 'Peak Memory')}
          value={redisInfo.memory.usedMemoryPeakHuman}
          styles={styles}
        />
        <StatCard
          icon={<Users className="w-5 h-5" />}
          label={t('redis.connectedClients', 'Clients')}
          value={`${redisInfo.clients.connectedClients} / ${redisInfo.clients.maxClients}`}
          styles={styles}
        />
        <StatCard
          icon={<TrendingUp className="w-5 h-5" />}
          label={t('redis.fragmentationRatio', 'Fragmentation')}
          value={redisInfo.memory.memFragmentationRatio.toFixed(2)}
          styles={styles}
        />
      </div>

      {/* Performance Stats - Row 3 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <StatCard
          icon={<Zap className="w-5 h-5" />}
          label={t('redis.opsPerSec', 'Ops/sec')}
          value={redisInfo.stats.instantaneousOpsPerSec.toLocaleString()}
          styles={styles}
        />
        <StatCard
          icon={<Activity className="w-5 h-5" />}
          label={t('redis.totalCommands', 'Total Commands')}
          value={redisInfo.stats.totalCommandsProcessed.toLocaleString()}
          styles={styles}
        />
        <StatCard
          icon={<TrendingUp className="w-5 h-5" />}
          label={t('redis.hitRate', 'Hit Rate')}
          value={`${(redisInfo.stats.hitRate * 100).toFixed(1)}%`}
          styles={styles}
        />
        <StatCard
          icon={<Users className="w-5 h-5" />}
          label={t('redis.totalConnections', 'Total Connections')}
          value={redisInfo.stats.totalConnectionsReceived.toLocaleString()}
          styles={styles}
        />
      </div>

      {/* Keyspace / Database List */}
      <div className={cn('rounded-lg border overflow-hidden', styles.borderColor)}>
        <div className={cn('px-4 py-3 font-medium border-b', styles.bgSecondary, styles.borderColor)}>
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4" />
            {t('redis.databases', 'Databases')}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className={cn('border-b', styles.borderColor, styles.bgSecondary)}>
                <th className="px-4 py-2 text-left text-sm font-medium">
                  {t('redis.database', 'Database')}
                </th>
                <th className="px-4 py-2 text-right text-sm font-medium">
                  {t('redis.keys', 'Keys')}
                </th>
                <th className="px-4 py-2 text-right text-sm font-medium">
                  {t('redis.expires', 'Expires')}
                </th>
                <th className="px-4 py-2 text-center text-sm font-medium">
                  {t('common.action', 'Action')}
                </th>
              </tr>
            </thead>
            <tbody>
              {databases.length > 0 ? (
                databases.map((db) => (
                  <tr
                    key={db.db}
                    className={cn(
                      'border-b',
                      styles.borderColor,
                      styles.hoverBg,
                      db.db === currentDb && 'bg-accent-primary/10'
                    )}
                  >
                    <td className="px-4 py-2 text-sm">
                      <span className="font-mono">DB{db.db}</span>
                      {db.db === currentDb && (
                        <span className="ml-2 px-1.5 py-0.5 text-xs rounded bg-accent-primary text-white">
                          {t('redis.current', 'Current')}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-sm text-right font-mono">
                      {db.keys.toLocaleString()}
                    </td>
                    <td className="px-4 py-2 text-sm text-right font-mono">
                      {db.expires.toLocaleString()}
                    </td>
                    <td className="px-4 py-2 text-center">
                      {db.db !== currentDb && !isClusterMode && (
                        <button
                          onClick={() => onSelectDatabase(db.db)}
                          className="px-2 py-1 text-xs rounded bg-accent-primary/20 text-accent-primary hover:bg-accent-primary/30 transition-colors"
                        >
                          {t('redis.select', 'Select')}
                        </button>
                      )}
                      {isClusterMode && db.db !== 0 && (
                        <span className="text-xs text-gray-400">-</span>
                      )}
                    </td>
                  </tr>
                ))
              ) : isClusterMode ? (
                // Cluster mode: only show DB0
                <tr className={cn('border-b', styles.borderColor, 'bg-accent-primary/10')}>
                  <td className="px-4 py-2 text-sm">
                    <span className="font-mono">DB0</span>
                    <span className="ml-2 px-1.5 py-0.5 text-xs rounded bg-accent-primary text-white">
                      {t('redis.current', 'Current')}
                    </span>
                    <span className="ml-2 px-1.5 py-0.5 text-xs rounded bg-orange-500/20 text-orange-500">
                      {t('redis.clusterMode', '集群')}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-sm text-right font-mono">-</td>
                  <td className="px-4 py-2 text-sm text-right font-mono">-</td>
                  <td className="px-4 py-2 text-center">-</td>
                </tr>
              ) : (
                // Show all 16 databases with 0 keys if no data
                Array.from({ length: 16 }, (_, i) => (
                  <tr
                    key={i}
                    className={cn(
                      'border-b',
                      styles.borderColor,
                      styles.hoverBg,
                      i === currentDb && 'bg-accent-primary/10'
                    )}
                  >
                    <td className="px-4 py-2 text-sm">
                      <span className="font-mono">DB{i}</span>
                      {i === currentDb && (
                        <span className="ml-2 px-1.5 py-0.5 text-xs rounded bg-accent-primary text-white">
                          {t('redis.current', 'Current')}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-sm text-right font-mono text-gray-400">0</td>
                    <td className="px-4 py-2 text-sm text-right font-mono text-gray-400">0</td>
                    <td className="px-4 py-2 text-center">
                      {i !== currentDb && (
                        <button
                          onClick={() => onSelectDatabase(i)}
                          className="px-2 py-1 text-xs rounded bg-accent-primary/20 text-accent-primary hover:bg-accent-primary/30 transition-colors"
                        >
                          {t('redis.select', 'Select')}
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
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
  styles: ThemeStyles
}

function StatCard({ icon, label, value, styles }: StatCardProps) {
  return (
    <div className={cn('p-4 rounded-lg border', styles.bgSecondary, styles.borderColor)}>
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-accent-primary/20 text-accent-primary">{icon}</div>
        <div className="min-w-0 flex-1">
          <div className={cn('text-sm truncate', styles.textSecondary)}>{label}</div>
          <div className="text-xl font-semibold truncate">{value}</div>
        </div>
      </div>
    </div>
  )
}
