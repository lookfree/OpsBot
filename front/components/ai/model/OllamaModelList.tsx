/**
 * Ollama Model List Component
 *
 * Displays list of installed Ollama models with actions.
 */

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import {
  Trash2,
  Loader2,
  Package,
  Clock,
  HardDrive,
} from 'lucide-react'
import type { OllamaModel } from '@/types'
import { formatModelSize, formatModelTime } from '@/types'
import { useAiStyles } from '../hooks'
import { confirm as confirmDialog } from '@tauri-apps/plugin-dialog'

interface OllamaModelListProps {
  models: OllamaModel[]
  isLoading: boolean
  isPulling: boolean
  pullingModelName: string | null
  onDelete: (modelName: string) => Promise<void>
  isRemote?: boolean
}

export function OllamaModelList({
  models,
  isLoading,
  isPulling,
  pullingModelName,
  onDelete,
  isRemote = false,
}: OllamaModelListProps) {
  const { t } = useTranslation()
  const styles = useAiStyles()

  const [deletingModel, setDeletingModel] = useState<string | null>(null)

  // Handle delete with confirmation
  const handleDelete = async (modelName: string) => {
    if (deletingModel) return

    const confirmed = await confirmDialog(
      t('ai.model.confirmDelete', 'Are you sure you want to delete {{name}}?').replace(
        '{{name}}',
        modelName
      )
    )
    if (!confirmed) return

    setDeletingModel(modelName)
    try {
      await onDelete(modelName)
    } finally {
      setDeletingModel(null)
    }
  }

  // Loading state
  if (isLoading) {
    return (
      <div
        className={cn(
          'flex-1 flex items-center justify-center',
          styles.textSecondary
        )}
      >
        <Loader2 className="w-6 h-6 animate-spin mr-2" />
        {t('common.loading', 'Loading...')}
      </div>
    )
  }

  // Empty state
  if (models.length === 0) {
    return (
      <div
        className={cn(
          'flex-1 flex flex-col items-center justify-center gap-2',
          styles.textSecondary
        )}
      >
        <Package className="w-12 h-12 opacity-50" />
        <p>{t('ai.model.noModels', 'No models installed')}</p>
        <p className="text-sm">
          {t('ai.model.addModelHint', 'Click "Add Model" to download a model')}
        </p>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-auto">
      <table className="w-full">
        <thead>
          <tr className={cn('border-b', styles.borderColor)}>
            <th
              className={cn(
                'text-left px-4 py-2 text-sm font-medium',
                styles.textSecondary
              )}
            >
              {t('ai.model.modelName', 'Model')}
            </th>
            <th
              className={cn(
                'text-left px-4 py-2 text-sm font-medium',
                styles.textSecondary
              )}
            >
              {t('ai.model.modelSize', 'Size')}
            </th>
            <th
              className={cn(
                'text-left px-4 py-2 text-sm font-medium',
                styles.textSecondary
              )}
            >
              {t('ai.model.modifiedAt', 'Modified')}
            </th>
            {!isRemote && (
              <th
                className={cn(
                  'text-right px-4 py-2 text-sm font-medium',
                  styles.textSecondary
                )}
              >
                {t('common.actions', 'Actions')}
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {models.map((model) => {
            const isDeleting = deletingModel === model.name
            const isPullingThis = isPulling && pullingModelName === model.name

            return (
              <tr
                key={model.name}
                className={cn('border-b', styles.borderColor, styles.hoverBg)}
              >
                <td className={cn('px-4 py-3', styles.textPrimary)}>
                  <div className="flex items-center gap-2">
                    <Package className="w-4 h-4" />
                    <span className="font-medium">{model.name}</span>
                  </div>
                  {model.digest && (
                    <div className={cn('text-xs mt-1', styles.textSecondary)}>
                      {model.digest.substring(0, 12)}...
                    </div>
                  )}
                </td>
                <td className={cn('px-4 py-3', styles.textSecondary)}>
                  <div className="flex items-center gap-1">
                    <HardDrive className="w-3 h-3" />
                    <span className="text-sm">{formatModelSize(model.size)}</span>
                  </div>
                </td>
                <td className={cn('px-4 py-3', styles.textSecondary)}>
                  <div className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    <span className="text-sm">{formatModelTime(model.modifiedAt)}</span>
                  </div>
                </td>
                {!isRemote && (
                  <td className="px-4 py-3 text-right">
                    <button
                      className={cn(
                        'p-1.5 rounded transition-colors',
                        'text-red-500 hover:bg-red-500/10',
                        (isDeleting || isPullingThis) && 'opacity-50 cursor-not-allowed'
                      )}
                      onClick={() => handleDelete(model.name)}
                      disabled={isDeleting || isPullingThis}
                      title={t('ai.model.deleteModel', 'Delete Model')}
                    >
                      {isDeleting ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </button>
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>

      {/* Pulling indicator */}
      {isPulling && pullingModelName && (
        <div
          className={cn(
            'fixed bottom-4 right-4 flex items-center gap-2 px-4 py-2 rounded-lg',
            'bg-blue-600 text-white shadow-lg'
          )}
        >
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">
            {t('ai.model.pullingModel', 'Pulling {{name}}...').replace(
              '{{name}}',
              pullingModelName
            )}
          </span>
        </div>
      )}
    </div>
  )
}
