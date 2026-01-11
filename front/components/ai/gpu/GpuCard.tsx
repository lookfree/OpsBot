/**
 * GPU Card Component
 *
 * Displays individual GPU information with utilization meters.
 */

import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { Thermometer, Zap, Fan, HardDrive } from 'lucide-react'
import type { GpuInfo } from '@/types'
import { useAiStyles } from '../hooks'

interface GpuCardProps {
  gpu: GpuInfo
  className?: string
}

export function GpuCard({ gpu, className }: GpuCardProps) {
  const { t } = useTranslation()
  const styles = useAiStyles()

  const memoryPercent = (gpu.memoryUsed / gpu.memoryTotal) * 100

  const getUtilizationColor = (percent: number) => {
    if (percent < 50) return 'bg-green-500'
    if (percent < 80) return 'bg-yellow-500'
    return 'bg-red-500'
  }

  const getTemperatureColor = (temp: number) => {
    if (temp < 50) return 'text-green-500'
    if (temp < 70) return 'text-yellow-500'
    return 'text-red-500'
  }

  return (
    <div className={cn('rounded-lg border p-4', styles.bgSecondary, styles.borderColor, className)}>
      {/* Header */}
      <div className="mb-4">
        <h3 className={cn('text-base font-medium flex items-center gap-2', styles.textPrimary)}>
          <HardDrive className="w-4 h-4" />
          GPU {gpu.index}: {gpu.name}
        </h3>
        <p className={cn('text-xs mt-1', styles.textSecondary)}>
          {t('ai.gpu.driver')}: {gpu.driverVersion}
          {gpu.cudaVersion && ` | CUDA: ${gpu.cudaVersion}`}
        </p>
      </div>

      {/* Utilization */}
      <div className="space-y-3">
        {/* GPU Utilization */}
        <div className="space-y-1">
          <div className="flex justify-between text-sm">
            <span className={styles.textSecondary}>{t('ai.gpu.utilization')}</span>
            <span className={styles.textPrimary}>{gpu.utilization.toFixed(1)}%</span>
          </div>
          <div className={cn('h-2 rounded-full overflow-hidden', styles.bgPrimary)}>
            <div
              className={cn('h-full transition-all', getUtilizationColor(gpu.utilization))}
              style={{ width: `${gpu.utilization}%` }}
            />
          </div>
        </div>

        {/* Memory Usage */}
        <div className="space-y-1">
          <div className="flex justify-between text-sm">
            <span className={styles.textSecondary}>{t('ai.gpu.memory')}</span>
            <span className={styles.textPrimary}>
              {gpu.memoryUsed} MB / {gpu.memoryTotal} MB
            </span>
          </div>
          <div className={cn('h-2 rounded-full overflow-hidden', styles.bgPrimary)}>
            <div
              className={cn('h-full transition-all', getUtilizationColor(memoryPercent))}
              style={{ width: `${memoryPercent}%` }}
            />
          </div>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-3 gap-4 pt-4 mt-4 border-t border-gray-600/30">
        {/* Temperature */}
        <div className="flex flex-col items-center">
          <Thermometer className={cn('w-5 h-5 mb-1', getTemperatureColor(gpu.temperature))} />
          <span className={cn('text-sm font-medium', styles.textPrimary)}>
            {gpu.temperature.toFixed(0)}°C
          </span>
          <span className={cn('text-xs', styles.textSecondary)}>
            {t('ai.gpu.temperature')}
          </span>
        </div>

        {/* Power */}
        {gpu.powerDraw !== undefined && (
          <div className="flex flex-col items-center">
            <Zap className="w-5 h-5 mb-1 text-yellow-500" />
            <span className={cn('text-sm font-medium', styles.textPrimary)}>
              {gpu.powerDraw.toFixed(0)}W
            </span>
            <span className={cn('text-xs', styles.textSecondary)}>
              {t('ai.gpu.power')}
            </span>
          </div>
        )}

        {/* Fan Speed */}
        {gpu.fanSpeed !== undefined && (
          <div className="flex flex-col items-center">
            <Fan className="w-5 h-5 mb-1 text-blue-500" />
            <span className={cn('text-sm font-medium', styles.textPrimary)}>
              {gpu.fanSpeed.toFixed(0)}%
            </span>
            <span className={cn('text-xs', styles.textSecondary)}>
              {t('ai.gpu.fan')}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
