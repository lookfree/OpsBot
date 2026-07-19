/**
 * API Config Dialog - Base URL input + Organization input (OpenAI only)
 */

import { cn } from '@/lib/utils'
import { DEFAULT_BASE_URLS, type ApiConfigDialogState } from './useApiConfigDialog'

type ApiConfigEndpointFieldsProps = Pick<
  ApiConfigDialogState,
  'baseUrl' | 'setBaseUrl' | 'organization' | 'setOrganization' | 'provider' | 'styles' | 't'
>

export function ApiConfigEndpointFields({
  baseUrl,
  setBaseUrl,
  organization,
  setOrganization,
  provider,
  styles,
  t,
}: ApiConfigEndpointFieldsProps) {
  return (
    <>
      {/* Base URL */}
      <div>
        <label className={cn('block text-sm font-medium mb-2', styles.textPrimary)}>
          {t('ai.cloudApi.baseUrl')}
        </label>
        <input
          type="text"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder={DEFAULT_BASE_URLS[provider]}
          className={cn(
            'w-full px-3 py-2 rounded border text-sm',
            styles.inputBg,
            styles.borderColor,
            styles.textPrimary,
            'focus:outline-none focus:ring-2 focus:ring-blue-500'
          )}
        />
      </div>

      {/* Organization (OpenAI only) */}
      {provider === 'openai' && (
        <div>
          <label className={cn('block text-sm font-medium mb-2', styles.textPrimary)}>
            {t('ai.cloudApi.organization')}
          </label>
          <input
            type="text"
            value={organization}
            onChange={(e) => setOrganization(e.target.value)}
            placeholder="org-..."
            className={cn(
              'w-full px-3 py-2 rounded border text-sm',
              styles.inputBg,
              styles.borderColor,
              styles.textPrimary,
              'focus:outline-none focus:ring-2 focus:ring-blue-500'
            )}
          />
        </div>
      )}
    </>
  )
}
