/**
 * Cluster Overview Component
 *
 * Displays Kafka cluster information including brokers and basic statistics.
 */

import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { RefreshCw, Server, Database, Users, Crown } from 'lucide-react'
import type { ClusterInfo, BrokerInfo } from '@/services/middleware'

interface ThemeStyles {
  bgSecondary: string
  borderColor: string
  textPrimary: string
  textSecondary: string
  hoverBg: string
  isDark: boolean
}

interface ClusterOverviewProps {
  clusterInfo: ClusterInfo
  onRefresh: () => void
  styles: ThemeStyles
}

export function ClusterOverview({ clusterInfo, onRefresh, styles }: ClusterOverviewProps) {
  const { t } = useTranslation()

  return (
    <div className={cn('h-full overflow-auto p-4', styles.textPrimary)}>
      {/* Header with Refresh */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold">{t('kafka.clusterInfo')}</h2>
        <button
          onClick={onRefresh}
          className={cn(
            'p-2 rounded',
            styles.hoverBg,
            'transition-colors'
          )}
          title={t('common.refresh')}
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <StatCard
          icon={<Server className="w-5 h-5" />}
          label={t('kafka.brokers')}
          value={clusterInfo.brokers.length}
          styles={styles}
        />
        <StatCard
          icon={<Database className="w-5 h-5" />}
          label={t('kafka.topics')}
          value={clusterInfo.topicCount}
          styles={styles}
        />
        <StatCard
          icon={<Crown className="w-5 h-5" />}
          label={t('kafka.controllerId')}
          value={clusterInfo.controllerId < 0 ? t('common.unknown', 'N/A') : clusterInfo.controllerId}
          styles={styles}
        />
      </div>

      {/* Cluster ID */}
      <div className={cn('p-4 rounded-lg mb-6', styles.bgSecondary)}>
        <div className={cn('text-sm mb-1', styles.textSecondary)}>{t('kafka.clusterId')}</div>
        <div className="font-mono text-sm">{clusterInfo.clusterId || '-'}</div>
      </div>

      {/* Brokers Table */}
      <div className={cn('rounded-lg border overflow-hidden', styles.borderColor)}>
        <div className={cn('px-4 py-3 font-medium border-b', styles.bgSecondary, styles.borderColor)}>
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4" />
            {t('kafka.brokerList')}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className={cn('border-b', styles.borderColor, styles.bgSecondary)}>
                <th className="px-4 py-2 text-left text-sm font-medium">{t('kafka.brokerId')}</th>
                <th className="px-4 py-2 text-left text-sm font-medium">{t('kafka.host')}</th>
                <th className="px-4 py-2 text-left text-sm font-medium">{t('kafka.port')}</th>
                <th className="px-4 py-2 text-left text-sm font-medium">{t('kafka.role')}</th>
              </tr>
            </thead>
            <tbody>
              {clusterInfo.brokers.map((broker: BrokerInfo) => (
                <tr key={broker.id} className={cn('border-b', styles.borderColor, styles.hoverBg)}>
                  <td className="px-4 py-2 text-sm font-mono">{broker.id}</td>
                  <td className="px-4 py-2 text-sm">{broker.host}</td>
                  <td className="px-4 py-2 text-sm">{broker.port}</td>
                  <td className="px-4 py-2 text-sm">
                    {broker.isController ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-accent-primary/20 text-accent-primary text-xs">
                        <Crown className="w-3 h-3" />
                        {t('kafka.controller')}
                      </span>
                    ) : (
                      <span className={cn('text-xs', styles.textSecondary)}>{t('kafka.broker')}</span>
                    )}
                  </td>
                </tr>
              ))}
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
  value: number | string
  styles: ThemeStyles
}

function StatCard({ icon, label, value, styles }: StatCardProps) {
  return (
    <div className={cn('p-4 rounded-lg border', styles.bgSecondary, styles.borderColor)}>
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-accent-primary/20 text-accent-primary">
          {icon}
        </div>
        <div>
          <div className={cn('text-sm', styles.textSecondary)}>{label}</div>
          <div className="text-2xl font-semibold">{value}</div>
        </div>
      </div>
    </div>
  )
}
