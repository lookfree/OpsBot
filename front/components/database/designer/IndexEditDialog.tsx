/**
 * 索引编辑对话框
 *
 * 用于创建和编辑单个索引的详细属性
 */

import { useState, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { X, Check } from 'lucide-react'
import { TableIndex, TableField } from './types'
import { getIndexTypes } from '@/config/dbDialects'
import type { DatabaseType } from '@/config/datatypes/types'

interface IndexEditDialogProps {
  index: TableIndex
  fields: TableField[]
  database: DatabaseType
  isDark: boolean
  onSave: (updates: Partial<TableIndex>) => void
  onClose: () => void
}

export function IndexEditDialog({
  index,
  fields,
  database,
  isDark,
  onSave,
  onClose,
}: IndexEditDialogProps) {
  const { t } = useTranslation()

  // 获取当前数据库支持的索引类型
  const indexTypes = useMemo(() => getIndexTypes(database), [database])

  // 本地状态
  const [name, setName] = useState(index.name)
  const [indexType, setIndexType] = useState(index.type || 'BTREE')
  const [isUnique, setIsUnique] = useState(index.unique)
  const [selectedFields, setSelectedFields] = useState<string[]>(index.fields)

  // 可用字段列表（排除已选的）
  const availableFields = useMemo(
    () => fields.filter((f) => !selectedFields.includes(f.name)),
    [fields, selectedFields]
  )

  // 添加字段到索引
  const handleAddField = useCallback((fieldName: string) => {
    setSelectedFields((prev) => [...prev, fieldName])
  }, [])

  // 从索引移除字段
  const handleRemoveField = useCallback((fieldName: string) => {
    setSelectedFields((prev) => prev.filter((f) => f !== fieldName))
  }, [])

  // 上移字段
  const handleMoveUp = useCallback((fieldIndex: number) => {
    if (fieldIndex === 0) return
    setSelectedFields((prev) => {
      const next = [...prev]
      ;[next[fieldIndex - 1], next[fieldIndex]] = [next[fieldIndex], next[fieldIndex - 1]]
      return next
    })
  }, [])

  // 下移字段
  const handleMoveDown = useCallback((fieldIndex: number) => {
    setSelectedFields((prev) => {
      if (fieldIndex >= prev.length - 1) return prev
      const next = [...prev]
      ;[next[fieldIndex], next[fieldIndex + 1]] = [next[fieldIndex + 1], next[fieldIndex]]
      return next
    })
  }, [])

  // 保存
  const handleSave = useCallback(() => {
    onSave({
      name,
      type: indexType,
      unique: isUnique,
      fields: selectedFields,
    })
  }, [name, indexType, isUnique, selectedFields, onSave])

  // 样式类
  const overlayClass = 'fixed inset-0 bg-black/50 flex items-center justify-center z-50'

  const dialogClass = `
    w-96 max-h-[80vh] rounded-lg shadow-xl overflow-hidden
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

  const checkboxLabelClass = `
    flex items-center gap-2 text-sm cursor-pointer
    ${isDark ? 'text-dark-text-primary' : 'text-gray-700'}
  `

  const fieldTagClass = `
    flex items-center gap-1 px-2 py-1 text-xs rounded
    ${isDark ? 'bg-blue-500/20 text-blue-400' : 'bg-blue-100 text-blue-700'}
  `

  const addFieldBtnClass = `
    px-2 py-1 text-xs rounded border
    ${
      isDark
        ? 'border-dark-border text-dark-text-secondary hover:bg-dark-bg-hover'
        : 'border-gray-300 text-gray-600 hover:bg-gray-100'
    }
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
          <h3 className={titleClass}>{index.name ? t('database.erDesigner.editIndex') : t('database.erDesigner.newIndex')}</h3>
          <button
            onClick={onClose}
            className={`p-1 rounded ${isDark ? 'hover:bg-dark-bg-hover' : 'hover:bg-gray-200'}`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 内容 */}
        <div className={bodyClass}>
          {/* 索引名称 */}
          <div>
            <label className={labelClass}>{t('database.erDesigner.indexName')}</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputClass}
              placeholder="idx_table_field"
            />
          </div>

          {/* 索引类型 */}
          <div>
            <label className={labelClass}>{t('database.erDesigner.indexType')}</label>
            <select
              value={indexType}
              onChange={(e) => setIndexType(e.target.value)}
              className={selectClass}
            >
              {indexTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>

          {/* 唯一约束 */}
          <div>
            <label className={checkboxLabelClass}>
              <input
                type="checkbox"
                checked={isUnique}
                onChange={(e) => setIsUnique(e.target.checked)}
                className="rounded"
              />
              {t('database.erDesigner.uniqueIndex')}
            </label>
          </div>

          {/* 索引字段 */}
          <div>
            <label className={labelClass}>{t('database.erDesigner.indexFields')}</label>
            <div className="space-y-2">
              {/* 已选字段列表 */}
              {selectedFields.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {selectedFields.map((fieldName, idx) => (
                    <div key={fieldName} className={fieldTagClass}>
                      <span className="text-xs text-gray-400 mr-1">{idx + 1}.</span>
                      {fieldName}
                      <div className="flex items-center ml-1">
                        <button
                          onClick={() => handleMoveUp(idx)}
                          className="p-0.5 hover:bg-white/20 rounded"
                          disabled={idx === 0}
                          title={t('database.erDesigner.moveUp')}
                        >
                          ↑
                        </button>
                        <button
                          onClick={() => handleMoveDown(idx)}
                          className="p-0.5 hover:bg-white/20 rounded"
                          disabled={idx === selectedFields.length - 1}
                          title={t('database.erDesigner.moveDown')}
                        >
                          ↓
                        </button>
                        <button
                          onClick={() => handleRemoveField(fieldName)}
                          className="p-0.5 hover:bg-red-500/30 rounded text-red-400"
                          title={t('common.remove')}
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div
                  className={`text-xs py-2 ${
                    isDark ? 'text-dark-text-secondary' : 'text-gray-400'
                  }`}
                >
                  {t('database.erDesigner.noFieldsSelected')}
                </div>
              )}

              {/* 添加字段下拉 */}
              {availableFields.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {availableFields.map((field) => (
                    <button
                      key={field.id}
                      onClick={() => handleAddField(field.name)}
                      className={addFieldBtnClass}
                    >
                      + {field.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 底部 */}
        <div className={footerClass}>
          <button onClick={onClose} className={cancelBtnClass}>
            {t('common.cancel')}
          </button>
          <button
            onClick={handleSave}
            className={saveBtnClass}
            disabled={!name || selectedFields.length === 0}
          >
            <Check className="w-3.5 h-3.5" />
            {t('common.save')}
          </button>
        </div>
      </div>
    </div>
  )
}

export default IndexEditDialog
