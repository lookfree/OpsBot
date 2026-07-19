/**
 * GPU Monitor - Error banner
 */

import { cn } from '@/lib/utils'
import { AlertCircle } from 'lucide-react'
import type { GpuMonitor } from './useGpuMonitor'

type GpuErrorBannerProps = Pick<
  GpuMonitor,
  'currentError' | 'isGpuRemoteMode' | 'clearRemoteGpuError' | 'styles' | 't'
>

export function GpuErrorBanner({ currentError, isGpuRemoteMode, clearRemoteGpuError, styles, t }: GpuErrorBannerProps) {
  return (
    <div className={cn('flex items-center gap-2 p-3 rounded-lg border border-red-500/50 bg-red-500/10 mb-4', styles.errorText)}>
      <AlertCircle className="w-4 h-4" />
      <span className="text-sm">{currentError}</span>
      <button
        className="ml-auto text-sm underline"
        onClick={() => isGpuRemoteMode ? clearRemoteGpuError() : undefined}
      >
        {t('common.dismiss')}
      </button>
    </div>
  )
}
