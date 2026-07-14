/**
 * Compose List Component
 *
 * Displays Docker Compose projects with management actions.
 * Reference: 1Panel compose management UI
 */

import { useState, useCallback, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Layers,
  Plus,
  RefreshCw,
  Play,
  Square,
  RotateCw,
  Loader2,
  AlertCircle,
  FileText,
  ChevronRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useThemeStore } from '@/stores'
import {
  dockerListComposeProjects,
  dockerStartCompose,
  dockerStopCompose,
  dockerRestartCompose,
  dockerRemoveCompose,
  dockerGetComposePath,
  type ComposeProject,
} from '@/services/docker'
import { ComposeDetail } from './ComposeDetail'
import { CreateComposeDialog } from './CreateComposeDialog'
import { confirm as confirmDialog, message as messageDialog } from '@tauri-apps/plugin-dialog'

interface ComposeListProps {
  connectionId: string
}

export function ComposeList({ connectionId }: ComposeListProps) {
  const { t } = useTranslation()
  const { theme } = useThemeStore()
  const isDark = theme === 'dark'

  const [projects, setProjects] = useState<ComposeProject[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({})
  const [selectedProject, setSelectedProject] = useState<ComposeProject | null>(null)
  const [showCreateDialog, setShowCreateDialog] = useState(false)

  // Theme styles
  const styles = useMemo(
    () => ({
      bgPrimary: isDark ? 'bg-dark-bg-primary' : 'bg-light-bg-primary',
      bgSecondary: isDark ? 'bg-dark-bg-secondary' : 'bg-light-bg-secondary',
      borderColor: isDark ? 'border-dark-border' : 'border-light-border',
      textPrimary: isDark ? 'text-dark-text-primary' : 'text-light-text-primary',
      textSecondary: isDark ? 'text-dark-text-secondary' : 'text-light-text-secondary',
      hoverBg: isDark ? 'hover:bg-dark-bg-hover' : 'hover:bg-light-bg-hover',
      activeBg: isDark ? 'bg-dark-bg-hover' : 'bg-light-bg-hover',
    }),
    [isDark]
  )

  const loadProjects = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await dockerListComposeProjects(connectionId)
      setProjects(data)
      // Auto-select first project if none selected
      if (!selectedProject && data.length > 0) {
        setSelectedProject(data[0])
      } else if (selectedProject) {
        // Update selected project with fresh data
        const updated = data.find((p) => p.name === selectedProject.name)
        if (updated) {
          setSelectedProject(updated)
        } else {
          setSelectedProject(data.length > 0 ? data[0] : null)
        }
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }, [connectionId, selectedProject])

  useEffect(() => {
    loadProjects()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionId])

  const handleStart = useCallback(
    async (projectName: string) => {
      setActionLoading((prev) => ({ ...prev, [projectName]: true }))
      try {
        await dockerStartCompose(connectionId, projectName)
        await loadProjects()
      } catch (err) {
        setError(String(err))
      } finally {
        setActionLoading((prev) => {
          const next = { ...prev }
          delete next[projectName]
          return next
        })
      }
    },
    [connectionId, loadProjects]
  )

  const handleStop = useCallback(
    async (projectName: string) => {
      setActionLoading((prev) => ({ ...prev, [projectName]: true }))
      try {
        await dockerStopCompose(connectionId, projectName)
        await loadProjects()
      } catch (err) {
        setError(String(err))
      } finally {
        setActionLoading((prev) => {
          const next = { ...prev }
          delete next[projectName]
          return next
        })
      }
    },
    [connectionId, loadProjects]
  )

  const handleRestart = useCallback(
    async (projectName: string) => {
      setActionLoading((prev) => ({ ...prev, [projectName]: true }))
      try {
        await dockerRestartCompose(connectionId, projectName)
        await loadProjects()
      } catch (err) {
        setError(String(err))
      } finally {
        setActionLoading((prev) => {
          const next = { ...prev }
          delete next[projectName]
          return next
        })
      }
    },
    [connectionId, loadProjects]
  )

  const handleRemove = useCallback(
    async (projectName: string, removeVolumes: boolean = false) => {
      if (!(await confirmDialog(t('docker.confirmRemoveCompose')))) return

      setActionLoading((prev) => ({ ...prev, [projectName]: true }))
      try {
        await dockerRemoveCompose(connectionId, projectName, removeVolumes)
        if (selectedProject?.name === projectName) {
          setSelectedProject(null)
        }
        await loadProjects()
      } catch (err) {
        setError(String(err))
      } finally {
        setActionLoading((prev) => {
          const next = { ...prev }
          delete next[projectName]
          return next
        })
      }
    },
    [connectionId, loadProjects, selectedProject, t]
  )

  const handleOpenPath = useCallback(
    async (projectName: string) => {
      try {
        const path = await dockerGetComposePath(connectionId, projectName)
        // In a real app, this would open the file explorer
        // For now, just show the path
        messageDialog(`${t('docker.composePath')}: ${path}`)
      } catch (err) {
        setError(String(err))
      }
    },
    [connectionId, t]
  )

  const handleCreateSuccess = useCallback(() => {
    setShowCreateDialog(false)
    loadProjects()
  }, [loadProjects])

  const getStatusColor = (status: string): string => {
    if (status.toLowerCase().includes('running')) return 'text-status-success'
    if (status.toLowerCase().includes('exited')) return 'text-status-error'
    return 'text-status-warning'
  }

  return (
    <div className={cn('h-full flex', styles.bgPrimary)}>
      {/* Left Panel - Project List */}
      <div className={cn('w-72 flex flex-col border-r', styles.borderColor)}>
        {/* Toolbar */}
        <div className={cn('flex items-center justify-between px-3 py-2 border-b', styles.borderColor)}>
          <h3 className={cn('font-medium text-sm', styles.textPrimary)}>
            {t('docker.compose')}
          </h3>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowCreateDialog(true)}
              className={cn(
                'p-1.5 rounded transition-colors',
                'bg-accent-primary text-white hover:bg-accent-hover'
              )}
              title={t('docker.createCompose')}
            >
              <Plus className="w-4 h-4" />
            </button>
            <button
              onClick={loadProjects}
              disabled={loading}
              className={cn(
                'p-1.5 rounded transition-colors',
                styles.hoverBg,
                'disabled:opacity-50 disabled:cursor-not-allowed'
              )}
              title={t('common.refresh')}
            >
              <RefreshCw className={cn('w-4 h-4', styles.textSecondary, loading && 'animate-spin')} />
            </button>
          </div>
        </div>

        {/* Project List */}
        <div className="flex-1 overflow-auto">
          {loading && projects.length === 0 ? (
            <div className={cn('flex items-center justify-center h-32', styles.textSecondary)}>
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
              {t('common.loading')}
            </div>
          ) : error && projects.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-status-error">
              <AlertCircle className="w-5 h-5 mr-2" />
              <span className="text-sm">{error}</span>
            </div>
          ) : projects.length === 0 ? (
            <div className={cn('flex flex-col items-center justify-center h-32', styles.textSecondary)}>
              <Layers className="w-8 h-8 mb-2 opacity-50" />
              <span className="text-sm">{t('docker.noComposeProjects')}</span>
            </div>
          ) : (
            <div className="py-1">
              {projects.map((project) => {
                const isLoading = !!actionLoading[project.name]
                const isSelected = selectedProject?.name === project.name
                const hasRunning = project.runningCount > 0

                return (
                  <div
                    key={project.name}
                    onClick={() => setSelectedProject(project)}
                    className={cn(
                      'px-3 py-2 cursor-pointer transition-colors',
                      isSelected ? styles.activeBg : styles.hoverBg,
                      'border-l-2',
                      isSelected ? 'border-accent-primary' : 'border-transparent'
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <Layers className={cn('w-4 h-4 flex-shrink-0', getStatusColor(project.status))} />
                        <span className={cn('text-sm font-medium truncate', styles.textPrimary)}>
                          {project.name}
                        </span>
                      </div>
                      <ChevronRight className={cn('w-4 h-4 flex-shrink-0', styles.textSecondary)} />
                    </div>
                    <div className="flex items-center justify-between mt-1 ml-6">
                      <span className={cn('text-xs', styles.textSecondary)}>
                        {project.runningCount}/{project.totalCount} {t('docker.running')}
                      </span>
                      {/* Quick Actions */}
                      <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
                        {hasRunning ? (
                          <button
                            onClick={() => handleStop(project.name)}
                            disabled={isLoading}
                            className={cn(
                              'p-1 rounded transition-colors',
                              styles.hoverBg,
                              'disabled:opacity-50'
                            )}
                            title={t('docker.stop')}
                          >
                            {isLoading ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Square className="w-3 h-3 text-status-warning" />
                            )}
                          </button>
                        ) : (
                          <button
                            onClick={() => handleStart(project.name)}
                            disabled={isLoading}
                            className={cn(
                              'p-1 rounded transition-colors',
                              styles.hoverBg,
                              'disabled:opacity-50'
                            )}
                            title={t('docker.start')}
                          >
                            {isLoading ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Play className="w-3 h-3 text-status-success" />
                            )}
                          </button>
                        )}
                        <button
                          onClick={() => handleRestart(project.name)}
                          disabled={isLoading}
                          className={cn(
                            'p-1 rounded transition-colors',
                            styles.hoverBg,
                            'disabled:opacity-50'
                          )}
                          title={t('docker.restart')}
                        >
                          <RotateCw className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Right Panel - Project Detail */}
      <div className="flex-1 overflow-hidden">
        {selectedProject ? (
          <ComposeDetail
            connectionId={connectionId}
            project={selectedProject}
            onRefresh={loadProjects}
            onStart={() => handleStart(selectedProject.name)}
            onStop={() => handleStop(selectedProject.name)}
            onRestart={() => handleRestart(selectedProject.name)}
            onRemove={(removeVolumes) => handleRemove(selectedProject.name, removeVolumes)}
            onOpenPath={() => handleOpenPath(selectedProject.name)}
            isLoading={!!actionLoading[selectedProject.name]}
            isDark={isDark}
          />
        ) : (
          <div className={cn('flex flex-col items-center justify-center h-full', styles.textSecondary)}>
            <FileText className="w-12 h-12 mb-4 opacity-50" />
            <span>{t('docker.selectComposeProject')}</span>
          </div>
        )}
      </div>

      {/* Create Dialog */}
      {showCreateDialog && (
        <CreateComposeDialog
          connectionId={connectionId}
          onClose={() => setShowCreateDialog(false)}
          onSuccess={handleCreateSuccess}
          isDark={isDark}
        />
      )}
    </div>
  )
}
