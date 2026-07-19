/**
 * Ollama Panel - Remote mode placeholder (no SSH connection selected)
 */

import { cn } from '@/lib/utils'
import { Server } from 'lucide-react'
import type { OllamaPanelState } from './useOllamaPanel'

type OllamaRemoteNoConnectionProps = Pick<OllamaPanelState, 'styles' | 't'>

export function OllamaRemoteNoConnection({ styles, t }: OllamaRemoteNoConnectionProps) {
  return (
    <div className={cn('flex-1 flex flex-col items-center justify-center gap-4', styles.textSecondary)}>
      <Server className="w-16 h-16 opacity-50" />
      <p>{t('ai.remote.selectConnectionHint', 'Select an SSH connection to manage remote AI')}</p>
    </div>
  )
}
