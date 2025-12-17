/**
 * Database Connection Dialog Component
 *
 * 两步式数据库连接创建对话框：
 * 1. 选择数据库类型
 * 2. 填写连接信息
 */

import { useState, useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import * as Dialog from '@radix-ui/react-dialog'
import { X, Eye, EyeOff, ChevronLeft } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useConnectionStore, useThemeStore } from '@/stores'
import type { DatabaseConnection, DatabaseType } from '@/types'
import { ModuleType } from '@/types'
import { dbTestConnection } from '@/services/database'
import { DatabaseTypeSelector } from './DatabaseTypeSelector'
import { getDatabaseTypeById, type DatabaseTypeConfig } from '@/config/databaseTypes'

interface DatabaseConnectionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  connection?: DatabaseConnection
  folderId?: string | null
  onSave?: (connection: DatabaseConnection) => void
}

type DialogStep = 'select-type' | 'connection-form'

export function DatabaseConnectionDialog({
  open,
  onOpenChange,
  connection,
  folderId,
  onSave,
}: DatabaseConnectionDialogProps) {
  const { t } = useTranslation()
  const { theme } = useThemeStore()
  const isDark = theme === 'dark'
  const { createConnection, updateConnection } = useConnectionStore()

  // 编辑模式直接进入表单，新建模式从选择类型开始
  const [step, setStep] = useState<DialogStep>(connection ? 'connection-form' : 'select-type')
  const [selectedDbType, setSelectedDbType] = useState<DatabaseTypeConfig | null>(
    connection ? getDatabaseTypeById(connection.dbType) || null : null
  )

  const [formData, setFormData] = useState<{
    name: string
    dbType: DatabaseType
    host: string
    port: number
    username: string
    password: string
    database: string
  }>({
    name: connection?.name || '',
    dbType: connection?.dbType || 'mysql',
    host: connection?.host || 'localhost',
    port: connection?.port || 3306,
    username: connection?.username || 'root',
    password: connection?.password || '',
    database: connection?.database || '',
  })

  const [showPassword, setShowPassword] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)

  // 重置对话框状态
  useEffect(() => {
    if (open) {
      if (connection) {
        setStep('connection-form')
        setSelectedDbType(getDatabaseTypeById(connection.dbType) || null)
        setFormData({
          name: connection.name,
          dbType: connection.dbType,
          host: connection.host,
          port: connection.port,
          username: connection.username,
          password: connection.password || '',
          database: connection.database || '',
        })
      } else {
        setStep('select-type')
        setSelectedDbType(null)
        setFormData({
          name: '',
          dbType: 'mysql',
          host: 'localhost',
          port: 3306,
          username: 'root',
          password: '',
          database: '',
        })
      }
      setErrors({})
      setTestResult(null)
    }
  }, [open, connection])

  const handleDbTypeSelect = useCallback((dbType: DatabaseTypeConfig) => {
    setSelectedDbType(dbType)
    setFormData(prev => ({
      ...prev,
      dbType: dbType.id as DatabaseType,
      port: dbType.defaultPort || prev.port,
    }))
  }, [])

  const handleNextStep = useCallback(() => {
    if (selectedDbType) {
      setStep('connection-form')
    }
  }, [selectedDbType])

  const handleBackStep = useCallback(() => {
    setStep('select-type')
    setTestResult(null)
  }, [])

  const handleChange = useCallback(
    (field: keyof typeof formData, value: string | number) => {
      setFormData((prev) => ({ ...prev, [field]: value }))
      setErrors((prev) => ({ ...prev, [field]: '' }))
    },
    []
  )

  const validate = useCallback(() => {
    const newErrors: Record<string, string> = {}

    if (!formData.name?.trim()) {
      newErrors.name = t('database.errors.nameRequired')
    }
    if (!formData.host?.trim()) {
      newErrors.host = t('database.errors.hostRequired')
    }
    if (!formData.port || formData.port < 1 || formData.port > 65535) {
      newErrors.port = t('database.errors.portInvalid')
    }
    if (!formData.username?.trim()) {
      newErrors.username = t('database.errors.usernameRequired')
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }, [formData, t])

  const handleSave = useCallback(() => {
    if (!validate()) return

    if (connection) {
      updateConnection(connection.id, {
        name: formData.name,
        dbType: formData.dbType,
        host: formData.host,
        port: formData.port,
        username: formData.username,
        password: formData.password || undefined,
        database: formData.database || undefined,
      })
      onSave?.(connection)
    } else {
      const connectionData = {
        name: formData.name,
        moduleType: ModuleType.Database,
        folderId: folderId ?? null,
        order: 0,
        tags: [] as string[],
        lastConnectedAt: null,
        dbType: formData.dbType,
        host: formData.host,
        port: formData.port,
        username: formData.username,
        password: formData.password || undefined,
        database: formData.database || undefined,
      }
      const newConnection = createConnection(connectionData as any) as DatabaseConnection
      onSave?.(newConnection)
    }

    onOpenChange(false)
  }, [
    validate,
    formData,
    connection,
    folderId,
    createConnection,
    updateConnection,
    onSave,
    onOpenChange,
  ])

  const handleTestConnection = useCallback(async () => {
    if (!validate()) return

    setTesting(true)
    setTestResult(null)
    try {
      await dbTestConnection({
        connectionId: connection?.id || 'test',
        dbType: formData.dbType,
        host: formData.host,
        port: formData.port,
        username: formData.username,
        password: formData.password || undefined,
        database: formData.database || undefined,
      })
      setTestResult({ success: true, message: t('database.connectionSuccess') })
    } catch (err) {
      setTestResult({ success: false, message: `${t('database.connectionFailed')}: ${err}` })
    } finally {
      setTesting(false)
    }
  }, [validate, formData, connection, t])

  // 主题相关样式
  const dialogBg = isDark ? 'bg-dark-bg-primary' : 'bg-light-bg-primary'
  const borderColor = isDark ? 'border-dark-border' : 'border-light-border'
  const textPrimary = isDark ? 'text-dark-text-primary' : 'text-light-text-primary'
  const textSecondary = isDark ? 'text-dark-text-secondary' : 'text-light-text-secondary'
  const inputBg = isDark ? 'bg-dark-bg-hover' : 'bg-light-bg-primary'
  const hoverBg = isDark ? 'hover:bg-dark-bg-hover' : 'hover:bg-light-bg-hover'

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
        <Dialog.Content
          className={cn(
            'fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2',
            'w-full max-h-[90vh] overflow-y-auto',
            'rounded-lg shadow-xl z-50 border',
            'focus:outline-none',
            step === 'select-type' ? 'max-w-3xl' : 'max-w-lg',
            dialogBg,
            borderColor
          )}
        >
          {/* Header */}
          <div className={cn('flex items-center justify-between px-6 py-4 border-b', borderColor)}>
            <div className="flex items-center gap-2">
              {step === 'connection-form' && !connection && (
                <button
                  onClick={handleBackStep}
                  className={cn('p-1 rounded transition-colors', hoverBg)}
                >
                  <ChevronLeft className={cn('w-5 h-5', textSecondary)} />
                </button>
              )}
              <Dialog.Title className={cn('text-lg font-semibold', textPrimary)}>
                {connection
                  ? t('database.editConnection')
                  : step === 'select-type'
                    ? t('database.selectDatabaseType', '选择数据库类型')
                    : t('database.newConnection')}
              </Dialog.Title>
            </div>
            <Dialog.Close className={cn('p-1 rounded transition-colors', hoverBg)}>
              <X className={cn('w-5 h-5', textSecondary)} />
            </Dialog.Close>
          </div>

          {/* Step 1: Select Database Type */}
          {step === 'select-type' && (
            <>
              <DatabaseTypeSelector
                selectedType={selectedDbType?.id || null}
                onSelect={handleDbTypeSelect}
              />
              {/* Footer for step 1 */}
              <div className={cn('px-6 py-4 border-t flex justify-end gap-3', borderColor)}>
                <Dialog.Close
                  className={cn(
                    'px-4 py-2 rounded text-sm border transition-colors',
                    borderColor,
                    textPrimary,
                    hoverBg
                  )}
                >
                  {t('common.cancel')}
                </Dialog.Close>
                <button
                  onClick={handleNextStep}
                  disabled={!selectedDbType}
                  className={cn(
                    'px-4 py-2 rounded text-sm transition-colors',
                    'disabled:opacity-50 disabled:cursor-not-allowed',
                    'bg-accent-primary text-white hover:bg-accent-hover'
                  )}
                >
                  {t('common.next', '下一步')}
                </button>
              </div>
            </>
          )}

          {/* Step 2: Connection Form */}
          {step === 'connection-form' && (
            <>
              {/* Content */}
              <div className="px-6 py-4 space-y-4">
                {/* Selected DB Type Display */}
                {selectedDbType && !connection && (
                  <div
                    className={cn(
                      'flex items-center gap-3 p-3 rounded-lg border',
                      borderColor,
                      isDark ? 'bg-dark-bg-hover' : 'bg-light-bg-hover'
                    )}
                  >
                    <img
                      src={selectedDbType.icon}
                      alt={selectedDbType.name}
                      className="w-8 h-8 object-contain"
                    />
                    <span className={cn('font-medium', textPrimary)}>{selectedDbType.name}</span>
                  </div>
                )}

                {/* Connection Name */}
                <div>
                  <label className={cn('block text-sm font-medium mb-1', textSecondary)}>
                    {t('database.connectionName')}
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => handleChange('name', e.target.value)}
                    placeholder="prod-mysql-01"
                    className={cn(
                      'w-full px-3 py-2 rounded border text-sm',
                      'focus:outline-none focus:border-accent-primary',
                      inputBg,
                      borderColor,
                      textPrimary,
                      errors.name && 'border-status-error'
                    )}
                  />
                  {errors.name && (
                    <p className="text-xs text-status-error mt-1">{errors.name}</p>
                  )}
                </div>

                {/* Host and Port */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2">
                    <label className={cn('block text-sm font-medium mb-1', textSecondary)}>
                      {t('database.host')}
                    </label>
                    <input
                      type="text"
                      value={formData.host}
                      onChange={(e) => handleChange('host', e.target.value)}
                      placeholder="localhost"
                      className={cn(
                        'w-full px-3 py-2 rounded border text-sm',
                        'focus:outline-none focus:border-accent-primary',
                        inputBg,
                        borderColor,
                        textPrimary,
                        errors.host && 'border-status-error'
                      )}
                    />
                    {errors.host && (
                      <p className="text-xs text-status-error mt-1">{errors.host}</p>
                    )}
                  </div>
                  <div>
                    <label className={cn('block text-sm font-medium mb-1', textSecondary)}>
                      {t('database.port')}
                    </label>
                    <input
                      type="number"
                      value={formData.port}
                      onChange={(e) =>
                        handleChange('port', parseInt(e.target.value) || selectedDbType?.defaultPort || 3306)
                      }
                      className={cn(
                        'w-full px-3 py-2 rounded border text-sm',
                        'focus:outline-none focus:border-accent-primary',
                        inputBg,
                        borderColor,
                        textPrimary,
                        errors.port && 'border-status-error'
                      )}
                    />
                  </div>
                </div>

                {/* Username */}
                <div>
                  <label className={cn('block text-sm font-medium mb-1', textSecondary)}>
                    {t('database.username')}
                  </label>
                  <input
                    type="text"
                    value={formData.username}
                    onChange={(e) => handleChange('username', e.target.value)}
                    placeholder="root"
                    className={cn(
                      'w-full px-3 py-2 rounded border text-sm',
                      'focus:outline-none focus:border-accent-primary',
                      inputBg,
                      borderColor,
                      textPrimary,
                      errors.username && 'border-status-error'
                    )}
                  />
                  {errors.username && (
                    <p className="text-xs text-status-error mt-1">{errors.username}</p>
                  )}
                </div>

                {/* Password */}
                <div>
                  <label className={cn('block text-sm font-medium mb-1', textSecondary)}>
                    {t('database.password')}
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={formData.password}
                      onChange={(e) => handleChange('password', e.target.value)}
                      className={cn(
                        'w-full px-3 py-2 pr-10 rounded border text-sm',
                        'focus:outline-none focus:border-accent-primary',
                        inputBg,
                        borderColor,
                        textPrimary
                      )}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className={cn('absolute right-2 top-1/2 -translate-y-1/2 p-1', textSecondary)}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Database */}
                <div>
                  <label className={cn('block text-sm font-medium mb-1', textSecondary)}>
                    {t('database.database')}
                    <span className={cn('ml-1 text-xs', textSecondary)}>({t('common.optional')})</span>
                  </label>
                  <input
                    type="text"
                    value={formData.database}
                    onChange={(e) => handleChange('database', e.target.value)}
                    placeholder="mysql"
                    className={cn(
                      'w-full px-3 py-2 rounded border text-sm',
                      'focus:outline-none focus:border-accent-primary',
                      inputBg,
                      borderColor,
                      textPrimary
                    )}
                  />
                </div>
              </div>

              {/* Footer */}
              <div className={cn('px-6 py-4 border-t', borderColor)}>
                {/* Test result display */}
                {testResult && (
                  <div
                    className={cn(
                      'mb-3 px-3 py-2 rounded text-sm',
                      testResult.success
                        ? 'bg-status-success/10 text-status-success border border-status-success/30'
                        : 'bg-status-error/10 text-status-error border border-status-error/30'
                    )}
                  >
                    {testResult.message}
                  </div>
                )}
                <div className="flex items-center justify-end gap-3">
                  <button
                    onClick={handleTestConnection}
                    disabled={testing}
                    className={cn(
                      'px-4 py-2 rounded text-sm border transition-colors',
                      'disabled:opacity-50 disabled:cursor-not-allowed',
                      borderColor,
                      textPrimary,
                      hoverBg
                    )}
                  >
                    {testing ? t('database.testing') : t('database.testConnection')}
                  </button>
                  <Dialog.Close
                    className={cn(
                      'px-4 py-2 rounded text-sm border transition-colors',
                      borderColor,
                      textPrimary,
                      hoverBg
                    )}
                  >
                    {t('common.cancel')}
                  </Dialog.Close>
                  <button
                    onClick={handleSave}
                    className="px-4 py-2 rounded text-sm bg-accent-primary text-white hover:bg-accent-hover transition-colors"
                  >
                    {t('common.save')}
                  </button>
                </div>
              </div>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
