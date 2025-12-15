/**
 * File Editor Component
 *
 * Simple text editor for remote files with syntax highlighting.
 */

import { useState, useEffect, useCallback } from 'react'
import {
  XIcon,
  SaveIcon,
  Loader2Icon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  sftpReadFile,
  sftpWriteFile,
  FileEntry,
} from '@/services/sftp'
import { useTranslation } from 'react-i18next'

interface FileEditorProps {
  sessionId: string
  file: FileEntry | null
  onClose: () => void
}

export function FileEditor({ sessionId, file, onClose }: FileEditorProps) {
  const { t } = useTranslation()
  const [content, setContent] = useState('')
  const [originalContent, setOriginalContent] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const hasChanges = content !== originalContent

  // Load file content
  useEffect(() => {
    if (!file || !sessionId) return

    const loadFile = async () => {
      setLoading(true)
      setError(null)

      try {
        const base64 = await sftpReadFile(sessionId, file.path)
        const text = atob(base64)
        setContent(text)
        setOriginalContent(text)
      } catch (err) {
        setError(String(err))
      } finally {
        setLoading(false)
      }
    }

    loadFile()
  }, [file, sessionId])

  // Save file
  const handleSave = useCallback(async () => {
    if (!file || !sessionId || !hasChanges) return

    setSaving(true)
    setError(null)

    try {
      const base64 = btoa(content)
      await sftpWriteFile(sessionId, file.path, base64)
      setOriginalContent(content)
    } catch (err) {
      setError(String(err))
    } finally {
      setSaving(false)
    }
  }, [file, sessionId, content, hasChanges])

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        handleSave()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleSave])

  if (!file) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-zinc-900 border border-zinc-700 rounded-lg w-[800px] max-w-[90vw] h-[600px] max-h-[80vh] flex flex-col shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-700">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-zinc-300">{file.name}</span>
            {hasChanges && (
              <span className="text-xs text-yellow-500">({t('sftp.unsaved')})</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              disabled={!hasChanges || saving}
              className={cn(
                'flex items-center gap-1 px-3 py-1.5 rounded text-sm',
                hasChanges
                  ? 'bg-blue-600 hover:bg-blue-500 text-white'
                  : 'bg-zinc-700 text-zinc-400 cursor-not-allowed'
              )}
            >
              {saving ? (
                <Loader2Icon className="w-4 h-4 animate-spin" />
              ) : (
                <SaveIcon className="w-4 h-4" />
              )}
              {t('common.save')}
            </button>
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-zinc-700 rounded"
              title={t('common.close')}
            >
              <XIcon className="w-4 h-4 text-zinc-400" />
            </button>
          </div>
        </div>

        {/* Error message */}
        {error && (
          <div className="px-4 py-2 bg-red-900/50 text-red-300 text-xs">
            {error}
            <button onClick={() => setError(null)} className="ml-2 underline">
              {t('common.dismiss')}
            </button>
          </div>
        )}

        {/* Editor */}
        <div className="flex-1 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center h-full text-zinc-500">
              <Loader2Icon className="w-6 h-6 animate-spin mr-2" />
              {t('common.loading')}
            </div>
          ) : (
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="w-full h-full bg-zinc-950 text-zinc-300 p-4 resize-none outline-none font-mono text-sm leading-relaxed"
              spellCheck={false}
            />
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-zinc-700 text-xs text-zinc-500 flex items-center justify-between">
          <span>{file.path}</span>
          <span>
            {content.split('\n').length} {t('sftp.lines')} | {content.length} {t('sftp.chars')}
          </span>
        </div>
      </div>
    </div>
  )
}
