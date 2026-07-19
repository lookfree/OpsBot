/**
 * Ollama Panel - Local mode connection status bar
 */

import { cn } from '@/lib/utils'
import {
  Brain,
  RefreshCw,
  Link,
  Unlink,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Play,
  Square,
  RotateCcw,
} from 'lucide-react'
import type { OllamaPanelState } from './useOllamaPanel'

type OllamaLocalStatusBarProps = Pick<
  OllamaPanelState,
  | 'isConnected'
  | 'ollamaStatus'
  | 'isControllingService'
  | 'isLoadingModels'
  | 'isConnecting'
  | 'handleStartService'
  | 'handleStopService'
  | 'handleRestartService'
  | 'fetchOllamaModels'
  | 'handleDisconnect'
  | 'setShowConnectDialog'
  | 'styles'
  | 't'
>

export function OllamaLocalStatusBar({
  isConnected,
  ollamaStatus,
  isControllingService,
  isLoadingModels,
  isConnecting,
  handleStartService,
  handleStopService,
  handleRestartService,
  fetchOllamaModels,
  handleDisconnect,
  setShowConnectDialog,
  styles,
  t,
}: OllamaLocalStatusBarProps) {
  return (
    <div className={cn('flex items-center justify-between p-3 rounded-lg border', styles.bgSecondary, styles.borderColor)}>
      <div className="flex items-center gap-3">
        <Brain className={cn('w-5 h-5', styles.textPrimary)} />
        <div className="flex items-center gap-2">
          <span className={cn('font-medium', styles.textPrimary)}>Ollama</span>
          {isConnected ? (
            <>
              <CheckCircle2 className={cn('w-4 h-4', styles.successText)} />
              <span className={cn('text-sm', styles.textSecondary)}>
                {t('ai.status.connected')} - v{ollamaStatus?.version}
              </span>
              <span className={cn('text-xs', styles.textSecondary)}>
                ({ollamaStatus?.host}:{ollamaStatus?.port})
              </span>
            </>
          ) : (
            <>
              <AlertCircle className={cn('w-4 h-4', styles.textSecondary)} />
              <span className={cn('text-sm', styles.textSecondary)}>{t('ai.status.disconnected')}</span>
            </>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        {/* Service Control Buttons */}
        <div className="flex items-center gap-1 mr-2 pr-2 border-r border-gray-600">
          <button
            className={cn('flex items-center gap-1 px-2 py-1.5 text-sm rounded transition-colors', styles.hoverBg, styles.successText)}
            onClick={handleStartService}
            disabled={isControllingService}
            title={t('ai.service.start')}
          >
            {isControllingService ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          </button>
          <button
            className={cn('flex items-center gap-1 px-2 py-1.5 text-sm rounded transition-colors', styles.hoverBg, styles.errorText)}
            onClick={handleStopService}
            disabled={isControllingService}
            title={t('ai.service.stop')}
          >
            <Square className="w-4 h-4" />
          </button>
          <button
            className={cn('flex items-center gap-1 px-2 py-1.5 text-sm rounded transition-colors', styles.hoverBg, styles.textSecondary)}
            onClick={handleRestartService}
            disabled={isControllingService}
            title={t('ai.service.restart')}
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>

        {/* Connection Controls */}
        {isConnected ? (
          <>
            <button
              className={cn('flex items-center gap-1 px-3 py-1.5 text-sm rounded transition-colors', styles.hoverBg, styles.textSecondary)}
              onClick={fetchOllamaModels}
              disabled={isLoadingModels}
            >
              <RefreshCw className={cn('w-4 h-4', isLoadingModels && 'animate-spin')} />
              {t('common.refresh')}
            </button>
            <button
              className={cn('flex items-center gap-1 px-3 py-1.5 text-sm rounded transition-colors', styles.hoverBg, styles.errorText)}
              onClick={handleDisconnect}
            >
              <Unlink className="w-4 h-4" />
              {t('ai.disconnect')}
            </button>
          </>
        ) : (
          <button
            className="flex items-center gap-1 px-3 py-1.5 text-sm rounded transition-colors bg-blue-600 hover:bg-blue-700 text-white"
            onClick={() => setShowConnectDialog(true)}
            disabled={isConnecting}
          >
            {isConnecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link className="w-4 h-4" />}
            {t('ai.connect')}
          </button>
        )}
      </div>
    </div>
  )
}
