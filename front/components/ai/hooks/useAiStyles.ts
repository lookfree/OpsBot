/**
 * AI 模块共享样式 Hook
 */

import { useMemo } from 'react'
import { useThemeStore } from '@/stores'

export interface AiStyles {
  bgPrimary: string
  bgSecondary: string
  bgTertiary: string
  borderColor: string
  textPrimary: string
  textSecondary: string
  hoverBg: string
  activeBg: string
  inputBg: string
  successText: string
  errorText: string
  isDark: boolean
}

export function useAiStyles(): AiStyles {
  const { theme } = useThemeStore()
  const isDark = theme === 'dark'

  return useMemo(
    () => ({
      bgPrimary: isDark ? 'bg-dark-bg-primary' : 'bg-light-bg-primary',
      bgSecondary: isDark ? 'bg-dark-bg-secondary' : 'bg-light-bg-secondary',
      bgTertiary: isDark ? 'bg-dark-bg-tertiary' : 'bg-light-bg-tertiary',
      borderColor: isDark ? 'border-dark-border' : 'border-light-border',
      textPrimary: isDark ? 'text-dark-text-primary' : 'text-light-text-primary',
      textSecondary: isDark ? 'text-dark-text-secondary' : 'text-light-text-secondary',
      hoverBg: isDark ? 'hover:bg-dark-bg-hover' : 'hover:bg-light-bg-hover',
      activeBg: isDark ? 'bg-dark-bg-hover' : 'bg-light-bg-hover',
      inputBg: isDark ? 'bg-dark-bg-tertiary' : 'bg-light-bg-tertiary',
      successText: 'text-green-500',
      errorText: 'text-red-500',
      isDark,
    }),
    [isDark]
  )
}
