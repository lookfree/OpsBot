/**
 * Check Constraint Edit Panel Component
 * Right panel for editing check constraint details in the table structure dialog.
 */

import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'

export interface CheckConstraintEdit {
  id: string
  originalName: string
  name: string
  expression: string
  noInherit: boolean
  comment: string
  isNew: boolean
  isDeleted: boolean
  isSelected: boolean
}

interface CheckConstraintEditPanelProps {
  constraint: CheckConstraintEdit
  onUpdate: (id: string, updates: Partial<CheckConstraintEdit>) => void
  isDark: boolean
}

export function CheckConstraintEditPanel({ constraint, onUpdate, isDark }: CheckConstraintEditPanelProps) {
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
        <label className={cn('block text-sm mb-1', textSecondary)}>{t('database.constraintName')}</label>
        <input
          type="text"
          value={constraint.name}
          onChange={(e) => onUpdate(constraint.id, { name: e.target.value })}
          disabled={!constraint.isNew}
          className={cn(inputClass, 'w-full')}
        />
      </div>

      <div>
        <label className={cn('block text-sm mb-1', textSecondary)}>{t('database.expression')}</label>
        <textarea
          value={constraint.expression}
          onChange={(e) => onUpdate(constraint.id, { expression: e.target.value })}
          disabled={!constraint.isNew}
          placeholder="e.g. price > 0"
          rows={3}
          className={cn(inputClass, 'w-full resize-none')}
        />
      </div>
    </div>
  )
}
