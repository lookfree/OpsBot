/**
 * 配置导出对话框组件
 */

import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X, Download, Shield, ShieldOff, FolderCheck } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useConnectionStore } from '@/stores'
import { ModuleType, ModuleTypeLabels, ExportOptions } from '@/types'
import { exportConfigToFile, getExportStats } from '@/services'

interface ExportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ExportDialog({ open, onOpenChange }: ExportDialogProps) {
  const { folders, connections } = useConnectionStore()

  // 导出选项
  const [includeSensitiveData, setIncludeSensitiveData] = useState(false)
  const [selectedModules, setSelectedModules] = useState<ModuleType[]>([])

  // 获取导出统计
  const options: ExportOptions = {
    includeSensitiveData,
    moduleTypes: selectedModules,
    folderIds: [],
  }

  const stats = getExportStats(folders, connections, options)

  const toggleModule = (moduleType: ModuleType) => {
    setSelectedModules((prev) =>
      prev.includes(moduleType)
        ? prev.filter((m) => m !== moduleType)
        : [...prev, moduleType]
    )
  }

  const handleExport = () => {
    exportConfigToFile(folders, connections, options)
    onOpenChange(false)
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
              导出配置
            </Dialog.Title>
            <Dialog.Close asChild>
              <button className="btn-ghost p-1 rounded-md">
                <X className="w-5 h-5" />
              </button>
            </Dialog.Close>
          </div>

          {!hasData ? (
            <div className="text-center py-8 text-dark-text-secondary">
              <FolderCheck className="w-12 h-12 mx-auto mb-3 text-dark-text-disabled" />
              <p>暂无可导出的配置</p>
              <p className="text-sm mt-1">请先添加连接或目录</p>
            </div>
          ) : (
            <>
              {/* 模块选择 */}
              <div className="mb-4">
                <label className="block text-sm font-medium mb-2">
                  选择导出模块
                  <span className="text-dark-text-secondary font-normal ml-2">
                    (不选择则导出全部)
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
                  <span className="text-sm">包含敏感信息（密码、密钥等）</span>
                  {includeSensitiveData ? (
                    <ShieldOff className="w-4 h-4 text-status-warning" />
                  ) : (
                    <Shield className="w-4 h-4 text-status-success" />
                  )}
                </label>
                {includeSensitiveData && (
                  <p className="text-xs text-status-warning mt-1 ml-6">
                    警告：导出文件将包含明文密码和密钥，请妥善保管
                  </p>
                )}
              </div>

              {/* 导出预览 */}
              <div className="bg-dark-bg-sidebar p-3 rounded-md mb-4">
                <h4 className="text-sm font-medium mb-2">导出预览</h4>
                <div className="text-sm text-dark-text-secondary space-y-1">
                  <p>目录数量：{stats.folderCount}</p>
                  <p>连接数量：{stats.connectionCount}</p>
                  {stats.moduleTypes.length > 0 && (
                    <p>
                      包含模块：
                      {stats.moduleTypes.map((m) => ModuleTypeLabels[m]).join('、')}
                    </p>
                  )}
                </div>
              </div>

              {/* 操作按钮 */}
              <div className="flex justify-end gap-2">
                <Dialog.Close asChild>
                  <button className="btn-secondary px-4 py-2">取消</button>
                </Dialog.Close>
                <button
                  onClick={handleExport}
                  disabled={stats.connectionCount === 0 && stats.folderCount === 0}
                  className="btn-primary px-4 py-2 flex items-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  导出配置
                </button>
              </div>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
