/**
 * Ollama Panel - Mode Toggle (Local / Remote)
 */

import { cn } from '@/lib/utils'
import { Monitor, Cloud } from 'lucide-react'
import type { OllamaPanelState } from './useOllamaPanel'

type OllamaModeToggleProps = Pick<
  OllamaPanelState,
  'isRemoteMode' | 'setRemoteMode' | 'styles' | 't'
>

export function OllamaModeToggle({ isRemoteMode, setRemoteMode, styles, t }: OllamaModeToggleProps) {
  return (
    <div className={cn('flex items-center gap-2 p-2 rounded-lg border', styles.bgSecondary, styles.borderColor)}>
      <span className={cn('text-sm mr-2', styles.textSecondary)}>
        {t('ai.remote.mode', 'Mode')}:
      </span>
      <button
        onClick={() => setRemoteMode(false)}
        className={cn(
          'flex items-center gap-1.5 px-3 py-1.5 text-sm rounded transition-colors',
          !isRemoteMode
            ? 'bg-blue-600 text-white'
            : cn(styles.hoverBg, styles.textSecondary)
        )}
      >
        <Monitor className="w-4 h-4" />
        {t('ai.remote.local', 'Local')}
      </button>
      <button
        onClick={() => setRemoteMode(true)}
        className={cn(
          'flex items-center gap-1.5 px-3 py-1.5 text-sm rounded transition-colors',
          isRemoteMode
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
