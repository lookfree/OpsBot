/**
 * MCP Panel Component
 *
 * Manages MCP (Model Context Protocol) servers.
 */

import { useState, useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { useAiStore } from '@/stores'
import {
  Server,
  RefreshCw,
  Plus,
  AlertCircle,
  Play,
  Square,
  Trash2,
  Loader2,
  Terminal,
  Globe,
  Wrench,
} from 'lucide-react'
import { useAiStyles } from '../hooks'
import { McpServerDialog } from './McpServerDialog'
import { McpToolsPanel } from './McpToolsPanel'
import type { McpServerInfo, McpServerStatus } from '@/types'

export function McpPanel() {
  const { t } = useTranslation()
  const styles = useAiStyles()

  const {
    mcpServers,
    isMcpLoading,
    isMcpCreating,
    mcpError,
    fetchMcpServers,
    createMcpServer,
    deleteMcpServer,
    startMcpServer,
    stopMcpServer,
    clearMcpError,
  } = useAiStore()

  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [selectedServerId, setSelectedServerId] = useState<string | null>(null)
  const [showToolsPanel, setShowToolsPanel] = useState(false)

  // Load servers on mount
  useEffect(() => {
    fetchMcpServers()
  }, [fetchMcpServers])

  const handleRefresh = useCallback(() => {
    fetchMcpServers()
  }, [fetchMcpServers])

  const handleStartServer = useCallback(
    async (serverId: string) => {
      try {
        await startMcpServer(serverId)
      } catch {
        // Error handled in store
      }
    },
    [startMcpServer]
  )

  const handleStopServer = useCallback(
    async (serverId: string) => {
      try {
        await stopMcpServer(serverId)
      } catch {
        // Error handled in store
      }
    },
    [stopMcpServer]
  )

  const handleDeleteServer = useCallback(
    async (serverId: string) => {
      try {
        await deleteMcpServer(serverId)
      } catch {
        // Error handled in store
      }
    },
    [deleteMcpServer]
  )

  const handleShowTools = useCallback((serverId: string) => {
    setSelectedServerId(serverId)
    setShowToolsPanel(true)
  }, [])

  const getStatusColor = (status: McpServerStatus): string => {
    if (status === 'running') return styles.successText
    if (status === 'stopped') return styles.textSecondary
    return styles.errorText
  }

  const getStatusText = (status: McpServerStatus): string => {
    if (status === 'running') return t('ai.mcp.status.running')
    if (status === 'stopped') return t('ai.mcp.status.stopped')
    if (typeof status === 'object' && 'error' in status) {
      return `${t('ai.mcp.status.error')}: ${status.error}`
    }
    return t('ai.mcp.status.unknown')
  }

  const isRunning = (status: McpServerStatus): boolean => status === 'running'

  return (
    <div className="flex flex-col h-full p-4 gap-4">
      {/* Header Bar */}
      <div className={cn('flex items-center justify-between p-3 rounded-lg border', styles.bgSecondary, styles.borderColor)}>
        <div className="flex items-center gap-3">
          <Server className={cn('w-5 h-5', styles.textPrimary)} />
          <span className={cn('font-medium', styles.textPrimary)}>
            {t('ai.mcp.title')}
          </span>
          <span className={cn('text-sm', styles.textSecondary)}>
            ({mcpServers.length} {t('ai.mcp.servers')})
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            className={cn('flex items-center gap-1 px-3 py-1.5 text-sm rounded transition-colors', styles.hoverBg, styles.textSecondary)}
            onClick={handleRefresh}
            disabled={isMcpLoading}
          >
            <RefreshCw className={cn('w-4 h-4', isMcpLoading && 'animate-spin')} />
            {t('common.refresh')}
          </button>
          <button
            className="flex items-center gap-1 px-3 py-1.5 text-sm rounded transition-colors bg-blue-600 hover:bg-blue-700 text-white"
            onClick={() => setShowCreateDialog(true)}
            disabled={isMcpCreating}
          >
            {isMcpCreating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            {t('ai.mcp.createServer')}
          </button>
        </div>
      </div>

      {/* Error Message */}
      {mcpError && (
        <div className={cn('flex items-center gap-2 p-3 rounded-lg border border-red-500/50 bg-red-500/10', styles.errorText)}>
          <AlertCircle className="w-4 h-4" />
          <span className="text-sm">{mcpError}</span>
          <button className="ml-auto text-sm underline" onClick={clearMcpError}>
            {t('common.dismiss')}
          </button>
        </div>
      )}

      {/* Server List */}
      <div className="flex-1 overflow-auto">
        {isMcpLoading && mcpServers.length === 0 ? (
          <div className={cn('flex items-center justify-center h-full', styles.textSecondary)}>
            <Loader2 className="w-8 h-8 animate-spin" />
          </div>
        ) : mcpServers.length === 0 ? (
          <div className={cn('flex flex-col items-center justify-center h-full gap-4', styles.textSecondary)}>
            <Server className="w-16 h-16 opacity-50" />
            <p>{t('ai.mcp.noServers')}</p>
            <button
              className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
              onClick={() => setShowCreateDialog(true)}
            >
              {t('ai.mcp.createServer')}
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {mcpServers.map((server: McpServerInfo) => (
              <ServerCard
                key={server.id}
                server={server}
                styles={styles}
                getStatusColor={getStatusColor}
                getStatusText={getStatusText}
                isRunning={isRunning(server.status)}
                onStart={() => handleStartServer(server.id)}
                onStop={() => handleStopServer(server.id)}
                onDelete={() => handleDeleteServer(server.id)}
                onShowTools={() => handleShowTools(server.id)}
                t={t}
              />
            ))}
          </div>
        )}
      </div>

      {/* Dialogs */}
      <McpServerDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onSave={createMcpServer}
        isLoading={isMcpCreating}
      />

      {selectedServerId && (
        <McpToolsPanel
          open={showToolsPanel}
          onOpenChange={setShowToolsPanel}
          serverId={selectedServerId}
        />
      )}
    </div>
  )
}

interface ServerCardProps {
  server: McpServerInfo
  styles: ReturnType<typeof useAiStyles>
  getStatusColor: (status: McpServerStatus) => string
  getStatusText: (status: McpServerStatus) => string
  isRunning: boolean
  onStart: () => void
  onStop: () => void
  onDelete: () => void
  onShowTools: () => void
  t: (key: string) => string
}

function ServerCard({
  server,
  styles,
  getStatusColor,
  getStatusText,
  isRunning,
  onStart,
  onStop,
  onDelete,
  onShowTools,
  t,
}: ServerCardProps) {
  return (
    <div className={cn('p-4 rounded-lg border', styles.bgSecondary, styles.borderColor)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* Transport Type Icon */}
          <div className={cn('p-2 rounded', styles.hoverBg)}>
            {server.transport.type === 'stdio' ? (
              <Terminal className={cn('w-5 h-5', styles.textPrimary)} />
            ) : (
              <Globe className={cn('w-5 h-5', styles.textPrimary)} />
            )}
          </div>

          {/* Server Info */}
          <div>
            <div className="flex items-center gap-2">
              <span className={cn('font-medium', styles.textPrimary)}>{server.name}</span>
              <span className={cn('text-xs px-2 py-0.5 rounded', getStatusColor(server.status), styles.hoverBg)}>
                {getStatusText(server.status)}
              </span>
            </div>
            <div className={cn('text-sm', styles.textSecondary)}>
              {server.transport.type === 'stdio' ? (
                <span>{server.transport.command}</span>
              ) : (
                <span>{server.transport.url}</span>
              )}
            </div>
            {server.description && (
              <div className={cn('text-xs mt-1', styles.textSecondary)}>
                {server.description}
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1">
          <button
            className={cn('p-2 rounded transition-colors', styles.hoverBg, styles.textSecondary)}
            onClick={onShowTools}
            title={t('ai.mcp.tools')}
          >
            <Wrench className="w-4 h-4" />
            <span className="sr-only">{server.toolCount}</span>
          </button>

          {isRunning ? (
            <button
              className={cn('p-2 rounded transition-colors', styles.hoverBg, styles.errorText)}
              onClick={onStop}
              title={t('ai.mcp.stop')}
            >
              <Square className="w-4 h-4" />
            </button>
          ) : (
            <button
              className={cn('p-2 rounded transition-colors', styles.hoverBg, styles.successText)}
              onClick={onStart}
              title={t('ai.mcp.start')}
            >
              <Play className="w-4 h-4" />
            </button>
          )}

          <button
            className={cn('p-2 rounded transition-colors', styles.hoverBg, styles.errorText)}
            onClick={onDelete}
            title={t('ai.mcp.delete')}
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
