/**
 * Ollama Panel - Local mode "not connected" placeholder
 */

import { cn } from '@/lib/utils'
import { Brain } from 'lucide-react'
import type { OllamaPanelState } from './useOllamaPanel'

type OllamaLocalPlaceholderProps = Pick<OllamaPanelState, 'setShowConnectDialog' | 'styles' | 't'>

export function OllamaLocalPlaceholder({ setShowConnectDialog, styles, t }: OllamaLocalPlaceholderProps) {
  return (
    <div className={cn('flex-1 flex flex-col items-center justify-center gap-4', styles.textSecondary)}>
      <Brain className="w-16 h-16 opacity-50" />
      <p>{t('ai.ollama.notConnected')}</p>
      <button
        className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
        onClick={() => setShowConnectDialog(true)}
      >
        {t('ai.connect')}
      </button>
    </div>
  )
}
