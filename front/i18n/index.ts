/**
 * i18n 国际化配置
 */

import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import zhCN from './locales/zh-CN.json'
import zhTW from './locales/zh-TW.json'
import enUS from './locales/en-US.json'
import jaJP from './locales/ja-JP.json'

// 从localStorage获取已保存的语言
const getSavedLanguage = (): string => {
  try {
    const saved = localStorage.getItem('zwd-opsbot-language')
    if (saved) {
      const parsed = JSON.parse(saved)
      return parsed.state?.language || 'zh-CN'
    }
  } catch {
    // ignore
  }
  return 'zh-CN'
}

const resources = {
  'zh-CN': { translation: zhCN },
  'zh-TW': { translation: zhTW },
  'en-US': { translation: enUS },
  'ja-JP': { translation: jaJP },
}

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: getSavedLanguage(),
    fallbackLng: 'zh-CN',
    interpolation: {
      escapeValue: false,
    },
  })

export default i18n
