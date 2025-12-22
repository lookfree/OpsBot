/**
 * 外键关系编辑面板
 *
 * 显示当前表相关的所有外键关系，支持添加、编辑、删除
 */

import { useState, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Trash2, Edit2, Link2 } from 'lucide-react'
import { Relationship, TableNode, Cardinality } from './types'
import { RelationshipEditDialog } from './RelationshipEditDialog'

interface RelationshipEditPanelProps {
  relationships: Relationship[]
  currentTableId: string
  tables: TableNode[]
  isDark: boolean
  onAddRelationship: (relationship: Omit<Relationship, 'id'>) => Relationship | null
  onUpdateRelationship: (relationshipId: string, updates: Partial<Relationship>) => void
  onDeleteRelationship: (relationshipId: string) => void
}

// 获取基数显示文本
function getCardinalityLabel(cardinality: Cardinality): string {
  switch (cardinality) {
    case 'one_to_one':
      return '1:1'
    case 'one_to_many':
      return '1:N'
    case 'many_to_one':
      return 'N:1'
    default:
      return cardinality
  }
}

export function RelationshipEditPanel({
  relationships,
  currentTableId,
  tables,
  isDark,
  onAddRelationship,
  onUpdateRelationship,
  onDeleteRelationship,
}: RelationshipEditPanelProps) {
  const { t } = useTranslation()

  // 编辑对话框状态
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editingRelationship, setEditingRelationship] = useState<Relationship | null>(null)
  const [isCreating, setIsCreating] = useState(false)

  // 过滤出与当前表相关的关系
  const tableRelationships = useMemo(
    () =>
      relationships.filter(
        (r) => r.startTableId === currentTableId || r.endTableId === currentTableId
      ),
    [relationships, currentTableId]
  )

  // 获取表名
  const getTableName = useCallback(
    (tableId: string) => {
      const table = tables.find((t) => t.id === tableId)
      return table?.name || '(unknown)'
    },
    [tables]
  )

  // 获取字段名
  const getFieldName = useCallback(
    (tableId: string, fieldId: string) => {
      const table = tables.find((t) => t.id === tableId)
      const field = table?.fields.find((f) => f.id === fieldId)
      return field?.name || '(unknown)'
    },
    [tables]
  )

  // 打开新建关系对话框
  const handleAddRelationship = useCallback(() => {
    setIsCreating(true)
    setEditingRelationship(null)
    setEditDialogOpen(true)
  }, [])

  // 打开编辑关系对话框
  const handleEditRelationship = useCallback((relationship: Relationship) => {
    setIsCreating(false)
    setEditingRelationship(relationship)
    setEditDialogOpen(true)
  }, [])

  // 保存关系
  const handleSaveRelationship = useCallback(
    (data: Omit<Relationship, 'id'> | Partial<Relationship>) => {
      if (isCreating) {
        onAddRelationship(data as Omit<Relationship, 'id'>)
      } else if (editingRelationship) {
        onUpdateRelationship(editingRelationship.id, data as Partial<Relationship>)
      }
      setEditDialogOpen(false)
      setEditingRelationship(null)
    },
    [isCreating, editingRelationship, onAddRelationship, onUpdateRelationship]
  )

  // 关闭对话框
  const handleCloseDialog = useCallback(() => {
    setEditDialogOpen(false)
    setEditingRelationship(null)
  }, [])

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

  const relationshipCardClass = `
    p-2 rounded border
    ${isDark ? 'border-dark-border bg-dark-bg-hover' : 'border-gray-200 bg-gray-50'}
  `

  const relationshipNameClass = `
    font-medium text-sm
    ${isDark ? 'text-dark-text-primary' : 'text-gray-800'}
  `

  const relationshipInfoClass = `
    text-xs mt-1
    ${isDark ? 'text-dark-text-secondary' : 'text-gray-500'}
  `

  return (
    <div>
      {/* 头部 */}
      <div className={headerClass}>
        <h4 className="text-sm font-medium">{t('database.erDesigner.relationships')} ({tableRelationships.length})</h4>
        <button className={addButtonClass} onClick={handleAddRelationship}>
          <Plus className="w-3 h-3" />
          {t('common.add')}
        </button>
      </div>

      {/* 关系列表 */}
      <div className="space-y-2">
        {tableRelationships.map((rel) => {
          const isSource = rel.startTableId === currentTableId
          const otherTableId = isSource ? rel.endTableId : rel.startTableId
          const otherFieldId = isSource ? rel.endFieldId : rel.startFieldId
          const thisFieldId = isSource ? rel.startFieldId : rel.endFieldId

          return (
            <div key={rel.id} className={relationshipCardClass}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Link2
                    className={`w-4 h-4 ${isDark ? 'text-blue-400' : 'text-blue-500'}`}
                  />
                  <span className={relationshipNameClass}>
                    {rel.name || `FK to ${getTableName(otherTableId)}`}
                  </span>
                  <span
                    className={`px-1.5 py-0.5 text-xs rounded ${
                      isDark ? 'bg-blue-500/20 text-blue-400' : 'bg-blue-100 text-blue-700'
                    }`}
                  >
                    {getCardinalityLabel(rel.cardinality)}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleEditRelationship(rel)}
                    className={`p-1 rounded ${
                      isDark ? 'hover:bg-dark-bg-hover' : 'hover:bg-gray-200'
                    }`}
                    title={t('database.erDesigner.editRelationship')}
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => onDeleteRelationship(rel.id)}
                    className="p-1 rounded text-red-500 hover:bg-red-500/10"
                    title={t('database.erDesigner.deleteRelationship')}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <div className={relationshipInfoClass}>
                <div>
                  {getFieldName(currentTableId, thisFieldId)} →{' '}
                  {getTableName(otherTableId)}.{getFieldName(otherTableId, otherFieldId)}
                </div>
                <div className="mt-0.5 text-xs opacity-75">
                  ON UPDATE: {rel.updateConstraint} | ON DELETE: {rel.deleteConstraint}
                </div>
              </div>
            </div>
          )
        })}

        {tableRelationships.length === 0 && (
          <div
            className={`
              text-center py-4 text-sm
              ${isDark ? 'text-dark-text-secondary' : 'text-gray-500'}
            `}
          >
            {t('database.erDesigner.noRelationshipsDefined')}
          </div>
        )}
      </div>

      {/* 关系编辑对话框 */}
      {editDialogOpen && (
        <RelationshipEditDialog
          relationship={editingRelationship}
          currentTableId={currentTableId}
          tables={tables}
          isDark={isDark}
          onSave={handleSaveRelationship}
          onClose={handleCloseDialog}
        />
      )}
    </div>
  )
}

export default RelationshipEditPanel
