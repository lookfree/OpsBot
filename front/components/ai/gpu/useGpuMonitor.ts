/**
 * GPU Monitor data hook
 *
 * Holds all state, effects, derived values and handlers for the GPU
 * monitor panel. Extracted verbatim from GpuMonitorPanel so the component
 * function stays small while behavior is preserved exactly.
 */

import { useEffect, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useAiStore, useConnectionStore } from '@/stores'
import { useAiStyles } from '../hooks'
import type { HistoryInterval } from '@/types'
import { ModuleType, SSHConnection } from '@/types'

export const REFRESH_INTERVAL = 2000 // 2 seconds

export interface DataPoint {
  timestamp: number
  value: number
}

export function useGpuMonitor() {
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
      if (status === 'connected') {
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

  return {
    t,
    styles,
    // mode
    isGpuRemoteMode,
    setGpuRemoteMode,
    // remote connection selector
    sshConnections,
    connectionStatus,
    selectedConnection,
    gpuRemoteSshConnectionId,
    showConnectionSelector,
    setShowConnectionSelector,
    handleConnectionSelect,
    // error banner
    currentError,
    clearRemoteGpuError,
    // detection / loading
    currentGpuDetected,
    currentIsLoading,
    // gpu data
    currentGpuInfo,
    currentGpuProcesses,
    selectedGpuIndex,
    setSelectedGpuIndex,
    showGpuSelector,
    setShowGpuSelector,
    handleRefresh,
    // tabs
    activeTab,
    setActiveTab,
    // realtime charts
    utilizationData,
    memoryData,
    temperatureData,
    // history
    gpuHistory,
    historyInterval,
    setHistoryInterval,
    showIntervalSelector,
    setShowIntervalSelector,
    intervalLabels,
  }
}

export type GpuMonitor = ReturnType<typeof useGpuMonitor>
