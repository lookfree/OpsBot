/**
 * Volume List Component
 *
 * Displays Docker volumes with management actions.
 */

import { useState, useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import {
  HardDrive,
  Plus,
  RefreshCw,
  Trash2,
  Loader2,
  AlertCircle,
  Scissors,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useThemeStore } from '@/stores'
import {
  dockerListVolumes,
  dockerCreateVolume,
  dockerRemoveVolume,
  dockerPruneVolumes,
  formatBytes,
  type VolumeInfo,
  type CreateVolumeRequest,
} from '@/services/docker'

interface VolumeListProps {
  connectionId: string
}

export function VolumeList({ connectionId }: VolumeListProps) {
  const { t } = useTranslation()
  const { theme } = useThemeStore()
  const isDark = theme === 'dark'

  const [volumes, setVolumes] = useState<VolumeInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({})
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [isPruning, setIsPruning] = useState(false)

  const loadVolumes = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await dockerListVolumes(connectionId)
      setVolumes(data)
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }, [connectionId])

  useEffect(() => {
    loadVolumes()
  }, [loadVolumes])

  const handleRemove = useCallback(
    async (volumeName: string, force: boolean = false) => {
      setActionLoading((prev) => ({ ...prev, [volumeName]: true }))
      try {
        await dockerRemoveVolume(connectionId, volumeName, force)
        await loadVolumes()
      } catch (err) {
        setError(String(err))
      } finally {
        setActionLoading((prev) => {
          const next = { ...prev }
          delete next[volumeName]
          return next
        })
      }
    },
    [connectionId, loadVolumes]
  )

  const handlePrune = useCallback(async () => {
    setIsPruning(true)
    try {
      const result = await dockerPruneVolumes(connectionId)
      if (result.deletedCount > 0) {
        await loadVolumes()
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setIsPruning(false)
    }
  }, [connectionId, loadVolumes])

  const handleCreate = useCallback(
    async (config: CreateVolumeRequest) => {
      try {
        await dockerCreateVolume(connectionId, config)
        setShowCreateDialog(false)
        await loadVolumes()
      } catch (err) {
        throw err
      }
    },
    [connectionId, loadVolumes]
  )

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
        <h3 className={cn('font-medium', textPrimary)}>{t('docker.volumes')}</h3>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCreateDialog(true)}
            className={cn(
              'flex items-center gap-1 px-2 py-1 text-sm rounded',
              'bg-accent-primary text-white hover:bg-accent-hover',
              'transition-colors'
            )}
          >
            <Plus className="w-4 h-4" />
            {t('docker.createVolume')}
          </button>
          <button
            onClick={handlePrune}
            disabled={isPruning}
            className={cn(
              'flex items-center gap-1 px-2 py-1 text-sm rounded',
              bgSecondary,
              hoverBg,
              'transition-colors',
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
            title={t('docker.pruneVolumes')}
          >
            {isPruning ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Scissors className="w-4 h-4" />
            )}
            {t('docker.prune')}
          </button>
          <button
            onClick={loadVolumes}
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
        {error && volumes.length > 0 && (
          <div className="flex items-center gap-2 px-4 py-2 text-sm text-status-error bg-status-error/10 border-b border-status-error/20">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span className="flex-1">{error}</span>
            <button onClick={() => setError(null)} className="opacity-70 hover:opacity-100">✕</button>
          </div>
        )}
        {loading && volumes.length === 0 ? (
          <div className={cn('flex items-center justify-center h-32', textSecondary)}>
            <Loader2 className="w-6 h-6 animate-spin mr-2" />
            {t('common.loading')}
          </div>
        ) : error && volumes.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-status-error">
            <AlertCircle className="w-5 h-5 mr-2" />
            {error}
          </div>
        ) : volumes.length === 0 ? (
          <div className={cn('flex items-center justify-center h-32', textSecondary)}>
            {t('docker.noVolumes')}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className={cn(bgSecondary)}>
              <tr className={borderColor}>
                <th className={cn('px-4 py-2 text-left font-medium', textSecondary)}>
                  {t('docker.volumeName')}
                </th>
                <th className={cn('px-4 py-2 text-left font-medium', textSecondary)}>
                  {t('docker.volumeDriver')}
                </th>
                <th className={cn('px-4 py-2 text-left font-medium', textSecondary)}>
                  {t('docker.volumeMountpoint')}
                </th>
                <th className={cn('px-4 py-2 text-left font-medium', textSecondary)}>
                  {t('docker.volumeCreated')}
                </th>
                <th className={cn('px-4 py-2 text-left font-medium', textSecondary)}>
                  {t('docker.volumeSize')}
                </th>
                <th className={cn('px-4 py-2 text-right font-medium', textSecondary)}>
                  {t('common.actions')}
                </th>
              </tr>
            </thead>
            <tbody>
              {volumes.map((volume) => {
                const isLoading = !!actionLoading[volume.name]

                return (
                  <tr
                    key={volume.name}
                    className={cn('border-b', borderColor, hoverBg, 'transition-colors')}
                  >
                    <td className={cn('px-4 py-2', textPrimary)}>
                      <div className="flex items-center gap-2">
                        <HardDrive className="w-4 h-4 text-status-info" />
                        <span className="font-mono">{volume.name}</span>
                      </div>
                    </td>
                    <td className={cn('px-4 py-2 font-mono text-xs', textSecondary)}>
                      {volume.driver}
                    </td>
                    <td className={cn('px-4 py-2 font-mono text-xs', textSecondary)}>
                      <span className="truncate max-w-[300px] block" title={volume.mountpoint}>
                        {volume.mountpoint}
                      </span>
                    </td>
                    <td className={cn('px-4 py-2 text-xs', textSecondary)}>
                      {formatVolumeCreated(volume.created)}
                    </td>
                    <td className={cn('px-4 py-2 text-xs', textSecondary)}>
                      {volume.size != null ? formatBytes(volume.size) : '-'}
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => handleRemove(volume.name)}
                          disabled={isLoading}
                          className={cn(
                            'p-1.5 rounded transition-colors',
                            hoverBg,
                            'disabled:opacity-50 disabled:cursor-not-allowed'
                          )}
                          title={t('docker.removeVolume')}
                        >
                          {isLoading ? (
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

      {/* Create Volume Dialog */}
      {showCreateDialog && (
        <CreateVolumeDialog
          onClose={() => setShowCreateDialog(false)}
          onCreate={handleCreate}
          isDark={isDark}
        />
      )}
    </div>
  )
}

// Format volume created time
function formatVolumeCreated(created: string): string {
  if (!created) return '-'
  try {
    const date = new Date(created)
    return date.toLocaleString()
  } catch {
    return created
  }
}

// Create Volume Dialog Component
interface CreateVolumeDialogProps {
  onClose: () => void
  onCreate: (config: CreateVolumeRequest) => Promise<void>
  isDark: boolean
}

function CreateVolumeDialog({ onClose, onCreate, isDark }: CreateVolumeDialogProps) {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [driver, setDriver] = useState('local')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const bgPrimary = isDark ? 'bg-dark-bg-primary' : 'bg-light-bg-primary'
  const bgSecondary = isDark ? 'bg-dark-bg-secondary' : 'bg-light-bg-secondary'
  const borderColor = isDark ? 'border-dark-border' : 'border-light-border'
  const textPrimary = isDark ? 'text-dark-text-primary' : 'text-light-text-primary'
  const textSecondary = isDark ? 'text-dark-text-secondary' : 'text-light-text-secondary'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return

    setLoading(true)
    setError(null)

    try {
      await onCreate({
        name: name.trim(),
        driver: driver || undefined,
      })
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className={cn('w-[420px] rounded-lg shadow-xl', bgPrimary, borderColor, 'border')}>
        <div className={cn('px-4 py-3 border-b', borderColor)}>
          <h3 className={cn('font-medium', textPrimary)}>{t('docker.createVolume')}</h3>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {error && (
            <div className="px-3 py-2 rounded bg-status-error/10 text-status-error text-sm">
              {error}
            </div>
          )}

          {/* Volume Name */}
          <div>
            <label className={cn('block text-sm font-medium mb-1', textSecondary)}>
              {t('docker.volumeName')} *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="my-volume"
              className={cn(
                'w-full px-3 py-2 rounded border text-sm',
                bgSecondary,
                borderColor,
                textPrimary,
                'focus:outline-none focus:ring-2 focus:ring-accent-primary'
              )}
              autoFocus
            />
          </div>

          {/* Driver */}
          <div>
            <label className={cn('block text-sm font-medium mb-1', textSecondary)}>
              {t('docker.volumeDriver')}
            </label>
            <select
              value={driver}
              onChange={(e) => setDriver(e.target.value)}
              className={cn(
                'w-full px-3 py-2 rounded border text-sm',
                bgSecondary,
                borderColor,
                textPrimary,
                'focus:outline-none focus:ring-2 focus:ring-accent-primary'
              )}
            >
              <option value="local">local</option>
            </select>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className={cn(
                'px-4 py-2 text-sm rounded',
                bgSecondary,
                textSecondary,
                'hover:opacity-80 transition-opacity'
              )}
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={!name.trim() || loading}
              className={cn(
                'px-4 py-2 text-sm rounded',
                'bg-accent-primary text-white',
                'hover:bg-accent-hover transition-colors',
                'disabled:opacity-50 disabled:cursor-not-allowed'
              )}
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                t('common.confirm')
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
