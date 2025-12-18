/**
 * 配置导入对话框组件
 * 支持自动解密（固定密钥）和手动输入密码解密
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
  Lock,
  Loader2,
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
  ENCRYPTED_FILE_EXTENSION,
} from '@/types'
import {
  readFileContent,
  validateImportConfig,
  importConfig,
  getImportPreview,
  isEncryptedFile,
  isStorageEncrypted,
  autoDecryptConfig,
} from '@/services'
import { useTranslation } from 'react-i18next'

interface ImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type ImportStep = 'select' | 'preview' | 'result'

export function ImportDialog({ open, onOpenChange }: ImportDialogProps) {
  const { t } = useTranslation()
  const { folders, connections } = useConnectionStore()
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 状态
  const [step, setStep] = useState<ImportStep>('select')
  const [isDragging, setIsDragging] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [isEncrypted, setIsEncrypted] = useState(false)
  const [isDecrypting, setIsDecrypting] = useState(false)
  const [decryptError, setDecryptError] = useState<string | null>(null)
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
    setIsEncrypted(false)
    setDecryptError(null)
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
    const isValidExt = file.name.endsWith('.json') || file.name.endsWith(ENCRYPTED_FILE_EXTENSION)
    if (!isValidExt) {
      setValidation({
        valid: false,
        errors: [t('import.invalidConfig')],
        warnings: [],
      })
      return
    }

    setSelectedFile(file)
    setDecryptError(null)
    setIsDecrypting(true)

    try {
      let content = await readFileContent(file)

      // 检查是否为加密文件（固定密钥加密格式）
      const encrypted = isEncryptedFile(file.name) || await isStorageEncrypted(content)
      setIsEncrypted(encrypted)

      if (encrypted) {
        // 尝试使用固定密钥自动解密
        try {
          content = await autoDecryptConfig(content)
        } catch (error) {
          setIsDecrypting(false)
          setDecryptError(error instanceof Error ? error.message : t('import.readError'))
          return
        }
      }

      // 验证配置
      const result = validateImportConfig(content)
      setValidation(result)

      if (result.valid) {
        setStep('preview')
      }
    } catch {
      setValidation({
        valid: false,
        errors: [t('import.readError')],
        warnings: [],
      })
    } finally {
      setIsDecrypting(false)
    }
  }, [t])

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
              {t('import.title')}
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
                onClick={() => !isDecrypting && fileInputRef.current?.click()}
                className={cn(
                  'border-2 border-dashed rounded-lg p-8 text-center transition-colors',
                  isDecrypting
                    ? 'border-accent-primary bg-accent-primary/10 cursor-wait'
                    : isDragging
                      ? 'border-accent-primary bg-accent-primary/10 cursor-pointer'
                      : 'border-dark-border hover:border-accent-primary cursor-pointer'
                )}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,.enc"
                  onChange={handleInputChange}
                  className="hidden"
                  disabled={isDecrypting}
                />
                {isDecrypting ? (
                  <>
                    <Loader2 className="w-12 h-12 mx-auto mb-3 text-accent-primary animate-spin" />
                    <p className="text-sm">{t('common.processing')}</p>
                    <p className="text-xs text-secondary mt-1">{selectedFile?.name}</p>
                  </>
                ) : (
                  <>
                    <FileJson className="w-12 h-12 mx-auto mb-3 text-disabled" />
                    <p className="text-sm">{t('import.dropHint')}</p>
                    <p className="text-xs text-secondary mt-1">
                      {t('import.formatHint')}
                    </p>
                  </>
                )}
              </div>

              {/* 解密错误 */}
              {decryptError && (
                <div className="mt-4 p-3 bg-status-error/10 border border-status-error/20 rounded-md">
                  <div className="flex items-center gap-2 text-status-error">
                    <AlertCircle className="w-4 h-4" />
                    <span className="text-sm">{decryptError}</span>
                  </div>
                </div>
              )}

              {/* 验证错误 */}
              {validation && !validation.valid && (
                <div className="mt-4 p-3 bg-status-error/10 border border-status-error/20 rounded-md">
                  <div className="flex items-center gap-2 text-status-error mb-2">
                    <AlertCircle className="w-4 h-4" />
                    <span className="font-medium">{t('import.invalidConfig')}</span>
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
              <div className="dialog-card mb-4">
                <div className="flex items-center gap-2 mb-2">
                  {isEncrypted ? (
                    <Lock className="w-4 h-4 text-status-success" />
                  ) : (
                    <FileJson className="w-4 h-4 text-accent-primary" />
                  )}
                  <span className="text-sm font-medium">{selectedFile?.name}</span>
                </div>
                <div className="text-xs text-secondary">
                  <p>{t('common.version')}：{validation.config.version}</p>
                  <p>{new Date(validation.config.exportedAt).toLocaleString()}</p>
                  <p>
                    {validation.config.folders.length} {t('import.newFolders')}，
                    {validation.config.connections.length} {t('import.newConnections')}
                  </p>
                </div>
              </div>

              {/* 警告信息 */}
              {validation.warnings.length > 0 && (
                <div className="mb-4 p-3 bg-status-warning/10 border border-status-warning/20 rounded-md">
                  <div className="flex items-center gap-2 text-status-warning mb-2">
                    <AlertTriangle className="w-4 h-4" />
                    <span className="font-medium">{t('import.notice')}</span>
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
                <label className="block text-sm font-medium mb-2">{t('import.importMode')}</label>
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
                    <span className="text-sm">{t('import.mergeMode')}</span>
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
                    <span className="text-sm">{t('import.replaceMode')}</span>
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
                    <span className="text-sm">{t('import.overwriteExisting')}</span>
                  </label>
                </div>
              )}

              {/* 模块过滤 */}
              <div className="mb-4">
                <label className="block text-sm font-medium mb-2">
                  {t('import.selectModules')}
                  <span className="text-secondary font-normal ml-2">
                    {t('export.selectModulesHint')}
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
                <div className="dialog-card mb-4">
                  <h4 className="text-sm font-medium mb-2">{t('import.preview')}</h4>
                  <div className="text-sm text-secondary space-y-1">
                    <p>{t('import.newFolders')}：{preview.newFolders}</p>
                    <p>{t('import.newConnections')}：{preview.newConnections}</p>
                    {importOptions.mode === 'merge' && (
                      <>
                        <p>{t('import.duplicateFolders')}：{preview.duplicateFolders}</p>
                        <p>
                          {t('import.duplicateConnections')}（{importOptions.overwriteExisting ? t('import.overwrite') : t('import.skip')}）：{preview.duplicateConnections}
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
                  {t('import.reselect')}
                </button>
                <div className="flex gap-2">
                  <Dialog.Close asChild>
                    <button className="btn-secondary px-4 py-2">{t('common.cancel')}</button>
                  </Dialog.Close>
                  <button
                    onClick={handleImport}
                    className="btn-primary px-4 py-2 flex items-center gap-2"
                  >
                    <Upload className="w-4 h-4" />
                    {t('import.confirmImport')}
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
                    <h3 className="text-lg font-medium mb-2">{t('import.importSuccess')}</h3>
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-16 h-16 mx-auto mb-4 text-status-error" />
                    <h3 className="text-lg font-medium mb-2">{t('import.importFailed')}</h3>
                  </>
                )}
                <p className="text-secondary">{importResult.message}</p>
              </div>

              {/* 统计信息 */}
              {importResult.success && (
                <div className="dialog-card mb-4">
                  <h4 className="text-sm font-medium mb-2">{t('import.importStats')}</h4>
                  <div className="grid grid-cols-2 gap-2 text-sm text-secondary">
                    <p>{t('import.foldersImported')}：{importResult.stats.foldersImported}</p>
                    <p>{t('import.foldersSkipped')}：{importResult.stats.foldersSkipped}</p>
                    <p>{t('import.connectionsImported')}：{importResult.stats.connectionsImported}</p>
                    <p>{t('import.connectionsSkipped')}：{importResult.stats.connectionsSkipped}</p>
                    {importResult.stats.connectionsOverwritten > 0 && (
                      <p className="col-span-2">
                        {t('import.connectionsOverwritten')}：{importResult.stats.connectionsOverwritten}
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
                    {t('import.retry')}
                  </button>
                )}
                <Dialog.Close asChild>
                  <button className="btn-primary px-4 py-2">{t('import.done')}</button>
                </Dialog.Close>
              </div>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
