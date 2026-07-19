/**
 * Ollama Panel Component
 *
 * Manages Ollama service connection and model operations.
 * Supports both local and remote modes.
 */

import { useOllamaPanel } from './useOllamaPanel'
import { OllamaModeToggle } from './OllamaModeToggle'
import { OllamaLocalStatusBar } from './OllamaLocalStatusBar'
import { OllamaLocalError } from './OllamaLocalError'
import { OllamaRemoteError } from './OllamaRemoteError'
import { OllamaLocalModelToolbar } from './OllamaLocalModelToolbar'
import { OllamaRemoteModelToolbar } from './OllamaRemoteModelToolbar'
import { OllamaLocalPlaceholder } from './OllamaLocalPlaceholder'
import { OllamaRemoteNoConnection } from './OllamaRemoteNoConnection'
import { OllamaRemoteNoOllama } from './OllamaRemoteNoOllama'
import { OllamaModelList } from './OllamaModelList'
import { AddModelDialog } from './AddModelDialog'
import { OllamaConnectDialog } from './OllamaConnectDialog'
import { RemoteConnectionSelector } from '../RemoteConnectionSelector'

export function OllamaPanel() {
  const m = useOllamaPanel()

  return (
    <div className="flex flex-col h-full p-4 gap-4">
      {/* Mode Toggle */}
      <OllamaModeToggle isRemoteMode={m.isRemoteMode} setRemoteMode={m.setRemoteMode} styles={m.styles} t={m.t} />
      {/* Local Mode: Connection Status Bar */}
      {!m.isRemoteMode && (
        <OllamaLocalStatusBar
          isConnected={m.isConnected} ollamaStatus={m.ollamaStatus} isControllingService={m.isControllingService}
          isLoadingModels={m.isLoadingModels} isConnecting={m.isConnecting} handleStartService={m.handleStartService}
          handleStopService={m.handleStopService} handleRestartService={m.handleRestartService}
          fetchOllamaModels={m.fetchOllamaModels} handleDisconnect={m.handleDisconnect}
          setShowConnectDialog={m.setShowConnectDialog} styles={m.styles} t={m.t}
        />
      )}
      {/* Remote Mode: SSH Connection Selector */}
      {m.isRemoteMode && (
        <RemoteConnectionSelector
          value={m.remoteSshConnectionId ?? undefined}
          onChange={m.handleRemoteConnectionChange}
          onEnvironmentDetected={m.handleRemoteEnvironmentDetected}
        />
      )}
      {/* Error Message (Local Mode) */}
      {!m.isRemoteMode && m.error && (
        <OllamaLocalError error={m.error} clearError={m.clearError} styles={m.styles} t={m.t} />
      )}
      {/* Error Message (Remote Mode) */}
      {m.isRemoteMode && m.remoteError && (
        <OllamaRemoteError remoteError={m.remoteError} clearRemoteError={m.clearRemoteError} styles={m.styles} t={m.t} />
      )}
      {/* Model Operations Toolbar (Local Mode) */}
      {!m.isRemoteMode && m.isConnected && (
        <OllamaLocalModelToolbar isPullingModel={m.isPullingModel} setShowAddModelDialog={m.setShowAddModelDialog} t={m.t} />
      )}
      {/* Model Operations Toolbar (Remote Mode) */}
      {m.isRemoteMode && m.remoteSshConnectionId && m.remoteEnvironment?.ollamaInstalled && (
        <OllamaRemoteModelToolbar syncRemoteModels={m.syncRemoteModels} isRemoteSyncing={m.isRemoteSyncing} styles={m.styles} t={m.t} />
      )}
      {/* Model List (Local Mode) */}
      {!m.isRemoteMode && m.isConnected && (
        <OllamaModelList models={m.ollamaModels} isLoading={m.isLoadingModels} isPulling={m.isPullingModel} pullingModelName={m.pullingModelName} onDelete={m.deleteOllamaModel} />
      )}
      {/* Model List (Remote Mode) */}
      {m.isRemoteMode && m.remoteSshConnectionId && m.remoteEnvironment?.ollamaInstalled && (
        <OllamaModelList models={m.remoteModels} isLoading={m.isRemoteSyncing} isPulling={false} pullingModelName={null} onDelete={async (_modelName) => {}} isRemote />
      )}
      {/* Not Connected Placeholder (Local Mode) */}
      {!m.isRemoteMode && !m.isConnected && !m.isConnecting && (
        <OllamaLocalPlaceholder setShowConnectDialog={m.setShowConnectDialog} styles={m.styles} t={m.t} />
      )}
      {/* Remote Mode Placeholder - No Connection Selected */}
      {m.isRemoteMode && !m.remoteSshConnectionId && (
        <OllamaRemoteNoConnection styles={m.styles} t={m.t} />
      )}
      {/* Remote Mode Placeholder - No Ollama */}
      {m.isRemoteMode && m.remoteSshConnectionId && m.remoteEnvironment && !m.remoteEnvironment.ollamaInstalled && (
        <OllamaRemoteNoOllama styles={m.styles} t={m.t} />
      )}
      {/* Dialogs */}
      <OllamaConnectDialog open={m.showConnectDialog} onOpenChange={m.setShowConnectDialog} onConnect={m.handleConnect} isConnecting={m.isConnecting} />
      <AddModelDialog open={m.showAddModelDialog} onOpenChange={m.setShowAddModelDialog} onPull={m.handlePullModel} isPulling={m.isPullingModel} />
    </div>
  )
}
