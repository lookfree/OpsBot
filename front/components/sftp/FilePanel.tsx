/**
 * File Panel Component
 *
 * Main SFTP file browser panel that integrates with SSH terminal.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  FolderIcon,
  FileIcon,
  HomeIcon,
  RefreshCwIcon,
  XIcon,
  ChevronUpIcon,
  PlusIcon,
  Trash2Icon,
  PencilIcon,
  DownloadIcon,
  UploadIcon,
  ListIcon,
  FileEditIcon,
  FolderPlusIcon,
} from 'lucide-react'
import * as ContextMenu from '@radix-ui/react-context-menu'
import { cn } from '@/lib/utils'
import { save, open } from '@tauri-apps/plugin-dialog'
import {
  sftpOpen,
  sftpListDir,
  sftpGetCurrentPath,
  sftpMkdir,
  sftpRemoveFile,
  sftpRemoveDir,
  sftpRename,
  sftpDownload,
  sftpUpload,
  sftpStat,
  FileEntry,
  formatFileSize,
} from '@/services/sftp'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { InputDialog } from '@/components/common/InputDialog'
import { TransferQueue } from './TransferQueue'
import { FileEditor } from './FileEditor'
import { useTranslation } from 'react-i18next'

interface FilePanelProps {
  sessionId: string
  visible: boolean
  onClose: () => void
}

export function FilePanel({ sessionId, visible, onClose }: FilePanelProps) {
  const { t } = useTranslation()
  const [currentPath, setCurrentPath] = useState('/')
  const [files, setFiles] = useState<FileEntry[]>([])
  const [selectedFile, setSelectedFile] = useState<FileEntry | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [initialized, setInitialized] = useState(false)
  const [showTransfers, setShowTransfers] = useState(false)
  const [editingFile, setEditingFile] = useState<FileEntry | null>(null)
  // 右键菜单目标：null 表示空白区域，FileEntry 表示文件/文件夹
  const [contextTarget, setContextTarget] = useState<FileEntry | null>(null)
  // 使用 ref 来同步追踪右键目标，避免状态更新延迟问题
  const contextTargetRef = useRef<FileEntry | null>(null)

  // Dialog states
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean
    title: string
    message: string
    onConfirm: () => void
  }>({ open: false, title: '', message: '', onConfirm: () => {} })

  const [inputDialog, setInputDialog] = useState<{
    open: boolean
    title: string
    defaultValue: string
    onConfirm: (value: string) => void
  }>({ open: false, title: '', defaultValue: '', onConfirm: () => {} })

  // Initialize SFTP session
  const initSftp = useCallback(async () => {
    if (!sessionId || initialized) return

    setLoading(true)
    setError(null)

    try {
      await sftpOpen(sessionId)
      const path = await sftpGetCurrentPath(sessionId)
      setCurrentPath(path)
      const entries = await sftpListDir(sessionId, path)
      setFiles(entries)
      setInitialized(true)
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }, [sessionId, initialized])

  // Initialize when panel becomes visible
  useEffect(() => {
    if (visible && !initialized) {
      initSftp()
    }
  }, [visible, initialized, initSftp])

  // Load directory
  const loadDirectory = useCallback(
    async (path: string) => {
      if (!sessionId) return

      setLoading(true)
      setError(null)
      setSelectedFile(null)

      try {
        const entries = await sftpListDir(sessionId, path)
        setFiles(entries)
        setCurrentPath(path)
      } catch (err) {
        setError(String(err))
      } finally {
        setLoading(false)
      }
    },
    [sessionId]
  )

  // Refresh current directory
  const refresh = useCallback(() => {
    loadDirectory(currentPath)
  }, [loadDirectory, currentPath])

  // Navigate to parent directory
  const goUp = useCallback(() => {
    if (currentPath === '/') return
    const parent = currentPath.split('/').slice(0, -1).join('/') || '/'
    loadDirectory(parent)
  }, [currentPath, loadDirectory])

  // Navigate to home directory
  const goHome = useCallback(async () => {
    if (!sessionId) return
    try {
      const home = await sftpGetCurrentPath(sessionId)
      loadDirectory(home)
    } catch {
      loadDirectory('/')
    }
  }, [sessionId, loadDirectory])

  // Handle file/folder click
  const handleItemClick = useCallback(
    (entry: FileEntry) => {
      if (entry.is_dir) {
        loadDirectory(entry.path)
      } else {
        setSelectedFile(entry)
      }
    },
    [loadDirectory]
  )

  // Create new folder
  const handleCreateFolder = useCallback(() => {
    setInputDialog({
      open: true,
      title: t('sftp.newFolderName'),
      defaultValue: '',
      onConfirm: async (name) => {
        if (!name.trim()) return
        try {
          const newPath = `${currentPath}/${name}`.replace('//', '/')
          await sftpMkdir(sessionId, newPath)
          refresh()
        } catch (err) {
          setError(String(err))
        }
      },
    })
  }, [sessionId, currentPath, refresh, t])

  // Delete file or folder
  const handleDelete = useCallback(
    (entry: FileEntry) => {
      setConfirmDialog({
        open: true,
        title: t('sftp.confirmDelete'),
        message: t('sftp.confirmDeleteMessage', { name: entry.name }),
        onConfirm: async () => {
          try {
            if (entry.is_dir) {
              await sftpRemoveDir(sessionId, entry.path)
            } else {
              await sftpRemoveFile(sessionId, entry.path)
            }
            refresh()
          } catch (err) {
            setError(String(err))
          }
        },
      })
    },
    [sessionId, refresh, t]
  )

  // Rename file or folder
  const handleRename = useCallback(
    (entry: FileEntry) => {
      setInputDialog({
        open: true,
        title: t('sftp.rename'),
        defaultValue: entry.name,
        onConfirm: async (newName) => {
          if (!newName.trim() || newName === entry.name) return
          try {
            const parentPath = entry.path.split('/').slice(0, -1).join('/') || '/'
            const newPath = `${parentPath}/${newName}`.replace('//', '/')
            await sftpRename(sessionId, entry.path, newPath)
            refresh()
          } catch (err) {
            setError(String(err))
          }
        },
      })
    },
    [sessionId, refresh, t]
  )

  // Download file
  const handleDownload = useCallback(
    async (entry: FileEntry) => {
      if (entry.is_dir) return

      try {
        const localPath = await save({
          defaultPath: entry.name,
          title: t('sftp.download'),
        })

        if (!localPath) return

        setLoading(true)
        await sftpDownload(sessionId, entry.path, localPath)
        setError(null)
      } catch (err) {
        setError(String(err))
      } finally {
        setLoading(false)
      }
    },
    [sessionId, t]
  )

  // Upload file
  const handleUpload = useCallback(async () => {
    try {
      const selected = await open({
        multiple: false,
        title: t('sftp.upload'),
      })

      if (!selected) return

      // Tauri v2 dialog returns string | null when multiple is false
      const localPath = selected as string
      const fileName = localPath.split('/').pop() || localPath.split('\\').pop() || 'file'
      const remotePath = `${currentPath}/${fileName}`.replace('//', '/')

      // Check if remote file already exists
      let shouldResume = false
      try {
        const existingFile = await sftpStat(sessionId, remotePath)
        if (!existingFile.is_dir && existingFile.size > 0) {
          // File exists, ask user if they want to resume
          setConfirmDialog({
            open: true,
            title: t('sftp.fileExists'),
            message: t('sftp.fileExistsMessage', {
              name: fileName,
              size: formatFileSize(existingFile.size),
            }),
            onConfirm: async () => {
              // Resume upload
              setShowTransfers(true)
              try {
                await sftpUpload(sessionId, localPath, remotePath, true)
                refresh()
              } catch (err) {
                setError(String(err))
              }
            },
          })
          return
        }
      } catch {
        // File doesn't exist, proceed with normal upload
      }

      // Auto-show transfer queue when upload starts
      setShowTransfers(true)

      await sftpUpload(sessionId, localPath, remotePath, shouldResume)
      refresh()
    } catch (err) {
      setError(String(err))
    }
  }, [sessionId, currentPath, refresh, t])

  if (!visible) return null

  return (
    <div className="w-80 border-l border-zinc-700 bg-zinc-900 flex flex-col relative">
      {/* Header */}
      <div className="flex items-center justify-between p-2 border-b border-zinc-700">
        <span className="text-sm font-medium text-zinc-300 truncate flex-1">
          {currentPath}
        </span>
        <button
          onClick={onClose}
          className="p-1 hover:bg-zinc-700 rounded"
          title={t('common.close')}
        >
          <XIcon className="w-4 h-4 text-zinc-400" />
        </button>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-1 p-2 border-b border-zinc-700">
        <button
          onClick={goUp}
          disabled={currentPath === '/'}
          className="p-1.5 hover:bg-zinc-700 rounded disabled:opacity-50 disabled:cursor-not-allowed"
          title={t('sftp.goUp')}
        >
          <ChevronUpIcon className="w-4 h-4 text-zinc-400" />
        </button>
        <button
          onClick={goHome}
          className="p-1.5 hover:bg-zinc-700 rounded"
          title={t('sftp.goHome')}
        >
          <HomeIcon className="w-4 h-4 text-zinc-400" />
        </button>
        <button
          onClick={refresh}
          disabled={loading}
          className="p-1.5 hover:bg-zinc-700 rounded disabled:opacity-50"
          title={t('sftp.refresh')}
        >
          <RefreshCwIcon className={cn('w-4 h-4 text-zinc-400', loading && 'animate-spin')} />
        </button>
        <div className="flex-1" />
        <button
          onClick={handleUpload}
          disabled={loading}
          className="p-1.5 hover:bg-zinc-700 rounded disabled:opacity-50"
          title={t('sftp.upload')}
        >
          <UploadIcon className="w-4 h-4 text-zinc-400" />
        </button>
        <button
          onClick={handleCreateFolder}
          className="p-1.5 hover:bg-zinc-700 rounded"
          title={t('sftp.newFolder')}
        >
          <PlusIcon className="w-4 h-4 text-zinc-400" />
        </button>
        <button
          onClick={() => setShowTransfers(!showTransfers)}
          className={cn(
            'p-1.5 hover:bg-zinc-700 rounded',
            showTransfers && 'bg-zinc-700'
          )}
          title={t('sftp.transfers')}
        >
          <ListIcon className="w-4 h-4 text-zinc-400" />
        </button>
      </div>

      {/* Error message */}
      {error && (
        <div className="p-2 bg-red-900/50 text-red-300 text-xs">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline">
            {t('common.dismiss')}
          </button>
        </div>
      )}

      {/* File list with unified context menu */}
      <ContextMenu.Root
        onOpenChange={(open) => {
          if (open) {
            // 菜单打开时，从 ref 同步到 state
            setContextTarget(contextTargetRef.current)
          } else {
            // 菜单关闭时，重置状态
            setContextTarget(null)
            contextTargetRef.current = null
          }
        }}
      >
        <ContextMenu.Trigger asChild>
          <div
            className="flex-1 overflow-auto"
            onContextMenu={(e) => {
              // 检查是否点击在文件项上（通过 data-file-item 属性判断）
              const target = e.target as HTMLElement
              const fileItem = target.closest('[data-file-item]')
              if (!fileItem) {
                // 点击空白处，设置 ref 为 null
                contextTargetRef.current = null
              }
            }}
          >
            {loading && files.length === 0 ? (
              <div className="flex items-center justify-center h-32 text-zinc-500">
                {t('common.loading')}
              </div>
            ) : files.length === 0 ? (
              <div className="flex items-center justify-center h-32 text-zinc-500">
                {t('sftp.emptyDirectory')}
              </div>
            ) : (
              <div className="divide-y divide-zinc-800">
                {files.map((entry) => (
                  <div
                    key={entry.path}
                    data-file-item
                    className={cn(
                      'flex items-center gap-2 px-2 py-1.5 cursor-pointer hover:bg-zinc-800',
                      selectedFile?.path === entry.path && 'bg-zinc-700'
                    )}
                    onClick={() => handleItemClick(entry)}
                    onDoubleClick={() => entry.is_dir && loadDirectory(entry.path)}
                    onContextMenu={() => {
                      // 点击文件/文件夹，设置 ref 为该项
                      contextTargetRef.current = entry
                      setSelectedFile(entry)
                    }}
                  >
                    {entry.is_dir ? (
                      <FolderIcon className="w-4 h-4 text-yellow-500 flex-shrink-0" />
                    ) : (
                      <FileIcon className="w-4 h-4 text-zinc-400 flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-zinc-300 truncate">{entry.name}</div>
                      <div className="text-xs text-zinc-500 flex gap-2">
                        <span>{entry.modified}</span>
                        {!entry.is_dir && <span>{formatFileSize(entry.size)}</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </ContextMenu.Trigger>

        <ContextMenu.Portal>
          <ContextMenu.Content className="min-w-[180px] bg-zinc-800 border border-zinc-700 rounded-md p-1 shadow-lg z-50">
            {/* 通用操作 - 始终显示 */}
            <ContextMenu.Item
              onSelect={refresh}
              className="flex items-center gap-2 px-2 py-1.5 text-sm text-zinc-300 rounded cursor-pointer hover:bg-zinc-700 outline-none"
            >
              <RefreshCwIcon className="w-4 h-4" />
              {t('sftp.refresh')}
            </ContextMenu.Item>

            <ContextMenu.Separator className="h-px bg-zinc-700 my-1" />

            {/* 上传/新建 - 始终显示 */}
            <ContextMenu.Item
              onSelect={handleUpload}
              className="flex items-center gap-2 px-2 py-1.5 text-sm text-zinc-300 rounded cursor-pointer hover:bg-zinc-700 outline-none"
            >
              <UploadIcon className="w-4 h-4" />
              {t('sftp.upload')}
            </ContextMenu.Item>
            <ContextMenu.Item
              onSelect={handleCreateFolder}
              className="flex items-center gap-2 px-2 py-1.5 text-sm text-zinc-300 rounded cursor-pointer hover:bg-zinc-700 outline-none"
            >
              <FolderPlusIcon className="w-4 h-4" />
              {t('sftp.newFolder')}
            </ContextMenu.Item>

            {/* 文件/文件夹特定操作 - 仅在选中项目时显示 */}
            {contextTarget && (
              <>
                <ContextMenu.Separator className="h-px bg-zinc-700 my-1" />

                {/* 文件特定操作 */}
                {!contextTarget.is_dir && (
                  <>
                    <ContextMenu.Item
                      onSelect={() => setEditingFile(contextTarget)}
                      className="flex items-center gap-2 px-2 py-1.5 text-sm text-zinc-300 rounded cursor-pointer hover:bg-zinc-700 outline-none"
                    >
                      <FileEditIcon className="w-4 h-4" />
                      {t('sftp.edit')}
                    </ContextMenu.Item>
                    <ContextMenu.Item
                      onSelect={() => handleDownload(contextTarget)}
                      className="flex items-center gap-2 px-2 py-1.5 text-sm text-zinc-300 rounded cursor-pointer hover:bg-zinc-700 outline-none"
                    >
                      <DownloadIcon className="w-4 h-4" />
                      {t('sftp.download')}
                    </ContextMenu.Item>
                  </>
                )}

                {/* 文件夹特定操作 - 进入目录 */}
                {contextTarget.is_dir && (
                  <ContextMenu.Item
                    onSelect={() => loadDirectory(contextTarget.path)}
                    className="flex items-center gap-2 px-2 py-1.5 text-sm text-zinc-300 rounded cursor-pointer hover:bg-zinc-700 outline-none"
                  >
                    <FolderIcon className="w-4 h-4" />
                    {t('sftp.open')}
                  </ContextMenu.Item>
                )}

                {/* 重命名 - 文件和文件夹都可以 */}
                <ContextMenu.Item
                  onSelect={() => handleRename(contextTarget)}
                  className="flex items-center gap-2 px-2 py-1.5 text-sm text-zinc-300 rounded cursor-pointer hover:bg-zinc-700 outline-none"
                >
                  <PencilIcon className="w-4 h-4" />
                  {t('sftp.rename')}
                </ContextMenu.Item>

                <ContextMenu.Separator className="h-px bg-zinc-700 my-1" />

                {/* 删除 - 文件和文件夹都可以 */}
                <ContextMenu.Item
                  onSelect={() => handleDelete(contextTarget)}
                  className="flex items-center gap-2 px-2 py-1.5 text-sm text-red-400 rounded cursor-pointer hover:bg-zinc-700 outline-none"
                >
                  <Trash2Icon className="w-4 h-4" />
                  {t('sftp.delete')}
                </ContextMenu.Item>
              </>
            )}
          </ContextMenu.Content>
        </ContextMenu.Portal>
      </ContextMenu.Root>

      {/* Transfer Queue */}
      <TransferQueue
        sessionId={sessionId}
        visible={showTransfers}
        onClose={() => setShowTransfers(false)}
      />

      {/* Dialogs */}
      <ConfirmDialog
        open={confirmDialog.open}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmDialog((prev) => ({ ...prev, open: false }))
          }
        }}
        title={confirmDialog.title}
        description={confirmDialog.message}
        variant="danger"
        onConfirm={() => {
          confirmDialog.onConfirm()
          setConfirmDialog((prev) => ({ ...prev, open: false }))
        }}
        onCancel={() => setConfirmDialog((prev) => ({ ...prev, open: false }))}
      />

      <InputDialog
        open={inputDialog.open}
        onOpenChange={(open) => {
          if (!open) {
            setInputDialog((prev) => ({ ...prev, open: false }))
          }
        }}
        title={inputDialog.title}
        defaultValue={inputDialog.defaultValue}
        onConfirm={(value) => {
          inputDialog.onConfirm(value)
          setInputDialog((prev) => ({ ...prev, open: false }))
        }}
      />

      {/* File Editor */}
      {editingFile && (
        <FileEditor
          sessionId={sessionId}
          file={editingFile}
          onClose={() => setEditingFile(null)}
        />
      )}
    </div>
  )
}
