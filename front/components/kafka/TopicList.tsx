/**
 * Topic List Component
 *
 * Displays and manages Kafka topics with CRUD operations.
 */

import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { RefreshCw, Plus, Trash2, Settings, Eye, Search, Database } from 'lucide-react'
import {
  mwKafkaListTopics,
  mwKafkaGetTopic,
  mwKafkaDeleteTopic,
  type TopicListItem,
  type TopicInfo,
} from '@/services/middleware'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { CreateTopicDialog } from './CreateTopicDialog'
import { TopicConfigDialog } from './TopicConfigDialog'
import { TopicDetailPanel } from './TopicDetailPanel'

interface ThemeStyles {
  bgSecondary: string
  borderColor: string
  textPrimary: string
  textSecondary: string
  hoverBg: string
  isDark: boolean
}

interface TopicListProps {
  connectionId: string
  onViewMessages: (topicName: string) => void
  styles: ThemeStyles
}

export function TopicList({ connectionId, onViewMessages, styles }: TopicListProps) {
  const { t } = useTranslation()
  const [topics, setTopics] = useState<TopicListItem[]>([])
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [showInternalTopics, setShowInternalTopics] = useState(false)
  const [selectedTopic, setSelectedTopic] = useState<TopicInfo | null>(null)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [configDialogOpen, setConfigDialogOpen] = useState(false)
  const [configTopicName, setConfigTopicName] = useState('')
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deleteTopicName, setDeleteTopicName] = useState('')

  // Load topics
  const loadTopics = useCallback(async () => {
    setLoading(true)
    try {
      const result = await mwKafkaListTopics(connectionId)
      setTopics(result)
    } catch (err) {
      console.error('Failed to load topics:', err)
    } finally {
      setLoading(false)
    }
  }, [connectionId])

  useEffect(() => {
    loadTopics()
  }, [loadTopics])

  // Filter topics
  const filteredTopics = topics.filter((topic) => {
    if (!showInternalTopics && topic.isInternal) return false
    if (searchQuery && !topic.name.toLowerCase().includes(searchQuery.toLowerCase())) return false
    return true
  })

  // Handle topic selection for detail view
  const handleSelectTopic = useCallback(async (topicName: string) => {
    try {
      const info = await mwKafkaGetTopic(connectionId, topicName)
      setSelectedTopic(info)
    } catch (err) {
      console.error('Failed to get topic info:', err)
    }
  }, [connectionId])

  // Handle delete topic
  const handleDeleteTopic = useCallback(async () => {
    if (!deleteTopicName) return
    try {
      await mwKafkaDeleteTopic(connectionId, deleteTopicName)
      setDeleteConfirmOpen(false)
      setDeleteTopicName('')
      loadTopics()
      if (selectedTopic?.name === deleteTopicName) {
        setSelectedTopic(null)
      }
    } catch (err) {
      console.error('Failed to delete topic:', err)
    }
  }, [connectionId, deleteTopicName, loadTopics, selectedTopic])

  // Handle open config dialog
  const handleOpenConfig = useCallback((topicName: string) => {
    setConfigTopicName(topicName)
    setConfigDialogOpen(true)
  }, [])

  return (
    <div className="flex h-full">
      {/* Topic List */}
      <div className={cn('w-1/2 flex flex-col border-r', styles.borderColor)}>
        {/* Toolbar */}
        <div className={cn('flex items-center gap-2 p-3 border-b', styles.borderColor, styles.bgSecondary)}>
          <div className="relative flex-1">
            <Search className={cn('absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4', styles.textSecondary)} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('kafka.searchTopics')}
              className={cn(
                'w-full pl-9 pr-3 py-1.5 rounded text-sm',
                'border bg-transparent',
                styles.borderColor,
                'focus:outline-none focus:border-accent-primary'
              )}
            />
          </div>
          <label className={cn('flex items-center gap-2 text-sm', styles.textSecondary)}>
            <input
              type="checkbox"
              checked={showInternalTopics}
              onChange={(e) => setShowInternalTopics(e.target.checked)}
              className="rounded"
            />
            {t('kafka.showInternal')}
          </label>
          <button
            onClick={loadTopics}
            className={cn('p-2 rounded', styles.hoverBg)}
            title={t('common.refresh')}
          >
            <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
          </button>
          <button
            onClick={() => setCreateDialogOpen(true)}
            className="p-2 rounded bg-accent-primary text-white hover:bg-accent-hover"
            title={t('kafka.createTopic')}
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {/* Topics Table */}
        <div className="flex-1 overflow-auto">
          <table className="w-full">
            <thead className={cn('sticky top-0', styles.bgSecondary)}>
              <tr className={cn('border-b', styles.borderColor)}>
                <th className="px-4 py-2 text-left text-sm font-medium">{t('kafka.topicName')}</th>
                <th className="px-4 py-2 text-center text-sm font-medium">{t('kafka.partitions')}</th>
                <th className="px-4 py-2 text-center text-sm font-medium">{t('kafka.replication')}</th>
                <th className="px-4 py-2 text-right text-sm font-medium">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {filteredTopics.map((topic) => (
                <tr
                  key={topic.name}
                  onClick={() => handleSelectTopic(topic.name)}
                  className={cn(
                    'border-b cursor-pointer',
                    styles.borderColor,
                    styles.hoverBg,
                    selectedTopic?.name === topic.name && (styles.isDark ? 'bg-dark-bg-hover' : 'bg-light-bg-hover')
                  )}
                >
                  <td className="px-4 py-2 text-sm">
                    <div className="flex items-center gap-2">
                      <Database className="w-4 h-4 text-accent-primary" />
                      <span className="font-mono">{topic.name}</span>
                      {topic.isInternal && (
                        <span className="px-1.5 py-0.5 text-xs rounded bg-yellow-500/20 text-yellow-600">
                          {t('kafka.internal')}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2 text-sm text-center">{topic.partitionCount}</td>
                  <td className="px-4 py-2 text-sm text-center">{topic.replicationFactor}</td>
                  <td className="px-4 py-2 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          onViewMessages(topic.name)
                        }}
                        className={cn('p-1.5 rounded', styles.hoverBg)}
                        title={t('kafka.viewMessages')}
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleOpenConfig(topic.name)
                        }}
                        className={cn('p-1.5 rounded', styles.hoverBg)}
                        title={t('kafka.configuration')}
                      >
                        <Settings className="w-4 h-4" />
                      </button>
                      {!topic.isInternal && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setDeleteTopicName(topic.name)
                            setDeleteConfirmOpen(true)
                          }}
                          className="p-1.5 rounded hover:bg-status-error/20 text-status-error"
                          title={t('common.delete')}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {filteredTopics.length === 0 && (
                <tr>
                  <td colSpan={4} className={cn('px-4 py-8 text-center', styles.textSecondary)}>
                    {loading ? t('common.loading') : t('kafka.noTopics')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Topic Detail Panel */}
      <div className="w-1/2 overflow-auto">
        {selectedTopic ? (
          <TopicDetailPanel
            topic={selectedTopic}
            connectionId={connectionId}
            styles={styles}
          />
        ) : (
          <div className={cn('flex items-center justify-center h-full', styles.textSecondary)}>
            {t('kafka.selectTopic')}
          </div>
        )}
      </div>

      {/* Dialogs */}
      <CreateTopicDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        connectionId={connectionId}
        onSuccess={loadTopics}
      />

      <TopicConfigDialog
        open={configDialogOpen}
        onOpenChange={setConfigDialogOpen}
        connectionId={connectionId}
        topicName={configTopicName}
      />

      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title={t('kafka.deleteTopic')}
        description={t('kafka.deleteTopicConfirm', { topic: deleteTopicName })}
        confirmText={t('common.delete')}
        variant="danger"
        onConfirm={handleDeleteTopic}
      />
    </div>
  )
}
