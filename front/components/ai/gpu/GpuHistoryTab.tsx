/**
 * GPU Monitor - History tab content (interval selector + history chart)
 */

import { cn } from '@/lib/utils'
import { ChevronDown } from 'lucide-react'
import type { HistoryInterval } from '@/types'
import { GpuHistoryChart } from './GpuHistoryChart'
import type { GpuMonitor } from './useGpuMonitor'

type GpuHistoryTabProps = Pick<
  GpuMonitor,
  | 'gpuHistory'
  | 'historyInterval'
  | 'setHistoryInterval'
  | 'showIntervalSelector'
  | 'setShowIntervalSelector'
  | 'intervalLabels'
  | 'styles'
  | 't'
>

export function GpuHistoryTab({
  gpuHistory,
  historyInterval,
  setHistoryInterval,
  showIntervalSelector,
  setShowIntervalSelector,
  intervalLabels,
  styles,
  t,
}: GpuHistoryTabProps) {
  return (
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
  )
}
