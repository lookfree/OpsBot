/**
 * GPU Monitor - Mode Toggle (Local / Remote)
 */

import { cn } from '@/lib/utils'
import { Monitor, Cloud } from 'lucide-react'
import type { GpuMonitor } from './useGpuMonitor'

type GpuModeToggleProps = Pick<
  GpuMonitor,
  'isGpuRemoteMode' | 'setGpuRemoteMode' | 'styles' | 't'
>

export function GpuModeToggle({ isGpuRemoteMode, setGpuRemoteMode, styles, t }: GpuModeToggleProps) {
  return (
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
  )
}
