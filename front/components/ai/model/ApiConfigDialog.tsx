/**
 * API Config Dialog Component
 *
 * Dialog for creating/editing cloud API configurations.
 */

import { cn } from '@/lib/utils'
import { useApiConfigDialog, type ApiConfigDialogProps } from './useApiConfigDialog'
import { ApiConfigDialogHeader } from './ApiConfigDialogHeader'
import { ApiConfigProviderFields } from './ApiConfigProviderFields'
import { ApiConfigApiKeyField } from './ApiConfigApiKeyField'
import { ApiConfigEndpointFields } from './ApiConfigEndpointFields'
import { ApiConfigModelFields } from './ApiConfigModelFields'
import { ApiConfigTestResult } from './ApiConfigTestResult'
import { ApiConfigDialogFooter } from './ApiConfigDialogFooter'

export function ApiConfigDialog(props: ApiConfigDialogProps) {
  const m = useApiConfigDialog(props)

  if (!m.open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={() => !m.isLoading && !m.isTesting && m.onOpenChange(false)}
      />

      {/* Dialog */}
      <div className={cn('relative w-[500px] max-h-[90vh] rounded-lg shadow-xl overflow-hidden flex flex-col', m.styles.bgPrimary)}>
        {/* Header */}
        <ApiConfigDialogHeader
          config={m.config} isLoading={m.isLoading} isTesting={m.isTesting}
          onOpenChange={m.onOpenChange} styles={m.styles} t={m.t}
        />

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <ApiConfigProviderFields
            provider={m.provider} setProvider={m.setProvider} name={m.name} setName={m.setName}
            styles={m.styles} t={m.t}
          />
          <ApiConfigApiKeyField
            apiKey={m.apiKey} setApiKey={m.setApiKey} showApiKey={m.showApiKey}
            setShowApiKey={m.setShowApiKey} styles={m.styles} t={m.t}
          />
          <ApiConfigEndpointFields
            baseUrl={m.baseUrl} setBaseUrl={m.setBaseUrl} organization={m.organization}
            setOrganization={m.setOrganization} provider={m.provider} styles={m.styles} t={m.t}
          />
          <ApiConfigModelFields
            defaultModel={m.defaultModel} setDefaultModel={m.setDefaultModel} provider={m.provider}
            enabled={m.enabled} setEnabled={m.setEnabled} styles={m.styles} t={m.t}
          />
          {/* Test Result */}
          {m.testResult && <ApiConfigTestResult testResult={m.testResult} />}
        </div>

        {/* Footer */}
        <ApiConfigDialogFooter
          isTesting={m.isTesting} isLoading={m.isLoading} apiKey={m.apiKey} isValid={m.isValid}
          handleTest={m.handleTest} handleSave={m.handleSave} styles={m.styles} t={m.t}
        />
      </div>
    </div>
  )
}
