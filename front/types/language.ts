/**
 * 多语言相关类型定义
 */

// 支持的语言
export type Language = 'zh-CN' | 'zh-TW' | 'en-US' | 'ja-JP'

// 语言配置
export interface LanguageConfig {
  code: Language
  name: string
  nativeName: string
}

// 支持的语言列表
export const SUPPORTED_LANGUAGES: LanguageConfig[] = [
  { code: 'zh-CN', name: 'Simplified Chinese', nativeName: '简体中文' },
  { code: 'zh-TW', name: 'Traditional Chinese', nativeName: '繁體中文' },
  { code: 'en-US', name: 'English', nativeName: 'English' },
  { code: 'ja-JP', name: 'Japanese', nativeName: '日本語' },
]

// 默认语言
export const DEFAULT_LANGUAGE: Language = 'zh-CN'
