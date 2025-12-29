/**
 * Middleware Connection Dialog Component
 *
 * 两步式中间件连接创建对话框：
 * 1. 选择中间件类型
 * 2. 填写连接信息
 */

import { useState, useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import * as Dialog from '@radix-ui/react-dialog'
import { X, Eye, EyeOff, ChevronLeft, Plus, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useConnectionStore, useThemeStore } from '@/stores'
import type { MiddlewareConnection } from '@/types'
import { ModuleType } from '@/types'
import {
  mwKafkaConnect,
  mwKafkaDisconnect,
  mwRedisConnect,
  mwRedisDisconnect,
  type SecurityProtocol as MwSecurityProtocol,
  type RedisMode
} from '@/services/middleware'
import { MiddlewareTypeSelector } from './MiddlewareTypeSelector'
import { getMiddlewareTypeById, type MiddlewareTypeConfig } from '@/config/middlewareTypes'

interface MiddlewareConnectionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  connection?: MiddlewareConnection
  folderId?: string | null
  onSave?: (connection: MiddlewareConnection) => void
}

type DialogStep = 'select-type' | 'connection-form'
type SecurityProtocol = 'PLAINTEXT' | 'SASL_PLAINTEXT' | 'SASL_SSL' | 'SSL'
type SaslMechanism = 'PLAIN' | 'SCRAM-SHA-256' | 'SCRAM-SHA-512'

export function MiddlewareConnectionDialog({
  open,
  onOpenChange,
  connection,
  folderId,
  onSave,
}: MiddlewareConnectionDialogProps) {
  const { t } = useTranslation()
  const { theme } = useThemeStore()
  const isDark = theme === 'dark'
  const { createConnection, updateConnection } = useConnectionStore()

  // 编辑模式直接进入表单，新建模式从选择类型开始
  const [step, setStep] = useState<DialogStep>(connection ? 'connection-form' : 'select-type')
  const [selectedMwType, setSelectedMwType] = useState<MiddlewareTypeConfig | null>(
    connection ? getMiddlewareTypeById(connection.middlewareType) || null : null
  )

  // Form data for Kafka and Redis
  const [formData, setFormData] = useState<{
    name: string
    // Kafka fields
    bootstrapServers: string[]
    securityProtocol: SecurityProtocol
    saslMechanism: SaslMechanism
    username: string
    password: string
    // Redis fields
    redisMode: RedisMode
    redisHost: string
    redisPort: number
    redisNodes: string[]
    redisSentinels: string[]
    redisSentinelPassword: string
    redisMasterName: string
    redisPassword: string
    redisDb: number
    redisTlsEnabled: boolean
    redisTlsRejectUnauthorized: boolean
  }>({
    name: connection?.name || '',
    // Kafka defaults
    bootstrapServers: connection?.kafkaConfig?.bootstrapServers || ['localhost:9092'],
    securityProtocol: (connection?.kafkaConfig?.securityProtocol as SecurityProtocol) || 'PLAINTEXT',
    saslMechanism: (connection?.kafkaConfig?.saslMechanism as SaslMechanism) || 'PLAIN',
    username: connection?.kafkaConfig?.username || '',
    password: connection?.kafkaConfig?.password || '',
    // Redis defaults
    redisMode: connection?.redisConfig?.mode || 'standalone',
    redisHost: connection?.redisConfig?.host || '127.0.0.1',
    redisPort: connection?.redisConfig?.port || 6379,
    redisNodes: connection?.redisConfig?.nodes?.length ? connection.redisConfig.nodes : [''],
    redisSentinels: connection?.redisConfig?.sentinels?.length ? connection.redisConfig.sentinels : [''],
    redisSentinelPassword: connection?.redisConfig?.sentinelPassword || '',
    redisMasterName: connection?.redisConfig?.masterName || 'mymaster',
    redisPassword: connection?.redisConfig?.password || '',
    redisDb: connection?.redisConfig?.db || 0,
    redisTlsEnabled: connection?.redisConfig?.tls?.enabled || false,
    redisTlsRejectUnauthorized: connection?.redisConfig?.tls?.rejectUnauthorized ?? true,
  })

  const [showPassword, setShowPassword] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)

  // Reset dialog state
  useEffect(() => {
    if (open) {
      if (connection) {
        setStep('connection-form')
        setSelectedMwType(getMiddlewareTypeById(connection.middlewareType) || null)
        setFormData({
          name: connection.name,
          // Kafka
          bootstrapServers: connection.kafkaConfig?.bootstrapServers || ['localhost:9092'],
          securityProtocol: (connection.kafkaConfig?.securityProtocol as SecurityProtocol) || 'PLAINTEXT',
          saslMechanism: (connection.kafkaConfig?.saslMechanism as SaslMechanism) || 'PLAIN',
          username: connection.kafkaConfig?.username || '',
          password: connection.kafkaConfig?.password || '',
          // Redis
          redisMode: connection.redisConfig?.mode || 'standalone',
          redisHost: connection.redisConfig?.host || '127.0.0.1',
          redisPort: connection.redisConfig?.port || 6379,
          redisNodes: connection.redisConfig?.nodes?.length ? connection.redisConfig.nodes : [''],
          redisSentinels: connection.redisConfig?.sentinels?.length ? connection.redisConfig.sentinels : [''],
          redisSentinelPassword: connection.redisConfig?.sentinelPassword || '',
          redisMasterName: connection.redisConfig?.masterName || 'mymaster',
          redisPassword: connection.redisConfig?.password || '',
          redisDb: connection.redisConfig?.db || 0,
          redisTlsEnabled: connection.redisConfig?.tls?.enabled || false,
          redisTlsRejectUnauthorized: connection.redisConfig?.tls?.rejectUnauthorized ?? true,
        })
      } else {
        setStep('select-type')
        setSelectedMwType(null)
        setFormData({
          name: '',
          // Kafka defaults
          bootstrapServers: ['localhost:9092'],
          securityProtocol: 'PLAINTEXT',
          saslMechanism: 'PLAIN',
          username: '',
          password: '',
          // Redis defaults
          redisMode: 'standalone',
          redisHost: '127.0.0.1',
          redisPort: 6379,
          redisNodes: [''],
          redisSentinels: [''],
          redisSentinelPassword: '',
          redisMasterName: 'mymaster',
          redisPassword: '',
          redisDb: 0,
          redisTlsEnabled: false,
          redisTlsRejectUnauthorized: true,
        })
      }
      setErrors({})
      setTestResult(null)
    }
  }, [open, connection])

  const handleMwTypeSelect = useCallback((mwType: MiddlewareTypeConfig) => {
    setSelectedMwType(mwType)
  }, [])

  const handleNextStep = useCallback(() => {
    if (selectedMwType) {
      setStep('connection-form')
    }
  }, [selectedMwType])

  const handleBackStep = useCallback(() => {
    setStep('select-type')
    setTestResult(null)
  }, [])

  const handleChange = useCallback(
    <K extends keyof typeof formData>(field: K, value: (typeof formData)[K]) => {
      setFormData((prev) => ({ ...prev, [field]: value }))
      setErrors((prev) => ({ ...prev, [field]: '' }))
    },
    []
  )

  const handleAddServer = useCallback(() => {
    setFormData((prev) => ({
      ...prev,
      bootstrapServers: [...prev.bootstrapServers, ''],
    }))
  }, [])

  const handleRemoveServer = useCallback((index: number) => {
    setFormData((prev) => ({
      ...prev,
      bootstrapServers: prev.bootstrapServers.filter((_, i) => i !== index),
    }))
  }, [])

  const handleServerChange = useCallback((index: number, value: string) => {
    setFormData((prev) => ({
      ...prev,
      bootstrapServers: prev.bootstrapServers.map((s, i) => (i === index ? value : s)),
    }))
    setErrors((prev) => ({ ...prev, bootstrapServers: '' }))
  }, [])

  // Redis node handlers
  const handleAddRedisNode = useCallback((field: 'redisNodes' | 'redisSentinels') => {
    setFormData((prev) => ({
      ...prev,
      [field]: [...prev[field], ''],
    }))
  }, [])

  const handleRemoveRedisNode = useCallback((field: 'redisNodes' | 'redisSentinels', index: number) => {
    setFormData((prev) => ({
      ...prev,
      [field]: prev[field].filter((_, i) => i !== index),
    }))
  }, [])

  const handleRedisNodeChange = useCallback((field: 'redisNodes' | 'redisSentinels', index: number, value: string) => {
    setFormData((prev) => ({
      ...prev,
      [field]: prev[field].map((n, i) => (i === index ? value : n)),
    }))
    setErrors((prev) => ({ ...prev, [field]: '' }))
  }, [])

  const validate = useCallback(() => {
    const newErrors: Record<string, string> = {}

    if (!formData.name?.trim()) {
      newErrors.name = t('middleware.errors.nameRequired')
    }

    if (selectedMwType?.id === 'kafka') {
      const validServers = formData.bootstrapServers.filter((s) => s.trim())
      if (validServers.length === 0) {
        newErrors.bootstrapServers = t('middleware.errors.serversRequired')
      }

      // Validate server format (host:port)
      for (const server of validServers) {
        if (!/^[\w.-]+:\d+$/.test(server.trim())) {
          newErrors.bootstrapServers = t('middleware.errors.invalidServerFormat')
          break
        }
      }

      // Validate SASL credentials
      if (formData.securityProtocol === 'SASL_PLAINTEXT' || formData.securityProtocol === 'SASL_SSL') {
        if (!formData.username?.trim()) {
          newErrors.username = t('middleware.errors.usernameRequired')
        }
        if (!formData.password?.trim()) {
          newErrors.password = t('middleware.errors.passwordRequired')
        }
      }
    } else if (selectedMwType?.id === 'redis') {
      // Redis validation
      if (formData.redisMode === 'standalone') {
        if (!formData.redisHost?.trim()) {
          newErrors.redisHost = t('redis.errors.hostRequired', 'Host is required')
        }
        if (!formData.redisPort || formData.redisPort < 1 || formData.redisPort > 65535) {
          newErrors.redisPort = t('redis.errors.invalidPort', 'Invalid port number')
        }
      } else if (formData.redisMode === 'cluster') {
        const validNodes = formData.redisNodes.filter((n) => n.trim())
        if (validNodes.length === 0) {
          newErrors.redisNodes = t('redis.errors.nodesRequired', 'At least one cluster node is required')
        }
        for (const node of validNodes) {
          if (!/^[\w.-]+:\d+$/.test(node.trim())) {
            newErrors.redisNodes = t('redis.errors.invalidNodeFormat', 'Invalid node format (use host:port)')
            break
          }
        }
      } else if (formData.redisMode === 'sentinel') {
        const validSentinels = formData.redisSentinels.filter((s) => s.trim())
        if (validSentinels.length === 0) {
          newErrors.redisSentinels = t('redis.errors.sentinelsRequired', 'At least one sentinel node is required')
        }
        for (const sentinel of validSentinels) {
          if (!/^[\w.-]+:\d+$/.test(sentinel.trim())) {
            newErrors.redisSentinels = t('redis.errors.invalidSentinelFormat', 'Invalid sentinel format (use host:port)')
            break
          }
        }
        if (!formData.redisMasterName?.trim()) {
          newErrors.redisMasterName = t('redis.errors.masterNameRequired', 'Master name is required')
        }
      }
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }, [formData, selectedMwType, t])

  // Build Redis config from form data
  const buildRedisConfig = useCallback(() => {
    const config: MiddlewareConnection['redisConfig'] = {
      mode: formData.redisMode,
      password: formData.redisPassword || undefined,
      db: formData.redisDb,
      tls: formData.redisTlsEnabled
        ? {
            enabled: true,
            rejectUnauthorized: formData.redisTlsRejectUnauthorized,
          }
        : undefined,
    }

    if (formData.redisMode === 'standalone') {
      config.host = formData.redisHost
      config.port = formData.redisPort
    } else if (formData.redisMode === 'cluster') {
      config.nodes = formData.redisNodes.filter((n) => n.trim())
    } else if (formData.redisMode === 'sentinel') {
      config.sentinels = formData.redisSentinels.filter((s) => s.trim())
      config.sentinelPassword = formData.redisSentinelPassword || undefined
      config.masterName = formData.redisMasterName
    }

    return config
  }, [formData])

  const handleSave = useCallback(() => {
    if (!validate() || !selectedMwType) return

    if (selectedMwType.id === 'kafka') {
      const validServers = formData.bootstrapServers.filter((s) => s.trim())
      const kafkaConfig = {
        bootstrapServers: validServers,
        securityProtocol: formData.securityProtocol as 'PLAINTEXT' | 'SASL_PLAINTEXT' | 'SASL_SSL',
        saslMechanism: formData.saslMechanism,
        username: formData.username || undefined,
        password: formData.password || undefined,
      }

      if (connection) {
        updateConnection(connection.id, { name: formData.name, kafkaConfig })
        onSave?.(connection)
      } else {
        const connectionData = {
          name: formData.name,
          moduleType: ModuleType.Middleware,
          middlewareType: 'kafka' as const,
          folderId: folderId ?? null,
          order: 0,
          tags: [] as string[],
          lastConnectedAt: null,
          kafkaConfig,
        }
        const newConnection = createConnection(connectionData as any) as MiddlewareConnection
        onSave?.(newConnection)
      }
    } else if (selectedMwType.id === 'redis') {
      const redisConfig = buildRedisConfig()

      if (connection) {
        updateConnection(connection.id, { name: formData.name, redisConfig })
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
    }

    onOpenChange(false)
  }, [
    validate,
    formData,
    selectedMwType,
    connection,
    folderId,
    createConnection,
    updateConnection,
    buildRedisConfig,
    onSave,
    onOpenChange,
  ])

  const handleTestConnection = useCallback(async () => {
    if (!validate() || !selectedMwType) return

    setTesting(true)
    setTestResult(null)

    try {
      if (selectedMwType.id === 'kafka') {
        const validServers = formData.bootstrapServers.filter((s) => s.trim())
        const connectionInfo = await mwKafkaConnect({
          connectionId: connection?.id || 'test',
          bootstrapServers: validServers,
          securityProtocol: formData.securityProtocol as MwSecurityProtocol,
          saslMechanism: formData.saslMechanism,
          username: formData.username || undefined,
          password: formData.password || undefined,
        })

        if (!connection?.id) {
          await mwKafkaDisconnect('test')
        }

        setTestResult({
          success: true,
          message: t('middleware.connectionSuccess')
            .replace('{{clusterId}}', connectionInfo.clusterId || 'unknown')
            .replace('{{brokerCount}}', String(connectionInfo.bootstrapServers.length)),
        })
      } else if (selectedMwType.id === 'redis') {
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

        if (!connection?.id) {
          await mwRedisDisconnect('test')
        }

        setTestResult({
          success: true,
          message: t('redis.connectionSuccess', 'Connection successful! Version: {{version}}, Keys: {{keys}}')
            .replace('{{version}}', connectionInfo.version || 'unknown')
            .replace('{{keys}}', String(connectionInfo.totalKeys)),
        })
      }
    } catch (err) {
      setTestResult({
        success: false,
        message: `${t('middleware.connectionFailed')}: ${err}`,
      })
    } finally {
      setTesting(false)
    }
  }, [validate, formData, connection, selectedMwType, buildRedisConfig, t])

  // Theme styles
  const dialogBg = isDark ? 'bg-dark-bg-primary' : 'bg-light-bg-primary'
  const borderColor = isDark ? 'border-dark-border' : 'border-light-border'
  const textPrimary = isDark ? 'text-dark-text-primary' : 'text-light-text-primary'
  const textSecondary = isDark ? 'text-dark-text-secondary' : 'text-light-text-secondary'
  const inputBg = isDark ? 'bg-dark-bg-hover' : 'bg-light-bg-primary'
  const hoverBg = isDark ? 'hover:bg-dark-bg-hover' : 'hover:bg-light-bg-hover'

  const requiresSasl = formData.securityProtocol === 'SASL_PLAINTEXT' || formData.securityProtocol === 'SASL_SSL'

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
        <Dialog.Content
          className={cn(
            'fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2',
            'w-full max-h-[90vh] overflow-y-auto',
            'rounded-lg shadow-xl z-50 border',
            'focus:outline-none',
            step === 'select-type' ? 'max-w-2xl' : 'max-w-lg',
            dialogBg,
            borderColor
          )}
        >
          {/* Header */}
          <div className={cn('flex items-center justify-between px-6 py-4 border-b', borderColor)}>
            <div className="flex items-center gap-2">
              {step === 'connection-form' && !connection && (
                <button
                  onClick={handleBackStep}
                  className={cn('p-1 rounded transition-colors', hoverBg)}
                >
                  <ChevronLeft className={cn('w-5 h-5', textSecondary)} />
                </button>
              )}
              <Dialog.Title className={cn('text-lg font-semibold', textPrimary)}>
                {connection
                  ? t('middleware.editConnection')
                  : step === 'select-type'
                    ? t('middleware.selectMiddlewareType')
                    : t('middleware.newConnection')}
              </Dialog.Title>
            </div>
            <Dialog.Close className={cn('p-1 rounded transition-colors', hoverBg)}>
              <X className={cn('w-5 h-5', textSecondary)} />
            </Dialog.Close>
          </div>

          {/* Step 1: Select Middleware Type */}
          {step === 'select-type' && (
            <>
              <MiddlewareTypeSelector
                selectedType={selectedMwType?.id || null}
                onSelect={handleMwTypeSelect}
              />
              {/* Footer for step 1 */}
              <div className={cn('px-6 py-4 border-t flex justify-end gap-3', borderColor)}>
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
                  onClick={handleNextStep}
                  disabled={!selectedMwType}
                  className={cn(
                    'px-4 py-2 rounded text-sm transition-colors',
                    'disabled:opacity-50 disabled:cursor-not-allowed',
                    'bg-accent-primary text-white hover:bg-accent-hover'
                  )}
                >
                  {t('common.next')}
                </button>
              </div>
            </>
          )}

          {/* Step 2: Connection Form */}
          {step === 'connection-form' && (
            <>
              {/* Content */}
              <div className="px-6 py-4 space-y-4">
                {/* Selected MW Type Display */}
                {selectedMwType && !connection && (
                  <div
                    className={cn(
                      'flex items-center gap-3 p-3 rounded-lg border',
                      borderColor,
                      isDark ? 'bg-dark-bg-hover' : 'bg-light-bg-hover'
                    )}
                  >
                    <img
                      src={selectedMwType.icon}
                      alt={selectedMwType.name}
                      className="w-8 h-8 object-contain"
                    />
                    <span className={cn('font-medium', textPrimary)}>{selectedMwType.name}</span>
                  </div>
                )}

                {/* Connection Name */}
                <div>
                  <label className={cn('block text-sm font-medium mb-1', textSecondary)}>
                    {t('middleware.connectionName')}
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => handleChange('name', e.target.value)}
                    placeholder="prod-kafka-cluster"
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

                {/* Kafka specific fields */}
                {selectedMwType?.id === 'kafka' && (
                  <>
                    {/* Bootstrap Servers */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className={cn('text-sm font-medium', textSecondary)}>
                          {t('middleware.bootstrapServers')}
                        </label>
                        <button
                          type="button"
                          onClick={handleAddServer}
                          className={cn('p-1 rounded transition-colors', hoverBg, 'text-accent-primary')}
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="space-y-2">
                        {formData.bootstrapServers.map((server, index) => (
                          <div key={index} className="flex items-center gap-2">
                            <input
                              type="text"
                              value={server}
                              onChange={(e) => handleServerChange(index, e.target.value)}
                              placeholder="localhost:9092"
                              className={cn(
                                'flex-1 px-3 py-2 rounded border text-sm font-mono',
                                'focus:outline-none focus:border-accent-primary',
                                inputBg,
                                borderColor,
                                textPrimary,
                                errors.bootstrapServers && 'border-status-error'
                              )}
                            />
                            {formData.bootstrapServers.length > 1 && (
                              <button
                                type="button"
                                onClick={() => handleRemoveServer(index)}
                                className={cn('p-2 rounded transition-colors', hoverBg, 'text-status-error')}
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                      {errors.bootstrapServers && (
                        <p className="text-xs text-status-error mt-1">{errors.bootstrapServers}</p>
                      )}
                    </div>

                    {/* Security Protocol */}
                    <div>
                      <label className={cn('block text-sm font-medium mb-1', textSecondary)}>
                        {t('middleware.securityProtocol')}
                      </label>
                      <select
                        value={formData.securityProtocol}
                        onChange={(e) => handleChange('securityProtocol', e.target.value as SecurityProtocol)}
                        className={cn(
                          'w-full px-3 py-2 rounded border text-sm',
                          'focus:outline-none focus:border-accent-primary',
                          inputBg,
                          borderColor,
                          textPrimary
                        )}
                      >
                        <option value="PLAINTEXT">PLAINTEXT ({t('middleware.protocol.plaintext', '无加密无认证')})</option>
                        <option value="SSL">SSL ({t('middleware.protocol.ssl', '仅加密')})</option>
                        <option value="SASL_PLAINTEXT">SASL_PLAINTEXT ({t('middleware.protocol.saslPlaintext', '仅认证')})</option>
                        <option value="SASL_SSL">SASL_SSL ({t('middleware.protocol.saslSsl', '加密+认证')})</option>
                      </select>
                    </div>

                    {/* SASL Mechanism */}
                    {requiresSasl && (
                      <>
                        <div>
                          <label className={cn('block text-sm font-medium mb-1', textSecondary)}>
                            {t('middleware.saslMechanism')}
                          </label>
                          <select
                            value={formData.saslMechanism}
                            onChange={(e) => handleChange('saslMechanism', e.target.value as SaslMechanism)}
                            className={cn(
                              'w-full px-3 py-2 rounded border text-sm',
                              'focus:outline-none focus:border-accent-primary',
                              inputBg,
                              borderColor,
                              textPrimary
                            )}
                          >
                            <option value="PLAIN">PLAIN</option>
                            <option value="SCRAM-SHA-256">SCRAM-SHA-256</option>
                            <option value="SCRAM-SHA-512">SCRAM-SHA-512</option>
                          </select>
                        </div>

                        {/* Username */}
                        <div>
                          <label className={cn('block text-sm font-medium mb-1', textSecondary)}>
                            {t('middleware.username')}
                          </label>
                          <input
                            type="text"
                            value={formData.username}
                            onChange={(e) => handleChange('username', e.target.value)}
                            placeholder="kafka-user"
                            className={cn(
                              'w-full px-3 py-2 rounded border text-sm',
                              'focus:outline-none focus:border-accent-primary',
                              inputBg,
                              borderColor,
                              textPrimary,
                              errors.username && 'border-status-error'
                            )}
                          />
                          {errors.username && <p className="text-xs text-status-error mt-1">{errors.username}</p>}
                        </div>

                        {/* Password */}
                        <div>
                          <label className={cn('block text-sm font-medium mb-1', textSecondary)}>
                            {t('middleware.password')}
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
                          {errors.password && <p className="text-xs text-status-error mt-1">{errors.password}</p>}
                        </div>
                      </>
                    )}
                  </>
                )}

                {/* Redis specific fields */}
                {selectedMwType?.id === 'redis' && (
                  <>
                    {/* Mode Selection */}
                    <div>
                      <label className={cn('block text-sm font-medium mb-1', textSecondary)}>
                        {t('redis.deploymentMode', 'Deployment Mode')}
                      </label>
                      <select
                        value={formData.redisMode}
                        onChange={(e) => handleChange('redisMode', e.target.value as RedisMode)}
                        className={cn(
                          'w-full px-3 py-2 rounded border text-sm',
                          'focus:outline-none focus:border-accent-primary',
                          inputBg,
                          borderColor,
                          textPrimary
                        )}
                      >
                        <option value="standalone">{t('redis.mode.standalone', 'Standalone')}</option>
                        <option value="cluster">{t('redis.mode.cluster', 'Cluster')}</option>
                        <option value="sentinel">{t('redis.mode.sentinel', 'Sentinel')}</option>
                      </select>
                    </div>

                    {/* Standalone Config */}
                    {formData.redisMode === 'standalone' && (
                      <div className="grid grid-cols-3 gap-3">
                        <div className="col-span-2">
                          <label className={cn('block text-sm font-medium mb-1', textSecondary)}>
                            {t('redis.host', 'Host')}
                          </label>
                          <input
                            type="text"
                            value={formData.redisHost}
                            onChange={(e) => handleChange('redisHost', e.target.value)}
                            placeholder="127.0.0.1"
                            className={cn(
                              'w-full px-3 py-2 rounded border text-sm font-mono',
                              'focus:outline-none focus:border-accent-primary',
                              inputBg,
                              borderColor,
                              textPrimary,
                              errors.redisHost && 'border-status-error'
                            )}
                          />
                          {errors.redisHost && <p className="text-xs text-status-error mt-1">{errors.redisHost}</p>}
                        </div>
                        <div>
                          <label className={cn('block text-sm font-medium mb-1', textSecondary)}>
                            {t('redis.port', 'Port')}
                          </label>
                          <input
                            type="number"
                            value={formData.redisPort}
                            onChange={(e) => handleChange('redisPort', parseInt(e.target.value) || 6379)}
                            placeholder="6379"
                            className={cn(
                              'w-full px-3 py-2 rounded border text-sm font-mono',
                              'focus:outline-none focus:border-accent-primary',
                              inputBg,
                              borderColor,
                              textPrimary,
                              errors.redisPort && 'border-status-error'
                            )}
                          />
                          {errors.redisPort && <p className="text-xs text-status-error mt-1">{errors.redisPort}</p>}
                        </div>
                      </div>
                    )}

                    {/* Cluster Nodes */}
                    {formData.redisMode === 'cluster' && (
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className={cn('text-sm font-medium', textSecondary)}>
                            {t('redis.clusterNodes', 'Cluster Nodes')}
                          </label>
                          <button
                            type="button"
                            onClick={() => handleAddRedisNode('redisNodes')}
                            className={cn('p-1 rounded transition-colors', hoverBg, 'text-accent-primary')}
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                        </div>
                        <div className="space-y-2">
                          {formData.redisNodes.map((node, index) => (
                            <div key={index} className="flex items-center gap-2">
                              <input
                                type="text"
                                value={node}
                                onChange={(e) => handleRedisNodeChange('redisNodes', index, e.target.value)}
                                placeholder="host:port"
                                className={cn(
                                  'flex-1 px-3 py-2 rounded border text-sm font-mono',
                                  'focus:outline-none focus:border-accent-primary',
                                  inputBg,
                                  borderColor,
                                  textPrimary,
                                  errors.redisNodes && 'border-status-error'
                                )}
                              />
                              {formData.redisNodes.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => handleRemoveRedisNode('redisNodes', index)}
                                  className={cn('p-2 rounded transition-colors', hoverBg, 'text-status-error')}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                        {errors.redisNodes && <p className="text-xs text-status-error mt-1">{errors.redisNodes}</p>}
                      </div>
                    )}

                    {/* Sentinel Config */}
                    {formData.redisMode === 'sentinel' && (
                      <>
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className={cn('text-sm font-medium', textSecondary)}>
                              {t('redis.sentinelNodes', 'Sentinel Nodes')}
                            </label>
                            <button
                              type="button"
                              onClick={() => handleAddRedisNode('redisSentinels')}
                              className={cn('p-1 rounded transition-colors', hoverBg, 'text-accent-primary')}
                            >
                              <Plus className="w-4 h-4" />
                            </button>
                          </div>
                          <div className="space-y-2">
                            {formData.redisSentinels.map((sentinel, index) => (
                              <div key={index} className="flex items-center gap-2">
                                <input
                                  type="text"
                                  value={sentinel}
                                  onChange={(e) => handleRedisNodeChange('redisSentinels', index, e.target.value)}
                                  placeholder="host:port"
                                  className={cn(
                                    'flex-1 px-3 py-2 rounded border text-sm font-mono',
                                    'focus:outline-none focus:border-accent-primary',
                                    inputBg,
                                    borderColor,
                                    textPrimary,
                                    errors.redisSentinels && 'border-status-error'
                                  )}
                                />
                                {formData.redisSentinels.length > 1 && (
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveRedisNode('redisSentinels', index)}
                                    className={cn('p-2 rounded transition-colors', hoverBg, 'text-status-error')}
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                          {errors.redisSentinels && <p className="text-xs text-status-error mt-1">{errors.redisSentinels}</p>}
                        </div>

                        <div>
                          <label className={cn('block text-sm font-medium mb-1', textSecondary)}>
                            {t('redis.masterName', 'Master Name')}
                          </label>
                          <input
                            type="text"
                            value={formData.redisMasterName}
                            onChange={(e) => handleChange('redisMasterName', e.target.value)}
                            placeholder="mymaster"
                            className={cn(
                              'w-full px-3 py-2 rounded border text-sm',
                              'focus:outline-none focus:border-accent-primary',
                              inputBg,
                              borderColor,
                              textPrimary,
                              errors.redisMasterName && 'border-status-error'
                            )}
                          />
                          {errors.redisMasterName && <p className="text-xs text-status-error mt-1">{errors.redisMasterName}</p>}
                        </div>

                        <div>
                          <label className={cn('block text-sm font-medium mb-1', textSecondary)}>
                            {t('redis.sentinelPassword', 'Sentinel Password')}
                          </label>
                          <input
                            type="password"
                            value={formData.redisSentinelPassword}
                            onChange={(e) => handleChange('redisSentinelPassword', e.target.value)}
                            placeholder={t('redis.optional', 'Optional')}
                            className={cn(
                              'w-full px-3 py-2 rounded border text-sm',
                              'focus:outline-none focus:border-accent-primary',
                              inputBg,
                              borderColor,
                              textPrimary
                            )}
                          />
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
                          value={formData.redisPassword}
                          onChange={(e) => handleChange('redisPassword', e.target.value)}
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
                    {formData.redisMode !== 'cluster' && (
                      <div>
                        <label className={cn('block text-sm font-medium mb-1', textSecondary)}>
                          {t('redis.database', 'Database')}
                        </label>
                        <select
                          value={formData.redisDb}
                          onChange={(e) => handleChange('redisDb', parseInt(e.target.value))}
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
                          id="redisTlsEnabled"
                          checked={formData.redisTlsEnabled}
                          onChange={(e) => handleChange('redisTlsEnabled', e.target.checked)}
                          className="w-4 h-4"
                        />
                        <label htmlFor="redisTlsEnabled" className={cn('text-sm font-medium', textPrimary)}>
                          {t('redis.enableTls', 'Enable TLS/SSL')}
                        </label>
                      </div>
                      {formData.redisTlsEnabled && (
                        <div className="flex items-center gap-2 mt-2 ml-6">
                          <input
                            type="checkbox"
                            id="redisTlsVerify"
                            checked={formData.redisTlsRejectUnauthorized}
                            onChange={(e) => handleChange('redisTlsRejectUnauthorized', e.target.checked)}
                            className="w-4 h-4"
                          />
                          <label htmlFor="redisTlsVerify" className={cn('text-sm', textSecondary)}>
                            {t('redis.verifyCertificate', 'Verify server certificate')}
                          </label>
                        </div>
                      )}
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
                    {testing ? t('middleware.testing') : t('middleware.testConnection')}
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
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
