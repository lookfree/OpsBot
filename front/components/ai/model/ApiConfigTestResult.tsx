/**
 * API Config Dialog - Connection test result banner
 */

import { cn } from '@/lib/utils'
import { CheckCircle2, XCircle } from 'lucide-react'
import type { ApiConfigDialogState } from './useApiConfigDialog'

type ApiConfigTestResultProps = {
  testResult: NonNullable<ApiConfigDialogState['testResult']>
}

export function ApiConfigTestResult({ testResult }: ApiConfigTestResultProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 p-3 rounded-lg text-sm',
        testResult.success ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'
      )}
    >
      {testResult.success ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
      <span>{testResult.message}</span>
      {testResult.latencyMs && (
        <span className="ml-auto opacity-60">{testResult.latencyMs}ms</span>
      )}
    </div>
  )
}
