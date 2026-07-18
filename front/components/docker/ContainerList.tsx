/**
 * Container List Component
 *
 * Displays Docker containers with status and action buttons.
 */

import { useState, useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Play,
  Square,
  RefreshCw,
  Trash2,
  FileText,
  BarChart2,
  Terminal,
  Loader2,
  AlertCircle,
  CheckCircle2,
  PauseCircle,
  XCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useThemeStore } from '@/stores'
import {
  dockerListContainers,
  dockerStartContainer,
  dockerStopContainer,
  dockerRestartContainer,
  dockerRemoveContainer,
  type ContainerInfo,
} from '@/services/docker'

interface ContainerListProps {
  connectionId: string
  onViewLogs?: (containerId: string, containerName: string) => void
  onViewStats?: (containerId: string, containerName: string) => void
  onOpenTerminal?: (containerId: string, containerName: string) => void
}

export function ContainerList({ connectionId, onViewLogs, onViewStats, onOpenTerminal }: ContainerListProps) {
  const { t } = useTranslation()
  const { theme } = useThemeStore()
  const isDark = theme === 'dark'

  const [containers, setContainers] = useState<ContainerInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)
  const [actionLoading, setActionLoading] = useState<Record<string, string>>({})

  const loadContainers = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await dockerListContainers(connectionId, showAll)
      setContainers(data)
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }, [connectionId, showAll])

  useEffect(() => {
    loadContainers()
  }, [loadContainers])

  const handleAction = useCallback(
    async (containerId: string, action: 'start' | 'stop' | 'restart' | 'remove') => {
      setActionLoading((prev) => ({ ...prev, [containerId]: action }))
      try {
        switch (action) {
          case 'start':
            await dockerStartContainer(connectionId, containerId)
            break
          case 'stop':
            await dockerStopContainer(connectionId, containerId)
            break
          case 'restart':
            await dockerRestartContainer(connectionId, containerId)
            break
          case 'remove':
            await dockerRemoveContainer(connectionId, containerId, true)
            break
        }
        await loadContainers()
      } catch (err) {
        setError(String(err))
      } finally {
        setActionLoading((prev) => {
          const next = { ...prev }
          delete next[containerId]
          return next
        })
      }
    },
    [connectionId, loadContainers]
  )

  const getStateIcon = (state: string) => {
    switch (state.toLowerCase()) {
      case 'running':
        return <CheckCircle2 className="w-4 h-4 text-status-success" />
      case 'paused':
        return <PauseCircle className="w-4 h-4 text-status-warning" />
      case 'exited':
      case 'stopped':
        return <XCircle className="w-4 h-4 text-status-error" />
      case 'restarting':
        return <RefreshCw className="w-4 h-4 text-status-info animate-spin" />
      default:
        return <AlertCircle className="w-4 h-4 text-dark-text-secondary" />
    }
  }

  const formatPorts = (ports: ContainerInfo['ports']) => {
    if (!ports || ports.length === 0) return '-'
    return ports
      .map((p) => {
        if (p.hostPort) {
          return `${p.hostIp || '0.0.0.0'}:${p.hostPort}->${p.containerPort}/${p.protocol}`
        }
        return `${p.containerPort}/${p.protocol}`
      })
      .join(', ')
  }

  // Theme styles
  const bgPrimary = isDark ? 'bg-dark-bg-primary' : 'bg-light-bg-primary'
  const bgSecondary = isDark ? 'bg-dark-bg-secondary' : 'bg-light-bg-secondary'
  const borderColor = isDark ? 'border-dark-border' : 'border-light-border'
  const textPrimary = isDark ? 'text-dark-text-primary' : 'text-light-text-primary'
  const textSecondary = isDark ? 'text-dark-text-secondary' : 'text-light-text-secondary'
  const hoverBg = isDark ? 'hover:bg-dark-bg-hover' : 'hover:bg-light-bg-hover'

  return (
    <div className={cn('h-full flex flex-col', bgPrimary)}>
      {/* Toolbar */}
      <div className={cn('flex items-center justify-between px-4 py-2 border-b', borderColor)}>
        <h3 className={cn('font-medium', textPrimary)}>{t('docker.containers')}</h3>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showAll}
              onChange={(e) => setShowAll(e.target.checked)}
              className="w-4 h-4 text-accent-primary rounded"
            />
            <span className={cn('text-sm', textSecondary)}>{t('docker.showAllContainers')}</span>
          </label>
          <button
            onClick={loadContainers}
            disabled={loading}
            className={cn(
              'p-1.5 rounded transition-colors',
              hoverBg,
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
            title={t('common.refresh')}
          >
            <RefreshCw className={cn('w-4 h-4', textSecondary, loading && 'animate-spin')} />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {error && containers.length > 0 && (
          <div className="flex items-center gap-2 px-4 py-2 text-sm text-status-error bg-status-error/10 border-b border-status-error/20">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span className="flex-1">{error}</span>
            <button onClick={() => setError(null)} className="opacity-70 hover:opacity-100">✕</button>
          </div>
        )}
        {loading && containers.length === 0 ? (
          <div className={cn('flex items-center justify-center h-32', textSecondary)}>
            <Loader2 className="w-6 h-6 animate-spin mr-2" />
            {t('common.loading')}
          </div>
        ) : error && containers.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-status-error">
            <AlertCircle className="w-5 h-5 mr-2" />
            {error}
          </div>
        ) : containers.length === 0 ? (
          <div className={cn('flex items-center justify-center h-32', textSecondary)}>
            {t('docker.noContainers')}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className={cn(bgSecondary)}>
              <tr className={borderColor}>
                <th className={cn('px-4 py-2 text-left font-medium', textSecondary)}>
                  {t('docker.containerState')}
                </th>
                <th className={cn('px-4 py-2 text-left font-medium', textSecondary)}>
                  {t('docker.containerName')}
                </th>
                <th className={cn('px-4 py-2 text-left font-medium', textSecondary)}>
                  {t('docker.containerImage')}
                </th>
                <th className={cn('px-4 py-2 text-left font-medium', textSecondary)}>
                  {t('docker.containerStatus')}
                </th>
                <th className={cn('px-4 py-2 text-left font-medium', textSecondary)}>
                  {t('docker.containerPorts')}
                </th>
                <th className={cn('px-4 py-2 text-right font-medium', textSecondary)}>
                  {t('common.actions')}
                </th>
              </tr>
            </thead>
            <tbody>
              {containers.map((container) => {
                const isLoading = !!actionLoading[container.id]
                const currentAction = actionLoading[container.id]
                const isRunning = container.state.toLowerCase() === 'running'

                return (
                  <tr
                    key={container.id}
                    className={cn('border-b', borderColor, hoverBg, 'transition-colors')}
                  >
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        {getStateIcon(container.state)}
                        <span className={cn('text-xs capitalize', textSecondary)}>
                          {container.state}
                        </span>
                      </div>
                    </td>
                    <td className={cn('px-4 py-2 font-mono', textPrimary)}>
                      {container.name}
                    </td>
                    <td className={cn('px-4 py-2 font-mono text-xs', textSecondary)}>
                      {container.image}
                    </td>
                    <td className={cn('px-4 py-2 text-xs', textSecondary)}>
                      {container.status}
                    </td>
                    <td className={cn('px-4 py-2 font-mono text-xs', textSecondary)}>
                      {formatPorts(container.ports)}
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex items-center justify-end gap-1">
                        {/* Start/Stop */}
                        {isRunning ? (
                          <button
                            onClick={() => handleAction(container.id, 'stop')}
                            disabled={isLoading}
                            className={cn(
                              'p-1.5 rounded transition-colors',
                              hoverBg,
                              'disabled:opacity-50 disabled:cursor-not-allowed'
                            )}
                            title={t('docker.stopContainer')}
                          >
                            {currentAction === 'stop' ? (
                              <Loader2 className="w-4 h-4 animate-spin text-status-warning" />
                            ) : (
                              <Square className="w-4 h-4 text-status-warning" />
                            )}
                          </button>
                        ) : (
                          <button
                            onClick={() => handleAction(container.id, 'start')}
                            disabled={isLoading}
                            className={cn(
                              'p-1.5 rounded transition-colors',
                              hoverBg,
                              'disabled:opacity-50 disabled:cursor-not-allowed'
                            )}
                            title={t('docker.startContainer')}
                          >
                            {currentAction === 'start' ? (
                              <Loader2 className="w-4 h-4 animate-spin text-status-success" />
                            ) : (
                              <Play className="w-4 h-4 text-status-success" />
                            )}
                          </button>
                        )}

                        {/* Restart */}
                        <button
                          onClick={() => handleAction(container.id, 'restart')}
                          disabled={isLoading}
                          className={cn(
                            'p-1.5 rounded transition-colors',
                            hoverBg,
                            'disabled:opacity-50 disabled:cursor-not-allowed'
                          )}
                          title={t('docker.restartContainer')}
                        >
                          {currentAction === 'restart' ? (
                            <Loader2 className="w-4 h-4 animate-spin text-status-info" />
                          ) : (
                            <RefreshCw className="w-4 h-4 text-status-info" />
                          )}
                        </button>

                        {/* Logs */}
                        <button
                          onClick={() => onViewLogs?.(container.id, container.name)}
                          disabled={isLoading}
                          className={cn(
                            'p-1.5 rounded transition-colors',
                            hoverBg,
                            'disabled:opacity-50 disabled:cursor-not-allowed'
                          )}
                          title={t('docker.viewLogs')}
                        >
                          <FileText className={cn('w-4 h-4', textSecondary)} />
                        </button>

                        {/* Stats (only for running containers) */}
                        {isRunning && (
                          <button
                            onClick={() => onViewStats?.(container.id, container.name)}
                            disabled={isLoading}
                            className={cn(
                              'p-1.5 rounded transition-colors',
                              hoverBg,
                              'disabled:opacity-50 disabled:cursor-not-allowed'
                            )}
                            title={t('docker.viewStats')}
                          >
                            <BarChart2 className={cn('w-4 h-4', textSecondary)} />
                          </button>
                        )}

                        {/* Terminal (only for running containers) */}
                        {isRunning && (
                          <button
                            onClick={() => onOpenTerminal?.(container.id, container.name)}
                            disabled={isLoading}
                            className={cn(
                              'p-1.5 rounded transition-colors',
                              hoverBg,
                              'disabled:opacity-50 disabled:cursor-not-allowed'
                            )}
                            title={t('docker.openTerminal')}
                          >
                            <Terminal className={cn('w-4 h-4', textSecondary)} />
                          </button>
                        )}

                        {/* Remove */}
                        <button
                          onClick={() => handleAction(container.id, 'remove')}
                          disabled={isLoading}
                          className={cn(
                            'p-1.5 rounded transition-colors',
                            hoverBg,
                            'disabled:opacity-50 disabled:cursor-not-allowed'
                          )}
                          title={t('docker.removeContainer')}
                        >
                          {currentAction === 'remove' ? (
                            <Loader2 className="w-4 h-4 animate-spin text-status-error" />
                          ) : (
                            <Trash2 className="w-4 h-4 text-status-error" />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
