/**
 * Image List Component
 *
 * Displays Docker images with tags and action buttons.
 */

import { useState, useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Download,
  Trash2,
  RefreshCw,
  Loader2,
  AlertCircle,
  Package,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useThemeStore } from '@/stores'
import {
  dockerListImages,
  dockerPullImage,
  dockerRemoveImage,
  formatBytes,
  formatTimestamp,
  type ImageInfo,
} from '@/services/docker'

interface ImageListProps {
  connectionId: string
}

export function ImageList({ connectionId }: ImageListProps) {
  const { t } = useTranslation()
  const { theme } = useThemeStore()
  const isDark = theme === 'dark'

  const [images, setImages] = useState<ImageInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({})
  const [pullDialogOpen, setPullDialogOpen] = useState(false)
  const [pullImageName, setPullImageName] = useState('')
  const [pulling, setPulling] = useState(false)

  const loadImages = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await dockerListImages(connectionId)
      setImages(data)
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }, [connectionId])

  useEffect(() => {
    loadImages()
  }, [loadImages])

  const handleRemoveImage = useCallback(
    async (imageId: string) => {
      setActionLoading((prev) => ({ ...prev, [imageId]: true }))
      try {
        await dockerRemoveImage(connectionId, imageId, true)
        await loadImages()
      } catch (err) {
        setError(String(err))
      } finally {
        setActionLoading((prev) => {
          const next = { ...prev }
          delete next[imageId]
          return next
        })
      }
    },
    [connectionId, loadImages]
  )

  const handlePullImage = useCallback(async () => {
    if (!pullImageName.trim()) return

    setPulling(true)
    setError(null)
    try {
      await dockerPullImage(connectionId, pullImageName.trim())
      await loadImages()
      setPullDialogOpen(false)
      setPullImageName('')
    } catch (err) {
      setError(String(err))
    } finally {
      setPulling(false)
    }
  }, [connectionId, pullImageName, loadImages])

  // Theme styles
  const bgPrimary = isDark ? 'bg-dark-bg-primary' : 'bg-light-bg-primary'
  const bgSecondary = isDark ? 'bg-dark-bg-secondary' : 'bg-light-bg-secondary'
  const borderColor = isDark ? 'border-dark-border' : 'border-light-border'
  const textPrimary = isDark ? 'text-dark-text-primary' : 'text-light-text-primary'
  const textSecondary = isDark ? 'text-dark-text-secondary' : 'text-light-text-secondary'
  const hoverBg = isDark ? 'hover:bg-dark-bg-hover' : 'hover:bg-light-bg-hover'
  const inputBg = isDark ? 'bg-dark-bg-hover' : 'bg-light-bg-primary'

  return (
    <div className={cn('h-full flex flex-col', bgPrimary)}>
      {/* Toolbar */}
      <div className={cn('flex items-center justify-between px-4 py-2 border-b', borderColor)}>
        <h3 className={cn('font-medium', textPrimary)}>{t('docker.images')}</h3>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPullDialogOpen(true)}
            className={cn(
              'flex items-center gap-1 px-3 py-1.5 rounded text-sm transition-colors',
              'bg-accent-primary text-white hover:bg-accent-hover'
            )}
          >
            <Download className="w-4 h-4" />
            {t('docker.pullImage')}
          </button>
          <button
            onClick={loadImages}
            disabled={loading}
            className={cn(
              'p-1.5 rounded transition-colors',
              hoverBg,
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
            title={t('common.refresh')}
          >
            <RefreshCw className={cn('w-4 h-4', textSecondary, loading && 'animate-spin')} />
          </button>
        </div>
      </div>

      {/* Pull Image Dialog */}
      {pullDialogOpen && (
        <div className={cn('px-4 py-3 border-b', borderColor, bgSecondary)}>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={pullImageName}
              onChange={(e) => setPullImageName(e.target.value)}
              placeholder={t('docker.enterImageName')}
              className={cn(
                'flex-1 px-3 py-2 rounded border text-sm',
                'focus:outline-none focus:border-accent-primary',
                inputBg,
                borderColor,
                textPrimary
              )}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handlePullImage()
                if (e.key === 'Escape') {
                  setPullDialogOpen(false)
                  setPullImageName('')
                }
              }}
              autoFocus
            />
            <button
              onClick={handlePullImage}
              disabled={pulling || !pullImageName.trim()}
              className={cn(
                'flex items-center gap-1 px-3 py-2 rounded text-sm transition-colors',
                'bg-accent-primary text-white hover:bg-accent-hover',
                'disabled:opacity-50 disabled:cursor-not-allowed'
              )}
            >
              {pulling && <Loader2 className="w-4 h-4 animate-spin" />}
              {pulling ? t('docker.pulling') : t('docker.pullImage')}
            </button>
            <button
              onClick={() => {
                setPullDialogOpen(false)
                setPullImageName('')
              }}
              className={cn('px-3 py-2 rounded text-sm border transition-colors', borderColor, hoverBg)}
            >
              {t('common.cancel')}
            </button>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {error && images.length > 0 && (
          <div className="flex items-center gap-2 px-4 py-2 text-sm text-status-error bg-status-error/10 border-b border-status-error/20">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span className="flex-1">{error}</span>
            <button onClick={() => setError(null)} className="opacity-70 hover:opacity-100">✕</button>
          </div>
        )}
        {loading && images.length === 0 ? (
          <div className={cn('flex items-center justify-center h-32', textSecondary)}>
            <Loader2 className="w-6 h-6 animate-spin mr-2" />
            {t('common.loading')}
          </div>
        ) : error && images.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-status-error">
            <AlertCircle className="w-5 h-5 mr-2" />
            {error}
          </div>
        ) : images.length === 0 ? (
          <div className={cn('flex flex-col items-center justify-center h-32 gap-2', textSecondary)}>
            <Package className="w-8 h-8" />
            {t('docker.noImages')}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className={cn(bgSecondary)}>
              <tr className={borderColor}>
                <th className={cn('px-4 py-2 text-left font-medium', textSecondary)}>
                  {t('docker.imageTags')}
                </th>
                <th className={cn('px-4 py-2 text-left font-medium', textSecondary)}>ID</th>
                <th className={cn('px-4 py-2 text-left font-medium', textSecondary)}>
                  {t('docker.imageSize')}
                </th>
                <th className={cn('px-4 py-2 text-left font-medium', textSecondary)}>
                  {t('docker.imageCreated')}
                </th>
                <th className={cn('px-4 py-2 text-right font-medium', textSecondary)}>
                  {t('common.actions')}
                </th>
              </tr>
            </thead>
            <tbody>
              {images.map((image) => {
                const isLoading = actionLoading[image.id]
                const displayId = image.id.replace('sha256:', '').substring(0, 12)

                return (
                  <tr
                    key={image.id}
                    className={cn('border-b', borderColor, hoverBg, 'transition-colors')}
                  >
                    <td className={cn('px-4 py-2', textPrimary)}>
                      {image.tags.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {image.tags.map((tag) => (
                            <span
                              key={tag}
                              className={cn(
                                'px-2 py-0.5 rounded text-xs font-mono',
                                bgSecondary,
                                borderColor,
                                'border'
                              )}
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className={textSecondary}>&lt;none&gt;</span>
                      )}
                    </td>
                    <td className={cn('px-4 py-2 font-mono text-xs', textSecondary)}>
                      {displayId}
                    </td>
                    <td className={cn('px-4 py-2', textSecondary)}>{formatBytes(image.size)}</td>
                    <td className={cn('px-4 py-2 text-xs', textSecondary)}>
                      {formatTimestamp(image.created)}
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex items-center justify-end">
                        <button
                          onClick={() => handleRemoveImage(image.id)}
                          disabled={isLoading}
                          className={cn(
                            'p-1.5 rounded transition-colors',
                            hoverBg,
                            'disabled:opacity-50 disabled:cursor-not-allowed'
                          )}
                          title={t('docker.removeImage')}
                        >
                          {isLoading ? (
                            <Loader2 className="w-4 h-4 animate-spin text-status-error" />
                          ) : (
                            <Trash2 className="w-4 h-4 text-status-error" />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
