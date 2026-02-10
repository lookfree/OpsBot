/**
 * Kafka Connection Dialog Component
 *
 * Dialog for creating and editing Kafka connections.
 * Supports SASL authentication and SSL security.
 */

import { useState, useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import * as Dialog from '@radix-ui/react-dialog'
import { X, Eye, EyeOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useConnectionStore, useThemeStore } from '@/stores'
import type { MiddlewareConnection } from '@/types'
import { ModuleType } from '@/types'
import { mwKafkaConnect, mwKafkaDisconnect, type SecurityProtocol as MwSecurityProtocol } from '@/services/middleware'

interface KafkaConnectionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  connection?: MiddlewareConnection
  folderId?: string | null
  onSave?: (connection: MiddlewareConnection) => void
}

type SecurityProtocol = 'PLAINTEXT' | 'SASL_PLAINTEXT' | 'SASL_SSL' | 'SSL'
type SaslMechanism = 'PLAIN' | 'SCRAM-SHA-256' | 'SCRAM-SHA-512'

export function KafkaConnectionDialog({
  open,
  onOpenChange,
  connection,
  folderId,
  onSave,
}: KafkaConnectionDialogProps) {
  const { t } = useTranslation()
  const { theme } = useThemeStore()
  const isDark = theme === 'dark'
  const { createConnection, updateConnection } = useConnectionStore()

  const [formData, setFormData] = useState<{
    name: string
    brokersText: string  // 使用多行文本框，与 MiddlewareConnectionDialog 一致
    securityProtocol: SecurityProtocol
    saslMechanism: SaslMechanism
    username: string
    password: string
  }>({
    name: connection?.name || '',
    brokersText: connection?.kafkaConfig?.brokers?.join('\n') || 'localhost:9092',
    securityProtocol: (connection?.kafkaConfig?.securityProtocol as SecurityProtocol) || 'PLAINTEXT',
    saslMechanism: (connection?.kafkaConfig?.saslMechanism as SaslMechanism) || 'PLAIN',
    username: connection?.kafkaConfig?.username || '',
    password: connection?.kafkaConfig?.password || '',
  })

  const [showPassword, setShowPassword] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)

  // Reset dialog state
  useEffect(() => {
    if (open) {
      if (connection) {
        setFormData({
          name: connection.name,
          brokersText: connection.kafkaConfig?.brokers?.join('\n') || 'localhost:9092',
          securityProtocol: (connection.kafkaConfig?.securityProtocol as SecurityProtocol) || 'PLAINTEXT',
          saslMechanism: (connection.kafkaConfig?.saslMechanism as SaslMechanism) || 'PLAIN',
          username: connection.kafkaConfig?.username || '',
          password: connection.kafkaConfig?.password || '',
        })
      } else {
        setFormData({
          name: '',
          brokersText: 'localhost:9092',
          securityProtocol: 'PLAINTEXT',
          saslMechanism: 'PLAIN',
          username: '',
          password: '',
        })
      }
      setErrors({})
      setTestResult(null)
      setShowPassword(false)
    }
  }, [open, connection])

  const handleChange = useCallback(
    (field: keyof typeof formData, value: string | string[] | SecurityProtocol | SaslMechanism) => {
      setFormData((prev) => ({ ...prev, [field]: value }))
      setErrors((prev) => ({ ...prev, [field]: '' }))
    },
    []
  )

  // Parse brokers from textarea
  const parseBrokers = useCallback((text: string): string[] => {
    return text
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
  }, [])

  const validate = useCallback(() => {
    const newErrors: Record<string, string> = {}

    if (!formData.name?.trim()) {
      newErrors.name = t('kafka.errors.nameRequired', 'Connection name is required')
    }

    const brokers = parseBrokers(formData.brokersText)
    if (brokers.length === 0) {
      newErrors.brokersText = t('middleware.errors.brokersRequired', 'At least one broker is required')
    }

    // Validate broker format (host:port)
    for (const broker of brokers) {
      if (!/^[\w.-]+:\d+$/.test(broker)) {
        newErrors.brokersText = t('middleware.errors.invalidBrokerFormat', 'Invalid broker format (use host:port)')
        break
      }
    }

    // Validate SASL credentials
    if (formData.securityProtocol === 'SASL_PLAINTEXT' || formData.securityProtocol === 'SASL_SSL') {
      if (!formData.username?.trim()) {
        newErrors.username = t('kafka.errors.usernameRequired', 'Username is required for SASL authentication')
      }
      if (!formData.password?.trim()) {
        newErrors.password = t('kafka.errors.passwordRequired', 'Password is required for SASL authentication')
      }
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }, [formData, t, parseBrokers])

  const handleSave = useCallback(() => {
    if (!validate()) return

    const brokers = parseBrokers(formData.brokersText)

    const kafkaConfig = {
      brokers,
      securityProtocol: formData.securityProtocol as 'PLAINTEXT' | 'SSL' | 'SASL_PLAINTEXT' | 'SASL_SSL',
      saslMechanism: formData.saslMechanism,
      username: formData.username || undefined,
      password: formData.password || undefined,
    }

    if (connection) {
      updateConnection(connection.id, {
        name: formData.name,
        kafkaConfig,
      })
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

    onOpenChange(false)
  }, [
    validate,
    formData,
    connection,
    folderId,
    createConnection,
    updateConnection,
    parseBrokers,
    onSave,
    onOpenChange,
  ])

  const handleTestConnection = useCallback(async () => {
    if (!validate()) return

    setTesting(true)
    setTestResult(null)

    const brokers = parseBrokers(formData.brokersText)

    try {
      const connectionInfo = await mwKafkaConnect({
        connectionId: connection?.id || 'test',
        brokers,
        securityProtocol: formData.securityProtocol as MwSecurityProtocol,
        saslMechanism: formData.saslMechanism,
        username: formData.username || undefined,
        password: formData.password || undefined,
      })

      // Disconnect test connection
      if (!connection?.id) {
        await mwKafkaDisconnect('test')
      }

      setTestResult({
        success: true,
        message: t('kafka.connectionSuccess', 'Connection successful! Cluster: {{clusterId}}, Brokers: {{brokerCount}}')
          .replace('{{clusterId}}', connectionInfo.clusterId || 'unknown')
          .replace('{{brokerCount}}', String(connectionInfo.brokers?.length || brokers.length)),
      })
    } catch (err) {
      setTestResult({
        success: false,
        message: `${t('kafka.connectionFailed', 'Connection failed')}: ${err}`,
      })
    } finally {
      setTesting(false)
    }
  }, [validate, formData, connection, parseBrokers, t])

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
              {connection ? t('kafka.editConnection', 'Edit Kafka Connection') : t('kafka.newConnection')}
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
                {t('kafka.connectionName', 'Connection Name')}
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

            {/* Kafka Brokers */}
            <div>
              <label className={cn('block text-sm font-medium mb-1', textSecondary)}>
                {t('middleware.kafkaBrokers', 'Kafka Brokers')}
              </label>
              <textarea
                value={formData.brokersText}
                onChange={(e) => handleChange('brokersText', e.target.value)}
                placeholder={t('middleware.kafkaBrokersPlaceholder', 'broker1:9092\nbroker2:9092\nbroker3:9092')}
                rows={4}
                className={cn(
                  'w-full px-3 py-2 rounded border text-sm font-mono',
                  'focus:outline-none focus:border-accent-primary resize-none',
                  inputBg,
                  borderColor,
                  textPrimary,
                  errors.brokersText && 'border-status-error'
                )}
              />
              <p className={cn('text-xs mt-1', textSecondary)}>
                {t('middleware.kafkaBrokersHint', 'Enter one broker address per line, format: host:port')}
              </p>
              {errors.brokersText && (
                <p className="text-xs text-status-error mt-1">{errors.brokersText}</p>
              )}
            </div>

            {/* Security Protocol */}
            <div>
              <label className={cn('block text-sm font-medium mb-1', textSecondary)}>
                {t('kafka.securityProtocol', 'Security Protocol')}
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
                {/* PLAINTEXT: No encryption, no authentication */}
                <option value="PLAINTEXT">PLAINTEXT ({t('kafka.protocol.plaintext', '无加密无认证')})</option>
                {/* SSL: Encryption only, no authentication */}
                <option value="SSL">SSL ({t('kafka.protocol.ssl', '仅加密')})</option>
                {/* SASL_PLAINTEXT: Authentication only, no encryption */}
                <option value="SASL_PLAINTEXT">SASL_PLAINTEXT ({t('kafka.protocol.saslPlaintext', '仅认证')})</option>
                {/* SASL_SSL: Both encryption and authentication */}
                <option value="SASL_SSL">SASL_SSL ({t('kafka.protocol.saslSsl', '加密+认证')})</option>
              </select>
            </div>

            {/* SASL Mechanism (only shown when SASL is selected) */}
            {requiresSasl && (
              <>
                <div>
                  <label className={cn('block text-sm font-medium mb-1', textSecondary)}>
                    {t('kafka.saslMechanism', 'SASL Mechanism')}
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
                    {t('kafka.username', 'Username')}
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
                    {t('kafka.password', 'Password')}
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
                {testing ? t('kafka.testing', 'Testing...') : t('kafka.testConnection', 'Test Connection')}
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
