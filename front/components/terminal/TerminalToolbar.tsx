/**
 * Terminal Toolbar Component
 *
 * Provides search, font settings, and other terminal controls.
 */

import { useState, useCallback } from 'react'
import {
  Search,
  ChevronUp,
  ChevronDown,
  X,
  Minus,
  Plus,
  Settings,
  FolderOpen,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'

interface TerminalToolbarProps {
  className?: string
  fontSize: number
  onFontSizeChange: (size: number) => void
  onSearch?: (text: string) => boolean
  onSearchNext?: () => boolean
  onSearchPrevious?: () => boolean
  filePanelVisible?: boolean
  onToggleFilePanel?: () => void
}

export function TerminalToolbar({
  className,
  fontSize,
  onFontSizeChange,
  onSearch,
  onSearchNext,
  onSearchPrevious,
  filePanelVisible,
  onToggleFilePanel,
}: TerminalToolbarProps) {
  const { t } = useTranslation()
  const [showSearch, setShowSearch] = useState(false)
  const [searchText, setSearchText] = useState('')
  const [showSettings, setShowSettings] = useState(false)

  const handleSearch = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      if (searchText && onSearch) {
        onSearch(searchText)
      }
    },
    [searchText, onSearch]
  )

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setSearchText(e.target.value)
      if (e.target.value && onSearch) {
        onSearch(e.target.value)
      }
    },
    [onSearch]
  )

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
        'terminal-toolbar flex items-center gap-2 px-2 py-1',
        'bg-dark-sidebar border-b border-dark-border',
        className
      )}
    >
      {/* Search toggle */}
      <button
        onClick={() => setShowSearch(!showSearch)}
        className={cn(
          'p-1 rounded hover:bg-dark-hover transition-colors',
          showSearch && 'bg-dark-hover text-accent-primary'
        )}
        title="Search (Cmd/Ctrl+F)"
      >
        <Search className="w-4 h-4" />
      </button>

      {/* Search input */}
      {showSearch && (
        <form
          onSubmit={handleSearch}
          className="flex items-center gap-1 flex-1 max-w-xs"
        >
          <input
            type="text"
            value={searchText}
            onChange={handleSearchChange}
            placeholder="Search..."
            className={cn(
              'flex-1 px-2 py-0.5 text-sm rounded',
              'bg-dark-primary border border-dark-border',
              'focus:outline-none focus:border-accent-primary'
            )}
            autoFocus
          />
          <button
            type="button"
            onClick={() => onSearchPrevious?.()}
            className="p-1 rounded hover:bg-dark-hover transition-colors"
            title="Previous match"
          >
            <ChevronUp className="w-3 h-3" />
          </button>
          <button
            type="button"
            onClick={() => onSearchNext?.()}
            className="p-1 rounded hover:bg-dark-hover transition-colors"
            title="Next match"
          >
            <ChevronDown className="w-3 h-3" />
          </button>
          <button
            type="button"
            onClick={() => {
              setShowSearch(false)
              setSearchText('')
            }}
            className="p-1 rounded hover:bg-dark-hover transition-colors"
          >
            <X className="w-3 h-3" />
          </button>
        </form>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Font size controls */}
      <div className="flex items-center gap-1">
        <button
          onClick={decreaseFontSize}
          className="p-1 rounded hover:bg-dark-hover transition-colors"
          title="Decrease font size"
          disabled={fontSize <= 10}
        >
          <Minus className="w-3 h-3" />
        </button>
        <span className="text-xs text-secondary min-w-[2rem] text-center">
          {fontSize}px
        </span>
        <button
          onClick={increaseFontSize}
          className="p-1 rounded hover:bg-dark-hover transition-colors"
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
            'p-1 rounded hover:bg-dark-hover transition-colors',
            filePanelVisible && 'bg-dark-hover text-accent-primary'
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
          'p-1 rounded hover:bg-dark-hover transition-colors',
          showSettings && 'bg-dark-hover text-accent-primary'
        )}
        title="Terminal settings"
      >
        <Settings className="w-4 h-4" />
      </button>
    </div>
  )
}
