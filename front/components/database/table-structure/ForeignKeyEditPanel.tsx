/**
 * Foreign Key Edit Panel Component
 * Right panel for editing foreign key details in the table structure dialog.
 */

import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'

export interface ForeignKeyEdit {
  id: string
  originalName: string
  name: string
  column: string
  refSchema: string
  refTable: string
  refColumn: string
  onDelete: string
  onUpdate: string
  comment: string
  isNew: boolean
  isDeleted: boolean
  isSelected: boolean
}

const FK_ACTIONS = ['NO ACTION', 'RESTRICT', 'CASCADE', 'SET NULL', 'SET DEFAULT']

interface ForeignKeyEditPanelProps {
  fk: ForeignKeyEdit
  availableColumns: string[]
  onUpdate: (id: string, updates: Partial<ForeignKeyEdit>) => void
  isDark: boolean
}

export function ForeignKeyEditPanel({ fk, availableColumns, onUpdate, isDark }: ForeignKeyEditPanelProps) {
  const { t } = useTranslation()

  const textSecondary = isDark ? 'text-dark-text-secondary' : 'text-light-text-secondary'
  const textPrimary = isDark ? 'text-dark-text-primary' : 'text-light-text-primary'
  const inputBg = isDark ? 'bg-dark-bg-hover' : 'bg-light-bg-primary'
  const borderColor = isDark ? 'border-dark-border' : 'border-light-border'

  const inputClass = cn(
    'px-2 py-1 rounded text-sm border focus:outline-none focus:border-accent-primary',
    inputBg, borderColor, textPrimary
  )

  return (
    <div className="p-4 space-y-3 overflow-y-auto">
      <div>
        <label className={cn('block text-sm mb-1', textSecondary)}>{t('database.fkName')}</label>
        <input
          type="text"
          value={fk.name}
          onChange={(e) => onUpdate(fk.id, { name: e.target.value })}
          disabled={!fk.isNew}
          className={cn(inputClass, 'w-full')}
        />
      </div>

      <div>
        <label className={cn('block text-sm mb-1', textSecondary)}>{t('database.column')}</label>
        <select
          value={fk.column}
          onChange={(e) => onUpdate(fk.id, { column: e.target.value })}
          disabled={!fk.isNew}
          className={cn(inputClass, 'w-full')}
        >
          <option value="">{t('database.selectColumn')}</option>
          {availableColumns.map((col) => (
            <option key={col} value={col}>{col}</option>
          ))}
        </select>
      </div>

      <div>
        <label className={cn('block text-sm mb-1', textSecondary)}>{t('database.refTable')}</label>
        <input
          type="text"
          value={fk.refTable}
          onChange={(e) => onUpdate(fk.id, { refTable: e.target.value })}
          disabled={!fk.isNew}
          placeholder="table_name"
          className={cn(inputClass, 'w-full')}
        />
      </div>

      <div>
        <label className={cn('block text-sm mb-1', textSecondary)}>{t('database.refColumn')}</label>
        <input
          type="text"
          value={fk.refColumn}
          onChange={(e) => onUpdate(fk.id, { refColumn: e.target.value })}
          disabled={!fk.isNew}
          placeholder="column_name"
          className={cn(inputClass, 'w-full')}
        />
      </div>

      <div>
        <label className={cn('block text-sm mb-1', textSecondary)}>{t('database.onDelete')}</label>
        <select
          value={fk.onDelete}
          onChange={(e) => onUpdate(fk.id, { onDelete: e.target.value })}
          disabled={!fk.isNew}
          className={cn(inputClass, 'w-full')}
        >
          {FK_ACTIONS.map((action) => (
            <option key={action} value={action}>{action}</option>
          ))}
        </select>
      </div>

      <div>
        <label className={cn('block text-sm mb-1', textSecondary)}>{t('database.onUpdate')}</label>
        <select
          value={fk.onUpdate}
          onChange={(e) => onUpdate(fk.id, { onUpdate: e.target.value })}
          disabled={!fk.isNew}
          className={cn(inputClass, 'w-full')}
        >
          {FK_ACTIONS.map((action) => (
            <option key={action} value={action}>{action}</option>
          ))}
        </select>
      </div>
    </div>
  )
}
