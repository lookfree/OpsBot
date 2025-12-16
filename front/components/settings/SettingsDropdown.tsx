/**
 * 设置下拉菜单组件 - 参考Claude风格设计
 */

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import {
  Settings,
  Download,
  Upload,
  Info,
  Moon,
  Sun,
  Globe,
  ChevronRight,
  Check,
  HelpCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useThemeStore, useLanguageStore } from '@/stores'
import { SUPPORTED_LANGUAGES } from '@/types'
import { ExportDialog } from './ExportDialog'
import { ImportDialog } from './ImportDialog'

interface SettingsDropdownProps {
  className?: string
}

export function SettingsDropdown({ className }: SettingsDropdownProps) {
  const { t } = useTranslation()
  const { theme, toggleTheme } = useThemeStore()
  const { language, setLanguage } = useLanguageStore()
  const [exportOpen, setExportOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const isDark = theme === 'dark'

  return (
    <>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button
            className={cn(
              'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors',
              isDark ? 'hover:bg-dark-bg-hover' : 'hover:bg-light-bg-hover',
              className
            )}
          >
            <div className="w-8 h-8 rounded-full bg-accent-primary flex items-center justify-center text-white text-sm font-medium">
              OB
            </div>
            <div className="flex-1 text-left">
              <div className="text-sm font-medium">ZWD-OpsBot</div>
              <div className="text-xs text-dark-text-secondary">v0.1.0</div>
            </div>
          </button>
        </DropdownMenu.Trigger>

        <DropdownMenu.Portal>
          <DropdownMenu.Content
            className="dropdown-content min-w-[240px] p-1"
            side="top"
            align="start"
            sideOffset={8}
          >
            {/* 设置 */}
            <DropdownMenu.Item className="dropdown-item rounded-md">
              <Settings className="w-4 h-4 mr-3" />
              <span className="flex-1">{t('common.settings')}</span>
              <span className="text-xs text-dark-text-secondary">⌘,</span>
            </DropdownMenu.Item>

            {/* 语言选择 - 子菜单 */}
            <DropdownMenu.Sub>
              <DropdownMenu.SubTrigger className="dropdown-item rounded-md">
                <Globe className="w-4 h-4 mr-3" />
                <span className="flex-1">{t('settings.language')}</span>
                <ChevronRight className="w-4 h-4 text-dark-text-secondary" />
              </DropdownMenu.SubTrigger>

              <DropdownMenu.Portal>
                <DropdownMenu.SubContent
                  className="dropdown-content min-w-[180px] p-1"
                  sideOffset={8}
                >
                  {SUPPORTED_LANGUAGES.map((lang) => (
                    <DropdownMenu.Item
                      key={lang.code}
                      className="dropdown-item rounded-md"
                      onClick={() => setLanguage(lang.code)}
                    >
                      <span className="w-5 mr-2">
                        {language === lang.code && (
                          <Check className="w-4 h-4 text-accent-primary" />
                        )}
                      </span>
                      <span className="flex-1">{lang.nativeName}</span>
                    </DropdownMenu.Item>
                  ))}
                </DropdownMenu.SubContent>
              </DropdownMenu.Portal>
            </DropdownMenu.Sub>

            {/* 主题切换 - 子菜单 */}
            <DropdownMenu.Sub>
              <DropdownMenu.SubTrigger className="dropdown-item rounded-md">
                {theme === 'dark' ? (
                  <Moon className="w-4 h-4 mr-3" />
                ) : (
                  <Sun className="w-4 h-4 mr-3" />
                )}
                <span className="flex-1">{t('settings.theme')}</span>
                <ChevronRight className="w-4 h-4 text-dark-text-secondary" />
              </DropdownMenu.SubTrigger>

              <DropdownMenu.Portal>
                <DropdownMenu.SubContent
                  className="dropdown-content min-w-[140px] p-1"
                  sideOffset={8}
                >
                  <DropdownMenu.Item
                    className="dropdown-item rounded-md"
                    onClick={() => theme !== 'dark' && toggleTheme()}
                  >
                    <span className="w-5 mr-2">
                      {theme === 'dark' && (
                        <Check className="w-4 h-4 text-accent-primary" />
                      )}
                    </span>
                    <Moon className="w-4 h-4 mr-2" />
                    {t('settings.dark')}
                  </DropdownMenu.Item>
                  <DropdownMenu.Item
                    className="dropdown-item rounded-md"
                    onClick={() => theme !== 'light' && toggleTheme()}
                  >
                    <span className="w-5 mr-2">
                      {theme === 'light' && (
                        <Check className="w-4 h-4 text-accent-primary" />
                      )}
                    </span>
                    <Sun className="w-4 h-4 mr-2" />
                    {t('settings.light')}
                  </DropdownMenu.Item>
                </DropdownMenu.SubContent>
              </DropdownMenu.Portal>
            </DropdownMenu.Sub>

            <DropdownMenu.Separator className="h-px bg-dark-border my-1" />

            {/* 导出配置 */}
            <DropdownMenu.Item
              className="dropdown-item rounded-md"
              onClick={() => setExportOpen(true)}
            >
              <Download className="w-4 h-4 mr-3" />
              {t('settings.exportConfig')}
            </DropdownMenu.Item>

            {/* 导入配置 */}
            <DropdownMenu.Item
              className="dropdown-item rounded-md"
              onClick={() => setImportOpen(true)}
            >
              <Upload className="w-4 h-4 mr-3" />
              {t('settings.importConfig')}
            </DropdownMenu.Item>

            <DropdownMenu.Separator className="h-px bg-dark-border my-1" />

            {/* 帮助 */}
            <DropdownMenu.Item className="dropdown-item rounded-md">
              <HelpCircle className="w-4 h-4 mr-3" />
              {t('settings.getHelp')}
            </DropdownMenu.Item>

            {/* 关于 */}
            <DropdownMenu.Item className="dropdown-item rounded-md">
              <Info className="w-4 h-4 mr-3" />
              {t('common.about')}
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      {/* 导出对话框 */}
      <ExportDialog open={exportOpen} onOpenChange={setExportOpen} />

      {/* 导入对话框 */}
      <ImportDialog open={importOpen} onOpenChange={setImportOpen} />
    </>
  )
}
