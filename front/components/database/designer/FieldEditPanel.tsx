/**
 * 字段列表编辑面板
 *
 * 参考 DrawDB 设计：简洁列表，无展开折叠
 */

import { useTranslation } from 'react-i18next'
import { Plus } from 'lucide-react'
import { TableField } from './types'
import { FieldEditRow } from './FieldEditRow'
import type { DatabaseType } from '@/config/datatypes/types'

interface FieldEditPanelProps {
  fields: TableField[]
  database: DatabaseType
  isDark: boolean
  onUpdateField: (fieldId: string, updates: Partial<TableField>) => void
  onDeleteField: (fieldId: string) => void
  onAddField: () => void
}

export function FieldEditPanel({
  fields,
  database,
  isDark,
  onUpdateField,
  onDeleteField,
  onAddField,
}: FieldEditPanelProps) {
  const { t } = useTranslation()

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

  return (
    <div>
      {/* 头部 */}
      <div className={headerClass}>
        <h4 className="text-sm font-medium">{t('database.erDesigner.fields')} ({fields.length})</h4>
        <button className={addButtonClass} onClick={onAddField}>
          <Plus className="w-3 h-3" />
          {t('common.add')}
        </button>
      </div>

      {/* 字段列表 */}
      <div className="space-y-2">
        {fields.map((field) => (
          <FieldEditRow
            key={field.id}
            field={field}
            database={database}
            isDark={isDark}
            onChange={(updates) => onUpdateField(field.id, updates)}
            onDelete={() => onDeleteField(field.id)}
          />
        ))}

        {fields.length === 0 && (
          <div
            className={`
              text-center py-4 text-sm
              ${isDark ? 'text-dark-text-secondary' : 'text-gray-500'}
            `}
          >
            {t('database.erDesigner.noFieldsYet')}
          </div>
        )}
      </div>
    </div>
  )
}

export default FieldEditPanel
