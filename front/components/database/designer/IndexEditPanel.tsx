/**
 * 索引编辑面板
 *
 * 显示表的所有索引，支持添加、编辑、删除索引
 */

import { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Trash2, Edit2, Key } from 'lucide-react'
import { TableIndex, TableField } from './types'
import { IndexEditDialog } from './IndexEditDialog'
import type { DatabaseType } from '@/config/datatypes/types'

interface IndexEditPanelProps {
  indices: TableIndex[]
  fields: TableField[]
  database: DatabaseType
  isDark: boolean
  onAddIndex: () => TableIndex | null
  onUpdateIndex: (indexId: string, updates: Partial<TableIndex>) => void
  onDeleteIndex: (indexId: string) => void
}

export function IndexEditPanel({
  indices,
  fields,
  database,
  isDark,
  onAddIndex,
  onUpdateIndex,
  onDeleteIndex,
}: IndexEditPanelProps) {
  const { t } = useTranslation()

  // 编辑对话框状态
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editingIndex, setEditingIndex] = useState<TableIndex | null>(null)

  // 打开新建索引对话框
  const handleAddIndex = useCallback(() => {
    const newIndex = onAddIndex()
    if (newIndex) {
      setEditingIndex(newIndex)
      setEditDialogOpen(true)
    }
  }, [onAddIndex])

  // 打开编辑索引对话框
  const handleEditIndex = useCallback((index: TableIndex) => {
    setEditingIndex(index)
    setEditDialogOpen(true)
  }, [])

  // 保存索引
  const handleSaveIndex = useCallback(
    (updates: Partial<TableIndex>) => {
      if (editingIndex) {
        onUpdateIndex(editingIndex.id, updates)
      }
      setEditDialogOpen(false)
      setEditingIndex(null)
    },
    [editingIndex, onUpdateIndex]
  )

  // 关闭对话框
  const handleCloseDialog = useCallback(() => {
    // 如果是新建的空索引，删除它
    if (editingIndex && !editingIndex.name && editingIndex.fields.length === 0) {
      onDeleteIndex(editingIndex.id)
    }
    setEditDialogOpen(false)
    setEditingIndex(null)
  }, [editingIndex, onDeleteIndex])

  // 样式
  const headerClass = `
    flex items-center justify-between mb-2
    ${isDark ? 'text-dark-text-primary' : 'text-gray-800'}
  `

  const addButtonClass = `
    flex items-center gap-1 px-2 py-1 text-xs rounded
    bg-blue-500 hover:bg-blue-600 text-white
    transition-colors
  `

  const indexCardClass = `
    p-2 rounded border
    ${isDark ? 'border-dark-border bg-dark-bg-hover' : 'border-gray-200 bg-gray-50'}
  `

  const indexNameClass = `
    font-medium text-sm
    ${isDark ? 'text-dark-text-primary' : 'text-gray-800'}
  `

  const indexFieldsClass = `
    text-xs mt-1
    ${isDark ? 'text-dark-text-secondary' : 'text-gray-500'}
  `

  return (
    <div>
      {/* 头部 */}
      <div className={headerClass}>
        <h4 className="text-sm font-medium">{t('database.erDesigner.indexes')} ({indices.length})</h4>
        <button className={addButtonClass} onClick={handleAddIndex}>
          <Plus className="w-3 h-3" />
          {t('common.add')}
        </button>
      </div>

      {/* 索引列表 */}
      <div className="space-y-2">
        {indices.map((index) => (
          <div key={index.id} className={indexCardClass}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Key className={`w-4 h-4 ${index.unique ? 'text-yellow-500' : isDark ? 'text-dark-text-secondary' : 'text-gray-400'}`} />
                <span className={indexNameClass}>
                  {index.name || '(unnamed)'}
                </span>
                {index.unique && (
                  <span className="px-1.5 py-0.5 text-xs rounded bg-yellow-500/20 text-yellow-600">
                    UNIQUE
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => handleEditIndex(index)}
                  className={`p-1 rounded ${isDark ? 'hover:bg-dark-bg-hover' : 'hover:bg-gray-200'}`}
                  title={t('database.erDesigner.editIndex')}
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => onDeleteIndex(index.id)}
                  className="p-1 rounded text-red-500 hover:bg-red-500/10"
                  title={t('common.delete')}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <div className={indexFieldsClass}>
              Fields: {index.fields.length > 0 ? index.fields.join(', ') : '(none)'}
            </div>
          </div>
        ))}

        {indices.length === 0 && (
          <div
            className={`
              text-center py-4 text-sm
              ${isDark ? 'text-dark-text-secondary' : 'text-gray-500'}
            `}
          >
            {t('database.erDesigner.noIndexesDefined')}
          </div>
        )}
      </div>

      {/* 索引编辑对话框 */}
      {editDialogOpen && editingIndex && (
        <IndexEditDialog
          index={editingIndex}
          fields={fields}
          database={database}
          isDark={isDark}
          onSave={handleSaveIndex}
          onClose={handleCloseDialog}
        />
      )}
    </div>
  )
}

export default IndexEditPanel
