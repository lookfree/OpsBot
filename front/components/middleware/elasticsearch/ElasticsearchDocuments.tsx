/**
 * Elasticsearch Documents Component
 *
 * Displays and manages Elasticsearch documents with CRUD operations.
 */

import { useState, useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import {
  RefreshCw,
  Plus,
  Trash2,
  Search,
  MoreHorizontal,
  FileText,
  Pencil,
  Save,
  Eye,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import {
  mwEsListIndices,
  mwEsSearch,
  mwEsGetDocument,
  mwEsCreateDocument,
  mwEsUpdateDocument,
  mwEsDeleteDocument,
  type EsIndexSummary,
  type EsSearchHit,
  type EsCreateDocRequest,
  type EsUpdateDocRequest,
} from '@/services/middleware'
import { confirm as confirmDialog, message as messageDialog } from '@tauri-apps/plugin-dialog'

interface ThemeStyles {
  bgSecondary: string
  borderColor: string
  textPrimary: string
  textSecondary: string
  hoverBg: string
  isDark: boolean
}

interface ElasticsearchDocumentsProps {
  connectionId: string
  styles: ThemeStyles
}

type ModalType = 'create' | 'edit' | 'view' | null

const PAGE_SIZE = 50

export function ElasticsearchDocuments({ connectionId, styles }: ElasticsearchDocumentsProps) {
  const { t } = useTranslation()
  const [indices, setIndices] = useState<EsIndexSummary[]>([])
  const [selectedIndex, setSelectedIndex] = useState<string>('')
  const [documents, setDocuments] = useState<EsSearchHit[]>([])
  const [totalDocs, setTotalDocs] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedDocs, setSelectedDocs] = useState<Set<string>>(new Set())
  const [modalType, setModalType] = useState<ModalType>(null)
  const [currentDoc, setCurrentDoc] = useState<EsSearchHit | null>(null)
  const [contextMenuDocId, setContextMenuDocId] = useState<string | null>(null)
  const [page, setPage] = useState(0)

  // Create/Edit form state
  const [docId, setDocId] = useState('')
  const [docSource, setDocSource] = useState('{}')
  const [autoGenerateId, setAutoGenerateId] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  // Load indices list
  const loadIndices = useCallback(async () => {
    try {
      const list = await mwEsListIndices(connectionId)
      setIndices(list.filter((idx) => idx.status === 'open'))
    } catch (err) {
      console.error('Failed to load indices:', err)
    }
  }, [connectionId])

  // Load documents from selected index
  const loadDocuments = useCallback(async () => {
    if (!selectedIndex) {
      setDocuments([])
      setTotalDocs(0)
      return
    }

    setIsLoading(true)
    try {
      const query = searchTerm.trim()
        ? { query: { query_string: { query: `*${searchTerm.trim()}*` } } }
        : { query: { match_all: {} } }

      const result = await mwEsSearch(connectionId, {
        index: selectedIndex,
        query: query.query,
        from: page * PAGE_SIZE,
        size: PAGE_SIZE,
      })
      setDocuments(result.hits)
      setTotalDocs(result.total)
    } catch (err) {
      console.error('Failed to load documents:', err)
      setDocuments([])
      setTotalDocs(0)
    } finally {
      setIsLoading(false)
    }
  }, [connectionId, selectedIndex, searchTerm, page])

  // Initial load
  useEffect(() => {
    loadIndices()
  }, [loadIndices])

  // Load documents when index changes
  useEffect(() => {
    setPage(0)
    setSelectedDocs(new Set())
    loadDocuments()
  }, [selectedIndex])

  // Load documents when page or search changes
  useEffect(() => {
    if (selectedIndex) {
      loadDocuments()
    }
  }, [page, loadDocuments])

  // Handle search
  const handleSearch = useCallback(() => {
    setPage(0)
    loadDocuments()
  }, [loadDocuments])

  // Get document by ID
  const handleGetById = useCallback(async () => {
    if (!selectedIndex || !searchTerm.trim()) return

    setIsLoading(true)
    try {
      const doc = await mwEsGetDocument(connectionId, selectedIndex, searchTerm.trim())
      setDocuments([{ index: doc.index, id: doc.id, source: doc.source }])
      setTotalDocs(1)
    } catch (err) {
      console.error('Failed to get document:', err)
      setDocuments([])
      setTotalDocs(0)
    } finally {
      setIsLoading(false)
    }
  }, [connectionId, selectedIndex, searchTerm])

  // Toggle document selection
  const toggleSelection = useCallback((docId: string) => {
    setSelectedDocs((prev) => {
      const next = new Set(prev)
      if (next.has(docId)) {
        next.delete(docId)
      } else {
        next.add(docId)
      }
      return next
    })
  }, [])

  // Toggle all selection
  const toggleAllSelection = useCallback(() => {
    if (selectedDocs.size === documents.length) {
      setSelectedDocs(new Set())
    } else {
      setSelectedDocs(new Set(documents.map((doc) => doc.id)))
    }
  }, [documents, selectedDocs.size])

  // View document
  const handleViewDocument = useCallback((doc: EsSearchHit) => {
    setCurrentDoc(doc)
    setModalType('view')
    setContextMenuDocId(null)
  }, [])

  // Open create modal
  const handleOpenCreate = useCallback(() => {
    setDocId('')
    setDocSource('{\n  \n}')
    setAutoGenerateId(true)
    setModalType('create')
  }, [])

  // Open edit modal
  const handleOpenEdit = useCallback((doc: EsSearchHit) => {
    setCurrentDoc(doc)
    setDocId(doc.id)
    setDocSource(JSON.stringify(doc.source, null, 2))
    setAutoGenerateId(false)
    setModalType('edit')
    setContextMenuDocId(null)
  }, [])

  // Create document
  const handleCreateDocument = useCallback(async () => {
    if (!selectedIndex) return

    setIsSaving(true)
    try {
      const source = JSON.parse(docSource)
      const request: EsCreateDocRequest = {
        index: selectedIndex,
        id: autoGenerateId ? undefined : docId.trim() || undefined,
        source,
      }
      await mwEsCreateDocument(connectionId, request)
      setModalType(null)
      loadDocuments()
    } catch (err) {
      console.error('Failed to create document:', err)
      messageDialog(String(err), { kind: 'error' })
    } finally {
      setIsSaving(false)
    }
  }, [connectionId, selectedIndex, docId, docSource, autoGenerateId, loadDocuments])

  // Update document
  const handleUpdateDocument = useCallback(async () => {
    if (!selectedIndex || !currentDoc) return

    setIsSaving(true)
    try {
      const doc = JSON.parse(docSource)
      const request: EsUpdateDocRequest = {
        index: selectedIndex,
        id: currentDoc.id,
        doc,
      }
      await mwEsUpdateDocument(connectionId, request)
      setModalType(null)
      loadDocuments()
    } catch (err) {
      console.error('Failed to update document:', err)
      messageDialog(String(err), { kind: 'error' })
    } finally {
      setIsSaving(false)
    }
  }, [connectionId, selectedIndex, currentDoc, docSource, loadDocuments])

  // Delete document
  const handleDeleteDocument = useCallback(async (docId: string) => {
    if (!selectedIndex) return
    if (!(await confirmDialog(t('elasticsearch.doc.confirmDelete', 'Delete this document?')))) return

    try {
      await mwEsDeleteDocument(connectionId, selectedIndex, docId)
      loadDocuments()
    } catch (err) {
      console.error('Failed to delete document:', err)
      messageDialog(String(err), { kind: 'error' })
    }
    setContextMenuDocId(null)
  }, [connectionId, selectedIndex, loadDocuments, t])

  // Delete selected documents
  const handleDeleteSelected = useCallback(async () => {
    if (!selectedIndex || selectedDocs.size === 0) return
    if (!(await confirmDialog(t('elasticsearch.doc.confirmDeleteMultiple', { count: selectedDocs.size })))) return

    try {
      for (const docId of selectedDocs) {
        await mwEsDeleteDocument(connectionId, selectedIndex, docId)
      }
      setSelectedDocs(new Set())
      loadDocuments()
    } catch (err) {
      console.error('Failed to delete documents:', err)
      messageDialog(String(err), { kind: 'error' })
    }
  }, [connectionId, selectedIndex, selectedDocs, loadDocuments, t])

  // Close modal
  const handleCloseModal = useCallback(() => {
    setModalType(null)
    setCurrentDoc(null)
  }, [])

  // Truncate source for preview
  const truncateSource = (source: Record<string, unknown>, maxLen = 100) => {
    const str = JSON.stringify(source)
    return str.length > maxLen ? str.substring(0, maxLen) + '...' : str
  }

  const totalPages = Math.ceil(totalDocs / PAGE_SIZE)

  return (
    <div className={cn('h-full flex flex-col', styles.textPrimary)}>
      {/* Toolbar */}
      <div className={cn('flex items-center gap-2 p-3 border-b', styles.borderColor, styles.bgSecondary)}>
        {/* Index selector */}
        <select
          value={selectedIndex}
          onChange={(e) => setSelectedIndex(e.target.value)}
          className={cn('px-3 py-1.5 text-sm rounded border min-w-[160px]', styles.borderColor, styles.bgSecondary)}
        >
          <option value="">{t('elasticsearch.doc.selectIndex', 'Select Index')}</option>
          {indices.map((idx) => (
            <option key={idx.name} value={idx.name}>
              {idx.name} ({idx.docsCount.toLocaleString()})
            </option>
          ))}
        </select>

        {/* Search */}
        <div className="flex items-center gap-1 flex-1">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder={t('elasticsearch.doc.searchPlaceholder', 'Search or enter document ID...')}
            className={cn(
              'px-3 py-1.5 text-sm rounded border flex-1 max-w-md',
              styles.borderColor,
              styles.bgSecondary,
              'focus:outline-none focus:ring-1 focus:ring-accent-primary'
            )}
            disabled={!selectedIndex}
          />
          <button
            onClick={handleSearch}
            disabled={!selectedIndex}
            className={cn('p-1.5 rounded', styles.hoverBg, 'disabled:opacity-50')}
            title={t('elasticsearch.doc.search', 'Search')}
          >
            <Search className="w-4 h-4" />
          </button>
          <button
            onClick={handleGetById}
            disabled={!selectedIndex || !searchTerm.trim()}
            className={cn('px-2 py-1.5 text-xs rounded border', styles.borderColor, styles.hoverBg, 'disabled:opacity-50')}
            title={t('elasticsearch.doc.getById', 'Get by ID')}
          >
            ID
          </button>
        </div>

        {/* Actions */}
        <button
          onClick={handleOpenCreate}
          disabled={!selectedIndex}
          className="px-3 py-1.5 text-sm rounded bg-accent-primary text-white hover:bg-accent-hover transition-colors flex items-center gap-1 disabled:opacity-50"
        >
          <Plus className="w-4 h-4" />
          {t('elasticsearch.doc.new', 'New')}
        </button>
        <button
          onClick={loadDocuments}
          disabled={!selectedIndex}
          className={cn('p-1.5 rounded', styles.hoverBg, 'disabled:opacity-50')}
          title={t('common.refresh')}
        >
          <RefreshCw className={cn('w-4 h-4', isLoading && 'animate-spin')} />
        </button>
      </div>

      {/* Documents Table */}
      <div className="flex-1 overflow-auto">
        {!selectedIndex ? (
          <div className={cn('flex flex-col items-center justify-center h-full', styles.textSecondary)}>
            <FileText className="w-12 h-12 mb-4 opacity-50" />
            <p>{t('elasticsearch.doc.selectIndexHint', 'Select an index to browse documents')}</p>
          </div>
        ) : documents.length === 0 && !isLoading ? (
          <div className={cn('flex flex-col items-center justify-center h-full', styles.textSecondary)}>
            <FileText className="w-12 h-12 mb-4 opacity-50" />
            <p>{t('elasticsearch.doc.noDocuments', 'No documents found')}</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className={cn('border-b sticky top-0', styles.borderColor, styles.bgSecondary)}>
                <th className="px-4 py-2 text-left w-10">
                  <input
                    type="checkbox"
                    checked={selectedDocs.size === documents.length && documents.length > 0}
                    onChange={toggleAllSelection}
                    className="rounded"
                  />
                </th>
                <th className="px-4 py-2 text-left text-sm font-medium w-48">{t('elasticsearch.doc.id', 'ID')}</th>
                <th className="px-4 py-2 text-left text-sm font-medium">{t('elasticsearch.doc.source', 'Source')}</th>
                <th className="px-4 py-2 text-center text-sm font-medium w-20">{t('common.actions', 'Actions')}</th>
              </tr>
            </thead>
            <tbody>
              {documents.map((doc) => (
                <tr key={doc.id} className={cn('border-b', styles.borderColor, styles.hoverBg)}>
                  <td className="px-4 py-2">
                    <input
                      type="checkbox"
                      checked={selectedDocs.has(doc.id)}
                      onChange={() => toggleSelection(doc.id)}
                      className="rounded"
                    />
                  </td>
                  <td className="px-4 py-2 text-sm font-mono truncate max-w-[200px]" title={doc.id}>
                    {doc.id}
                  </td>
                  <td className="px-4 py-2 text-sm font-mono truncate max-w-[500px]" title={JSON.stringify(doc.source)}>
                    {truncateSource(doc.source)}
                  </td>
                  <td className="px-4 py-2 text-center relative">
                    <button
                      onClick={() => setContextMenuDocId(contextMenuDocId === doc.id ? null : doc.id)}
                      className={cn('p-1 rounded', styles.hoverBg)}
                    >
                      <MoreHorizontal className="w-4 h-4" />
                    </button>
                    {contextMenuDocId === doc.id && (
                      <ContextMenu
                        onView={() => handleViewDocument(doc)}
                        onEdit={() => handleOpenEdit(doc)}
                        onDelete={() => handleDeleteDocument(doc.id)}
                        onClose={() => setContextMenuDocId(null)}
                        styles={styles}
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Footer */}
      <div className={cn('flex items-center justify-between px-4 py-2 border-t text-sm', styles.borderColor, styles.bgSecondary)}>
        <span className={styles.textSecondary}>
          {selectedDocs.size > 0 && (
            <span className="mr-4">
              {t('elasticsearch.selectedCount', { count: selectedDocs.size })}
            </span>
          )}
        </span>
        <div className="flex items-center gap-2">
          {selectedDocs.size > 0 && (
            <button
              onClick={handleDeleteSelected}
              className="px-3 py-1 text-sm rounded bg-red-500/20 text-red-500 hover:bg-red-500/30 transition-colors flex items-center gap-1"
            >
              <Trash2 className="w-3 h-3" />
              {t('common.delete', 'Delete')}
            </button>
          )}
          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className={cn('p-1 rounded', styles.hoverBg, 'disabled:opacity-50')}
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className={styles.textSecondary}>
                {page + 1} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className={cn('p-1 rounded', styles.hoverBg, 'disabled:opacity-50')}
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
          <span className={styles.textSecondary}>
            {t('elasticsearch.doc.totalDocs', { count: totalDocs })}
          </span>
        </div>
      </div>

      {/* View Document Modal */}
      {modalType === 'view' && currentDoc && (
        <Modal title={`${t('elasticsearch.doc.view', 'View Document')}: ${currentDoc.id}`} onClose={handleCloseModal} styles={styles}>
          <pre className={cn('text-sm font-mono p-4 rounded overflow-auto max-h-96', styles.bgSecondary)}>
            {JSON.stringify(currentDoc.source, null, 2)}
          </pre>
          <div className="flex justify-end gap-2 mt-4">
            <button
              onClick={() => handleOpenEdit(currentDoc)}
              className={cn('px-4 py-2 text-sm rounded flex items-center gap-1', styles.hoverBg, 'border', styles.borderColor)}
            >
              <Pencil className="w-4 h-4" />
              {t('common.edit', 'Edit')}
            </button>
          </div>
        </Modal>
      )}

      {/* Create/Edit Document Modal */}
      {(modalType === 'create' || modalType === 'edit') && (
        <Modal
          title={modalType === 'create' ? t('elasticsearch.doc.create', 'Create Document') : t('elasticsearch.doc.edit', 'Edit Document')}
          onClose={handleCloseModal}
          styles={styles}
        >
          <div className="space-y-4">
            {modalType === 'create' && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <input
                    type="checkbox"
                    id="autoGenerateId"
                    checked={autoGenerateId}
                    onChange={(e) => setAutoGenerateId(e.target.checked)}
                    className="rounded"
                  />
                  <label htmlFor="autoGenerateId" className="text-sm">
                    {t('elasticsearch.doc.autoId', 'Auto-generate ID')}
                  </label>
                </div>
                {!autoGenerateId && (
                  <input
                    type="text"
                    value={docId}
                    onChange={(e) => setDocId(e.target.value)}
                    placeholder={t('elasticsearch.doc.idPlaceholder', 'Document ID')}
                    className={cn('w-full px-3 py-2 text-sm rounded border', styles.borderColor, styles.bgSecondary)}
                  />
                )}
              </div>
            )}
            {modalType === 'edit' && (
              <div>
                <label className="block text-sm font-medium mb-1">{t('elasticsearch.doc.id', 'Document ID')}</label>
                <input
                  type="text"
                  value={currentDoc?.id || ''}
                  disabled
                  className={cn('w-full px-3 py-2 text-sm rounded border opacity-60', styles.borderColor, styles.bgSecondary)}
                />
              </div>
            )}
            <div>
              <label className="block text-sm font-medium mb-1">{t('elasticsearch.doc.source', 'Document Source (JSON)')}</label>
              <textarea
                value={docSource}
                onChange={(e) => setDocSource(e.target.value)}
                className={cn('w-full px-3 py-2 text-sm rounded border font-mono h-64', styles.borderColor, styles.bgSecondary)}
                placeholder='{\n  "field": "value"\n}'
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={handleCloseModal}
                className={cn('px-4 py-2 text-sm rounded', styles.hoverBg)}
              >
                {t('common.cancel', 'Cancel')}
              </button>
              <button
                onClick={modalType === 'create' ? handleCreateDocument : handleUpdateDocument}
                disabled={isSaving}
                className="px-4 py-2 text-sm rounded bg-accent-primary text-white hover:bg-accent-hover flex items-center gap-1 disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                {isSaving ? t('common.saving', 'Saving...') : t('common.save', 'Save')}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

// Context Menu Component
interface ContextMenuProps {
  onView: () => void
  onEdit: () => void
  onDelete: () => void
  onClose: () => void
  styles: ThemeStyles
}

function ContextMenu({ onView, onEdit, onDelete, onClose, styles }: ContextMenuProps) {
  const { t } = useTranslation()

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40" onClick={onClose} />
      {/* Menu */}
      <div className={cn('absolute right-0 top-8 z-50 w-32 rounded-lg shadow-lg border py-1', styles.bgSecondary, styles.borderColor)}>
        <button onClick={onView} className={cn('w-full px-3 py-1.5 text-sm text-left flex items-center gap-2', styles.hoverBg)}>
          <Eye className="w-4 h-4" />
          {t('elasticsearch.doc.view', 'View')}
        </button>
        <button onClick={onEdit} className={cn('w-full px-3 py-1.5 text-sm text-left flex items-center gap-2', styles.hoverBg)}>
          <Pencil className="w-4 h-4" />
          {t('common.edit', 'Edit')}
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
      <div className={cn('w-full max-w-2xl rounded-lg shadow-xl', styles.bgSecondary, styles.borderColor, 'border')}>
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
