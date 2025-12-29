/**
 * Docker Settings Component
 *
 * Displays and manages Docker daemon settings.
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { useThemeStore } from '@/stores'
import {
  RefreshCw,
  Settings,
  Plus,
  X,
  Save,
  Power,
  RotateCcw,
  AlertTriangle,
  HardDrive,
  Plug,
  Cpu,
  Activity,
  Globe,
} from 'lucide-react'
import {
  dockerGetSettings,
  dockerUpdateRegistryMirrors,
  dockerStopDaemon,
  dockerRestartDaemon,
  type DockerSettings as DockerSettingsType,
} from '@/services/docker'

interface DockerSettingsProps {
  connectionId: string
}

export function DockerSettings({ connectionId }: DockerSettingsProps) {
  const { t } = useTranslation()
  const { theme } = useThemeStore()
  const isDark = theme === 'dark'

  const [settings, setSettings] = useState<DockerSettingsType | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  // Editable registry mirrors
  const [mirrors, setMirrors] = useState<string[]>([])
  const [newMirror, setNewMirror] = useState('')

  // Theme styles
  const styles = useMemo(
    () => ({
      bgPrimary: isDark ? 'bg-dark-bg-primary' : 'bg-light-bg-primary',
      bgSecondary: isDark ? 'bg-dark-bg-secondary' : 'bg-light-bg-secondary',
      borderColor: isDark ? 'border-dark-border' : 'border-light-border',
      textPrimary: isDark ? 'text-dark-text-primary' : 'text-light-text-primary',
      textSecondary: isDark ? 'text-dark-text-secondary' : 'text-light-text-secondary',
      cardBg: isDark ? 'bg-dark-bg-tertiary' : 'bg-white',
      cardBorder: isDark ? 'border-dark-border' : 'border-gray-200',
      inputBg: isDark ? 'bg-dark-bg-secondary' : 'bg-white',
      inputBorder: isDark ? 'border-dark-border' : 'border-gray-300',
    }),
    [isDark]
  )

  // Load settings
  const loadSettings = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await dockerGetSettings(connectionId)
      setSettings(data)
      setMirrors(data.registryMirrors || [])
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }, [connectionId])

  useEffect(() => {
    loadSettings()
  }, [loadSettings])

  // Add a mirror
  const handleAddMirror = () => {
    if (newMirror.trim() && !mirrors.includes(newMirror.trim())) {
      setMirrors([...mirrors, newMirror.trim()])
      setNewMirror('')
    }
  }

  // Remove a mirror
  const handleRemoveMirror = (index: number) => {
    setMirrors(mirrors.filter((_, i) => i !== index))
  }

  // Save mirrors
  const handleSaveMirrors = async () => {
    setSaving(true)
    setError(null)
    setSuccessMessage(null)
    try {
      await dockerUpdateRegistryMirrors(connectionId, mirrors)
      setSuccessMessage(t('docker.mirrorsSaved'))
      setTimeout(() => setSuccessMessage(null), 3000)
    } catch (err) {
      setError(String(err))
    } finally {
      setSaving(false)
    }
  }

  // Stop daemon
  const handleStopDaemon = async () => {
    if (!confirm(t('docker.confirmStopDaemon'))) return
    setError(null)
    try {
      await dockerStopDaemon(connectionId)
      setSuccessMessage(t('docker.daemonStopped'))
    } catch (err) {
      setError(String(err))
    }
  }

  // Restart daemon
  const handleRestartDaemon = async () => {
    if (!confirm(t('docker.confirmRestartDaemon'))) return
    setError(null)
    try {
      await dockerRestartDaemon(connectionId)
      setSuccessMessage(t('docker.daemonRestarted'))
    } catch (err) {
      setError(String(err))
    }
  }

  if (loading) {
    return (
      <div className={cn('flex items-center justify-center h-full', styles.textSecondary)}>
        <RefreshCw className="w-6 h-6 animate-spin mr-2" />
        {t('common.loading')}
      </div>
    )
  }

  return (
    <div className={cn('h-full overflow-auto p-4', styles.bgPrimary)}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className={cn('text-lg font-semibold flex items-center', styles.textPrimary)}>
          <Settings className="w-5 h-5 mr-2" />
          {t('docker.settings')}
        </h2>
        <button
          onClick={loadSettings}
          disabled={loading}
          className={cn(
            'p-2 rounded transition-colors',
            styles.textSecondary,
            'hover:bg-accent-primary/10'
          )}
          title={t('common.refresh')}
        >
          <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
        </button>
      </div>

      {/* Messages */}
      {error && (
        <div className="mb-4 px-4 py-2 bg-status-error/10 text-status-error border border-status-error/30 rounded text-sm">
          {error}
        </div>
      )}
      {successMessage && (
        <div className="mb-4 px-4 py-2 bg-status-success/10 text-status-success border border-status-success/30 rounded text-sm">
          {successMessage}
        </div>
      )}

      {/* Basic Info */}
      <div className={cn('rounded-lg border p-4 mb-4', styles.cardBg, styles.cardBorder)}>
        <h3 className={cn('text-md font-medium mb-3', styles.textPrimary)}>
          {t('docker.basicInfo')}
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Storage Path */}
          <div className="flex items-start gap-3">
            <HardDrive className={cn('w-5 h-5 mt-0.5', styles.textSecondary)} />
            <div>
              <div className={cn('text-sm font-medium', styles.textSecondary)}>
                {t('docker.storagePath')}
              </div>
              <div className={cn('text-sm', styles.textPrimary)}>
                {settings?.storagePath || '-'}
              </div>
            </div>
          </div>

          {/* Socket Path */}
          <div className="flex items-start gap-3">
            <Plug className={cn('w-5 h-5 mt-0.5', styles.textSecondary)} />
            <div>
              <div className={cn('text-sm font-medium', styles.textSecondary)}>
                {t('docker.socketPath')}
              </div>
              <div className={cn('text-sm', styles.textPrimary)}>
                {settings?.socketPath || '-'}
              </div>
            </div>
          </div>

          {/* Cgroup Driver */}
          <div className="flex items-start gap-3">
            <Cpu className={cn('w-5 h-5 mt-0.5', styles.textSecondary)} />
            <div>
              <div className={cn('text-sm font-medium', styles.textSecondary)}>
                {t('docker.cgroupDriver')}
              </div>
              <div className={cn('text-sm', styles.textPrimary)}>
                {settings?.cgroupDriver || '-'}
              </div>
            </div>
          </div>

          {/* Live Restore */}
          <div className="flex items-start gap-3">
            <Activity className={cn('w-5 h-5 mt-0.5', styles.textSecondary)} />
            <div>
              <div className={cn('text-sm font-medium', styles.textSecondary)}>
                {t('docker.liveRestore')}
              </div>
              <div className={cn('text-sm', styles.textPrimary)}>
                {settings?.liveRestore ? t('common.enabled') : t('common.disabled')}
              </div>
            </div>
          </div>

          {/* IPv6 */}
          <div className="flex items-start gap-3">
            <Globe className={cn('w-5 h-5 mt-0.5', styles.textSecondary)} />
            <div>
              <div className={cn('text-sm font-medium', styles.textSecondary)}>
                {t('docker.ipv6Enabled')}
              </div>
              <div className={cn('text-sm', styles.textPrimary)}>
                {settings?.ipv6Enabled ? t('common.enabled') : t('common.disabled')}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Registry Mirrors */}
      <div className={cn('rounded-lg border p-4 mb-4', styles.cardBg, styles.cardBorder)}>
        <h3 className={cn('text-md font-medium mb-3', styles.textPrimary)}>
          {t('docker.registryMirrors')}
        </h3>
        <p className={cn('text-sm mb-3', styles.textSecondary)}>
          {t('docker.registryMirrorsDesc')}
        </p>

        {/* Mirror List */}
        <div className="space-y-2 mb-3">
          {mirrors.map((mirror, index) => (
            <div
              key={index}
              className={cn(
                'flex items-center justify-between px-3 py-2 rounded border',
                styles.inputBg,
                styles.inputBorder
              )}
            >
              <span className={cn('text-sm', styles.textPrimary)}>{mirror}</span>
              <button
                onClick={() => handleRemoveMirror(index)}
                className="p-1 text-status-error hover:bg-status-error/10 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
          {mirrors.length === 0 && (
            <p className={cn('text-sm italic', styles.textSecondary)}>
              {t('docker.noMirrors')}
            </p>
          )}
        </div>

        {/* Add Mirror */}
        <div className="flex gap-2 mb-3">
          <input
            type="text"
            value={newMirror}
            onChange={(e) => setNewMirror(e.target.value)}
            placeholder="https://mirror.example.com"
            className={cn(
              'flex-1 px-3 py-2 rounded border text-sm',
              styles.inputBg,
              styles.inputBorder,
              styles.textPrimary,
              'focus:outline-none focus:ring-1 focus:ring-accent-primary'
            )}
            onKeyDown={(e) => e.key === 'Enter' && handleAddMirror()}
          />
          <button
            onClick={handleAddMirror}
            className="px-3 py-2 bg-accent-primary text-white rounded hover:bg-accent-hover flex items-center"
          >
            <Plus className="w-4 h-4 mr-1" />
            {t('common.add')}
          </button>
        </div>

        {/* Save Button */}
        <button
          onClick={handleSaveMirrors}
          disabled={saving}
          className={cn(
            'px-4 py-2 bg-accent-primary text-white rounded hover:bg-accent-hover flex items-center',
            'disabled:opacity-50 disabled:cursor-not-allowed'
          )}
        >
          <Save className="w-4 h-4 mr-1" />
          {saving ? t('common.saving') : t('common.save')}
        </button>
      </div>

      {/* Daemon Control */}
      <div className={cn('rounded-lg border p-4', styles.cardBg, styles.cardBorder)}>
        <h3 className={cn('text-md font-medium mb-3 flex items-center', styles.textPrimary)}>
          <AlertTriangle className="w-4 h-4 mr-2 text-status-warning" />
          {t('docker.daemonControl')}
        </h3>
        <p className={cn('text-sm mb-4', styles.textSecondary)}>
          {t('docker.daemonControlDesc')}
        </p>

        <div className="flex gap-3">
          <button
            onClick={handleRestartDaemon}
            className="px-4 py-2 bg-status-warning text-white rounded hover:bg-status-warning/80 flex items-center"
          >
            <RotateCcw className="w-4 h-4 mr-1" />
            {t('docker.restartDaemon')}
          </button>
          <button
            onClick={handleStopDaemon}
            className="px-4 py-2 bg-status-error text-white rounded hover:bg-status-error/80 flex items-center"
          >
            <Power className="w-4 h-4 mr-1" />
            {t('docker.stopDaemon')}
          </button>
        </div>
      </div>
    </div>
  )
}
