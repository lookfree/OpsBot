/**
 * Topic Config Dialog Component
 *
 * Dialog for viewing and editing Kafka topic configuration.
 */

import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import * as Dialog from '@radix-ui/react-dialog'
import { X, RefreshCw, Save, Lock, EyeOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useThemeStore } from '@/stores'
import { mwKafkaGetTopicConfig, mwKafkaUpdateTopicConfig, type TopicConfig } from '@/services/middleware'

interface TopicConfigDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  connectionId: string
  topicName: string
}

export function TopicConfigDialog({ open, onOpenChange, connectionId, topicName }: TopicConfigDialogProps) {
  const { t } = useTranslation()
  const { theme } = useThemeStore()
  const isDark = theme === 'dark'

  const [configs, setConfigs] = useState<TopicConfig[]>([])
  const [editedConfigs, setEditedConfigs] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showDefaults, setShowDefaults] = useState(false)

  // Theme styles
  const dialogBg = isDark ? 'bg-dark-bg-primary' : 'bg-light-bg-primary'
  const borderColor = isDark ? 'border-dark-border' : 'border-light-border'
  const textPrimary = isDark ? 'text-dark-text-primary' : 'text-light-text-primary'
  const textSecondary = isDark ? 'text-dark-text-secondary' : 'text-light-text-secondary'
  const bgSecondary = isDark ? 'bg-dark-bg-secondary' : 'bg-light-bg-secondary'
  const hoverBg = isDark ? 'hover:bg-dark-bg-hover' : 'hover:bg-light-bg-hover'

  // Load config
  const loadConfig = useCallback(async () => {
    if (!topicName) return
    setLoading(true)
    setError(null)
    try {
      const result = await mwKafkaGetTopicConfig(connectionId, topicName)
      setConfigs(result)
      setEditedConfigs({})
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }, [connectionId, topicName])

  useEffect(() => {
    if (open && topicName) {
      loadConfig()
    }
  }, [open, topicName, loadConfig])

  // Handle value change
  const handleValueChange = (name: string, value: string) => {
    setEditedConfigs((prev) => ({
      ...prev,
      [name]: value,
    }))
  }

  // Save changes
  const handleSave = async () => {
    if (Object.keys(editedConfigs).length === 0) return

    setSaving(true)
    setError(null)
    try {
      await mwKafkaUpdateTopicConfig(connectionId, topicName, editedConfigs)
      await loadConfig()
    } catch (err) {
      setError(String(err))
    } finally {
      setSaving(false)
    }
  }

  // Filter configs
  const filteredConfigs = showDefaults ? configs : configs.filter((c) => !c.isDefault)
  const hasChanges = Object.keys(editedConfigs).length > 0

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
        <Dialog.Content
          className={cn(
            'fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2',
            'rounded-lg shadow-xl z-50 w-[700px] max-h-[80vh] p-0 outline-none border flex flex-col',
            dialogBg,
            borderColor
          )}
        >
          {/* Header */}
          <div className={cn('flex items-center justify-between px-4 py-3 border-b', borderColor)}>
            <Dialog.Title className={cn('text-base font-medium', textPrimary)}>
              {t('kafka.topicConfiguration')}: {topicName}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button className={cn('p-1 rounded transition-colors', hoverBg)}>
                <X className={cn('w-4 h-4', textSecondary)} />
              </button>
            </Dialog.Close>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-hidden flex flex-col p-4">
            {/* Toolbar */}
            <div className="flex items-center gap-2 mb-4">
              <label className={cn('flex items-center gap-2 text-sm', textSecondary)}>
                <input
                  type="checkbox"
                  checked={showDefaults}
                  onChange={(e) => setShowDefaults(e.target.checked)}
                  className="rounded"
                />
                {t('kafka.showDefaultConfigs')}
              </label>
              <div className="flex-1" />
              <button
                onClick={loadConfig}
                disabled={loading}
                className={cn('p-2 rounded', hoverBg)}
              >
                <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
              </button>
            </div>

            {error && (
              <div className="mb-4 px-3 py-2 text-sm bg-status-error/10 text-status-error border border-status-error/30 rounded">
                {error}
              </div>
            )}

            {/* Config Table */}
            <div className={cn('flex-1 overflow-auto rounded border', borderColor)}>
              <table className="w-full">
                <thead className={cn('sticky top-0', bgSecondary)}>
                  <tr className={cn('border-b', borderColor)}>
                    <th className={cn('px-4 py-2 text-left text-sm font-medium', textPrimary)}>{t('kafka.configName')}</th>
                    <th className={cn('px-4 py-2 text-left text-sm font-medium', textPrimary)}>{t('kafka.configValue')}</th>
                    <th className={cn('px-4 py-2 text-center text-sm font-medium w-20', textPrimary)}>{t('kafka.status')}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredConfigs.map((config) => (
                    <tr key={config.name} className={cn('border-b', borderColor)}>
                      <td className="px-4 py-2 text-sm font-mono">
                        <div className="flex items-center gap-2">
                          {config.name}
                          {config.isReadOnly && (
                            <Lock className="w-3 h-3 text-status-warning" />
                          )}
                          {config.isSensitive && (
                            <EyeOff className="w-3 h-3 text-status-error" />
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2">
                        {config.isReadOnly || config.isSensitive ? (
                          <span className={cn('text-sm', textSecondary)}>
                            {config.isSensitive ? '••••••••' : config.value}
                          </span>
                        ) : (
                          <input
                            type="text"
                            value={editedConfigs[config.name] ?? config.value}
                            onChange={(e) => handleValueChange(config.name, e.target.value)}
                            className={cn(
                              'w-full px-2 py-1 rounded text-sm',
                              'border bg-transparent',
                              borderColor,
                              'focus:outline-none focus:border-accent-primary',
                              editedConfigs[config.name] !== undefined && 'border-accent-primary'
                            )}
                          />
                        )}
                      </td>
                      <td className="px-4 py-2 text-center">
                        {config.isDefault ? (
                          <span className={cn('text-xs', textSecondary)}>{t('kafka.configDefault')}</span>
                        ) : (
                          <span className="text-xs text-accent-primary">{t('kafka.configCustom')}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {filteredConfigs.length === 0 && (
                    <tr>
                      <td colSpan={3} className={cn('px-4 py-8 text-center', textSecondary)}>
                        {loading ? t('common.loading') : t('kafka.noConfigs')}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Footer */}
          <div className={cn('flex justify-end gap-2 px-4 py-3 border-t', borderColor)}>
            <button
              onClick={() => onOpenChange(false)}
              className={cn(
                'px-4 py-1.5 text-sm rounded-md border transition-colors',
                borderColor,
                textPrimary,
                hoverBg
              )}
            >
              {t('common.close')}
            </button>
            <button
              onClick={handleSave}
              disabled={!hasChanges || saving}
              className={cn(
                'px-4 py-1.5 text-sm rounded-md text-white transition-colors flex items-center gap-2',
                'bg-accent-primary hover:bg-accent-hover',
                'disabled:opacity-50 disabled:cursor-not-allowed'
              )}
            >
              <Save className="w-4 h-4" />
              {saving ? t('common.saving') : t('common.save')}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
