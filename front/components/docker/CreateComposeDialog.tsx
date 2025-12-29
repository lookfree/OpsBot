/**
 * Create Compose Dialog Component
 *
 * Dialog for creating new Docker Compose projects.
 */

import { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Layers, Loader2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { dockerCreateComposeProject } from '@/services/docker'

interface CreateComposeDialogProps {
  connectionId: string
  onClose: () => void
  onSuccess: () => void
  isDark: boolean
}

const DEFAULT_COMPOSE_CONTENT = `version: '3.8'

services:
  app:
    image: nginx:latest
    ports:
      - "8080:80"
    restart: unless-stopped
`

export function CreateComposeDialog({
  connectionId,
  onClose,
  onSuccess,
  isDark,
}: CreateComposeDialogProps) {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [content, setContent] = useState(DEFAULT_COMPOSE_CONTENT)
  const [path, setPath] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Theme styles
  const bgPrimary = isDark ? 'bg-dark-bg-primary' : 'bg-light-bg-primary'
  const bgSecondary = isDark ? 'bg-dark-bg-secondary' : 'bg-light-bg-secondary'
  const borderColor = isDark ? 'border-dark-border' : 'border-light-border'
  const textPrimary = isDark ? 'text-dark-text-primary' : 'text-light-text-primary'
  const textSecondary = isDark ? 'text-dark-text-secondary' : 'text-light-text-secondary'

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      if (!name.trim()) return

      setLoading(true)
      setError(null)

      try {
        await dockerCreateComposeProject(connectionId, {
          name: name.trim(),
          content: content.trim(),
          path: path.trim() || undefined,
        })
        onSuccess()
      } catch (err) {
        setError(String(err))
      } finally {
        setLoading(false)
      }
    },
    [connectionId, name, content, path, onSuccess]
  )

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div
        className={cn(
          'w-[700px] max-h-[80vh] rounded-lg shadow-xl flex flex-col',
          bgPrimary,
          borderColor,
          'border'
        )}
      >
        {/* Header */}
        <div className={cn('flex items-center justify-between px-4 py-3 border-b', borderColor)}>
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-accent-primary" />
            <h3 className={cn('font-medium', textPrimary)}>{t('docker.createCompose')}</h3>
          </div>
          <button
            onClick={onClose}
            className={cn('p-1 rounded hover:bg-dark-bg-hover transition-colors', textSecondary)}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-auto p-4 space-y-4">
            {error && (
              <div className="px-3 py-2 rounded bg-status-error/10 text-status-error text-sm">
                {error}
              </div>
            )}

            {/* Project Name */}
            <div>
              <label className={cn('block text-sm font-medium mb-1', textSecondary)}>
                {t('docker.projectName')} *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="my-project"
                className={cn(
                  'w-full px-3 py-2 rounded border text-sm',
                  bgSecondary,
                  borderColor,
                  textPrimary,
                  'focus:outline-none focus:ring-2 focus:ring-accent-primary'
                )}
                autoFocus
              />
              <p className={cn('mt-1 text-xs', textSecondary)}>
                {t('docker.projectNameHint')}
              </p>
            </div>

            {/* Project Path (Optional) */}
            <div>
              <label className={cn('block text-sm font-medium mb-1', textSecondary)}>
                {t('docker.projectPath')}
              </label>
              <input
                type="text"
                value={path}
                onChange={(e) => setPath(e.target.value)}
                placeholder="/opt/docker-compose/my-project"
                className={cn(
                  'w-full px-3 py-2 rounded border text-sm',
                  bgSecondary,
                  borderColor,
                  textPrimary,
                  'focus:outline-none focus:ring-2 focus:ring-accent-primary'
                )}
              />
              <p className={cn('mt-1 text-xs', textSecondary)}>
                {t('docker.projectPathHint')}
              </p>
            </div>

            {/* Compose Content */}
            <div className="flex-1">
              <label className={cn('block text-sm font-medium mb-1', textSecondary)}>
                docker-compose.yml *
              </label>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className={cn(
                  'w-full h-64 px-3 py-2 rounded border text-sm font-mono',
                  bgSecondary,
                  borderColor,
                  textPrimary,
                  'focus:outline-none focus:ring-2 focus:ring-accent-primary',
                  'resize-none'
                )}
                spellCheck={false}
              />
            </div>
          </div>

          {/* Actions */}
          <div className={cn('flex justify-end gap-2 px-4 py-3 border-t', borderColor)}>
            <button
              type="button"
              onClick={onClose}
              className={cn(
                'px-4 py-2 text-sm rounded',
                bgSecondary,
                textSecondary,
                'hover:opacity-80 transition-opacity'
              )}
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={!name.trim() || !content.trim() || loading}
              className={cn(
                'px-4 py-2 text-sm rounded flex items-center gap-2',
                'bg-accent-primary text-white',
                'hover:bg-accent-hover transition-colors',
                'disabled:opacity-50 disabled:cursor-not-allowed'
              )}
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {t('common.confirm')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
