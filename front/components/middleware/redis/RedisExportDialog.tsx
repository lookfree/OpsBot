/**
 * Redis Export Dialog
 *
 * Dialog for exporting command history to various formats.
 */

import { useState, useCallback, useMemo, memo } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { saveTextFile } from '@/utils/saveFile'
import { X, Download, FileText, FileJson, FileCode } from 'lucide-react'
import type { CommandHistoryItem } from './RedisCommandOutput'

type ExportFormat = 'txt' | 'json' | 'md'

interface ExportOptions {
  includeCommand: boolean
  includeResult: boolean
  includeTimestamp: boolean
  includeExecutionTime: boolean
}

interface ThemeStyles {
  bgSecondary: string
  borderColor: string
  textPrimary: string
  textSecondary: string
  hoverBg: string
  isDark: boolean
}

interface RedisExportDialogProps {
  isOpen: boolean
  history: CommandHistoryItem[]
  styles: ThemeStyles
  onClose: () => void
}

// Format icons
const FormatIcon = memo(function FormatIcon({ format }: { format: ExportFormat }) {
  switch (format) {
    case 'txt':
      return <FileText className="w-5 h-5" />
    case 'json':
      return <FileJson className="w-5 h-5" />
    case 'md':
      return <FileCode className="w-5 h-5" />
  }
})

// Format result value for export
function formatResultValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '(nil)'
  }
  if (typeof value === 'string') {
    return `"${value}"`
  }
  if (typeof value === 'number') {
    return `(integer) ${value}`
  }
  if (typeof value === 'boolean') {
    return value ? '1' : '0'
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return '(empty array)'
    return value.map((item, i) => `${i + 1}) ${formatResultValue(item)}`).join('\n')
  }
  if (typeof value === 'object') {
    return JSON.stringify(value, null, 2)
  }
  return String(value)
}

// Generate export content
function generateExportContent(
  history: CommandHistoryItem[],
  format: ExportFormat,
  options: ExportOptions
): string {
  const filteredHistory = history.filter(item => item.result || item.error)

  if (format === 'json') {
    const data = filteredHistory.map(item => {
      const entry: Record<string, unknown> = {}
      if (options.includeCommand) {
        entry.command = item.args.length > 0
          ? `${item.command} ${item.args.join(' ')}`
          : item.command
      }
      if (options.includeResult) {
        entry.result = item.error || (item.result?.value ?? null)
        entry.success = !item.error
      }
      if (options.includeTimestamp) {
        entry.timestamp = new Date(item.timestamp).toISOString()
      }
      if (options.includeExecutionTime && item.result) {
        entry.executionTimeMs = item.result.executionTimeMs
      }
      return entry
    })
    return JSON.stringify(data, null, 2)
  }

  if (format === 'md') {
    const lines: string[] = ['# Redis Command History', '']
    filteredHistory.forEach((item, index) => {
      const fullCommand = item.args.length > 0
        ? `${item.command} ${item.args.join(' ')}`
        : item.command

      lines.push(`## ${index + 1}. Command`)
      lines.push('')

      if (options.includeCommand) {
        lines.push('```redis')
        lines.push(`redis> ${fullCommand}`)
        lines.push('```')
        lines.push('')
      }

      if (options.includeResult) {
        lines.push('### Result')
        lines.push('')
        if (item.error) {
          lines.push(`**Error:** ${item.error}`)
        } else if (item.result) {
          lines.push('```')
          lines.push(formatResultValue(item.result.value))
          lines.push('```')
        }
        lines.push('')
      }

      const meta: string[] = []
      if (options.includeTimestamp) {
        meta.push(`Time: ${new Date(item.timestamp).toLocaleString()}`)
      }
      if (options.includeExecutionTime && item.result) {
        meta.push(`Execution: ${item.result.executionTimeMs}ms`)
      }
      if (meta.length > 0) {
        lines.push(`> ${meta.join(' | ')}`)
        lines.push('')
      }

      lines.push('---')
      lines.push('')
    })
    return lines.join('\n')
  }

  // txt format
  const lines: string[] = []
  filteredHistory.forEach((item) => {
    const fullCommand = item.args.length > 0
      ? `${item.command} ${item.args.join(' ')}`
      : item.command

    if (options.includeCommand) {
      lines.push(`redis> ${fullCommand}`)
    }

    if (options.includeResult) {
      if (item.error) {
        lines.push(`(error) ${item.error}`)
      } else if (item.result) {
        lines.push(formatResultValue(item.result.value))
      }
    }

    const meta: string[] = []
    if (options.includeTimestamp) {
      meta.push(new Date(item.timestamp).toLocaleString())
    }
    if (options.includeExecutionTime && item.result) {
      meta.push(`${item.result.executionTimeMs}ms`)
    }
    if (meta.length > 0) {
      lines.push(`# ${meta.join(' | ')}`)
    }

    lines.push('')
  })
  return lines.join('\n')
}

// Format selector button
const FormatButton = memo(function FormatButton({
  format,
  label,
  isSelected,
  onClick,
  styles,
}: {
  format: ExportFormat
  label: string
  isSelected: boolean
  onClick: () => void
  styles: ThemeStyles
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex-1 flex flex-col items-center gap-2 p-4 rounded-lg border transition-all',
        isSelected
          ? 'border-accent-primary bg-accent-primary/10 text-accent-primary'
          : cn(styles.borderColor, styles.hoverBg)
      )}
    >
      <FormatIcon format={format} />
      <span className="text-sm font-medium">{label}</span>
    </button>
  )
})

// Option checkbox
const OptionCheckbox = memo(function OptionCheckbox({
  label,
  checked,
  onChange,
  styles,
}: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
  styles: ThemeStyles
}) {
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="w-4 h-4 rounded border-gray-300 text-accent-primary focus:ring-accent-primary"
      />
      <span className={cn('text-sm', styles.textPrimary)}>{label}</span>
    </label>
  )
})

export function RedisExportDialog({
  isOpen,
  history,
  styles,
  onClose,
}: RedisExportDialogProps) {
  const { t } = useTranslation()
  const [format, setFormat] = useState<ExportFormat>('txt')
  const [options, setOptions] = useState<ExportOptions>({
    includeCommand: true,
    includeResult: true,
    includeTimestamp: true,
    includeExecutionTime: true,
  })

  // Generate preview content
  const previewContent = useMemo(
    () => generateExportContent(history.slice(-5), format, options),
    [history, format, options]
  )

  // Handle export
  const handleExport = useCallback(async () => {
    const content = generateExportContent(history, format, options)
    try {
      // Keep the dialog open when the user cancels the save dialog.
      const saved = await saveTextFile(content, `redis-history-${Date.now()}.${format}`, {
        name: format.toUpperCase(),
        extensions: [format],
      })
      if (saved) onClose()
    } catch (err) {
      console.error('Failed to export Redis history:', err)
    }
  }, [history, format, options, onClose])

  // Update single option
  const updateOption = useCallback((key: keyof ExportOptions, value: boolean) => {
    setOptions(prev => ({ ...prev, [key]: value }))
  }, [])

  if (!isOpen) return null

  const commandCount = history.filter(item => item.result || item.error).length

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div
        className={cn(
          'w-full max-w-2xl rounded-lg border shadow-xl',
          styles.borderColor,
          styles.isDark ? 'bg-dark-bg-primary' : 'bg-light-bg-primary'
        )}
      >
        {/* Header */}
        <div className={cn(
          'flex items-center justify-between px-4 py-3 border-b',
          styles.borderColor
        )}>
          <h3 className="font-medium">{t('redis.exportHistory')}</h3>
          <button
            onClick={onClose}
            className={cn('p-1 rounded', styles.hoverBg)}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Format selection */}
          <div>
            <label className={cn('block text-sm font-medium mb-2', styles.textPrimary)}>
              {t('redis.exportFormat')}
            </label>
            <div className="flex gap-3">
              <FormatButton
                format="txt"
                label="TXT"
                isSelected={format === 'txt'}
                onClick={() => setFormat('txt')}
                styles={styles}
              />
              <FormatButton
                format="json"
                label="JSON"
                isSelected={format === 'json'}
                onClick={() => setFormat('json')}
                styles={styles}
              />
              <FormatButton
                format="md"
                label="Markdown"
                isSelected={format === 'md'}
                onClick={() => setFormat('md')}
                styles={styles}
              />
            </div>
          </div>

          {/* Export options */}
          <div>
            <label className={cn('block text-sm font-medium mb-2', styles.textPrimary)}>
              {t('redis.exportOptions')}
            </label>
            <div className="grid grid-cols-2 gap-2">
              <OptionCheckbox
                label={t('redis.includeCommand')}
                checked={options.includeCommand}
                onChange={(v) => updateOption('includeCommand', v)}
                styles={styles}
              />
              <OptionCheckbox
                label={t('redis.includeResult')}
                checked={options.includeResult}
                onChange={(v) => updateOption('includeResult', v)}
                styles={styles}
              />
              <OptionCheckbox
                label={t('redis.includeTimestamp')}
                checked={options.includeTimestamp}
                onChange={(v) => updateOption('includeTimestamp', v)}
                styles={styles}
              />
              <OptionCheckbox
                label={t('redis.includeExecutionTime')}
                checked={options.includeExecutionTime}
                onChange={(v) => updateOption('includeExecutionTime', v)}
                styles={styles}
              />
            </div>
          </div>

          {/* Preview */}
          <div>
            <label className={cn('block text-sm font-medium mb-2', styles.textPrimary)}>
              {t('redis.preview')} ({t('redis.lastNCommands', { count: Math.min(5, commandCount) })})
            </label>
            <div
              className={cn(
                'h-40 overflow-auto rounded border p-3 font-mono text-xs',
                styles.borderColor,
                styles.isDark ? 'bg-gray-900' : 'bg-gray-100'
              )}
            >
              <pre className="whitespace-pre-wrap">{previewContent || t('redis.noCommands')}</pre>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className={cn(
          'flex items-center justify-between px-4 py-3 border-t',
          styles.borderColor
        )}>
          <span className={cn('text-sm', styles.textSecondary)}>
            {t('redis.totalCommands_export', { count: commandCount })}
          </span>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className={cn('px-4 py-2 rounded text-sm', styles.hoverBg)}
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={handleExport}
              disabled={commandCount === 0}
              className={cn(
                'px-4 py-2 rounded text-sm bg-accent-primary text-white',
                'hover:bg-accent-hover transition-colors',
                'disabled:opacity-50 disabled:cursor-not-allowed',
                'flex items-center gap-2'
              )}
            >
              <Download className="w-4 h-4" />
              {t('redis.export')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
