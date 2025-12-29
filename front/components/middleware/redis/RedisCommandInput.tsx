/**
 * Redis Command Input Component
 *
 * Command input with autocomplete support.
 */

import { useState, useRef, useCallback, useEffect, memo } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { Play } from 'lucide-react'
import { matchCommands, getCommandInfo, type RedisCommandInfo } from '@/config/redisCommands'

interface ThemeStyles {
  bgSecondary: string
  borderColor: string
  textPrimary: string
  textSecondary: string
  hoverBg: string
  isDark: boolean
}

interface RedisCommandInputProps {
  styles: ThemeStyles
  executing: boolean
  autoCompleteEnabled: boolean
  onExecute: (command: string, args: string[]) => void
  historyCommands: string[]
  pendingCommand?: string | null  // Command to fill in input (from quick commands)
  onPendingCommandHandled?: () => void  // Callback when pending command is handled
}

// Autocomplete dropdown item
const AutoCompleteItem = memo(function AutoCompleteItem({
  item,
  isSelected,
  onClick,
  styles,
}: {
  item: RedisCommandInfo
  isSelected: boolean
  onClick: () => void
  styles: ThemeStyles
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full px-3 py-1.5 text-left flex items-center justify-between gap-2',
        'transition-colors',
        isSelected
          ? 'bg-accent-primary/20 text-accent-primary'
          : styles.hoverBg
      )}
    >
      <span className="font-mono font-medium">{item.name}</span>
      <span className={cn('text-xs truncate', styles.textSecondary)}>
        {item.description}
      </span>
    </button>
  )
})

export function RedisCommandInput({
  styles,
  executing,
  autoCompleteEnabled,
  onExecute,
  historyCommands,
  pendingCommand,
  onPendingCommandHandled,
}: RedisCommandInputProps) {
  const { t } = useTranslation()
  const [input, setInput] = useState('')
  const [suggestions, setSuggestions] = useState<RedisCommandInfo[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [historyIndex, setHistoryIndex] = useState(-1)
  const [showSyntax, setShowSyntax] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Handle pending command from quick commands
  useEffect(() => {
    if (pendingCommand) {
      setInput(pendingCommand)
      setSuggestions([])
      setHistoryIndex(-1)
      // Show syntax hint for the command
      const cmdName = pendingCommand.split(/\s+/)[0]?.toUpperCase()
      const cmdInfo = getCommandInfo(cmdName || '')
      setShowSyntax(cmdInfo?.syntax || null)
      // Focus input and move cursor to end
      inputRef.current?.focus()
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.setSelectionRange(pendingCommand.length, pendingCommand.length)
        }
      }, 0)
      onPendingCommandHandled?.()
    }
  }, [pendingCommand, onPendingCommandHandled])

  // Parse input into command and args
  const parseInput = useCallback((value: string): { cmd: string; args: string[] } => {
    const parts = value.trim().split(/\s+/)
    return {
      cmd: parts[0]?.toUpperCase() || '',
      args: parts.slice(1),
    }
  }, [])

  // Handle execute
  const handleExecute = useCallback(() => {
    if (!input.trim() || executing) return

    const { cmd, args } = parseInput(input)
    if (!cmd) return

    onExecute(cmd, args)
    setInput('')
    setHistoryIndex(-1)
    setSuggestions([])
    setShowSyntax(null)
  }, [input, executing, parseInput, onExecute])

  // Handle input change
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setInput(value)
    setHistoryIndex(-1)

    if (!autoCompleteEnabled) {
      setSuggestions([])
      setShowSyntax(null)
      return
    }

    const { cmd, args } = parseInput(value)

    // Show autocomplete for command name only
    if (args.length === 0 && cmd) {
      const matches = matchCommands(cmd)
      setSuggestions(matches)
      setSelectedIndex(0)
      setShowSyntax(null)
    } else if (cmd) {
      // Show syntax hint for known commands
      const cmdInfo = getCommandInfo(cmd)
      setShowSyntax(cmdInfo?.syntax || null)
      setSuggestions([])
    } else {
      setSuggestions([])
      setShowSyntax(null)
    }
  }, [autoCompleteEnabled, parseInput])

  // Handle keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    // Execute on Enter
    if (e.key === 'Enter') {
      if (suggestions.length > 0 && selectedIndex >= 0) {
        // Select suggestion
        e.preventDefault()
        const selected = suggestions[selectedIndex]
        setInput(selected.name + ' ')
        setSuggestions([])
        setShowSyntax(selected.syntax)
      } else {
        // Execute command
        e.preventDefault()
        handleExecute()
      }
      return
    }

    // Navigate suggestions
    if (suggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex((prev) => Math.min(prev + 1, suggestions.length - 1))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex((prev) => Math.max(prev - 1, 0))
        return
      }
      if (e.key === 'Tab') {
        e.preventDefault()
        const selected = suggestions[selectedIndex]
        setInput(selected.name + ' ')
        setSuggestions([])
        setShowSyntax(selected.syntax)
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setSuggestions([])
        return
      }
    }

    // Navigate history
    if (e.key === 'ArrowUp' && suggestions.length === 0 && historyCommands.length > 0) {
      e.preventDefault()
      const newIndex = Math.min(historyIndex + 1, historyCommands.length - 1)
      setHistoryIndex(newIndex)
      setInput(historyCommands[newIndex])
      return
    }
    if (e.key === 'ArrowDown' && suggestions.length === 0 && historyIndex >= 0) {
      e.preventDefault()
      const newIndex = historyIndex - 1
      if (newIndex < 0) {
        setHistoryIndex(-1)
        setInput('')
      } else {
        setHistoryIndex(newIndex)
        setInput(historyCommands[newIndex])
      }
      return
    }
  }, [suggestions, selectedIndex, historyCommands, historyIndex, handleExecute])

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = () => setSuggestions([])
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [])

  return (
    <div className={cn('p-3 border-t', styles.borderColor)}>
      <div className="flex items-center gap-2">
        {/* Prompt */}
        <span className="text-accent-primary font-mono font-medium select-none">
          redis&gt;
        </span>

        {/* Input wrapper */}
        <div className="flex-1 relative" onClick={(e) => e.stopPropagation()}>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder={t('redis.inputPlaceholder')}
            className={cn(
              'w-full px-3 py-2 rounded border font-mono text-sm',
              'focus:outline-none focus:border-accent-primary',
              styles.borderColor,
              styles.isDark ? 'bg-dark-bg-hover' : 'bg-light-bg-primary'
            )}
            disabled={executing}
            autoComplete="off"
            spellCheck={false}
          />

          {/* Syntax hint */}
          {showSyntax && (
            <div className={cn(
              'absolute left-0 right-0 -top-7 px-2 py-0.5 text-xs font-mono',
              'rounded bg-yellow-500/20 text-yellow-500'
            )}>
              {showSyntax}
            </div>
          )}

          {/* Autocomplete dropdown */}
          {suggestions.length > 0 && (
            <div
              className={cn(
                'absolute top-full left-0 right-0 mt-1 py-1 rounded border shadow-lg z-20',
                'max-h-60 overflow-auto',
                styles.borderColor,
                styles.isDark ? 'bg-dark-bg-primary' : 'bg-light-bg-primary'
              )}
            >
              {suggestions.map((suggestion, index) => (
                <AutoCompleteItem
                  key={suggestion.name}
                  item={suggestion}
                  isSelected={index === selectedIndex}
                  onClick={() => {
                    setInput(suggestion.name + ' ')
                    setSuggestions([])
                    setShowSyntax(suggestion.syntax)
                    inputRef.current?.focus()
                  }}
                  styles={styles}
                />
              ))}
            </div>
          )}
        </div>

        {/* Execute button */}
        <button
          onClick={handleExecute}
          disabled={executing || !input.trim()}
          className={cn(
            'px-4 py-2 rounded bg-accent-primary text-white font-medium',
            'hover:bg-accent-hover transition-colors',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            'flex items-center gap-2'
          )}
        >
          <Play className="w-4 h-4" />
          {t('redis.execute')}
        </button>
      </div>
    </div>
  )
}
