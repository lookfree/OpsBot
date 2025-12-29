/**
 * Redis Command Tabs Component
 *
 * Category tabs for organizing quick commands.
 */

import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { REDIS_COMMAND_CATEGORIES, type RedisCommandCategory } from '@/config/redisCommands'

interface ThemeStyles {
  bgSecondary: string
  borderColor: string
  textPrimary: string
  textSecondary: string
  hoverBg: string
  isDark: boolean
}

interface RedisCommandTabsProps {
  activeCategory: RedisCommandCategory
  onCategoryChange: (category: RedisCommandCategory) => void
  styles: ThemeStyles
}

export const RedisCommandTabs = memo(function RedisCommandTabs({
  activeCategory,
  onCategoryChange,
  styles,
}: RedisCommandTabsProps) {
  const { t } = useTranslation()

  return (
    <div className={cn('flex items-center gap-1 px-3 pt-2', styles.borderColor)}>
      {REDIS_COMMAND_CATEGORIES.map((category) => (
        <button
          key={category.key}
          onClick={() => onCategoryChange(category.key)}
          className={cn(
            'px-3 py-1.5 text-sm font-medium rounded-t transition-colors',
            'border-b-2',
            activeCategory === category.key
              ? 'border-accent-primary text-accent-primary'
              : cn('border-transparent', styles.textSecondary, styles.hoverBg)
          )}
        >
          {t(category.labelKey)}
        </button>
      ))}
    </div>
  )
})
