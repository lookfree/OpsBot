/**
 * Cloud API Panel Component
 *
 * Manages cloud LLM API configurations (OpenAI, Claude, Qwen).
 */

import { useState, useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { useAiStore } from '@/stores'
import {
  Cloud,
  Plus,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Trash2,
  Settings,
  PlayCircle,
  XCircle,
} from 'lucide-react'
import { useAiStyles } from '../hooks'
import { ApiConfigDialog } from './ApiConfigDialog'
import type { CloudApiConfig, CloudApiProvider, CloudApiModel } from '@/types'

/** Provider display info */
const PROVIDER_INFO: Record<CloudApiProvider, { name: string; icon: string; color: string }> = {
  openai: { name: 'OpenAI', icon: '🤖', color: 'bg-green-600' },
  claude: { name: 'Claude', icon: '🧠', color: 'bg-orange-600' },
  qwen: { name: '通义千问', icon: '🌐', color: 'bg-blue-600' },
  custom: { name: 'Custom', icon: '⚙️', color: 'bg-gray-600' },
}

export function CloudApiPanel() {
  const { t } = useTranslation()
  const styles = useAiStyles()

  const {
    cloudApiConfigs,
    cloudApiModels,
    cloudApiError,
    isLoadingCloudApi,
    testCloudApiConnection,
    fetchCloudApiDefaultModels,
    addCloudApiConfig,
    updateCloudApiConfig,
    deleteCloudApiConfig,
    clearError,
  } = useAiStore()

  const [showConfigDialog, setShowConfigDialog] = useState(false)
  const [editingConfig, setEditingConfig] = useState<CloudApiConfig | null>(null)
  const [testingConfigId, setTestingConfigId] = useState<string | null>(null)
  const [testResults, setTestResults] = useState<Record<string, { success: boolean; message: string }>>({})

  // Load default models on mount
  useEffect(() => {
    // Load default models for each provider
    const providers: CloudApiProvider[] = ['openai', 'claude', 'qwen']
    providers.forEach((provider) => {
      fetchCloudApiDefaultModels(provider)
    })
  }, [fetchCloudApiDefaultModels])

  const handleAddConfig = useCallback(() => {
    setEditingConfig(null)
    setShowConfigDialog(true)
  }, [])

  const handleEditConfig = useCallback((config: CloudApiConfig) => {
    setEditingConfig(config)
    setShowConfigDialog(true)
  }, [])

  const handleSaveConfig = useCallback(
    async (config: Omit<CloudApiConfig, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => {
      try {
        if (config.id) {
          await updateCloudApiConfig(config.id, config)
        } else {
          await addCloudApiConfig(config)
        }
        setShowConfigDialog(false)
        setEditingConfig(null)
      } catch {
        // Error handled in store
      }
    },
    [addCloudApiConfig, updateCloudApiConfig]
  )

  const handleDeleteConfig = useCallback(
    async (id: string) => {
      try {
        await deleteCloudApiConfig(id)
        // Remove test result for deleted config
        setTestResults((prev) => {
          const next = { ...prev }
          delete next[id]
          return next
        })
      } catch {
        // Error handled in store
      }
    },
    [deleteCloudApiConfig]
  )

  const handleTestConnection = useCallback(
    async (config: CloudApiConfig) => {
      if (!config.apiKey) {
        setTestResults((prev) => ({
          ...prev,
          [config.id]: { success: false, message: t('ai.cloudApi.apiKeyRequired') },
        }))
        return
      }

      setTestingConfigId(config.id)
      try {
        const result = await testCloudApiConnection(
          config.provider,
          config.apiKey,
          config.baseUrl,
          config.organization
        )
        setTestResults((prev) => ({
          ...prev,
          [config.id]: { success: result.success, message: result.message },
        }))
      } catch (error) {
        setTestResults((prev) => ({
          ...prev,
          [config.id]: { success: false, message: String(error) },
        }))
      } finally {
        setTestingConfigId(null)
      }
    },
    [testCloudApiConnection, t]
  )

  const getModelsForProvider = (provider: CloudApiProvider): CloudApiModel[] => {
    return cloudApiModels.filter((m) => m.provider === provider)
  }

  return (
    <div className="flex flex-col h-full p-4 gap-4">
      {/* Header */}
      <div className={cn('flex items-center justify-between p-3 rounded-lg border', styles.bgSecondary, styles.borderColor)}>
        <div className="flex items-center gap-3">
          <Cloud className={cn('w-5 h-5', styles.textPrimary)} />
          <span className={cn('font-medium', styles.textPrimary)}>{t('ai.model.cloudApi')}</span>
          <span className={cn('text-sm', styles.textSecondary)}>
            ({cloudApiConfigs.length} {t('ai.cloudApi.configured')})
          </span>
        </div>

        <button
          className="flex items-center gap-1 px-3 py-1.5 text-sm rounded transition-colors bg-blue-600 hover:bg-blue-700 text-white"
          onClick={handleAddConfig}
        >
          <Plus className="w-4 h-4" />
          {t('ai.cloudApi.addProvider')}
        </button>
      </div>

      {/* Error Message */}
      {cloudApiError && (
        <div className={cn('flex items-center gap-2 p-3 rounded-lg border border-red-500/50 bg-red-500/10', styles.errorText)}>
          <AlertCircle className="w-4 h-4" />
          <span className="text-sm">{cloudApiError}</span>
          <button className="ml-auto text-sm underline" onClick={clearError}>
            {t('common.dismiss')}
          </button>
        </div>
      )}

      {/* API Configurations List */}
      {cloudApiConfigs.length > 0 ? (
        <div className="flex-1 overflow-auto">
          <div className="grid gap-4">
            {cloudApiConfigs.map((config) => {
              const providerInfo = PROVIDER_INFO[config.provider]
              const testResult = testResults[config.id]
              const isTesting = testingConfigId === config.id
              const models = getModelsForProvider(config.provider)

              return (
                <div
                  key={config.id}
                  className={cn('p-4 rounded-lg border', styles.bgSecondary, styles.borderColor, !config.enabled && 'opacity-60')}
                >
                  {/* Config Header */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <span className="text-xl">{providerInfo.icon}</span>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className={cn('font-medium', styles.textPrimary)}>{config.name}</span>
                          <span className={cn('text-xs px-2 py-0.5 rounded', providerInfo.color, 'text-white')}>
                            {providerInfo.name}
                          </span>
                          {!config.enabled && (
                            <span className="text-xs px-2 py-0.5 rounded bg-gray-600 text-gray-300">
                              {t('common.disabled')}
                            </span>
                          )}
                        </div>
                        {config.baseUrl && (
                          <span className={cn('text-xs', styles.textSecondary)}>{config.baseUrl}</span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {/* Test Result */}
                      {testResult && !isTesting && (
                        <div className={cn('flex items-center gap-1 text-sm', testResult.success ? styles.successText : styles.errorText)}>
                          {testResult.success ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                          <span className="max-w-[200px] truncate">{testResult.message}</span>
                        </div>
                      )}

                      {/* Action Buttons */}
                      <button
                        className={cn('p-2 rounded transition-colors', styles.hoverBg, styles.textSecondary)}
                        onClick={() => handleTestConnection(config)}
                        disabled={isTesting || !config.apiKey}
                        title={t('ai.cloudApi.testConnection')}
                      >
                        {isTesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlayCircle className="w-4 h-4" />}
                      </button>
                      <button
                        className={cn('p-2 rounded transition-colors', styles.hoverBg, styles.textSecondary)}
                        onClick={() => handleEditConfig(config)}
                        title={t('common.edit')}
                      >
                        <Settings className="w-4 h-4" />
                      </button>
                      <button
                        className={cn('p-2 rounded transition-colors', styles.hoverBg, styles.errorText)}
                        onClick={() => handleDeleteConfig(config.id)}
                        title={t('common.delete')}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Models List */}
                  {models.length > 0 && (
                    <div className={cn('pt-3 border-t', styles.borderColor)}>
                      <div className={cn('text-xs mb-2', styles.textSecondary)}>{t('ai.cloudApi.availableModels')}</div>
                      <div className="flex flex-wrap gap-2">
                        {models.slice(0, 6).map((model) => (
                          <div
                            key={model.id}
                            className={cn('text-xs px-2 py-1 rounded', styles.bgPrimary, styles.textSecondary)}
                            title={model.description || model.id}
                          >
                            {model.name}
                            {model.contextLength && (
                              <span className="ml-1 opacity-60">({Math.round(model.contextLength / 1000)}K)</span>
                            )}
                          </div>
                        ))}
                        {models.length > 6 && (
                          <span className={cn('text-xs px-2 py-1', styles.textSecondary)}>
                            +{models.length - 6} more
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Default Model */}
                  {config.defaultModel && (
                    <div className={cn('mt-2 text-xs', styles.textSecondary)}>
                      {t('ai.cloudApi.defaultModel')}: <span className={styles.textPrimary}>{config.defaultModel}</span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        /* Empty State */
        <div className={cn('flex-1 flex flex-col items-center justify-center gap-4', styles.textSecondary)}>
          <Cloud className="w-16 h-16 opacity-50" />
          <p>{t('ai.cloudApi.noConfigs')}</p>
          <button
            className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
            onClick={handleAddConfig}
          >
            {t('ai.cloudApi.addProvider')}
          </button>
        </div>
      )}

      {/* Config Dialog */}
      <ApiConfigDialog
        open={showConfigDialog}
        onOpenChange={setShowConfigDialog}
        config={editingConfig}
        onSave={handleSaveConfig}
        isLoading={isLoadingCloudApi}
      />
    </div>
  )
}
