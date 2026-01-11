/**
 * GPU Monitor Panel Component
 *
 * Main panel for GPU monitoring - shows realtime metrics and history.
 */

import { useEffect, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { RefreshCw, AlertCircle, Monitor, ChevronDown } from 'lucide-react'
import { useAiStore } from '@/stores'
import { useAiStyles } from '../hooks'
import { GpuCard } from './GpuCard'
import { GpuRealtimeChart } from './GpuRealtimeChart'
import { GpuHistoryChart } from './GpuHistoryChart'
import { GpuProcessList } from './GpuProcessList'
import type { HistoryInterval } from '@/types'

const REFRESH_INTERVAL = 2000 // 2 seconds

interface DataPoint {
  timestamp: number
  value: number
}

export function GpuMonitorPanel() {
  const { t } = useTranslation()
  const styles = useAiStyles()
  const {
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
  } = useAiStore()

  const [activeTab, setActiveTab] = useState<'realtime' | 'history'>('realtime')
  const [selectedGpuIndex, setSelectedGpuIndex] = useState<number>(0)
  const [historyInterval, setHistoryInterval] = useState<HistoryInterval>('fiveminutes')
  const [showGpuSelector, setShowGpuSelector] = useState(false)
  const [showIntervalSelector, setShowIntervalSelector] = useState(false)

  // Realtime chart data (last 60 data points)
  const [utilizationData, setUtilizationData] = useState<DataPoint[]>([])
  const [memoryData, setMemoryData] = useState<DataPoint[]>([])
  const [temperatureData, setTemperatureData] = useState<DataPoint[]>([])

  // Initial detection
  useEffect(() => {
    detectGpu()
  }, [detectGpu])

  // Fetch GPU info when detected
  useEffect(() => {
    if (gpuDetected) {
      fetchGpuInfo()
      fetchGpuProcesses()
    }
  }, [gpuDetected, fetchGpuInfo, fetchGpuProcesses])

  // Realtime refresh
  useEffect(() => {
    if (!gpuDetected || activeTab !== 'realtime') return

    const interval = setInterval(() => {
      fetchGpuInfo()
      fetchGpuProcesses()
    }, REFRESH_INTERVAL)

    return () => clearInterval(interval)
  }, [gpuDetected, activeTab, fetchGpuInfo, fetchGpuProcesses])

  // Update chart data when GPU info changes
  useEffect(() => {
    if (gpuInfo.length === 0) return

    const gpu = gpuInfo[selectedGpuIndex]
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
  }, [gpuInfo, selectedGpuIndex])

  // Fetch history when tab changes
  useEffect(() => {
    if (activeTab !== 'history' || gpuInfo.length === 0) return

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
  }, [activeTab, selectedGpuIndex, historyInterval, gpuInfo.length, fetchGpuHistory])

  const handleRefresh = useCallback(() => {
    if (gpuDetected) {
      fetchGpuInfo()
      fetchGpuProcesses()
    } else {
      detectGpu()
    }
  }, [gpuDetected, detectGpu, fetchGpuInfo, fetchGpuProcesses])

  const intervalLabels: Record<HistoryInterval, string> = {
    minute: t('ai.gpu.intervalMinute'),
    fiveminutes: t('ai.gpu.intervalFiveMinutes'),
    hour: t('ai.gpu.intervalHour'),
    day: t('ai.gpu.intervalDay'),
  }

  // GPU not detected
  if (!gpuDetected && !isLoadingGpu) {
    return (
      <div className={cn('h-full flex flex-col items-center justify-center gap-4', styles.textSecondary)}>
        <AlertCircle className="w-16 h-16 opacity-50" />
        <p className="text-lg">{t('ai.gpu.notDetected')}</p>
        <p className="text-sm">{gpuError || t('ai.gpu.noNvidiaGpu')}</p>
        <button
          onClick={handleRefresh}
          disabled={isLoadingGpu}
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors',
            styles.borderColor,
            styles.hoverBg
          )}
        >
          <RefreshCw className={cn('w-4 h-4', isLoadingGpu && 'animate-spin')} />
          {t('ai.gpu.retry')}
        </button>
      </div>
    )
  }

  return (
    <div className={cn('h-full flex flex-col p-4', styles.bgPrimary)}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-4">
          <h2 className={cn('text-lg font-semibold flex items-center gap-2', styles.textPrimary)}>
            <Monitor className="w-5 h-5" />
            {t('ai.gpu.title')}
          </h2>

          {/* GPU Selector */}
          {gpuInfo.length > 1 && (
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
                GPU {selectedGpuIndex}: {gpuInfo[selectedGpuIndex]?.name || 'Unknown'}
                <ChevronDown className="w-4 h-4" />
              </button>
              {showGpuSelector && (
                <div className={cn(
                  'absolute top-full left-0 mt-1 min-w-[200px] rounded-lg border shadow-lg z-10',
                  styles.bgSecondary,
                  styles.borderColor
                )}>
                  {gpuInfo.map((gpu, index) => (
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
          disabled={isLoadingGpu}
          className={cn(
            'flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg border transition-colors',
            styles.borderColor,
            styles.hoverBg,
            styles.textSecondary
          )}
        >
          <RefreshCw className={cn('w-4 h-4', isLoadingGpu && 'animate-spin')} />
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
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-auto">
        {/* Realtime Tab */}
        {activeTab === 'realtime' && (
          <div className="space-y-4">
            {/* GPU Cards */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {gpuInfo.map((gpu) => (
                <GpuCard key={gpu.uuid} gpu={gpu} />
              ))}
            </div>

            {/* Realtime Charts */}
            {gpuInfo.length > 0 && (
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
            <GpuProcessList processes={gpuProcesses} />
          </div>
        )}

        {/* History Tab */}
        {activeTab === 'history' && (
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
    </div>
  )
}
