/**
 * Add Model Dialog Component
 *
 * Dialog for pulling new Ollama models.
 */

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { X, Download, Loader2, Search } from 'lucide-react'
import { useAiStyles } from '../hooks'

interface AddModelDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onPull: (modelName: string) => Promise<void>
  isPulling: boolean
}

// Popular models for quick selection
const POPULAR_MODELS = [
  { name: 'llama3.2:3b', description: 'Meta Llama 3.2 3B' },
  { name: 'llama3.2:1b', description: 'Meta Llama 3.2 1B' },
  { name: 'qwen2.5:7b', description: 'Alibaba Qwen 2.5 7B' },
  { name: 'qwen2.5:3b', description: 'Alibaba Qwen 2.5 3B' },
  { name: 'mistral:7b', description: 'Mistral 7B' },
  { name: 'codellama:7b', description: 'Code Llama 7B' },
  { name: 'deepseek-coder:6.7b', description: 'DeepSeek Coder 6.7B' },
  { name: 'phi3:3.8b', description: 'Microsoft Phi-3 3.8B' },
]

export function AddModelDialog({
  open,
  onOpenChange,
  onPull,
  isPulling,
}: AddModelDialogProps) {
  const { t } = useTranslation()
  const styles = useAiStyles()

  const [modelName, setModelName] = useState('')
  const [error, setError] = useState<string | null>(null)

  // Handle pull model
  const handlePull = async () => {
    const name = modelName.trim()
    if (!name) {
      setError(t('ai.model.enterModelName', 'Please enter a model name'))
      return
    }

    setError(null)
    try {
      await onPull(name)
      setModelName('')
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  // Handle quick select
  const handleQuickSelect = (name: string) => {
    setModelName(name)
    setError(null)
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={() => !isPulling && onOpenChange(false)}
      />

      {/* Dialog */}
      <div
        className={cn(
          'relative w-[500px] max-h-[80vh] rounded-lg shadow-xl overflow-hidden',
          styles.bgPrimary
        )}
      >
        {/* Header */}
        <div
          className={cn(
            'flex items-center justify-between px-4 py-3 border-b',
            styles.borderColor
          )}
        >
          <h2 className={cn('text-lg font-semibold', styles.textPrimary)}>
            {t('ai.model.addModel', 'Add Model')}
          </h2>
          <button
            className={cn(
              'p-1 rounded transition-colors',
              styles.hoverBg,
              styles.textSecondary
            )}
            onClick={() => !isPulling && onOpenChange(false)}
            disabled={isPulling}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4 overflow-auto max-h-[60vh]">
          {/* Model name input */}
          <div>
            <label
              className={cn('block text-sm font-medium mb-2', styles.textPrimary)}
            >
              {t('ai.model.modelName', 'Model Name')}
            </label>
            <div className="relative">
              <Search
                className={cn(
                  'absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4',
                  styles.textSecondary
                )}
              />
              <input
                type="text"
                value={modelName}
                onChange={(e) => {
                  setModelName(e.target.value)
                  setError(null)
                }}
                placeholder={t('ai.model.modelNamePlaceholder', 'e.g., llama3.2:3b')}
                className={cn(
                  'w-full pl-10 pr-4 py-2 rounded border text-sm',
                  styles.inputBg,
                  styles.borderColor,
                  styles.textPrimary,
                  'focus:outline-none focus:ring-2 focus:ring-blue-500'
                )}
                disabled={isPulling}
              />
            </div>
            <p className={cn('text-xs mt-1', styles.textSecondary)}>
              {t(
                'ai.model.modelNameHint',
                'Enter the model name from Ollama library (ollama.com/library)'
              )}
            </p>
          </div>

          {/* Error message */}
          {error && (
            <div className="p-2 rounded bg-red-500/10 text-red-500 text-sm">
              {error}
            </div>
          )}

          {/* Popular models */}
          <div>
            <label
              className={cn('block text-sm font-medium mb-2', styles.textPrimary)}
            >
              {t('ai.model.popularModels', 'Popular Models')}
            </label>
            <div className="grid grid-cols-2 gap-2">
              {POPULAR_MODELS.map((model) => (
                <button
                  key={model.name}
                  className={cn(
                    'flex flex-col items-start p-2 rounded border text-left transition-colors',
                    styles.borderColor,
                    styles.hoverBg,
                    modelName === model.name && 'ring-2 ring-blue-500'
                  )}
                  onClick={() => handleQuickSelect(model.name)}
                  disabled={isPulling}
                >
                  <span className={cn('text-sm font-medium', styles.textPrimary)}>
                    {model.name}
                  </span>
                  <span className={cn('text-xs', styles.textSecondary)}>
                    {model.description}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          className={cn(
            'flex items-center justify-end gap-2 px-4 py-3 border-t',
            styles.borderColor
          )}
        >
          <button
            className={cn(
              'px-4 py-2 text-sm rounded transition-colors',
              styles.hoverBg,
              styles.textSecondary
            )}
            onClick={() => onOpenChange(false)}
            disabled={isPulling}
          >
            {t('common.cancel', 'Cancel')}
          </button>
          <button
            className={cn(
              'flex items-center gap-2 px-4 py-2 text-sm rounded transition-colors',
              'bg-blue-600 hover:bg-blue-700 text-white',
              isPulling && 'opacity-50 cursor-not-allowed'
            )}
            onClick={handlePull}
            disabled={isPulling || !modelName.trim()}
          >
            {isPulling ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            {isPulling
              ? t('ai.model.pulling', 'Pulling...')
              : t('ai.model.pull', 'Pull')}
          </button>
        </div>
      </div>
    </div>
  )
}
