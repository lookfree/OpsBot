/**
 * Transfer Queue Component
 *
 * Displays ongoing file transfers with progress.
 */

import { useState, useEffect, useCallback } from 'react'
import { listen, UnlistenFn } from '@tauri-apps/api/event'
import {
  XIcon,
  CheckCircleIcon,
  AlertCircleIcon,
  UploadIcon,
  DownloadIcon,
  Loader2Icon,
  XCircleIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  TransferTask,
  formatFileSize,
  sftpGetTransfers,
  sftpCleanupTransfers,
  sftpCancelTransfer,
} from '@/services/sftp'
import { useTranslation } from 'react-i18next'
import { useThemeStore } from '@/stores'

interface TransferProgress {
  task_id: string
  transferred: number
  total: number
  speed: number
  status: 'Pending' | 'InProgress' | 'Paused' | 'Completed' | 'Failed' | 'Cancelled'
}

interface TransferQueueProps {
  sessionId: string
  visible: boolean
  onClose: () => void
}

export function TransferQueue({ sessionId, visible, onClose }: TransferQueueProps) {
  const { t } = useTranslation()
  const { theme } = useThemeStore()
  const isDark = theme === 'dark'
  const [transfers, setTransfers] = useState<TransferTask[]>([])

  // Load initial transfers
  const loadTransfers = useCallback(async () => {
    if (!sessionId) return
    try {
      const tasks = await sftpGetTransfers(sessionId)
      setTransfers(tasks)
    } catch {
      // Ignore errors
    }
  }, [sessionId])

  // Cancel a transfer
  const handleCancel = useCallback(
    async (taskId: string) => {
      if (!sessionId) return
      try {
        await sftpCancelTransfer(sessionId, taskId)
      } catch {
        // Ignore errors, the event will update the UI
      }
    },
    [sessionId]
  )

  // Listen for transfer progress events
  useEffect(() => {
    if (!sessionId) return

    loadTransfers()

    let unlisten: UnlistenFn | null = null

    const setupListener = async () => {
      unlisten = await listen<TransferProgress>(
        `sftp-transfer-${sessionId}`,
        (event) => {
          const progress = event.payload
          setTransfers((prev) => {
            const index = prev.findIndex((t) => t.id === progress.task_id)
            if (index === -1) {
              // Reload all transfers if we don't have this one
              loadTransfers()
              return prev
            }

            const updated = [...prev]
            updated[index] = {
              ...updated[index],
              transferred: progress.transferred,
              speed: progress.speed,
              status: progress.status,
            }
            return updated
          })
        }
      )
    }

    setupListener()

    return () => {
      if (unlisten) {
        unlisten()
      }
    }
  }, [sessionId, loadTransfers])

  // Cleanup completed transfers
  const handleCleanup = useCallback(async () => {
    if (!sessionId) return
    try {
      await sftpCleanupTransfers(sessionId)
      loadTransfers()
    } catch {
      // Ignore errors
    }
  }, [sessionId, loadTransfers])

  if (!visible) return null

  const hasCompletedOrFailed = transfers.some(
    (t) => t.status === 'Completed' || t.status === 'Failed' || t.status === 'Cancelled'
  )

  return (
    <div className={cn(
      "absolute bottom-0 left-0 right-0 max-h-48 overflow-hidden flex flex-col border-t",
      isDark ? "bg-dark-bg-tertiary border-dark-border" : "bg-light-bg-secondary border-light-border"
    )}>
      {/* Header */}
      <div className={cn(
        "flex items-center justify-between px-3 py-2 border-b",
        isDark ? "border-dark-border" : "border-light-border"
      )}>
        <span className={cn(
          "text-xs font-medium",
          isDark ? "text-dark-text-primary" : "text-light-text-primary"
        )}>
          {t('sftp.transfers')} ({transfers.length})
        </span>
        <div className="flex items-center gap-1">
          {hasCompletedOrFailed && (
            <button
              onClick={handleCleanup}
              className={cn(
                "text-xs px-2 py-0.5",
                isDark ? "text-dark-text-secondary hover:text-dark-text-primary" : "text-light-text-secondary hover:text-light-text-primary"
              )}
            >
              {t('sftp.clearCompleted')}
            </button>
          )}
          <button
            onClick={onClose}
            className={cn("p-1 rounded", isDark ? "hover:bg-dark-bg-hover" : "hover:bg-light-bg-hover")}
            title={t('common.close')}
          >
            <XIcon className={cn("w-3 h-3", isDark ? "text-dark-text-secondary" : "text-light-text-secondary")} />
          </button>
        </div>
      </div>

      {/* Transfer list */}
      <div className="flex-1 overflow-auto">
        {transfers.length === 0 ? (
          <div className={cn(
            "flex items-center justify-center h-16 text-xs",
            isDark ? "text-dark-text-secondary" : "text-light-text-secondary"
          )}>
            {t('sftp.noTransfers')}
          </div>
        ) : (
          <div className={cn("divide-y", isDark ? "divide-dark-border" : "divide-light-border")}>
            {transfers.map((task) => (
              <TransferItem key={task.id} task={task} onCancel={handleCancel} isDark={isDark} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

interface TransferItemProps {
  task: TransferTask
  onCancel: (taskId: string) => void
  isDark: boolean
}

function TransferItem({ task, onCancel, isDark }: TransferItemProps) {
  const { t } = useTranslation()
  const progress = task.total > 0 ? (task.transferred / task.total) * 100 : 0
  const isUploading = task.direction === 'Upload'
  const canCancel = task.status === 'InProgress' || task.status === 'Pending'

  const StatusIcon = () => {
    switch (task.status) {
      case 'Completed':
        return <CheckCircleIcon className="w-4 h-4 text-green-500" />
      case 'Failed':
        return <AlertCircleIcon className="w-4 h-4 text-red-500" />
      case 'Cancelled':
        return <XCircleIcon className={cn("w-4 h-4", isDark ? "text-dark-text-secondary" : "text-light-text-secondary")} />
      case 'InProgress':
        return <Loader2Icon className="w-4 h-4 text-blue-500 animate-spin" />
      default:
        return isUploading ? (
          <UploadIcon className={cn("w-4 h-4", isDark ? "text-dark-text-secondary" : "text-light-text-secondary")} />
        ) : (
          <DownloadIcon className={cn("w-4 h-4", isDark ? "text-dark-text-secondary" : "text-light-text-secondary")} />
        )
    }
  }

  return (
    <div className="px-3 py-2">
      <div className="flex items-center gap-2 mb-1">
        <StatusIcon />
        <span className={cn("text-xs truncate flex-1", isDark ? "text-dark-text-primary" : "text-light-text-primary")}>{task.filename}</span>
        <span className={cn("text-xs", isDark ? "text-dark-text-secondary" : "text-light-text-secondary")}>
          {formatFileSize(task.transferred)} / {formatFileSize(task.total)}
        </span>
        {canCancel && (
          <button
            onClick={() => onCancel(task.id)}
            className={cn("p-0.5 rounded", isDark ? "hover:bg-dark-bg-hover" : "hover:bg-light-bg-hover")}
            title={t('sftp.cancelTransfer')}
          >
            <XIcon className={cn("w-3 h-3 hover:text-red-400", isDark ? "text-dark-text-secondary" : "text-light-text-secondary")} />
          </button>
        )}
      </div>

      {task.status === 'InProgress' && (
        <div className={cn("relative h-1 rounded overflow-hidden", isDark ? "bg-dark-bg-hover" : "bg-light-bg-hover")}>
          <div
            className={cn(
              'absolute inset-y-0 left-0 rounded transition-all duration-300',
              isUploading ? 'bg-blue-500' : 'bg-green-500'
            )}
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      {task.status === 'InProgress' && task.speed > 0 && (
        <div className={cn("text-xs mt-1", isDark ? "text-dark-text-secondary" : "text-light-text-secondary")}>
          {formatFileSize(task.speed)}/s
        </div>
      )}

      {task.status === 'Cancelled' && (
        <div className={cn("text-xs mt-1", isDark ? "text-dark-text-secondary" : "text-light-text-secondary")}>{t('sftp.transferCancelled')}</div>
      )}

      {task.status === 'Failed' && task.error && (
        <div className="text-xs text-red-400 mt-1 truncate">{task.error}</div>
      )}
    </div>
  )
}
