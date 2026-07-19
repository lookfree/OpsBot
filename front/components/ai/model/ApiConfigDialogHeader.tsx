/**
 * API Config Dialog - Header (title + close button)
 */

import { cn } from '@/lib/utils'
import { X, Cloud } from 'lucide-react'
import type { ApiConfigDialogState } from './useApiConfigDialog'

type ApiConfigDialogHeaderProps = Pick<
  ApiConfigDialogState,
  'config' | 'isLoading' | 'isTesting' | 'onOpenChange' | 'styles' | 't'
>

export function ApiConfigDialogHeader({
  config,
  isLoading,
  isTesting,
  onOpenChange,
  styles,
  t,
}: ApiConfigDialogHeaderProps) {
  return (
    <div className={cn('flex items-center justify-between px-4 py-3 border-b', styles.borderColor)}>
      <div className="flex items-center gap-2">
        <Cloud className={cn('w-5 h-5', styles.textPrimary)} />
        <h2 className={cn('text-lg font-semibold', styles.textPrimary)}>
          {config ? t('ai.cloudApi.editConfig') : t('ai.cloudApi.addProvider')}
        </h2>
      </div>
      <button
        className={cn('p-1 rounded transition-colors', styles.hoverBg, styles.textSecondary)}
        onClick={() => !isLoading && !isTesting && onOpenChange(false)}
        disabled={isLoading || isTesting}
      >
        <X className="w-5 h-5" />
      </button>
    </div>
  )
}
