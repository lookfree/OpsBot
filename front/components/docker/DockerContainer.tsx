/**
 * Docker Container Component
 *
 * Main component for Docker management with containers and images tabs.
 */

import { useState, useCallback, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { useThemeStore, useConnectionStore, useTabStore } from '@/stores'
import { Container } from 'lucide-react'
import {
  dockerConnect,
  dockerDisconnect,
  type DockerConnectRequest,
  type DockerConnectionType,
} from '@/services/docker'
import type { DockerConnection } from '@/types'
import { ContainerList } from './ContainerList'
import { ImageList } from './ImageList'
import { ContainerLogs } from './ContainerLogs'
import { ContainerStatsView } from './ContainerStats'
import { ContainerTerminal } from './ContainerTerminal'
import { DockerOverview } from './DockerOverview'
import { DockerSettings } from './DockerSettings'
import { NetworkList } from './NetworkList'
import { VolumeList } from './VolumeList'
import { ComposeList } from './ComposeList'
import { RegistryList } from './RegistryList'

// View modes for the main content area
type ViewMode = 'overview' | 'containers' | 'images' | 'networks' | 'volumes' | 'compose' | 'registries' | 'settings' | 'logs' | 'stats' | 'terminal'

interface DockerContainerProps {
  connectionId: string
  className?: string
}

export function DockerContainer({ connectionId, className }: DockerContainerProps) {
  const { t } = useTranslation()
  const { theme } = useThemeStore()
  const isDark = theme === 'dark'
  const { connections, setConnectionStatus } = useConnectionStore()
  const { tabs, updateTab } = useTabStore()
  const connection = connections.find((c) => c.id === connectionId) as DockerConnection | undefined

  const [isConnected, setIsConnected] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('overview')
  const [selectedContainer, setSelectedContainer] = useState<{
    id: string
    name: string
  } | null>(null)

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

  // Connect to Docker
  const handleConnect = useCallback(async () => {
    if (!connection) return

    setIsConnecting(true)
    setError(null)
    setConnectionStatus(connectionId, 'connecting')

    // Also update tab status
    const tab = tabs.find((t) => t.connectionId === connectionId && t.type === 'docker')
    if (tab) {
      updateTab(tab.id, { status: 'connecting' })
    }

    try {
      const request: DockerConnectRequest = {
        connectionId: connection.id,
        connectionType: connection.connectionType as DockerConnectionType,
        sshConnectionId: connection.sshConnectionId,
      }

      const result = await dockerConnect(request)
      if (result.success) {
        setIsConnected(true)
        setConnectionStatus(connectionId, 'connected')
        if (tab) {
          updateTab(tab.id, { status: 'connected' })
        }
      } else {
        throw new Error(result.error || 'Connection failed')
      }
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

  // Handle viewing logs for a container
  const handleViewLogs = useCallback((containerId: string, containerName: string) => {
    setSelectedContainer({ id: containerId, name: containerName })
    setViewMode('logs')
  }, [])

  // Handle viewing stats for a container
  const handleViewStats = useCallback((containerId: string, containerName: string) => {
    setSelectedContainer({ id: containerId, name: containerName })
    setViewMode('stats')
  }, [])

  // Handle opening terminal for a container
  const handleOpenTerminal = useCallback((containerId: string, containerName: string) => {
    setSelectedContainer({ id: containerId, name: containerName })
    setViewMode('terminal')
  }, [])

  // Handle closing logs/stats/terminal
  const handleCloseLogs = useCallback(() => {
    setViewMode('containers')
    setSelectedContainer(null)
  }, [])

  // Handle closing stats
  const handleCloseStats = useCallback(() => {
    setViewMode('containers')
    setSelectedContainer(null)
  }, [])

  // Handle closing terminal
  const handleCloseTerminal = useCallback(() => {
    setViewMode('containers')
    setSelectedContainer(null)
  }, [])

  // Cleanup: disconnect when component unmounts
  useEffect(() => {
    const currentConnectionId = connectionId
    return () => {
      if (currentConnectionId) {
        dockerDisconnect(currentConnectionId).catch((err) => {
          console.error('Failed to disconnect Docker:', err)
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
        <Container className="w-12 h-12 mb-4" />
        <p className="text-lg mb-2">{connection?.name || t('docker.newConnection')}</p>
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
          {t('docker.overview')}
        </NavTab>
        <NavTab
          active={viewMode === 'containers'}
          onClick={() => setViewMode('containers')}
          styles={styles}
        >
          {t('docker.containers')}
        </NavTab>
        <NavTab
          active={viewMode === 'images'}
          onClick={() => setViewMode('images')}
          styles={styles}
        >
          {t('docker.images')}
        </NavTab>
        <NavTab
          active={viewMode === 'networks'}
          onClick={() => setViewMode('networks')}
          styles={styles}
        >
          {t('docker.networks')}
        </NavTab>
        <NavTab
          active={viewMode === 'volumes'}
          onClick={() => setViewMode('volumes')}
          styles={styles}
        >
          {t('docker.volumes')}
        </NavTab>
        <NavTab
          active={viewMode === 'compose'}
          onClick={() => setViewMode('compose')}
          styles={styles}
        >
          {t('docker.compose')}
        </NavTab>
        <NavTab
          active={viewMode === 'registries'}
          onClick={() => setViewMode('registries')}
          styles={styles}
        >
          {t('docker.registries')}
        </NavTab>
        <NavTab
          active={viewMode === 'settings'}
          onClick={() => setViewMode('settings')}
          styles={styles}
        >
          {t('docker.settings')}
        </NavTab>
        {selectedContainer && viewMode === 'logs' && (
          <NavTab
            active={viewMode === 'logs'}
            onClick={() => setViewMode('logs')}
            styles={styles}
          >
            {t('docker.logs')}: {selectedContainer.name}
          </NavTab>
        )}
        {selectedContainer && viewMode === 'stats' && (
          <NavTab
            active={viewMode === 'stats'}
            onClick={() => setViewMode('stats')}
            styles={styles}
          >
            {t('docker.stats')}: {selectedContainer.name}
          </NavTab>
        )}
        {selectedContainer && viewMode === 'terminal' && (
          <NavTab
            active={viewMode === 'terminal'}
            onClick={() => setViewMode('terminal')}
            styles={styles}
          >
            {t('docker.terminal')}: {selectedContainer.name}
          </NavTab>
        )}
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-hidden">
        {viewMode === 'overview' && (
          <DockerOverview connectionId={connectionId} />
        )}
        {viewMode === 'containers' && (
          <ContainerList
            connectionId={connectionId}
            onViewLogs={handleViewLogs}
            onViewStats={handleViewStats}
            onOpenTerminal={handleOpenTerminal}
          />
        )}
        {viewMode === 'images' && (
          <ImageList connectionId={connectionId} />
        )}
        {viewMode === 'networks' && (
          <NetworkList connectionId={connectionId} />
        )}
        {viewMode === 'volumes' && (
          <VolumeList connectionId={connectionId} />
        )}
        {viewMode === 'compose' && (
          <ComposeList connectionId={connectionId} />
        )}
        {viewMode === 'registries' && (
          <RegistryList connectionId={connectionId} />
        )}
        {viewMode === 'settings' && (
          <DockerSettings connectionId={connectionId} />
        )}
        {viewMode === 'logs' && selectedContainer && (
          <ContainerLogs
            connectionId={connectionId}
            containerId={selectedContainer.id}
            containerName={selectedContainer.name}
            onClose={handleCloseLogs}
          />
        )}
        {viewMode === 'stats' && selectedContainer && (
          <ContainerStatsView
            connectionId={connectionId}
            containerId={selectedContainer.id}
            containerName={selectedContainer.name}
            onClose={handleCloseStats}
          />
        )}
        {viewMode === 'terminal' && selectedContainer && (
          <ContainerTerminal
            connectionId={connectionId}
            containerId={selectedContainer.id}
            containerName={selectedContainer.name}
            onClose={handleCloseTerminal}
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
