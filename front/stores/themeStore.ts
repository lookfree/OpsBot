/**
 * 主题状态管理
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type Theme = 'dark' | 'light'

interface ThemeState {
  theme: Theme
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: 'light',

      setTheme: (theme: Theme) => {
        set({ theme })
        // 更新 DOM
        document.documentElement.classList.remove('dark', 'light')
        document.documentElement.classList.add(theme)
        document.body.classList.remove('dark', 'light')
        document.body.classList.add(theme)
      },

      toggleTheme: () => {
        const newTheme = get().theme === 'dark' ? 'light' : 'dark'
        get().setTheme(newTheme)
      },
    }),
    {
      name: 'zwd-opsbot-theme',
      onRehydrateStorage: () => (state) => {
        // 恢复主题时更新 DOM
        if (state) {
          document.documentElement.classList.remove('dark', 'light')
          document.documentElement.classList.add(state.theme)
          document.body.classList.remove('dark', 'light')
          document.body.classList.add(state.theme)
        }
      },
    }
  )
)
