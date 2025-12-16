/**
 * Terminal Toolbar Component
 *
 * Provides search, font settings, and other terminal controls.
 */

import { useState, useCallback } from 'react'
import {
  Minus,
  Plus,
  Settings,
  FolderOpen,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { useThemeStore } from '@/stores'

interface TerminalToolbarProps {
  className?: string
  fontSize: number
  onFontSizeChange: (size: number) => void
  filePanelVisible?: boolean
  onToggleFilePanel?: () => void
}

export function TerminalToolbar({
  className,
  fontSize,
  onFontSizeChange,
  filePanelVisible,
  onToggleFilePanel,
}: TerminalToolbarProps) {
  const { t } = useTranslation()
  const { theme } = useThemeStore()
  const isDark = theme === 'dark'
  const [showSettings, setShowSettings] = useState(false)

  const increaseFontSize = useCallback(() => {
    if (fontSize < 24) {
      onFontSizeChange(fontSize + 1)
    }
  }, [fontSize, onFontSizeChange])

  const decreaseFontSize = useCallback(() => {
    if (fontSize > 10) {
      onFontSizeChange(fontSize - 1)
    }
  }, [fontSize, onFontSizeChange])

  return (
    <div
      className={cn(
        'terminal-toolbar flex items-center justify-end gap-2 px-2 py-1 border-b',
        isDark ? 'bg-dark-bg-secondary border-dark-border' : 'bg-light-bg-secondary border-light-border',
        className
      )}
    >

      {/* Font size controls */}
      <div className="flex items-center gap-1">
        <button
          onClick={decreaseFontSize}
          className={cn("p-1 rounded transition-colors", isDark ? "hover:bg-dark-bg-hover" : "hover:bg-light-bg-hover")}
          title="Decrease font size"
          disabled={fontSize <= 10}
        >
          <Minus className="w-3 h-3" />
        </button>
        <span className={cn("text-xs min-w-[2rem] text-center", isDark ? "text-dark-text-secondary" : "text-light-text-secondary")}>
          {fontSize}px
        </span>
        <button
          onClick={increaseFontSize}
          className={cn("p-1 rounded transition-colors", isDark ? "hover:bg-dark-bg-hover" : "hover:bg-light-bg-hover")}
          title="Increase font size"
          disabled={fontSize >= 24}
        >
          <Plus className="w-3 h-3" />
        </button>
      </div>

      {/* File panel toggle */}
      {onToggleFilePanel && (
        <button
          onClick={onToggleFilePanel}
          className={cn(
            'p-1 rounded transition-colors',
            isDark ? 'hover:bg-dark-bg-hover' : 'hover:bg-light-bg-hover',
            filePanelVisible && (isDark ? 'bg-dark-bg-hover text-accent-primary' : 'bg-light-bg-hover text-accent-primary')
          )}
          title={filePanelVisible ? t('sftp.hideFilePanel') : t('sftp.showFilePanel')}
        >
          <FolderOpen className="w-4 h-4" />
        </button>
      )}

      {/* Settings button */}
      <button
        onClick={() => setShowSettings(!showSettings)}
        className={cn(
          'p-1 rounded transition-colors',
          isDark ? 'hover:bg-dark-bg-hover' : 'hover:bg-light-bg-hover',
          showSettings && (isDark ? 'bg-dark-bg-hover text-accent-primary' : 'bg-light-bg-hover text-accent-primary')
        )}
        title="Terminal settings"
      >
        <Settings className="w-4 h-4" />
      </button>
    </div>
  )
}
