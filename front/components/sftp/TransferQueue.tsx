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
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { TransferTask, formatFileSize, sftpGetTransfers, sftpCleanupTransfers } from '@/services/sftp'
import { useTranslation } from 'react-i18next'

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
    <div className="absolute bottom-0 left-0 right-0 bg-zinc-900 border-t border-zinc-700 max-h-48 overflow-hidden flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-700">
        <span className="text-xs font-medium text-zinc-300">
          {t('sftp.transfers')} ({transfers.length})
        </span>
        <div className="flex items-center gap-1">
          {hasCompletedOrFailed && (
            <button
              onClick={handleCleanup}
              className="text-xs text-zinc-400 hover:text-zinc-300 px-2 py-0.5"
            >
              {t('sftp.clearCompleted')}
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1 hover:bg-zinc-700 rounded"
            title={t('common.close')}
          >
            <XIcon className="w-3 h-3 text-zinc-400" />
          </button>
        </div>
      </div>

      {/* Transfer list */}
      <div className="flex-1 overflow-auto">
        {transfers.length === 0 ? (
          <div className="flex items-center justify-center h-16 text-zinc-500 text-xs">
            {t('sftp.noTransfers')}
          </div>
        ) : (
          <div className="divide-y divide-zinc-800">
            {transfers.map((task) => (
              <TransferItem key={task.id} task={task} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

interface TransferItemProps {
  task: TransferTask
}

function TransferItem({ task }: TransferItemProps) {
  const progress = task.total > 0 ? (task.transferred / task.total) * 100 : 0
  const isUploading = task.direction === 'Upload'

  const StatusIcon = () => {
    switch (task.status) {
      case 'Completed':
        return <CheckCircleIcon className="w-4 h-4 text-green-500" />
      case 'Failed':
        return <AlertCircleIcon className="w-4 h-4 text-red-500" />
      case 'InProgress':
        return <Loader2Icon className="w-4 h-4 text-blue-500 animate-spin" />
      default:
        return isUploading ? (
          <UploadIcon className="w-4 h-4 text-zinc-400" />
        ) : (
          <DownloadIcon className="w-4 h-4 text-zinc-400" />
        )
    }
  }

  return (
    <div className="px-3 py-2">
      <div className="flex items-center gap-2 mb-1">
        <StatusIcon />
        <span className="text-xs text-zinc-300 truncate flex-1">{task.filename}</span>
        <span className="text-xs text-zinc-500">
          {formatFileSize(task.transferred)} / {formatFileSize(task.total)}
        </span>
      </div>

      {task.status === 'InProgress' && (
        <div className="relative h-1 bg-zinc-700 rounded overflow-hidden">
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
        <div className="text-xs text-zinc-500 mt-1">
          {formatFileSize(task.speed)}/s
        </div>
      )}

      {task.status === 'Failed' && task.error && (
        <div className="text-xs text-red-400 mt-1 truncate">{task.error}</div>
      )}
    </div>
  )
}
