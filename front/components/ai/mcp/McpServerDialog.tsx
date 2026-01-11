/**
 * MCP Server Dialog Component
 *
 * Dialog for creating/editing MCP servers.
 */

import { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { X, Loader2, Terminal, Globe, Plus, Trash2 } from 'lucide-react'
import { useAiStyles } from '../hooks'
import type { McpServerConfig, McpTransport, McpTransportType } from '@/types'

interface McpServerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (config: McpServerConfig) => Promise<string>
  isLoading: boolean
  editServer?: McpServerConfig
}

export function McpServerDialog({
  open,
  onOpenChange,
  onSave,
  isLoading,
  editServer,
}: McpServerDialogProps) {
  const { t } = useTranslation()
  const styles = useAiStyles()

  const [name, setName] = useState(editServer?.name || '')
  const [description, setDescription] = useState(editServer?.description || '')
  const [transportType, setTransportType] = useState<McpTransportType>(
    editServer?.transport.type || 'stdio'
  )
  const [command, setCommand] = useState(
    editServer?.transport.type === 'stdio' ? editServer.transport.command : ''
  )
  const [args, setArgs] = useState<string[]>(
    editServer?.transport.type === 'stdio' ? editServer.transport.args : []
  )
  const [url, setUrl] = useState(
    editServer?.transport.type === 'sse' ? editServer.transport.url : ''
  )

  const handleClose = useCallback(() => {
    if (!isLoading) {
      onOpenChange(false)
      // Reset form
      setName('')
      setDescription('')
      setTransportType('stdio')
      setCommand('')
      setArgs([])
      setUrl('')
    }
  }, [isLoading, onOpenChange])

  const handleSave = useCallback(async () => {
    if (!name.trim()) return

    let transport: McpTransport
    if (transportType === 'stdio') {
      if (!command.trim()) return
      transport = {
        type: 'stdio',
        command: command.trim(),
        args: args.filter((a) => a.trim()),
      }
    } else {
      if (!url.trim()) return
      transport = {
        type: 'sse',
        url: url.trim(),
      }
    }

    const config: McpServerConfig = {
      name: name.trim(),
      description: description.trim() || undefined,
      transport,
      tools: [],
    }

    try {
      await onSave(config)
      handleClose()
    } catch {
      // Error handled in store
    }
  }, [name, description, transportType, command, args, url, onSave, handleClose])

  const handleAddArg = useCallback(() => {
    setArgs((prev) => [...prev, ''])
  }, [])

  const handleRemoveArg = useCallback((index: number) => {
    setArgs((prev) => prev.filter((_, i) => i !== index))
  }, [])

  const handleArgChange = useCallback((index: number, value: string) => {
    setArgs((prev) => prev.map((arg, i) => (i === index ? value : arg)))
  }, [])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={handleClose} />

      {/* Dialog */}
      <div className={cn('relative w-[500px] rounded-lg shadow-xl', styles.bgPrimary, styles.borderColor, 'border')}>
        {/* Header */}
        <div className={cn('flex items-center justify-between p-4 border-b', styles.borderColor)}>
          <h2 className={cn('text-lg font-medium', styles.textPrimary)}>
            {editServer ? t('ai.mcp.editServer') : t('ai.mcp.createServer')}
          </h2>
          <button
            className={cn('p-1 rounded', styles.hoverBg)}
            onClick={handleClose}
            disabled={isLoading}
          >
            <X className={cn('w-5 h-5', styles.textSecondary)} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Name */}
          <div>
            <label className={cn('block text-sm font-medium mb-1', styles.textPrimary)}>
              {t('ai.mcp.serverName')} *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={cn(
                'w-full px-3 py-2 rounded border text-sm',
                styles.inputBg,
                styles.borderColor,
                styles.textPrimary,
                'focus:outline-none focus:ring-2 focus:ring-blue-500'
              )}
              placeholder={t('ai.mcp.serverNamePlaceholder')}
            />
          </div>

          {/* Description */}
          <div>
            <label className={cn('block text-sm font-medium mb-1', styles.textPrimary)}>
              {t('ai.mcp.description')}
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className={cn(
                'w-full px-3 py-2 rounded border text-sm',
                styles.inputBg,
                styles.borderColor,
                styles.textPrimary,
                'focus:outline-none focus:ring-2 focus:ring-blue-500'
              )}
              placeholder={t('ai.mcp.descriptionPlaceholder')}
            />
          </div>

          {/* Transport Type */}
          <div>
            <label className={cn('block text-sm font-medium mb-2', styles.textPrimary)}>
              {t('ai.mcp.transportType')} *
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded border text-sm',
                  transportType === 'stdio'
                    ? 'bg-blue-600 border-blue-600 text-white'
                    : cn(styles.inputBg, styles.borderColor, styles.textPrimary)
                )}
                onClick={() => setTransportType('stdio')}
              >
                <Terminal className="w-4 h-4" />
                Stdio
              </button>
              <button
                type="button"
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded border text-sm',
                  transportType === 'sse'
                    ? 'bg-blue-600 border-blue-600 text-white'
                    : cn(styles.inputBg, styles.borderColor, styles.textPrimary)
                )}
                onClick={() => setTransportType('sse')}
              >
                <Globe className="w-4 h-4" />
                SSE
              </button>
            </div>
          </div>

          {/* Stdio Transport Fields */}
          {transportType === 'stdio' && (
            <>
              <div>
                <label className={cn('block text-sm font-medium mb-1', styles.textPrimary)}>
                  {t('ai.mcp.command')} *
                </label>
                <input
                  type="text"
                  value={command}
                  onChange={(e) => setCommand(e.target.value)}
                  className={cn(
                    'w-full px-3 py-2 rounded border text-sm font-mono',
                    styles.inputBg,
                    styles.borderColor,
                    styles.textPrimary,
                    'focus:outline-none focus:ring-2 focus:ring-blue-500'
                  )}
                  placeholder="npx, python, node..."
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className={cn('text-sm font-medium', styles.textPrimary)}>
                    {t('ai.mcp.arguments')}
                  </label>
                  <button
                    type="button"
                    className={cn('flex items-center gap-1 text-sm', styles.textSecondary, 'hover:text-blue-500')}
                    onClick={handleAddArg}
                  >
                    <Plus className="w-3 h-3" />
                    {t('common.add')}
                  </button>
                </div>
                <div className="space-y-2">
                  {args.map((arg, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <input
                        type="text"
                        value={arg}
                        onChange={(e) => handleArgChange(index, e.target.value)}
                        className={cn(
                          'flex-1 px-3 py-2 rounded border text-sm font-mono',
                          styles.inputBg,
                          styles.borderColor,
                          styles.textPrimary,
                          'focus:outline-none focus:ring-2 focus:ring-blue-500'
                        )}
                        placeholder={`${t('ai.mcp.argument')} ${index + 1}`}
                      />
                      <button
                        type="button"
                        className={cn('p-2 rounded', styles.hoverBg, styles.errorText)}
                        onClick={() => handleRemoveArg(index)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                  {args.length === 0 && (
                    <p className={cn('text-sm', styles.textSecondary)}>
                      {t('ai.mcp.noArguments')}
                    </p>
                  )}
                </div>
              </div>
            </>
          )}

          {/* SSE Transport Fields */}
          {transportType === 'sse' && (
            <div>
              <label className={cn('block text-sm font-medium mb-1', styles.textPrimary)}>
                {t('ai.mcp.url')} *
              </label>
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className={cn(
                  'w-full px-3 py-2 rounded border text-sm',
                  styles.inputBg,
                  styles.borderColor,
                  styles.textPrimary,
                  'focus:outline-none focus:ring-2 focus:ring-blue-500'
                )}
                placeholder="http://localhost:3000/sse"
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={cn('flex items-center justify-end gap-2 p-4 border-t', styles.borderColor)}>
          <button
            className={cn('px-4 py-2 text-sm rounded', styles.hoverBg, styles.textSecondary)}
            onClick={handleClose}
            disabled={isLoading}
          >
            {t('common.cancel')}
          </button>
          <button
            className="flex items-center gap-2 px-4 py-2 text-sm rounded bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
            onClick={handleSave}
            disabled={isLoading || !name.trim() || (transportType === 'stdio' ? !command.trim() : !url.trim())}
          >
            {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
            {editServer ? t('common.save') : t('common.create')}
          </button>
        </div>
      </div>
    </div>
  )
}
