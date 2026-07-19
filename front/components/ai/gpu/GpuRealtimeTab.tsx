/**
 * GPU Monitor - Realtime tab content (cards, charts, process list)
 */

import { GpuCard } from './GpuCard'
import { GpuRealtimeChart } from './GpuRealtimeChart'
import { GpuProcessList } from './GpuProcessList'
import type { GpuMonitor } from './useGpuMonitor'

type GpuRealtimeTabProps = Pick<
  GpuMonitor,
  | 'currentGpuInfo'
  | 'currentGpuProcesses'
  | 'utilizationData'
  | 'memoryData'
  | 'temperatureData'
  | 't'
>

export function GpuRealtimeTab({
  currentGpuInfo,
  currentGpuProcesses,
  utilizationData,
  memoryData,
  temperatureData,
  t,
}: GpuRealtimeTabProps) {
  return (
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
  )
}
