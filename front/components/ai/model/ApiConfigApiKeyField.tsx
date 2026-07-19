/**
 * API Config Dialog - API Key input (with show/hide toggle)
 */

import { cn } from '@/lib/utils'
import { Eye, EyeOff } from 'lucide-react'
import type { ApiConfigDialogState } from './useApiConfigDialog'

type ApiConfigApiKeyFieldProps = Pick<
  ApiConfigDialogState,
  'apiKey' | 'setApiKey' | 'showApiKey' | 'setShowApiKey' | 'styles' | 't'
>

export function ApiConfigApiKeyField({
  apiKey,
  setApiKey,
  showApiKey,
  setShowApiKey,
  styles,
  t,
}: ApiConfigApiKeyFieldProps) {
  return (
    <div>
      <label className={cn('block text-sm font-medium mb-2', styles.textPrimary)}>
        {t('ai.cloudApi.apiKey')}
      </label>
      <div className="relative">
        <input
          type={showApiKey ? 'text' : 'password'}
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="sk-..."
          className={cn(
            'w-full px-3 py-2 pr-10 rounded border text-sm',
            styles.inputBg,
            styles.borderColor,
            styles.textPrimary,
            'focus:outline-none focus:ring-2 focus:ring-blue-500'
          )}
        />
        <button
          type="button"
          className={cn('absolute right-2 top-1/2 -translate-y-1/2', styles.textSecondary)}
          onClick={() => setShowApiKey(!showApiKey)}
        >
          {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
    </div>
  )
}
