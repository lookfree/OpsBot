/**
 * ER 图设计器主容器
 *
 * 整合工具栏、画布和属性面板
 */

import React, { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useDiagramStore } from '@/stores/diagramStore'
import { useThemeStore } from '@/stores/themeStore'
import { ERDiagramCanvas } from './ERDiagramCanvas'
import { ERDiagramToolbar } from './ERDiagramToolbar'
import { FieldEditPanel } from './FieldEditPanel'
import { IndexEditPanel } from './IndexEditPanel'
import { RelationshipEditPanel } from './RelationshipEditPanel'
import { TableField, TableIndex, Relationship, TABLE_COLORS } from './types'
import type { DatabaseType } from '@/config/datatypes/types'

interface ERDiagramDesignerProps {
  onClose?: () => void
  className?: string
}

export function ERDiagramDesigner({ onClose, className = '' }: ERDiagramDesignerProps) {
  const { t } = useTranslation()
  const { theme } = useThemeStore()
  const isDark = theme === 'dark'

  const {
    diagram,
    selectedTableId,
    getTable,
    updateTable,
    updateField,
    addField,
    deleteField,
    deleteTable,
    addIndex,
    updateIndex,
    deleteIndex,
    addRelationship,
    updateRelationship,
    deleteRelationship,
  } = useDiagramStore()

  const selectedTable = selectedTableId ? getTable(selectedTableId) : null

  // 更新表名
  const handleTableNameChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (selectedTableId) {
        updateTable(selectedTableId, { name: e.target.value })
      }
    },
    [selectedTableId, updateTable]
  )

  // 更新表注释
  const handleTableCommentChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      if (selectedTableId) {
        updateTable(selectedTableId, { comment: e.target.value })
      }
    },
    [selectedTableId, updateTable]
  )

  // 更新表颜色
  const handleTableColorChange = useCallback(
    (color: string) => {
      if (selectedTableId) {
        updateTable(selectedTableId, { color })
      }
    },
    [selectedTableId, updateTable]
  )

  // 更新字段
  const handleFieldChange = useCallback(
    (fieldId: string, updates: Partial<TableField>) => {
      if (selectedTableId) {
        updateField(selectedTableId, fieldId, updates)
      }
    },
    [selectedTableId, updateField]
  )

  // 添加字段
  const handleAddField = useCallback(() => {
    if (selectedTableId) {
      addField(selectedTableId)
    }
  }, [selectedTableId, addField])

  // 删除字段
  const handleDeleteField = useCallback(
    (fieldId: string) => {
      if (selectedTableId) {
        deleteField(selectedTableId, fieldId)
      }
    },
    [selectedTableId, deleteField]
  )

  // 添加索引
  const handleAddIndex = useCallback(() => {
    if (selectedTableId) {
      return addIndex(selectedTableId)
    }
    return null
  }, [selectedTableId, addIndex])

  // 更新索引
  const handleUpdateIndex = useCallback(
    (indexId: string, updates: Partial<TableIndex>) => {
      if (selectedTableId) {
        updateIndex(selectedTableId, indexId, updates)
      }
    },
    [selectedTableId, updateIndex]
  )

  // 删除索引
  const handleDeleteIndex = useCallback(
    (indexId: string) => {
      if (selectedTableId) {
        deleteIndex(selectedTableId, indexId)
      }
    },
    [selectedTableId, deleteIndex]
  )

  // 添加关系
  const handleAddRelationship = useCallback(
    (relationshipData: Omit<Relationship, 'id'>) => {
      return addRelationship(relationshipData)
    },
    [addRelationship]
  )

  // 更新关系
  const handleUpdateRelationship = useCallback(
    (relationshipId: string, updates: Partial<Relationship>) => {
      updateRelationship(relationshipId, updates)
    },
    [updateRelationship]
  )

  // 删除关系
  const handleDeleteRelationship = useCallback(
    (relationshipId: string) => {
      deleteRelationship(relationshipId)
    },
    [deleteRelationship]
  )

  // 删除表
  const handleDeleteTable = useCallback(() => {
    if (selectedTableId && window.confirm(t('database.erDesigner.confirmDeleteTable'))) {
      deleteTable(selectedTableId)
    }
  }, [selectedTableId, deleteTable, t])

  // 样式类
  const containerClass = `
    flex flex-col h-full
    ${isDark ? 'bg-dark-bg-primary' : 'bg-light-bg-primary'}
  `

  const panelClass = `
    w-72 border-l overflow-y-auto
    ${isDark ? 'bg-dark-bg-secondary border-dark-border' : 'bg-white border-gray-200'}
  `

  const labelClass = `
    block text-xs font-medium mb-1
    ${isDark ? 'text-dark-text-secondary' : 'text-gray-500'}
  `

  const inputClass = `
    w-full px-2 py-1.5 text-sm rounded border outline-none transition-colors
    ${
      isDark
        ? 'bg-dark-bg-secondary border-dark-border text-dark-text-primary focus:border-accent-primary'
        : 'bg-white border-gray-300 text-gray-700 focus:border-accent-primary'
    }
  `

  return (
    <div className={`${containerClass} ${className}`}>
      {/* 工具栏 */}
      <ERDiagramToolbar onClose={onClose} />

      {/* 主内容区 */}
      <div className="flex flex-1 overflow-hidden">
        {/* 画布 */}
        <ERDiagramCanvas className="flex-1" />

        {/* 属性面板 */}
        {selectedTable && (
          <div className={panelClass}>
            <div className="p-4">
              {/* 表属性 */}
              <div className="mb-4">
                <h3
                  className={`text-sm font-semibold mb-3 ${
                    isDark ? 'text-dark-text-primary' : 'text-gray-800'
                  }`}
                >
                  {t('database.erDesigner.tableProperties')}
                </h3>

                {/* 表名 */}
                <div className="mb-3">
                  <label className={labelClass}>{t('database.erDesigner.tableName')}</label>
                  <input
                    type="text"
                    value={selectedTable.name}
                    onChange={handleTableNameChange}
                    className={inputClass}
                  />
                </div>

                {/* 表注释 */}
                <div className="mb-3">
                  <label className={labelClass}>{t('database.comment')}</label>
                  <textarea
                    value={selectedTable.comment}
                    onChange={handleTableCommentChange}
                    className={`${inputClass} h-16 resize-none`}
                  />
                </div>

                {/* 表颜色 */}
                <div className="mb-3">
                  <label className={labelClass}>{t('database.erDesigner.tableColor')}</label>
                  <div className="flex gap-1 flex-wrap">
                    {TABLE_COLORS.map((color) => (
                      <button
                        key={color}
                        className={`w-6 h-6 rounded ${
                          selectedTable.color === color ? 'ring-2 ring-offset-1 ring-blue-500' : ''
                        }`}
                        style={{ backgroundColor: color }}
                        onClick={() => handleTableColorChange(color)}
                      />
                    ))}
                  </div>
                </div>

                {/* 删除表 */}
                <button
                  className="w-full px-3 py-1.5 text-sm rounded bg-red-500 hover:bg-red-600 text-white"
                  onClick={handleDeleteTable}
                >
                  {t('database.erDesigner.deleteTable')}
                </button>
              </div>

              {/* 分隔线 */}
              <div className={`border-t mb-4 ${isDark ? 'border-dark-border' : 'border-gray-200'}`} />

              {/* 字段列表 - 使用 FieldEditPanel */}
              <FieldEditPanel
                fields={selectedTable.fields}
                database={diagram.database as DatabaseType}
                isDark={isDark}
                onUpdateField={handleFieldChange}
                onDeleteField={handleDeleteField}
                onAddField={handleAddField}
              />

              {/* 分隔线 */}
              <div className={`border-t my-4 ${isDark ? 'border-dark-border' : 'border-gray-200'}`} />

              {/* 索引列表 - 使用 IndexEditPanel */}
              <IndexEditPanel
                indices={selectedTable.indices}
                fields={selectedTable.fields}
                database={diagram.database as DatabaseType}
                isDark={isDark}
                onAddIndex={handleAddIndex}
                onUpdateIndex={handleUpdateIndex}
                onDeleteIndex={handleDeleteIndex}
              />

              {/* 分隔线 */}
              <div className={`border-t my-4 ${isDark ? 'border-dark-border' : 'border-gray-200'}`} />

              {/* 外键关系列表 - 使用 RelationshipEditPanel */}
              <RelationshipEditPanel
                relationships={diagram.relationships}
                currentTableId={selectedTableId!}
                tables={diagram.tables}
                isDark={isDark}
                onAddRelationship={handleAddRelationship}
                onUpdateRelationship={handleUpdateRelationship}
                onDeleteRelationship={handleDeleteRelationship}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default ERDiagramDesigner
