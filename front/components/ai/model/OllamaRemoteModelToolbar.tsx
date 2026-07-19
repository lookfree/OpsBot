/**
 * Ollama Panel - Remote mode model operations toolbar
 */

import { cn } from '@/lib/utils'
import { RefreshCw } from 'lucide-react'
import type { OllamaPanelState } from './useOllamaPanel'

type OllamaRemoteModelToolbarProps = Pick<
  OllamaPanelState,
  'syncRemoteModels' | 'isRemoteSyncing' | 'styles' | 't'
>

export function OllamaRemoteModelToolbar({ syncRemoteModels, isRemoteSyncing, styles, t }: OllamaRemoteModelToolbarProps) {
  return (
    <div className="flex items-center gap-2">
      <button
        className={cn(
          'flex items-center gap-1 px-3 py-1.5 text-sm rounded transition-colors',
          styles.hoverBg,
          styles.textSecondary
        )}
        onClick={syncRemoteModels}
        disabled={isRemoteSyncing}
      >
        <RefreshCw className={cn('w-4 h-4', isRemoteSyncing && 'animate-spin')} />
        {t('ai.remote.syncModels', 'Sync Models')}
      </button>
    </div>
  )
}
