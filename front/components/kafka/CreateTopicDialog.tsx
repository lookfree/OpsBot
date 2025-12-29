/**
 * Create Topic Dialog Component
 *
 * Dialog for creating a new Kafka topic.
 */

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useThemeStore } from '@/stores'
import { mwKafkaCreateTopic } from '@/services/middleware'

interface CreateTopicDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  connectionId: string
  onSuccess: () => void
}

export function CreateTopicDialog({ open, onOpenChange, connectionId, onSuccess }: CreateTopicDialogProps) {
  const { t } = useTranslation()
  const { theme } = useThemeStore()
  const isDark = theme === 'dark'

  const [topicName, setTopicName] = useState('')
  const [partitions, setPartitions] = useState(1)
  const [replicationFactor, setReplicationFactor] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async () => {
    if (!topicName.trim()) {
      setError(t('kafka.topicNameRequired'))
      return
    }

    setLoading(true)
    setError(null)

    try {
      await mwKafkaCreateTopic({
        connectionId,
        name: topicName.trim(),
        partitions,
        replicationFactor,
      })
      onSuccess()
      onOpenChange(false)
      resetForm()
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }

  const resetForm = () => {
    setTopicName('')
    setPartitions(1)
    setReplicationFactor(1)
    setError(null)
  }

  // Theme styles
  const dialogBg = isDark ? 'bg-dark-bg-primary' : 'bg-light-bg-primary'
  const borderColor = isDark ? 'border-dark-border' : 'border-light-border'
  const textPrimary = isDark ? 'text-dark-text-primary' : 'text-light-text-primary'
  const textSecondary = isDark ? 'text-dark-text-secondary' : 'text-light-text-secondary'
  const hoverBg = isDark ? 'hover:bg-dark-bg-hover' : 'hover:bg-light-bg-hover'

  const inputStyles = cn(
    'w-full px-3 py-2 rounded text-sm',
    'border bg-transparent',
    borderColor,
    'focus:outline-none focus:border-accent-primary'
  )

  const labelStyles = cn('block text-sm font-medium mb-1', textSecondary)

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
        <Dialog.Content
          className={cn(
            'fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2',
            'rounded-lg shadow-xl z-50 w-[400px] p-0 outline-none border',
            dialogBg,
            borderColor
          )}
        >
          {/* Header */}
          <div className={cn('flex items-center justify-between px-4 py-3 border-b', borderColor)}>
            <Dialog.Title className={cn('text-base font-medium', textPrimary)}>
              {t('kafka.createTopic')}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button className={cn('p-1 rounded transition-colors', hoverBg)}>
                <X className={cn('w-4 h-4', textSecondary)} />
              </button>
            </Dialog.Close>
          </div>

          {/* Content */}
          <div className="p-4 space-y-4">
            {error && (
              <div className="px-3 py-2 text-sm bg-status-error/10 text-status-error border border-status-error/30 rounded">
                {error}
              </div>
            )}

            <div>
              <label className={labelStyles}>{t('kafka.topicName')}</label>
              <input
                type="text"
                value={topicName}
                onChange={(e) => setTopicName(e.target.value)}
                placeholder={t('kafka.topicNamePlaceholder')}
                className={inputStyles}
                autoFocus
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelStyles}>{t('kafka.partitions')}</label>
                <input
                  type="number"
                  value={partitions}
                  onChange={(e) => setPartitions(Math.max(1, parseInt(e.target.value) || 1))}
                  min={1}
                  className={inputStyles}
                />
              </div>
              <div>
                <label className={labelStyles}>{t('kafka.replicationFactor')}</label>
                <input
                  type="number"
                  value={replicationFactor}
                  onChange={(e) => setReplicationFactor(Math.max(1, parseInt(e.target.value) || 1))}
                  min={1}
                  className={inputStyles}
                />
              </div>
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
              {t('common.cancel')}
            </button>
            <button
              onClick={handleSubmit}
              disabled={loading}
              className={cn(
                'px-4 py-1.5 text-sm rounded-md text-white transition-colors',
                'bg-accent-primary hover:bg-accent-hover',
                'disabled:opacity-50 disabled:cursor-not-allowed'
              )}
            >
              {loading ? t('common.creating') : t('common.create')}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
