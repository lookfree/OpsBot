/**
 * GPU Monitor - Header (title, GPU selector, refresh)
 */

import { cn } from '@/lib/utils'
import { RefreshCw, Monitor, ChevronDown } from 'lucide-react'
import type { GpuMonitor } from './useGpuMonitor'

type GpuMonitorHeaderProps = Pick<
  GpuMonitor,
  | 'currentGpuInfo'
  | 'selectedGpuIndex'
  | 'setSelectedGpuIndex'
  | 'showGpuSelector'
  | 'setShowGpuSelector'
  | 'isGpuRemoteMode'
  | 'selectedConnection'
  | 'currentIsLoading'
  | 'handleRefresh'
  | 'styles'
  | 't'
>

export function GpuMonitorHeader({
  currentGpuInfo,
  selectedGpuIndex,
  setSelectedGpuIndex,
  showGpuSelector,
  setShowGpuSelector,
  isGpuRemoteMode,
  selectedConnection,
  currentIsLoading,
  handleRefresh,
  styles,
  t,
}: GpuMonitorHeaderProps) {
  return (
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
  )
}
