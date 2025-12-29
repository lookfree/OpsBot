/**
 * Consumer Group List Component
 *
 * Displays and manages Kafka consumer groups.
 */

import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { RefreshCw, Trash2, Users, Search, ChevronRight, ChevronDown, RotateCcw } from 'lucide-react'
import {
  mwKafkaListConsumerGroups,
  mwKafkaGetConsumerGroup,
  mwKafkaGetConsumerGroupOffsets,
  mwKafkaDeleteConsumerGroup,
  mwKafkaResetConsumerGroupOffsets,
  type ConsumerGroupListItem,
  type ConsumerGroupInfo,
  type ConsumerGroupOffset,
} from '@/services/middleware'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'

interface ThemeStyles {
  bgSecondary: string
  borderColor: string
  textPrimary: string
  textSecondary: string
  hoverBg: string
  isDark: boolean
}

interface ConsumerGroupListProps {
  connectionId: string
  styles: ThemeStyles
}

// State badge colors
const stateColors: Record<string, string> = {
  Stable: 'bg-status-success/20 text-status-success',
  Empty: 'bg-gray-500/20 text-gray-500',
  Dead: 'bg-status-error/20 text-status-error',
  PreparingRebalance: 'bg-status-warning/20 text-status-warning',
  CompletingRebalance: 'bg-status-warning/20 text-status-warning',
  Unknown: 'bg-gray-500/20 text-gray-500',
}

export function ConsumerGroupList({ connectionId, styles }: ConsumerGroupListProps) {
  const { t } = useTranslation()
  const [groups, setGroups] = useState<ConsumerGroupListItem[]>([])
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null)
  const [groupDetail, setGroupDetail] = useState<ConsumerGroupInfo | null>(null)
  const [groupOffsets, setGroupOffsets] = useState<ConsumerGroupOffset[]>([])
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deleteGroupId, setDeleteGroupId] = useState('')
  // Reset offset state
  const [resetDialogOpen, setResetDialogOpen] = useState(false)
  const [resetGroupId, setResetGroupId] = useState('')
  const [resetTopic, setResetTopic] = useState('')
  const [resetType, setResetType] = useState<'earliest' | 'latest' | 'timestamp' | 'offset'>('earliest')
  const [resetValue, setResetValue] = useState('')
  const [resetLoading, setResetLoading] = useState(false)
  const [availableTopics, setAvailableTopics] = useState<string[]>([])

  // Load groups
  const loadGroups = useCallback(async () => {
    setLoading(true)
    try {
      const result = await mwKafkaListConsumerGroups(connectionId)
      setGroups(result)
    } catch (err) {
      console.error('Failed to load consumer groups:', err)
    } finally {
      setLoading(false)
    }
  }, [connectionId])

  useEffect(() => {
    loadGroups()
  }, [loadGroups])

  // Filter groups
  const filteredGroups = groups.filter((group) => {
    if (searchQuery && !group.groupId.toLowerCase().includes(searchQuery.toLowerCase())) return false
    return true
  })

  // Toggle group expansion
  const handleToggleGroup = useCallback(async (groupId: string) => {
    if (expandedGroup === groupId) {
      setExpandedGroup(null)
      setGroupDetail(null)
      setGroupOffsets([])
      return
    }

    setExpandedGroup(groupId)
    try {
      const [detail, offsets] = await Promise.all([
        mwKafkaGetConsumerGroup(connectionId, groupId),
        mwKafkaGetConsumerGroupOffsets(connectionId, groupId),
      ])
      setGroupDetail(detail)
      setGroupOffsets(offsets)
    } catch (err) {
      console.error('Failed to get group detail:', err)
    }
  }, [connectionId, expandedGroup])

  // Handle delete group
  const handleDeleteGroup = useCallback(async () => {
    if (!deleteGroupId) return
    try {
      await mwKafkaDeleteConsumerGroup(connectionId, deleteGroupId)
      setDeleteConfirmOpen(false)
      setDeleteGroupId('')
      loadGroups()
      if (expandedGroup === deleteGroupId) {
        setExpandedGroup(null)
        setGroupDetail(null)
        setGroupOffsets([])
      }
    } catch (err) {
      console.error('Failed to delete consumer group:', err)
    }
  }, [connectionId, deleteGroupId, loadGroups, expandedGroup])

  // Open reset dialog
  const handleOpenResetDialog = useCallback(async (groupId: string) => {
    setResetGroupId(groupId)
    setResetType('earliest')
    setResetValue('')
    setResetDialogOpen(true)

    // Get topics from offsets
    try {
      const offsets = await mwKafkaGetConsumerGroupOffsets(connectionId, groupId)
      const topics = [...new Set(offsets.map(o => o.topic))]
      setAvailableTopics(topics)
      if (topics.length > 0) {
        setResetTopic(topics[0])
      }
    } catch (err) {
      console.error('Failed to get topics for reset:', err)
    }
  }, [connectionId])

  // Handle reset offsets
  const handleResetOffsets = useCallback(async () => {
    if (!resetGroupId || !resetTopic) return

    setResetLoading(true)
    try {
      let resetTypeValue = resetType
      if (resetType === 'timestamp' || resetType === 'offset') {
        resetTypeValue = resetValue as 'timestamp' | 'offset'
      }
      await mwKafkaResetConsumerGroupOffsets(connectionId, resetGroupId, resetTopic, resetTypeValue)
      setResetDialogOpen(false)
      // Refresh offsets if group is expanded
      if (expandedGroup === resetGroupId) {
        const offsets = await mwKafkaGetConsumerGroupOffsets(connectionId, resetGroupId)
        setGroupOffsets(offsets)
      }
    } catch (err) {
      console.error('Failed to reset offsets:', err)
    } finally {
      setResetLoading(false)
    }
  }, [connectionId, resetGroupId, resetTopic, resetType, resetValue, expandedGroup])

  // Calculate total lag
  const getTotalLag = (offsets: ConsumerGroupOffset[]) => {
    return offsets.reduce((sum, o) => sum + o.lag, 0)
  }

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className={cn('flex items-center gap-2 p-3 border-b', styles.borderColor, styles.bgSecondary)}>
        <div className="relative flex-1">
          <Search className={cn('absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4', styles.textSecondary)} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('kafka.searchGroups')}
            className={cn(
              'w-full pl-9 pr-3 py-1.5 rounded text-sm',
              'border bg-transparent',
              styles.borderColor,
              'focus:outline-none focus:border-accent-primary'
            )}
          />
        </div>
        <button
          onClick={loadGroups}
          className={cn('p-2 rounded', styles.hoverBg)}
          title={t('common.refresh')}
        >
          <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
        </button>
      </div>

      {/* Groups List */}
      <div className="flex-1 overflow-auto">
        {filteredGroups.map((group) => (
          <div key={group.groupId} className={cn('border-b', styles.borderColor)}>
            {/* Group Header */}
            <div
              onClick={() => handleToggleGroup(group.groupId)}
              className={cn('flex items-center gap-3 px-4 py-3 cursor-pointer', styles.hoverBg)}
            >
              {expandedGroup === group.groupId ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
              <Users className="w-4 h-4 text-accent-primary" />
              <span className="font-mono flex-1">{group.groupId}</span>
              <span className={cn('px-2 py-0.5 text-xs rounded', stateColors[group.state] || stateColors.Unknown)}>
                {group.state}
              </span>
              <span className={cn('text-sm', styles.textSecondary)}>
                {group.memberCount} {t('kafka.members')}
              </span>
              {group.state !== 'Dead' && (
                <>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleOpenResetDialog(group.groupId)
                    }}
                    className={cn('p-1.5 rounded', styles.hoverBg)}
                    title={t('kafka.resetOffsets')}
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setDeleteGroupId(group.groupId)
                      setDeleteConfirmOpen(true)
                    }}
                    className="p-1.5 rounded hover:bg-status-error/20 text-status-error"
                    title={t('common.delete')}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </>
              )}
            </div>

            {/* Group Detail */}
            {expandedGroup === group.groupId && groupDetail && (
              <div className={cn('px-4 pb-4 pl-12', styles.bgSecondary)}>
                {/* Members */}
                {groupDetail.members.length > 0 && (
                  <div className="mb-4">
                    <h4 className="text-sm font-medium mb-2">{t('kafka.members')}</h4>
                    <div className={cn('rounded border overflow-hidden', styles.borderColor)}>
                      <table className="w-full text-sm">
                        <thead>
                          <tr className={cn('border-b', styles.borderColor)}>
                            <th className="px-3 py-2 text-left">{t('kafka.clientId')}</th>
                            <th className="px-3 py-2 text-left">{t('kafka.host')}</th>
                            <th className="px-3 py-2 text-left">{t('kafka.assignments')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {groupDetail.members.map((member) => (
                            <tr key={member.memberId} className={cn('border-b', styles.borderColor)}>
                              <td className="px-3 py-2 font-mono">{member.clientId}</td>
                              <td className="px-3 py-2">{member.clientHost}</td>
                              <td className="px-3 py-2">
                                <div className="flex flex-wrap gap-1">
                                  {member.assignments.slice(0, 5).map((a, i) => (
                                    <span
                                      key={i}
                                      className={cn('px-1.5 py-0.5 text-xs rounded', styles.isDark ? 'bg-dark-bg-hover' : 'bg-light-bg-hover')}
                                    >
                                      {a.topic}:{a.partition}
                                    </span>
                                  ))}
                                  {member.assignments.length > 5 && (
                                    <span className={cn('text-xs', styles.textSecondary)}>
                                      {t('kafka.moreAssignments', { count: member.assignments.length - 5 })}
                                    </span>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Offsets */}
                {groupOffsets.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-sm font-medium">{t('kafka.offsets')}</h4>
                      <span className={cn('text-sm', styles.textSecondary)}>
                        {t('kafka.totalLag')}: <span className="font-mono text-status-warning">{getTotalLag(groupOffsets).toLocaleString()}</span>
                      </span>
                    </div>
                    <div className={cn('rounded border overflow-hidden', styles.borderColor)}>
                      <table className="w-full text-sm">
                        <thead>
                          <tr className={cn('border-b', styles.borderColor)}>
                            <th className="px-3 py-2 text-left">{t('kafka.topic')}</th>
                            <th className="px-3 py-2 text-center">{t('kafka.partition')}</th>
                            <th className="px-3 py-2 text-right">{t('kafka.currentOffset')}</th>
                            <th className="px-3 py-2 text-right">{t('kafka.logEndOffset')}</th>
                            <th className="px-3 py-2 text-right">{t('kafka.lag')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {groupOffsets.map((offset, i) => (
                            <tr key={i} className={cn('border-b', styles.borderColor)}>
                              <td className="px-3 py-2 font-mono">{offset.topic}</td>
                              <td className="px-3 py-2 text-center">{offset.partition}</td>
                              <td className="px-3 py-2 text-right font-mono">{offset.currentOffset.toLocaleString()}</td>
                              <td className="px-3 py-2 text-right font-mono">{offset.logEndOffset.toLocaleString()}</td>
                              <td className="px-3 py-2 text-right font-mono">
                                <span className={offset.lag > 0 ? 'text-status-warning' : ''}>
                                  {offset.lag.toLocaleString()}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

        {filteredGroups.length === 0 && (
          <div className={cn('flex items-center justify-center py-12', styles.textSecondary)}>
            {loading ? t('common.loading') : t('kafka.noConsumerGroups')}
          </div>
        )}
      </div>

      {/* Delete Confirm Dialog */}
      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title={t('kafka.deleteConsumerGroup')}
        description={t('kafka.deleteConsumerGroupConfirm', { groupId: deleteGroupId })}
        confirmText={t('common.delete')}
        variant="danger"
        onConfirm={handleDeleteGroup}
      />

      {/* Reset Offset Dialog */}
      {resetDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className={cn('w-96 rounded-lg p-6 shadow-lg', styles.isDark ? 'bg-dark-bg-secondary' : 'bg-light-bg-secondary')}>
            <h3 className="text-lg font-semibold mb-4">{t('kafka.resetOffsets')}</h3>
            <p className={cn('text-sm mb-4', styles.textSecondary)}>
              {t('kafka.resetOffsetsDesc', { groupId: resetGroupId })}
            </p>

            {/* Topic Selection */}
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1">{t('kafka.topic')}</label>
              <select
                value={resetTopic}
                onChange={(e) => setResetTopic(e.target.value)}
                className={cn(
                  'w-full px-3 py-2 rounded border text-sm',
                  styles.borderColor,
                  'bg-transparent focus:outline-none focus:border-accent-primary'
                )}
              >
                {availableTopics.map((topic) => (
                  <option key={topic} value={topic}>
                    {topic}
                  </option>
                ))}
              </select>
            </div>

            {/* Reset Type */}
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1">{t('kafka.resetType')}</label>
              <div className="space-y-2">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="resetType"
                    checked={resetType === 'earliest'}
                    onChange={() => setResetType('earliest')}
                    className="accent-accent-primary"
                  />
                  <span className="text-sm">{t('kafka.resetToEarliest')}</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="resetType"
                    checked={resetType === 'latest'}
                    onChange={() => setResetType('latest')}
                    className="accent-accent-primary"
                  />
                  <span className="text-sm">{t('kafka.resetToLatest')}</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="resetType"
                    checked={resetType === 'timestamp'}
                    onChange={() => setResetType('timestamp')}
                    className="accent-accent-primary"
                  />
                  <span className="text-sm">{t('kafka.resetToTimestamp')}</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="resetType"
                    checked={resetType === 'offset'}
                    onChange={() => setResetType('offset')}
                    className="accent-accent-primary"
                  />
                  <span className="text-sm">{t('kafka.resetToOffset')}</span>
                </label>
              </div>
            </div>

            {/* Value Input for timestamp/offset */}
            {(resetType === 'timestamp' || resetType === 'offset') && (
              <div className="mb-4">
                <label className="block text-sm font-medium mb-1">
                  {resetType === 'timestamp' ? t('kafka.timestamp') : t('kafka.offset')}
                </label>
                <input
                  type="text"
                  value={resetValue}
                  onChange={(e) => setResetValue(e.target.value)}
                  placeholder={resetType === 'timestamp' ? '1703980800000' : '0'}
                  className={cn(
                    'w-full px-3 py-2 rounded border text-sm font-mono',
                    styles.borderColor,
                    'bg-transparent focus:outline-none focus:border-accent-primary'
                  )}
                />
                <p className={cn('text-xs mt-1', styles.textSecondary)}>
                  {resetType === 'timestamp' ? t('kafka.timestampHint') : t('kafka.offsetHint')}
                </p>
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setResetDialogOpen(false)}
                className={cn('px-4 py-2 rounded text-sm', styles.hoverBg)}
                disabled={resetLoading}
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleResetOffsets}
                disabled={resetLoading || !resetTopic || ((resetType === 'timestamp' || resetType === 'offset') && !resetValue)}
                className={cn(
                  'px-4 py-2 rounded text-sm bg-accent-primary text-white',
                  'hover:bg-accent-primary/80 disabled:opacity-50'
                )}
              >
                {resetLoading ? t('common.loading') : t('kafka.resetOffsets')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
