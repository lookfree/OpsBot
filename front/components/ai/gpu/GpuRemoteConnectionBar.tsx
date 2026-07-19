/**
 * GPU Monitor - Remote SSH connection selector bar
 */

import { cn } from '@/lib/utils'
import { ChevronDown, Server } from 'lucide-react'
import type { GpuMonitor } from './useGpuMonitor'

type GpuRemoteConnectionBarProps = Pick<
  GpuMonitor,
  | 'sshConnections'
  | 'connectionStatus'
  | 'selectedConnection'
  | 'gpuRemoteSshConnectionId'
  | 'showConnectionSelector'
  | 'setShowConnectionSelector'
  | 'handleConnectionSelect'
  | 'styles'
  | 't'
>

export function GpuRemoteConnectionBar({
  sshConnections,
  connectionStatus,
  selectedConnection,
  gpuRemoteSshConnectionId,
  showConnectionSelector,
  setShowConnectionSelector,
  handleConnectionSelect,
  styles,
  t,
}: GpuRemoteConnectionBarProps) {
  return (
    <div className={cn('flex items-center gap-3 p-3 rounded-lg border mb-4', styles.bgSecondary, styles.borderColor)}>
      <Server className={cn('w-5 h-5', styles.textPrimary)} />
      <span className={cn('text-sm', styles.textSecondary)}>{t('ai.remote.sshConnection')}:</span>
      <div className="relative flex-1">
        <button
          onClick={() => setShowConnectionSelector(!showConnectionSelector)}
          className={cn(
            'flex items-center justify-between w-full px-3 py-2 text-sm rounded-lg border',
            styles.bgPrimary,
            styles.borderColor,
            styles.textPrimary
          )}
        >
          <span>
            {selectedConnection
              ? `${selectedConnection.name} (${selectedConnection.host})`
              : t('ai.remote.selectConnection')}
          </span>
          <ChevronDown className="w-4 h-4" />
        </button>
        {showConnectionSelector && (
          <div className={cn(
            'absolute top-full left-0 right-0 mt-1 rounded-lg border shadow-lg z-10 max-h-48 overflow-auto',
            styles.bgSecondary,
            styles.borderColor
          )}>
            {sshConnections.length === 0 ? (
              <div className={cn('px-3 py-2 text-sm', styles.textSecondary)}>
                {t('ai.remote.noConnections')}
              </div>
            ) : (
              sshConnections.map((conn) => {
                const status = connectionStatus[conn.id]
                const isConnected = status === 'connected'
                return (
                  <button
                    key={conn.id}
                    onClick={() => handleConnectionSelect(conn.id)}
                    disabled={!isConnected}
                    className={cn(
                      'w-full text-left px-3 py-2 text-sm flex items-center justify-between',
                      styles.hoverBg,
                      conn.id === gpuRemoteSshConnectionId ? styles.textPrimary : styles.textSecondary,
                      !isConnected && 'opacity-50 cursor-not-allowed'
                    )}
                  >
                    <span>{conn.name} ({conn.host})</span>
                    <span className={cn('text-xs', isConnected ? 'text-green-500' : 'text-red-500')}>
                      {isConnected ? t('common.connected') : t('common.disconnected')}
                    </span>
                  </button>
                )
              })
            )}
          </div>
        )}
      </div>
    </div>
  )
}
