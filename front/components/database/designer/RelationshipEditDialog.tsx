/**
 * 外键关系编辑对话框
 *
 * 用于创建和编辑外键关系的详细属性
 */

import { useState, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { X, Check } from 'lucide-react'
import { Relationship, TableNode, Cardinality, ConstraintAction } from './types'

interface RelationshipEditDialogProps {
  relationship: Relationship | null
  currentTableId: string
  tables: TableNode[]
  isDark: boolean
  onSave: (data: Omit<Relationship, 'id'> | Partial<Relationship>) => void
  onClose: () => void
}

const CARDINALITY_OPTIONS: { value: Cardinality; label: string }[] = [
  { value: 'one_to_one', label: '1:1 (One to One)' },
  { value: 'one_to_many', label: '1:N (One to Many)' },
  { value: 'many_to_one', label: 'N:1 (Many to One)' },
]

const CONSTRAINT_OPTIONS: ConstraintAction[] = [
  'NO ACTION',
  'RESTRICT',
  'CASCADE',
  'SET NULL',
  'SET DEFAULT',
]

export function RelationshipEditDialog({
  relationship,
  currentTableId,
  tables,
  isDark,
  onSave,
  onClose,
}: RelationshipEditDialogProps) {
  const { t } = useTranslation()
  const isCreating = !relationship

  // 本地状态
  const [name, setName] = useState(relationship?.name || '')
  const [targetTableId, setTargetTableId] = useState(
    relationship
      ? relationship.startTableId === currentTableId
        ? relationship.endTableId
        : relationship.startTableId
      : ''
  )
  const [sourceFieldId, setSourceFieldId] = useState(
    relationship
      ? relationship.startTableId === currentTableId
        ? relationship.startFieldId
        : relationship.endFieldId
      : ''
  )
  const [targetFieldId, setTargetFieldId] = useState(
    relationship
      ? relationship.startTableId === currentTableId
        ? relationship.endFieldId
        : relationship.startFieldId
      : ''
  )
  const [cardinality, setCardinality] = useState<Cardinality>(
    relationship?.cardinality || 'one_to_many'
  )
  const [updateConstraint, setUpdateConstraint] = useState<ConstraintAction>(
    relationship?.updateConstraint || 'NO ACTION'
  )
  const [deleteConstraint, setDeleteConstraint] = useState<ConstraintAction>(
    relationship?.deleteConstraint || 'CASCADE'
  )

  // 当前表
  const currentTable = useMemo(
    () => tables.find((t) => t.id === currentTableId),
    [tables, currentTableId]
  )

  // 可选的目标表（排除当前表）
  const targetTables = useMemo(
    () => tables.filter((t) => t.id !== currentTableId),
    [tables, currentTableId]
  )

  // 目标表
  const targetTable = useMemo(
    () => tables.find((t) => t.id === targetTableId),
    [tables, targetTableId]
  )

  // 当目标表变更时，重置目标字段
  const handleTargetTableChange = useCallback(
    (tableId: string) => {
      setTargetTableId(tableId)
      setTargetFieldId('')
    },
    []
  )

  // 保存
  const handleSave = useCallback(() => {
    if (isCreating) {
      // 创建新关系
      onSave({
        name,
        startTableId: currentTableId,
        startFieldId: sourceFieldId,
        endTableId: targetTableId,
        endFieldId: targetFieldId,
        cardinality,
        updateConstraint,
        deleteConstraint,
      })
    } else {
      // 更新现有关系
      onSave({
        name,
        startTableId: currentTableId,
        startFieldId: sourceFieldId,
        endTableId: targetTableId,
        endFieldId: targetFieldId,
        cardinality,
        updateConstraint,
        deleteConstraint,
      })
    }
  }, [
    isCreating,
    name,
    currentTableId,
    sourceFieldId,
    targetTableId,
    targetFieldId,
    cardinality,
    updateConstraint,
    deleteConstraint,
    onSave,
  ])

  // 验证
  const isValid = sourceFieldId && targetTableId && targetFieldId

  // 样式类
  const overlayClass = 'fixed inset-0 bg-black/50 flex items-center justify-center z-50'

  const dialogClass = `
    w-[420px] max-h-[80vh] rounded-lg shadow-xl overflow-hidden
    ${isDark ? 'bg-dark-bg-secondary' : 'bg-white'}
  `

  const headerClass = `
    flex items-center justify-between px-4 py-3 border-b
    ${isDark ? 'border-dark-border bg-dark-bg-hover' : 'border-gray-200 bg-gray-50'}
  `

  const titleClass = `
    text-sm font-semibold
    ${isDark ? 'text-dark-text-primary' : 'text-gray-800'}
  `

  const bodyClass = 'p-4 space-y-4 overflow-y-auto max-h-[60vh]'

  const labelClass = `
    block text-xs font-medium mb-1
    ${isDark ? 'text-dark-text-secondary' : 'text-gray-500'}
  `

  const inputClass = `
    w-full px-2 py-1.5 text-sm rounded border
    ${
      isDark
        ? 'bg-dark-bg-hover border-dark-border text-dark-text-primary focus:border-blue-500'
        : 'bg-white border-gray-300 text-gray-700 focus:border-blue-500'
    }
    focus:outline-none
  `

  const selectClass = `
    w-full px-2 py-1.5 text-sm rounded border
    ${
      isDark
        ? 'bg-dark-bg-hover border-dark-border text-dark-text-primary'
        : 'bg-white border-gray-300 text-gray-700'
    }
  `

  const sectionClass = `
    p-3 rounded border
    ${isDark ? 'border-dark-border bg-dark-bg-primary' : 'border-gray-200 bg-gray-50'}
  `

  const sectionTitleClass = `
    text-xs font-semibold mb-2 uppercase tracking-wide
    ${isDark ? 'text-dark-text-secondary' : 'text-gray-500'}
  `

  const footerClass = `
    flex justify-end gap-2 px-4 py-3 border-t
    ${isDark ? 'border-dark-border bg-dark-bg-hover' : 'border-gray-200 bg-gray-50'}
  `

  const cancelBtnClass = `
    px-3 py-1.5 text-sm rounded
    ${
      isDark
        ? 'text-dark-text-secondary hover:bg-dark-bg-hover'
        : 'text-gray-600 hover:bg-gray-100'
    }
  `

  const saveBtnClass = `
    flex items-center gap-1 px-3 py-1.5 text-sm rounded
    bg-blue-500 hover:bg-blue-600 text-white
    disabled:opacity-50 disabled:cursor-not-allowed
  `

  return (
    <div className={overlayClass} onClick={onClose}>
      <div className={dialogClass} onClick={(e) => e.stopPropagation()}>
        {/* 头部 */}
        <div className={headerClass}>
          <h3 className={titleClass}>
            {isCreating ? t('database.erDesigner.newRelationship') : t('database.erDesigner.editRelationship')}
          </h3>
          <button
            onClick={onClose}
            className={`p-1 rounded ${isDark ? 'hover:bg-dark-bg-hover' : 'hover:bg-gray-200'}`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 内容 */}
        <div className={bodyClass}>
          {/* 关系名称 */}
          <div>
            <label className={labelClass}>{t('database.erDesigner.relationshipName')}</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputClass}
              placeholder="fk_table_field"
            />
          </div>

          {/* 源端配置 */}
          <div className={sectionClass}>
            <div className={sectionTitleClass}>{t('database.erDesigner.sourceTable')}</div>
            <div className="space-y-2">
              <div>
                <label className={labelClass}>{t('database.erDesigner.table')}</label>
                <input
                  type="text"
                  value={currentTable?.name || ''}
                  disabled
                  className={`${inputClass} opacity-60 cursor-not-allowed`}
                />
              </div>
              <div>
                <label className={labelClass}>{t('database.erDesigner.field')}</label>
                <select
                  value={sourceFieldId}
                  onChange={(e) => setSourceFieldId(e.target.value)}
                  className={selectClass}
                >
                  <option value="">{t('database.erDesigner.selectField')}</option>
                  {currentTable?.fields.map((field) => (
                    <option key={field.id} value={field.id}>
                      {field.name} ({field.type})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* 目标端配置 */}
          <div className={sectionClass}>
            <div className={sectionTitleClass}>{t('database.erDesigner.targetTable')}</div>
            <div className="space-y-2">
              <div>
                <label className={labelClass}>{t('database.erDesigner.table')}</label>
                <select
                  value={targetTableId}
                  onChange={(e) => handleTargetTableChange(e.target.value)}
                  className={selectClass}
                >
                  <option value="">{t('database.erDesigner.selectTable')}</option>
                  {targetTables.map((table) => (
                    <option key={table.id} value={table.id}>
                      {table.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>{t('database.erDesigner.field')}</label>
                <select
                  value={targetFieldId}
                  onChange={(e) => setTargetFieldId(e.target.value)}
                  className={selectClass}
                  disabled={!targetTableId}
                >
                  <option value="">{t('database.erDesigner.selectField')}</option>
                  {targetTable?.fields.map((field) => (
                    <option key={field.id} value={field.id}>
                      {field.name} ({field.type})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* 基数 */}
          <div>
            <label className={labelClass}>{t('database.erDesigner.cardinality')}</label>
            <select
              value={cardinality}
              onChange={(e) => setCardinality(e.target.value as Cardinality)}
              className={selectClass}
            >
              {CARDINALITY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* 约束动作 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>ON UPDATE</label>
              <select
                value={updateConstraint}
                onChange={(e) => setUpdateConstraint(e.target.value as ConstraintAction)}
                className={selectClass}
              >
                {CONSTRAINT_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>ON DELETE</label>
              <select
                value={deleteConstraint}
                onChange={(e) => setDeleteConstraint(e.target.value as ConstraintAction)}
                className={selectClass}
              >
                {CONSTRAINT_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* 底部 */}
        <div className={footerClass}>
          <button onClick={onClose} className={cancelBtnClass}>
            {t('common.cancel')}
          </button>
          <button onClick={handleSave} className={saveBtnClass} disabled={!isValid}>
            <Check className="w-3.5 h-3.5" />
            {t('common.save')}
          </button>
        </div>
      </div>
    </div>
  )
}

export default RelationshipEditDialog
