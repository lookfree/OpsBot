/**
 * Foreign Keys Table Component
 * Table display for foreign keys in the edit table structure dialog.
 */

import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import type { ForeignKeyEdit } from './ForeignKeyEditPanel'

interface ForeignKeysTableProps {
  foreignKeys: ForeignKeyEdit[]
  selectedFkId: string | null
  onSelectFk: (id: string) => void
  onToggleSelect: (id: string) => void
  isDark: boolean
}

export function ForeignKeysTable({
  foreignKeys,
  selectedFkId,
  onSelectFk,
  onToggleSelect,
  isDark,
}: ForeignKeysTableProps) {
  const { t } = useTranslation()

  const borderColor = isDark ? 'border-dark-border' : 'border-light-border'
  const textPrimary = isDark ? 'text-dark-text-primary' : 'text-light-text-primary'
  const textSecondary = isDark ? 'text-dark-text-secondary' : 'text-light-text-secondary'
  const codeBg = isDark ? 'bg-dark-bg-secondary' : 'bg-light-bg-secondary'
  const activeBg = isDark ? 'bg-dark-bg-hover' : 'bg-light-bg-hover'

  const visibleFks = foreignKeys.filter((f) => !f.isDeleted || !f.isNew)

  return (
    <div className="flex-1 overflow-auto">
      <table className="w-full text-sm">
        <thead className={cn('sticky top-0', codeBg)}>
          <tr>
            <th className="w-8 px-2 py-2"></th>
            <th className={cn('px-2 py-2 text-left font-medium', textSecondary)}>{t('database.fkName')}</th>
            <th className={cn('px-2 py-2 text-left font-medium', textSecondary)}>{t('database.column')}</th>
            <th className={cn('px-2 py-2 text-left font-medium', textSecondary)}>{t('database.refTable')}</th>
            <th className={cn('px-2 py-2 text-left font-medium', textSecondary)}>{t('database.refColumn')}</th>
            <th className={cn('px-2 py-2 text-left font-medium', textSecondary)}>{t('database.onDelete')}</th>
            <th className={cn('px-2 py-2 text-left font-medium', textSecondary)}>{t('database.onUpdate')}</th>
          </tr>
        </thead>
        <tbody>
          {visibleFks.map((fk) => (
            <tr
              key={fk.id}
              onClick={() => onSelectFk(fk.id)}
              className={cn(
                'border-t cursor-pointer',
                borderColor,
                fk.id === selectedFkId && activeBg,
                fk.isDeleted && 'opacity-50 line-through',
                fk.isNew && 'bg-status-success/10'
              )}
            >
              <td className="px-2 py-1.5">
                <input
                  type="checkbox"
                  checked={fk.isSelected}
                  onChange={(e) => {
                    e.stopPropagation()
                    onToggleSelect(fk.id)
                  }}
                  className="w-4 h-4"
                />
              </td>
              <td className={cn('px-2 py-1.5 font-mono', textPrimary)}>{fk.name}</td>
              <td className={cn('px-2 py-1.5 font-mono', textSecondary)}>{fk.column}</td>
              <td className={cn('px-2 py-1.5 font-mono', textSecondary)}>{fk.refTable}</td>
              <td className={cn('px-2 py-1.5 font-mono', textSecondary)}>{fk.refColumn}</td>
              <td className={cn('px-2 py-1.5', textSecondary)}>{fk.onDelete}</td>
              <td className={cn('px-2 py-1.5', textSecondary)}>{fk.onUpdate}</td>
            </tr>
          ))}
          {visibleFks.length === 0 && (
            <tr>
              <td colSpan={7} className={cn('px-3 py-8 text-center', textSecondary)}>
                {t('database.noForeignKeys')}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
