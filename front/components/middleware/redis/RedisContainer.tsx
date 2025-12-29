/**
 * Redis Container Component
 *
 * Main component for Redis management with overview, keys, data editor, and CLI.
 */

import { useState, useCallback, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { useThemeStore, useConnectionStore, useTabStore } from '@/stores'
import {
  mwRedisConnect,
  mwRedisDisconnect,
  mwRedisGetInfo,
  mwRedisGetDatabases,
  mwRedisSelectDatabase,
  type RedisInfo,
  type RedisDatabaseInfo,
  type RedisConnectRequest,
} from '@/services/middleware'
import type { MiddlewareConnection } from '@/types'
import { RedisOverview } from './RedisOverview'
import { RedisKeys } from './RedisKeys'
import { RedisDataEditor } from './RedisDataEditor'
import { RedisCommand } from './RedisCommand'
import { RedisMonitor } from './RedisMonitor'
import { Database } from 'lucide-react'

// View modes for the main content area
type ViewMode = 'overview' | 'keys' | 'cli' | 'monitor'

interface RedisContainerProps {
  connectionId: string
  className?: string
}

export function RedisContainer({ connectionId, className }: RedisContainerProps) {
  const { t } = useTranslation()
  const { theme } = useThemeStore()
  const isDark = theme === 'dark'
  const { connections, setConnectionStatus } = useConnectionStore()
  const { tabs, updateTab } = useTabStore()
  const connection = connections.find((c) => c.id === connectionId) as MiddlewareConnection | undefined

  const [isConnected, setIsConnected] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [redisInfo, setRedisInfo] = useState<RedisInfo | null>(null)
  const [databases, setDatabases] = useState<RedisDatabaseInfo[]>([])
  const [currentDb, setCurrentDb] = useState(0)
  const [viewMode, setViewMode] = useState<ViewMode>('overview')
  const [selectedKey, setSelectedKey] = useState<string | null>(null)

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

  // Connect to Redis
  const handleConnect = useCallback(async () => {
    if (!connection?.redisConfig) return

    setIsConnecting(true)
    setError(null)
    setConnectionStatus(connectionId, 'connecting')

    // Also update tab status
    const tab = tabs.find((t) => t.connectionId === connectionId && t.type === 'middleware')
    if (tab) {
      updateTab(tab.id, { status: 'connecting' })
    }

    try {
      const rc = connection.redisConfig
      const request: RedisConnectRequest = {
        connectionId: connection.id,
        mode: rc.mode || 'Standalone',
        host: rc.host,
        port: rc.port,
        nodes: rc.nodes,
        sentinels: rc.sentinels,
        sentinelPassword: rc.sentinelPassword,
        masterName: rc.masterName,
        password: rc.password,
        db: rc.db,
        tls: rc.tls,
      }

      await mwRedisConnect(request)
      setIsConnected(true)
      setCurrentDb(rc.db || 0)
      setConnectionStatus(connectionId, 'connected')
      if (tab) {
        updateTab(tab.id, { status: 'connected' })
      }

      // Get server info and databases
      await loadServerInfo()
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

  // Load server info
  const loadServerInfo = useCallback(async () => {
    try {
      const [info, dbs] = await Promise.all([
        mwRedisGetInfo(connectionId),
        mwRedisGetDatabases(connectionId),
      ])
      setRedisInfo(info)
      setDatabases(dbs)
    } catch (err) {
      console.error('Failed to load server info:', err)
    }
  }, [connectionId])

  // Select database
  const handleSelectDatabase = useCallback(
    async (db: number) => {
      try {
        await mwRedisSelectDatabase(connectionId, db)
        setCurrentDb(db)
        // Refresh databases to get updated key counts
        const dbs = await mwRedisGetDatabases(connectionId)
        setDatabases(dbs)
      } catch (err) {
        console.error('Failed to select database:', err)
      }
    },
    [connectionId]
  )

  // Handle key selection
  const handleSelectKey = useCallback((key: string) => {
    setSelectedKey(key)
  }, [])

  // Handle key deleted
  const handleKeyDeleted = useCallback(() => {
    setSelectedKey(null)
    // Refresh will happen through RedisKeys component
  }, [])

  // Handle key renamed
  const handleKeyRenamed = useCallback((newKey: string) => {
    setSelectedKey(newKey)
  }, [])

  // Create new key (TODO: implement key creation dialog)
  const handleCreateKey = useCallback(() => {
    console.log('Create key not yet implemented')
  }, [])

  // Cleanup: disconnect when component unmounts
  useEffect(() => {
    const currentConnectionId = connectionId
    return () => {
      if (currentConnectionId) {
        mwRedisDisconnect(currentConnectionId).catch((err) => {
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
        <Database className="w-12 h-12 mb-4 text-red-500" />
        <p className="text-lg mb-2">{connection?.name || t('redis.newConnection', 'New Connection')}</p>
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
          {t('redis.tab.overview', '概览')}
        </NavTab>
        <NavTab active={viewMode === 'keys'} onClick={() => setViewMode('keys')} styles={styles}>
          {t('redis.tab.keys', '键管理')}
        </NavTab>
        <NavTab active={viewMode === 'cli'} onClick={() => setViewMode('cli')} styles={styles}>
          {t('redis.tab.command', '命令')}
        </NavTab>
        <NavTab active={viewMode === 'monitor'} onClick={() => setViewMode('monitor')} styles={styles}>
          {t('redis.tab.monitor', '监控')}
        </NavTab>

        {/* Current DB indicator */}
        <div className="ml-auto flex items-center px-3">
          <span className={cn('text-xs', styles.textSecondary)}>
            DB{currentDb}
          </span>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-hidden flex">
        {viewMode === 'overview' && redisInfo && (
          <RedisOverview
            redisInfo={redisInfo}
            databases={databases}
            onRefresh={loadServerInfo}
            onSelectDatabase={handleSelectDatabase}
            currentDb={currentDb}
            styles={styles}
          />
        )}

        {viewMode === 'keys' && (
          <div className="flex-1 flex overflow-hidden">
            {/* Keys List */}
            <div className={cn('w-80 border-r flex-shrink-0', styles.borderColor)}>
              <RedisKeys
                connectionId={connectionId}
                onSelectKey={handleSelectKey}
                selectedKey={selectedKey}
                onCreateKey={handleCreateKey}
                databases={databases}
                currentDb={currentDb}
                onSelectDatabase={handleSelectDatabase}
                styles={styles}
              />
            </div>

            {/* Data Editor */}
            <div className="flex-1 overflow-hidden">
              {selectedKey ? (
                <RedisDataEditor
                  connectionId={connectionId}
                  keyName={selectedKey}
                  onClose={() => setSelectedKey(null)}
                  onKeyDeleted={handleKeyDeleted}
                  onKeyRenamed={handleKeyRenamed}
                  styles={styles}
                />
              ) : (
                <div className={cn('flex flex-col items-center justify-center h-full', styles.textSecondary)}>
                  <Database className="w-12 h-12 mb-4 opacity-50" />
                  <p>{t('redis.selectKey', 'Select a key to view/edit')}</p>
                  <p className="text-sm mt-2">{t('redis.doubleClickKey', 'Double-click a key in the list')}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {viewMode === 'cli' && (
          <div className="flex-1 overflow-hidden">
            <RedisCommand connectionId={connectionId} styles={styles} />
          </div>
        )}

        {viewMode === 'monitor' && (
          <div className="flex-1 overflow-hidden">
            <RedisMonitor connectionId={connectionId} styles={styles} />
          </div>
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
