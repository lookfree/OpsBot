/**
 * 配置导出对话框组件
 * 始终使用固定密钥加密，简化用户操作
 */

import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X, Download, Shield, ShieldOff, FolderCheck, Lock, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useConnectionStore } from '@/stores'
import { ModuleType, ModuleTypeLabels, ExportOptions } from '@/types'
import { exportConfigToFile, getExportStats } from '@/services'
import { useTranslation } from 'react-i18next'

interface ExportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ExportDialog({ open, onOpenChange }: ExportDialogProps) {
  const { t } = useTranslation()
  const { folders, connections } = useConnectionStore()

  // 导出选项
  const [includeSensitiveData, setIncludeSensitiveData] = useState(false)
  const [selectedModules, setSelectedModules] = useState<ModuleType[]>([])
  const [isExporting, setIsExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

  // 获取导出统计 - 始终加密
  const options: ExportOptions = {
    includeSensitiveData,
    moduleTypes: selectedModules,
    folderIds: [],
    encrypt: true, // 始终加密
  }

  const stats = getExportStats(folders, connections, options)

  const toggleModule = (moduleType: ModuleType) => {
    setSelectedModules((prev) =>
      prev.includes(moduleType)
        ? prev.filter((m) => m !== moduleType)
        : [...prev, moduleType]
    )
  }

  const handleExport = async () => {
    setIsExporting(true)
    setExportError(null)

    try {
      await exportConfigToFile(folders, connections, options)
      onOpenChange(false)
    } catch (error) {
      setExportError(error instanceof Error ? error.message : t('common.error'))
    } finally {
      setIsExporting(false)
    }
  }

  const hasData = folders.length > 0 || connections.length > 0

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
        <Dialog.Content className="dialog-content w-[480px]">
          {/* 标题栏 */}
          <div className="flex items-center justify-between mb-4">
            <Dialog.Title className="text-lg font-semibold">
              {t('export.title')}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button className="btn-ghost p-1 rounded-md">
                <X className="w-5 h-5" />
              </button>
            </Dialog.Close>
          </div>

          {!hasData ? (
            <div className="text-center py-8 text-secondary">
              <FolderCheck className="w-12 h-12 mx-auto mb-3 text-disabled" />
              <p>{t('export.noData')}</p>
              <p className="text-sm mt-1">{t('export.noDataHint')}</p>
            </div>
          ) : (
            <>
              {/* 模块选择 */}
              <div className="mb-4">
                <label className="block text-sm font-medium mb-2">
                  {t('export.selectModules')}
                  <span className="text-secondary font-normal ml-2">
                    {t('export.selectModulesHint')}
                  </span>
                </label>
                <div className="flex flex-wrap gap-2">
                  {Object.values(ModuleType).map((moduleType) => {
                    const isSelected = selectedModules.includes(moduleType)
                    const moduleConnCount = connections.filter(
                      (c) => c.moduleType === moduleType
                    ).length
                    const moduleFolderCount = folders.filter(
                      (f) => f.moduleType === moduleType
                    ).length

                    if (moduleConnCount === 0 && moduleFolderCount === 0) {
                      return null
                    }

                    return (
                      <button
                        key={moduleType}
                        onClick={() => toggleModule(moduleType)}
                        className={cn(
                          'px-3 py-1.5 text-sm rounded-md border transition-colors',
                          isSelected
                            ? 'bg-accent-primary text-white border-accent-primary'
                            : 'border-dark-border hover:border-accent-primary'
                        )}
                      >
                        {ModuleTypeLabels[moduleType]} ({moduleConnCount})
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* 敏感信息选项 */}
              <div className="mb-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeSensitiveData}
                    onChange={(e) => setIncludeSensitiveData(e.target.checked)}
                    className="w-4 h-4 rounded border-dark-border"
                  />
                  <span className="text-sm">{t('export.includeSensitive')}</span>
                  {includeSensitiveData ? (
                    <ShieldOff className="w-4 h-4 text-status-warning" />
                  ) : (
                    <Shield className="w-4 h-4 text-status-success" />
                  )}
                </label>
                <p className="text-xs text-secondary mt-1 ml-6">
                  {includeSensitiveData
                    ? t('export.sensitiveWarning')
                    : t('export.sensitiveHint')
                  }
                </p>
              </div>

              {/* 加密说明 */}
              <div className="mb-4 dialog-card">
                <div className="flex items-center gap-2 text-sm">
                  <Lock className="w-4 h-4 text-status-success" />
                  <span>{t('export.encryptionNote')}</span>
                </div>
              </div>

              {/* 导出预览 */}
              <div className="dialog-card mb-4">
                <h4 className="text-sm font-medium mb-2">{t('export.preview')}</h4>
                <div className="text-sm text-secondary space-y-1">
                  <p>{t('export.folderCount')}：{stats.folderCount}</p>
                  <p>{t('export.connectionCount')}：{stats.connectionCount}</p>
                  {stats.moduleTypes.length > 0 && (
                    <p>
                      {t('export.includesModules')}：
                      {stats.moduleTypes.map((m) => ModuleTypeLabels[m]).join('、')}
                    </p>
                  )}
                  <p>
                    {t('export.fileFormat')}：{t('export.encrypted')}
                  </p>
                </div>
              </div>

              {/* 错误提示 */}
              {exportError && (
                <div className="mb-4 p-3 bg-status-error/10 border border-status-error/20 rounded-md">
                  <p className="text-sm text-status-error">{exportError}</p>
                </div>
              )}

              {/* 操作按钮 */}
              <div className="flex justify-end gap-2">
                <Dialog.Close asChild>
                  <button className="btn-secondary px-4 py-2" disabled={isExporting}>{t('common.cancel')}</button>
                </Dialog.Close>
                <button
                  onClick={handleExport}
                  disabled={(stats.connectionCount === 0 && stats.folderCount === 0) || isExporting}
                  className="btn-primary px-4 py-2 flex items-center gap-2"
                >
                  {isExporting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4" />
                  )}
                  {isExporting ? t('export.exporting') : t('export.exportButton')}
                </button>
              </div>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
