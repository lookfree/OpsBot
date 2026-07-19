/**
 * Ollama Panel - Remote mode placeholder (Ollama not installed on server)
 */

import { cn } from '@/lib/utils'
import { AlertCircle } from 'lucide-react'
import type { OllamaPanelState } from './useOllamaPanel'

type OllamaRemoteNoOllamaProps = Pick<OllamaPanelState, 'styles' | 't'>

export function OllamaRemoteNoOllama({ styles, t }: OllamaRemoteNoOllamaProps) {
  return (
    <div className={cn('flex-1 flex flex-col items-center justify-center gap-4', styles.textSecondary)}>
      <AlertCircle className="w-16 h-16 opacity-50" />
      <p>{t('ai.remote.noOllama', 'Ollama is not installed on the remote server')}</p>
    </div>
  )
}
