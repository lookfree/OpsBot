/**
 * GPU History Chart Component
 *
 * Displays historical GPU metrics with time-based x-axis.
 */

import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { History } from 'lucide-react'
import type { GpuHistory, HistoryInterval } from '@/types'
import { useAiStyles } from '../hooks'

interface GpuHistoryChartProps {
  data: GpuHistory[]
  interval: HistoryInterval
  className?: string
}

export function GpuHistoryChart({ data, interval, className }: GpuHistoryChartProps) {
  const { t } = useTranslation()
  const styles = useAiStyles()

  const chartWidth = 600
  const chartHeight = 200
  const padding = { top: 20, right: 20, bottom: 40, left: 50 }
  const innerWidth = chartWidth - padding.left - padding.right
  const innerHeight = chartHeight - padding.top - padding.bottom

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp * 1000)
    switch (interval) {
      case 'minute':
      case 'fiveminutes':
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      case 'hour':
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      case 'day':
        return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
      default:
        return date.toLocaleTimeString()
    }
  }

  const { utilizationPath, temperaturePath, timeLabels } = useMemo(() => {
    if (data.length === 0) {
      return { utilizationPath: '', temperaturePath: '', timeLabels: [] }
    }

    const maxTemp = Math.max(...data.map((d) => d.temperature), 100)

    const getPath = (values: number[], max: number) => {
      const points = values.map((value, index) => {
        const x = padding.left + (index / Math.max(data.length - 1, 1)) * innerWidth
        const y = padding.top + innerHeight - (value / max) * innerHeight
        return `${x},${y}`
      })
      return `M ${points.join(' L ')}`
    }

    const utilizationPath = getPath(
      data.map((d) => d.utilization),
      100
    )
    const temperaturePath = getPath(
      data.map((d) => d.temperature),
      maxTemp
    )

    // Generate time labels (5 labels max)
    const labelCount = Math.min(5, data.length)
    const timeLabels = labelCount > 0 ? Array.from({ length: labelCount }, (_, i) => {
      const index = Math.floor((i / (labelCount - 1)) * (data.length - 1))
      const point = data[index]
      return {
        x: padding.left + (index / Math.max(data.length - 1, 1)) * innerWidth,
        label: formatTime(point.timestamp),
      }
    }) : []

    return { utilizationPath, temperaturePath, timeLabels }
  }, [data, innerWidth, innerHeight, interval])

  const yAxisLabels = [0, 25, 50, 75, 100].map((val) => ({
    value: val,
    y: padding.top + innerHeight - (val / 100) * innerHeight,
  }))

  return (
    <div className={cn('rounded-lg border p-4', styles.bgSecondary, styles.borderColor, className)}>
      {/* Header */}
      <h3 className={cn('text-base font-medium flex items-center gap-2 mb-4', styles.textPrimary)}>
        <History className="w-4 h-4" />
        {t('ai.gpu.history')}
      </h3>

      {data.length === 0 ? (
        <p className={cn('text-sm text-center py-8', styles.textSecondary)}>
          {t('ai.gpu.noHistory')}
        </p>
      ) : (
        <>
          <svg
            width="100%"
            viewBox={`0 0 ${chartWidth} ${chartHeight}`}
            preserveAspectRatio="xMidYMid meet"
            className="overflow-visible"
          >
            {/* Grid lines */}
            {yAxisLabels.map(({ value, y }) => (
              <g key={value}>
                <line
                  x1={padding.left}
                  y1={y}
                  x2={chartWidth - padding.right}
                  y2={y}
                  stroke="currentColor"
                  strokeOpacity={0.1}
                  strokeDasharray="2,2"
                />
                <text
                  x={padding.left - 8}
                  y={y + 3}
                  textAnchor="end"
                  className={cn('text-[10px]', styles.textSecondary)}
                  fill="currentColor"
                  fillOpacity={0.6}
                >
                  {value}%
                </text>
              </g>
            ))}

            {/* Time labels */}
            {timeLabels.map(({ x, label }, index) => (
              <text
                key={index}
                x={x}
                y={chartHeight - 5}
                textAnchor="middle"
                className={cn('text-[10px]', styles.textSecondary)}
                fill="currentColor"
                fillOpacity={0.6}
              >
                {label}
              </text>
            ))}

            {/* Utilization line */}
            <path
              d={utilizationPath}
              fill="none"
              stroke="#22c55e"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Temperature line */}
            <path
              d={temperaturePath}
              fill="none"
              stroke="#ef4444"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>

          {/* Legend */}
          <div className="flex justify-center gap-6 mt-2">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-green-500" />
              <span className={cn('text-xs', styles.textSecondary)}>
                {t('ai.gpu.utilization')}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-red-500" />
              <span className={cn('text-xs', styles.textSecondary)}>
                {t('ai.gpu.temperature')}
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
