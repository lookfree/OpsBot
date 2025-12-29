/**
 * Middleware Type Selector Component
 *
 * 中间件类型选择器，展示图标网格供用户选择
 */

import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { useThemeStore } from '@/stores'
import { MIDDLEWARE_TYPES, type MiddlewareTypeConfig } from '@/config/middlewareTypes'

interface MiddlewareTypeSelectorProps {
  selectedType: string | null
  onSelect: (mwType: MiddlewareTypeConfig) => void
}

export function MiddlewareTypeSelector({ selectedType, onSelect }: MiddlewareTypeSelectorProps) {
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
        {t('middleware.selectMiddlewareType', '请选择中间件类型')}
      </p>

      <div className="grid grid-cols-3 gap-4">
        {MIDDLEWARE_TYPES.map((mwType) => (
          <button
            key={mwType.id}
            onClick={() => mwType.enabled && onSelect(mwType)}
            disabled={!mwType.enabled}
            className={cn(
              'flex flex-col items-center justify-center p-4 rounded-lg border transition-all',
              'focus:outline-none focus:ring-2 focus:ring-accent-primary',
              borderColor,
              mwType.enabled ? hoverBg : 'opacity-50 cursor-not-allowed',
              selectedType === mwType.id && selectedBg,
              selectedType === mwType.id && 'ring-2 ring-accent-primary'
            )}
          >
            <div className="w-12 h-12 flex items-center justify-center mb-2">
              <img
                src={mwType.icon}
                alt={mwType.name}
                className="max-w-full max-h-full object-contain"
                onError={(e) => {
                  const target = e.target as HTMLImageElement
                  target.style.display = 'none'
                  target.nextElementSibling?.classList.remove('hidden')
                }}
              />
              <MiddlewareFallbackIcon className="hidden w-10 h-10 text-gray-400" />
            </div>
            <span className={cn('text-sm font-medium', textPrimary)}>
              {mwType.name}
            </span>
            {mwType.description && (
              <span className={cn('text-xs mt-1 text-center', textSecondary)}>
                {mwType.enabled ? '' : t('common.comingSoon', '即将支持')}
              </span>
            )}
            {!mwType.enabled && (
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

// 默认中间件图标
function MiddlewareFallbackIcon({ className }: { className?: string }) {
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
      <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
      <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
      <line x1="6" y1="6" x2="6.01" y2="6" />
      <line x1="6" y1="18" x2="6.01" y2="18" />
    </svg>
  )
}
