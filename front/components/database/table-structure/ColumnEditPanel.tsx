/**
 * Column Edit Panel Component
 * Right panel for editing column details in the table structure dialog.
 */

import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { getDataTypeNames, type DatabaseType } from '@/config/datatypes'
import { getDialect } from '@/config/dbDialects'

export interface ColumnEdit {
  id: string
  originalName: string
  name: string
  type: string
  length: string
  scale: string
  nullable: boolean
  isPrimaryKey: boolean
  comment: string
  defaultValue: string
  defaultType: 'null' | 'custom'
  autoGenerate: string
  isNew: boolean
  isDeleted: boolean
  isModified: boolean
  isSelected: boolean
}

interface ColumnEditPanelProps {
  column: ColumnEdit
  onUpdate: (id: string, updates: Partial<ColumnEdit>) => void
  isDark: boolean
  dbType?: DatabaseType
}

export function ColumnEditPanel({ column, onUpdate, isDark, dbType = 'mysql' }: ColumnEditPanelProps) {
  const { t } = useTranslation()

  // Get dynamic configuration based on database type
  const columnTypes = useMemo(() => getDataTypeNames(dbType), [dbType])
  const dialect = useMemo(() => getDialect(dbType), [dbType])

  // Auto-generate options based on database type
  const autoGenerateOptions = useMemo(() => {
    const options = [{ value: '', label: t('database.none', { defaultValue: '无' }) }]
    if (dialect.autoIncrement.keyword) {
      options.push({ value: dialect.autoIncrement.keyword, label: dialect.autoIncrement.keyword })
    }
    return options
  }, [dbType, dialect, t])

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
        <label className={cn('block text-sm mb-1', textSecondary)}>{t('database.columnName')}</label>
        <input
          type="text"
          value={column.name}
          onChange={(e) => onUpdate(column.id, { name: e.target.value })}
          disabled={column.isDeleted}
          className={cn(inputClass, 'w-full')}
        />
      </div>

      <div>
        <label className={cn('block text-sm mb-1', textSecondary)}>{t('database.type')}</label>
        <select
          value={column.type}
          onChange={(e) => onUpdate(column.id, { type: e.target.value })}
          disabled={column.isDeleted}
          className={cn(inputClass, 'w-full')}
        >
          {columnTypes.map((typeName) => <option key={typeName} value={typeName}>{typeName}</option>)}
        </select>
      </div>

      <div>
        <label className={cn('block text-sm mb-1', textSecondary)}>{t('database.length')}</label>
        <input
          type="text"
          value={column.length}
          onChange={(e) => onUpdate(column.id, { length: e.target.value })}
          disabled={column.isDeleted}
          className={cn(inputClass, 'w-full')}
        />
      </div>

      <div>
        <label className={cn('block text-sm mb-1', textSecondary)}>{t('database.comment')}</label>
        <input
          type="text"
          value={column.comment}
          onChange={(e) => onUpdate(column.id, { comment: e.target.value })}
          disabled={column.isDeleted}
          className={cn(inputClass, 'w-full')}
        />
      </div>

      <div>
        <label className={cn('block text-sm mb-1', textSecondary)}>{t('database.defaultValue')}</label>
        <div className="space-y-2">
          <label className={cn('flex items-center gap-2 text-sm cursor-pointer', textPrimary)}>
            <input
              type="radio"
              name={`default-${column.id}`}
              checked={column.defaultType === 'null'}
              onChange={() => onUpdate(column.id, { defaultType: 'null', defaultValue: '' })}
              disabled={column.isDeleted}
              className="w-4 h-4"
            />
            NULL
          </label>
          <label className={cn('flex items-center gap-2 text-sm cursor-pointer', textPrimary)}>
            <input
              type="radio"
              name={`default-${column.id}`}
              checked={column.defaultType === 'custom'}
              onChange={() => onUpdate(column.id, { defaultType: 'custom' })}
              disabled={column.isDeleted}
              className="w-4 h-4"
            />
            {t('database.customValue')}
          </label>
          {column.defaultType === 'custom' && (
            <input
              type="text"
              value={column.defaultValue}
              onChange={(e) => onUpdate(column.id, { defaultValue: e.target.value })}
              disabled={column.isDeleted}
              placeholder="e.g. 'value' or NOW()"
              className={cn(inputClass, 'w-full')}
            />
          )}
        </div>
      </div>

      <div>
        <label className={cn('block text-sm mb-1', textSecondary)}>{t('database.autoGenerate')}</label>
        <select
          value={column.autoGenerate}
          onChange={(e) => onUpdate(column.id, { autoGenerate: e.target.value })}
          disabled={column.isDeleted}
          className={cn(inputClass, 'w-full')}
        >
          {autoGenerateOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>
    </div>
  )
}
