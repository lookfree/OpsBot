/**
 * GPU Monitor Panel Component
 *
 * Main panel for GPU monitoring - shows realtime metrics and history.
 * Supports both local and remote modes.
 */

import { cn } from '@/lib/utils'
import { useGpuMonitor } from './useGpuMonitor'
import { GpuModeToggle } from './GpuModeToggle'
import { GpuRemoteConnectionBar } from './GpuRemoteConnectionBar'
import { GpuErrorBanner } from './GpuErrorBanner'
import { GpuNotDetected } from './GpuNotDetected'
import { GpuMonitorHeader } from './GpuMonitorHeader'
import { GpuTabsBar } from './GpuTabsBar'
import { GpuRealtimeTab } from './GpuRealtimeTab'
import { GpuHistoryTab } from './GpuHistoryTab'

export function GpuMonitorPanel() {
  const m = useGpuMonitor()

  return (
    <div className={cn('h-full flex flex-col p-4', m.styles.bgPrimary)}>
      {/* Mode Toggle */}
      <GpuModeToggle isGpuRemoteMode={m.isGpuRemoteMode} setGpuRemoteMode={m.setGpuRemoteMode} styles={m.styles} t={m.t} />

      {/* Remote Mode: SSH Connection Selector */}
      {m.isGpuRemoteMode && (
        <GpuRemoteConnectionBar
          sshConnections={m.sshConnections} connectionStatus={m.connectionStatus} selectedConnection={m.selectedConnection}
          gpuRemoteSshConnectionId={m.gpuRemoteSshConnectionId} showConnectionSelector={m.showConnectionSelector}
          setShowConnectionSelector={m.setShowConnectionSelector} handleConnectionSelect={m.handleConnectionSelect}
          styles={m.styles} t={m.t}
        />
      )}

      {/* Error Message */}
      {m.currentError && (
        <GpuErrorBanner currentError={m.currentError} isGpuRemoteMode={m.isGpuRemoteMode} clearRemoteGpuError={m.clearRemoteGpuError} styles={m.styles} t={m.t} />
      )}

      {/* GPU not detected */}
      {!m.currentGpuDetected && !m.currentIsLoading && (
        <GpuNotDetected
          isGpuRemoteMode={m.isGpuRemoteMode} gpuRemoteSshConnectionId={m.gpuRemoteSshConnectionId} currentError={m.currentError}
          currentIsLoading={m.currentIsLoading} handleRefresh={m.handleRefresh} styles={m.styles} t={m.t}
        />
      )}

      {/* GPU detected - show content */}
      {(m.currentGpuDetected || m.currentIsLoading) && (
        <>
          {/* Header */}
          <GpuMonitorHeader
            currentGpuInfo={m.currentGpuInfo} selectedGpuIndex={m.selectedGpuIndex} setSelectedGpuIndex={m.setSelectedGpuIndex}
            showGpuSelector={m.showGpuSelector} setShowGpuSelector={m.setShowGpuSelector} isGpuRemoteMode={m.isGpuRemoteMode}
            selectedConnection={m.selectedConnection} currentIsLoading={m.currentIsLoading} handleRefresh={m.handleRefresh}
            styles={m.styles} t={m.t}
          />

          {/* Tabs */}
          <GpuTabsBar activeTab={m.activeTab} setActiveTab={m.setActiveTab} isGpuRemoteMode={m.isGpuRemoteMode} styles={m.styles} t={m.t} />

          {/* Tab Content */}
          <div className="flex-1 overflow-auto">
            {/* Realtime Tab */}
            {m.activeTab === 'realtime' && (
              <GpuRealtimeTab
                currentGpuInfo={m.currentGpuInfo} currentGpuProcesses={m.currentGpuProcesses} utilizationData={m.utilizationData}
                memoryData={m.memoryData} temperatureData={m.temperatureData} t={m.t}
              />
            )}

            {/* History Tab (local mode only) */}
            {m.activeTab === 'history' && !m.isGpuRemoteMode && (
              <GpuHistoryTab
                gpuHistory={m.gpuHistory} historyInterval={m.historyInterval} setHistoryInterval={m.setHistoryInterval}
                showIntervalSelector={m.showIntervalSelector} setShowIntervalSelector={m.setShowIntervalSelector}
                intervalLabels={m.intervalLabels} styles={m.styles} t={m.t}
              />
            )}
          </div>
        </>
      )}
    </div>
  )
}
