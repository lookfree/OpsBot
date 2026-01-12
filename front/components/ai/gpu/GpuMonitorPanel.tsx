/**
 * GPU Monitor Panel Component
 *
 * Main panel for GPU monitoring - shows realtime metrics and history.
 * Supports both local and remote modes.
 */

import { useEffect, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { RefreshCw, AlertCircle, Monitor, ChevronDown, Cloud, Server } from 'lucide-react'
import { useAiStore, useConnectionStore } from '@/stores'
import { useAiStyles } from '../hooks'
import { GpuCard } from './GpuCard'
import { GpuRealtimeChart } from './GpuRealtimeChart'
import { GpuHistoryChart } from './GpuHistoryChart'
import { GpuProcessList } from './GpuProcessList'
import type { HistoryInterval, GpuInfo } from '@/types'
import { ModuleType, SSHConnection } from '@/types'

const REFRESH_INTERVAL = 2000 // 2 seconds

interface DataPoint {
  timestamp: number
  value: number
}

export function GpuMonitorPanel() {
  const { t } = useTranslation()
  const styles = useAiStyles()
  const { connections, connectionStatus } = useConnectionStore()

  const {
    // Local GPU state
    gpuDetected,
    gpuInfo,
    gpuProcesses,
    gpuHistory,
    isLoadingGpu,
    gpuError,
    detectGpu,
    fetchGpuInfo,
    fetchGpuProcesses,
    fetchGpuHistory,
    // Remote GPU state
    isGpuRemoteMode,
    gpuRemoteSshConnectionId,
    remoteGpuDetected,
    remoteGpuInfo,
    remoteGpuProcesses,
    isLoadingRemoteGpu,
    remoteGpuError,
    setGpuRemoteMode,
    setGpuRemoteSshConnection,
    detectRemoteGpu,
    fetchRemoteGpuInfo,
    fetchRemoteGpuProcesses,
    clearRemoteGpuError,
  } = useAiStore()

  const [activeTab, setActiveTab] = useState<'realtime' | 'history'>('realtime')
  const [selectedGpuIndex, setSelectedGpuIndex] = useState<number>(0)
  const [historyInterval, setHistoryInterval] = useState<HistoryInterval>('fiveminutes')
  const [showGpuSelector, setShowGpuSelector] = useState(false)
  const [showIntervalSelector, setShowIntervalSelector] = useState(false)
  const [showConnectionSelector, setShowConnectionSelector] = useState(false)

  // Realtime chart data (last 60 data points)
  const [utilizationData, setUtilizationData] = useState<DataPoint[]>([])
  const [memoryData, setMemoryData] = useState<DataPoint[]>([])
  const [temperatureData, setTemperatureData] = useState<DataPoint[]>([])

  // Get SSH connections
  const sshConnections = connections.filter(
    (conn) => conn.moduleType === ModuleType.SSH
  ) as SSHConnection[]

  const selectedConnection = sshConnections.find(
    (conn) => conn.id === gpuRemoteSshConnectionId
  )

  // Current display data based on mode
  const currentGpuDetected = isGpuRemoteMode ? remoteGpuDetected : gpuDetected
  const currentGpuInfo = isGpuRemoteMode ? remoteGpuInfo : gpuInfo
  const currentGpuProcesses = isGpuRemoteMode ? remoteGpuProcesses : gpuProcesses
  const currentIsLoading = isGpuRemoteMode ? isLoadingRemoteGpu : isLoadingGpu
  const currentError = isGpuRemoteMode ? remoteGpuError : gpuError

  // Initial detection
  useEffect(() => {
    if (!isGpuRemoteMode) {
      detectGpu()
    }
  }, [detectGpu, isGpuRemoteMode])

  // Fetch GPU info when detected (local mode)
  useEffect(() => {
    if (!isGpuRemoteMode && gpuDetected) {
      fetchGpuInfo()
      fetchGpuProcesses()
    }
  }, [gpuDetected, fetchGpuInfo, fetchGpuProcesses, isGpuRemoteMode])

  // Detect remote GPU when connection changes
  useEffect(() => {
    if (isGpuRemoteMode && gpuRemoteSshConnectionId) {
      const status = connectionStatus[gpuRemoteSshConnectionId]
      if (status?.isConnected) {
        detectRemoteGpu(gpuRemoteSshConnectionId)
      }
    }
  }, [isGpuRemoteMode, gpuRemoteSshConnectionId, connectionStatus, detectRemoteGpu])

  // Fetch remote GPU info when detected
  useEffect(() => {
    if (isGpuRemoteMode && remoteGpuDetected && gpuRemoteSshConnectionId) {
      fetchRemoteGpuInfo(gpuRemoteSshConnectionId)
      fetchRemoteGpuProcesses(gpuRemoteSshConnectionId)
    }
  }, [isGpuRemoteMode, remoteGpuDetected, gpuRemoteSshConnectionId, fetchRemoteGpuInfo, fetchRemoteGpuProcesses])

  // Realtime refresh
  useEffect(() => {
    if (!currentGpuDetected || activeTab !== 'realtime') return

    const interval = setInterval(() => {
      if (isGpuRemoteMode && gpuRemoteSshConnectionId) {
        fetchRemoteGpuInfo(gpuRemoteSshConnectionId)
        fetchRemoteGpuProcesses(gpuRemoteSshConnectionId)
      } else if (!isGpuRemoteMode) {
        fetchGpuInfo()
        fetchGpuProcesses()
      }
    }, REFRESH_INTERVAL)

    return () => clearInterval(interval)
  }, [currentGpuDetected, activeTab, isGpuRemoteMode, gpuRemoteSshConnectionId, fetchGpuInfo, fetchGpuProcesses, fetchRemoteGpuInfo, fetchRemoteGpuProcesses])

  // Update chart data when GPU info changes
  useEffect(() => {
    if (currentGpuInfo.length === 0) return

    const gpu = currentGpuInfo[selectedGpuIndex]
    if (!gpu) return

    const now = Date.now()
    const maxPoints = 60

    setUtilizationData((prev) => {
      const next = [...prev, { timestamp: now, value: gpu.utilization }]
      return next.slice(-maxPoints)
    })

    setMemoryData((prev) => {
      const memPercent = (gpu.memoryUsed / gpu.memoryTotal) * 100
      const next = [...prev, { timestamp: now, value: memPercent }]
      return next.slice(-maxPoints)
    })

    setTemperatureData((prev) => {
      const next = [...prev, { timestamp: now, value: gpu.temperature }]
      return next.slice(-maxPoints)
    })
  }, [currentGpuInfo, selectedGpuIndex])

  // Fetch history when tab changes (local mode only)
  useEffect(() => {
    if (activeTab !== 'history' || gpuInfo.length === 0 || isGpuRemoteMode) return

    const now = Math.floor(Date.now() / 1000)
    let startTime: number

    switch (historyInterval) {
      case 'minute':
        startTime = now - 3600 // 1 hour
        break
      case 'fiveminutes':
        startTime = now - 6 * 3600 // 6 hours
        break
      case 'hour':
        startTime = now - 24 * 3600 // 24 hours
        break
      case 'day':
        startTime = now - 7 * 24 * 3600 // 7 days
        break
      default:
        startTime = now - 3600
    }

    fetchGpuHistory(selectedGpuIndex, startTime, now, historyInterval)
  }, [activeTab, selectedGpuIndex, historyInterval, gpuInfo.length, fetchGpuHistory, isGpuRemoteMode])

  // Clear chart data when mode or connection changes
  useEffect(() => {
    setUtilizationData([])
    setMemoryData([])
    setTemperatureData([])
    setSelectedGpuIndex(0)
  }, [isGpuRemoteMode, gpuRemoteSshConnectionId])

  const handleRefresh = useCallback(() => {
    if (isGpuRemoteMode) {
      if (gpuRemoteSshConnectionId) {
        if (remoteGpuDetected) {
          fetchRemoteGpuInfo(gpuRemoteSshConnectionId)
          fetchRemoteGpuProcesses(gpuRemoteSshConnectionId)
        } else {
          detectRemoteGpu(gpuRemoteSshConnectionId)
        }
      }
    } else {
      if (gpuDetected) {
        fetchGpuInfo()
        fetchGpuProcesses()
      } else {
        detectGpu()
      }
    }
  }, [isGpuRemoteMode, gpuRemoteSshConnectionId, remoteGpuDetected, gpuDetected, detectGpu, fetchGpuInfo, fetchGpuProcesses, detectRemoteGpu, fetchRemoteGpuInfo, fetchRemoteGpuProcesses])

  const handleConnectionSelect = useCallback((connectionId: string) => {
    setGpuRemoteSshConnection(connectionId)
    setShowConnectionSelector(false)
  }, [setGpuRemoteSshConnection])

  const intervalLabels: Record<HistoryInterval, string> = {
    minute: t('ai.gpu.intervalMinute'),
    fiveminutes: t('ai.gpu.intervalFiveMinutes'),
    hour: t('ai.gpu.intervalHour'),
    day: t('ai.gpu.intervalDay'),
  }

  // Render not detected state
  const renderNotDetected = () => (
    <div className={cn('h-full flex flex-col items-center justify-center gap-4', styles.textSecondary)}>
      <AlertCircle className="w-16 h-16 opacity-50" />
      <p className="text-lg">
        {isGpuRemoteMode
          ? (gpuRemoteSshConnectionId ? t('ai.gpu.remoteNotDetected') : t('ai.gpu.selectConnection'))
          : t('ai.gpu.notDetected')}
      </p>
      <p className="text-sm">{currentError || t('ai.gpu.noNvidiaGpu')}</p>
      {(isGpuRemoteMode ? gpuRemoteSshConnectionId : true) && (
        <button
          onClick={handleRefresh}
          disabled={currentIsLoading}
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors',
            styles.borderColor,
            styles.hoverBg
          )}
        >
          <RefreshCw className={cn('w-4 h-4', currentIsLoading && 'animate-spin')} />
          {t('ai.gpu.retry')}
        </button>
      )}
    </div>
  )

  return (
    <div className={cn('h-full flex flex-col p-4', styles.bgPrimary)}>
      {/* Mode Toggle */}
      <div className={cn('flex items-center gap-2 p-2 rounded-lg border mb-4', styles.bgSecondary, styles.borderColor)}>
        <span className={cn('text-sm mr-2', styles.textSecondary)}>
          {t('ai.remote.mode', 'Mode')}:
        </span>
        <button
          onClick={() => setGpuRemoteMode(false)}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 text-sm rounded transition-colors',
            !isGpuRemoteMode
              ? 'bg-blue-600 text-white'
              : cn(styles.hoverBg, styles.textSecondary)
          )}
        >
          <Monitor className="w-4 h-4" />
          {t('ai.remote.local', 'Local')}
        </button>
        <button
          onClick={() => setGpuRemoteMode(true)}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 text-sm rounded transition-colors',
            isGpuRemoteMode
              ? 'bg-blue-600 text-white'
              : cn(styles.hoverBg, styles.textSecondary)
          )}
        >
          <Cloud className="w-4 h-4" />
          {t('ai.remote.remote', 'Remote')}
        </button>
      </div>

      {/* Remote Mode: SSH Connection Selector */}
      {isGpuRemoteMode && (
        <div className={cn('flex items-center gap-3 p-3 rounded-lg border mb-4', styles.bgSecondary, styles.borderColor)}>
          <Server className={cn('w-5 h-5', styles.textPrimary)} />
          <span className={cn('text-sm', styles.textSecondary)}>{t('ai.remote.sshConnection')}:</span>
          <div className="relative flex-1">
            <button
              onClick={() => setShowConnectionSelector(!showConnectionSelector)}
              className={cn(
                'flex items-center justify-between w-full px-3 py-2 text-sm rounded-lg border',
                styles.bgPrimary,
                styles.borderColor,
                styles.textPrimary
              )}
            >
              <span>
                {selectedConnection
                  ? `${selectedConnection.name} (${selectedConnection.host})`
                  : t('ai.remote.selectConnection')}
              </span>
              <ChevronDown className="w-4 h-4" />
            </button>
            {showConnectionSelector && (
              <div className={cn(
                'absolute top-full left-0 right-0 mt-1 rounded-lg border shadow-lg z-10 max-h-48 overflow-auto',
                styles.bgSecondary,
                styles.borderColor
              )}>
                {sshConnections.length === 0 ? (
                  <div className={cn('px-3 py-2 text-sm', styles.textSecondary)}>
                    {t('ai.remote.noConnections')}
                  </div>
                ) : (
                  sshConnections.map((conn) => {
                    const status = connectionStatus[conn.id]
                    return (
                      <button
                        key={conn.id}
                        onClick={() => handleConnectionSelect(conn.id)}
                        disabled={!status?.isConnected}
                        className={cn(
                          'w-full text-left px-3 py-2 text-sm flex items-center justify-between',
                          styles.hoverBg,
                          conn.id === gpuRemoteSshConnectionId ? styles.textPrimary : styles.textSecondary,
                          !status?.isConnected && 'opacity-50 cursor-not-allowed'
                        )}
                      >
                        <span>{conn.name} ({conn.host})</span>
                        <span className={cn('text-xs', status?.isConnected ? 'text-green-500' : 'text-red-500')}>
                          {status?.isConnected ? t('common.connected') : t('common.disconnected')}
                        </span>
                      </button>
                    )
                  })
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Error Message */}
      {currentError && (
        <div className={cn('flex items-center gap-2 p-3 rounded-lg border border-red-500/50 bg-red-500/10 mb-4', styles.errorText)}>
          <AlertCircle className="w-4 h-4" />
          <span className="text-sm">{currentError}</span>
          <button
            className="ml-auto text-sm underline"
            onClick={() => isGpuRemoteMode ? clearRemoteGpuError() : undefined}
          >
            {t('common.dismiss')}
          </button>
        </div>
      )}

      {/* GPU not detected */}
      {!currentGpuDetected && !currentIsLoading && renderNotDetected()}

      {/* GPU detected - show content */}
      {(currentGpuDetected || currentIsLoading) && (
        <>
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              <h2 className={cn('text-lg font-semibold flex items-center gap-2', styles.textPrimary)}>
                <Monitor className="w-5 h-5" />
                {t('ai.gpu.title')}
                {isGpuRemoteMode && selectedConnection && (
                  <span className={cn('text-sm font-normal', styles.textSecondary)}>
                    @ {selectedConnection.name}
                  </span>
                )}
              </h2>

              {/* GPU Selector */}
              {currentGpuInfo.length > 1 && (
                <div className="relative">
                  <button
                    onClick={() => setShowGpuSelector(!showGpuSelector)}
                    className={cn(
                      'flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg border',
                      styles.bgSecondary,
                      styles.borderColor,
                      styles.textPrimary
                    )}
                  >
                    GPU {selectedGpuIndex}: {currentGpuInfo[selectedGpuIndex]?.name || 'Unknown'}
                    <ChevronDown className="w-4 h-4" />
                  </button>
                  {showGpuSelector && (
                    <div className={cn(
                      'absolute top-full left-0 mt-1 min-w-[200px] rounded-lg border shadow-lg z-10',
                      styles.bgSecondary,
                      styles.borderColor
                    )}>
                      {currentGpuInfo.map((gpu, index) => (
                        <button
                          key={gpu.uuid}
                          onClick={() => {
                            setSelectedGpuIndex(index)
                            setShowGpuSelector(false)
                          }}
                          className={cn(
                            'w-full text-left px-3 py-2 text-sm first:rounded-t-lg last:rounded-b-lg',
                            styles.hoverBg,
                            index === selectedGpuIndex ? styles.textPrimary : styles.textSecondary
                          )}
                        >
                          GPU {index}: {gpu.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <button
              onClick={handleRefresh}
              disabled={currentIsLoading}
              className={cn(
                'flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg border transition-colors',
                styles.borderColor,
                styles.hoverBg,
                styles.textSecondary
              )}
            >
              <RefreshCw className={cn('w-4 h-4', currentIsLoading && 'animate-spin')} />
              {t('common.refresh')}
            </button>
          </div>

          {/* Tabs */}
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setActiveTab('realtime')}
              className={cn(
                'px-4 py-2 text-sm rounded-lg transition-colors',
                activeTab === 'realtime'
                  ? cn('bg-blue-600 text-white')
                  : cn(styles.bgSecondary, styles.textSecondary, styles.hoverBg)
              )}
            >
              {t('ai.gpu.realtime')}
            </button>
            {/* History tab only available in local mode */}
            {!isGpuRemoteMode && (
              <button
                onClick={() => setActiveTab('history')}
                className={cn(
                  'px-4 py-2 text-sm rounded-lg transition-colors',
                  activeTab === 'history'
                    ? cn('bg-blue-600 text-white')
                    : cn(styles.bgSecondary, styles.textSecondary, styles.hoverBg)
                )}
              >
                {t('ai.gpu.history')}
              </button>
            )}
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-auto">
            {/* Realtime Tab */}
            {activeTab === 'realtime' && (
              <div className="space-y-4">
                {/* GPU Cards */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {currentGpuInfo.map((gpu) => (
                    <GpuCard key={gpu.uuid} gpu={gpu} />
                  ))}
                </div>

                {/* Realtime Charts */}
                {currentGpuInfo.length > 0 && (
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    <GpuRealtimeChart
                      title={t('ai.gpu.utilization')}
                      data={utilizationData}
                      color="#22c55e"
                      unit="%"
                    />
                    <GpuRealtimeChart
                      title={t('ai.gpu.memory')}
                      data={memoryData}
                      color="#3b82f6"
                      unit="%"
                    />
                    <GpuRealtimeChart
                      title={t('ai.gpu.temperature')}
                      data={temperatureData}
                      color="#ef4444"
                      maxValue={100}
                      unit="°C"
                    />
                  </div>
                )}

                {/* Process List */}
                <GpuProcessList processes={currentGpuProcesses} />
              </div>
            )}

            {/* History Tab (local mode only) */}
            {activeTab === 'history' && !isGpuRemoteMode && (
              <div className="space-y-4">
                {/* Interval Selector */}
                <div className="flex items-center gap-4">
                  <span className={styles.textSecondary}>{t('ai.gpu.interval')}:</span>
                  <div className="relative">
                    <button
                      onClick={() => setShowIntervalSelector(!showIntervalSelector)}
                      className={cn(
                        'flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg border',
                        styles.bgSecondary,
                        styles.borderColor,
                        styles.textPrimary
                      )}
                    >
                      {intervalLabels[historyInterval]}
                      <ChevronDown className="w-4 h-4" />
                    </button>
                    {showIntervalSelector && (
                      <div className={cn(
                        'absolute top-full left-0 mt-1 min-w-[150px] rounded-lg border shadow-lg z-10',
                        styles.bgSecondary,
                        styles.borderColor
                      )}>
                        {(Object.keys(intervalLabels) as HistoryInterval[]).map((key) => (
                          <button
                            key={key}
                            onClick={() => {
                              setHistoryInterval(key)
                              setShowIntervalSelector(false)
                            }}
                            className={cn(
                              'w-full text-left px-3 py-2 text-sm first:rounded-t-lg last:rounded-b-lg',
                              styles.hoverBg,
                              key === historyInterval ? styles.textPrimary : styles.textSecondary
                            )}
                          >
                            {intervalLabels[key]}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* History Chart */}
                <GpuHistoryChart data={gpuHistory} interval={historyInterval} />
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
