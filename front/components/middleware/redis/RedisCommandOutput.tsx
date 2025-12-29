/**
 * Redis Command Output Component
 *
 * Terminal-style output display area for Redis commands and results.
 */

import { useRef, useEffect, memo } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { Copy, RotateCcw, Star, StarOff } from 'lucide-react'
import type { RedisCommandResult } from '@/services/middleware'

export interface CommandHistoryItem {
  id: string
  command: string
  args: string[]
  result: RedisCommandResult | null
  error: string | null
  timestamp: number
  isFavorite: boolean
}

interface ThemeStyles {
  bgSecondary: string
  borderColor: string
  textPrimary: string
  textSecondary: string
  hoverBg: string
  isDark: boolean
}

interface RedisCommandOutputProps {
  history: CommandHistoryItem[]
  styles: ThemeStyles
  onReExecute: (command: string, args: string[]) => void
  onCopy: (result: RedisCommandResult) => void
  onToggleFavorite: (id: string) => void
}

// Format result value for terminal display
function formatResultValue(value: unknown, indent: number = 0): string {
  const prefix = '  '.repeat(indent)

  if (value === null || value === undefined) {
    return `${prefix}(nil)`
  }

  if (typeof value === 'string') {
    // Multi-line strings
    if (value.includes('\n')) {
      return value.split('\n').map(line => `${prefix}${line}`).join('\n')
    }
    return `${prefix}"${value}"`
  }

  if (typeof value === 'number') {
    return `${prefix}(integer) ${value}`
  }

  if (typeof value === 'boolean') {
    return `${prefix}${value ? '1' : '0'}`
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return `${prefix}(empty array)`
    }
    return value.map((item, index) => {
      const formatted = formatResultValue(item, 0)
      return `${prefix}${index + 1}) ${formatted.trimStart()}`
    }).join('\n')
  }

  if (typeof value === 'object') {
    return `${prefix}${JSON.stringify(value, null, 2)}`
  }

  return `${prefix}${String(value)}`
}

// Single history item component
const HistoryItem = memo(function HistoryItem({
  item,
  styles,
  onReExecute,
  onCopy,
  onToggleFavorite,
}: {
  item: CommandHistoryItem
  styles: ThemeStyles
  onReExecute: (command: string, args: string[]) => void
  onCopy: (result: RedisCommandResult) => void
  onToggleFavorite: (id: string) => void
}) {
  const { t } = useTranslation()
  const fullCommand = item.args.length > 0
    ? `${item.command} ${item.args.join(' ')}`
    : item.command

  return (
    <div className="font-mono text-sm">
      {/* Command line */}
      <div className="flex items-start gap-2 group">
        <span className="text-accent-primary select-none shrink-0">redis&gt;</span>
        <span className="text-cyan-400 flex-1 break-all">{fullCommand}</span>

        {/* Action buttons - shown on hover */}
        <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 shrink-0 transition-opacity">
          {item.result && (
            <button
              onClick={() => onCopy(item.result!)}
              className={cn('p-1 rounded', styles.hoverBg)}
              title={t('common.copy')}
            >
              <Copy className="w-3 h-3" />
            </button>
          )}
          <button
            onClick={() => onToggleFavorite(item.id)}
            className={cn('p-1 rounded', styles.hoverBg)}
            title={item.isFavorite ? t('redis.unfavorite') : t('redis.favorite')}
          >
            {item.isFavorite ? (
              <Star className="w-3 h-3 text-yellow-500 fill-yellow-500" />
            ) : (
              <StarOff className="w-3 h-3" />
            )}
          </button>
          <button
            onClick={() => onReExecute(item.command, item.args)}
            className={cn('p-1 rounded', styles.hoverBg)}
            title={t('redis.reExecute')}
          >
            <RotateCcw className="w-3 h-3" />
          </button>
          <span className={cn('text-xs px-1', styles.textSecondary)}>
            {new Date(item.timestamp).toLocaleTimeString()}
          </span>
        </div>
      </div>

      {/* Result */}
      <div className="mt-1 ml-0">
        {item.error ? (
          <div className="text-red-500 whitespace-pre-wrap">
            (error) {item.error}
          </div>
        ) : item.result ? (
          <div className="whitespace-pre-wrap">
            <span className={styles.textPrimary}>
              {formatResultValue(item.result.value)}
            </span>
            <span className={cn('ml-2 text-xs', styles.textSecondary)}>
              ({item.result.executionTimeMs}ms)
            </span>
          </div>
        ) : null}
      </div>
    </div>
  )
})

export function RedisCommandOutput({
  history,
  styles,
  onReExecute,
  onCopy,
  onToggleFavorite,
}: RedisCommandOutputProps) {
  const { t } = useTranslation()
  const containerRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom when new commands are added
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [history.length])

  return (
    <div
      ref={containerRef}
      className={cn(
        'flex-1 overflow-auto p-4 space-y-4 rounded-lg border',
        styles.borderColor,
        'min-h-[200px]'
      )}
      style={{ backgroundColor: styles.bgSecondary }}
    >
      {history.length === 0 ? (
        <div className={cn('text-center py-8', styles.textSecondary)}>
          <p className="font-mono">{t('redis.noCommands')}</p>
          <p className="text-sm mt-2">
            {t('redis.tryCommand')}
          </p>
        </div>
      ) : (
        history.map((item) => (
          <HistoryItem
            key={item.id}
            item={item}
            styles={styles}
            onReExecute={onReExecute}
            onCopy={onCopy}
            onToggleFavorite={onToggleFavorite}
          />
        ))
      )}
    </div>
  )
}
