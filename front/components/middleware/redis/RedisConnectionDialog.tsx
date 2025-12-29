/**
 * Redis Connection Dialog Component
 *
 * Dialog for creating and editing Redis connections.
 * Supports Standalone, Cluster, and Sentinel modes.
 */

import { useState, useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import * as Dialog from '@radix-ui/react-dialog'
import { X, Eye, EyeOff, Plus, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useConnectionStore, useThemeStore } from '@/stores'
import type { MiddlewareConnection } from '@/types'
import { ModuleType } from '@/types'
import { mwRedisConnect, mwRedisDisconnect, type RedisMode } from '@/services/middleware'

interface RedisConnectionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  connection?: MiddlewareConnection
  folderId?: string | null
  onSave?: (connection: MiddlewareConnection) => void
}

export function RedisConnectionDialog({
  open,
  onOpenChange,
  connection,
  folderId,
  onSave,
}: RedisConnectionDialogProps) {
  const { t } = useTranslation()
  const { theme } = useThemeStore()
  const isDark = theme === 'dark'
  const { createConnection, updateConnection } = useConnectionStore()

  const [formData, setFormData] = useState<{
    name: string
    mode: RedisMode
    host: string
    port: number
    nodes: string[]
    sentinels: string[]
    sentinelPassword: string
    masterName: string
    password: string
    db: number
    tlsEnabled: boolean
    tlsRejectUnauthorized: boolean
  }>({
    name: '',
    mode: 'Standalone',
    host: '127.0.0.1',
    port: 6379,
    nodes: [''],
    sentinels: [''],
    sentinelPassword: '',
    masterName: 'mymaster',
    password: '',
    db: 0,
    tlsEnabled: false,
    tlsRejectUnauthorized: true,
  })

  const [showPassword, setShowPassword] = useState(false)
  const [showSentinelPassword, setShowSentinelPassword] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)

  // Reset dialog state
  useEffect(() => {
    if (open) {
      if (connection?.redisConfig) {
        const rc = connection.redisConfig
        setFormData({
          name: connection.name,
          mode: rc.mode || 'Standalone',
          host: rc.host || '127.0.0.1',
          port: rc.port || 6379,
          nodes: rc.nodes?.length ? rc.nodes : [''],
          sentinels: rc.sentinels?.length ? rc.sentinels : [''],
          sentinelPassword: rc.sentinelPassword || '',
          masterName: rc.masterName || 'mymaster',
          password: rc.password || '',
          db: rc.db || 0,
          tlsEnabled: rc.tls?.enabled || false,
          tlsRejectUnauthorized: rc.tls?.rejectUnauthorized ?? true,
        })
      } else {
        setFormData({
          name: '',
          mode: 'Standalone',
          host: '127.0.0.1',
          port: 6379,
          nodes: [''],
          sentinels: [''],
          sentinelPassword: '',
          masterName: 'mymaster',
          password: '',
          db: 0,
          tlsEnabled: false,
          tlsRejectUnauthorized: true,
        })
      }
      setErrors({})
      setTestResult(null)
    }
  }, [open, connection])

  const handleChange = useCallback(
    <K extends keyof typeof formData>(field: K, value: (typeof formData)[K]) => {
      setFormData((prev) => ({ ...prev, [field]: value }))
      setErrors((prev) => ({ ...prev, [field]: '' }))
    },
    []
  )

  const handleAddNode = useCallback((field: 'nodes' | 'sentinels') => {
    setFormData((prev) => ({
      ...prev,
      [field]: [...prev[field], ''],
    }))
  }, [])

  const handleRemoveNode = useCallback((field: 'nodes' | 'sentinels', index: number) => {
    setFormData((prev) => ({
      ...prev,
      [field]: prev[field].filter((_, i) => i !== index),
    }))
  }, [])

  const handleNodeChange = useCallback((field: 'nodes' | 'sentinels', index: number, value: string) => {
    setFormData((prev) => ({
      ...prev,
      [field]: prev[field].map((n, i) => (i === index ? value : n)),
    }))
    setErrors((prev) => ({ ...prev, [field]: '' }))
  }, [])

  const validate = useCallback(() => {
    const newErrors: Record<string, string> = {}

    if (!formData.name?.trim()) {
      newErrors.name = t('redis.errors.nameRequired', 'Connection name is required')
    }

    if (formData.mode === 'Standalone') {
      if (!formData.host?.trim()) {
        newErrors.host = t('redis.errors.hostRequired', 'Host is required')
      }
      if (!formData.port || formData.port < 1 || formData.port > 65535) {
        newErrors.port = t('redis.errors.invalidPort', 'Invalid port number')
      }
    } else if (formData.mode === 'Cluster') {
      const validNodes = formData.nodes.filter((n) => n.trim())
      if (validNodes.length === 0) {
        newErrors.nodes = t('redis.errors.nodesRequired', 'At least one cluster node is required')
      }
      for (const node of validNodes) {
        if (!/^[\w.-]+:\d+$/.test(node.trim())) {
          newErrors.nodes = t('redis.errors.invalidNodeFormat', 'Invalid node format (use host:port)')
          break
        }
      }
    } else if (formData.mode === 'Sentinel') {
      const validSentinels = formData.sentinels.filter((s) => s.trim())
      if (validSentinels.length === 0) {
        newErrors.sentinels = t('redis.errors.sentinelsRequired', 'At least one sentinel node is required')
      }
      for (const sentinel of validSentinels) {
        if (!/^[\w.-]+:\d+$/.test(sentinel.trim())) {
          newErrors.sentinels = t('redis.errors.invalidSentinelFormat', 'Invalid sentinel format (use host:port)')
          break
        }
      }
      if (!formData.masterName?.trim()) {
        newErrors.masterName = t('redis.errors.masterNameRequired', 'Master name is required')
      }
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }, [formData, t])

  const buildRedisConfig = useCallback(() => {
    const config: MiddlewareConnection['redisConfig'] = {
      mode: formData.mode,
      password: formData.password || undefined,
      db: formData.db,
      tls: formData.tlsEnabled
        ? {
            enabled: true,
            rejectUnauthorized: formData.tlsRejectUnauthorized,
          }
        : undefined,
    }

    if (formData.mode === 'Standalone') {
      config.host = formData.host
      config.port = formData.port
    } else if (formData.mode === 'Cluster') {
      config.nodes = formData.nodes.filter((n) => n.trim())
    } else if (formData.mode === 'Sentinel') {
      config.sentinels = formData.sentinels.filter((s) => s.trim())
      config.sentinelPassword = formData.sentinelPassword || undefined
      config.masterName = formData.masterName
    }

    return config
  }, [formData])

  const handleSave = useCallback(() => {
    if (!validate()) return

    const redisConfig = buildRedisConfig()

    if (connection) {
      updateConnection(connection.id, {
        name: formData.name,
        redisConfig,
      })
      onSave?.(connection)
    } else {
      const connectionData = {
        name: formData.name,
        moduleType: ModuleType.Middleware,
        middlewareType: 'redis' as const,
        folderId: folderId ?? null,
        order: 0,
        tags: [] as string[],
        lastConnectedAt: null,
        redisConfig,
      }
      const newConnection = createConnection(connectionData as any) as MiddlewareConnection
      onSave?.(newConnection)
    }

    onOpenChange(false)
  }, [validate, buildRedisConfig, formData.name, connection, folderId, createConnection, updateConnection, onSave, onOpenChange])

  const handleTestConnection = useCallback(async () => {
    if (!validate()) return

    setTesting(true)
    setTestResult(null)

    try {
      const redisConfig = buildRedisConfig()
      const connectionInfo = await mwRedisConnect({
        connectionId: connection?.id || 'test',
        mode: redisConfig.mode!,
        host: redisConfig.host,
        port: redisConfig.port,
        nodes: redisConfig.nodes,
        sentinels: redisConfig.sentinels,
        sentinelPassword: redisConfig.sentinelPassword,
        masterName: redisConfig.masterName,
        password: redisConfig.password,
        db: redisConfig.db,
        tls: redisConfig.tls,
      })

      // Disconnect test connection
      if (!connection?.id) {
        await mwRedisDisconnect('test')
      }

      setTestResult({
        success: true,
        message: t('redis.connectionSuccess', 'Connection successful! Version: {{version}}, Keys: {{keys}}')
          .replace('{{version}}', connectionInfo.version || 'unknown')
          .replace('{{keys}}', String(connectionInfo.totalKeys)),
      })
    } catch (err) {
      setTestResult({
        success: false,
        message: `${t('redis.connectionFailed', 'Connection failed')}: ${err}`,
      })
    } finally {
      setTesting(false)
    }
  }, [validate, buildRedisConfig, connection, t])

  // Theme styles
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
              {connection ? t('redis.editConnection', 'Edit Redis Connection') : t('redis.newConnection', 'New Redis Connection')}
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
                {t('redis.connectionName', 'Connection Name')}
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => handleChange('name', e.target.value)}
                placeholder="prod-redis"
                className={cn(
                  'w-full px-3 py-2 rounded border text-sm',
                  'focus:outline-none focus:border-accent-primary',
                  inputBg,
                  borderColor,
                  textPrimary,
                  errors.name && 'border-status-error'
                )}
              />
              {errors.name && <p className="text-xs text-status-error mt-1">{errors.name}</p>}
            </div>

            {/* Mode Selection */}
            <div>
              <label className={cn('block text-sm font-medium mb-1', textSecondary)}>
                {t('redis.deploymentMode', 'Deployment Mode')}
              </label>
              <select
                value={formData.mode}
                onChange={(e) => handleChange('mode', e.target.value as RedisMode)}
                className={cn(
                  'w-full px-3 py-2 rounded border text-sm',
                  'focus:outline-none focus:border-accent-primary',
                  inputBg,
                  borderColor,
                  textPrimary
                )}
              >
                <option value="Standalone">{t('redis.mode.standalone', 'Standalone')}</option>
                <option value="Cluster">{t('redis.mode.cluster', 'Cluster')}</option>
                <option value="Sentinel">{t('redis.mode.sentinel', 'Sentinel')}</option>
              </select>
            </div>

            {/* Standalone Config */}
            {formData.mode === 'Standalone' && (
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className={cn('block text-sm font-medium mb-1', textSecondary)}>
                    {t('redis.host', 'Host')}
                  </label>
                  <input
                    type="text"
                    value={formData.host}
                    onChange={(e) => handleChange('host', e.target.value)}
                    placeholder="127.0.0.1"
                    className={cn(
                      'w-full px-3 py-2 rounded border text-sm font-mono',
                      'focus:outline-none focus:border-accent-primary',
                      inputBg,
                      borderColor,
                      textPrimary,
                      errors.host && 'border-status-error'
                    )}
                  />
                  {errors.host && <p className="text-xs text-status-error mt-1">{errors.host}</p>}
                </div>
                <div>
                  <label className={cn('block text-sm font-medium mb-1', textSecondary)}>
                    {t('redis.port', 'Port')}
                  </label>
                  <input
                    type="number"
                    value={formData.port}
                    onChange={(e) => handleChange('port', parseInt(e.target.value) || 6379)}
                    placeholder="6379"
                    className={cn(
                      'w-full px-3 py-2 rounded border text-sm font-mono',
                      'focus:outline-none focus:border-accent-primary',
                      inputBg,
                      borderColor,
                      textPrimary,
                      errors.port && 'border-status-error'
                    )}
                  />
                  {errors.port && <p className="text-xs text-status-error mt-1">{errors.port}</p>}
                </div>
              </div>
            )}

            {/* Cluster Nodes */}
            {formData.mode === 'Cluster' && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className={cn('text-sm font-medium', textSecondary)}>
                    {t('redis.clusterNodes', 'Cluster Nodes')}
                  </label>
                  <button
                    type="button"
                    onClick={() => handleAddNode('nodes')}
                    className={cn('p-1 rounded transition-colors', hoverBg, 'text-accent-primary')}
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
                <div className="space-y-2">
                  {formData.nodes.map((node, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <input
                        type="text"
                        value={node}
                        onChange={(e) => handleNodeChange('nodes', index, e.target.value)}
                        placeholder="host:port"
                        className={cn(
                          'flex-1 px-3 py-2 rounded border text-sm font-mono',
                          'focus:outline-none focus:border-accent-primary',
                          inputBg,
                          borderColor,
                          textPrimary,
                          errors.nodes && 'border-status-error'
                        )}
                      />
                      {formData.nodes.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveNode('nodes', index)}
                          className={cn('p-2 rounded transition-colors', hoverBg, 'text-status-error')}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                {errors.nodes && <p className="text-xs text-status-error mt-1">{errors.nodes}</p>}
              </div>
            )}

            {/* Sentinel Config */}
            {formData.mode === 'Sentinel' && (
              <>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className={cn('text-sm font-medium', textSecondary)}>
                      {t('redis.sentinelNodes', 'Sentinel Nodes')}
                    </label>
                    <button
                      type="button"
                      onClick={() => handleAddNode('sentinels')}
                      className={cn('p-1 rounded transition-colors', hoverBg, 'text-accent-primary')}
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="space-y-2">
                    {formData.sentinels.map((sentinel, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <input
                          type="text"
                          value={sentinel}
                          onChange={(e) => handleNodeChange('sentinels', index, e.target.value)}
                          placeholder="host:port"
                          className={cn(
                            'flex-1 px-3 py-2 rounded border text-sm font-mono',
                            'focus:outline-none focus:border-accent-primary',
                            inputBg,
                            borderColor,
                            textPrimary,
                            errors.sentinels && 'border-status-error'
                          )}
                        />
                        {formData.sentinels.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveNode('sentinels', index)}
                            className={cn('p-2 rounded transition-colors', hoverBg, 'text-status-error')}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  {errors.sentinels && <p className="text-xs text-status-error mt-1">{errors.sentinels}</p>}
                </div>

                <div>
                  <label className={cn('block text-sm font-medium mb-1', textSecondary)}>
                    {t('redis.masterName', 'Master Name')}
                  </label>
                  <input
                    type="text"
                    value={formData.masterName}
                    onChange={(e) => handleChange('masterName', e.target.value)}
                    placeholder="mymaster"
                    className={cn(
                      'w-full px-3 py-2 rounded border text-sm',
                      'focus:outline-none focus:border-accent-primary',
                      inputBg,
                      borderColor,
                      textPrimary,
                      errors.masterName && 'border-status-error'
                    )}
                  />
                  {errors.masterName && <p className="text-xs text-status-error mt-1">{errors.masterName}</p>}
                </div>

                <div>
                  <label className={cn('block text-sm font-medium mb-1', textSecondary)}>
                    {t('redis.sentinelPassword', 'Sentinel Password')}
                  </label>
                  <div className="relative">
                    <input
                      type={showSentinelPassword ? 'text' : 'password'}
                      value={formData.sentinelPassword}
                      onChange={(e) => handleChange('sentinelPassword', e.target.value)}
                      placeholder={t('redis.optional', 'Optional')}
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
                      onClick={() => setShowSentinelPassword(!showSentinelPassword)}
                      className={cn('absolute right-2 top-1/2 -translate-y-1/2 p-1', textSecondary)}
                    >
                      {showSentinelPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </>
            )}

            {/* Password */}
            <div>
              <label className={cn('block text-sm font-medium mb-1', textSecondary)}>
                {t('redis.password', 'Password')}
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={formData.password}
                  onChange={(e) => handleChange('password', e.target.value)}
                  placeholder={t('redis.optional', 'Optional')}
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
                  onClick={() => setShowPassword(!showPassword)}
                  className={cn('absolute right-2 top-1/2 -translate-y-1/2 p-1', textSecondary)}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Database (only for non-cluster mode) */}
            {formData.mode !== 'Cluster' && (
              <div>
                <label className={cn('block text-sm font-medium mb-1', textSecondary)}>
                  {t('redis.database', 'Database')}
                </label>
                <select
                  value={formData.db}
                  onChange={(e) => handleChange('db', parseInt(e.target.value))}
                  className={cn(
                    'w-full px-3 py-2 rounded border text-sm',
                    'focus:outline-none focus:border-accent-primary',
                    inputBg,
                    borderColor,
                    textPrimary
                  )}
                >
                  {Array.from({ length: 16 }, (_, i) => (
                    <option key={i} value={i}>
                      DB{i}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* TLS Settings */}
            <div className={cn('p-3 rounded border', borderColor)}>
              <div className="flex items-center gap-2 mb-2">
                <input
                  type="checkbox"
                  id="tlsEnabled"
                  checked={formData.tlsEnabled}
                  onChange={(e) => handleChange('tlsEnabled', e.target.checked)}
                  className="w-4 h-4"
                />
                <label htmlFor="tlsEnabled" className={cn('text-sm font-medium', textPrimary)}>
                  {t('redis.enableTls', 'Enable TLS/SSL')}
                </label>
              </div>
              {formData.tlsEnabled && (
                <div className="flex items-center gap-2 mt-2 ml-6">
                  <input
                    type="checkbox"
                    id="tlsVerify"
                    checked={formData.tlsRejectUnauthorized}
                    onChange={(e) => handleChange('tlsRejectUnauthorized', e.target.checked)}
                    className="w-4 h-4"
                  />
                  <label htmlFor="tlsVerify" className={cn('text-sm', textSecondary)}>
                    {t('redis.verifyCertificate', 'Verify server certificate')}
                  </label>
                </div>
              )}
            </div>
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
                {testing ? t('redis.testing', 'Testing...') : t('redis.testConnection', 'Test Connection')}
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
