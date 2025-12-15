/**
 * Trigger Edit Panel Component
 * Right panel for editing trigger details in the table structure dialog.
 */

import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'

export interface TriggerEdit {
  id: string
  originalName: string
  name: string
  enabled: boolean
  timing: string
  event: string
  statement: string
  comment: string
  isNew: boolean
  isDeleted: boolean
  isSelected: boolean
}

const TRIGGER_TIMINGS = ['BEFORE', 'AFTER']
const TRIGGER_EVENTS = ['INSERT', 'UPDATE', 'DELETE']

interface TriggerEditPanelProps {
  trigger: TriggerEdit
  onUpdate: (id: string, updates: Partial<TriggerEdit>) => void
  isDark: boolean
}

export function TriggerEditPanel({ trigger, onUpdate, isDark }: TriggerEditPanelProps) {
  const { t } = useTranslation()

  const textSecondary = isDark ? 'text-dark-text-secondary' : 'text-light-text-secondary'
  const textPrimary = isDark ? 'text-dark-text-primary' : 'text-light-text-primary'
  const inputBg = isDark ? 'bg-dark-bg-hover' : 'bg-light-bg-primary'
  const borderColor = isDark ? 'border-dark-border' : 'border-light-border'
  const codeBg = isDark ? 'bg-dark-bg-secondary' : 'bg-light-bg-secondary'

  const inputClass = cn(
    'px-2 py-1 rounded text-sm border focus:outline-none focus:border-accent-primary',
    inputBg, borderColor, textPrimary
  )

  return (
    <div className="p-4 space-y-3 overflow-y-auto">
      <div>
        <label className={cn('block text-sm mb-1', textSecondary)}>{t('database.triggerName')}</label>
        <input
          type="text"
          value={trigger.name}
          onChange={(e) => onUpdate(trigger.id, { name: e.target.value })}
          disabled={!trigger.isNew}
          className={cn(inputClass, 'w-full')}
        />
      </div>

      <div>
        <label className={cn('block text-sm mb-1', textSecondary)}>{t('database.timing')}</label>
        <select
          value={trigger.timing}
          onChange={(e) => onUpdate(trigger.id, { timing: e.target.value })}
          disabled={!trigger.isNew}
          className={cn(inputClass, 'w-full')}
        >
          {TRIGGER_TIMINGS.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>

      <div>
        <label className={cn('block text-sm mb-1', textSecondary)}>{t('database.event')}</label>
        <select
          value={trigger.event}
          onChange={(e) => onUpdate(trigger.id, { event: e.target.value })}
          disabled={!trigger.isNew}
          className={cn(inputClass, 'w-full')}
        >
          {TRIGGER_EVENTS.map((e) => (
            <option key={e} value={e}>{e}</option>
          ))}
        </select>
      </div>

      <div>
        <label className={cn('block text-sm mb-1', textSecondary)}>{t('database.triggerStatement')}</label>
        <textarea
          value={trigger.statement}
          onChange={(e) => onUpdate(trigger.id, { statement: e.target.value })}
          disabled={!trigger.isNew}
          placeholder="BEGIN ... END"
          rows={6}
          className={cn(inputClass, 'w-full resize-none font-mono text-xs', codeBg)}
        />
      </div>
    </div>
  )
}
