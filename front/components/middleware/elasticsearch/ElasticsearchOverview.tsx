/**
 * Elasticsearch Overview Component
 *
 * Displays cluster health, statistics, nodes, and shards information.
 */

import { useState, useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import {
  RefreshCw,
  Server,
  Database,
  HardDrive,
  Activity,
  Zap,
  Box,
  AlertTriangle,
  CheckCircle,
  XCircle,
} from 'lucide-react'
import {
  mwEsGetShards,
  type EsClusterHealth,
  type EsClusterStats,
  type EsNodeInfo,
  type EsShardInfo,
} from '@/services/middleware'

interface ThemeStyles {
  bgSecondary: string
  borderColor: string
  textPrimary: string
  textSecondary: string
  hoverBg: string
  isDark: boolean
}

interface ElasticsearchOverviewProps {
  connectionId: string
  clusterHealth: EsClusterHealth
  clusterStats: EsClusterStats
  nodes: EsNodeInfo[]
  onRefresh: () => void
  styles: ThemeStyles
}

export function ElasticsearchOverview({
  connectionId,
  clusterHealth,
  clusterStats,
  nodes,
  onRefresh,
  styles,
}: ElasticsearchOverviewProps) {
  const { t } = useTranslation()
  const [shards, setShards] = useState<EsShardInfo[]>([])
  const [showShards, setShowShards] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  // Load shards when toggled
  const loadShards = useCallback(async () => {
    if (shards.length > 0) return
    setIsLoading(true)
    try {
      const shardList = await mwEsGetShards(connectionId)
      setShards(shardList)
    } catch (err) {
      console.error('Failed to load shards:', err)
    } finally {
      setIsLoading(false)
    }
  }, [connectionId, shards.length])

  useEffect(() => {
    if (showShards) {
      loadShards()
    }
  }, [showShards, loadShards])

  // Get status icon
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'green':
        return <CheckCircle className="w-5 h-5 text-green-500" />
      case 'yellow':
        return <AlertTriangle className="w-5 h-5 text-yellow-500" />
      case 'red':
        return <XCircle className="w-5 h-5 text-red-500" />
      default:
        return <Activity className="w-5 h-5" />
    }
  }

  // Get status color class
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'green':
        return 'text-green-500'
      case 'yellow':
        return 'text-yellow-500'
      case 'red':
        return 'text-red-500'
      default:
        return styles.textSecondary
    }
  }

  return (
    <div className={cn('h-full overflow-auto p-4', styles.textPrimary)}>
      {/* Header with Refresh */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold">{t('elasticsearch.clusterInfo', 'Cluster Info')}</h2>
        <button
          onClick={onRefresh}
          className={cn('p-2 rounded', styles.hoverBg, 'transition-colors')}
          title={t('common.refresh')}
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Cluster Health - Row 1 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <StatCard
          icon={getStatusIcon(clusterHealth.status)}
          label={t('elasticsearch.status', 'Status')}
          value={clusterHealth.status.toUpperCase()}
          valueClassName={getStatusColor(clusterHealth.status)}
          styles={styles}
        />
        <StatCard
          icon={<Server className="w-5 h-5" />}
          label={t('elasticsearch.nodesCount', 'Nodes')}
          value={`${clusterHealth.numberOfNodes} / ${clusterHealth.numberOfDataNodes} data`}
          styles={styles}
        />
        <StatCard
          icon={<Database className="w-5 h-5" />}
          label={t('elasticsearch.indices', 'Indices')}
          value={clusterStats.indicesCount.toLocaleString()}
          styles={styles}
        />
        <StatCard
          icon={<Activity className="w-5 h-5" />}
          label={t('elasticsearch.documents', 'Documents')}
          value={formatNumber(clusterStats.docsCount)}
          styles={styles}
        />
      </div>

      {/* Shards & Storage - Row 2 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <StatCard
          icon={<Box className="w-5 h-5" />}
          label={t('elasticsearch.activeShards', 'Active Shards')}
          value={`${clusterHealth.activeShards} / ${clusterHealth.activePrimaryShards} primary`}
          styles={styles}
        />
        <StatCard
          icon={<AlertTriangle className="w-5 h-5" />}
          label={t('elasticsearch.unassignedShards', 'Unassigned')}
          value={clusterHealth.unassignedShards}
          valueClassName={clusterHealth.unassignedShards > 0 ? 'text-yellow-500' : ''}
          styles={styles}
        />
        <StatCard
          icon={<HardDrive className="w-5 h-5" />}
          label={t('elasticsearch.storeSize', 'Store Size')}
          value={clusterStats.storeSize}
          styles={styles}
        />
        <StatCard
          icon={<Zap className="w-5 h-5" />}
          label={t('elasticsearch.shardsPercent', 'Active %')}
          value={`${clusterHealth.activeShardsPercentAsNumber.toFixed(1)}%`}
          styles={styles}
        />
      </div>

      {/* Nodes List */}
      <div className={cn('rounded-lg border overflow-hidden mb-6', styles.borderColor)}>
        <div className={cn('px-4 py-3 font-medium border-b flex items-center gap-2', styles.bgSecondary, styles.borderColor)}>
          <Server className="w-4 h-4" />
          {t('elasticsearch.nodesList', 'Nodes')} ({nodes.length})
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className={cn('border-b', styles.borderColor, styles.bgSecondary)}>
                <th className="px-4 py-2 text-left text-sm font-medium">{t('elasticsearch.nodeName', 'Name')}</th>
                <th className="px-4 py-2 text-left text-sm font-medium">{t('elasticsearch.nodeIp', 'IP')}</th>
                <th className="px-4 py-2 text-left text-sm font-medium">{t('elasticsearch.nodeRoles', 'Roles')}</th>
                <th className="px-4 py-2 text-right text-sm font-medium">{t('elasticsearch.heapUsed', 'Heap')}</th>
                <th className="px-4 py-2 text-right text-sm font-medium">{t('elasticsearch.diskUsed', 'Disk')}</th>
                <th className="px-4 py-2 text-right text-sm font-medium">{t('elasticsearch.cpu', 'CPU')}</th>
              </tr>
            </thead>
            <tbody>
              {nodes.map((node) => (
                <tr key={node.id} className={cn('border-b', styles.borderColor, styles.hoverBg)}>
                  <td className="px-4 py-2 text-sm">
                    <div className="flex items-center gap-2">
                      {node.master && <span className="text-yellow-500" title="Master">*</span>}
                      <span className="font-mono">{node.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2 text-sm font-mono">{node.ip}</td>
                  <td className="px-4 py-2 text-sm">
                    <div className="flex flex-wrap gap-1">
                      {node.roles.map((role) => (
                        <span
                          key={role}
                          className="px-1.5 py-0.5 text-xs rounded bg-accent-primary/20 text-accent-primary"
                        >
                          {role}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-2 text-sm text-right">
                    {node.heapPercent != null ? (
                      <ProgressBar percent={node.heapPercent} label={`${node.heapPercent}%`} />
                    ) : (
                      <span className={styles.textSecondary}>-</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-sm text-right">
                    {node.diskPercent != null ? (
                      <ProgressBar percent={node.diskPercent} label={`${node.diskPercent.toFixed(0)}%`} />
                    ) : (
                      <span className={styles.textSecondary}>-</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-sm text-right">
                    {node.cpuPercent != null ? `${node.cpuPercent}%` : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Shards List (Collapsible) */}
      <div className={cn('rounded-lg border overflow-hidden', styles.borderColor)}>
        <button
          onClick={() => setShowShards(!showShards)}
          className={cn(
            'w-full px-4 py-3 font-medium border-b flex items-center justify-between',
            styles.bgSecondary,
            styles.borderColor,
            styles.hoverBg
          )}
        >
          <div className="flex items-center gap-2">
            <Box className="w-4 h-4" />
            {t('elasticsearch.shardsList', 'Shards')}
          </div>
          <span className={cn('text-sm', styles.textSecondary)}>
            {showShards ? t('common.collapse', 'Collapse') : t('common.expand', 'Expand')}
          </span>
        </button>
        {showShards && (
          <div className="overflow-x-auto max-h-96">
            {isLoading ? (
              <div className="p-4 text-center">
                <span className={styles.textSecondary}>{t('common.loading', 'Loading...')}</span>
              </div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className={cn('border-b sticky top-0', styles.borderColor, styles.bgSecondary)}>
                    <th className="px-4 py-2 text-left text-sm font-medium">{t('elasticsearch.index', 'Index')}</th>
                    <th className="px-4 py-2 text-center text-sm font-medium">{t('elasticsearch.shard', 'Shard')}</th>
                    <th className="px-4 py-2 text-center text-sm font-medium">{t('elasticsearch.type', 'Type')}</th>
                    <th className="px-4 py-2 text-center text-sm font-medium">{t('elasticsearch.state', 'State')}</th>
                    <th className="px-4 py-2 text-right text-sm font-medium">{t('elasticsearch.docs', 'Docs')}</th>
                    <th className="px-4 py-2 text-right text-sm font-medium">{t('elasticsearch.size', 'Size')}</th>
                    <th className="px-4 py-2 text-left text-sm font-medium">{t('elasticsearch.node', 'Node')}</th>
                  </tr>
                </thead>
                <tbody>
                  {shards.map((shard, idx) => (
                    <tr key={`${shard.index}-${shard.shard}-${shard.primary}-${idx}`} className={cn('border-b', styles.borderColor, styles.hoverBg)}>
                      <td className="px-4 py-2 text-sm font-mono">{shard.index}</td>
                      <td className="px-4 py-2 text-sm text-center">{shard.shard}</td>
                      <td className="px-4 py-2 text-sm text-center">
                        <span className={cn('px-1.5 py-0.5 text-xs rounded', shard.primary ? 'bg-blue-500/20 text-blue-500' : 'bg-gray-500/20 text-gray-500')}>
                          {shard.primary ? 'P' : 'R'}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-sm text-center">
                        <ShardStateTag state={shard.state} />
                      </td>
                      <td className="px-4 py-2 text-sm text-right font-mono">{shard.docs?.toLocaleString() ?? '-'}</td>
                      <td className="px-4 py-2 text-sm text-right">{shard.size ?? '-'}</td>
                      <td className="px-4 py-2 text-sm font-mono">{shard.node ?? '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// Stat Card Component
interface StatCardProps {
  icon: React.ReactNode
  label: string
  value: string | number
  valueClassName?: string
  styles: ThemeStyles
}

function StatCard({ icon, label, value, valueClassName, styles }: StatCardProps) {
  return (
    <div className={cn('p-4 rounded-lg border', styles.bgSecondary, styles.borderColor)}>
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-accent-primary/20 text-accent-primary">{icon}</div>
        <div className="min-w-0 flex-1">
          <div className={cn('text-sm truncate', styles.textSecondary)}>{label}</div>
          <div className={cn('text-xl font-semibold truncate', valueClassName)}>{value}</div>
        </div>
      </div>
    </div>
  )
}

// Progress Bar Component
interface ProgressBarProps {
  percent: number
  label: string
}

function ProgressBar({ percent, label }: ProgressBarProps) {
  const getColor = () => {
    if (percent >= 80) return 'bg-red-500'
    if (percent >= 60) return 'bg-yellow-500'
    return 'bg-green-500'
  }

  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <div className={cn('h-full rounded-full', getColor())} style={{ width: `${percent}%` }} />
      </div>
      <span className="text-xs">{label}</span>
    </div>
  )
}

// Shard State Tag Component
function ShardStateTag({ state }: { state: string }) {
  const getClassName = () => {
    switch (state.toUpperCase()) {
      case 'STARTED':
        return 'bg-green-500/20 text-green-500'
      case 'RELOCATING':
        return 'bg-blue-500/20 text-blue-500'
      case 'INITIALIZING':
        return 'bg-yellow-500/20 text-yellow-500'
      case 'UNASSIGNED':
        return 'bg-red-500/20 text-red-500'
      default:
        return 'bg-gray-500/20 text-gray-500'
    }
  }

  return <span className={cn('px-1.5 py-0.5 text-xs rounded', getClassName())}>{state}</span>
}

// Format large numbers
function formatNumber(num: number): string {
  if (num >= 1_000_000_000) return `${(num / 1_000_000_000).toFixed(1)}B`
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`
  return num.toLocaleString()
}
