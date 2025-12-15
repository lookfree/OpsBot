/**
 * Rename Table Dialog Component
 *
 * Dialog for renaming a database table.
 */

import { useState, useEffect, useRef } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X, AlertTriangle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { useThemeStore } from '@/stores'
import { dbRenameTable } from '@/services/database'

interface RenameTableDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  connectionId: string
  database: string
  tableName: string
  onSuccess: () => void
}

export function RenameTableDialog({
  open,
  onOpenChange,
  connectionId,
  database,
  tableName,
  onSuccess,
}: RenameTableDialogProps) {
  const { t } = useTranslation()
  const { theme } = useThemeStore()
  const isDark = theme === 'dark'
  const [newName, setNewName] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setNewName(tableName)
      setError(null)
      setTimeout(() => {
        inputRef.current?.focus()
        inputRef.current?.select()
      }, 0)
    }
  }, [open, tableName])

  const handleConfirm = async () => {
    if (!newName.trim() || newName === tableName) return

    setIsLoading(true)
    setError(null)

    try {
      await dbRenameTable(connectionId, database, tableName, newName.trim())
      onSuccess()
      onOpenChange(false)
    } catch (err) {
      setError(String(err))
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleConfirm()
    }
  }

  const previewSql = `RENAME TABLE \`${tableName}\` TO \`${newName}\`;`

  // Theme styles
  const dialogBg = isDark ? 'bg-dark-bg-primary' : 'bg-light-bg-primary'
  const borderColor = isDark ? 'border-dark-border' : 'border-light-border'
  const textPrimary = isDark ? 'text-dark-text-primary' : 'text-light-text-primary'
  const textSecondary = isDark ? 'text-dark-text-secondary' : 'text-light-text-secondary'
  const inputBg = isDark ? 'bg-dark-bg-hover' : 'bg-light-bg-primary'
  const hoverBg = isDark ? 'hover:bg-dark-bg-hover' : 'hover:bg-light-bg-hover'
  const codeBg = isDark ? 'bg-dark-bg-secondary' : 'bg-light-bg-secondary'

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
        <Dialog.Content
          className={cn(
            'fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2',
            'rounded-lg shadow-xl z-50 w-[450px] p-0 outline-none border',
            dialogBg,
            borderColor
          )}
        >
          {/* Title */}
          <div className={cn('flex items-center justify-between px-4 py-3 border-b', borderColor)}>
            <Dialog.Title className={cn('text-base font-medium', textPrimary)}>
              {t('database.renameTable')}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button className={cn('p-1 rounded transition-colors', hoverBg)}>
                <X className={cn('w-4 h-4', textSecondary)} />
              </button>
            </Dialog.Close>
          </div>

          {/* Content */}
          <div className="p-4 space-y-4">
            {/* Current name */}
            <div>
              <label className={cn('block text-sm mb-1', textSecondary)}>
                {t('database.currentTableName')}
              </label>
              <div className={cn('px-3 py-2 rounded-md text-sm border', codeBg, borderColor, textPrimary)}>
                {tableName}
              </div>
            </div>

            {/* New name input */}
            <div>
              <label className={cn('block text-sm mb-1', textSecondary)}>
                {t('database.newTableName')}
              </label>
              <input
                ref={inputRef}
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={t('database.enterNewTableName')}
                className={cn(
                  'w-full px-3 py-2 rounded-md text-sm border',
                  'focus:outline-none focus:border-accent-primary',
                  inputBg,
                  borderColor,
                  textPrimary,
                  isDark ? 'placeholder:text-dark-text-disabled' : 'placeholder:text-light-text-disabled'
                )}
              />
            </div>

            {/* SQL Preview */}
            <div>
              <label className={cn('block text-sm mb-1', textSecondary)}>
                {t('database.sqlPreview')}
              </label>
              <pre className={cn('px-3 py-2 rounded-md text-sm border overflow-x-auto', codeBg, borderColor, textPrimary)}>
                {previewSql}
              </pre>
            </div>

            {/* Warning */}
            <div className="flex items-start gap-2 p-3 rounded-md bg-status-warning/10 border border-status-warning/30">
              <AlertTriangle className="w-4 h-4 text-status-warning shrink-0 mt-0.5" />
              <span className="text-sm text-status-warning">
                {t('database.renameTableWarning')}
              </span>
            </div>

            {/* Error */}
            {error && (
              <div className="p-3 rounded-md bg-status-error/10 border border-status-error/30 text-sm text-status-error">
                {error}
              </div>
            )}
          </div>

          {/* Buttons */}
          <div className={cn('flex justify-end gap-2 px-4 py-3 border-t', borderColor)}>
            <Dialog.Close asChild>
              <button
                className={cn(
                  'px-4 py-1.5 text-sm rounded-md border transition-colors',
                  borderColor,
                  textPrimary,
                  hoverBg
                )}
              >
                {t('common.cancel')}
              </button>
            </Dialog.Close>
            <button
              onClick={handleConfirm}
              disabled={!newName.trim() || newName === tableName || isLoading}
              className="px-4 py-1.5 text-sm rounded-md bg-accent-primary text-white hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? t('common.processing') : t('database.confirmRename')}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
