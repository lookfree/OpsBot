/**
 * Ollama Panel - Remote mode error banner
 */

import { cn } from '@/lib/utils'
import { AlertCircle } from 'lucide-react'
import type { OllamaPanelState } from './useOllamaPanel'

type OllamaRemoteErrorProps = Pick<OllamaPanelState, 'remoteError' | 'clearRemoteError' | 'styles' | 't'>

export function OllamaRemoteError({ remoteError, clearRemoteError, styles, t }: OllamaRemoteErrorProps) {
  return (
    <div className={cn('flex items-center gap-2 p-3 rounded-lg border border-red-500/50 bg-red-500/10', styles.errorText)}>
      <AlertCircle className="w-4 h-4" />
      <span className="text-sm">{remoteError}</span>
      <button className="ml-auto text-sm underline" onClick={clearRemoteError}>
        {t('common.dismiss')}
      </button>
    </div>
  )
}
