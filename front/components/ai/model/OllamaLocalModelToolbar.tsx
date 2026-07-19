/**
 * Ollama Panel - Local mode model operations toolbar
 */

import { Plus } from 'lucide-react'
import type { OllamaPanelState } from './useOllamaPanel'

type OllamaLocalModelToolbarProps = Pick<
  OllamaPanelState,
  'isPullingModel' | 'setShowAddModelDialog' | 't'
>

export function OllamaLocalModelToolbar({ isPullingModel, setShowAddModelDialog, t }: OllamaLocalModelToolbarProps) {
  return (
    <div className="flex items-center gap-2">
      <button
        className="flex items-center gap-1 px-3 py-1.5 text-sm rounded transition-colors bg-green-600 hover:bg-green-700 text-white"
        onClick={() => setShowAddModelDialog(true)}
        disabled={isPullingModel}
      >
        <Plus className="w-4 h-4" />
        {t('ai.model.addModel')}
      </button>
    </div>
  )
}
