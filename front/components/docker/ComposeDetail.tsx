/**
 * Compose Detail Component
 *
 * Shows compose project details with containers, logs, and YAML editor.
 * Reference: 1Panel compose detail UI
 */

import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Layers,
  Play,
  Square,
  RotateCw,
  Trash2,
  Loader2,
  AlertCircle,
  FolderOpen,
  Save,
  Container,
  FileText,
  Terminal,
  Activity,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  dockerGetComposeContainers,
  dockerGetComposeContent,
  dockerGetComposeLogs,
  dockerUpdateComposeContent,
  type ComposeProject,
  type ComposeContainer,
} from '@/services/docker'

type DetailTab = 'containers' | 'editor' | 'logs'

interface ComposeDetailProps {
  connectionId: string
  project: ComposeProject
  onRefresh: () => void
  onStart: () => void
  onStop: () => void
  onRestart: () => void
  onRemove: (removeVolumes: boolean) => void
  onOpenPath: () => void
  isLoading: boolean
  isDark: boolean
}

export function ComposeDetail({
  connectionId,
  project,
  onRefresh,
  onStart,
  onStop,
  onRestart,
  onRemove,
  onOpenPath,
  isLoading,
  isDark,
}: ComposeDetailProps) {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState<DetailTab>('containers')
  const [containers, setContainers] = useState<ComposeContainer[]>([])
  const [yamlContent, setYamlContent] = useState('')
  const [originalContent, setOriginalContent] = useState('')
  const [logs, setLogs] = useState('')
  const [loadingContainers, setLoadingContainers] = useState(false)
  const [loadingContent, setLoadingContent] = useState(false)
  const [loadingLogs, setLoadingLogs] = useState(false)
  const [savingContent, setSavingContent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [logService, setLogService] = useState<string>('')

  // Theme styles
  const styles = useMemo(
    () => ({
      bgPrimary: isDark ? 'bg-dark-bg-primary' : 'bg-light-bg-primary',
      bgSecondary: isDark ? 'bg-dark-bg-secondary' : 'bg-light-bg-secondary',
      borderColor: isDark ? 'border-dark-border' : 'border-light-border',
      textPrimary: isDark ? 'text-dark-text-primary' : 'text-light-text-primary',
      textSecondary: isDark ? 'text-dark-text-secondary' : 'text-light-text-secondary',
      hoverBg: isDark ? 'hover:bg-dark-bg-hover' : 'hover:bg-light-bg-hover',
    }),
    [isDark]
  )

  const hasChanges = yamlContent !== originalContent

  // Load containers
  const loadContainers = useCallback(async () => {
    setLoadingContainers(true)
    setError(null)
    try {
      const data = await dockerGetComposeContainers(connectionId, project.name)
      setContainers(data)
    } catch (err) {
      setError(String(err))
    } finally {
      setLoadingContainers(false)
    }
  }, [connectionId, project.name])

  // Load YAML content
  const loadContent = useCallback(async () => {
    setLoadingContent(true)
    setError(null)
    try {
      const content = await dockerGetComposeContent(connectionId, project.name)
      setYamlContent(content)
      setOriginalContent(content)
    } catch (err) {
      setError(String(err))
    } finally {
      setLoadingContent(false)
    }
  }, [connectionId, project.name])

  // Load logs
  const loadLogs = useCallback(async () => {
    setLoadingLogs(true)
    setError(null)
    try {
      const logData = await dockerGetComposeLogs(
        connectionId,
        project.name,
        200,
        logService || undefined
      )
      setLogs(logData)
    } catch (err) {
      setError(String(err))
    } finally {
      setLoadingLogs(false)
    }
  }, [connectionId, project.name, logService])

  // Save YAML content
  const handleSaveContent = useCallback(async () => {
    setSavingContent(true)
    setError(null)
    try {
      await dockerUpdateComposeContent(connectionId, {
        name: project.name,
        content: yamlContent,
      })
      setOriginalContent(yamlContent)
      onRefresh()
    } catch (err) {
      setError(String(err))
    } finally {
      setSavingContent(false)
    }
  }, [connectionId, project.name, yamlContent, onRefresh])

  // Load the editor YAML at most once per mount. This component is keyed by
  // project name in ComposeList, so a project switch is a fresh mount (all state
  // reset); reloading the YAML every time the user re-opens the editor tab would
  // silently discard their unsaved edits.
  const contentLoadedRef = useRef(false)

  // Load data when project or tab changes
  useEffect(() => {
    if (activeTab === 'containers') {
      loadContainers()
    } else if (activeTab === 'editor') {
      if (!contentLoadedRef.current) {
        contentLoadedRef.current = true
        loadContent()
      }
    } else if (activeTab === 'logs') {
      loadLogs()
    }
  }, [activeTab, project.name, loadContainers, loadContent, loadLogs])

  const hasRunning = project.runningCount > 0

  return (
    <div className={cn('h-full flex flex-col', styles.bgPrimary)}>
      {/* Header */}
      <div className={cn('flex items-center justify-between px-4 py-3 border-b', styles.borderColor)}>
        <div className="flex items-center gap-3">
          <Layers className={cn('w-5 h-5', hasRunning ? 'text-status-success' : 'text-status-warning')} />
          <div>
            <h2 className={cn('font-medium', styles.textPrimary)}>{project.name}</h2>
            <span className={cn('text-xs', styles.textSecondary)}>
              {project.runningCount}/{project.totalCount} {t('docker.running')} · {project.path}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onOpenPath}
            className={cn(
              'flex items-center gap-1 px-2 py-1 text-sm rounded',
              styles.bgSecondary,
              styles.hoverBg,
              'transition-colors'
            )}
            title={t('docker.openDirectory')}
          >
            <FolderOpen className="w-4 h-4" />
          </button>
          {hasRunning ? (
            <button
              onClick={onStop}
              disabled={isLoading}
              className={cn(
                'flex items-center gap-1 px-2 py-1 text-sm rounded',
                'bg-status-warning/20 text-status-warning hover:bg-status-warning/30',
                'transition-colors disabled:opacity-50'
              )}
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Square className="w-4 h-4" />}
              {t('docker.stop')}
            </button>
          ) : (
            <button
              onClick={onStart}
              disabled={isLoading}
              className={cn(
                'flex items-center gap-1 px-2 py-1 text-sm rounded',
                'bg-status-success/20 text-status-success hover:bg-status-success/30',
                'transition-colors disabled:opacity-50'
              )}
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              {t('docker.start')}
            </button>
          )}
          <button
            onClick={onRestart}
            disabled={isLoading}
            className={cn(
              'flex items-center gap-1 px-2 py-1 text-sm rounded',
              styles.bgSecondary,
              styles.hoverBg,
              'transition-colors disabled:opacity-50'
            )}
          >
            <RotateCw className="w-4 h-4" />
            {t('docker.restart')}
          </button>
          <button
            onClick={() => onRemove(false)}
            disabled={isLoading}
            className={cn(
              'flex items-center gap-1 px-2 py-1 text-sm rounded',
              'bg-status-error/20 text-status-error hover:bg-status-error/30',
              'transition-colors disabled:opacity-50'
            )}
          >
            <Trash2 className="w-4 h-4" />
            {t('common.delete')}
          </button>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className={cn('flex border-b', styles.borderColor)}>
        <TabButton
          active={activeTab === 'containers'}
          onClick={() => setActiveTab('containers')}
          icon={<Container className="w-4 h-4" />}
          label={t('docker.containers')}
          styles={styles}
        />
        <TabButton
          active={activeTab === 'editor'}
          onClick={() => setActiveTab('editor')}
          icon={<FileText className="w-4 h-4" />}
          label={t('docker.composeEditor')}
          badge={hasChanges ? '*' : undefined}
          styles={styles}
        />
        <TabButton
          active={activeTab === 'logs'}
          onClick={() => setActiveTab('logs')}
          icon={<Terminal className="w-4 h-4" />}
          label={t('docker.logs')}
          styles={styles}
        />
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-hidden">
        {error && (
          <div className="px-4 py-2 bg-status-error/10 text-status-error text-sm flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            {error}
          </div>
        )}

        {activeTab === 'containers' && (
          <ContainersTab
            containers={containers}
            loading={loadingContainers}
            styles={styles}
            t={t}
          />
        )}

        {activeTab === 'editor' && (
          <EditorTab
            content={yamlContent}
            onChange={setYamlContent}
            onSave={handleSaveContent}
            loading={loadingContent}
            saving={savingContent}
            hasChanges={hasChanges}
            styles={styles}
            t={t}
          />
        )}

        {activeTab === 'logs' && (
          <LogsTab
            logs={logs}
            loading={loadingLogs}
            onRefresh={loadLogs}
            containers={containers}
            selectedService={logService}
            onServiceChange={setLogService}
            styles={styles}
            t={t}
          />
        )}
      </div>
    </div>
  )
}

// Tab Button Component
interface TabButtonProps {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
  badge?: string
  styles: {
    textPrimary: string
    textSecondary: string
    hoverBg: string
  }
}

function TabButton({ active, onClick, icon, label, badge, styles }: TabButtonProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors',
        active
          ? cn('border-accent-primary', styles.textPrimary)
          : cn('border-transparent', styles.textSecondary, styles.hoverBg)
      )}
    >
      {icon}
      {label}
      {badge && <span className="text-status-warning">{badge}</span>}
    </button>
  )
}

// Containers Tab
interface ContainersTabProps {
  containers: ComposeContainer[]
  loading: boolean
  styles: {
    bgSecondary: string
    borderColor: string
    textPrimary: string
    textSecondary: string
    hoverBg: string
  }
  t: (key: string) => string
}

function ContainersTab({ containers, loading, styles, t }: ContainersTabProps) {
  if (loading) {
    return (
      <div className={cn('flex items-center justify-center h-32', styles.textSecondary)}>
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        {t('common.loading')}
      </div>
    )
  }

  if (containers.length === 0) {
    return (
      <div className={cn('flex items-center justify-center h-32', styles.textSecondary)}>
        {t('docker.noContainers')}
      </div>
    )
  }

  return (
    <div className="overflow-auto h-full">
      <table className="w-full text-sm">
        <thead className={cn(styles.bgSecondary)}>
          <tr>
            <th className={cn('px-4 py-2 text-left font-medium', styles.textSecondary)}>
              {t('docker.service')}
            </th>
            <th className={cn('px-4 py-2 text-left font-medium', styles.textSecondary)}>
              {t('docker.containerName')}
            </th>
            <th className={cn('px-4 py-2 text-left font-medium', styles.textSecondary)}>
              {t('docker.image')}
            </th>
            <th className={cn('px-4 py-2 text-left font-medium', styles.textSecondary)}>
              {t('docker.state')}
            </th>
            <th className={cn('px-4 py-2 text-left font-medium', styles.textSecondary)}>
              CPU
            </th>
            <th className={cn('px-4 py-2 text-left font-medium', styles.textSecondary)}>
              {t('docker.memory')}
            </th>
            <th className={cn('px-4 py-2 text-left font-medium', styles.textSecondary)}>
              {t('docker.ports')}
            </th>
          </tr>
        </thead>
        <tbody>
          {containers.map((container) => (
            <tr
              key={container.id}
              className={cn('border-b', styles.borderColor, styles.hoverBg)}
            >
              <td className={cn('px-4 py-2', styles.textPrimary)}>
                <div className="flex items-center gap-2">
                  <Container className="w-4 h-4 text-accent-primary" />
                  {container.service}
                </div>
              </td>
              <td className={cn('px-4 py-2 font-mono text-xs', styles.textSecondary)}>
                {container.name}
              </td>
              <td className={cn('px-4 py-2 font-mono text-xs', styles.textSecondary)}>
                {container.image}
              </td>
              <td className="px-4 py-2">
                <span
                  className={cn(
                    'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs',
                    container.state === 'running'
                      ? 'bg-status-success/20 text-status-success'
                      : 'bg-status-error/20 text-status-error'
                  )}
                >
                  <span
                    className={cn(
                      'w-1.5 h-1.5 rounded-full',
                      container.state === 'running' ? 'bg-status-success' : 'bg-status-error'
                    )}
                  />
                  {container.state}
                </span>
              </td>
              <td className={cn('px-4 py-2 text-xs', styles.textSecondary)}>
                {container.cpuPercent != null ? `${container.cpuPercent.toFixed(1)}%` : '-'}
              </td>
              <td className={cn('px-4 py-2 text-xs', styles.textSecondary)}>
                {container.memoryPercent != null ? `${container.memoryPercent.toFixed(1)}%` : '-'}
              </td>
              <td className={cn('px-4 py-2 font-mono text-xs', styles.textSecondary)}>
                {container.ports.length > 0
                  ? container.ports.map((p) => `${p.hostPort || '-'}:${p.containerPort}`).join(', ')
                  : '-'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// Editor Tab
interface EditorTabProps {
  content: string
  onChange: (content: string) => void
  onSave: () => void
  loading: boolean
  saving: boolean
  hasChanges: boolean
  styles: {
    bgSecondary: string
    borderColor: string
    textPrimary: string
    textSecondary: string
  }
  t: (key: string) => string
}

function EditorTab({
  content,
  onChange,
  onSave,
  loading,
  saving,
  hasChanges,
  styles,
  t,
}: EditorTabProps) {
  if (loading) {
    return (
      <div className={cn('flex items-center justify-center h-32', styles.textSecondary)}>
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        {t('common.loading')}
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      {/* Editor Toolbar */}
      <div className={cn('flex items-center justify-between px-4 py-2 border-b', styles.borderColor)}>
        <span className={cn('text-sm', styles.textSecondary)}>docker-compose.yml</span>
        <button
          onClick={onSave}
          disabled={!hasChanges || saving}
          className={cn(
            'flex items-center gap-1 px-3 py-1 text-sm rounded',
            hasChanges
              ? 'bg-accent-primary text-white hover:bg-accent-hover'
              : cn(styles.bgSecondary, styles.textSecondary, 'opacity-50'),
            'transition-colors disabled:cursor-not-allowed'
          )}
        >
          {saving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          {t('common.save')}
        </button>
      </div>
      {/* Editor Area */}
      <div className="flex-1 overflow-hidden">
        <textarea
          value={content}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            'w-full h-full p-4 font-mono text-sm resize-none',
            styles.bgSecondary,
            styles.textPrimary,
            'focus:outline-none'
          )}
          spellCheck={false}
        />
      </div>
    </div>
  )
}

// Logs Tab
interface LogsTabProps {
  logs: string
  loading: boolean
  onRefresh: () => void
  containers: ComposeContainer[]
  selectedService: string
  onServiceChange: (service: string) => void
  styles: {
    bgSecondary: string
    borderColor: string
    textPrimary: string
    textSecondary: string
    hoverBg: string
  }
  t: (key: string) => string
}

function LogsTab({
  logs,
  loading,
  onRefresh,
  containers,
  selectedService,
  onServiceChange,
  styles,
  t,
}: LogsTabProps) {
  const services = [...new Set(containers.map((c) => c.service))]

  return (
    <div className="h-full flex flex-col">
      {/* Logs Toolbar */}
      <div className={cn('flex items-center gap-4 px-4 py-2 border-b', styles.borderColor)}>
        <select
          value={selectedService}
          onChange={(e) => onServiceChange(e.target.value)}
          className={cn(
            'px-2 py-1 text-sm rounded border',
            styles.bgSecondary,
            styles.borderColor,
            styles.textPrimary
          )}
        >
          <option value="">{t('docker.allServices')}</option>
          {services.map((service) => (
            <option key={service} value={service}>
              {service}
            </option>
          ))}
        </select>
        <button
          onClick={onRefresh}
          disabled={loading}
          className={cn(
            'p-1.5 rounded transition-colors',
            styles.hoverBg,
            'disabled:opacity-50'
          )}
          title={t('common.refresh')}
        >
          <Activity className={cn('w-4 h-4', loading && 'animate-spin')} />
        </button>
      </div>
      {/* Logs Area */}
      <div className={cn('flex-1 overflow-auto p-4', styles.bgSecondary)}>
        {loading ? (
          <div className={cn('flex items-center justify-center h-32', styles.textSecondary)}>
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            {t('common.loading')}
          </div>
        ) : logs ? (
          <pre className={cn('font-mono text-xs whitespace-pre-wrap', styles.textPrimary)}>
            {logs}
          </pre>
        ) : (
          <div className={cn('text-center', styles.textSecondary)}>{t('docker.noLogs')}</div>
        )}
      </div>
    </div>
  )
}
