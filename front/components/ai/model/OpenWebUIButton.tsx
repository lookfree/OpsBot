/**
 * OpenWebUI Button Component
 *
 * Detects and provides quick access to OpenWebUI installation.
 */

import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { invoke } from '@tauri-apps/api/core'
import { cn } from '@/lib/utils'
import {
  Globe,
  RefreshCw,
  ExternalLink,
  CheckCircle2,
  XCircle,
  Loader2,
  HelpCircle,
} from 'lucide-react'
import type { OpenWebUIStatus } from '@/types/ai'

const OPENWEBUI_INSTALL_GUIDE = 'https://docs.openwebui.com/getting-started/'

interface OpenWebUIButtonProps {
  className?: string
}

export function OpenWebUIButton({ className }: OpenWebUIButtonProps) {
  const { t } = useTranslation()
  const [status, setStatus] = useState<OpenWebUIStatus | null>(null)
  const [isDetecting, setIsDetecting] = useState(false)
  const [isOpening, setIsOpening] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const detectOpenWebUI = useCallback(async () => {
    setIsDetecting(true)
    setError(null)
    try {
      const result = await invoke<OpenWebUIStatus>('ai_openwebui_detect', {
        customUrl: null,
      })
      setStatus(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setStatus(null)
    } finally {
      setIsDetecting(false)
    }
  }, [])

  useEffect(() => {
    detectOpenWebUI()
  }, [detectOpenWebUI])

  const handleOpen = useCallback(async () => {
    if (!status?.url) return

    setIsOpening(true)
    try {
      await invoke('ai_openwebui_open', { url: status.url })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsOpening(false)
    }
  }, [status?.url])

  const handleOpenGuide = useCallback(() => {
    window.open(OPENWEBUI_INSTALL_GUIDE, '_blank')
  }, [])

  const getSourceLabel = (source: string): string => {
    switch (source) {
      case 'local':
        return t('ai.openwebui.sourceLocal', 'Local')
      case 'docker':
        return t('ai.openwebui.sourceDocker', 'Docker')
      default:
        return ''
    }
  }

  return (
    <div className={cn('rounded-lg border border-border bg-card p-4', className)}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Globe className="h-5 w-5 text-primary" />
          <h3 className="font-medium text-foreground">
            {t('ai.openwebui.title', 'OpenWebUI')}
          </h3>
        </div>
        <button
          onClick={detectOpenWebUI}
          disabled={isDetecting}
          className="p-1.5 rounded-md hover:bg-muted transition-colors disabled:opacity-50"
          title={t('common.refresh', 'Refresh')}
        >
          <RefreshCw className={cn('h-4 w-4', isDetecting && 'animate-spin')} />
        </button>
      </div>

      {/* Status */}
      <div className="space-y-3">
        {isDetecting && !status ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">{t('ai.openwebui.detecting', 'Detecting...')}</span>
          </div>
        ) : error ? (
          <div className="flex items-center gap-2 text-destructive">
            <XCircle className="h-4 w-4" />
            <span className="text-sm">{error}</span>
          </div>
        ) : status?.available ? (
          <>
            {/* Available Status */}
            <div className="flex items-center gap-2 text-emerald-500">
              <CheckCircle2 className="h-4 w-4" />
              <span className="text-sm font-medium">
                {t('ai.openwebui.detected', 'Detected')}
              </span>
              {status.source !== 'notfound' && (
                <span className="text-xs text-muted-foreground">
                  ({getSourceLabel(status.source)})
                </span>
              )}
            </div>

            {/* Version & URL */}
            <div className="text-xs text-muted-foreground space-y-1">
              {status.version && (
                <div>
                  {t('ai.openwebui.version', 'Version')}: {status.version}
                </div>
              )}
              {status.url && <div className="truncate">{status.url}</div>}
            </div>

            {/* Open Button */}
            <button
              onClick={handleOpen}
              disabled={isOpening}
              className={cn(
                'w-full flex items-center justify-center gap-2 px-4 py-2 rounded-md',
                'bg-primary text-primary-foreground hover:bg-primary/90',
                'transition-colors disabled:opacity-50'
              )}
            >
              {isOpening ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ExternalLink className="h-4 w-4" />
              )}
              <span>{t('ai.openwebui.open', 'Open OpenWebUI')}</span>
            </button>
          </>
        ) : (
          <>
            {/* Not Found Status */}
            <div className="flex items-center gap-2 text-muted-foreground">
              <XCircle className="h-4 w-4" />
              <span className="text-sm">
                {t('ai.openwebui.notFound', 'Not detected')}
              </span>
            </div>

            <p className="text-xs text-muted-foreground">
              {t(
                'ai.openwebui.notFoundDesc',
                'OpenWebUI is not detected locally or in Docker. Install it to get a powerful web interface for your LLMs.'
              )}
            </p>

            {/* Install Guide Button */}
            <button
              onClick={handleOpenGuide}
              className={cn(
                'w-full flex items-center justify-center gap-2 px-4 py-2 rounded-md',
                'border border-border hover:bg-muted',
                'transition-colors'
              )}
            >
              <HelpCircle className="h-4 w-4" />
              <span>{t('ai.openwebui.installGuide', 'Installation Guide')}</span>
            </button>
          </>
        )}
      </div>
    </div>
  )
}
