/**
 * Elasticsearch Indices Component
 *
 * Displays and manages Elasticsearch indices with CRUD operations.
 */

import { useState, useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import {
  RefreshCw,
  Plus,
  Trash2,
  Lock,
  Unlock,
  RotateCw,
  Search,
  MoreHorizontal,
  FileJson,
  Settings,
  BarChart3,
  Pencil,
  Save,
} from 'lucide-react'
import {
  mwEsListIndices,
  mwEsGetIndexMapping,
  mwEsGetIndexSettings,
  mwEsGetIndexStats,
  mwEsCreateIndex,
  mwEsDeleteIndex,
  mwEsOpenIndex,
  mwEsCloseIndex,
  mwEsRefreshIndex,
  mwEsUpdateIndexMapping,
  mwEsUpdateIndexSettings,
  type EsIndexSummary,
  type EsCreateIndexRequest,
} from '@/services/middleware'

interface ThemeStyles {
  bgSecondary: string
  borderColor: string
  textPrimary: string
  textSecondary: string
  hoverBg: string
  isDark: boolean
}

interface ElasticsearchIndicesProps {
  connectionId: string
  styles: ThemeStyles
}

type ModalType = 'create' | 'mapping' | 'settings' | 'stats' | null

export function ElasticsearchIndices({ connectionId, styles }: ElasticsearchIndicesProps) {
  const { t } = useTranslation()
  const [indices, setIndices] = useState<EsIndexSummary[]>([])
  const [filteredIndices, setFilteredIndices] = useState<EsIndexSummary[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [searchPattern, setSearchPattern] = useState('')
  const [healthFilter, setHealthFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [selectedIndices, setSelectedIndices] = useState<Set<string>>(new Set())
  const [modalType, setModalType] = useState<ModalType>(null)
  const [selectedIndex, setSelectedIndex] = useState<string | null>(null)
  const [modalData, setModalData] = useState<Record<string, unknown> | null>(null)
  const [contextMenuIndex, setContextMenuIndex] = useState<string | null>(null)
  const [isEditMode, setIsEditMode] = useState(false)
  const [editContent, setEditContent] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  // Create index form state
  const [newIndexName, setNewIndexName] = useState('')
  const [newIndexSettings, setNewIndexSettings] = useState('{\n  "number_of_shards": 1,\n  "number_of_replicas": 1\n}')
  const [newIndexMappings, setNewIndexMappings] = useState('{}')

  // Load indices
  const loadIndices = useCallback(async () => {
    setIsLoading(true)
    try {
      const list = await mwEsListIndices(connectionId, searchPattern || undefined)
      setIndices(list)
    } catch (err) {
      console.error('Failed to load indices:', err)
    } finally {
      setIsLoading(false)
    }
  }, [connectionId, searchPattern])

  // Filter indices
  useEffect(() => {
    let filtered = indices
    if (healthFilter !== 'all') {
      filtered = filtered.filter((idx) => idx.health === healthFilter)
    }
    if (statusFilter !== 'all') {
      filtered = filtered.filter((idx) => idx.status === statusFilter)
    }
    setFilteredIndices(filtered)
  }, [indices, healthFilter, statusFilter])

  // Initial load
  useEffect(() => {
    loadIndices()
  }, [loadIndices])

  // Handle search
  const handleSearch = useCallback(() => {
    loadIndices()
  }, [loadIndices])

  // Toggle index selection
  const toggleSelection = useCallback((indexName: string) => {
    setSelectedIndices((prev) => {
      const next = new Set(prev)
      if (next.has(indexName)) {
        next.delete(indexName)
      } else {
        next.add(indexName)
      }
      return next
    })
  }, [])

  // Toggle all selection
  const toggleAllSelection = useCallback(() => {
    if (selectedIndices.size === filteredIndices.length) {
      setSelectedIndices(new Set())
    } else {
      setSelectedIndices(new Set(filteredIndices.map((idx) => idx.name)))
    }
  }, [filteredIndices, selectedIndices.size])

  // View index details
  const viewIndexDetails = useCallback(async (indexName: string, type: 'mapping' | 'settings' | 'stats') => {
    try {
      let data: Record<string, unknown>
      if (type === 'mapping') {
        data = await mwEsGetIndexMapping(connectionId, indexName)
      } else if (type === 'settings') {
        data = await mwEsGetIndexSettings(connectionId, indexName)
      } else {
        data = await mwEsGetIndexStats(connectionId, indexName) as unknown as Record<string, unknown>
      }
      setSelectedIndex(indexName)
      setModalData(data)
      setModalType(type)
    } catch (err) {
      console.error(`Failed to get index ${type}:`, err)
    }
    setContextMenuIndex(null)
  }, [connectionId])

  // Create index
  const handleCreateIndex = useCallback(async () => {
    if (!newIndexName.trim()) return
    try {
      const request: EsCreateIndexRequest = {
        name: newIndexName.trim(),
        settings: newIndexSettings ? JSON.parse(newIndexSettings) : undefined,
        mappings: newIndexMappings && newIndexMappings !== '{}' ? JSON.parse(newIndexMappings) : undefined,
      }
      await mwEsCreateIndex(connectionId, request)
      setModalType(null)
      setNewIndexName('')
      loadIndices()
    } catch (err) {
      console.error('Failed to create index:', err)
      alert(String(err))
    }
  }, [connectionId, newIndexName, newIndexSettings, newIndexMappings, loadIndices])

  // Delete index
  const handleDeleteIndex = useCallback(async (indexName: string) => {
    if (!confirm(t('elasticsearch.confirmDelete', `Delete index "${indexName}"?`))) return
    try {
      await mwEsDeleteIndex(connectionId, indexName)
      loadIndices()
    } catch (err) {
      console.error('Failed to delete index:', err)
    }
    setContextMenuIndex(null)
  }, [connectionId, loadIndices, t])

  // Delete selected indices
  const handleDeleteSelected = useCallback(async () => {
    if (selectedIndices.size === 0) return
    if (!confirm(t('elasticsearch.confirmDeleteMultiple', `Delete ${selectedIndices.size} indices?`))) return
    try {
      for (const indexName of selectedIndices) {
        await mwEsDeleteIndex(connectionId, indexName)
      }
      setSelectedIndices(new Set())
      loadIndices()
    } catch (err) {
      console.error('Failed to delete indices:', err)
    }
  }, [connectionId, selectedIndices, loadIndices, t])

  // Open/Close index
  const handleToggleIndexStatus = useCallback(async (indexName: string, currentStatus: string) => {
    try {
      if (currentStatus === 'open') {
        await mwEsCloseIndex(connectionId, indexName)
      } else {
        await mwEsOpenIndex(connectionId, indexName)
      }
      loadIndices()
    } catch (err) {
      console.error('Failed to toggle index status:', err)
    }
    setContextMenuIndex(null)
  }, [connectionId, loadIndices])

  // Refresh index
  const handleRefreshIndex = useCallback(async (indexName: string) => {
    try {
      await mwEsRefreshIndex(connectionId, indexName)
      loadIndices()
    } catch (err) {
      console.error('Failed to refresh index:', err)
    }
    setContextMenuIndex(null)
  }, [connectionId, loadIndices])

  // Enter edit mode
  const handleEnterEditMode = useCallback(() => {
    if (modalData) {
      setEditContent(JSON.stringify(modalData, null, 2))
      setIsEditMode(true)
    }
  }, [modalData])

  // Cancel edit mode
  const handleCancelEdit = useCallback(() => {
    setIsEditMode(false)
    setEditContent('')
  }, [])

  // Save mapping or settings
  const handleSaveEdit = useCallback(async () => {
    if (!selectedIndex || !modalType) return
    setIsSaving(true)
    try {
      const data = JSON.parse(editContent)
      if (modalType === 'mapping') {
        await mwEsUpdateIndexMapping(connectionId, selectedIndex, data)
      } else if (modalType === 'settings') {
        await mwEsUpdateIndexSettings(connectionId, selectedIndex, data)
      }
      // Reload the data
      setModalData(data)
      setIsEditMode(false)
      setEditContent('')
    } catch (err) {
      console.error(`Failed to save ${modalType}:`, err)
      alert(String(err))
    } finally {
      setIsSaving(false)
    }
  }, [connectionId, selectedIndex, modalType, editContent])

  // Close modal and reset edit state
  const handleCloseModal = useCallback(() => {
    setModalType(null)
    setIsEditMode(false)
    setEditContent('')
  }, [])

  // Get health badge color
  const getHealthColor = (health: string) => {
    switch (health) {
      case 'green':
        return 'bg-green-500'
      case 'yellow':
        return 'bg-yellow-500'
      case 'red':
        return 'bg-red-500'
      default:
        return 'bg-gray-500'
    }
  }

  return (
    <div className={cn('h-full flex flex-col', styles.textPrimary)}>
      {/* Toolbar */}
      <div className={cn('flex items-center gap-2 p-3 border-b', styles.borderColor, styles.bgSecondary)}>
        {/* Search */}
        <div className="flex items-center gap-1 flex-1">
          <input
            type="text"
            value={searchPattern}
            onChange={(e) => setSearchPattern(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder={t('elasticsearch.searchIndices', 'Search indices...')}
            className={cn(
              'px-3 py-1.5 text-sm rounded border flex-1 max-w-xs',
              styles.borderColor,
              styles.bgSecondary,
              'focus:outline-none focus:ring-1 focus:ring-accent-primary'
            )}
          />
          <button
            onClick={handleSearch}
            className={cn('p-1.5 rounded', styles.hoverBg)}
            title={t('common.search')}
          >
            <Search className="w-4 h-4" />
          </button>
        </div>

        {/* Filters */}
        <select
          value={healthFilter}
          onChange={(e) => setHealthFilter(e.target.value)}
          className={cn('px-2 py-1.5 text-sm rounded border', styles.borderColor, styles.bgSecondary)}
        >
          <option value="all">{t('elasticsearch.healthAll', 'All Health')}</option>
          <option value="green">Green</option>
          <option value="yellow">Yellow</option>
          <option value="red">Red</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className={cn('px-2 py-1.5 text-sm rounded border', styles.borderColor, styles.bgSecondary)}
        >
          <option value="all">{t('elasticsearch.statusAll', 'All Status')}</option>
          <option value="open">Open</option>
          <option value="close">Close</option>
        </select>

        {/* Actions */}
        <button
          onClick={() => setModalType('create')}
          className="px-3 py-1.5 text-sm rounded bg-accent-primary text-white hover:bg-accent-hover transition-colors flex items-center gap-1"
        >
          <Plus className="w-4 h-4" />
          {t('elasticsearch.createIndex', 'Create')}
        </button>
        <button
          onClick={loadIndices}
          className={cn('p-1.5 rounded', styles.hoverBg)}
          title={t('common.refresh')}
        >
          <RefreshCw className={cn('w-4 h-4', isLoading && 'animate-spin')} />
        </button>
      </div>

      {/* Indices Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full">
          <thead>
            <tr className={cn('border-b sticky top-0', styles.borderColor, styles.bgSecondary)}>
              <th className="px-4 py-2 text-left w-10">
                <input
                  type="checkbox"
                  checked={selectedIndices.size === filteredIndices.length && filteredIndices.length > 0}
                  onChange={toggleAllSelection}
                  className="rounded"
                />
              </th>
              <th className="px-4 py-2 text-left text-sm font-medium">{t('elasticsearch.indexName', 'Index')}</th>
              <th className="px-4 py-2 text-center text-sm font-medium w-16">{t('elasticsearch.health', 'Health')}</th>
              <th className="px-4 py-2 text-center text-sm font-medium w-16">{t('elasticsearch.status', 'Status')}</th>
              <th className="px-4 py-2 text-right text-sm font-medium">{t('elasticsearch.docsCount', 'Docs')}</th>
              <th className="px-4 py-2 text-right text-sm font-medium">{t('elasticsearch.storeSize', 'Size')}</th>
              <th className="px-4 py-2 text-center text-sm font-medium w-20">{t('common.actions', 'Actions')}</th>
            </tr>
          </thead>
          <tbody>
            {filteredIndices.map((idx) => (
              <tr key={idx.name} className={cn('border-b', styles.borderColor, styles.hoverBg)}>
                <td className="px-4 py-2">
                  <input
                    type="checkbox"
                    checked={selectedIndices.has(idx.name)}
                    onChange={() => toggleSelection(idx.name)}
                    className="rounded"
                  />
                </td>
                <td className="px-4 py-2 text-sm font-mono">{idx.name}</td>
                <td className="px-4 py-2 text-center">
                  <span className={cn('w-3 h-3 rounded-full inline-block', getHealthColor(idx.health))} />
                </td>
                <td className="px-4 py-2 text-center">
                  <span className={cn('px-1.5 py-0.5 text-xs rounded', idx.status === 'open' ? 'bg-green-500/20 text-green-500' : 'bg-gray-500/20 text-gray-500')}>
                    {idx.status}
                  </span>
                </td>
                <td className="px-4 py-2 text-right text-sm font-mono">{idx.docsCount.toLocaleString()}</td>
                <td className="px-4 py-2 text-right text-sm">{idx.storeSize}</td>
                <td className="px-4 py-2 text-center relative">
                  <button
                    onClick={() => setContextMenuIndex(contextMenuIndex === idx.name ? null : idx.name)}
                    className={cn('p-1 rounded', styles.hoverBg)}
                  >
                    <MoreHorizontal className="w-4 h-4" />
                  </button>
                  {contextMenuIndex === idx.name && (
                    <ContextMenu
                      index={idx}
                      onViewMapping={() => viewIndexDetails(idx.name, 'mapping')}
                      onViewSettings={() => viewIndexDetails(idx.name, 'settings')}
                      onViewStats={() => viewIndexDetails(idx.name, 'stats')}
                      onRefresh={() => handleRefreshIndex(idx.name)}
                      onToggleStatus={() => handleToggleIndexStatus(idx.name, idx.status)}
                      onDelete={() => handleDeleteIndex(idx.name)}
                      onClose={() => setContextMenuIndex(null)}
                      styles={styles}
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className={cn('flex items-center justify-between px-4 py-2 border-t text-sm', styles.borderColor, styles.bgSecondary)}>
        <span className={styles.textSecondary}>
          {selectedIndices.size > 0 && (
            <span className="mr-4">
              {t('elasticsearch.selectedCount', `${selectedIndices.size} selected`)}
            </span>
          )}
        </span>
        <div className="flex items-center gap-2">
          {selectedIndices.size > 0 && (
            <button
              onClick={handleDeleteSelected}
              className="px-3 py-1 text-sm rounded bg-red-500/20 text-red-500 hover:bg-red-500/30 transition-colors flex items-center gap-1"
            >
              <Trash2 className="w-3 h-3" />
              {t('common.delete', 'Delete')}
            </button>
          )}
          <span className={styles.textSecondary}>
            {t('elasticsearch.totalIndices', `${filteredIndices.length} indices`)}
          </span>
        </div>
      </div>

      {/* Create Index Modal */}
      {modalType === 'create' && (
        <Modal title={t('elasticsearch.createIndex', 'Create Index')} onClose={() => setModalType(null)} styles={styles}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">{t('elasticsearch.indexName', 'Index Name')}</label>
              <input
                type="text"
                value={newIndexName}
                onChange={(e) => setNewIndexName(e.target.value)}
                className={cn('w-full px-3 py-2 text-sm rounded border', styles.borderColor, styles.bgSecondary)}
                placeholder="my-index"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t('elasticsearch.settings', 'Settings (JSON)')}</label>
              <textarea
                value={newIndexSettings}
                onChange={(e) => setNewIndexSettings(e.target.value)}
                className={cn('w-full px-3 py-2 text-sm rounded border font-mono h-24', styles.borderColor, styles.bgSecondary)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t('elasticsearch.mappings', 'Mappings (JSON)')}</label>
              <textarea
                value={newIndexMappings}
                onChange={(e) => setNewIndexMappings(e.target.value)}
                className={cn('w-full px-3 py-2 text-sm rounded border font-mono h-24', styles.borderColor, styles.bgSecondary)}
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setModalType(null)}
                className={cn('px-4 py-2 text-sm rounded', styles.hoverBg)}
              >
                {t('common.cancel', 'Cancel')}
              </button>
              <button
                onClick={handleCreateIndex}
                className="px-4 py-2 text-sm rounded bg-accent-primary text-white hover:bg-accent-hover"
              >
                {t('common.create', 'Create')}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* View Details Modal */}
      {(modalType === 'mapping' || modalType === 'settings' || modalType === 'stats') && modalData && (
        <Modal
          title={`${selectedIndex} - ${modalType.charAt(0).toUpperCase() + modalType.slice(1)}`}
          onClose={handleCloseModal}
          styles={styles}
        >
          <div className="space-y-4">
            {/* Hint for mapping/settings */}
            {(modalType === 'mapping' || modalType === 'settings') && !isEditMode && (
              <p className={cn('text-xs', styles.textSecondary)}>
                {modalType === 'mapping'
                  ? t('elasticsearch.mappingHint', 'Note: Only new fields can be added. Existing field types cannot be changed.')
                  : t('elasticsearch.settingsHint', 'Note: Only dynamic settings can be modified. Some settings like number_of_shards cannot be changed after creation.')}
              </p>
            )}
            {isEditMode ? (
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className={cn('w-full text-sm font-mono p-4 rounded overflow-auto h-96 border', styles.borderColor, styles.bgSecondary)}
              />
            ) : (
              <pre className={cn('text-sm font-mono p-4 rounded overflow-auto max-h-96', styles.bgSecondary)}>
                {JSON.stringify(modalData, null, 2)}
              </pre>
            )}
            {/* Actions */}
            <div className="flex justify-end gap-2">
              {modalType !== 'stats' && !isEditMode && (
                <button
                  onClick={handleEnterEditMode}
                  className={cn('px-4 py-2 text-sm rounded flex items-center gap-1', styles.hoverBg, 'border', styles.borderColor)}
                >
                  <Pencil className="w-4 h-4" />
                  {t('common.edit', 'Edit')}
                </button>
              )}
              {isEditMode && (
                <>
                  <button
                    onClick={handleCancelEdit}
                    className={cn('px-4 py-2 text-sm rounded', styles.hoverBg)}
                  >
                    {t('common.cancel', 'Cancel')}
                  </button>
                  <button
                    onClick={handleSaveEdit}
                    disabled={isSaving}
                    className="px-4 py-2 text-sm rounded bg-accent-primary text-white hover:bg-accent-hover flex items-center gap-1 disabled:opacity-50"
                  >
                    <Save className="w-4 h-4" />
                    {isSaving ? t('common.saving', 'Saving...') : t('common.save', 'Save')}
                  </button>
                </>
              )}
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

// Context Menu Component
interface ContextMenuProps {
  index: EsIndexSummary
  onViewMapping: () => void
  onViewSettings: () => void
  onViewStats: () => void
  onRefresh: () => void
  onToggleStatus: () => void
  onDelete: () => void
  onClose: () => void
  styles: ThemeStyles
}

function ContextMenu({
  index,
  onViewMapping,
  onViewSettings,
  onViewStats,
  onRefresh,
  onToggleStatus,
  onDelete,
  onClose,
  styles,
}: ContextMenuProps) {
  const { t } = useTranslation()

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40" onClick={onClose} />
      {/* Menu */}
      <div className={cn('absolute right-0 top-8 z-50 w-40 rounded-lg shadow-lg border py-1', styles.bgSecondary, styles.borderColor)}>
        <button onClick={onViewMapping} className={cn('w-full px-3 py-1.5 text-sm text-left flex items-center gap-2', styles.hoverBg)}>
          <FileJson className="w-4 h-4" />
          {t('elasticsearch.viewMapping', 'Mapping')}
        </button>
        <button onClick={onViewSettings} className={cn('w-full px-3 py-1.5 text-sm text-left flex items-center gap-2', styles.hoverBg)}>
          <Settings className="w-4 h-4" />
          {t('elasticsearch.viewSettings', 'Settings')}
        </button>
        <button onClick={onViewStats} className={cn('w-full px-3 py-1.5 text-sm text-left flex items-center gap-2', styles.hoverBg)}>
          <BarChart3 className="w-4 h-4" />
          {t('elasticsearch.viewStats', 'Stats')}
        </button>
        <div className={cn('my-1 border-t', styles.borderColor)} />
        <button onClick={onRefresh} className={cn('w-full px-3 py-1.5 text-sm text-left flex items-center gap-2', styles.hoverBg)}>
          <RotateCw className="w-4 h-4" />
          {t('elasticsearch.refreshIndex', 'Refresh')}
        </button>
        <button onClick={onToggleStatus} className={cn('w-full px-3 py-1.5 text-sm text-left flex items-center gap-2', styles.hoverBg)}>
          {index.status === 'open' ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
          {index.status === 'open' ? t('elasticsearch.closeIndex', 'Close') : t('elasticsearch.openIndex', 'Open')}
        </button>
        <div className={cn('my-1 border-t', styles.borderColor)} />
        <button onClick={onDelete} className={cn('w-full px-3 py-1.5 text-sm text-left flex items-center gap-2 text-red-500', styles.hoverBg)}>
          <Trash2 className="w-4 h-4" />
          {t('common.delete', 'Delete')}
        </button>
      </div>
    </>
  )
}

// Modal Component
interface ModalProps {
  title: string
  onClose: () => void
  children: React.ReactNode
  styles: ThemeStyles
}

function Modal({ title, onClose, children, styles }: ModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className={cn('w-full max-w-lg rounded-lg shadow-xl', styles.bgSecondary, styles.borderColor, 'border')}>
        <div className={cn('flex items-center justify-between px-4 py-3 border-b', styles.borderColor)}>
          <h3 className="font-medium">{title}</h3>
          <button onClick={onClose} className={cn('p-1 rounded', styles.hoverBg)}>
            <span className="text-lg">&times;</span>
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  )
}
