/**
 * Kafka Container Component
 *
 * Main component for Kafka cluster management with topics, consumer groups, and messages.
 */

import { useState, useCallback, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { useThemeStore, useConnectionStore, useTabStore } from '@/stores'
import {
  mwKafkaConnect,
  mwKafkaDisconnect,
  mwKafkaGetClusterInfo,
  type ClusterInfo,
  type KafkaConnectRequest,
} from '@/services/middleware'
import type { MiddlewareConnection } from '@/types'
import { TopicList } from './TopicList'
import { ConsumerGroupList } from './ConsumerGroupList'
import { MessageViewer } from './MessageViewer'
import { ClusterOverview } from './ClusterOverview'
import { KafkaIcon } from '@/components/icons/DatabaseIcons'

// View modes for the main content area
type ViewMode = 'overview' | 'topics' | 'consumerGroups' | 'messages'

interface KafkaContainerProps {
  connectionId: string
  className?: string
}

export function KafkaContainer({ connectionId, className }: KafkaContainerProps) {
  const { t } = useTranslation()
  const { theme } = useThemeStore()
  const isDark = theme === 'dark'
  const { connections, setConnectionStatus } = useConnectionStore()
  const { tabs, updateTab } = useTabStore()
  const connection = connections.find((c) => c.id === connectionId) as MiddlewareConnection | undefined

  const [isConnected, setIsConnected] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [clusterInfo, setClusterInfo] = useState<ClusterInfo | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('overview')
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null)

  // Theme styles
  const styles = useMemo(
    () => ({
      bgSecondary: isDark ? 'bg-dark-bg-secondary' : 'bg-light-bg-secondary',
      borderColor: isDark ? 'border-dark-border' : 'border-light-border',
      textPrimary: isDark ? 'text-dark-text-primary' : 'text-light-text-primary',
      textSecondary: isDark ? 'text-dark-text-secondary' : 'text-light-text-secondary',
      hoverBg: isDark ? 'hover:bg-dark-bg-hover' : 'hover:bg-light-bg-hover',
      activeBg: isDark ? 'bg-dark-bg-hover' : 'bg-light-bg-hover',
      isDark,
    }),
    [isDark]
  )

  // Connect to Kafka
  const handleConnect = useCallback(async () => {
    if (!connection?.kafkaConfig) return

    setIsConnecting(true)
    setError(null)
    setConnectionStatus(connectionId, 'connecting')

    // Also update tab status
    const tab = tabs.find((t) => t.connectionId === connectionId && t.type === 'middleware')
    if (tab) {
      updateTab(tab.id, { status: 'connecting' })
    }

    try {
      const request: KafkaConnectRequest = {
        connectionId: connection.id,
        bootstrapServers: connection.kafkaConfig.bootstrapServers,
        securityProtocol: connection.kafkaConfig.securityProtocol,
        saslMechanism: connection.kafkaConfig.saslMechanism as 'PLAIN' | 'SCRAM-SHA-256' | 'SCRAM-SHA-512' | undefined,
        username: connection.kafkaConfig.username,
        password: connection.kafkaConfig.password,
      }

      await mwKafkaConnect(request)
      setIsConnected(true)
      setConnectionStatus(connectionId, 'connected')
      if (tab) {
        updateTab(tab.id, { status: 'connected' })
      }

      // Get cluster info
      const info = await mwKafkaGetClusterInfo(connectionId)
      setClusterInfo(info)
    } catch (err) {
      setError(String(err))
      setConnectionStatus(connectionId, 'error')
      if (tab) {
        updateTab(tab.id, { status: 'error' })
      }
    } finally {
      setIsConnecting(false)
    }
  }, [connection, connectionId, setConnectionStatus, tabs, updateTab])

  // Refresh cluster info
  const handleRefresh = useCallback(async () => {
    if (!connectionId || !isConnected) return

    try {
      const info = await mwKafkaGetClusterInfo(connectionId)
      setClusterInfo(info)
    } catch (err) {
      console.error('Refresh error:', err)
    }
  }, [connectionId, isConnected])

  // Handle viewing messages for a topic
  const handleViewMessages = useCallback((topicName: string) => {
    setSelectedTopic(topicName)
    setViewMode('messages')
  }, [])

  // Cleanup: disconnect when component unmounts
  useEffect(() => {
    const currentConnectionId = connectionId
    return () => {
      if (currentConnectionId) {
        mwKafkaDisconnect(currentConnectionId).catch((err) => {
          console.error('Failed to disconnect:', err)
        })
      }
    }
  }, [connectionId])

  // Auto-connect on mount
  useEffect(() => {
    if (connection && !isConnected && !isConnecting) {
      handleConnect()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection, isConnected, isConnecting])

  // Not connected - show connect prompt
  if (!isConnected) {
    return (
      <div className={cn('flex flex-col items-center justify-center h-full', styles.textSecondary)}>
        <KafkaIcon className="w-12 h-12 mb-4" />
        <p className="text-lg mb-2">{connection?.name || t('kafka.newConnection')}</p>
        <p className="text-sm mb-4">{t('home.clickToConnect')}</p>

        {error && (
          <div className="mb-4 px-4 py-2 bg-status-error/10 text-status-error border border-status-error/30 rounded text-sm max-w-md">
            {error}
          </div>
        )}

        <button
          onClick={handleConnect}
          disabled={isConnecting}
          className={cn(
            'px-4 py-2 rounded',
            'bg-accent-primary text-white',
            'hover:bg-accent-hover transition-colors',
            'disabled:opacity-50 disabled:cursor-not-allowed'
          )}
        >
          {isConnecting ? t('status.connecting') : t('sidebar.connect')}
        </button>
      </div>
    )
  }

  return (
    <div className={cn('flex flex-col h-full overflow-hidden', className)}>
      {/* Navigation Tabs */}
      <div className={cn('flex border-b', styles.borderColor, styles.bgSecondary)}>
        <NavTab
          active={viewMode === 'overview'}
          onClick={() => setViewMode('overview')}
          styles={styles}
        >
          {t('kafka.overview')}
        </NavTab>
        <NavTab
          active={viewMode === 'topics'}
          onClick={() => setViewMode('topics')}
          styles={styles}
        >
          {t('kafka.topics')}
        </NavTab>
        <NavTab
          active={viewMode === 'consumerGroups'}
          onClick={() => setViewMode('consumerGroups')}
          styles={styles}
        >
          {t('kafka.consumerGroups')}
        </NavTab>
        {selectedTopic && (
          <NavTab
            active={viewMode === 'messages'}
            onClick={() => setViewMode('messages')}
            styles={styles}
          >
            {t('kafka.messages')}: {selectedTopic}
          </NavTab>
        )}
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-hidden">
        {viewMode === 'overview' && clusterInfo && (
          <ClusterOverview
            clusterInfo={clusterInfo}
            onRefresh={handleRefresh}
            styles={styles}
          />
        )}
        {viewMode === 'topics' && (
          <TopicList
            connectionId={connectionId}
            onViewMessages={handleViewMessages}
            styles={styles}
          />
        )}
        {viewMode === 'consumerGroups' && (
          <ConsumerGroupList
            connectionId={connectionId}
            styles={styles}
          />
        )}
        {viewMode === 'messages' && selectedTopic && (
          <MessageViewer
            connectionId={connectionId}
            topicName={selectedTopic}
            onClose={() => {
              setViewMode('topics')
              setSelectedTopic(null)
            }}
            styles={styles}
          />
        )}
      </div>
    </div>
  )
}

// Navigation Tab Component
interface NavTabProps {
  active: boolean
  onClick: () => void
  children: React.ReactNode
  styles: {
    borderColor: string
    textPrimary: string
    textSecondary: string
    hoverBg: string
    activeBg: string
  }
}

function NavTab({ active, onClick, children, styles }: NavTabProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'px-4 py-2 text-sm font-medium border-b-2 transition-colors',
        active
          ? cn('border-accent-primary', styles.textPrimary)
          : cn('border-transparent', styles.textSecondary, styles.hoverBg)
      )}
    >
      {children}
    </button>
  )
}
