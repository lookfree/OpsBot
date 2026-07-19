/**
 * API Config Dialog data hook
 *
 * Holds all state, effects, derived values and handlers for the API config
 * dialog. Extracted verbatim from ApiConfigDialog so the component function
 * stays small while behavior is preserved exactly.
 */

import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useAiStore } from '@/stores'
import { useAiStyles } from '../hooks'
import type { CloudApiConfig, CloudApiProvider, CloudApiTestResult } from '@/types'

export interface ApiConfigDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  config: CloudApiConfig | null
  onSave: (config: Omit<CloudApiConfig, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => Promise<void>
  isLoading: boolean
}

/** Default base URLs for providers */
export const DEFAULT_BASE_URLS: Record<CloudApiProvider, string> = {
  openai: 'https://api.openai.com/v1',
  claude: 'https://api.anthropic.com',
  qwen: 'https://dashscope.aliyuncs.com/api/v1',
  custom: '',
}

/** Provider options */
export const PROVIDER_OPTIONS: { value: CloudApiProvider; label: string; icon: string }[] = [
  { value: 'openai', label: 'OpenAI', icon: '🤖' },
  { value: 'claude', label: 'Claude (Anthropic)', icon: '🧠' },
  { value: 'qwen', label: '通义千问 (Qwen)', icon: '🌐' },
  { value: 'custom', label: 'Custom', icon: '⚙️' },
]

export function useApiConfigDialog({ open, onOpenChange, config, onSave, isLoading }: ApiConfigDialogProps) {
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

  return {
    t,
    styles,
    // props passed through to the JSX
    open,
    onOpenChange,
    config,
    isLoading,
    // form state
    name,
    setName,
    provider,
    setProvider,
    apiKey,
    setApiKey,
    baseUrl,
    setBaseUrl,
    organization,
    setOrganization,
    defaultModel,
    setDefaultModel,
    enabled,
    setEnabled,
    showApiKey,
    setShowApiKey,
    // test state
    isTesting,
    testResult,
    // handlers
    handleTest,
    handleSave,
    // derived
    isValid,
  }
}

export type ApiConfigDialogState = ReturnType<typeof useApiConfigDialog>
