/**
 * 语言状态管理
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import i18n from '@/i18n'
import { Language, DEFAULT_LANGUAGE, SUPPORTED_LANGUAGES } from '@/types'

interface LanguageState {
  language: Language
  setLanguage: (language: Language) => void
  getLanguageName: () => string
}

export const useLanguageStore = create<LanguageState>()(
  persist(
    (set, get) => ({
      language: DEFAULT_LANGUAGE,

      setLanguage: (language) => {
        // 同时更新 i18n 和 store
        i18n.changeLanguage(language)
        set({ language })
      },

      getLanguageName: () => {
        const config = SUPPORTED_LANGUAGES.find((l) => l.code === get().language)
        return config?.nativeName || get().language
      },
    }),
    {
      name: 'zwd-opsbot-language',
    }
  )
)
