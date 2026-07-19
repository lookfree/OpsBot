/**
 * API Config Dialog - Footer (test + save buttons)
 */

import { cn } from '@/lib/utils'
import { Loader2 } from 'lucide-react'
import type { ApiConfigDialogState } from './useApiConfigDialog'

type ApiConfigDialogFooterProps = Pick<
  ApiConfigDialogState,
  'isTesting' | 'isLoading' | 'apiKey' | 'isValid' | 'handleTest' | 'handleSave' | 'styles' | 't'
>

export function ApiConfigDialogFooter({
  isTesting,
  isLoading,
  apiKey,
  isValid,
  handleTest,
  handleSave,
  styles,
  t,
}: ApiConfigDialogFooterProps) {
  return (
    <div className={cn('flex items-center justify-end gap-2 px-4 py-3 border-t', styles.borderColor)}>
      <button
        className={cn(
          'px-4 py-2 text-sm rounded transition-colors border',
          styles.borderColor,
          styles.hoverBg,
          styles.textSecondary
        )}
        onClick={handleTest}
        disabled={isTesting || !apiKey}
      >
        {isTesting ? (
          <span className="flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            {t('ai.cloudApi.testing')}
          </span>
        ) : (
          t('ai.cloudApi.testConnection')
        )}
      </button>
      <button
        className={cn(
          'px-4 py-2 text-sm rounded transition-colors',
          'bg-blue-600 hover:bg-blue-700 text-white',
          (!isValid || isLoading) && 'opacity-50 cursor-not-allowed'
        )}
        onClick={handleSave}
        disabled={!isValid || isLoading}
      >
        {isLoading ? (
          <span className="flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            {t('common.saving')}
          </span>
        ) : (
          t('common.save')
        )}
      </button>
    </div>
  )
}
