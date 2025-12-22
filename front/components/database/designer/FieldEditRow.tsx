/**
 * 字段编辑行组件
 *
 * 参考 DrawDB 设计：紧凑布局，Popover 编辑详细属性
 */

import React, { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Trash2, Key } from 'lucide-react'
import { TableField } from './types'
import { getDataType, getDataTypeNames } from '@/config/datatypes'
import type { DatabaseType } from '@/config/datatypes/types'

interface FieldEditRowProps {
  field: TableField
  database: DatabaseType
  isDark: boolean
  onChange: (updates: Partial<TableField>) => void
  onDelete: () => void
}

export function FieldEditRow({
  field,
  database,
  isDark,
  onChange,
  onDelete,
}: FieldEditRowProps) {
  const { t } = useTranslation()
  const [showPopover, setShowPopover] = useState(false)

  // 获取类型列表
  const dataTypes = useMemo(() => getDataTypeNames(database), [database])

  // 获取当前类型的元数据
  const typeDef = useMemo(
    () => getDataType(database, field.type),
    [database, field.type]
  )

  // 是否需要显示 size 输入
  const showSize = typeDef?.isSized ?? false
  const showPrecision = typeDef?.hasPrecision ?? false
  const showUnsigned = typeDef?.signed ?? false

  // 处理类型变更
  const handleTypeChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const newType = e.target.value
      const newTypeDef = getDataType(database, newType)

      const updates: Partial<TableField> = { type: newType }

      if (!newTypeDef?.isSized) {
        updates.size = undefined
      }
      if (!newTypeDef?.hasPrecision) {
        updates.precision = undefined
        updates.scale = undefined
      }
      if (!newTypeDef?.signed) {
        updates.unsigned = undefined
      }

      onChange(updates)
    },
    [database, onChange]
  )

  // 切换 Nullable
  const toggleNullable = useCallback(() => {
    onChange({ notNull: !field.notNull })
  }, [field.notNull, onChange])

  // 切换主键
  const togglePrimary = useCallback(() => {
    const isPrimary = !field.primary
    onChange({
      primary: isPrimary,
      notNull: isPrimary ? true : field.notNull,
    })
  }, [field.primary, field.notNull, onChange])

  // 样式
  const rowClass = `
    flex items-center gap-2 p-2 rounded border transition-colors
    ${isDark
      ? 'border-dark-border hover:border-dark-border bg-dark-bg-hover'
      : 'border-gray-200 hover:border-gray-300 bg-white'}
  `

  const inputClass = `
    px-2 h-8 text-xs rounded border
    ${isDark
      ? 'bg-dark-bg-primary border-dark-border text-dark-text-primary focus:border-blue-500'
      : 'bg-gray-50 border-gray-300 text-gray-700 focus:border-blue-500'}
    focus:outline-none
  `

  const selectClass = `
    px-1 h-8 text-xs rounded border truncate
    ${isDark
      ? 'bg-dark-bg-primary border-dark-border text-dark-text-primary'
      : 'bg-gray-50 border-gray-300 text-gray-700'}
    focus:outline-none focus:border-blue-500
  `

  const toggleBtnClass = (active: boolean) => `
    w-7 h-7 flex items-center justify-center rounded text-xs font-medium transition-colors
    ${active
      ? 'bg-blue-500 text-white'
      : isDark
        ? 'bg-dark-bg-primary text-dark-text-secondary hover:bg-dark-bg-hover'
        : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}
  `

  const iconBtnClass = `
    w-6 h-7 flex items-center justify-center rounded transition-colors
    ${isDark
      ? 'text-dark-text-secondary hover:bg-dark-bg-hover'
      : 'text-gray-500 hover:bg-gray-200'}
  `

  const popoverClass = `
    absolute right-0 top-full mt-1 z-50 w-64 p-3 rounded-lg shadow-lg border
    ${isDark
      ? 'bg-dark-bg-secondary border-dark-border'
      : 'bg-white border-gray-200'}
  `

  const labelClass = `
    text-xs mb-1
    ${isDark ? 'text-dark-text-secondary' : 'text-gray-500'}
  `

  const checkboxLabelClass = `
    flex items-center gap-2 text-xs cursor-pointer
    ${isDark ? 'text-dark-text-secondary' : 'text-gray-600'}
  `

  return (
    <div className={rowClass}>
      {/* 字段名 */}
      <input
        type="text"
        value={field.name}
        onChange={(e) => onChange({ name: e.target.value })}
        className={`${inputClass} flex-1 min-w-[80px]`}
        placeholder={t('database.erDesigner.fieldName')}
      />

      {/* 类型选择 */}
      <select
        value={field.type}
        onChange={handleTypeChange}
        className={`${selectClass} w-24`}
        title={field.type}
      >
        {dataTypes.map((type) => (
          <option key={type} value={type}>
            {type}
          </option>
        ))}
      </select>

      {/* Nullable 按钮 - ? 表示允许 NULL */}
      <button
        onClick={toggleNullable}
        className={toggleBtnClass(!field.notNull)}
        title={field.notNull ? 'NOT NULL' : 'NULLABLE'}
      >
        ?
      </button>

      {/* 主键按钮 */}
      <button
        onClick={togglePrimary}
        className={toggleBtnClass(field.primary)}
        title={field.primary ? 'Primary Key' : 'Set as Primary Key'}
      >
        <Key className="w-4 h-4" />
      </button>

      {/* 更多选项按钮 */}
      <div className="relative">
        <button
          onClick={() => setShowPopover(!showPopover)}
          className={iconBtnClass}
          title={t('database.advanced')}
        >
          <span className="text-base leading-none">⋯</span>
        </button>

        {/* Popover 详细编辑 */}
        {showPopover && (
          <>
            {/* 点击外部关闭 */}
            <div
              className="fixed inset-0 z-40"
              onClick={() => setShowPopover(false)}
            />
            <div className={popoverClass}>
              {/* 字段标题 */}
              <div className={`font-medium mb-3 ${isDark ? 'text-dark-text-primary' : 'text-gray-800'}`}>
                {field.name || t('database.erDesigner.fieldName')}
                <span className={`ml-2 text-xs ${isDark ? 'text-dark-text-secondary' : 'text-gray-500'}`}>
                  {field.type}
                </span>
              </div>

              {/* 快捷属性切换 */}
              <div className="flex flex-wrap gap-1 mb-3">
                <button
                  onClick={togglePrimary}
                  className={`px-2 py-1 text-xs rounded ${
                    field.primary
                      ? 'bg-yellow-500 text-white'
                      : isDark ? 'bg-dark-bg-hover text-dark-text-secondary' : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  Primary
                </button>
                <button
                  onClick={() => onChange({ unique: !field.unique })}
                  className={`px-2 py-1 text-xs rounded ${
                    field.unique
                      ? 'bg-purple-500 text-white'
                      : isDark ? 'bg-dark-bg-hover text-dark-text-secondary' : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  Unique
                </button>
                <button
                  onClick={toggleNullable}
                  className={`px-2 py-1 text-xs rounded ${
                    field.notNull
                      ? 'bg-blue-500 text-white'
                      : isDark ? 'bg-dark-bg-hover text-dark-text-secondary' : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  Not null
                </button>
                <button
                  onClick={() => onChange({ increment: !field.increment })}
                  className={`px-2 py-1 text-xs rounded ${
                    field.increment
                      ? 'bg-green-500 text-white'
                      : isDark ? 'bg-dark-bg-hover text-dark-text-secondary' : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  Auto
                </button>
              </div>

              {/* Size / Precision */}
              {(showSize || showPrecision) && (
                <div className="flex gap-2 mb-2">
                  {showSize && (
                    <div className="flex-1">
                      <label className={labelClass}>Size</label>
                      <input
                        type="number"
                        value={field.size ?? ''}
                        onChange={(e) =>
                          onChange({ size: e.target.value ? parseInt(e.target.value) : undefined })
                        }
                        className={`${inputClass} w-full`}
                        placeholder="255"
                        min={1}
                      />
                    </div>
                  )}
                  {showPrecision && (
                    <>
                      <div className="flex-1">
                        <label className={labelClass}>Precision</label>
                        <input
                          type="number"
                          value={field.precision ?? ''}
                          onChange={(e) =>
                            onChange({ precision: e.target.value ? parseInt(e.target.value) : undefined })
                          }
                          className={`${inputClass} w-full`}
                          placeholder="10"
                          min={1}
                        />
                      </div>
                      <div className="flex-1">
                        <label className={labelClass}>Scale</label>
                        <input
                          type="number"
                          value={field.scale ?? ''}
                          onChange={(e) =>
                            onChange({ scale: e.target.value ? parseInt(e.target.value) : undefined })
                          }
                          className={`${inputClass} w-full`}
                          placeholder="2"
                          min={0}
                        />
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Default */}
              <div className="mb-2">
                <label className={labelClass}>Default</label>
                <input
                  type="text"
                  value={field.default}
                  onChange={(e) => onChange({ default: e.target.value })}
                  className={`${inputClass} w-full`}
                  placeholder="Not set"
                />
              </div>

              {/* Comment */}
              <div className="mb-3">
                <label className={labelClass}>Comment</label>
                <input
                  type="text"
                  value={field.comment}
                  onChange={(e) => onChange({ comment: e.target.value })}
                  className={`${inputClass} w-full`}
                  placeholder="Not set"
                />
              </div>

              {/* Unsigned (MySQL) */}
              {showUnsigned && (
                <label className={`${checkboxLabelClass} mb-2`}>
                  <input
                    type="checkbox"
                    checked={field.unsigned ?? false}
                    onChange={(e) => onChange({ unsigned: e.target.checked })}
                    className="rounded"
                  />
                  Unsigned
                </label>
              )}

              {/* 删除按钮 */}
              <button
                onClick={() => {
                  setShowPopover(false)
                  onDelete()
                }}
                className="w-full mt-2 px-3 py-1.5 text-sm rounded bg-red-500 hover:bg-red-600 text-white flex items-center justify-center gap-1"
              >
                <Trash2 className="w-3.5 h-3.5" />
                {t('common.delete')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default FieldEditRow
