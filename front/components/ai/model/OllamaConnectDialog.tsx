/**
 * Ollama Connect Dialog Component
 *
 * Dialog for connecting to Ollama service.
 */

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { X, Link, Loader2, Server } from 'lucide-react'
import { useAiStyles } from '../hooks'

interface OllamaConnectDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConnect: (host: string, port: number) => Promise<void>
  isConnecting: boolean
}

export function OllamaConnectDialog({
  open,
  onOpenChange,
  onConnect,
  isConnecting,
}: OllamaConnectDialogProps) {
  const { t } = useTranslation()
  const styles = useAiStyles()

  const [host, setHost] = useState('127.0.0.1')
  const [port, setPort] = useState('11434')
  const [error, setError] = useState<string | null>(null)

  // Handle connect
  const handleConnect = async () => {
    const trimmedHost = host.trim()
    const portNum = parseInt(port, 10)

    if (!trimmedHost) {
      setError(t('ai.ollama.enterHost', 'Please enter host address'))
      return
    }

    if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
      setError(t('ai.ollama.invalidPort', 'Please enter a valid port (1-65535)'))
      return
    }

    setError(null)
    try {
      await onConnect(trimmedHost, portNum)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  // Quick presets
  const handlePreset = (presetHost: string, presetPort: string) => {
    setHost(presetHost)
    setPort(presetPort)
    setError(null)
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={() => !isConnecting && onOpenChange(false)}
      />

      {/* Dialog */}
      <div
        className={cn(
          'relative w-[400px] rounded-lg shadow-xl overflow-hidden',
          styles.bgPrimary
        )}
      >
        {/* Header */}
        <div
          className={cn(
            'flex items-center justify-between px-4 py-3 border-b',
            styles.borderColor
          )}
        >
          <h2 className={cn('text-lg font-semibold', styles.textPrimary)}>
            {t('ai.ollama.connect', 'Connect to Ollama')}
          </h2>
          <button
            className={cn(
              'p-1 rounded transition-colors',
              styles.hoverBg,
              styles.textSecondary
            )}
            onClick={() => !isConnecting && onOpenChange(false)}
            disabled={isConnecting}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Host input */}
          <div>
            <label
              className={cn('block text-sm font-medium mb-2', styles.textPrimary)}
            >
              {t('ai.ollama.host', 'Host')}
            </label>
            <div className="relative">
              <Server
                className={cn(
                  'absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4',
                  styles.textSecondary
                )}
              />
              <input
                type="text"
                value={host}
                onChange={(e) => {
                  setHost(e.target.value)
                  setError(null)
                }}
                placeholder="127.0.0.1"
                className={cn(
                  'w-full pl-10 pr-4 py-2 rounded border text-sm',
                  styles.inputBg,
                  styles.borderColor,
                  styles.textPrimary,
                  'focus:outline-none focus:ring-2 focus:ring-blue-500'
                )}
                disabled={isConnecting}
              />
            </div>
          </div>

          {/* Port input */}
          <div>
            <label
              className={cn('block text-sm font-medium mb-2', styles.textPrimary)}
            >
              {t('ai.ollama.port', 'Port')}
            </label>
            <input
              type="text"
              value={port}
              onChange={(e) => {
                setPort(e.target.value)
                setError(null)
              }}
              placeholder="11434"
              className={cn(
                'w-full px-4 py-2 rounded border text-sm',
                styles.inputBg,
                styles.borderColor,
                styles.textPrimary,
                'focus:outline-none focus:ring-2 focus:ring-blue-500'
              )}
              disabled={isConnecting}
            />
          </div>

          {/* Quick presets */}
          <div>
            <label
              className={cn('block text-sm font-medium mb-2', styles.textSecondary)}
            >
              {t('ai.ollama.presets', 'Quick Presets')}
            </label>
            <div className="flex gap-2">
              <button
                className={cn(
                  'px-3 py-1.5 text-xs rounded border transition-colors',
                  styles.borderColor,
                  styles.hoverBg,
                  styles.textSecondary
                )}
                onClick={() => handlePreset('127.0.0.1', '11434')}
                disabled={isConnecting}
              >
                {t('ai.ollama.localhost', 'Localhost')}
              </button>
              <button
                className={cn(
                  'px-3 py-1.5 text-xs rounded border transition-colors',
                  styles.borderColor,
                  styles.hoverBg,
                  styles.textSecondary
                )}
                onClick={() => handlePreset('0.0.0.0', '11434')}
                disabled={isConnecting}
              >
                {t('ai.ollama.allInterfaces', 'All Interfaces')}
              </button>
            </div>
          </div>

          {/* Error message */}
          {error && (
            <div className="p-2 rounded bg-red-500/10 text-red-500 text-sm">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className={cn(
            'flex items-center justify-end gap-2 px-4 py-3 border-t',
            styles.borderColor
          )}
        >
          <button
            className={cn(
              'px-4 py-2 text-sm rounded transition-colors',
              styles.hoverBg,
              styles.textSecondary
            )}
            onClick={() => onOpenChange(false)}
            disabled={isConnecting}
          >
            {t('common.cancel', 'Cancel')}
          </button>
          <button
            className={cn(
              'flex items-center gap-2 px-4 py-2 text-sm rounded transition-colors',
              'bg-blue-600 hover:bg-blue-700 text-white',
              isConnecting && 'opacity-50 cursor-not-allowed'
            )}
            onClick={handleConnect}
            disabled={isConnecting}
          >
            {isConnecting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Link className="w-4 h-4" />
            )}
            {isConnecting
              ? t('ai.ollama.connecting', 'Connecting...')
              : t('ai.connect', 'Connect')}
          </button>
        </div>
      </div>
    </div>
  )
}
