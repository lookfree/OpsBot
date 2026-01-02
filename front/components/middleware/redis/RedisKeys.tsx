/**
 * Redis Keys Component
 *
 * Manages Redis keys with scan, filter, and CRUD operations.
 */

import { useState, useCallback, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import {
  Search,
  RefreshCw,
  Trash2,
  Plus,
  Key,
  Clock,
  ChevronRight,
  Filter,
  Database,
} from 'lucide-react'
import {
  mwRedisScanKeys,
  mwRedisDeleteKeys,
  type RedisKeyInfo,
  type RedisScanRequest,
  type RedisDatabaseInfo,
} from '@/services/middleware'

interface ThemeStyles {
  bgSecondary: string
  borderColor: string
  textPrimary: string
  textSecondary: string
  hoverBg: string
  isDark: boolean
}

interface RedisKeysProps {
  connectionId: string
  onSelectKey: (key: string) => void
  selectedKey: string | null
  onCreateKey: () => void
  databases: RedisDatabaseInfo[]
  currentDb: number
  onSelectDatabase: (db: number) => void
  isClusterMode?: boolean
  styles: ThemeStyles
}

// Key type to icon/color mapping
const KEY_TYPE_STYLES: Record<string, { bg: string; text: string }> = {
  string: { bg: 'bg-blue-500/20', text: 'text-blue-500' },
  list: { bg: 'bg-green-500/20', text: 'text-green-500' },
  set: { bg: 'bg-yellow-500/20', text: 'text-yellow-500' },
  zset: { bg: 'bg-purple-500/20', text: 'text-purple-500' },
  hash: { bg: 'bg-orange-500/20', text: 'text-orange-500' },
  stream: { bg: 'bg-pink-500/20', text: 'text-pink-500' },
}

export function RedisKeys({
  connectionId,
  onSelectKey,
  selectedKey,
  onCreateKey,
  databases,
  currentDb,
  onSelectDatabase,
  isClusterMode = false,
  styles,
}: RedisKeysProps) {
  const { t } = useTranslation()
  const [keys, setKeys] = useState<RedisKeyInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [searchPattern, setSearchPattern] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('')
  const [cursor, setCursor] = useState('0')
  const [hasMore, setHasMore] = useState(false)
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set())
  const [deleting, setDeleting] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Load keys
  const loadKeys = useCallback(
    async (reset = true) => {
      setLoading(true)
      try {
        const request: RedisScanRequest = {
          cursor: reset ? '0' : cursor,
          pattern: searchPattern || '*',
          count: 100,
          keyType: typeFilter || undefined,
        }

        const response = await mwRedisScanKeys(connectionId, request)

        if (reset) {
          setKeys(response.keys)
        } else {
          setKeys((prev) => [...prev, ...response.keys])
        }

        setCursor(response.cursor)
        setHasMore(!response.finished)
      } catch (err) {
        console.error('Failed to load keys:', err)
      } finally {
        setLoading(false)
      }
    },
    [connectionId, searchPattern, typeFilter, cursor]
  )

  // Initial load
  useEffect(() => {
    loadKeys(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionId])

  // Search/filter change
  const handleSearch = useCallback(() => {
    loadKeys(true)
  }, [loadKeys])

  // Load more on scroll
  const handleLoadMore = useCallback(() => {
    if (!loading && hasMore) {
      loadKeys(false)
    }
  }, [loading, hasMore, loadKeys])

  // Toggle key selection
  const handleToggleKey = useCallback((key: string, e: React.MouseEvent) => {
    if (e.ctrlKey || e.metaKey) {
      setSelectedKeys((prev) => {
        const next = new Set(prev)
        if (next.has(key)) {
          next.delete(key)
        } else {
          next.add(key)
        }
        return next
      })
    } else {
      setSelectedKeys(new Set([key]))
    }
  }, [])

  // Delete selected keys
  const handleDeleteSelected = useCallback(async () => {
    if (selectedKeys.size === 0) return

    const confirmed = window.confirm(
      t('redis.confirmDeleteKeys', 'Are you sure you want to delete {{count}} key(s)?').replace(
        '{{count}}',
        String(selectedKeys.size)
      )
    )

    if (!confirmed) return

    setDeleting(true)
    try {
      await mwRedisDeleteKeys(connectionId, Array.from(selectedKeys))
      setKeys((prev) => prev.filter((k) => !selectedKeys.has(k.key)))
      setSelectedKeys(new Set())
    } catch (err) {
      console.error('Failed to delete keys:', err)
    } finally {
      setDeleting(false)
    }
  }, [connectionId, selectedKeys, t])

  // Format TTL display
  const formatTtl = (ttl: number): string => {
    if (ttl === -1) return t('redis.noExpire', 'No expire')
    if (ttl === -2) return t('redis.expired', 'Expired')
    if (ttl < 60) return `${ttl}s`
    if (ttl < 3600) return `${Math.floor(ttl / 60)}m`
    if (ttl < 86400) return `${Math.floor(ttl / 3600)}h`
    return `${Math.floor(ttl / 86400)}d`
  }

  return (
    <div className={cn('flex flex-col h-full', styles.textPrimary)}>
      {/* Database Selector */}
      <div className={cn('flex items-center gap-2 p-2 border-b', styles.borderColor, styles.bgSecondary)}>
        <Database className={cn('w-4 h-4', isClusterMode ? 'text-gray-400' : 'text-accent-primary')} />
        <select
          value={currentDb}
          onChange={(e) => onSelectDatabase(Number(e.target.value))}
          disabled={isClusterMode}
          title={isClusterMode ? t('redis.clusterDbHint', '集群模式仅支持 DB0') : undefined}
          className={cn(
            'flex-1 px-2 py-1 rounded border text-sm',
            'focus:outline-none focus:border-accent-primary',
            styles.borderColor,
            isClusterMode
              ? 'opacity-50 cursor-not-allowed bg-gray-100 dark:bg-gray-800'
              : styles.isDark ? 'bg-dark-bg-hover' : 'bg-light-bg-primary'
          )}
        >
          {isClusterMode ? (
            <option value={0}>DB0 ({t('redis.clusterOnly', '集群模式')})</option>
          ) : databases.length > 0
            ? databases.map((db) => (
                <option key={db.db} value={db.db}>
                  DB{db.db} ({db.keys} {t('redis.keys', '键')})
                </option>
              ))
            : Array.from({ length: 16 }, (_, i) => (
                <option key={i} value={i}>
                  DB{i}
                </option>
              ))}
        </select>
        {isClusterMode && (
          <span className={cn('text-xs', styles.textSecondary)} title={t('redis.clusterDbHint', '集群模式仅支持 DB0')}>
            {t('redis.clusterMode', '集群')}
          </span>
        )}
      </div>

      {/* Toolbar */}
      <div className={cn('flex items-center gap-2 p-3 border-b', styles.borderColor)}>
        {/* Search */}
        <div className="flex-1 flex items-center gap-2">
          <div className="relative flex-1 max-w-md">
            <Search className={cn('absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4', styles.textSecondary)} />
            <input
              type="text"
              value={searchPattern}
              onChange={(e) => setSearchPattern(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder={t('redis.searchPattern', 'Search pattern (e.g. user:*)')}
              className={cn(
                'w-full pl-9 pr-3 py-1.5 rounded border text-sm',
                'focus:outline-none focus:border-accent-primary',
                styles.borderColor,
                styles.isDark ? 'bg-dark-bg-hover' : 'bg-light-bg-primary'
              )}
            />
          </div>

          {/* Type Filter */}
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className={cn(
              'px-3 py-1.5 rounded border text-sm',
              'focus:outline-none focus:border-accent-primary',
              styles.borderColor,
              styles.isDark ? 'bg-dark-bg-hover' : 'bg-light-bg-primary'
            )}
          >
            <option value="">{t('redis.allTypes', 'All Types')}</option>
            <option value="string">String</option>
            <option value="list">List</option>
            <option value="set">Set</option>
            <option value="zset">ZSet</option>
            <option value="hash">Hash</option>
            <option value="stream">Stream</option>
          </select>

          <button
            onClick={handleSearch}
            className={cn('p-1.5 rounded', styles.hoverBg, 'transition-colors')}
            title={t('common.search', 'Search')}
          >
            <Filter className="w-4 h-4" />
          </button>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => loadKeys(true)}
            disabled={loading}
            className={cn('p-1.5 rounded', styles.hoverBg, 'transition-colors disabled:opacity-50')}
            title={t('common.refresh')}
          >
            <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
          </button>

          <button
            onClick={onCreateKey}
            className={cn('p-1.5 rounded', styles.hoverBg, 'transition-colors text-accent-primary')}
            title={t('redis.createKey', 'Create Key')}
          >
            <Plus className="w-4 h-4" />
          </button>

          {selectedKeys.size > 0 && (
            <button
              onClick={handleDeleteSelected}
              disabled={deleting}
              className={cn(
                'p-1.5 rounded transition-colors text-status-error',
                styles.hoverBg,
                'disabled:opacity-50'
              )}
              title={t('redis.deleteSelected', 'Delete Selected')}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Selection Info */}
      {selectedKeys.size > 0 && (
        <div className={cn('px-3 py-1.5 text-sm border-b', styles.borderColor, 'bg-accent-primary/10')}>
          {t('redis.selectedCount', '{{count}} key(s) selected').replace(
            '{{count}}',
            String(selectedKeys.size)
          )}
          <button
            onClick={() => setSelectedKeys(new Set())}
            className="ml-2 text-accent-primary hover:underline"
          >
            {t('common.clearSelection', 'Clear')}
          </button>
        </div>
      )}

      {/* Keys List */}
      <div ref={scrollRef} className="flex-1 overflow-auto">
        {keys.length === 0 && !loading ? (
          <div className={cn('flex flex-col items-center justify-center h-full', styles.textSecondary)}>
            <Key className="w-12 h-12 mb-2 opacity-50" />
            <p>{t('redis.noKeysFound', 'No keys found')}</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {keys.map((keyInfo) => {
              const typeStyle = KEY_TYPE_STYLES[keyInfo.keyType.toLowerCase()] || {
                bg: 'bg-gray-500/20',
                text: 'text-gray-500',
              }
              const isSelected = selectedKeys.has(keyInfo.key)

              return (
                <div
                  key={keyInfo.key}
                  onClick={(e) => handleToggleKey(keyInfo.key, e)}
                  onDoubleClick={() => onSelectKey(keyInfo.key)}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors',
                    styles.hoverBg,
                    isSelected && 'bg-accent-primary/10',
                    selectedKey === keyInfo.key && 'border-l-2 border-accent-primary'
                  )}
                >
                  {/* Type Badge */}
                  <span
                    className={cn(
                      'px-1.5 py-0.5 text-xs font-mono rounded uppercase',
                      typeStyle.bg,
                      typeStyle.text
                    )}
                  >
                    {keyInfo.keyType}
                  </span>

                  {/* Key Name */}
                  <span className="flex-1 font-mono text-sm truncate">{keyInfo.key}</span>

                  {/* TTL */}
                  <span className={cn('text-xs flex items-center gap-1', styles.textSecondary)}>
                    <Clock className="w-3 h-3" />
                    {formatTtl(keyInfo.ttl)}
                  </span>

                  {/* Size */}
                  {keyInfo.size !== undefined && (
                    <span className={cn('text-xs', styles.textSecondary)}>
                      {keyInfo.size} items
                    </span>
                  )}

                  <ChevronRight className={cn('w-4 h-4', styles.textSecondary)} />
                </div>
              )
            })}
          </div>
        )}

        {/* Load More */}
        {hasMore && (
          <div className="p-3 text-center">
            <button
              onClick={handleLoadMore}
              disabled={loading}
              className={cn(
                'px-4 py-2 text-sm rounded border transition-colors',
                styles.borderColor,
                styles.hoverBg,
                'disabled:opacity-50'
              )}
            >
              {loading ? t('common.loading', 'Loading...') : t('common.loadMore', 'Load More')}
            </button>
          </div>
        )}

        {/* Loading indicator */}
        {loading && keys.length === 0 && (
          <div className="flex items-center justify-center h-32">
            <RefreshCw className="w-6 h-6 animate-spin text-accent-primary" />
          </div>
        )}
      </div>

      {/* Footer Stats */}
      <div className={cn('px-3 py-2 text-xs border-t flex items-center justify-between', styles.borderColor, styles.textSecondary)}>
        <span>
          {t('redis.keysLoaded', '{{count}} keys loaded').replace('{{count}}', String(keys.length))}
        </span>
        {hasMore && <span>{t('redis.moreKeysAvailable', 'More keys available')}</span>}
      </div>
    </div>
  )
}
