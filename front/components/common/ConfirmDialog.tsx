/**
 * 确认对话框组件
 * 用于替代原生 confirm() 函数
 * 支持亮色/深色主题
 */

import * as Dialog from '@radix-ui/react-dialog'
import { AlertTriangle, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { useThemeStore } from '@/stores'

interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  confirmText?: string
  cancelText?: string
  variant?: 'default' | 'danger'
  onConfirm: () => void
  onCancel?: () => void
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmText,
  cancelText,
  variant = 'default',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const { t } = useTranslation()
  const { theme } = useThemeStore()
  const isDark = theme === 'dark'

  const handleConfirm = () => {
    onConfirm()
    onOpenChange(false)
  }

  const handleCancel = () => {
    onCancel?.()
    onOpenChange(false)
  }

  // 主题相关样式
  const dialogBg = isDark ? 'bg-dark-bg-primary' : 'bg-light-bg-primary'
  const borderColor = isDark ? 'border-dark-border' : 'border-light-border'
  const textPrimary = isDark ? 'text-dark-text-primary' : 'text-light-text-primary'
  const textSecondary = isDark ? 'text-dark-text-secondary' : 'text-light-text-secondary'
  const hoverBg = isDark ? 'hover:bg-dark-bg-hover' : 'hover:bg-light-bg-hover'

  const confirmBtnClass = variant === 'danger'
    ? 'bg-status-error hover:bg-red-600'
    : 'bg-accent-primary hover:bg-accent-hover'

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
        <Dialog.Content
          className={cn(
            'fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2',
            'rounded-lg shadow-xl z-50 w-[360px] p-0 outline-none border',
            dialogBg,
            borderColor
          )}
        >
          {/* 标题栏 */}
          <div className={cn('flex items-center justify-between px-4 py-3 border-b', borderColor)}>
            <Dialog.Title className={cn('text-base font-medium flex items-center gap-2', textPrimary)}>
              {variant === 'danger' && (
                <AlertTriangle className="w-5 h-5 text-status-error" />
              )}
              {title}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button className={cn('p-1 rounded transition-colors', hoverBg)}>
                <X className={cn('w-4 h-4', textSecondary)} />
              </button>
            </Dialog.Close>
          </div>

          {/* 内容区 */}
          {description && (
            <div className="p-4">
              <p className={cn('text-sm', textSecondary)}>{description}</p>
            </div>
          )}

          {/* 按钮区 */}
          <div className={cn('flex justify-end gap-2 px-4 py-3 border-t', borderColor)}>
            <button
              onClick={handleCancel}
              className={cn(
                'px-4 py-1.5 text-sm rounded-md border transition-colors',
                borderColor,
                textPrimary,
                hoverBg
              )}
            >
              {cancelText || t('common.cancel')}
            </button>
            <button
              onClick={handleConfirm}
              className={cn(
                'px-4 py-1.5 text-sm rounded-md text-white transition-colors',
                confirmBtnClass
              )}
            >
              {confirmText || t('common.confirm')}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
