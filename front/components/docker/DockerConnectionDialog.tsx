/**
 * Docker Connection Dialog Component
 *
 * Dialog for creating and editing Docker connections.
 * Supports local Docker and remote Docker via SSH tunnel.
 */

import { useState, useCallback, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import * as Dialog from '@radix-ui/react-dialog'
import { X, Monitor, Server, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useConnectionStore, useThemeStore } from '@/stores'
import type { DockerConnection, SSHConnection, DockerConnectionType } from '@/types'
import { ModuleType as MT } from '@/types'
import { dockerTestConnection } from '@/services/docker'

interface DockerConnectionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  connection?: DockerConnection
  folderId?: string | null
  onSave?: (connection: DockerConnection) => void
}

export function DockerConnectionDialog({
  open,
  onOpenChange,
  connection,
  folderId,
  onSave,
}: DockerConnectionDialogProps) {
  const { t } = useTranslation()
  const { theme } = useThemeStore()
  const isDark = theme === 'dark'
  const { connections, createConnection, updateConnection } = useConnectionStore()

  // Get all SSH connections for dropdown
  const sshConnections = useMemo(() => {
    return connections.filter((c): c is SSHConnection => c.moduleType === MT.SSH)
  }, [connections])

  const [formData, setFormData] = useState<{
    name: string
    connectionType: DockerConnectionType
    sshConnectionId: string
  }>({
    name: '',
    connectionType: 'local',
    sshConnectionId: '',
  })

  const [errors, setErrors] = useState<Record<string, string>>({})
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)

  // Reset dialog state when opened
  useEffect(() => {
    if (open) {
      if (connection) {
        setFormData({
          name: connection.name,
          connectionType: connection.connectionType,
          sshConnectionId: connection.sshConnectionId || '',
        })
      } else {
        setFormData({
          name: '',
          connectionType: 'local',
          sshConnectionId: sshConnections[0]?.id || '',
        })
      }
      setErrors({})
      setTestResult(null)
    }
  }, [open, connection, sshConnections])

  const handleChange = useCallback(
    (field: keyof typeof formData, value: string) => {
      setFormData((prev) => ({ ...prev, [field]: value }))
      setErrors((prev) => ({ ...prev, [field]: '' }))
      setTestResult(null)
    },
    []
  )

  const validate = useCallback(() => {
    const newErrors: Record<string, string> = {}

    if (!formData.name?.trim()) {
      newErrors.name = t('docker.errors.nameRequired')
    }
    if (formData.connectionType === 'ssh' && !formData.sshConnectionId) {
      newErrors.sshConnectionId = t('docker.errors.sshConnectionRequired')
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }, [formData, t])

  const handleSave = useCallback(() => {
    if (!validate()) return

    if (connection) {
      updateConnection(connection.id, {
        name: formData.name,
        connectionType: formData.connectionType,
        sshConnectionId: formData.connectionType === 'ssh' ? formData.sshConnectionId : undefined,
      })
      onSave?.(connection)
    } else {
      const connectionData = {
        name: formData.name,
        moduleType: MT.Docker,
        folderId: folderId ?? null,
        order: 0,
        tags: [] as string[],
        lastConnectedAt: null,
        connectionType: formData.connectionType,
        sshConnectionId: formData.connectionType === 'ssh' ? formData.sshConnectionId : undefined,
      }
      const newConnection = createConnection(connectionData as any) as DockerConnection
      onSave?.(newConnection)
    }

    onOpenChange(false)
  }, [
    validate,
    formData,
    connection,
    folderId,
    createConnection,
    updateConnection,
    onSave,
    onOpenChange,
  ])

  const handleTestConnection = useCallback(async () => {
    if (!validate()) return

    setTesting(true)
    setTestResult(null)
    try {
      const result = await dockerTestConnection({
        connectionId: connection?.id || 'test',
        connectionType: formData.connectionType,
        sshConnectionId: formData.connectionType === 'ssh' ? formData.sshConnectionId : undefined,
      })
      if (result.success) {
        const versionInfo = result.version ? ` (v${result.version})` : ''
        setTestResult({ success: true, message: t('docker.connectionSuccess') + versionInfo })
      } else {
        setTestResult({ success: false, message: result.error || t('docker.connectionFailed') })
      }
    } catch (err) {
      setTestResult({ success: false, message: `${t('docker.connectionFailed')}: ${err}` })
    } finally {
      setTesting(false)
    }
  }, [validate, formData, connection, t])

  // Get selected SSH connection name for display
  const selectedSshConnection = useMemo(() => {
    return sshConnections.find((c) => c.id === formData.sshConnectionId)
  }, [sshConnections, formData.sshConnectionId])

  // Theme styles
  const dialogBg = isDark ? 'bg-dark-bg-primary' : 'bg-light-bg-primary'
  const borderColor = isDark ? 'border-dark-border' : 'border-light-border'
  const textPrimary = isDark ? 'text-dark-text-primary' : 'text-light-text-primary'
  const textSecondary = isDark ? 'text-dark-text-secondary' : 'text-light-text-secondary'
  const inputBg = isDark ? 'bg-dark-bg-hover' : 'bg-light-bg-primary'
  const hoverBg = isDark ? 'hover:bg-dark-bg-hover' : 'hover:bg-light-bg-hover'
  const selectedBg = isDark ? 'bg-accent-primary/20' : 'bg-accent-primary/10'

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
        <Dialog.Content
          className={cn(
            'fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2',
            'w-full max-w-md max-h-[90vh] overflow-y-auto',
            'rounded-lg shadow-xl z-50 border',
            'focus:outline-none',
            dialogBg,
            borderColor
          )}
        >
          {/* Header */}
          <div className={cn('flex items-center justify-between px-6 py-4 border-b', borderColor)}>
            <Dialog.Title className={cn('text-lg font-semibold', textPrimary)}>
              {connection ? t('docker.editConnection') : t('docker.newConnection')}
            </Dialog.Title>
            <Dialog.Close className={cn('p-1 rounded transition-colors', hoverBg)}>
              <X className={cn('w-5 h-5', textSecondary)} />
            </Dialog.Close>
          </div>

          {/* Content */}
          <div className="px-6 py-4 space-y-4">
            {/* Connection Name */}
            <div>
              <label className={cn('block text-sm font-medium mb-1', textSecondary)}>
                {t('docker.connectionName')}
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => handleChange('name', e.target.value)}
                placeholder={t('docker.connectionNamePlaceholder')}
                className={cn(
                  'w-full px-3 py-2 rounded border text-sm',
                  'focus:outline-none focus:border-accent-primary',
                  inputBg,
                  borderColor,
                  textPrimary,
                  errors.name && 'border-status-error'
                )}
              />
              {errors.name && (
                <p className="text-xs text-status-error mt-1">{errors.name}</p>
              )}
            </div>

            {/* Connection Type Selection */}
            <div>
              <label className={cn('block text-sm font-medium mb-2', textSecondary)}>
                {t('docker.connectionType')}
              </label>
              <div className="grid grid-cols-2 gap-3">
                {/* Local Docker */}
                <button
                  type="button"
                  onClick={() => handleChange('connectionType', 'local')}
                  className={cn(
                    'flex flex-col items-center gap-2 p-4 rounded-lg border transition-all',
                    borderColor,
                    formData.connectionType === 'local'
                      ? cn(selectedBg, 'border-accent-primary')
                      : hoverBg
                  )}
                >
                  <Monitor className={cn('w-8 h-8', textPrimary)} />
                  <span className={cn('text-sm font-medium', textPrimary)}>
                    {t('docker.localDocker')}
                  </span>
                  <span className={cn('text-xs text-center', textSecondary)}>
                    {t('docker.localDockerDesc')}
                  </span>
                </button>

                {/* Remote Docker via SSH */}
                <button
                  type="button"
                  onClick={() => handleChange('connectionType', 'ssh')}
                  className={cn(
                    'flex flex-col items-center gap-2 p-4 rounded-lg border transition-all',
                    borderColor,
                    formData.connectionType === 'ssh'
                      ? cn(selectedBg, 'border-accent-primary')
                      : hoverBg
                  )}
                >
                  <Server className={cn('w-8 h-8', textPrimary)} />
                  <span className={cn('text-sm font-medium', textPrimary)}>
                    {t('docker.remoteDocker')}
                  </span>
                  <span className={cn('text-xs text-center', textSecondary)}>
                    {t('docker.remoteDockerDesc')}
                  </span>
                </button>
              </div>
            </div>

            {/* SSH Connection Selection (for remote type) */}
            {formData.connectionType === 'ssh' && (
              <div>
                <label className={cn('block text-sm font-medium mb-1', textSecondary)}>
                  {t('docker.selectSshConnection')}
                </label>
                {sshConnections.length === 0 ? (
                  <div
                    className={cn(
                      'px-3 py-4 rounded border text-sm text-center',
                      borderColor,
                      textSecondary
                    )}
                  >
                    {t('docker.noSshConnections')}
                  </div>
                ) : (
                  <select
                    value={formData.sshConnectionId}
                    onChange={(e) => handleChange('sshConnectionId', e.target.value)}
                    className={cn(
                      'w-full px-3 py-2 rounded border text-sm',
                      'focus:outline-none focus:border-accent-primary',
                      inputBg,
                      borderColor,
                      textPrimary,
                      errors.sshConnectionId && 'border-status-error'
                    )}
                  >
                    <option value="">{t('docker.selectSshPlaceholder')}</option>
                    {sshConnections.map((ssh) => (
                      <option key={ssh.id} value={ssh.id}>
                        {ssh.name} ({ssh.host}:{ssh.port})
                      </option>
                    ))}
                  </select>
                )}
                {errors.sshConnectionId && (
                  <p className="text-xs text-status-error mt-1">{errors.sshConnectionId}</p>
                )}
                {selectedSshConnection && (
                  <p className={cn('text-xs mt-1', textSecondary)}>
                    {t('docker.sshConnectionInfo', {
                      user: selectedSshConnection.username,
                      host: selectedSshConnection.host,
                    })}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className={cn('px-6 py-4 border-t', borderColor)}>
            {/* Test result display */}
            {testResult && (
              <div
                className={cn(
                  'mb-3 px-3 py-2 rounded text-sm',
                  testResult.success
                    ? 'bg-status-success/10 text-status-success border border-status-success/30'
                    : 'bg-status-error/10 text-status-error border border-status-error/30'
                )}
              >
                {testResult.message}
              </div>
            )}
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={handleTestConnection}
                disabled={testing || (formData.connectionType === 'ssh' && sshConnections.length === 0)}
                className={cn(
                  'px-4 py-2 rounded text-sm border transition-colors flex items-center gap-2',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                  borderColor,
                  textPrimary,
                  hoverBg
                )}
              >
                {testing && <Loader2 className="w-4 h-4 animate-spin" />}
                {testing ? t('docker.testing') : t('docker.testConnection')}
              </button>
              <Dialog.Close
                className={cn(
                  'px-4 py-2 rounded text-sm border transition-colors',
                  borderColor,
                  textPrimary,
                  hoverBg
                )}
              >
                {t('common.cancel')}
              </Dialog.Close>
              <button
                onClick={handleSave}
                className="px-4 py-2 rounded text-sm bg-accent-primary text-white hover:bg-accent-hover transition-colors"
              >
                {t('common.save')}
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
