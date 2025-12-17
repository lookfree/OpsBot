/**
 * Database Type Selector Component
 *
 * 数据库类型选择器，展示图标网格供用户选择
 */

import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { useThemeStore } from '@/stores'
import { DATABASE_TYPES, type DatabaseTypeConfig } from '@/config/databaseTypes'

interface DatabaseTypeSelectorProps {
  selectedType: string | null
  onSelect: (dbType: DatabaseTypeConfig) => void
}

export function DatabaseTypeSelector({ selectedType, onSelect }: DatabaseTypeSelectorProps) {
  const { t } = useTranslation()
  const { theme } = useThemeStore()
  const isDark = theme === 'dark'

  const textPrimary = isDark ? 'text-dark-text-primary' : 'text-light-text-primary'
  const textSecondary = isDark ? 'text-dark-text-secondary' : 'text-light-text-secondary'
  const borderColor = isDark ? 'border-dark-border' : 'border-light-border'
  const hoverBg = isDark ? 'hover:bg-dark-bg-hover' : 'hover:bg-light-bg-hover'
  const selectedBg = isDark ? 'bg-dark-bg-hover' : 'bg-light-bg-hover'

  return (
    <div className="p-4">
      <p className={cn('text-sm mb-4', textSecondary)}>
        {t('database.selectDatabaseType', '请选择数据库类型')}
      </p>

      <div className="grid grid-cols-4 gap-4">
        {DATABASE_TYPES.map((dbType) => (
          <button
            key={dbType.id}
            onClick={() => onSelect(dbType)}
            disabled={!dbType.enabled}
            className={cn(
              'flex flex-col items-center justify-center p-4 rounded-lg border transition-all',
              'focus:outline-none focus:ring-2 focus:ring-accent-primary',
              borderColor,
              dbType.enabled ? hoverBg : 'opacity-50 cursor-not-allowed',
              selectedType === dbType.id && selectedBg,
              selectedType === dbType.id && 'ring-2 ring-accent-primary'
            )}
          >
            <div className="w-12 h-12 flex items-center justify-center mb-2">
              <img
                src={dbType.icon}
                alt={dbType.name}
                className="max-w-full max-h-full object-contain"
                onError={(e) => {
                  // 图标加载失败时显示默认图标
                  const target = e.target as HTMLImageElement
                  target.style.display = 'none'
                  target.nextElementSibling?.classList.remove('hidden')
                }}
              />
              <DatabaseFallbackIcon className="hidden w-10 h-10 text-gray-400" />
            </div>
            <span className={cn('text-sm font-medium', textPrimary)}>
              {dbType.name}
            </span>
            {!dbType.enabled && (
              <span className={cn('text-xs mt-1', textSecondary)}>
                {t('common.comingSoon', '即将支持')}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}

// 默认数据库图标
function DatabaseFallbackIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
      <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
    </svg>
  )
}
