/**
 * Remote Connection Selector Component
 *
 * Allows selecting SSH connections for remote AI management.
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { invoke } from '@tauri-apps/api/core'
import { cn } from '@/lib/utils'
import { useConnectionStore } from '@/stores'
import { ModuleType, SSHConnection } from '@/types'
import {
  Server,
  ChevronDown,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Cpu,
  HardDrive,
} from 'lucide-react'
import type { RemoteAiEnvironment } from '@/types/ai'

interface RemoteConnectionSelectorProps {
  value?: string
  onChange?: (connectionId: string | undefined) => void
  onEnvironmentDetected?: (env: RemoteAiEnvironment | null) => void
  className?: string
  disabled?: boolean
}

export function RemoteConnectionSelector({
  value,
  onChange,
  onEnvironmentDetected,
  className,
  disabled,
}: RemoteConnectionSelectorProps) {
  const { t } = useTranslation()
  const { connections, connectionStatus } = useConnectionStore()

  const [isOpen, setIsOpen] = useState(false)
  const [isDetecting, setIsDetecting] = useState(false)
  const [environment, setEnvironment] = useState<RemoteAiEnvironment | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Connection id we've already run detection for (success OR failure), so a
  // failed detection doesn't re-trigger the effect in an endless loop.
  const detectedForRef = useRef<string | null>(null)

  // Filter SSH connections
  const sshConnections = useMemo(() => {
    return connections.filter(
      (conn) => conn.moduleType === ModuleType.SSH
    ) as SSHConnection[]
  }, [connections])

  // Get selected connection
  const selectedConnection = useMemo(() => {
    return sshConnections.find((conn) => conn.id === value)
  }, [sshConnections, value])

  // Get connection status
  const getStatus = useCallback(
    (connId: string) => {
      return connectionStatus[connId]
    },
    [connectionStatus]
  )

  // Detect AI environment when connection changes
  const detectEnvironment = useCallback(async (connectionId: string) => {
    // Mark this connection as attempted up front so a failure doesn't re-fire.
    detectedForRef.current = connectionId
    setIsDetecting(true)
    setError(null)
    setEnvironment(null)

    try {
      const env = await invoke<RemoteAiEnvironment>('ai_remote_detect_environment', {
        sshConnectionId: connectionId,
      })
      setEnvironment(env)
      onEnvironmentDetected?.(env)
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      setError(errorMsg)
      onEnvironmentDetected?.(null)
    } finally {
      setIsDetecting(false)
    }
  }, [onEnvironmentDetected])

  // Handle connection selection
  const handleSelect = useCallback(
    (connectionId: string) => {
      onChange?.(connectionId)
      setIsOpen(false)

      // Check if connection is connected
      const status = getStatus(connectionId)
      if (status === 'connected') {
        detectEnvironment(connectionId)
      } else {
        setEnvironment(null)
        setError(t('ai.remote.notConnected', 'SSH connection is not active'))
        onEnvironmentDetected?.(null)
      }
    },
    [onChange, getStatus, detectEnvironment, onEnvironmentDetected, t]
  )

  // Clear selection
  const handleClear = useCallback(() => {
    onChange?.(undefined)
    setEnvironment(null)
    setError(null)
    onEnvironmentDetected?.(null)
  }, [onChange, onEnvironmentDetected])

  // Re-detect when connection status changes
  useEffect(() => {
    if (!value) return
    const status = getStatus(value)
    if (status === 'connected') {
      // Detect once per connection; detectedForRef is set even on failure, so a
      // failed detection no longer loops (previously !environment stayed true).
      if (detectedForRef.current !== value && !isDetecting) {
        detectEnvironment(value)
      }
    } else {
      // Not connected: reset so a later reconnect re-detects.
      detectedForRef.current = null
      setEnvironment(null)
      if (!error) {
        setError(t('ai.remote.notConnected', 'SSH connection is not active'))
      }
    }
  }, [value, getStatus, isDetecting, detectEnvironment, error, t])

  return (
    <div className={cn('space-y-3', className)}>
      {/* Selector */}
      <div className="relative">
        <button
          type="button"
          onClick={() => !disabled && setIsOpen(!isOpen)}
          disabled={disabled}
          className={cn(
            'w-full flex items-center justify-between px-3 py-2 rounded-md',
            'border border-border bg-background text-foreground',
            'hover:bg-muted transition-colors',
            'disabled:opacity-50 disabled:cursor-not-allowed'
          )}
        >
          <div className="flex items-center gap-2">
            <Server className="h-4 w-4 text-muted-foreground" />
            {selectedConnection ? (
              <span className="truncate">
                {selectedConnection.name} ({selectedConnection.host})
              </span>
            ) : (
              <span className="text-muted-foreground">
                {t('ai.remote.selectConnection', 'Select SSH connection')}
              </span>
            )}
          </div>
          <ChevronDown
            className={cn(
              'h-4 w-4 text-muted-foreground transition-transform',
              isOpen && 'rotate-180'
            )}
          />
        </button>

        {/* Dropdown */}
        {isOpen && (
          <div className="absolute z-50 w-full mt-1 rounded-md border border-border bg-popover shadow-lg">
            <div className="max-h-60 overflow-y-auto p-1">
              {sshConnections.length === 0 ? (
                <div className="px-3 py-2 text-sm text-muted-foreground">
                  {t('ai.remote.noConnections', 'No SSH connections available')}
                </div>
              ) : (
                <>
                  {/* Clear option */}
                  {value && (
                    <button
                      type="button"
                      onClick={handleClear}
                      className={cn(
                        'w-full flex items-center gap-2 px-3 py-2 text-sm rounded-sm',
                        'text-muted-foreground hover:bg-muted'
                      )}
                    >
                      <XCircle className="h-4 w-4" />
                      {t('ai.remote.clearSelection', 'Clear selection')}
                    </button>
                  )}

                  {/* Connection list */}
                  {sshConnections.map((conn) => {
                    const status = getStatus(conn.id)
                    const isConnected = status === 'connected'

                    return (
                      <button
                        key={conn.id}
                        type="button"
                        onClick={() => handleSelect(conn.id)}
                        className={cn(
                          'w-full flex items-center justify-between px-3 py-2 text-sm rounded-sm',
                          'hover:bg-muted transition-colors',
                          value === conn.id && 'bg-muted'
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <Server className="h-4 w-4" />
                          <span className="truncate">{conn.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {conn.host}:{conn.port}
                          </span>
                        </div>
                        <div
                          className={cn(
                            'w-2 h-2 rounded-full',
                            isConnected ? 'bg-emerald-500' : 'bg-gray-400'
                          )}
                        />
                      </button>
                    )
                  })}
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Environment Status */}
      {value && (
        <div className="rounded-md border border-border bg-muted/50 p-3 space-y-2">
          <div className="text-sm font-medium text-foreground">
            {t('ai.remote.environment', 'AI Environment')}
          </div>

          {isDetecting ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">{t('ai.remote.detecting', 'Detecting...')}</span>
            </div>
          ) : error ? (
            <div className="flex items-center gap-2 text-amber-500">
              <AlertTriangle className="h-4 w-4" />
              <span className="text-sm">{error}</span>
            </div>
          ) : environment ? (
            <div className="grid grid-cols-2 gap-2 text-xs">
              {/* Ollama Status */}
              <div className="flex items-center gap-1.5">
                {environment.ollamaInstalled ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                ) : (
                  <XCircle className="h-3.5 w-3.5 text-gray-400" />
                )}
                <span>Ollama {environment.ollamaVersion || ''}</span>
              </div>

              {/* TensorRT Status */}
              <div className="flex items-center gap-1.5">
                {environment.tensorrtInstalled ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                ) : (
                  <XCircle className="h-3.5 w-3.5 text-gray-400" />
                )}
                <span>TensorRT-LLM</span>
              </div>

              {/* GPU Status */}
              <div className="flex items-center gap-1.5 col-span-2">
                {environment.nvidiaGpuDetected ? (
                  <>
                    <Cpu className="h-3.5 w-3.5 text-emerald-500" />
                    <span>
                      NVIDIA GPU ({environment.gpuCount}{' '}
                      {environment.gpuCount === 1 ? 'GPU' : 'GPUs'})
                    </span>
                  </>
                ) : (
                  <>
                    <HardDrive className="h-3.5 w-3.5 text-gray-400" />
                    <span className="text-muted-foreground">
                      {t('ai.remote.noGpu', 'No NVIDIA GPU detected')}
                    </span>
                  </>
                )}
              </div>
            </div>
          ) : null}
        </div>
      )}

      {/* Close dropdown on outside click */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setIsOpen(false)}
        />
      )}
    </div>
  )
}
