/**
 * MCP Tools Panel Component
 *
 * Panel for managing tools bound to an MCP server.
 */

import { useState, useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { useAiStore } from '@/stores'
import { X, Plus, Trash2, Wrench, Code, Loader2 } from 'lucide-react'
import { useAiStyles } from '../hooks'
import type { McpTool } from '@/types'

interface McpToolsPanelProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  serverId: string
}

export function McpToolsPanel({ open, onOpenChange, serverId }: McpToolsPanelProps) {
  const { t } = useTranslation()
  const styles = useAiStyles()

  const { mcpServers, mcpServerTools, fetchMcpServerTools, bindMcpTool, unbindMcpTool } = useAiStore()

  const [showAddTool, setShowAddTool] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  const server = mcpServers.find((s) => s.id === serverId)
  const tools = mcpServerTools[serverId] || []

  // Load tools when panel opens
  useEffect(() => {
    if (open && serverId) {
      fetchMcpServerTools(serverId)
    }
  }, [open, serverId, fetchMcpServerTools])

  const handleClose = useCallback(() => {
    onOpenChange(false)
    setShowAddTool(false)
  }, [onOpenChange])

  const handleAddTool = useCallback(
    async (tool: McpTool) => {
      setIsLoading(true)
      try {
        await bindMcpTool(serverId, tool)
        setShowAddTool(false)
      } catch {
        // Error handled in store
      } finally {
        setIsLoading(false)
      }
    },
    [serverId, bindMcpTool]
  )

  const handleRemoveTool = useCallback(
    async (toolName: string) => {
      setIsLoading(true)
      try {
        await unbindMcpTool(serverId, toolName)
      } catch {
        // Error handled in store
      } finally {
        setIsLoading(false)
      }
    },
    [serverId, unbindMcpTool]
  )

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={handleClose} />

      {/* Panel */}
      <div className={cn('relative w-[600px] max-h-[80vh] rounded-lg shadow-xl flex flex-col', styles.bgPrimary, styles.borderColor, 'border')}>
        {/* Header */}
        <div className={cn('flex items-center justify-between p-4 border-b', styles.borderColor)}>
          <div className="flex items-center gap-2">
            <Wrench className={cn('w-5 h-5', styles.textPrimary)} />
            <h2 className={cn('text-lg font-medium', styles.textPrimary)}>
              {t('ai.mcp.toolsFor')} {server?.name}
            </h2>
          </div>
          <button className={cn('p-1 rounded', styles.hoverBg)} onClick={handleClose}>
            <X className={cn('w-5 h-5', styles.textSecondary)} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4">
          {/* Add Tool Button */}
          {!showAddTool && (
            <button
              className="flex items-center gap-2 px-3 py-2 mb-4 text-sm rounded bg-blue-600 hover:bg-blue-700 text-white"
              onClick={() => setShowAddTool(true)}
            >
              <Plus className="w-4 h-4" />
              {t('ai.mcp.addTool')}
            </button>
          )}

          {/* Add Tool Form */}
          {showAddTool && (
            <AddToolForm
              onAdd={handleAddTool}
              onCancel={() => setShowAddTool(false)}
              isLoading={isLoading}
              styles={styles}
              t={t}
            />
          )}

          {/* Tools List */}
          {tools.length === 0 ? (
            <div className={cn('flex flex-col items-center justify-center py-8', styles.textSecondary)}>
              <Wrench className="w-12 h-12 opacity-50 mb-2" />
              <p>{t('ai.mcp.noTools')}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {tools.map((tool) => (
                <ToolCard
                  key={tool.name}
                  tool={tool}
                  onRemove={() => handleRemoveTool(tool.name)}
                  isLoading={isLoading}
                  styles={styles}
                  t={t}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

interface AddToolFormProps {
  onAdd: (tool: McpTool) => void
  onCancel: () => void
  isLoading: boolean
  styles: ReturnType<typeof useAiStyles>
  t: (key: string) => string
}

function AddToolForm({ onAdd, onCancel, isLoading, styles, t }: AddToolFormProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [inputSchema, setInputSchema] = useState('{\n  "type": "object",\n  "properties": {},\n  "required": []\n}')
  const [schemaError, setSchemaError] = useState<string | null>(null)

  const handleSubmit = useCallback(() => {
    if (!name.trim() || !description.trim()) return

    try {
      const parsedSchema = JSON.parse(inputSchema)
      setSchemaError(null)

      onAdd({
        name: name.trim(),
        description: description.trim(),
        inputSchema: parsedSchema,
      })
    } catch (e) {
      setSchemaError(t('ai.mcp.invalidSchema'))
    }
  }, [name, description, inputSchema, onAdd, t])

  return (
    <div className={cn('p-4 rounded-lg border mb-4', styles.bgSecondary, styles.borderColor)}>
      <h3 className={cn('text-sm font-medium mb-3', styles.textPrimary)}>{t('ai.mcp.addTool')}</h3>

      <div className="space-y-3">
        <div>
          <label className={cn('block text-xs font-medium mb-1', styles.textSecondary)}>
            {t('ai.mcp.toolName')} *
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
            placeholder="my_tool"
          />
        </div>

        <div>
          <label className={cn('block text-xs font-medium mb-1', styles.textSecondary)}>
            {t('ai.mcp.toolDescription')} *
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
            placeholder={t('ai.mcp.toolDescriptionPlaceholder')}
          />
        </div>

        <div>
          <label className={cn('block text-xs font-medium mb-1', styles.textSecondary)}>
            {t('ai.mcp.inputSchema')} (JSON Schema)
          </label>
          <textarea
            value={inputSchema}
            onChange={(e) => setInputSchema(e.target.value)}
            className={cn(
              'w-full px-3 py-2 rounded border text-sm font-mono h-32',
              styles.inputBg,
              styles.borderColor,
              styles.textPrimary,
              'focus:outline-none focus:ring-2 focus:ring-blue-500'
            )}
          />
          {schemaError && <p className={cn('text-xs mt-1', styles.errorText)}>{schemaError}</p>}
        </div>

        <div className="flex items-center gap-2 pt-2">
          <button
            className={cn('px-3 py-1.5 text-sm rounded', styles.hoverBg, styles.textSecondary)}
            onClick={onCancel}
            disabled={isLoading}
          >
            {t('common.cancel')}
          </button>
          <button
            className="flex items-center gap-2 px-3 py-1.5 text-sm rounded bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
            onClick={handleSubmit}
            disabled={isLoading || !name.trim() || !description.trim()}
          >
            {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
            {t('common.add')}
          </button>
        </div>
      </div>
    </div>
  )
}

interface ToolCardProps {
  tool: McpTool
  onRemove: () => void
  isLoading: boolean
  styles: ReturnType<typeof useAiStyles>
  t: (key: string) => string
}

function ToolCard({ tool, onRemove, isLoading, styles, t }: ToolCardProps) {
  const [showSchema, setShowSchema] = useState(false)

  return (
    <div className={cn('p-3 rounded-lg border', styles.bgSecondary, styles.borderColor)}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <Code className={cn('w-4 h-4', styles.textPrimary)} />
            <span className={cn('font-medium font-mono text-sm', styles.textPrimary)}>{tool.name}</span>
          </div>
          <p className={cn('text-sm mt-1', styles.textSecondary)}>{tool.description}</p>

          {/* Schema Toggle */}
          <button
            className={cn('text-xs mt-2', styles.textSecondary, 'hover:text-blue-500')}
            onClick={() => setShowSchema(!showSchema)}
          >
            {showSchema ? t('ai.mcp.hideSchema') : t('ai.mcp.showSchema')}
          </button>

          {showSchema && (
            <pre className={cn('mt-2 p-2 rounded text-xs overflow-auto max-h-40', styles.hoverBg, styles.textSecondary)}>
              {JSON.stringify(tool.inputSchema, null, 2)}
            </pre>
          )}
        </div>

        <button
          className={cn('p-1.5 rounded', styles.hoverBg, styles.errorText)}
          onClick={onRemove}
          disabled={isLoading}
          title={t('common.delete')}
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
