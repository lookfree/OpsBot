/**
 * GPU Monitor - "not detected" empty state
 */

import { cn } from '@/lib/utils'
import { RefreshCw, AlertCircle } from 'lucide-react'
import type { GpuMonitor } from './useGpuMonitor'

type GpuNotDetectedProps = Pick<
  GpuMonitor,
  'isGpuRemoteMode' | 'gpuRemoteSshConnectionId' | 'currentError' | 'currentIsLoading' | 'handleRefresh' | 'styles' | 't'
>

export function GpuNotDetected({
  isGpuRemoteMode,
  gpuRemoteSshConnectionId,
  currentError,
  currentIsLoading,
  handleRefresh,
  styles,
  t,
}: GpuNotDetectedProps) {
  return (
    <div className={cn('h-full flex flex-col items-center justify-center gap-4', styles.textSecondary)}>
      <AlertCircle className="w-16 h-16 opacity-50" />
      <p className="text-lg">
        {isGpuRemoteMode
          ? (gpuRemoteSshConnectionId ? t('ai.gpu.remoteNotDetected') : t('ai.gpu.selectConnection'))
          : t('ai.gpu.notDetected')}
      </p>
      <p className="text-sm">{currentError || t('ai.gpu.noNvidiaGpu')}</p>
      {(isGpuRemoteMode ? gpuRemoteSshConnectionId : true) && (
        <button
          onClick={handleRefresh}
          disabled={currentIsLoading}
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors',
            styles.borderColor,
            styles.hoverBg
          )}
        >
          <RefreshCw className={cn('w-4 h-4', currentIsLoading && 'animate-spin')} />
          {t('ai.gpu.retry')}
        </button>
      )}
    </div>
  )
}
