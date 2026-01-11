/**
 * TensorRT LLM Panel Component
 *
 * Manages TensorRT-LLM service connection and model operations.
 */

import { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { useAiStore } from '@/stores'
import {
  Cpu,
  RefreshCw,
  Plus,
  Link,
  Unlink,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Play,
  Square,
  FileText,
  ExternalLink,
} from 'lucide-react'
import { useAiStyles } from '../hooks'
import { TensorRTConnectDialog } from './TensorRTConnectDialog'
import { TensorRTDeployDialog } from './TensorRTDeployDialog'
import type { TensorRTModel } from '@/types/ai'

export function TensorRTPanel() {
  const { t } = useTranslation()
  const styles = useAiStyles()

  const {
    tensorrtConnectionId,
    tensorrtStatus,
    tensorrtModels,
    isTensorrtConnecting,
    isTensorrtLoadingModels,
    tensorrtError,
    connectTensorrt,
    disconnectTensorrt,
    fetchTensorrtModels,
    startTensorrtModel,
    stopTensorrtModel,
    clearTensorrtError,
  } = useAiStore()

  const [showConnectDialog, setShowConnectDialog] = useState(false)
  const [showDeployDialog, setShowDeployDialog] = useState(false)

  const isConnected = !!tensorrtConnectionId && !!tensorrtStatus

  const handleConnect = useCallback(
    async (host: string, port?: number) => {
      try {
        await connectTensorrt(host, port)
        setShowConnectDialog(false)
      } catch {
        // Error handled in store
      }
    },
    [connectTensorrt]
  )

  const handleDisconnect = useCallback(async () => {
    try {
      await disconnectTensorrt()
    } catch {
      // Error handled in store
    }
  }, [disconnectTensorrt])

  const handleRefresh = useCallback(async () => {
    if (tensorrtConnectionId) {
      try {
        await fetchTensorrtModels(tensorrtConnectionId)
      } catch {
        // Error handled in store
      }
    }
  }, [tensorrtConnectionId, fetchTensorrtModels])

  const handleStartModel = useCallback(
    async (modelId: string) => {
      if (tensorrtConnectionId) {
        try {
          await startTensorrtModel(tensorrtConnectionId, modelId)
        } catch {
          // Error handled in store
        }
      }
    },
    [tensorrtConnectionId, startTensorrtModel]
  )

  const handleStopModel = useCallback(
    async (modelId: string) => {
      if (tensorrtConnectionId) {
        try {
          await stopTensorrtModel(tensorrtConnectionId, modelId)
        } catch {
          // Error handled in store
        }
      }
    },
    [tensorrtConnectionId, stopTensorrtModel]
  )

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running':
        return 'text-green-500'
      case 'error':
        return 'text-red-500'
      default:
        return 'text-gray-500'
    }
  }

  return (
    <div className="flex flex-col h-full p-4 gap-4">
      {/* Connection Status Bar */}
      <div className={cn('flex items-center justify-between p-3 rounded-lg border', styles.bgSecondary, styles.borderColor)}>
        <div className="flex items-center gap-3">
          <Cpu className="w-5 h-5 text-orange-500" />
          <div className="flex items-center gap-2">
            <span className={cn('font-medium', styles.textPrimary)}>TensorRT LLM</span>
            {isConnected ? (
              <>
                <CheckCircle2 className={cn('w-4 h-4', styles.successText)} />
                <span className={cn('text-sm', styles.textSecondary)}>
                  {t('ai.common.connected')}
                </span>
                {tensorrtStatus?.version && (
                  <span className={cn('text-xs', styles.textSecondary)}>
                    v{tensorrtStatus.version}
                  </span>
                )}
                {tensorrtStatus?.cudaVersion && (
                  <span className={cn('text-xs', styles.textSecondary)}>
                    CUDA {tensorrtStatus.cudaVersion}
                  </span>
                )}
              </>
            ) : (
              <>
                <AlertCircle className={cn('w-4 h-4', styles.textSecondary)} />
                <span className={cn('text-sm', styles.textSecondary)}>
                  {t('ai.common.disconnected')}
                </span>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isConnected ? (
            <>
              <button
                className={cn('flex items-center gap-1 px-3 py-1.5 text-sm rounded transition-colors', styles.hoverBg, styles.textSecondary)}
                onClick={handleRefresh}
                disabled={isTensorrtLoadingModels}
                title={t('common.refresh')}
              >
                <RefreshCw className={cn('w-4 h-4', isTensorrtLoadingModels && 'animate-spin')} />
              </button>
              <button
                className="flex items-center gap-1 px-3 py-1.5 text-sm rounded transition-colors bg-green-600 hover:bg-green-700 text-white"
                onClick={() => setShowDeployDialog(true)}
              >
                <Plus className="w-4 h-4" />
                {t('ai.tensorrt.deployModel')}
              </button>
              <button
                className={cn('flex items-center gap-1 px-3 py-1.5 text-sm rounded transition-colors', styles.hoverBg, styles.errorText)}
                onClick={handleDisconnect}
              >
                <Unlink className="w-4 h-4" />
                {t('ai.common.disconnect')}
              </button>
            </>
          ) : (
            <button
              className="flex items-center gap-1 px-3 py-1.5 text-sm rounded transition-colors bg-blue-600 hover:bg-blue-700 text-white"
              onClick={() => setShowConnectDialog(true)}
              disabled={isTensorrtConnecting}
            >
              {isTensorrtConnecting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Link className="w-4 h-4" />
              )}
              {t('ai.common.connect')}
            </button>
          )}
        </div>
      </div>

      {/* Error Message */}
      {tensorrtError && (
        <div className={cn('flex items-center gap-2 p-3 rounded-lg border border-red-500/50 bg-red-500/10', styles.errorText)}>
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span className="flex-1 text-sm">{tensorrtError}</span>
          <button
            onClick={clearTensorrtError}
            className="text-sm underline"
          >
            {t('common.dismiss')}
          </button>
        </div>
      )}

      {/* Not installed notice */}
      {isConnected && tensorrtStatus && !tensorrtStatus.installed && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{t('ai.tensorrt.notInstalled')}</span>
          <a
            href="https://github.com/NVIDIA/TensorRT-LLM"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-yellow-300 hover:text-yellow-100 underline ml-auto"
          >
            <span>{t('ai.tensorrt.installGuide')}</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      )}

      {/* Model list */}
      {isConnected && tensorrtStatus?.installed && (
        <div className="flex-1 overflow-auto">
          {isTensorrtLoadingModels ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className={cn('w-6 h-6 animate-spin', styles.textSecondary)} />
            </div>
          ) : tensorrtModels.length === 0 ? (
            <div className={cn('flex flex-col items-center justify-center py-8', styles.textSecondary)}>
              <Cpu className="w-12 h-12 mb-2 opacity-50" />
              <p>{t('ai.tensorrt.noModels')}</p>
              <p className="text-sm mt-1">{t('ai.tensorrt.deployHint')}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {tensorrtModels.map((model: TensorRTModel) => (
                <div
                  key={model.id}
                  className={cn('flex items-center justify-between p-3 rounded-lg border', styles.bgSecondary, styles.borderColor)}
                >
                  <div className="flex items-center gap-3">
                    <Cpu className="w-5 h-5 text-orange-500" />
                    <div>
                      <div className={cn('font-medium', styles.textPrimary)}>{model.name}</div>
                      <div className={cn('text-xs', styles.textSecondary)}>
                        {t('ai.tensorrt.version')}: {model.version} | {t('ai.tensorrt.port')}: {model.port}
                        {model.gpuMemoryUsage && ` | ${t('ai.tensorrt.gpuMemory')}: ${model.gpuMemoryUsage} MB`}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className={cn('text-xs', getStatusColor(model.status))}>
                      {model.status === 'running' && (
                        <span className="flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          {t('ai.tensorrt.running')}
                        </span>
                      )}
                      {model.status === 'idle' && t('ai.tensorrt.stopped')}
                      {model.status === 'error' && (
                        <span className="flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" />
                          {t('ai.tensorrt.error')}
                        </span>
                      )}
                    </span>

                    {model.status === 'running' ? (
                      <button
                        onClick={() => handleStopModel(model.id)}
                        className={cn('flex items-center gap-1 px-2 py-1 text-sm rounded transition-colors', styles.hoverBg, styles.textSecondary)}
                        title={t('ai.tensorrt.stop')}
                      >
                        <Square className="w-3 h-3" />
                      </button>
                    ) : (
                      <button
                        onClick={() => handleStartModel(model.id)}
                        className={cn('flex items-center gap-1 px-2 py-1 text-sm rounded transition-colors', styles.hoverBg, styles.textSecondary)}
                        title={t('ai.tensorrt.start')}
                      >
                        <Play className="w-3 h-3" />
                      </button>
                    )}

                    <button
                      className={cn('flex items-center gap-1 px-2 py-1 text-sm rounded transition-colors', styles.hoverBg, styles.textSecondary)}
                      title={t('ai.tensorrt.logs')}
                    >
                      <FileText className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Not connected state */}
      {!isConnected && (
        <div className={cn('flex-1 flex flex-col items-center justify-center gap-4', styles.textSecondary)}>
          <Cpu className="w-16 h-16 opacity-50" />
          <p className="text-lg">{t('ai.tensorrt.notConnected')}</p>
          <p className="text-sm">{t('ai.tensorrt.connectHint')}</p>
          <button
            className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
            onClick={() => setShowConnectDialog(true)}
          >
            {t('ai.common.connect')}
          </button>
        </div>
      )}

      {/* Dialogs */}
      <TensorRTConnectDialog
        open={showConnectDialog}
        onOpenChange={setShowConnectDialog}
        onConnect={handleConnect}
        isConnecting={isTensorrtConnecting}
      />

      <TensorRTDeployDialog
        open={showDeployDialog}
        onOpenChange={setShowDeployDialog}
      />
    </div>
  )
}
