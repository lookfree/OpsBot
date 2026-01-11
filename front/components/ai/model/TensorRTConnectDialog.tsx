/**
 * TensorRT Connect Dialog
 *
 * Dialog for connecting to a TensorRT-LLM service.
 */

import { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { X, Link, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAiStyles } from '../hooks'

interface TensorRTConnectDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConnect: (host: string, port?: number) => Promise<void>
  isConnecting: boolean
}

export function TensorRTConnectDialog({
  open,
  onOpenChange,
  onConnect,
  isConnecting,
}: TensorRTConnectDialogProps) {
  const { t } = useTranslation()
  const styles = useAiStyles()

  const [host, setHost] = useState('localhost')
  const [port, setPort] = useState('8000')
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      setError(null)

      if (!host.trim()) {
        setError(t('ai.tensorrt.hostRequired'))
        return
      }

      const portNum = port ? parseInt(port, 10) : undefined
      if (port && (isNaN(portNum!) || portNum! < 1 || portNum! > 65535)) {
        setError(t('ai.tensorrt.invalidPort'))
        return
      }

      try {
        await onConnect(host.trim(), portNum)
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      }
    },
    [host, port, onConnect, t]
  )

  const handleClose = useCallback(() => {
    if (!isConnecting) {
      onOpenChange(false)
      setError(null)
    }
  }, [isConnecting, onOpenChange])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={handleClose}
      />

      {/* Dialog */}
      <div className={cn('relative w-full max-w-md rounded-lg shadow-xl border', styles.bgPrimary, styles.borderColor)}>
        {/* Header */}
        <div className={cn('flex items-center justify-between px-4 py-3 border-b', styles.borderColor)}>
          <h2 className={cn('text-lg font-medium', styles.textPrimary)}>{t('ai.tensorrt.connectTitle')}</h2>
          <button
            onClick={handleClose}
            disabled={isConnecting}
            className={cn('p-1 rounded', styles.hoverBg, styles.textSecondary)}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Host */}
          <div>
            <label className={cn('block text-sm font-medium mb-1', styles.textPrimary)}>
              {t('ai.tensorrt.host')}
            </label>
            <input
              type="text"
              value={host}
              onChange={(e) => setHost(e.target.value)}
              placeholder="localhost"
              className={cn('w-full px-3 py-2 rounded border text-sm', styles.inputBg, styles.borderColor, styles.textPrimary)}
              disabled={isConnecting}
            />
          </div>

          {/* Port */}
          <div>
            <label className={cn('block text-sm font-medium mb-1', styles.textPrimary)}>
              {t('ai.tensorrt.port')}
            </label>
            <input
              type="number"
              value={port}
              onChange={(e) => setPort(e.target.value)}
              placeholder="8000"
              className={cn('w-full px-3 py-2 rounded border text-sm', styles.inputBg, styles.borderColor, styles.textPrimary)}
              disabled={isConnecting}
            />
            <p className={cn('text-xs mt-1', styles.textSecondary)}>
              {t('ai.tensorrt.portHint')}
            </p>
          </div>

          {/* Error */}
          {error && (
            <div className="p-3 rounded bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={handleClose}
              disabled={isConnecting}
              className={cn('px-4 py-2 text-sm rounded transition-colors', styles.hoverBg, styles.textSecondary)}
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={isConnecting}
              className="flex items-center gap-1 px-4 py-2 text-sm rounded transition-colors bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
            >
              {isConnecting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{t('ai.common.connecting')}</span>
                </>
              ) : (
                <>
                  <Link className="w-4 h-4" />
                  <span>{t('ai.common.connect')}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
