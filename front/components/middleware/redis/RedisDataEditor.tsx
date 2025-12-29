/**
 * Redis Data Editor Component
 *
 * Edit Redis values for different data types (String, List, Set, Hash, ZSet, Stream).
 */

import { useState, useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import {
  Save,
  X,
  Plus,
  Trash2,
  RefreshCw,
  Clock,
  Copy,
  Edit2,
  Check,
} from 'lucide-react'
import {
  mwRedisGetValue,
  mwRedisSetValue,
  mwRedisGetKeyTtl,
  mwRedisSetKeyTtl,
  mwRedisDeleteKeys,
  mwRedisRenameKey,
  type RedisValue,
  type RedisSetRequest,
} from '@/services/middleware'

interface ThemeStyles {
  bgSecondary: string
  borderColor: string
  textPrimary: string
  textSecondary: string
  hoverBg: string
  isDark: boolean
}

interface RedisDataEditorProps {
  connectionId: string
  keyName: string
  onClose: () => void
  onKeyDeleted: () => void
  onKeyRenamed: (newKey: string) => void
  styles: ThemeStyles
}

export function RedisDataEditor({
  connectionId,
  keyName,
  onClose,
  onKeyDeleted,
  onKeyRenamed,
  styles,
}: RedisDataEditorProps) {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [value, setValue] = useState<RedisValue | null>(null)
  const [ttl, setTtl] = useState<number>(-1)
  const [editingTtl, setEditingTtl] = useState(false)
  const [newTtl, setNewTtl] = useState('')
  const [editingName, setEditingName] = useState(false)
  const [newName, setNewName] = useState('')
  const [error, setError] = useState<string | null>(null)

  // Load key value and TTL
  const loadValue = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [val, keyTtl] = await Promise.all([
        mwRedisGetValue(connectionId, keyName),
        mwRedisGetKeyTtl(connectionId, keyName),
      ])
      setValue(val)
      setTtl(keyTtl)
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }, [connectionId, keyName])

  useEffect(() => {
    loadValue()
  }, [loadValue])

  // Save value
  const handleSave = useCallback(async () => {
    if (!value) return

    setSaving(true)
    try {
      const request: RedisSetRequest = {
        key: keyName,
        value: value,
        ttl: ttl > 0 ? ttl : undefined,
      }
      await mwRedisSetValue(connectionId, request)
    } catch (err) {
      setError(String(err))
    } finally {
      setSaving(false)
    }
  }, [connectionId, keyName, value, ttl])

  // Update TTL
  const handleUpdateTtl = useCallback(async () => {
    const newTtlNum = parseInt(newTtl)
    if (isNaN(newTtlNum)) return

    try {
      await mwRedisSetKeyTtl(connectionId, keyName, newTtlNum)
      setTtl(newTtlNum)
      setEditingTtl(false)
    } catch (err) {
      setError(String(err))
    }
  }, [connectionId, keyName, newTtl])

  // Rename key
  const handleRename = useCallback(async () => {
    if (!newName.trim() || newName === keyName) {
      setEditingName(false)
      return
    }

    try {
      await mwRedisRenameKey(connectionId, keyName, newName)
      onKeyRenamed(newName)
      setEditingName(false)
    } catch (err) {
      setError(String(err))
    }
  }, [connectionId, keyName, newName, onKeyRenamed])

  // Delete key
  const handleDelete = useCallback(async () => {
    const confirmed = window.confirm(
      t('redis.confirmDeleteKey', 'Are you sure you want to delete this key?')
    )
    if (!confirmed) return

    try {
      await mwRedisDeleteKeys(connectionId, [keyName])
      onKeyDeleted()
    } catch (err) {
      setError(String(err))
    }
  }, [connectionId, keyName, onKeyDeleted, t])

  // Copy key name
  const handleCopyKey = useCallback(() => {
    navigator.clipboard.writeText(keyName)
  }, [keyName])

  // Format TTL display
  const formatTtl = (seconds: number): string => {
    if (seconds === -1) return t('redis.noExpire', 'No expire')
    if (seconds === -2) return t('redis.expired', 'Expired')
    const d = Math.floor(seconds / 86400)
    const h = Math.floor((seconds % 86400) / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = seconds % 60
    const parts = []
    if (d > 0) parts.push(`${d}d`)
    if (h > 0) parts.push(`${h}h`)
    if (m > 0) parts.push(`${m}m`)
    if (s > 0 || parts.length === 0) parts.push(`${s}s`)
    return parts.join(' ')
  }

  if (loading) {
    return (
      <div className={cn('flex items-center justify-center h-full', styles.textSecondary)}>
        <RefreshCw className="w-6 h-6 animate-spin" />
      </div>
    )
  }

  if (error && !value) {
    return (
      <div className={cn('flex flex-col items-center justify-center h-full', styles.textSecondary)}>
        <p className="text-status-error mb-4">{error}</p>
        <button
          onClick={loadValue}
          className="px-4 py-2 rounded bg-accent-primary text-white hover:bg-accent-hover"
        >
          {t('common.retry', 'Retry')}
        </button>
      </div>
    )
  }

  return (
    <div className={cn('flex flex-col h-full', styles.textPrimary)}>
      {/* Header */}
      <div className={cn('flex items-center justify-between px-4 py-3 border-b', styles.borderColor)}>
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {editingName ? (
            <div className="flex items-center gap-2 flex-1">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleRename()}
                className={cn(
                  'flex-1 px-2 py-1 rounded border text-sm font-mono',
                  'focus:outline-none focus:border-accent-primary',
                  styles.borderColor,
                  styles.isDark ? 'bg-dark-bg-hover' : 'bg-light-bg-primary'
                )}
                autoFocus
              />
              <button onClick={handleRename} className="p-1 text-accent-primary">
                <Check className="w-4 h-4" />
              </button>
              <button onClick={() => setEditingName(false)} className="p-1 text-status-error">
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <>
              <span className="font-mono text-sm truncate">{keyName}</span>
              <button
                onClick={() => {
                  setNewName(keyName)
                  setEditingName(true)
                }}
                className={cn('p-1 rounded', styles.hoverBg)}
                title={t('redis.rename', 'Rename')}
              >
                <Edit2 className="w-3 h-3" />
              </button>
              <button
                onClick={handleCopyKey}
                className={cn('p-1 rounded', styles.hoverBg)}
                title={t('common.copy', 'Copy')}
              >
                <Copy className="w-3 h-3" />
              </button>
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Type badge */}
          {value && (
            <span className="px-2 py-0.5 text-xs font-mono rounded bg-accent-primary/20 text-accent-primary uppercase">
              {value.type}
            </span>
          )}

          {/* TTL */}
          <div className="flex items-center gap-1">
            <Clock className={cn('w-4 h-4', styles.textSecondary)} />
            {editingTtl ? (
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  value={newTtl}
                  onChange={(e) => setNewTtl(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleUpdateTtl()}
                  placeholder="seconds"
                  className={cn(
                    'w-20 px-2 py-0.5 rounded border text-xs',
                    'focus:outline-none focus:border-accent-primary',
                    styles.borderColor,
                    styles.isDark ? 'bg-dark-bg-hover' : 'bg-light-bg-primary'
                  )}
                  autoFocus
                />
                <button onClick={handleUpdateTtl} className="p-0.5 text-accent-primary">
                  <Check className="w-3 h-3" />
                </button>
                <button onClick={() => setEditingTtl(false)} className="p-0.5 text-status-error">
                  <X className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => {
                  setNewTtl(ttl > 0 ? String(ttl) : '')
                  setEditingTtl(true)
                }}
                className={cn('text-xs', styles.textSecondary, 'hover:text-accent-primary')}
              >
                {formatTtl(ttl)}
              </button>
            )}
          </div>

          <button
            onClick={loadValue}
            className={cn('p-1.5 rounded', styles.hoverBg)}
            title={t('common.refresh')}
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={handleDelete}
            className={cn('p-1.5 rounded text-status-error', styles.hoverBg)}
            title={t('common.delete')}
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <button onClick={onClose} className={cn('p-1.5 rounded', styles.hoverBg)}>
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Error display */}
      {error && (
        <div className="px-4 py-2 text-sm text-status-error bg-status-error/10 border-b border-status-error/30">
          {error}
        </div>
      )}

      {/* Content Editor */}
      <div className="flex-1 overflow-auto p-4">
        {value && <ValueEditor value={value} onChange={setValue} styles={styles} />}
      </div>

      {/* Footer */}
      <div className={cn('flex items-center justify-end gap-2 px-4 py-3 border-t', styles.borderColor)}>
        <button
          onClick={onClose}
          className={cn('px-4 py-1.5 rounded border text-sm', styles.borderColor, styles.hoverBg)}
        >
          {t('common.cancel')}
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-1.5 rounded bg-accent-primary text-white text-sm hover:bg-accent-hover disabled:opacity-50 flex items-center gap-2"
        >
          <Save className="w-4 h-4" />
          {saving ? t('common.saving', 'Saving...') : t('common.save')}
        </button>
      </div>
    </div>
  )
}

// Value Editor based on type
interface ValueEditorProps {
  value: RedisValue
  onChange: (value: RedisValue) => void
  styles: ThemeStyles
}

function ValueEditor({ value, onChange, styles }: ValueEditorProps) {
  const { t } = useTranslation()

  switch (value.type) {
    case 'String':
      return (
        <StringEditor
          value={value.data}
          onChange={(data) => onChange({ type: 'String', data })}
          styles={styles}
        />
      )
    case 'List':
      return (
        <ListEditor
          value={value.data}
          onChange={(data) => onChange({ type: 'List', data })}
          styles={styles}
        />
      )
    case 'Set':
      return (
        <SetEditor
          value={value.data}
          onChange={(data) => onChange({ type: 'Set', data })}
          styles={styles}
        />
      )
    case 'Hash':
      return (
        <HashEditor
          value={value.data}
          onChange={(data) => onChange({ type: 'Hash', data })}
          styles={styles}
        />
      )
    case 'ZSet':
      return (
        <ZSetEditor
          value={value.data}
          onChange={(data) => onChange({ type: 'ZSet', data })}
          styles={styles}
        />
      )
    case 'Stream':
      return <StreamViewer value={value.data} styles={styles} />
    case 'None':
      return (
        <div className={cn('text-center py-8', styles.textSecondary)}>
          {t('redis.keyNotFound', 'Key not found')}
        </div>
      )
    default:
      return null
  }
}

// String Editor
function StringEditor({
  value,
  onChange,
  styles,
}: {
  value: string
  onChange: (v: string) => void
  styles: ThemeStyles
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        'w-full h-full min-h-[200px] p-3 rounded border font-mono text-sm resize-none',
        'focus:outline-none focus:border-accent-primary',
        styles.borderColor,
        styles.isDark ? 'bg-dark-bg-hover' : 'bg-light-bg-primary'
      )}
    />
  )
}

// List Editor
function ListEditor({
  value,
  onChange,
  styles,
}: {
  value: string[]
  onChange: (v: string[]) => void
  styles: ThemeStyles
}) {
  const { t } = useTranslation()

  const handleAdd = () => onChange([...value, ''])
  const handleRemove = (index: number) => onChange(value.filter((_, i) => i !== index))
  const handleChange = (index: number, newValue: string) =>
    onChange(value.map((v, i) => (i === index ? newValue : v)))

  return (
    <div className="space-y-2">
      {value.map((item, index) => (
        <div key={index} className="flex items-center gap-2">
          <span className={cn('w-8 text-xs text-right', styles.textSecondary)}>{index}</span>
          <input
            type="text"
            value={item}
            onChange={(e) => handleChange(index, e.target.value)}
            className={cn(
              'flex-1 px-3 py-1.5 rounded border font-mono text-sm',
              'focus:outline-none focus:border-accent-primary',
              styles.borderColor,
              styles.isDark ? 'bg-dark-bg-hover' : 'bg-light-bg-primary'
            )}
          />
          <button onClick={() => handleRemove(index)} className="p-1 text-status-error">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ))}
      <button
        onClick={handleAdd}
        className="flex items-center gap-1 px-3 py-1.5 text-sm text-accent-primary hover:bg-accent-primary/10 rounded"
      >
        <Plus className="w-4 h-4" />
        {t('redis.addItem', 'Add Item')}
      </button>
    </div>
  )
}

// Set Editor
function SetEditor({
  value,
  onChange,
  styles,
}: {
  value: string[]
  onChange: (v: string[]) => void
  styles: ThemeStyles
}) {
  const { t } = useTranslation()
  const [newMember, setNewMember] = useState('')

  const handleAdd = () => {
    if (newMember && !value.includes(newMember)) {
      onChange([...value, newMember])
      setNewMember('')
    }
  }

  const handleRemove = (member: string) => onChange(value.filter((v) => v !== member))

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={newMember}
          onChange={(e) => setNewMember(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          placeholder={t('redis.newMember', 'New member')}
          className={cn(
            'flex-1 px-3 py-1.5 rounded border font-mono text-sm',
            'focus:outline-none focus:border-accent-primary',
            styles.borderColor,
            styles.isDark ? 'bg-dark-bg-hover' : 'bg-light-bg-primary'
          )}
        />
        <button
          onClick={handleAdd}
          className="px-3 py-1.5 rounded bg-accent-primary text-white text-sm"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {value.map((member) => (
          <span
            key={member}
            className={cn(
              'inline-flex items-center gap-1 px-2 py-1 rounded text-sm font-mono',
              styles.bgSecondary,
              styles.borderColor,
              'border'
            )}
          >
            {member}
            <button onClick={() => handleRemove(member)} className="text-status-error hover:opacity-80">
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
      </div>
    </div>
  )
}

// Hash Editor
function HashEditor({
  value,
  onChange,
  styles,
}: {
  value: [string, string][]
  onChange: (v: [string, string][]) => void
  styles: ThemeStyles
}) {
  const { t } = useTranslation()

  const handleAdd = () => onChange([...value, ['', '']])
  const handleRemove = (index: number) => onChange(value.filter((_, i) => i !== index))
  const handleChange = (index: number, field: 0 | 1, newValue: string) =>
    onChange(value.map((v, i) => (i === index ? ([field === 0 ? newValue : v[0], field === 1 ? newValue : v[1]] as [string, string]) : v)))

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-[1fr_1fr_auto] gap-2 text-xs font-medium text-gray-500">
        <span>{t('redis.field', 'Field')}</span>
        <span>{t('redis.value', 'Value')}</span>
        <span></span>
      </div>
      {value.map(([field, val], index) => (
        <div key={index} className="grid grid-cols-[1fr_1fr_auto] gap-2">
          <input
            type="text"
            value={field}
            onChange={(e) => handleChange(index, 0, e.target.value)}
            placeholder="field"
            className={cn(
              'px-3 py-1.5 rounded border font-mono text-sm',
              'focus:outline-none focus:border-accent-primary',
              styles.borderColor,
              styles.isDark ? 'bg-dark-bg-hover' : 'bg-light-bg-primary'
            )}
          />
          <input
            type="text"
            value={val}
            onChange={(e) => handleChange(index, 1, e.target.value)}
            placeholder="value"
            className={cn(
              'px-3 py-1.5 rounded border font-mono text-sm',
              'focus:outline-none focus:border-accent-primary',
              styles.borderColor,
              styles.isDark ? 'bg-dark-bg-hover' : 'bg-light-bg-primary'
            )}
          />
          <button onClick={() => handleRemove(index)} className="p-1.5 text-status-error">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ))}
      <button
        onClick={handleAdd}
        className="flex items-center gap-1 px-3 py-1.5 text-sm text-accent-primary hover:bg-accent-primary/10 rounded"
      >
        <Plus className="w-4 h-4" />
        {t('redis.addField', 'Add Field')}
      </button>
    </div>
  )
}

// ZSet Editor
function ZSetEditor({
  value,
  onChange,
  styles,
}: {
  value: [string, number][]
  onChange: (v: [string, number][]) => void
  styles: ThemeStyles
}) {
  const { t } = useTranslation()

  const handleAdd = () => onChange([...value, ['', 0]])
  const handleRemove = (index: number) => onChange(value.filter((_, i) => i !== index))
  const handleChange = (index: number, field: 'member' | 'score', newValue: string | number) =>
    onChange(
      value.map((v, i) =>
        i === index
          ? [field === 'member' ? (newValue as string) : v[0], field === 'score' ? (newValue as number) : v[1]]
          : v
      )
    )

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-[1fr_100px_auto] gap-2 text-xs font-medium text-gray-500">
        <span>{t('redis.member', 'Member')}</span>
        <span>{t('redis.score', 'Score')}</span>
        <span></span>
      </div>
      {value.map(([member, score], index) => (
        <div key={index} className="grid grid-cols-[1fr_100px_auto] gap-2">
          <input
            type="text"
            value={member}
            onChange={(e) => handleChange(index, 'member', e.target.value)}
            placeholder="member"
            className={cn(
              'px-3 py-1.5 rounded border font-mono text-sm',
              'focus:outline-none focus:border-accent-primary',
              styles.borderColor,
              styles.isDark ? 'bg-dark-bg-hover' : 'bg-light-bg-primary'
            )}
          />
          <input
            type="number"
            value={score}
            onChange={(e) => handleChange(index, 'score', parseFloat(e.target.value) || 0)}
            placeholder="0"
            className={cn(
              'px-3 py-1.5 rounded border font-mono text-sm',
              'focus:outline-none focus:border-accent-primary',
              styles.borderColor,
              styles.isDark ? 'bg-dark-bg-hover' : 'bg-light-bg-primary'
            )}
          />
          <button onClick={() => handleRemove(index)} className="p-1.5 text-status-error">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ))}
      <button
        onClick={handleAdd}
        className="flex items-center gap-1 px-3 py-1.5 text-sm text-accent-primary hover:bg-accent-primary/10 rounded"
      >
        <Plus className="w-4 h-4" />
        {t('redis.addMember', 'Add Member')}
      </button>
    </div>
  )
}

// Stream Viewer (read-only for now)
function StreamViewer({
  value,
  styles,
}: {
  value: { id: string; fields: [string, string][] }[]
  styles: ThemeStyles
}) {
  const { t } = useTranslation()

  return (
    <div className="space-y-3">
      <p className={cn('text-sm', styles.textSecondary)}>
        {t('redis.streamReadOnly', 'Stream data is read-only')}
      </p>
      {value.map((entry) => (
        <div key={entry.id} className={cn('p-3 rounded border', styles.borderColor, styles.bgSecondary)}>
          <div className="font-mono text-xs text-accent-primary mb-2">{entry.id}</div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            {entry.fields.map(([field, val]) => (
              <div key={field} className="flex gap-2">
                <span className={styles.textSecondary}>{field}:</span>
                <span className="font-mono">{val}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
