/**
 * Redis Favorite Commands Dialog
 *
 * Dialog for managing favorite commands.
 */

import { useState, useCallback, memo } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { X, Play, Pencil, Trash2, Plus, Save } from 'lucide-react'

export interface FavoriteCommand {
  id: string
  command: string
  args: string[]
  remark: string
  createdAt: number
}

interface ThemeStyles {
  bgSecondary: string
  borderColor: string
  textPrimary: string
  textSecondary: string
  hoverBg: string
  isDark: boolean
}

interface RedisFavoriteDialogProps {
  isOpen: boolean
  favorites: FavoriteCommand[]
  styles: ThemeStyles
  onClose: () => void
  onExecute: (command: string, args: string[]) => void
  onAdd: (command: string, args: string[], remark: string) => void
  onUpdate: (id: string, command: string, args: string[], remark: string) => void
  onDelete: (id: string) => void
}

// Favorite item row
const FavoriteItem = memo(function FavoriteItem({
  item,
  styles,
  onExecute,
  onEdit,
  onDelete,
}: {
  item: FavoriteCommand
  styles: ThemeStyles
  onExecute: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const { t } = useTranslation()
  const fullCommand = item.args.length > 0
    ? `${item.command} ${item.args.join(' ')}`
    : item.command

  return (
    <div className={cn(
      'flex items-center gap-3 px-3 py-2 rounded',
      styles.hoverBg
    )}>
      <div className="flex-1 min-w-0">
        <div className="font-mono text-sm truncate text-accent-primary">
          {fullCommand}
        </div>
        {item.remark && (
          <div className={cn('text-xs truncate', styles.textSecondary)}>
            {item.remark}
          </div>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={onExecute}
          className={cn('p-1.5 rounded', styles.hoverBg)}
          title={t('redis.execute')}
        >
          <Play className="w-4 h-4 text-accent-primary" />
        </button>
        <button
          onClick={onEdit}
          className={cn('p-1.5 rounded', styles.hoverBg)}
          title={t('common.edit')}
        >
          <Pencil className="w-4 h-4" />
        </button>
        <button
          onClick={onDelete}
          className={cn('p-1.5 rounded', styles.hoverBg)}
          title={t('common.delete')}
        >
          <Trash2 className="w-4 h-4 text-red-500" />
        </button>
      </div>
    </div>
  )
})

// Add/Edit form
function EditForm({
  initialCommand = '',
  initialArgs = [] as string[],
  initialRemark = '',
  styles,
  onSave,
  onCancel,
}: {
  initialCommand?: string
  initialArgs?: string[]
  initialRemark?: string
  styles: ThemeStyles
  onSave: (command: string, args: string[], remark: string) => void
  onCancel: () => void
}) {
  const { t } = useTranslation()
  const [commandInput, setCommandInput] = useState(
    initialArgs.length > 0
      ? `${initialCommand} ${initialArgs.join(' ')}`
      : initialCommand
  )
  const [remark, setRemark] = useState(initialRemark)

  const handleSave = useCallback(() => {
    const parts = commandInput.trim().split(/\s+/)
    const command = parts[0]?.toUpperCase() || ''
    const args = parts.slice(1)
    if (command) {
      onSave(command, args, remark)
    }
  }, [commandInput, remark, onSave])

  return (
    <div className={cn('p-3 rounded border', styles.borderColor, styles.bgSecondary)}>
      <div className="space-y-3">
        <div>
          <label className={cn('block text-xs mb-1', styles.textSecondary)}>
            {t('redis.command')}
          </label>
          <input
            type="text"
            value={commandInput}
            onChange={(e) => setCommandInput(e.target.value)}
            placeholder="GET key"
            className={cn(
              'w-full px-3 py-2 rounded border font-mono text-sm',
              'focus:outline-none focus:border-accent-primary',
              styles.borderColor,
              styles.isDark ? 'bg-dark-bg-hover' : 'bg-light-bg-primary'
            )}
            autoFocus
          />
        </div>
        <div>
          <label className={cn('block text-xs mb-1', styles.textSecondary)}>
            {t('redis.remark')}
          </label>
          <input
            type="text"
            value={remark}
            onChange={(e) => setRemark(e.target.value)}
            placeholder={t('redis.remarkPlaceholder')}
            className={cn(
              'w-full px-3 py-2 rounded border text-sm',
              'focus:outline-none focus:border-accent-primary',
              styles.borderColor,
              styles.isDark ? 'bg-dark-bg-hover' : 'bg-light-bg-primary'
            )}
          />
        </div>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className={cn('px-3 py-1.5 rounded text-sm', styles.hoverBg)}
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleSave}
            disabled={!commandInput.trim()}
            className={cn(
              'px-3 py-1.5 rounded text-sm bg-accent-primary text-white',
              'hover:bg-accent-hover transition-colors',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              'flex items-center gap-1'
            )}
          >
            <Save className="w-4 h-4" />
            {t('common.save')}
          </button>
        </div>
      </div>
    </div>
  )
}

export function RedisFavoriteDialog({
  isOpen,
  favorites,
  styles,
  onClose,
  onExecute,
  onAdd,
  onUpdate,
  onDelete,
}: RedisFavoriteDialogProps) {
  const { t } = useTranslation()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [isAdding, setIsAdding] = useState(false)

  const handleAdd = useCallback((command: string, args: string[], remark: string) => {
    onAdd(command, args, remark)
    setIsAdding(false)
  }, [onAdd])

  const handleUpdate = useCallback((command: string, args: string[], remark: string) => {
    if (editingId) {
      onUpdate(editingId, command, args, remark)
      setEditingId(null)
    }
  }, [editingId, onUpdate])

  const handleExecute = useCallback((command: string, args: string[]) => {
    onExecute(command, args)
    onClose()
  }, [onExecute, onClose])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div
        className={cn(
          'w-full max-w-lg rounded-lg border shadow-xl',
          styles.borderColor,
          styles.isDark ? 'bg-dark-bg-primary' : 'bg-light-bg-primary'
        )}
      >
        {/* Header */}
        <div className={cn(
          'flex items-center justify-between px-4 py-3 border-b',
          styles.borderColor
        )}>
          <h3 className="font-medium">{t('redis.favoriteCommands')}</h3>
          <button
            onClick={onClose}
            className={cn('p-1 rounded', styles.hoverBg)}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 max-h-96 overflow-auto">
          {/* Add form */}
          {isAdding && (
            <div className="mb-4">
              <EditForm
                styles={styles}
                onSave={handleAdd}
                onCancel={() => setIsAdding(false)}
              />
            </div>
          )}

          {/* Favorites list */}
          {favorites.length === 0 && !isAdding ? (
            <div className={cn('text-center py-8', styles.textSecondary)}>
              <p>{t('redis.noFavorites')}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {favorites.map((item) => (
                editingId === item.id ? (
                  <EditForm
                    key={item.id}
                    initialCommand={item.command}
                    initialArgs={item.args}
                    initialRemark={item.remark}
                    styles={styles}
                    onSave={handleUpdate}
                    onCancel={() => setEditingId(null)}
                  />
                ) : (
                  <FavoriteItem
                    key={item.id}
                    item={item}
                    styles={styles}
                    onExecute={() => handleExecute(item.command, item.args)}
                    onEdit={() => setEditingId(item.id)}
                    onDelete={() => onDelete(item.id)}
                  />
                )
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={cn(
          'flex justify-center px-4 py-3 border-t',
          styles.borderColor
        )}>
          {!isAdding && (
            <button
              onClick={() => setIsAdding(true)}
              className={cn(
                'px-4 py-2 rounded text-sm',
                'border border-accent-primary text-accent-primary',
                'hover:bg-accent-primary/10 transition-colors',
                'flex items-center gap-2'
              )}
            >
              <Plus className="w-4 h-4" />
              {t('redis.addFavorite')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
