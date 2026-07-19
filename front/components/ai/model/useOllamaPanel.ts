/**
 * Ollama Panel data hook
 *
 * Holds all state, derived values and handlers for the Ollama panel.
 * Extracted verbatim from OllamaPanel so the component function stays
 * small while behavior is preserved exactly.
 */

import { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useAiStore } from '@/stores'
import { useAiStyles } from '../hooks'
import type { RemoteAiEnvironment } from '@/types/ai'

export function useOllamaPanel() {
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

  return {
    t,
    styles,
    // store state consumed by the JSX
    ollamaStatus,
    ollamaModels,
    isConnecting,
    isLoadingModels,
    isPullingModel,
    pullingModelName,
    isControllingService,
    error,
    fetchOllamaModels,
    deleteOllamaModel,
    clearError,
    // remote mode
    isRemoteMode,
    remoteSshConnectionId,
    remoteEnvironment,
    remoteModels,
    isRemoteSyncing,
    remoteError,
    setRemoteMode,
    syncRemoteModels,
    clearRemoteError,
    // local dialog state
    showConnectDialog,
    setShowConnectDialog,
    showAddModelDialog,
    setShowAddModelDialog,
    // derived
    isConnected,
    // handlers
    handleRemoteConnectionChange,
    handleRemoteEnvironmentDetected,
    handleConnect,
    handleDisconnect,
    handlePullModel,
    handleStartService,
    handleStopService,
    handleRestartService,
  }
}

export type OllamaPanelState = ReturnType<typeof useOllamaPanel>
