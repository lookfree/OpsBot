/**
 * Elasticsearch Container Component
 *
 * Main component for Elasticsearch management with overview, indices, and query.
 */

import { useState, useCallback, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { useThemeStore, useConnectionStore, useTabStore } from '@/stores'
import {
  mwEsConnect,
  mwEsDisconnect,
  mwEsGetClusterHealth,
  mwEsGetClusterStats,
  mwEsGetNodes,
  type EsConnectRequest,
  type EsClusterHealth,
  type EsClusterStats,
  type EsNodeInfo,
} from '@/services/middleware'
import type { MiddlewareConnection } from '@/types'
import { ElasticsearchOverview } from './ElasticsearchOverview'
import { ElasticsearchIndices } from './ElasticsearchIndices'
import { ElasticsearchDocuments } from './ElasticsearchDocuments'
import { ElasticsearchQuery } from './ElasticsearchQuery'
import { Search } from 'lucide-react'

// View modes for the main content area
type ViewMode = 'overview' | 'indices' | 'documents' | 'query'

interface ElasticsearchContainerProps {
  connectionId: string
  className?: string
}

export function ElasticsearchContainer({ connectionId, className }: ElasticsearchContainerProps) {
  const { t } = useTranslation()
  const { theme } = useThemeStore()
  const isDark = theme === 'dark'
  const { connections, setConnectionStatus } = useConnectionStore()
  const { tabs, updateTab } = useTabStore()
  const connection = connections.find((c) => c.id === connectionId) as MiddlewareConnection | undefined

  const [isConnected, setIsConnected] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [clusterHealth, setClusterHealth] = useState<EsClusterHealth | null>(null)
  const [clusterStats, setClusterStats] = useState<EsClusterStats | null>(null)
  const [nodes, setNodes] = useState<EsNodeInfo[]>([])
  const [viewMode, setViewMode] = useState<ViewMode>('overview')

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

  // Connect to Elasticsearch
  const handleConnect = useCallback(async () => {
    if (!connection?.esConfig) return

    setIsConnecting(true)
    setError(null)
    setConnectionStatus(connectionId, 'connecting')

    const tab = tabs.find((t) => t.connectionId === connectionId && t.type === 'middleware')
    if (tab) {
      updateTab(tab.id, { status: 'connecting' })
    }

    try {
      const ec = connection.esConfig
      const request: EsConnectRequest = {
        connectionId: connection.id,
        nodes: ec.nodes,
        authType: ec.username ? 'basic' : ec.apiKey ? 'api_key' : 'none',
        username: ec.username,
        password: ec.password,
        apiKey: ec.apiKey,
      }

      await mwEsConnect(request)
      setIsConnected(true)
      setConnectionStatus(connectionId, 'connected')
      if (tab) {
        updateTab(tab.id, { status: 'connected' })
      }

      // Load cluster info
      await loadClusterInfo()
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

  // Load cluster info
  const loadClusterInfo = useCallback(async () => {
    try {
      const [health, stats, nodeList] = await Promise.all([
        mwEsGetClusterHealth(connectionId),
        mwEsGetClusterStats(connectionId),
        mwEsGetNodes(connectionId),
      ])
      setClusterHealth(health)
      setClusterStats(stats)
      setNodes(nodeList)
    } catch (err) {
      console.error('Failed to load cluster info:', err)
    }
  }, [connectionId])

  // Cleanup: disconnect when component unmounts
  useEffect(() => {
    const currentConnectionId = connectionId
    return () => {
      if (currentConnectionId) {
        mwEsDisconnect(currentConnectionId).catch((err) => {
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
        <Search className="w-12 h-12 mb-4 text-yellow-500" />
        <p className="text-lg mb-2">{connection?.name || t('elasticsearch.newConnection', 'New Connection')}</p>
        <p className="text-sm mb-4">{t('home.clickToConnect', 'Click to connect')}</p>

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
          {isConnecting ? t('status.connecting', 'Connecting...') : t('sidebar.connect', 'Connect')}
        </button>
      </div>
    )
  }

  return (
    <div className={cn('flex flex-col h-full overflow-hidden', className)}>
      {/* Navigation Tabs */}
      <div className={cn('flex border-b', styles.borderColor, styles.bgSecondary)}>
        <NavTab active={viewMode === 'overview'} onClick={() => setViewMode('overview')} styles={styles}>
          {t('elasticsearch.tab.overview', 'Overview')}
        </NavTab>
        <NavTab active={viewMode === 'indices'} onClick={() => setViewMode('indices')} styles={styles}>
          {t('elasticsearch.tab.indices', 'Indices')}
        </NavTab>
        <NavTab active={viewMode === 'documents'} onClick={() => setViewMode('documents')} styles={styles}>
          {t('elasticsearch.tab.documents', 'Documents')}
        </NavTab>
        <NavTab active={viewMode === 'query'} onClick={() => setViewMode('query')} styles={styles}>
          {t('elasticsearch.tab.query', 'Query')}
        </NavTab>

        {/* Cluster status indicator */}
        <div className="ml-auto flex items-center px-3 gap-2">
          {clusterHealth && (
            <span
              className={cn(
                'w-2 h-2 rounded-full',
                clusterHealth.status === 'green' && 'bg-green-500',
                clusterHealth.status === 'yellow' && 'bg-yellow-500',
                clusterHealth.status === 'red' && 'bg-red-500'
              )}
              title={`Cluster: ${clusterHealth.status}`}
            />
          )}
          <span className={cn('text-xs', styles.textSecondary)}>
            {clusterStats?.clusterName || 'Elasticsearch'}
          </span>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-hidden">
        {viewMode === 'overview' && clusterHealth && clusterStats && Array.isArray(nodes) && (
          <ElasticsearchOverview
            connectionId={connectionId}
            clusterHealth={clusterHealth}
            clusterStats={clusterStats}
            nodes={nodes}
            onRefresh={loadClusterInfo}
            styles={styles}
          />
        )}

        {viewMode === 'indices' && (
          <ElasticsearchIndices connectionId={connectionId} styles={styles} />
        )}

        {viewMode === 'documents' && (
          <ElasticsearchDocuments connectionId={connectionId} styles={styles} />
        )}

        {viewMode === 'query' && (
          <ElasticsearchQuery connectionId={connectionId} styles={styles} />
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
