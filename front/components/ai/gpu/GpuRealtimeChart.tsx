/**
 * GPU Realtime Chart Component
 *
 * Simple SVG-based line chart for real-time GPU metrics.
 */

import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import { TrendingUp } from 'lucide-react'
import { useAiStyles } from '../hooks'

interface DataPoint {
  timestamp: number
  value: number
}

interface GpuRealtimeChartProps {
  title: string
  data: DataPoint[]
  color?: string
  maxValue?: number
  unit?: string
  className?: string
}

export function GpuRealtimeChart({
  title,
  data,
  color = '#22c55e',
  maxValue = 100,
  unit = '%',
  className,
}: GpuRealtimeChartProps) {
  const styles = useAiStyles()

  const chartWidth = 400
  const chartHeight = 120
  const padding = { top: 10, right: 10, bottom: 20, left: 40 }
  const innerWidth = chartWidth - padding.left - padding.right
  const innerHeight = chartHeight - padding.top - padding.bottom

  const pathData = useMemo(() => {
    if (data.length === 0) return ''

    const points = data.map((point, index) => {
      const x = padding.left + (index / Math.max(data.length - 1, 1)) * innerWidth
      const y = padding.top + innerHeight - (point.value / maxValue) * innerHeight
      return `${x},${y}`
    })

    return `M ${points.join(' L ')}`
  }, [data, innerWidth, innerHeight, maxValue])

  const areaPath = useMemo(() => {
    if (data.length === 0) return ''

    const points = data.map((point, index) => {
      const x = padding.left + (index / Math.max(data.length - 1, 1)) * innerWidth
      const y = padding.top + innerHeight - (point.value / maxValue) * innerHeight
      return `${x},${y}`
    })

    const firstX = padding.left
    const lastX = padding.left + innerWidth
    const bottomY = padding.top + innerHeight

    return `M ${firstX},${bottomY} L ${points.join(' L ')} L ${lastX},${bottomY} Z`
  }, [data, innerWidth, innerHeight, maxValue])

  const currentValue = data.length > 0 ? data[data.length - 1].value : 0

  const yAxisLabels = [0, 25, 50, 75, 100].map((val) => ({
    value: val,
    y: padding.top + innerHeight - (val / 100) * innerHeight,
  }))

  return (
    <div className={cn('rounded-lg border p-3', styles.bgSecondary, styles.borderColor, className)}>
      {/* Header */}
      <div className={cn('text-sm flex items-center justify-between mb-2', styles.textPrimary)}>
        <span className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4" style={{ color }} />
          {title}
        </span>
        <span className="font-mono" style={{ color }}>
          {currentValue.toFixed(1)}{unit}
        </span>
      </div>

      {/* Chart */}
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
              x={padding.left - 5}
              y={y + 3}
              textAnchor="end"
              className={cn('text-[10px]', styles.textSecondary)}
              fill="currentColor"
              fillOpacity={0.6}
            >
              {value}
            </text>
          </g>
        ))}

        {/* Area fill */}
        {data.length > 0 && (
          <path
            d={areaPath}
            fill={color}
            fillOpacity={0.1}
          />
        )}

        {/* Line */}
        {data.length > 0 && (
          <path
            d={pathData}
            fill="none"
            stroke={color}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {/* Current value dot */}
        {data.length > 0 && (
          <circle
            cx={padding.left + innerWidth}
            cy={padding.top + innerHeight - (currentValue / maxValue) * innerHeight}
            r={4}
            fill={color}
          />
        )}
      </svg>
    </div>
  )
}
