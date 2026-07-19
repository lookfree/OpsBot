/**
 * GPU Monitor - Tabs bar (Realtime / History)
 */

import { cn } from '@/lib/utils'
import type { GpuMonitor } from './useGpuMonitor'

type GpuTabsBarProps = Pick<
  GpuMonitor,
  'activeTab' | 'setActiveTab' | 'isGpuRemoteMode' | 'styles' | 't'
>

export function GpuTabsBar({ activeTab, setActiveTab, isGpuRemoteMode, styles, t }: GpuTabsBarProps) {
  return (
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
  )
}
