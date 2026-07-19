/**
 * Ollama Panel - Local mode error banner
 */

import { cn } from '@/lib/utils'
import { AlertCircle } from 'lucide-react'
import type { OllamaPanelState } from './useOllamaPanel'

type OllamaLocalErrorProps = Pick<OllamaPanelState, 'error' | 'clearError' | 'styles' | 't'>

export function OllamaLocalError({ error, clearError, styles, t }: OllamaLocalErrorProps) {
  return (
    <div className={cn('flex items-center gap-2 p-3 rounded-lg border border-red-500/50 bg-red-500/10', styles.errorText)}>
      <AlertCircle className="w-4 h-4" />
      <span className="text-sm">{error}</span>
      <button className="ml-auto text-sm underline" onClick={clearError}>
        {t('common.dismiss')}
      </button>
    </div>
  )
}
