/**
 * Topic Detail Panel Component
 *
 * Displays detailed information about a selected Kafka topic including partitions.
 */

import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { Layers, Server } from 'lucide-react'
import type { TopicInfo, PartitionInfo } from '@/services/middleware'

interface ThemeStyles {
  bgSecondary: string
  borderColor: string
  textPrimary: string
  textSecondary: string
  hoverBg: string
  isDark: boolean
}

interface TopicDetailPanelProps {
  topic: TopicInfo
  connectionId: string
  styles: ThemeStyles
}

export function TopicDetailPanel({ topic, styles }: TopicDetailPanelProps) {
  const { t } = useTranslation()

  // Calculate total messages
  const totalMessages = topic.partitions.reduce((sum, p) => sum + (p.latestOffset - p.earliestOffset), 0)

  return (
    <div className={cn('h-full overflow-auto p-4', styles.textPrimary)}>
      {/* Topic Header */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold mb-2">{topic.name}</h3>
        <div className="flex items-center gap-4 text-sm">
          <span className={styles.textSecondary}>
            {t('kafka.partitions')}: <span className="font-medium">{topic.partitions.length}</span>
          </span>
          <span className={styles.textSecondary}>
            {t('kafka.replication')}: <span className="font-medium">{topic.replicationFactor}</span>
          </span>
          <span className={styles.textSecondary}>
            {t('kafka.totalMessages')}: <span className="font-medium">{totalMessages.toLocaleString()}</span>
          </span>
          {topic.isInternal && (
            <span className="px-2 py-0.5 text-xs rounded bg-yellow-500/20 text-yellow-600">
              {t('kafka.internal')}
            </span>
          )}
        </div>
      </div>

      {/* Partitions Table */}
      <div className={cn('rounded-lg border', styles.borderColor)}>
        <div className={cn('px-4 py-3 font-medium border-b flex items-center gap-2', styles.bgSecondary, styles.borderColor)}>
          <Layers className="w-4 h-4" />
          {t('kafka.partitionDetails')}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className={cn('border-b', styles.borderColor, styles.bgSecondary)}>
                <th className="px-4 py-2 text-left text-sm font-medium">{t('kafka.partitionId')}</th>
                <th className="px-4 py-2 text-left text-sm font-medium">{t('kafka.leader')}</th>
                <th className="px-4 py-2 text-left text-sm font-medium">{t('kafka.replicas')}</th>
                <th className="px-4 py-2 text-left text-sm font-medium">{t('kafka.isr')}</th>
                <th className="px-4 py-2 text-right text-sm font-medium">{t('kafka.earliestOffset')}</th>
                <th className="px-4 py-2 text-right text-sm font-medium">{t('kafka.latestOffset')}</th>
                <th className="px-4 py-2 text-right text-sm font-medium">{t('kafka.messages')}</th>
              </tr>
            </thead>
            <tbody>
              {topic.partitions
                .sort((a, b) => a.partitionId - b.partitionId)
                .map((partition: PartitionInfo) => (
                  <tr key={partition.partitionId} className={cn('border-b', styles.borderColor, styles.hoverBg)}>
                    <td className="px-4 py-2 text-sm font-mono">{partition.partitionId}</td>
                    <td className="px-4 py-2 text-sm">
                      <div className="flex items-center gap-1">
                        <Server className="w-3 h-3 text-accent-primary" />
                        {partition.leader}
                      </div>
                    </td>
                    <td className="px-4 py-2 text-sm">
                      <div className="flex gap-1">
                        {partition.replicas.map((r) => (
                          <span
                            key={r}
                            className={cn(
                              'px-1.5 py-0.5 text-xs rounded',
                              r === partition.leader
                                ? 'bg-accent-primary/20 text-accent-primary'
                                : styles.isDark
                                  ? 'bg-dark-bg-hover'
                                  : 'bg-light-bg-hover'
                            )}
                          >
                            {r}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-2 text-sm">
                      <div className="flex gap-1">
                        {partition.isr.map((r) => (
                          <span
                            key={r}
                            className={cn(
                              'px-1.5 py-0.5 text-xs rounded',
                              'bg-status-success/20 text-status-success'
                            )}
                          >
                            {r}
                          </span>
                        ))}
                        {partition.replicas.length !== partition.isr.length && (
                          <span className="px-1.5 py-0.5 text-xs rounded bg-status-warning/20 text-status-warning">
                            {t('kafka.underReplicated')}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2 text-sm text-right font-mono">
                      {partition.earliestOffset.toLocaleString()}
                    </td>
                    <td className="px-4 py-2 text-sm text-right font-mono">
                      {partition.latestOffset.toLocaleString()}
                    </td>
                    <td className="px-4 py-2 text-sm text-right font-mono">
                      {(partition.latestOffset - partition.earliestOffset).toLocaleString()}
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
