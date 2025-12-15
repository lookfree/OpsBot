/**
 * 配置导入对话框组件
 */

import { useState, useRef, useCallback } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import {
  X,
  Upload,
  FileJson,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useConnectionStore } from '@/stores'
import {
  ModuleType,
  ModuleTypeLabels,
  ImportOptions,
  ValidationResult,
  Connection,
  Folder,
} from '@/types'
import {
  readFileContent,
  validateImportConfig,
  importConfig,
  getImportPreview,
} from '@/services'

interface ImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type ImportStep = 'select' | 'preview' | 'result'

export function ImportDialog({ open, onOpenChange }: ImportDialogProps) {
  const { folders, connections } = useConnectionStore()
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 状态
  const [step, setStep] = useState<ImportStep>('select')
  const [isDragging, setIsDragging] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [validation, setValidation] = useState<ValidationResult | null>(null)
  const [importOptions, setImportOptions] = useState<ImportOptions>({
    mode: 'merge',
    overwriteExisting: false,
    moduleTypes: [],
  })
  const [importResult, setImportResult] = useState<{
    success: boolean
    message: string
    stats: Record<string, number>
  } | null>(null)

  // 重置状态
  const resetState = () => {
    setStep('select')
    setSelectedFile(null)
    setValidation(null)
    setImportResult(null)
    setImportOptions({
      mode: 'merge',
      overwriteExisting: false,
      moduleTypes: [],
    })
  }

  // 处理文件选择
  const handleFileSelect = useCallback(async (file: File) => {
    if (!file.name.endsWith('.json')) {
      setValidation({
        valid: false,
        errors: ['请选择 .json 格式的配置文件'],
        warnings: [],
      })
      return
    }

    setSelectedFile(file)

    try {
      const content = await readFileContent(file)
      const result = validateImportConfig(content)
      setValidation(result)

      if (result.valid) {
        setStep('preview')
      }
    } catch {
      setValidation({
        valid: false,
        errors: ['文件读取失败'],
        warnings: [],
      })
    }
  }, [])

  // 拖拽事件处理
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = () => {
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)

    const file = e.dataTransfer.files[0]
    if (file) {
      handleFileSelect(file)
    }
  }

  // 文件输入变更
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      handleFileSelect(file)
    }
  }

  // 执行导入
  const handleImport = async () => {
    if (!validation?.config) return

    const result = importConfig(
      validation.config,
      folders,
      connections,
      importOptions
    )

    if (result.success) {
      // @ts-expect-error 访问内部数据
      const newFolders = result.folders as Folder[]
      // @ts-expect-error 访问内部数据
      const newConnections = result.connections as Connection[]

      // 使用setState批量更新
      useConnectionStore.setState({
        folders: newFolders,
        connections: newConnections,
      })
    }

    setImportResult({
      success: result.success,
      message: result.message,
      stats: result.stats,
    })
    setStep('result')
  }

  // 获取预览信息
  const preview = validation?.config
    ? getImportPreview(validation.config, folders, connections, importOptions)
    : null

  // 模块切换
  const toggleModule = (moduleType: ModuleType) => {
    setImportOptions((prev) => ({
      ...prev,
      moduleTypes: prev.moduleTypes.includes(moduleType)
        ? prev.moduleTypes.filter((m) => m !== moduleType)
        : [...prev.moduleTypes, moduleType],
    }))
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(open) => {
        if (!open) resetState()
        onOpenChange(open)
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
        <Dialog.Content className="dialog-content w-[520px]">
          {/* 标题栏 */}
          <div className="flex items-center justify-between mb-4">
            <Dialog.Title className="text-lg font-semibold">
              导入配置
            </Dialog.Title>
            <Dialog.Close asChild>
              <button className="btn-ghost p-1 rounded-md">
                <X className="w-5 h-5" />
              </button>
            </Dialog.Close>
          </div>

          {/* 步骤1：选择文件 */}
          {step === 'select' && (
            <>
              {/* 文件选择区域 */}
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  'border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors',
                  isDragging
                    ? 'border-accent-primary bg-accent-primary/10'
                    : 'border-dark-border hover:border-accent-primary'
                )}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json"
                  onChange={handleInputChange}
                  className="hidden"
                />
                <FileJson className="w-12 h-12 mx-auto mb-3 text-dark-text-disabled" />
                <p className="text-sm">拖拽配置文件到此处，或点击选择文件</p>
                <p className="text-xs text-dark-text-secondary mt-1">
                  支持 .zwd-config.json 或 .json 格式
                </p>
              </div>

              {/* 验证错误 */}
              {validation && !validation.valid && (
                <div className="mt-4 p-3 bg-status-error/10 border border-status-error/20 rounded-md">
                  <div className="flex items-center gap-2 text-status-error mb-2">
                    <AlertCircle className="w-4 h-4" />
                    <span className="font-medium">配置文件无效</span>
                  </div>
                  <ul className="text-sm text-status-error space-y-1">
                    {validation.errors.map((error, i) => (
                      <li key={i}>• {error}</li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}

          {/* 步骤2：预览确认 */}
          {step === 'preview' && validation?.config && (
            <>
              {/* 文件信息 */}
              <div className="bg-dark-bg-sidebar p-3 rounded-md mb-4">
                <div className="flex items-center gap-2 mb-2">
                  <FileJson className="w-4 h-4 text-accent-primary" />
                  <span className="text-sm font-medium">{selectedFile?.name}</span>
                </div>
                <div className="text-xs text-dark-text-secondary">
                  <p>版本：{validation.config.version}</p>
                  <p>导出时间：{new Date(validation.config.exportedAt).toLocaleString()}</p>
                  <p>
                    包含：{validation.config.folders.length} 个目录，
                    {validation.config.connections.length} 个连接
                  </p>
                </div>
              </div>

              {/* 警告信息 */}
              {validation.warnings.length > 0 && (
                <div className="mb-4 p-3 bg-status-warning/10 border border-status-warning/20 rounded-md">
                  <div className="flex items-center gap-2 text-status-warning mb-2">
                    <AlertTriangle className="w-4 h-4" />
                    <span className="font-medium">注意</span>
                  </div>
                  <ul className="text-sm text-status-warning space-y-1">
                    {validation.warnings.map((warning, i) => (
                      <li key={i}>• {warning}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* 导入模式 */}
              <div className="mb-4">
                <label className="block text-sm font-medium mb-2">导入模式</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="importMode"
                      checked={importOptions.mode === 'merge'}
                      onChange={() =>
                        setImportOptions((prev) => ({ ...prev, mode: 'merge' }))
                      }
                      className="w-4 h-4"
                    />
                    <span className="text-sm">合并（保留现有配置）</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="importMode"
                      checked={importOptions.mode === 'replace'}
                      onChange={() =>
                        setImportOptions((prev) => ({ ...prev, mode: 'replace' }))
                      }
                      className="w-4 h-4"
                    />
                    <span className="text-sm">替换（清空现有配置）</span>
                  </label>
                </div>
              </div>

              {/* 合并模式选项 */}
              {importOptions.mode === 'merge' && (
                <div className="mb-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={importOptions.overwriteExisting}
                      onChange={(e) =>
                        setImportOptions((prev) => ({
                          ...prev,
                          overwriteExisting: e.target.checked,
                        }))
                      }
                      className="w-4 h-4 rounded border-dark-border"
                    />
                    <span className="text-sm">覆盖同名连接</span>
                  </label>
                </div>
              )}

              {/* 模块过滤 */}
              <div className="mb-4">
                <label className="block text-sm font-medium mb-2">
                  选择导入模块
                  <span className="text-dark-text-secondary font-normal ml-2">
                    (不选择则导入全部)
                  </span>
                </label>
                <div className="flex flex-wrap gap-2">
                  {Object.values(ModuleType).map((moduleType) => {
                    const moduleConnCount = validation.config!.connections.filter(
                      (c) => c.moduleType === moduleType
                    ).length

                    if (moduleConnCount === 0) return null

                    const isSelected = importOptions.moduleTypes.includes(moduleType)

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

              {/* 导入预览 */}
              {preview && (
                <div className="bg-dark-bg-sidebar p-3 rounded-md mb-4">
                  <h4 className="text-sm font-medium mb-2">导入预览</h4>
                  <div className="text-sm text-dark-text-secondary space-y-1">
                    <p>新增目录：{preview.newFolders}</p>
                    <p>新增连接：{preview.newConnections}</p>
                    {importOptions.mode === 'merge' && (
                      <>
                        <p>重复目录（跳过）：{preview.duplicateFolders}</p>
                        <p>
                          重复连接（{importOptions.overwriteExisting ? '覆盖' : '跳过'}
                          ）：{preview.duplicateConnections}
                        </p>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* 操作按钮 */}
              <div className="flex justify-between">
                <button
                  onClick={() => {
                    setStep('select')
                    setSelectedFile(null)
                    setValidation(null)
                  }}
                  className="btn-secondary px-4 py-2"
                >
                  重新选择
                </button>
                <div className="flex gap-2">
                  <Dialog.Close asChild>
                    <button className="btn-secondary px-4 py-2">取消</button>
                  </Dialog.Close>
                  <button
                    onClick={handleImport}
                    className="btn-primary px-4 py-2 flex items-center gap-2"
                  >
                    <Upload className="w-4 h-4" />
                    确认导入
                  </button>
                </div>
              </div>
            </>
          )}

          {/* 步骤3：导入结果 */}
          {step === 'result' && importResult && (
            <>
              <div className="text-center py-6">
                {importResult.success ? (
                  <>
                    <CheckCircle2 className="w-16 h-16 mx-auto mb-4 text-status-success" />
                    <h3 className="text-lg font-medium mb-2">导入成功</h3>
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-16 h-16 mx-auto mb-4 text-status-error" />
                    <h3 className="text-lg font-medium mb-2">导入失败</h3>
                  </>
                )}
                <p className="text-dark-text-secondary">{importResult.message}</p>
              </div>

              {/* 统计信息 */}
              {importResult.success && (
                <div className="bg-dark-bg-sidebar p-3 rounded-md mb-4">
                  <h4 className="text-sm font-medium mb-2">导入统计</h4>
                  <div className="grid grid-cols-2 gap-2 text-sm text-dark-text-secondary">
                    <p>导入目录：{importResult.stats.foldersImported}</p>
                    <p>跳过目录：{importResult.stats.foldersSkipped}</p>
                    <p>导入连接：{importResult.stats.connectionsImported}</p>
                    <p>跳过连接：{importResult.stats.connectionsSkipped}</p>
                    {importResult.stats.connectionsOverwritten > 0 && (
                      <p className="col-span-2">
                        覆盖连接：{importResult.stats.connectionsOverwritten}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* 操作按钮 */}
              <div className="flex justify-center gap-2">
                {!importResult.success && (
                  <button
                    onClick={resetState}
                    className="btn-secondary px-4 py-2 flex items-center gap-2"
                  >
                    <RefreshCw className="w-4 h-4" />
                    重试
                  </button>
                )}
                <Dialog.Close asChild>
                  <button className="btn-primary px-4 py-2">完成</button>
                </Dialog.Close>
              </div>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
