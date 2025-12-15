/**
 * SSH Connection Dialog Component
 *
 * Dialog for creating and editing SSH connections.
 * Supports both light and dark themes.
 */

import { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import * as Dialog from '@radix-ui/react-dialog'
import { X, Eye, EyeOff, FileKey } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useConnectionStore, useThemeStore } from '@/stores'
import type { SSHConnection, AuthType } from '@/types'
import { ModuleType as MT } from '@/types'
import { sshTestConnection } from '@/services/ssh'

interface SshConnectionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  connection?: SSHConnection
  folderId?: string | null
  onSave?: (connection: SSHConnection) => void
}

export function SshConnectionDialog({
  open,
  onOpenChange,
  connection,
  folderId,
  onSave,
}: SshConnectionDialogProps) {
  const { t } = useTranslation()
  const { theme } = useThemeStore()
  const isDark = theme === 'dark'
  const { createConnection, updateConnection } = useConnectionStore()

  const [formData, setFormData] = useState<{
    name: string
    host: string
    port: number
    username: string
    authType: AuthType
    password: string
    privateKey: string
    passphrase: string
  }>({
    name: connection?.name || '',
    host: connection?.host || '',
    port: connection?.port || 22,
    username: connection?.username || 'root',
    authType: connection?.authType || 'password',
    password: connection?.password || '',
    privateKey: connection?.privateKey || '',
    passphrase: connection?.passphrase || '',
  })

  const [showPassword, setShowPassword] = useState(false)
  const [showPassphrase, setShowPassphrase] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [testing, setTesting] = useState(false)

  const handleChange = useCallback(
    (field: keyof typeof formData, value: string | number) => {
      setFormData((prev) => ({ ...prev, [field]: value }))
      setErrors((prev) => ({ ...prev, [field]: '' }))
    },
    []
  )

  const validate = useCallback(() => {
    const newErrors: Record<string, string> = {}

    if (!formData.name?.trim()) {
      newErrors.name = t('ssh.errors.nameRequired')
    }
    if (!formData.host?.trim()) {
      newErrors.host = t('ssh.errors.hostRequired')
    }
    if (!formData.port || formData.port < 1 || formData.port > 65535) {
      newErrors.port = t('ssh.errors.portInvalid')
    }
    if (!formData.username?.trim()) {
      newErrors.username = t('ssh.errors.usernameRequired')
    }
    if (formData.authType === 'password' && !formData.password?.trim()) {
      newErrors.password = t('ssh.errors.passwordRequired')
    }
    if (formData.authType === 'key' && !formData.privateKey?.trim()) {
      newErrors.privateKey = t('ssh.errors.privateKeyRequired')
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }, [formData, t])

  const handleSave = useCallback(() => {
    if (!validate()) return

    if (connection) {
      updateConnection(connection.id, {
        name: formData.name,
        host: formData.host,
        port: formData.port,
        username: formData.username,
        authType: formData.authType,
        password: formData.authType === 'password' ? formData.password : undefined,
        privateKey: formData.authType === 'key' ? formData.privateKey : undefined,
        passphrase: formData.authType === 'key' ? formData.passphrase : undefined,
      })
      onSave?.(connection)
    } else {
      const connectionData = {
        name: formData.name,
        moduleType: MT.SSH,
        folderId: folderId ?? null,
        order: 0,
        tags: [] as string[],
        lastConnectedAt: null,
        host: formData.host,
        port: formData.port,
        username: formData.username,
        authType: formData.authType,
        password: formData.authType === 'password' ? formData.password : undefined,
        privateKey: formData.authType === 'key' ? formData.privateKey : undefined,
        passphrase: formData.authType === 'key' ? formData.passphrase : undefined,
      }
      const newConnection = createConnection(connectionData as any) as SSHConnection
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

  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)

  const handleTestConnection = useCallback(async () => {
    if (!validate()) return

    setTesting(true)
    setTestResult(null)
    try {
      await sshTestConnection({
        connectionId: connection?.id || 'test',
        host: formData.host,
        port: formData.port,
        username: formData.username,
        authType: formData.authType,
        password: formData.authType === 'password' ? formData.password : undefined,
        privateKey: formData.authType === 'key' ? formData.privateKey : undefined,
        passphrase: formData.authType === 'key' ? formData.passphrase : undefined,
      })
      setTestResult({ success: true, message: t('ssh.connectionSuccess') })
    } catch (err) {
      setTestResult({ success: false, message: `${t('ssh.connectionFailed')}: ${err}` })
    } finally {
      setTesting(false)
    }
  }, [validate, formData, connection, t])

  // 主题相关样式
  const dialogBg = isDark ? 'bg-dark-bg-primary' : 'bg-light-bg-primary'
  const borderColor = isDark ? 'border-dark-border' : 'border-light-border'
  const textPrimary = isDark ? 'text-dark-text-primary' : 'text-light-text-primary'
  const textSecondary = isDark ? 'text-dark-text-secondary' : 'text-light-text-secondary'
  const inputBg = isDark ? 'bg-dark-bg-hover' : 'bg-light-bg-primary'
  const hoverBg = isDark ? 'hover:bg-dark-bg-hover' : 'hover:bg-light-bg-hover'

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
        <Dialog.Content
          className={cn(
            'fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2',
            'w-full max-w-lg max-h-[90vh] overflow-y-auto',
            'rounded-lg shadow-xl z-50 border',
            'focus:outline-none',
            dialogBg,
            borderColor
          )}
        >
          {/* Header */}
          <div className={cn('flex items-center justify-between px-6 py-4 border-b', borderColor)}>
            <Dialog.Title className={cn('text-lg font-semibold', textPrimary)}>
              {connection ? t('ssh.editConnection') : t('ssh.newConnection')}
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
                {t('ssh.connectionName')}
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => handleChange('name', e.target.value)}
                placeholder="prod-server-01"
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

            {/* Host and Port */}
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className={cn('block text-sm font-medium mb-1', textSecondary)}>
                  {t('ssh.host')}
                </label>
                <input
                  type="text"
                  value={formData.host}
                  onChange={(e) => handleChange('host', e.target.value)}
                  placeholder="192.168.1.100"
                  className={cn(
                    'w-full px-3 py-2 rounded border text-sm',
                    'focus:outline-none focus:border-accent-primary',
                    inputBg,
                    borderColor,
                    textPrimary,
                    errors.host && 'border-status-error'
                  )}
                />
                {errors.host && (
                  <p className="text-xs text-status-error mt-1">{errors.host}</p>
                )}
              </div>
              <div>
                <label className={cn('block text-sm font-medium mb-1', textSecondary)}>
                  {t('ssh.port')}
                </label>
                <input
                  type="number"
                  value={formData.port}
                  onChange={(e) => handleChange('port', parseInt(e.target.value) || 22)}
                  className={cn(
                    'w-full px-3 py-2 rounded border text-sm',
                    'focus:outline-none focus:border-accent-primary',
                    inputBg,
                    borderColor,
                    textPrimary,
                    errors.port && 'border-status-error'
                  )}
                />
              </div>
            </div>

            {/* Username */}
            <div>
              <label className={cn('block text-sm font-medium mb-1', textSecondary)}>
                {t('ssh.username')}
              </label>
              <input
                type="text"
                value={formData.username}
                onChange={(e) => handleChange('username', e.target.value)}
                placeholder="root"
                className={cn(
                  'w-full px-3 py-2 rounded border text-sm',
                  'focus:outline-none focus:border-accent-primary',
                  inputBg,
                  borderColor,
                  textPrimary,
                  errors.username && 'border-status-error'
                )}
              />
              {errors.username && (
                <p className="text-xs text-status-error mt-1">{errors.username}</p>
              )}
            </div>

            {/* Auth Type */}
            <div>
              <label className={cn('block text-sm font-medium mb-2', textSecondary)}>
                {t('ssh.authentication')}
              </label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="authType"
                    checked={formData.authType === 'password'}
                    onChange={() => handleChange('authType', 'password')}
                    className="w-4 h-4 text-accent-primary"
                  />
                  <span className={cn('text-sm', textPrimary)}>{t('ssh.password')}</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="authType"
                    checked={formData.authType === 'key'}
                    onChange={() => handleChange('authType', 'key')}
                    className="w-4 h-4 text-accent-primary"
                  />
                  <span className={cn('text-sm', textPrimary)}>{t('ssh.privateKey')}</span>
                </label>
              </div>
            </div>

            {/* Password */}
            {formData.authType === 'password' && (
              <div>
                <label className={cn('block text-sm font-medium mb-1', textSecondary)}>
                  {t('ssh.password')}
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={formData.password}
                    onChange={(e) => handleChange('password', e.target.value)}
                    className={cn(
                      'w-full px-3 py-2 pr-10 rounded border text-sm',
                      'focus:outline-none focus:border-accent-primary',
                      inputBg,
                      borderColor,
                      textPrimary,
                      errors.password && 'border-status-error'
                    )}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className={cn('absolute right-2 top-1/2 -translate-y-1/2 p-1', textSecondary)}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {errors.password && (
                  <p className="text-xs text-status-error mt-1">{errors.password}</p>
                )}
              </div>
            )}

            {/* Private Key */}
            {formData.authType === 'key' && (
              <>
                <div>
                  <label className={cn('block text-sm font-medium mb-1', textSecondary)}>
                    {t('ssh.privateKey')}
                  </label>
                  <div className="relative">
                    <textarea
                      value={formData.privateKey}
                      onChange={(e) => handleChange('privateKey', e.target.value)}
                      placeholder={t('ssh.pastePrivateKey')}
                      rows={4}
                      className={cn(
                        'w-full px-3 py-2 rounded border font-mono text-xs',
                        'focus:outline-none focus:border-accent-primary',
                        inputBg,
                        borderColor,
                        textPrimary,
                        errors.privateKey && 'border-status-error'
                      )}
                    />
                    <button
                      type="button"
                      className={cn('absolute right-2 top-2 p-1 rounded', hoverBg, textSecondary)}
                      title={t('ssh.selectFile')}
                    >
                      <FileKey className="w-4 h-4" />
                    </button>
                  </div>
                  {errors.privateKey && (
                    <p className="text-xs text-status-error mt-1">{errors.privateKey}</p>
                  )}
                </div>

                <div>
                  <label className={cn('block text-sm font-medium mb-1', textSecondary)}>
                    {t('ssh.passphrase')}
                  </label>
                  <div className="relative">
                    <input
                      type={showPassphrase ? 'text' : 'password'}
                      value={formData.passphrase}
                      onChange={(e) => handleChange('passphrase', e.target.value)}
                      placeholder={t('ssh.passphraseHint')}
                      className={cn(
                        'w-full px-3 py-2 pr-10 rounded border text-sm',
                        'focus:outline-none focus:border-accent-primary',
                        inputBg,
                        borderColor,
                        textPrimary
                      )}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassphrase(!showPassphrase)}
                      className={cn('absolute right-2 top-1/2 -translate-y-1/2 p-1', textSecondary)}
                    >
                      {showPassphrase ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </>
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
              disabled={testing}
              className={cn(
                'px-4 py-2 rounded text-sm border transition-colors',
                'disabled:opacity-50 disabled:cursor-not-allowed',
                borderColor,
                textPrimary,
                hoverBg
              )}
            >
              {testing ? t('ssh.testing') : t('ssh.testConnection')}
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
