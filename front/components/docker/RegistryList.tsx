/**
 * Registry List Component
 *
 * Displays Docker registries with management actions.
 */

import { useState, useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Plus,
  RefreshCw,
  Trash2,
  Loader2,
  AlertCircle,
  Edit2,
  Plug,
  Search,
  Download,
  CheckCircle,
  XCircle,
  Clock,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useThemeStore } from '@/stores'
import {
  dockerListRegistries,
  dockerCreateRegistry,
  dockerUpdateRegistry,
  dockerDeleteRegistry,
  dockerTestRegistry,
  dockerTestRegistryDirect,
  dockerSearchRegistryImages,
  dockerPullFromRegistry,
  getRegistryStatusText,
  getRegistryStatusColor,
  type RegistryInfo,
  type RegistryType,
  type RegistryStatus,
  type CreateRegistryRequest,
  type UpdateRegistryRequest,
  type RegistryImage,
} from '@/services/docker'

interface RegistryListProps {
  connectionId: string
}

export function RegistryList({ connectionId }: RegistryListProps) {
  const { t } = useTranslation()
  const { theme } = useThemeStore()
  const isDark = theme === 'dark'

  const [registries, setRegistries] = useState<RegistryInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({})
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [editingRegistry, setEditingRegistry] = useState<RegistryInfo | null>(null)
  const [searchingRegistry, setSearchingRegistry] = useState<RegistryInfo | null>(null)

  const loadRegistries = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await dockerListRegistries(connectionId)
      setRegistries(data)
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }, [connectionId])

  useEffect(() => {
    loadRegistries()
  }, [loadRegistries])

  const handleDelete = useCallback(
    async (registryId: string) => {
      setActionLoading((prev) => ({ ...prev, [registryId]: true }))
      try {
        await dockerDeleteRegistry(connectionId, registryId)
        await loadRegistries()
      } catch (err) {
        setError(String(err))
      } finally {
        setActionLoading((prev) => {
          const next = { ...prev }
          delete next[registryId]
          return next
        })
      }
    },
    [connectionId, loadRegistries]
  )

  const handleTestConnection = useCallback(
    async (registryId: string) => {
      setActionLoading((prev) => ({ ...prev, [`test_${registryId}`]: true }))
      try {
        await dockerTestRegistry(connectionId, registryId)
        // Always refresh to show updated status (success or failure)
        await loadRegistries()
      } catch (err) {
        setError(String(err))
      } finally {
        setActionLoading((prev) => {
          const next = { ...prev }
          delete next[`test_${registryId}`]
          return next
        })
      }
    },
    [connectionId, loadRegistries]
  )

  const handleCreate = useCallback(
    async (config: CreateRegistryRequest) => {
      try {
        await dockerCreateRegistry(connectionId, config)
        setShowCreateDialog(false)
        await loadRegistries()
      } catch (err) {
        throw err
      }
    },
    [connectionId, loadRegistries]
  )

  const handleUpdate = useCallback(
    async (config: UpdateRegistryRequest) => {
      try {
        await dockerUpdateRegistry(connectionId, config)
        setEditingRegistry(null)
        await loadRegistries()
      } catch (err) {
        throw err
      }
    },
    [connectionId, loadRegistries]
  )

  // Theme styles
  const bgPrimary = isDark ? 'bg-dark-bg-primary' : 'bg-light-bg-primary'
  const bgSecondary = isDark ? 'bg-dark-bg-secondary' : 'bg-light-bg-secondary'
  const borderColor = isDark ? 'border-dark-border' : 'border-light-border'
  const textPrimary = isDark ? 'text-dark-text-primary' : 'text-light-text-primary'
  const textSecondary = isDark ? 'text-dark-text-secondary' : 'text-light-text-secondary'
  const hoverBg = isDark ? 'hover:bg-dark-bg-hover' : 'hover:bg-light-bg-hover'

  const getStatusIcon = (status: RegistryStatus) => {
    // Handle both string and object status (Error has message)
    const statusStr = typeof status === 'string' ? status.toLowerCase() : 'error'
    if (statusStr === 'connected') {
      return <CheckCircle className="w-4 h-4 text-status-success" />
    } else if (statusStr === 'disconnected') {
      return <XCircle className="w-4 h-4 text-status-warning" />
    } else if (statusStr === 'syncing') {
      return <Loader2 className="w-4 h-4 animate-spin text-status-info" />
    } else {
      return <AlertCircle className="w-4 h-4 text-status-error" />
    }
  }

  const getRegistryTypeLabel = (type: RegistryType): string => {
    switch (type) {
      case 'dockerHub':
        return 'Docker Hub'
      case 'harbor':
        return 'Harbor'
      case 'nexus':
        return 'Nexus'
      case 'custom':
        return t('docker.customRegistry')
      default:
        return type
    }
  }

  const formatLastSync = (timestamp?: number): string => {
    if (!timestamp) return '-'
    return new Date(timestamp).toLocaleString()
  }

  return (
    <div className={cn('h-full flex flex-col', bgPrimary)}>
      {/* Toolbar */}
      <div className={cn('flex items-center justify-between px-4 py-2 border-b', borderColor)}>
        <h3 className={cn('font-medium', textPrimary)}>{t('docker.registries')}</h3>
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
            {t('docker.createRegistry')}
          </button>
          <button
            onClick={loadRegistries}
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
        {loading && registries.length === 0 ? (
          <div className={cn('flex items-center justify-center h-32', textSecondary)}>
            <Loader2 className="w-6 h-6 animate-spin mr-2" />
            {t('common.loading')}
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-32 text-status-error">
            <AlertCircle className="w-5 h-5 mr-2" />
            {error}
          </div>
        ) : registries.length === 0 ? (
          <div className={cn('flex items-center justify-center h-32', textSecondary)}>
            {t('docker.noRegistries')}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className={cn(bgSecondary)}>
              <tr className={borderColor}>
                <th className={cn('px-4 py-2 text-left font-medium', textSecondary)}>
                  {t('docker.registryName')}
                </th>
                <th className={cn('px-4 py-2 text-left font-medium', textSecondary)}>
                  {t('docker.registryType')}
                </th>
                <th className={cn('px-4 py-2 text-left font-medium', textSecondary)}>
                  {t('docker.registryUrl')}
                </th>
                <th className={cn('px-4 py-2 text-left font-medium', textSecondary)}>
                  {t('docker.registryStatus')}
                </th>
                <th className={cn('px-4 py-2 text-left font-medium', textSecondary)}>
                  {t('docker.registryLastSync')}
                </th>
                <th className={cn('px-4 py-2 text-right font-medium', textSecondary)}>
                  {t('common.actions')}
                </th>
              </tr>
            </thead>
            <tbody>
              {registries.map((registry) => {
                const isLoading = !!actionLoading[registry.id]
                const isTesting = !!actionLoading[`test_${registry.id}`]

                return (
                  <tr
                    key={registry.id}
                    className={cn('border-b', borderColor, hoverBg, 'transition-colors')}
                  >
                    <td className={cn('px-4 py-2', textPrimary)}>
                      <div className="flex items-center gap-2">
                        {getStatusIcon(registry.status)}
                        <span className="font-medium">{registry.name}</span>
                      </div>
                    </td>
                    <td className={cn('px-4 py-2 text-xs', textSecondary)}>
                      <span className={cn(
                        'px-2 py-0.5 rounded',
                        registry.registryType === 'dockerHub' && 'bg-blue-500/20 text-blue-400',
                        registry.registryType === 'harbor' && 'bg-green-500/20 text-green-400',
                        registry.registryType === 'nexus' && 'bg-orange-500/20 text-orange-400',
                        registry.registryType === 'custom' && 'bg-gray-500/20 text-gray-400'
                      )}>
                        {getRegistryTypeLabel(registry.registryType)}
                      </span>
                    </td>
                    <td className={cn('px-4 py-2 font-mono text-xs', textSecondary)}>
                      <span className="truncate max-w-[200px] block" title={registry.url}>
                        {registry.url}
                      </span>
                    </td>
                    <td className={cn('px-4 py-2 text-xs')}>
                      <span className={getRegistryStatusColor(registry.status)}>
                        {getRegistryStatusText(registry.status)}
                      </span>
                    </td>
                    <td className={cn('px-4 py-2 text-xs', textSecondary)}>
                      <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatLastSync(registry.lastSyncAt)}
                      </div>
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => handleTestConnection(registry.id)}
                          disabled={isTesting}
                          className={cn(
                            'p-1.5 rounded transition-colors',
                            hoverBg,
                            'disabled:opacity-50 disabled:cursor-not-allowed'
                          )}
                          title={t('docker.testConnection')}
                        >
                          {isTesting ? (
                            <Loader2 className="w-4 h-4 animate-spin text-status-info" />
                          ) : (
                            <Plug className="w-4 h-4 text-status-info" />
                          )}
                        </button>
                        <button
                          onClick={() => setSearchingRegistry(registry)}
                          className={cn(
                            'p-1.5 rounded transition-colors',
                            hoverBg
                          )}
                          title={t('docker.searchImages')}
                        >
                          <Search className="w-4 h-4 text-status-info" />
                        </button>
                        <button
                          onClick={() => setEditingRegistry(registry)}
                          className={cn(
                            'p-1.5 rounded transition-colors',
                            hoverBg
                          )}
                          title={t('common.edit')}
                        >
                          <Edit2 className="w-4 h-4 text-status-warning" />
                        </button>
                        <button
                          onClick={() => handleDelete(registry.id)}
                          disabled={isLoading}
                          className={cn(
                            'p-1.5 rounded transition-colors',
                            hoverBg,
                            'disabled:opacity-50 disabled:cursor-not-allowed'
                          )}
                          title={t('common.delete')}
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

      {/* Create Registry Dialog */}
      {showCreateDialog && (
        <RegistryDialog
          onClose={() => setShowCreateDialog(false)}
          onSave={handleCreate}
          isDark={isDark}
        />
      )}

      {/* Edit Registry Dialog */}
      {editingRegistry && (
        <RegistryDialog
          registry={editingRegistry}
          onClose={() => setEditingRegistry(null)}
          onSave={(config) => handleUpdate({ registryId: editingRegistry.id, ...config })}
          isDark={isDark}
        />
      )}

      {/* Search Images Dialog */}
      {searchingRegistry && (
        <SearchImagesDialog
          connectionId={connectionId}
          registry={searchingRegistry}
          onClose={() => setSearchingRegistry(null)}
          isDark={isDark}
        />
      )}
    </div>
  )
}

// Registry Dialog Component (Create/Edit)
interface RegistryDialogProps {
  registry?: RegistryInfo
  onClose: () => void
  onSave: (config: CreateRegistryRequest) => Promise<void>
  isDark: boolean
}

function RegistryDialog({ registry, onClose, onSave, isDark }: RegistryDialogProps) {
  const { t } = useTranslation()
  const isEditing = !!registry

  const [name, setName] = useState(registry?.name || '')
  const [registryType, setRegistryType] = useState<RegistryType>(registry?.registryType || 'dockerHub')
  const [url, setUrl] = useState(registry?.url || 'https://registry-1.docker.io')
  const [username, setUsername] = useState(registry?.username || '')
  const [password, setPassword] = useState(registry?.password || '')
  const [downloadLimit, setDownloadLimit] = useState<number | undefined>(registry?.downloadLimit)
  const [skipTlsVerify, setSkipTlsVerify] = useState(registry?.skipTlsVerify || false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)

  const bgPrimary = isDark ? 'bg-dark-bg-primary' : 'bg-light-bg-primary'
  const bgSecondary = isDark ? 'bg-dark-bg-secondary' : 'bg-light-bg-secondary'
  const borderColor = isDark ? 'border-dark-border' : 'border-light-border'
  const textPrimary = isDark ? 'text-dark-text-primary' : 'text-light-text-primary'
  const textSecondary = isDark ? 'text-dark-text-secondary' : 'text-light-text-secondary'

  // Update URL when registry type changes
  useEffect(() => {
    if (!isEditing) {
      switch (registryType) {
        case 'dockerHub':
          setUrl('https://registry-1.docker.io')
          break
        case 'harbor':
          setUrl('https://harbor.example.com')
          break
        case 'nexus':
          setUrl('https://nexus.example.com:8082')
          break
        case 'custom':
          setUrl('')
          break
      }
    }
  }, [registryType, isEditing])

  const handleTest = async () => {
    if (!url.trim()) return

    setTesting(true)
    setTestResult(null)

    try {
      const message = await dockerTestRegistryDirect(
        url.trim(),
        username.trim() || undefined,
        password.trim() || undefined,
        skipTlsVerify
      )
      setTestResult({ success: true, message })
    } catch (err) {
      setTestResult({ success: false, message: String(err) })
    } finally {
      setTesting(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !url.trim()) return

    setLoading(true)
    setError(null)

    try {
      await onSave({
        name: name.trim(),
        registryType,
        url: url.trim(),
        username: username.trim() || undefined,
        password: password.trim() || undefined,
        downloadLimit,
        skipTlsVerify,
      })
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className={cn('w-[520px] rounded-lg shadow-xl', bgPrimary, borderColor, 'border')}>
        <div className={cn('px-4 py-3 border-b', borderColor)}>
          <h3 className={cn('font-medium', textPrimary)}>
            {isEditing ? t('docker.editRegistry') : t('docker.createRegistry')}
          </h3>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {error && (
            <div className="px-3 py-2 rounded bg-status-error/10 text-status-error text-sm">
              {error}
            </div>
          )}

          {/* Registry Name */}
          <div>
            <label className={cn('block text-sm font-medium mb-1', textSecondary)}>
              {t('docker.registryName')} *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="my-registry"
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

          {/* Registry Type */}
          <div>
            <label className={cn('block text-sm font-medium mb-1', textSecondary)}>
              {t('docker.registryType')}
            </label>
            <select
              value={registryType}
              onChange={(e) => setRegistryType(e.target.value as RegistryType)}
              className={cn(
                'w-full px-3 py-2 rounded border text-sm',
                bgSecondary,
                borderColor,
                textPrimary,
                'focus:outline-none focus:ring-2 focus:ring-accent-primary'
              )}
            >
              <option value="dockerHub">Docker Hub</option>
              <option value="harbor">Harbor</option>
              <option value="nexus">Nexus</option>
              <option value="custom">{t('docker.customRegistry')}</option>
            </select>
          </div>

          {/* URL */}
          <div>
            <label className={cn('block text-sm font-medium mb-1', textSecondary)}>
              {t('docker.registryUrl')} *
            </label>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://registry.example.com"
              className={cn(
                'w-full px-3 py-2 rounded border text-sm font-mono',
                bgSecondary,
                borderColor,
                textPrimary,
                'focus:outline-none focus:ring-2 focus:ring-accent-primary'
              )}
            />
          </div>

          {/* Username */}
          <div>
            <label className={cn('block text-sm font-medium mb-1', textSecondary)}>
              {t('docker.registryUsername')} ({t('common.optional')})
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="username"
              className={cn(
                'w-full px-3 py-2 rounded border text-sm',
                bgSecondary,
                borderColor,
                textPrimary,
                'focus:outline-none focus:ring-2 focus:ring-accent-primary'
              )}
            />
          </div>

          {/* Password */}
          <div>
            <label className={cn('block text-sm font-medium mb-1', textSecondary)}>
              {t('docker.registryPassword')} ({t('common.optional')})
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="password"
              className={cn(
                'w-full px-3 py-2 rounded border text-sm',
                bgSecondary,
                borderColor,
                textPrimary,
                'focus:outline-none focus:ring-2 focus:ring-accent-primary'
              )}
            />
          </div>

          {/* Download Limit */}
          <div>
            <label className={cn('block text-sm font-medium mb-1', textSecondary)}>
              {t('docker.downloadLimit')} ({t('common.optional')})
            </label>
            <input
              type="number"
              value={downloadLimit || ''}
              onChange={(e) => setDownloadLimit(e.target.value ? parseInt(e.target.value) : undefined)}
              placeholder="0 (unlimited)"
              min={0}
              className={cn(
                'w-full px-3 py-2 rounded border text-sm',
                bgSecondary,
                borderColor,
                textPrimary,
                'focus:outline-none focus:ring-2 focus:ring-accent-primary'
              )}
            />
          </div>

          {/* Skip TLS Verify */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="skipTlsVerify"
              checked={skipTlsVerify}
              onChange={(e) => setSkipTlsVerify(e.target.checked)}
              className="w-4 h-4 text-accent-primary rounded"
            />
            <label htmlFor="skipTlsVerify" className={cn('text-sm', textSecondary)}>
              {t('docker.skipTlsVerify')}
            </label>
          </div>

          {/* Test Result */}
          {testResult && (
            <div className={cn(
              'px-3 py-2 rounded text-sm',
              testResult.success ? 'bg-status-success/10 text-status-success' : 'bg-status-error/10 text-status-error'
            )}>
              {testResult.success ? (
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4" />
                  <span>{testResult.message}</span>
                </div>
              ) : (
                <div className="flex items-start gap-2">
                  <XCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span className="break-all">{testResult.message}</span>
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-between pt-2">
            <button
              type="button"
              onClick={handleTest}
              disabled={!url.trim() || testing}
              className={cn(
                'px-4 py-2 text-sm rounded flex items-center gap-2',
                'bg-status-info/20 text-status-info',
                'hover:bg-status-info/30 transition-colors',
                'disabled:opacity-50 disabled:cursor-not-allowed'
              )}
            >
              {testing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Plug className="w-4 h-4" />
              )}
              {t('docker.testConnection')}
            </button>
            <div className="flex gap-2">
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
                disabled={!name.trim() || !url.trim() || loading}
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
          </div>
        </form>
      </div>
    </div>
  )
}

// Search Images Dialog Component
interface SearchImagesDialogProps {
  connectionId: string
  registry: RegistryInfo
  onClose: () => void
  isDark: boolean
}

function SearchImagesDialog({ connectionId, registry, onClose, isDark }: SearchImagesDialogProps) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [images, setImages] = useState<RegistryImage[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedImages, setSelectedImages] = useState<Set<string>>(new Set())
  const [pulling, setPulling] = useState(false)

  const bgPrimary = isDark ? 'bg-dark-bg-primary' : 'bg-light-bg-primary'
  const bgSecondary = isDark ? 'bg-dark-bg-secondary' : 'bg-light-bg-secondary'
  const borderColor = isDark ? 'border-dark-border' : 'border-light-border'
  const textPrimary = isDark ? 'text-dark-text-primary' : 'text-light-text-primary'
  const textSecondary = isDark ? 'text-dark-text-secondary' : 'text-light-text-secondary'
  const hoverBg = isDark ? 'hover:bg-dark-bg-hover' : 'hover:bg-light-bg-hover'

  const handleSearch = async () => {
    setLoading(true)
    setError(null)
    try {
      const results = await dockerSearchRegistryImages(connectionId, registry.id, query || undefined)
      setImages(results)
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }

  const handlePull = async () => {
    if (selectedImages.size === 0) return
    setPulling(true)
    setError(null)
    try {
      await dockerPullFromRegistry(connectionId, registry.id, Array.from(selectedImages))
      setSelectedImages(new Set())
    } catch (err) {
      setError(String(err))
    } finally {
      setPulling(false)
    }
  }

  const toggleImage = (imageName: string) => {
    setSelectedImages((prev) => {
      const next = new Set(prev)
      if (next.has(imageName)) {
        next.delete(imageName)
      } else {
        next.add(imageName)
      }
      return next
    })
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className={cn('w-[700px] max-h-[80vh] flex flex-col rounded-lg shadow-xl', bgPrimary, borderColor, 'border')}>
        <div className={cn('px-4 py-3 border-b flex items-center justify-between', borderColor)}>
          <h3 className={cn('font-medium', textPrimary)}>
            {t('docker.searchImages')} - {registry.name}
          </h3>
          <button onClick={onClose} className={cn('p-1 rounded', hoverBg)}>
            <XCircle className={cn('w-5 h-5', textSecondary)} />
          </button>
        </div>

        <div className="p-4 space-y-4 flex-1 overflow-hidden flex flex-col">
          {error && (
            <div className="px-3 py-2 rounded bg-status-error/10 text-status-error text-sm">
              {error}
            </div>
          )}

          {/* Search Input */}
          <div className="flex gap-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder={t('docker.searchPlaceholder')}
              className={cn(
                'flex-1 px-3 py-2 rounded border text-sm',
                bgSecondary,
                borderColor,
                textPrimary,
                'focus:outline-none focus:ring-2 focus:ring-accent-primary'
              )}
            />
            <button
              onClick={handleSearch}
              disabled={loading}
              className={cn(
                'px-4 py-2 text-sm rounded',
                'bg-accent-primary text-white hover:bg-accent-hover',
                'transition-colors disabled:opacity-50'
              )}
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Search className="w-4 h-4" />
              )}
            </button>
          </div>

          {/* Results */}
          <div className="flex-1 overflow-auto">
            {images.length === 0 ? (
              <div className={cn('flex items-center justify-center h-32', textSecondary)}>
                {loading ? t('common.loading') : t('docker.noImagesFound')}
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className={cn(bgSecondary, 'sticky top-0')}>
                  <tr className={borderColor}>
                    <th className="px-4 py-2 w-10">
                      <input
                        type="checkbox"
                        checked={selectedImages.size === images.length}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedImages(new Set(images.map((i) => i.name)))
                          } else {
                            setSelectedImages(new Set())
                          }
                        }}
                        className="w-4 h-4 rounded"
                      />
                    </th>
                    <th className={cn('px-4 py-2 text-left font-medium', textSecondary)}>
                      {t('docker.imageName')}
                    </th>
                    <th className={cn('px-4 py-2 text-left font-medium', textSecondary)}>
                      {t('docker.imageTags')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {images.map((image) => (
                    <tr
                      key={image.name}
                      className={cn('border-b', borderColor, hoverBg, 'transition-colors cursor-pointer')}
                      onClick={() => toggleImage(image.name)}
                    >
                      <td className="px-4 py-2">
                        <input
                          type="checkbox"
                          checked={selectedImages.has(image.name)}
                          onChange={() => toggleImage(image.name)}
                          className="w-4 h-4 rounded"
                        />
                      </td>
                      <td className={cn('px-4 py-2 font-mono', textPrimary)}>
                        {image.name}
                      </td>
                      <td className={cn('px-4 py-2 text-xs', textSecondary)}>
                        {image.tags.slice(0, 3).join(', ')}
                        {image.tags.length > 3 && ` +${image.tags.length - 3}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Pull Action */}
          <div className="flex justify-between items-center pt-2 border-t">
            <span className={cn('text-sm', textSecondary)}>
              {selectedImages.size > 0 && t('docker.selectedImages', { count: selectedImages.size })}
            </span>
            <div className="flex gap-2">
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
                {t('common.close')}
              </button>
              <button
                onClick={handlePull}
                disabled={selectedImages.size === 0 || pulling}
                className={cn(
                  'flex items-center gap-1 px-4 py-2 text-sm rounded',
                  'bg-accent-primary text-white hover:bg-accent-hover',
                  'transition-colors disabled:opacity-50'
                )}
              >
                {pulling ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                {t('docker.pullImages')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
