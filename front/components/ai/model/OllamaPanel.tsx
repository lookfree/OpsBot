/**
 * Ollama Panel Component
 *
 * Manages Ollama service connection and model operations.
 * Supports both local and remote modes.
 */

import { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { useAiStore } from '@/stores'
import {
  Brain,
  RefreshCw,
  Plus,
  Link,
  Unlink,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Play,
  Square,
  RotateCcw,
  Monitor,
  Server,
  Cloud,
} from 'lucide-react'
import { useAiStyles } from '../hooks'
import { OllamaModelList } from './OllamaModelList'
import { AddModelDialog } from './AddModelDialog'
import { OllamaConnectDialog } from './OllamaConnectDialog'
import { RemoteConnectionSelector } from '../RemoteConnectionSelector'
import type { RemoteAiEnvironment } from '@/types/ai'

export function OllamaPanel() {
  const { t } = useTranslation()
  const styles = useAiStyles()

  const {
    ollamaConnectionId,
    ollamaStatus,
    ollamaModels,
    isConnecting,
    isLoadingModels,
    isPullingModel,
    pullingModelName,
    isControllingService,
    error,
    connectOllama,
    disconnectOllama,
    fetchOllamaModels,
    pullOllamaModel,
    deleteOllamaModel,
    startOllamaService,
    stopOllamaService,
    restartOllamaService,
    clearError,
    // Remote mode
    isRemoteMode,
    remoteSshConnectionId,
    remoteEnvironment,
    remoteModels,
    isRemoteSyncing,
    remoteError,
    setRemoteMode,
    setRemoteSshConnection,
    setRemoteEnvironment,
    syncRemoteModels,
    clearRemoteError,
  } = useAiStore()

  const [showConnectDialog, setShowConnectDialog] = useState(false)
  const [showAddModelDialog, setShowAddModelDialog] = useState(false)

  const isConnected = !!ollamaConnectionId && !!ollamaStatus

  // Handle remote connection change
  const handleRemoteConnectionChange = useCallback(
    (connectionId: string | undefined) => {
      setRemoteSshConnection(connectionId ?? null)
    },
    [setRemoteSshConnection]
  )

  // Handle remote environment detected
  const handleRemoteEnvironmentDetected = useCallback(
    (env: RemoteAiEnvironment | null) => {
      // Publish to the store so the panel's render gates (which read
      // remoteEnvironment from the store) actually show the remote model list.
      setRemoteEnvironment(env)
      // If environment is detected and has Ollama, sync models
      if (env?.ollamaInstalled && remoteSshConnectionId) {
        syncRemoteModels()
      }
    },
    [setRemoteEnvironment, remoteSshConnectionId, syncRemoteModels]
  )

  const handleConnect = useCallback(
    async (host: string, port: number) => {
      try {
        await connectOllama(host, port)
        setShowConnectDialog(false)
      } catch {
        // Error handled in store
      }
    },
    [connectOllama]
  )

  const handleDisconnect = useCallback(async () => {
    try {
      await disconnectOllama()
    } catch {
      // Error handled in store
    }
  }, [disconnectOllama])

  const handlePullModel = useCallback(
    async (modelName: string) => {
      try {
        await pullOllamaModel(modelName)
        setShowAddModelDialog(false)
      } catch {
        // Error handled in store
      }
    },
    [pullOllamaModel]
  )

  const handleStartService = useCallback(async () => {
    try {
      await startOllamaService()
    } catch {
      // Error handled in store
    }
  }, [startOllamaService])

  const handleStopService = useCallback(async () => {
    try {
      await stopOllamaService()
    } catch {
      // Error handled in store
    }
  }, [stopOllamaService])

  const handleRestartService = useCallback(async () => {
    try {
      await restartOllamaService()
    } catch {
      // Error handled in store
    }
  }, [restartOllamaService])

  return (
    <div className="flex flex-col h-full p-4 gap-4">
      {/* Mode Toggle */}
      <div className={cn('flex items-center gap-2 p-2 rounded-lg border', styles.bgSecondary, styles.borderColor)}>
        <span className={cn('text-sm mr-2', styles.textSecondary)}>
          {t('ai.remote.mode', 'Mode')}:
        </span>
        <button
          onClick={() => setRemoteMode(false)}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 text-sm rounded transition-colors',
            !isRemoteMode
              ? 'bg-blue-600 text-white'
              : cn(styles.hoverBg, styles.textSecondary)
          )}
        >
          <Monitor className="w-4 h-4" />
          {t('ai.remote.local', 'Local')}
        </button>
        <button
          onClick={() => setRemoteMode(true)}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 text-sm rounded transition-colors',
            isRemoteMode
              ? 'bg-blue-600 text-white'
              : cn(styles.hoverBg, styles.textSecondary)
          )}
        >
          <Cloud className="w-4 h-4" />
          {t('ai.remote.remote', 'Remote')}
        </button>
      </div>

      {/* Local Mode: Connection Status Bar */}
      {!isRemoteMode && (
        <div className={cn('flex items-center justify-between p-3 rounded-lg border', styles.bgSecondary, styles.borderColor)}>
          <div className="flex items-center gap-3">
            <Brain className={cn('w-5 h-5', styles.textPrimary)} />
            <div className="flex items-center gap-2">
              <span className={cn('font-medium', styles.textPrimary)}>Ollama</span>
              {isConnected ? (
                <>
                  <CheckCircle2 className={cn('w-4 h-4', styles.successText)} />
                  <span className={cn('text-sm', styles.textSecondary)}>
                    {t('ai.status.connected')} - v{ollamaStatus?.version}
                  </span>
                  <span className={cn('text-xs', styles.textSecondary)}>
                    ({ollamaStatus?.host}:{ollamaStatus?.port})
                  </span>
                </>
              ) : (
                <>
                  <AlertCircle className={cn('w-4 h-4', styles.textSecondary)} />
                  <span className={cn('text-sm', styles.textSecondary)}>{t('ai.status.disconnected')}</span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Service Control Buttons */}
            <div className="flex items-center gap-1 mr-2 pr-2 border-r border-gray-600">
              <button
                className={cn('flex items-center gap-1 px-2 py-1.5 text-sm rounded transition-colors', styles.hoverBg, styles.successText)}
                onClick={handleStartService}
                disabled={isControllingService}
                title={t('ai.service.start')}
              >
                {isControllingService ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              </button>
              <button
                className={cn('flex items-center gap-1 px-2 py-1.5 text-sm rounded transition-colors', styles.hoverBg, styles.errorText)}
                onClick={handleStopService}
                disabled={isControllingService}
                title={t('ai.service.stop')}
              >
                <Square className="w-4 h-4" />
              </button>
              <button
                className={cn('flex items-center gap-1 px-2 py-1.5 text-sm rounded transition-colors', styles.hoverBg, styles.textSecondary)}
                onClick={handleRestartService}
                disabled={isControllingService}
                title={t('ai.service.restart')}
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>

            {/* Connection Controls */}
            {isConnected ? (
              <>
                <button
                  className={cn('flex items-center gap-1 px-3 py-1.5 text-sm rounded transition-colors', styles.hoverBg, styles.textSecondary)}
                  onClick={fetchOllamaModels}
                  disabled={isLoadingModels}
                >
                  <RefreshCw className={cn('w-4 h-4', isLoadingModels && 'animate-spin')} />
                  {t('common.refresh')}
                </button>
                <button
                  className={cn('flex items-center gap-1 px-3 py-1.5 text-sm rounded transition-colors', styles.hoverBg, styles.errorText)}
                  onClick={handleDisconnect}
                >
                  <Unlink className="w-4 h-4" />
                  {t('ai.disconnect')}
                </button>
              </>
            ) : (
              <button
                className="flex items-center gap-1 px-3 py-1.5 text-sm rounded transition-colors bg-blue-600 hover:bg-blue-700 text-white"
                onClick={() => setShowConnectDialog(true)}
                disabled={isConnecting}
              >
                {isConnecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link className="w-4 h-4" />}
                {t('ai.connect')}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Remote Mode: SSH Connection Selector */}
      {isRemoteMode && (
        <RemoteConnectionSelector
          value={remoteSshConnectionId ?? undefined}
          onChange={handleRemoteConnectionChange}
          onEnvironmentDetected={handleRemoteEnvironmentDetected}
        />
      )}

      {/* Error Message (Local Mode) */}
      {!isRemoteMode && error && (
        <div className={cn('flex items-center gap-2 p-3 rounded-lg border border-red-500/50 bg-red-500/10', styles.errorText)}>
          <AlertCircle className="w-4 h-4" />
          <span className="text-sm">{error}</span>
          <button className="ml-auto text-sm underline" onClick={clearError}>
            {t('common.dismiss')}
          </button>
        </div>
      )}

      {/* Error Message (Remote Mode) */}
      {isRemoteMode && remoteError && (
        <div className={cn('flex items-center gap-2 p-3 rounded-lg border border-red-500/50 bg-red-500/10', styles.errorText)}>
          <AlertCircle className="w-4 h-4" />
          <span className="text-sm">{remoteError}</span>
          <button className="ml-auto text-sm underline" onClick={clearRemoteError}>
            {t('common.dismiss')}
          </button>
        </div>
      )}

      {/* Model Operations Toolbar (Local Mode) */}
      {!isRemoteMode && isConnected && (
        <div className="flex items-center gap-2">
          <button
            className="flex items-center gap-1 px-3 py-1.5 text-sm rounded transition-colors bg-green-600 hover:bg-green-700 text-white"
            onClick={() => setShowAddModelDialog(true)}
            disabled={isPullingModel}
          >
            <Plus className="w-4 h-4" />
            {t('ai.model.addModel')}
          </button>
        </div>
      )}

      {/* Model Operations Toolbar (Remote Mode) */}
      {isRemoteMode && remoteSshConnectionId && remoteEnvironment?.ollamaInstalled && (
        <div className="flex items-center gap-2">
          <button
            className={cn(
              'flex items-center gap-1 px-3 py-1.5 text-sm rounded transition-colors',
              styles.hoverBg,
              styles.textSecondary
            )}
            onClick={syncRemoteModels}
            disabled={isRemoteSyncing}
          >
            <RefreshCw className={cn('w-4 h-4', isRemoteSyncing && 'animate-spin')} />
            {t('ai.remote.syncModels', 'Sync Models')}
          </button>
        </div>
      )}

      {/* Model List (Local Mode) */}
      {!isRemoteMode && isConnected && (
        <OllamaModelList
          models={ollamaModels}
          isLoading={isLoadingModels}
          isPulling={isPullingModel}
          pullingModelName={pullingModelName}
          onDelete={deleteOllamaModel}
        />
      )}

      {/* Model List (Remote Mode) */}
      {isRemoteMode && remoteSshConnectionId && remoteEnvironment?.ollamaInstalled && (
        <OllamaModelList
          models={remoteModels}
          isLoading={isRemoteSyncing}
          isPulling={false}
          pullingModelName={null}
          onDelete={async (_modelName) => {}}
          isRemote
        />
      )}

      {/* Not Connected Placeholder (Local Mode) */}
      {!isRemoteMode && !isConnected && !isConnecting && (
        <div className={cn('flex-1 flex flex-col items-center justify-center gap-4', styles.textSecondary)}>
          <Brain className="w-16 h-16 opacity-50" />
          <p>{t('ai.ollama.notConnected')}</p>
          <button
            className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
            onClick={() => setShowConnectDialog(true)}
          >
            {t('ai.connect')}
          </button>
        </div>
      )}

      {/* Remote Mode Placeholder - No Connection Selected */}
      {isRemoteMode && !remoteSshConnectionId && (
        <div className={cn('flex-1 flex flex-col items-center justify-center gap-4', styles.textSecondary)}>
          <Server className="w-16 h-16 opacity-50" />
          <p>{t('ai.remote.selectConnectionHint', 'Select an SSH connection to manage remote AI')}</p>
        </div>
      )}

      {/* Remote Mode Placeholder - No Ollama */}
      {isRemoteMode && remoteSshConnectionId && remoteEnvironment && !remoteEnvironment.ollamaInstalled && (
        <div className={cn('flex-1 flex flex-col items-center justify-center gap-4', styles.textSecondary)}>
          <AlertCircle className="w-16 h-16 opacity-50" />
          <p>{t('ai.remote.noOllama', 'Ollama is not installed on the remote server')}</p>
        </div>
      )}

      {/* Dialogs */}
      <OllamaConnectDialog open={showConnectDialog} onOpenChange={setShowConnectDialog} onConnect={handleConnect} isConnecting={isConnecting} />
      <AddModelDialog open={showAddModelDialog} onOpenChange={setShowAddModelDialog} onPull={handlePullModel} isPulling={isPullingModel} />
    </div>
  )
}
