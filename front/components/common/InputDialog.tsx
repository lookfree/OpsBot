/**
 * 输入对话框组件
 * 用于替代原生 prompt() 函数
 * 支持亮色/深色主题
 */

import { useState, useEffect, useRef } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { useThemeStore } from '@/stores'

interface InputDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  placeholder?: string
  defaultValue?: string
  onConfirm: (value: string) => void
}

export function InputDialog({
  open,
  onOpenChange,
  title,
  placeholder = '',
  defaultValue = '',
  onConfirm,
}: InputDialogProps) {
  const { t } = useTranslation()
  const { theme } = useThemeStore()
  const isDark = theme === 'dark'
  const [value, setValue] = useState(defaultValue)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setValue(defaultValue)
      setTimeout(() => {
        inputRef.current?.focus()
        inputRef.current?.select()
      }, 0)
    }
  }, [open, defaultValue])

  const handleConfirm = () => {
    if (value.trim()) {
      onConfirm(value.trim())
      onOpenChange(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleConfirm()
    }
  }

  // 主题相关样式
  const dialogBg = isDark ? 'bg-dark-bg-primary' : 'bg-light-bg-primary'
  const borderColor = isDark ? 'border-dark-border' : 'border-light-border'
  const textPrimary = isDark ? 'text-dark-text-primary' : 'text-light-text-primary'
  const textSecondary = isDark ? 'text-dark-text-secondary' : 'text-light-text-secondary'
  const inputBg = isDark ? 'bg-dark-bg-hover' : 'bg-light-bg-primary'
  const hoverBg = isDark ? 'hover:bg-dark-bg-hover' : 'hover:bg-light-bg-hover'

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
            <Dialog.Title className={cn('text-base font-medium', textPrimary)}>
              {title}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button className={cn('p-1 rounded transition-colors', hoverBg)}>
                <X className={cn('w-4 h-4', textSecondary)} />
              </button>
            </Dialog.Close>
          </div>

          {/* 内容区 */}
          <div className="p-4">
            <input
              ref={inputRef}
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
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

          {/* 按钮区 */}
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
              disabled={!value.trim()}
              className="px-4 py-1.5 text-sm rounded-md bg-accent-primary text-white hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {t('common.confirm')}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
