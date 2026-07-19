/**
 * API Config Dialog - Default Model input + Enabled toggle
 */

import { cn } from '@/lib/utils'
import type { ApiConfigDialogState } from './useApiConfigDialog'

type ApiConfigModelFieldsProps = Pick<
  ApiConfigDialogState,
  'defaultModel' | 'setDefaultModel' | 'provider' | 'enabled' | 'setEnabled' | 'styles' | 't'
>

export function ApiConfigModelFields({
  defaultModel,
  setDefaultModel,
  provider,
  enabled,
  setEnabled,
  styles,
  t,
}: ApiConfigModelFieldsProps) {
  return (
    <>
      {/* Default Model */}
      <div>
        <label className={cn('block text-sm font-medium mb-2', styles.textPrimary)}>
          {t('ai.cloudApi.defaultModel')}
        </label>
        <input
          type="text"
          value={defaultModel}
          onChange={(e) => setDefaultModel(e.target.value)}
          placeholder={
            provider === 'openai'
              ? 'gpt-4o'
              : provider === 'claude'
                ? 'claude-3-5-sonnet-20241022'
                : provider === 'qwen'
                  ? 'qwen-max'
                  : ''
          }
          className={cn(
            'w-full px-3 py-2 rounded border text-sm',
            styles.inputBg,
            styles.borderColor,
            styles.textPrimary,
            'focus:outline-none focus:ring-2 focus:ring-blue-500'
          )}
        />
      </div>

      {/* Enabled */}
      <div className="flex items-center gap-3">
        <label className={cn('text-sm font-medium', styles.textPrimary)}>
          {t('common.enabled')}
        </label>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          onClick={() => setEnabled(!enabled)}
          className={cn(
            'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
            enabled ? 'bg-blue-600' : 'bg-gray-600'
          )}
        >
          <span
            className={cn(
              'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
              enabled ? 'translate-x-6' : 'translate-x-1'
            )}
          />
        </button>
      </div>
    </>
  )
}
