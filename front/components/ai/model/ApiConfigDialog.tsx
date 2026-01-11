/**
 * API Config Dialog Component
 *
 * Dialog for creating/editing cloud API configurations.
 */

import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { useAiStore } from '@/stores'
import { X, Eye, EyeOff, Loader2, CheckCircle2, XCircle, Cloud } from 'lucide-react'
import { useAiStyles } from '../hooks'
import type { CloudApiConfig, CloudApiProvider, CloudApiTestResult } from '@/types'

interface ApiConfigDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  config: CloudApiConfig | null
  onSave: (config: Omit<CloudApiConfig, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => Promise<void>
  isLoading: boolean
}

/** Default base URLs for providers */
const DEFAULT_BASE_URLS: Record<CloudApiProvider, string> = {
  openai: 'https://api.openai.com/v1',
  claude: 'https://api.anthropic.com',
  qwen: 'https://dashscope.aliyuncs.com/api/v1',
  custom: '',
}

/** Provider options */
const PROVIDER_OPTIONS: { value: CloudApiProvider; label: string; icon: string }[] = [
  { value: 'openai', label: 'OpenAI', icon: '🤖' },
  { value: 'claude', label: 'Claude (Anthropic)', icon: '🧠' },
  { value: 'qwen', label: '通义千问 (Qwen)', icon: '🌐' },
  { value: 'custom', label: 'Custom', icon: '⚙️' },
]

export function ApiConfigDialog({ open, onOpenChange, config, onSave, isLoading }: ApiConfigDialogProps) {
  const { t } = useTranslation()
  const styles = useAiStyles()
  const { testCloudApiConnection } = useAiStore()

  // Form state
  const [name, setName] = useState('')
  const [provider, setProvider] = useState<CloudApiProvider>('openai')
  const [apiKey, setApiKey] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [organization, setOrganization] = useState('')
  const [defaultModel, setDefaultModel] = useState('')
  const [enabled, setEnabled] = useState(true)
  const [showApiKey, setShowApiKey] = useState(false)

  // Test state
  const [isTesting, setIsTesting] = useState(false)
  const [testResult, setTestResult] = useState<CloudApiTestResult | null>(null)

  // Reset form when dialog opens/closes or config changes
  useEffect(() => {
    if (open) {
      if (config) {
        setName(config.name)
        setProvider(config.provider)
        setApiKey(config.apiKey || '')
        setBaseUrl(config.baseUrl || '')
        setOrganization(config.organization || '')
        setDefaultModel(config.defaultModel || '')
        setEnabled(config.enabled)
      } else {
        setName('')
        setProvider('openai')
        setApiKey('')
        setBaseUrl('')
        setOrganization('')
        setDefaultModel('')
        setEnabled(true)
      }
      setShowApiKey(false)
      setTestResult(null)
    }
  }, [open, config])

  // Update base URL when provider changes (only for new configs)
  useEffect(() => {
    if (!config && provider) {
      setBaseUrl(DEFAULT_BASE_URLS[provider])
    }
  }, [provider, config])

  const handleTest = useCallback(async () => {
    if (!apiKey) {
      setTestResult({ success: false, message: t('ai.cloudApi.apiKeyRequired') })
      return
    }

    setIsTesting(true)
    setTestResult(null)

    try {
      const result = await testCloudApiConnection(
        provider,
        apiKey,
        baseUrl || undefined,
        organization || undefined
      )
      setTestResult(result)
    } catch (error) {
      setTestResult({
        success: false,
        message: error instanceof Error ? error.message : String(error),
      })
    } finally {
      setIsTesting(false)
    }
  }, [apiKey, baseUrl, organization, provider, testCloudApiConnection, t])

  const handleSave = useCallback(async () => {
    const configData = {
      id: config?.id,
      name: name || `${provider} API`,
      provider,
      apiKey: apiKey || undefined,
      baseUrl: baseUrl || undefined,
      organization: organization || undefined,
      defaultModel: defaultModel || undefined,
      enabled,
    }

    await onSave(configData)
  }, [config?.id, name, provider, apiKey, baseUrl, organization, defaultModel, enabled, onSave])

  const isValid = name.trim() !== ''

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={() => !isLoading && !isTesting && onOpenChange(false)}
      />

      {/* Dialog */}
      <div className={cn('relative w-[500px] max-h-[90vh] rounded-lg shadow-xl overflow-hidden flex flex-col', styles.bgPrimary)}>
        {/* Header */}
        <div className={cn('flex items-center justify-between px-4 py-3 border-b', styles.borderColor)}>
          <div className="flex items-center gap-2">
            <Cloud className={cn('w-5 h-5', styles.textPrimary)} />
            <h2 className={cn('text-lg font-semibold', styles.textPrimary)}>
              {config ? t('ai.cloudApi.editConfig') : t('ai.cloudApi.addProvider')}
            </h2>
          </div>
          <button
            className={cn('p-1 rounded transition-colors', styles.hoverBg, styles.textSecondary)}
            onClick={() => !isLoading && !isTesting && onOpenChange(false)}
            disabled={isLoading || isTesting}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Provider */}
          <div>
            <label className={cn('block text-sm font-medium mb-2', styles.textPrimary)}>
              {t('ai.cloudApi.provider')}
            </label>
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value as CloudApiProvider)}
              className={cn(
                'w-full px-3 py-2 rounded border text-sm',
                styles.inputBg,
                styles.borderColor,
                styles.textPrimary,
                'focus:outline-none focus:ring-2 focus:ring-blue-500'
              )}
            >
              {PROVIDER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.icon} {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Name */}
          <div>
            <label className={cn('block text-sm font-medium mb-2', styles.textPrimary)}>
              {t('common.name')}
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={`${provider} API`}
              className={cn(
                'w-full px-3 py-2 rounded border text-sm',
                styles.inputBg,
                styles.borderColor,
                styles.textPrimary,
                'focus:outline-none focus:ring-2 focus:ring-blue-500'
              )}
            />
          </div>

          {/* API Key */}
          <div>
            <label className={cn('block text-sm font-medium mb-2', styles.textPrimary)}>
              {t('ai.cloudApi.apiKey')}
            </label>
            <div className="relative">
              <input
                type={showApiKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-..."
                className={cn(
                  'w-full px-3 py-2 pr-10 rounded border text-sm',
                  styles.inputBg,
                  styles.borderColor,
                  styles.textPrimary,
                  'focus:outline-none focus:ring-2 focus:ring-blue-500'
                )}
              />
              <button
                type="button"
                className={cn('absolute right-2 top-1/2 -translate-y-1/2', styles.textSecondary)}
                onClick={() => setShowApiKey(!showApiKey)}
              >
                {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Base URL */}
          <div>
            <label className={cn('block text-sm font-medium mb-2', styles.textPrimary)}>
              {t('ai.cloudApi.baseUrl')}
            </label>
            <input
              type="text"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder={DEFAULT_BASE_URLS[provider]}
              className={cn(
                'w-full px-3 py-2 rounded border text-sm',
                styles.inputBg,
                styles.borderColor,
                styles.textPrimary,
                'focus:outline-none focus:ring-2 focus:ring-blue-500'
              )}
            />
          </div>

          {/* Organization (OpenAI only) */}
          {provider === 'openai' && (
            <div>
              <label className={cn('block text-sm font-medium mb-2', styles.textPrimary)}>
                {t('ai.cloudApi.organization')}
              </label>
              <input
                type="text"
                value={organization}
                onChange={(e) => setOrganization(e.target.value)}
                placeholder="org-..."
                className={cn(
                  'w-full px-3 py-2 rounded border text-sm',
                  styles.inputBg,
                  styles.borderColor,
                  styles.textPrimary,
                  'focus:outline-none focus:ring-2 focus:ring-blue-500'
                )}
              />
            </div>
          )}

          {/* Default Model */}
          <div>
            <label className={cn('block text-sm font-medium mb-2', styles.textPrimary)}>
              {t('ai.cloudApi.defaultModel')}
            </label>
            <input
              type="text"
              value={defaultModel}
              onChange={(e) => setDefaultModel(e.target.value)}
              placeholder={
                provider === 'openai'
                  ? 'gpt-4o'
                  : provider === 'claude'
                    ? 'claude-3-5-sonnet-20241022'
                    : provider === 'qwen'
                      ? 'qwen-max'
                      : ''
              }
              className={cn(
                'w-full px-3 py-2 rounded border text-sm',
                styles.inputBg,
                styles.borderColor,
                styles.textPrimary,
                'focus:outline-none focus:ring-2 focus:ring-blue-500'
              )}
            />
          </div>

          {/* Enabled */}
          <div className="flex items-center gap-3">
            <label className={cn('text-sm font-medium', styles.textPrimary)}>
              {t('common.enabled')}
            </label>
            <button
              type="button"
              role="switch"
              aria-checked={enabled}
              onClick={() => setEnabled(!enabled)}
              className={cn(
                'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
                enabled ? 'bg-blue-600' : 'bg-gray-600'
              )}
            >
              <span
                className={cn(
                  'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
                  enabled ? 'translate-x-6' : 'translate-x-1'
                )}
              />
            </button>
          </div>

          {/* Test Result */}
          {testResult && (
            <div
              className={cn(
                'flex items-center gap-2 p-3 rounded-lg text-sm',
                testResult.success ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'
              )}
            >
              {testResult.success ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
              <span>{testResult.message}</span>
              {testResult.latencyMs && (
                <span className="ml-auto opacity-60">{testResult.latencyMs}ms</span>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={cn('flex items-center justify-end gap-2 px-4 py-3 border-t', styles.borderColor)}>
          <button
            className={cn(
              'px-4 py-2 text-sm rounded transition-colors border',
              styles.borderColor,
              styles.hoverBg,
              styles.textSecondary
            )}
            onClick={handleTest}
            disabled={isTesting || !apiKey}
          >
            {isTesting ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                {t('ai.cloudApi.testing')}
              </span>
            ) : (
              t('ai.cloudApi.testConnection')
            )}
          </button>
          <button
            className={cn(
              'px-4 py-2 text-sm rounded transition-colors',
              'bg-blue-600 hover:bg-blue-700 text-white',
              (!isValid || isLoading) && 'opacity-50 cursor-not-allowed'
            )}
            onClick={handleSave}
            disabled={!isValid || isLoading}
          >
            {isLoading ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                {t('common.saving')}
              </span>
            ) : (
              t('common.save')
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
