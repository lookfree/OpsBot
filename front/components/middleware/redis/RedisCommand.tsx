/**
 * Redis Command Component
 *
 * CLI-like interface for executing Redis commands.
 * Refactored with modular sub-components.
 */

import { useState, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { Trash2, Star, Download, Settings } from 'lucide-react'
import { mwRedisExecuteCommand } from '@/services/middleware'
import type { RedisCommandCategory } from '@/config/redisCommands'
import { RedisCommandOutput, type CommandHistoryItem } from './RedisCommandOutput'
import { RedisCommandInput } from './RedisCommandInput'
import { RedisCommandTabs } from './RedisCommandTabs'
import { RedisQuickCommands } from './RedisQuickCommands'
import { RedisFavoriteDialog, type FavoriteCommand } from './RedisFavoriteDialog'
import { RedisExportDialog } from './RedisExportDialog'

interface ThemeStyles {
  bgSecondary: string
  borderColor: string
  textPrimary: string
  textSecondary: string
  hoverBg: string
  isDark: boolean
}

interface RedisCommandProps {
  connectionId: string
  styles: ThemeStyles
}

// Local storage keys
const FAVORITES_STORAGE_KEY = 'redis-favorite-commands'
const SETTINGS_STORAGE_KEY = 'redis-command-settings'

// Load favorites from localStorage
function loadFavorites(): FavoriteCommand[] {
  try {
    const stored = localStorage.getItem(FAVORITES_STORAGE_KEY)
    return stored ? JSON.parse(stored) : []
  } catch {
    return []
  }
}

// Save favorites to localStorage
function saveFavorites(favorites: FavoriteCommand[]) {
  localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(favorites))
}

// Load settings from localStorage
function loadSettings(): { autoComplete: boolean } {
  try {
    const stored = localStorage.getItem(SETTINGS_STORAGE_KEY)
    return stored ? JSON.parse(stored) : { autoComplete: true }
  } catch {
    return { autoComplete: true }
  }
}

// Save settings to localStorage
function saveSettings(settings: { autoComplete: boolean }) {
  localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings))
}

export function RedisCommand({ connectionId, styles }: RedisCommandProps) {
  const { t } = useTranslation()

  // State
  const [activeCategory, setActiveCategory] = useState<RedisCommandCategory>('common')
  const [history, setHistory] = useState<CommandHistoryItem[]>([])
  const [executing, setExecuting] = useState(false)
  const [favorites, setFavorites] = useState<FavoriteCommand[]>(loadFavorites)
  const [showFavorites, setShowFavorites] = useState(false)
  const [showExport, setShowExport] = useState(false)
  const [autoCompleteEnabled, setAutoCompleteEnabled] = useState(loadSettings().autoComplete)
  const [pendingCommand, setPendingCommand] = useState<string | null>(null)

  const idCounter = useRef(0)

  // Execute command
  const handleExecute = useCallback(async (command: string, args: string[]) => {
    if (executing) return

    setExecuting(true)
    const id = `cmd-${++idCounter.current}`
    const isFavorite = favorites.some(
      f => f.command === command && JSON.stringify(f.args) === JSON.stringify(args)
    )

    try {
      const result = await mwRedisExecuteCommand({
        connectionId,
        command,
        args,
      })

      setHistory((prev) => [
        ...prev,
        {
          id,
          command,
          args,
          result,
          error: null,
          timestamp: Date.now(),
          isFavorite,
        },
      ])
    } catch (err) {
      setHistory((prev) => [
        ...prev,
        {
          id,
          command,
          args,
          result: null,
          error: String(err),
          timestamp: Date.now(),
          isFavorite,
        },
      ])
    } finally {
      setExecuting(false)
    }
  }, [connectionId, executing, favorites])

  // Copy result to clipboard
  const handleCopy = useCallback((result: { value: unknown }) => {
    const text = typeof result.value === 'string'
      ? result.value
      : JSON.stringify(result.value, null, 2)
    navigator.clipboard.writeText(text)
  }, [])

  // Toggle favorite for history item
  const handleToggleFavorite = useCallback((itemId: string) => {
    setHistory(prev => prev.map(item => {
      if (item.id !== itemId) return item

      if (item.isFavorite) {
        // Remove from favorites
        const newFavorites = favorites.filter(
          f => !(f.command === item.command && JSON.stringify(f.args) === JSON.stringify(item.args))
        )
        setFavorites(newFavorites)
        saveFavorites(newFavorites)
        return { ...item, isFavorite: false }
      } else {
        // Add to favorites
        const newFavorite: FavoriteCommand = {
          id: `fav-${Date.now()}`,
          command: item.command,
          args: item.args,
          remark: '',
          createdAt: Date.now(),
        }
        const newFavorites = [...favorites, newFavorite]
        setFavorites(newFavorites)
        saveFavorites(newFavorites)
        return { ...item, isFavorite: true }
      }
    }))
  }, [favorites])

  // Favorite dialog handlers
  const handleAddFavorite = useCallback((command: string, args: string[], remark: string) => {
    const newFavorite: FavoriteCommand = {
      id: `fav-${Date.now()}`,
      command,
      args,
      remark,
      createdAt: Date.now(),
    }
    const newFavorites = [...favorites, newFavorite]
    setFavorites(newFavorites)
    saveFavorites(newFavorites)
  }, [favorites])

  const handleUpdateFavorite = useCallback((id: string, command: string, args: string[], remark: string) => {
    const newFavorites = favorites.map(f =>
      f.id === id ? { ...f, command, args, remark } : f
    )
    setFavorites(newFavorites)
    saveFavorites(newFavorites)
  }, [favorites])

  const handleDeleteFavorite = useCallback((id: string) => {
    const newFavorites = favorites.filter(f => f.id !== id)
    setFavorites(newFavorites)
    saveFavorites(newFavorites)
  }, [favorites])

  const handleExecuteFavorite = useCallback((command: string, args: string[]) => {
    handleExecute(command, args)
  }, [handleExecute])

  // Clear history
  const handleClear = useCallback(() => {
    setHistory([])
  }, [])

  // Toggle autocomplete
  const handleToggleAutoComplete = useCallback(() => {
    const newValue = !autoCompleteEnabled
    setAutoCompleteEnabled(newValue)
    saveSettings({ autoComplete: newValue })
  }, [autoCompleteEnabled])

  // Fill command to input (for quick commands)
  const handleFillCommand = useCallback((command: string, args: string[]) => {
    const fullCommand = args.length > 0 ? `${command} ${args.join(' ')}` : command
    setPendingCommand(fullCommand)
  }, [])

  // Clear pending command after it's handled
  const handlePendingCommandHandled = useCallback(() => {
    setPendingCommand(null)
  }, [])

  // Get history commands for input navigation
  const historyCommands = history.map(
    item => item.args.length > 0 ? `${item.command} ${item.args.join(' ')}` : item.command
  ).reverse()

  return (
    <div className={cn('flex flex-col h-full', styles.textPrimary)}>
      {/* Toolbar */}
      <div className={cn(
        'flex items-center justify-between px-3 py-2 border-b',
        styles.borderColor
      )}>
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm">{t('redis.commandTerminal')}</span>
          <span className={cn('text-xs', styles.textSecondary)}>
            ({connectionId})
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowFavorites(true)}
            className={cn('p-1.5 rounded', styles.hoverBg)}
            title={t('redis.favoriteCommands')}
          >
            <Star className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowExport(true)}
            disabled={history.length === 0}
            className={cn('p-1.5 rounded', styles.hoverBg, 'disabled:opacity-50')}
            title={t('redis.exportHistory')}
          >
            <Download className="w-4 h-4" />
          </button>
          <button
            onClick={handleToggleAutoComplete}
            className={cn(
              'p-1.5 rounded',
              styles.hoverBg,
              autoCompleteEnabled && 'text-accent-primary'
            )}
            title={t('redis.autoComplete')}
          >
            <Settings className="w-4 h-4" />
          </button>
          <button
            onClick={handleClear}
            disabled={history.length === 0}
            className={cn('p-1.5 rounded', styles.hoverBg, 'disabled:opacity-50')}
            title={t('common.clear')}
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Output Area */}
      <RedisCommandOutput
        history={history}
        styles={styles}
        onReExecute={handleExecute}
        onCopy={handleCopy}
        onToggleFavorite={handleToggleFavorite}
      />

      {/* Command Input */}
      <RedisCommandInput
        styles={styles}
        executing={executing}
        autoCompleteEnabled={autoCompleteEnabled}
        onExecute={handleExecute}
        historyCommands={historyCommands}
        pendingCommand={pendingCommand}
        onPendingCommandHandled={handlePendingCommandHandled}
      />

      {/* Category Tabs */}
      <RedisCommandTabs
        activeCategory={activeCategory}
        onCategoryChange={setActiveCategory}
        styles={styles}
      />

      {/* Quick Commands - fill to input instead of direct execute */}
      <RedisQuickCommands
        category={activeCategory}
        onExecute={handleFillCommand}
        disabled={executing}
        styles={styles}
      />

      {/* Favorite Commands Dialog */}
      <RedisFavoriteDialog
        isOpen={showFavorites}
        favorites={favorites}
        styles={styles}
        onClose={() => setShowFavorites(false)}
        onExecute={handleExecuteFavorite}
        onAdd={handleAddFavorite}
        onUpdate={handleUpdateFavorite}
        onDelete={handleDeleteFavorite}
      />

      {/* Export Dialog */}
      <RedisExportDialog
        isOpen={showExport}
        history={history}
        styles={styles}
        onClose={() => setShowExport(false)}
      />
    </div>
  )
}
