/**
 * Index Edit Panel Component
 * Right panel for editing index details in the table structure dialog.
 */

import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { getIndexTypes, type DatabaseType } from '@/config/dbDialects'

export interface IndexEdit {
  id: string
  originalName: string
  name: string
  columns: string[]
  unique: boolean
  indexType: string
  isNew: boolean
  isDeleted: boolean
  isSelected: boolean
}

interface IndexEditPanelProps {
  index: IndexEdit
  availableColumns: string[]
  onUpdate: (id: string, updates: Partial<IndexEdit>) => void
  isDark: boolean
  dbType?: DatabaseType
}

export function IndexEditPanel({ index, availableColumns, onUpdate, isDark, dbType = 'mysql' }: IndexEditPanelProps) {
  const { t } = useTranslation()

  // Get dynamic configuration based on database type
  const indexTypes = useMemo(() => getIndexTypes(dbType), [dbType])

  const textSecondary = isDark ? 'text-dark-text-secondary' : 'text-light-text-secondary'
  const textPrimary = isDark ? 'text-dark-text-primary' : 'text-light-text-primary'
  const inputBg = isDark ? 'bg-dark-bg-hover' : 'bg-light-bg-primary'
  const borderColor = isDark ? 'border-dark-border' : 'border-light-border'

  const inputClass = cn(
    'px-2 py-1 rounded text-sm border focus:outline-none focus:border-accent-primary',
    inputBg, borderColor, textPrimary
  )

  return (
    <div className="p-4 space-y-4 overflow-y-auto">
      <div>
        <label className={cn('block text-sm mb-1', textSecondary)}>{t('database.indexName')}</label>
        <input
          type="text"
          value={index.name}
          onChange={(e) => onUpdate(index.id, { name: e.target.value })}
          disabled={!index.isNew}
          className={cn(inputClass, 'w-full')}
        />
      </div>

      <div>
        <label className={cn('block text-sm mb-1', textSecondary)}>{t('database.indexType')}</label>
        <select
          value={index.unique ? 'unique' : 'normal'}
          onChange={(e) => onUpdate(index.id, { unique: e.target.value === 'unique' })}
          disabled={!index.isNew}
          className={cn(inputClass, 'w-full')}
        >
          <option value="normal">{t('database.normal')}</option>
          <option value="unique">{t('database.unique')}</option>
        </select>
      </div>

      <div>
        <label className={cn('block text-sm mb-1', textSecondary)}>{t('database.method')}</label>
        <select
          value={index.indexType}
          onChange={(e) => onUpdate(index.id, { indexType: e.target.value })}
          disabled={!index.isNew}
          className={cn(inputClass, 'w-full')}
        >
          {indexTypes.map((idxType) => <option key={idxType} value={idxType}>{idxType}</option>)}
        </select>
      </div>

      <div>
        <label className={cn('block text-sm mb-1', textSecondary)}>{t('database.selectColumns')}</label>
        <div className="space-y-1 max-h-32 overflow-y-auto">
          {availableColumns.map((col) => (
            <label key={col} className={cn('flex items-center gap-2 text-sm cursor-pointer', textPrimary)}>
              <input
                type="checkbox"
                checked={index.columns.includes(col)}
                onChange={(e) => {
                  const newCols = e.target.checked
                    ? [...index.columns, col]
                    : index.columns.filter(c => c !== col)
                  onUpdate(index.id, { columns: newCols })
                }}
                disabled={!index.isNew}
                className="w-4 h-4"
              />
              {col}
            </label>
          ))}
        </div>
      </div>
    </div>
  )
}
