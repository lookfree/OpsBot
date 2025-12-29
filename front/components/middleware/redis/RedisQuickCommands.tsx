/**
 * Redis Quick Commands Component
 *
 * Quick command buttons for the selected category.
 */

import { memo, useMemo } from 'react'
import { cn } from '@/lib/utils'
import { getQuickCommandsByCategory, type RedisCommandCategory, type RedisQuickCommand } from '@/config/redisCommands'

interface ThemeStyles {
  bgSecondary: string
  borderColor: string
  textPrimary: string
  textSecondary: string
  hoverBg: string
  isDark: boolean
}

interface RedisQuickCommandsProps {
  category: RedisCommandCategory
  onExecute: (command: string, args: string[]) => void
  disabled: boolean
  styles: ThemeStyles
}

// Quick command button
const QuickCommandButton = memo(function QuickCommandButton({
  cmd,
  onClick,
  disabled,
  styles: _styles,
}: {
  cmd: RedisQuickCommand
  onClick: () => void
  disabled: boolean
  styles: ThemeStyles
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={cmd.description}
      className={cn(
        'px-2.5 py-1 text-xs font-mono rounded border transition-all',
        'border-accent-primary/60 text-accent-primary',
        'hover:bg-accent-primary/10 hover:border-accent-primary',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        'active:scale-95'
      )}
    >
      {cmd.label}
    </button>
  )
})

export const RedisQuickCommands = memo(function RedisQuickCommands({
  category,
  onExecute,
  disabled,
  styles,
}: RedisQuickCommandsProps) {
  const commands = useMemo(
    () => getQuickCommandsByCategory(category),
    [category]
  )

  return (
    <div className={cn('px-3 py-2 flex flex-wrap gap-2', styles.bgSecondary)}>
      {commands.map((cmd) => (
        <QuickCommandButton
          key={cmd.label}
          cmd={cmd}
          onClick={() => onExecute(cmd.command, cmd.args)}
          disabled={disabled}
          styles={styles}
        />
      ))}
    </div>
  )
})
