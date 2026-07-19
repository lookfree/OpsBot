/**
 * API Config Dialog - Provider select + Name input
 */

import { cn } from '@/lib/utils'
import type { CloudApiProvider } from '@/types'
import { PROVIDER_OPTIONS, type ApiConfigDialogState } from './useApiConfigDialog'

type ApiConfigProviderFieldsProps = Pick<
  ApiConfigDialogState,
  'provider' | 'setProvider' | 'name' | 'setName' | 'styles' | 't'
>

export function ApiConfigProviderFields({
  provider,
  setProvider,
  name,
  setName,
  styles,
  t,
}: ApiConfigProviderFieldsProps) {
  return (
    <>
      {/* Provider */}
      <div>
        <label className={cn('block text-sm font-medium mb-2', styles.textPrimary)}>
          {t('ai.cloudApi.provider')}
        </label>
        <select
          value={provider}
          onChange={(e) => setProvider(e.target.value as CloudApiProvider)}
          className={cn(
            'w-full px-3 py-2 rounded border text-sm',
            styles.inputBg,
            styles.borderColor,
            styles.textPrimary,
            'focus:outline-none focus:ring-2 focus:ring-blue-500'
          )}
        >
          {PROVIDER_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.icon} {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Name */}
      <div>
        <label className={cn('block text-sm font-medium mb-2', styles.textPrimary)}>
          {t('common.name')}
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={`${provider} API`}
          className={cn(
            'w-full px-3 py-2 rounded border text-sm',
            styles.inputBg,
            styles.borderColor,
            styles.textPrimary,
            'focus:outline-none focus:ring-2 focus:ring-blue-500'
          )}
        />
      </div>
    </>
  )
}
