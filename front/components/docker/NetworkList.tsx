/**
 * Network List Component
 *
 * Displays Docker networks with management actions.
 */

import { useState, useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Plus,
  RefreshCw,
  Trash2,
  Loader2,
  AlertCircle,
  Lock,
  Globe,
  Scissors,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useThemeStore } from '@/stores'
import {
  dockerListNetworks,
  dockerCreateNetwork,
  dockerRemoveNetwork,
  dockerPruneNetworks,
  type NetworkInfo,
  type CreateNetworkRequest,
} from '@/services/docker'

interface NetworkListProps {
  connectionId: string
}

export function NetworkList({ connectionId }: NetworkListProps) {
  const { t } = useTranslation()
  const { theme } = useThemeStore()
  const isDark = theme === 'dark'

  const [networks, setNetworks] = useState<NetworkInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({})
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [isPruning, setIsPruning] = useState(false)

  const loadNetworks = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await dockerListNetworks(connectionId)
      setNetworks(data)
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }, [connectionId])

  useEffect(() => {
    loadNetworks()
  }, [loadNetworks])

  const handleRemove = useCallback(
    async (networkId: string) => {
      setActionLoading((prev) => ({ ...prev, [networkId]: true }))
      try {
        await dockerRemoveNetwork(connectionId, networkId)
        await loadNetworks()
      } catch (err) {
        setError(String(err))
      } finally {
        setActionLoading((prev) => {
          const next = { ...prev }
          delete next[networkId]
          return next
        })
      }
    },
    [connectionId, loadNetworks]
  )

  const handlePrune = useCallback(async () => {
    setIsPruning(true)
    try {
      const result = await dockerPruneNetworks(connectionId)
      if (result.deletedCount > 0) {
        await loadNetworks()
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setIsPruning(false)
    }
  }, [connectionId, loadNetworks])

  const handleCreate = useCallback(
    async (config: CreateNetworkRequest) => {
      try {
        await dockerCreateNetwork(connectionId, config)
        setShowCreateDialog(false)
        await loadNetworks()
      } catch (err) {
        throw err
      }
    },
    [connectionId, loadNetworks]
  )

  // Check if network is a system network (cannot be deleted)
  const isSystemNetwork = (name: string): boolean => {
    return ['bridge', 'host', 'none'].includes(name)
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
        <h3 className={cn('font-medium', textPrimary)}>{t('docker.networks')}</h3>
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
            {t('docker.createNetwork')}
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
            title={t('docker.pruneNetworks')}
          >
            {isPruning ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Scissors className="w-4 h-4" />
            )}
            {t('docker.prune')}
          </button>
          <button
            onClick={loadNetworks}
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
        {error && networks.length > 0 && (
          <div className="flex items-center gap-2 px-4 py-2 text-sm text-status-error bg-status-error/10 border-b border-status-error/20">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span className="flex-1">{error}</span>
            <button onClick={() => setError(null)} className="opacity-70 hover:opacity-100">✕</button>
          </div>
        )}
        {loading && networks.length === 0 ? (
          <div className={cn('flex items-center justify-center h-32', textSecondary)}>
            <Loader2 className="w-6 h-6 animate-spin mr-2" />
            {t('common.loading')}
          </div>
        ) : error && networks.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-status-error">
            <AlertCircle className="w-5 h-5 mr-2" />
            {error}
          </div>
        ) : networks.length === 0 ? (
          <div className={cn('flex items-center justify-center h-32', textSecondary)}>
            {t('docker.noNetworks')}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className={cn(bgSecondary)}>
              <tr className={borderColor}>
                <th className={cn('px-4 py-2 text-left font-medium', textSecondary)}>
                  {t('docker.networkName')}
                </th>
                <th className={cn('px-4 py-2 text-left font-medium', textSecondary)}>
                  {t('docker.networkDriver')}
                </th>
                <th className={cn('px-4 py-2 text-left font-medium', textSecondary)}>
                  {t('docker.networkScope')}
                </th>
                <th className={cn('px-4 py-2 text-left font-medium', textSecondary)}>
                  {t('docker.networkSubnet')}
                </th>
                <th className={cn('px-4 py-2 text-left font-medium', textSecondary)}>
                  {t('docker.networkContainers')}
                </th>
                <th className={cn('px-4 py-2 text-right font-medium', textSecondary)}>
                  {t('common.actions')}
                </th>
              </tr>
            </thead>
            <tbody>
              {networks.map((network) => {
                const isLoading = !!actionLoading[network.id]
                const isSystem = isSystemNetwork(network.name)

                return (
                  <tr
                    key={network.id}
                    className={cn('border-b', borderColor, hoverBg, 'transition-colors')}
                  >
                    <td className={cn('px-4 py-2', textPrimary)}>
                      <div className="flex items-center gap-2">
                        {network.internal ? (
                          <span title={t('docker.internalNetwork')}>
                            <Lock className="w-4 h-4 text-status-warning" />
                          </span>
                        ) : (
                          <Globe className="w-4 h-4 text-status-info" />
                        )}
                        <span className="font-mono">{network.name}</span>
                        {isSystem && (
                          <span className="px-1.5 py-0.5 text-xs rounded bg-status-info/20 text-status-info">
                            {t('docker.systemNetwork')}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className={cn('px-4 py-2 font-mono text-xs', textSecondary)}>
                      {network.driver}
                    </td>
                    <td className={cn('px-4 py-2 text-xs', textSecondary)}>
                      {network.scope}
                    </td>
                    <td className={cn('px-4 py-2 font-mono text-xs', textSecondary)}>
                      {network.ipamSubnet || '-'}
                    </td>
                    <td className={cn('px-4 py-2 text-xs', textSecondary)}>
                      {network.containersCount}
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => handleRemove(network.id)}
                          disabled={isLoading || isSystem}
                          className={cn(
                            'p-1.5 rounded transition-colors',
                            hoverBg,
                            'disabled:opacity-50 disabled:cursor-not-allowed'
                          )}
                          title={isSystem ? t('docker.cannotRemoveSystemNetwork') : t('docker.removeNetwork')}
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

      {/* Create Network Dialog */}
      {showCreateDialog && (
        <CreateNetworkDialog
          onClose={() => setShowCreateDialog(false)}
          onCreate={handleCreate}
          isDark={isDark}
        />
      )}
    </div>
  )
}

// Create Network Dialog Component
interface CreateNetworkDialogProps {
  onClose: () => void
  onCreate: (config: CreateNetworkRequest) => Promise<void>
  isDark: boolean
}

function CreateNetworkDialog({ onClose, onCreate, isDark }: CreateNetworkDialogProps) {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [driver, setDriver] = useState('bridge')
  const [subnet, setSubnet] = useState('')
  const [gateway, setGateway] = useState('')
  const [internal, setInternal] = useState(false)
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
        subnet: subnet.trim() || undefined,
        gateway: gateway.trim() || undefined,
        internal,
      })
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className={cn('w-[480px] rounded-lg shadow-xl', bgPrimary, borderColor, 'border')}>
        <div className={cn('px-4 py-3 border-b', borderColor)}>
          <h3 className={cn('font-medium', textPrimary)}>{t('docker.createNetwork')}</h3>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {error && (
            <div className="px-3 py-2 rounded bg-status-error/10 text-status-error text-sm">
              {error}
            </div>
          )}

          {/* Network Name */}
          <div>
            <label className={cn('block text-sm font-medium mb-1', textSecondary)}>
              {t('docker.networkName')} *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="my-network"
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
              {t('docker.networkDriver')}
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
              <option value="bridge">bridge</option>
              <option value="overlay">overlay</option>
              <option value="macvlan">macvlan</option>
              <option value="ipvlan">ipvlan</option>
            </select>
          </div>

          {/* Subnet */}
          <div>
            <label className={cn('block text-sm font-medium mb-1', textSecondary)}>
              {t('docker.networkSubnet')} ({t('common.optional')})
            </label>
            <input
              type="text"
              value={subnet}
              onChange={(e) => setSubnet(e.target.value)}
              placeholder="172.20.0.0/16"
              className={cn(
                'w-full px-3 py-2 rounded border text-sm',
                bgSecondary,
                borderColor,
                textPrimary,
                'focus:outline-none focus:ring-2 focus:ring-accent-primary'
              )}
            />
          </div>

          {/* Gateway */}
          <div>
            <label className={cn('block text-sm font-medium mb-1', textSecondary)}>
              {t('docker.networkGateway')} ({t('common.optional')})
            </label>
            <input
              type="text"
              value={gateway}
              onChange={(e) => setGateway(e.target.value)}
              placeholder="172.20.0.1"
              className={cn(
                'w-full px-3 py-2 rounded border text-sm',
                bgSecondary,
                borderColor,
                textPrimary,
                'focus:outline-none focus:ring-2 focus:ring-accent-primary'
              )}
            />
          </div>

          {/* Internal */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="internal"
              checked={internal}
              onChange={(e) => setInternal(e.target.checked)}
              className="w-4 h-4 text-accent-primary rounded"
            />
            <label htmlFor="internal" className={cn('text-sm', textSecondary)}>
              {t('docker.internalNetwork')}
            </label>
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
