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
import { X, Eye, EyeOff, ChevronLeft, FolderOpen } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useConnectionStore, useThemeStore } from '@/stores'
import type { DatabaseConnection, DatabaseType, SSHConnection } from '@/types'
import { ModuleType } from '@/types'
import { dbTestConnection } from '@/services/database'
import { DatabaseTypeSelector } from './DatabaseTypeSelector'
import { getDatabaseTypeById, type DatabaseTypeConfig } from '@/config/databaseTypes'
import { open as openDialog } from '@tauri-apps/plugin-dialog'

interface DatabaseConnectionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  connection?: DatabaseConnection
  folderId?: string | null
  onSave?: (connection: DatabaseConnection) => void
}

type DialogStep = 'select-type' | 'connection-form'
type ConnectionMode = 'standard' | 'url'

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
  const { connections, createConnection, updateConnection } = useConnectionStore()

  // 编辑模式直接进入表单，新建模式从选择类型开始
  const [step, setStep] = useState<DialogStep>(connection ? 'connection-form' : 'select-type')
  const [selectedDbType, setSelectedDbType] = useState<DatabaseTypeConfig | null>(
    connection ? getDatabaseTypeById(connection.dbType) || null : null
  )

  // 连接模式：标准模式或 URL 模式
  const [connectionMode, setConnectionMode] = useState<ConnectionMode>(
    connection?.connectionUrl ? 'url' : 'standard'
  )

  const [formData, setFormData] = useState<{
    name: string
    dbType: DatabaseType
    host: string
    port: number
    username: string
    password: string
    database: string
    connectionUrl: string
    driverVersion: string
    sshTunnelEnabled: boolean
    sshConnectionId: string
  }>({
    name: connection?.name || '',
    dbType: connection?.dbType || 'mysql',
    host: connection?.host || 'localhost',
    port: connection?.port || 3306,
    username: connection?.username || 'root',
    password: connection?.password || '',
    database: connection?.database || '',
    connectionUrl: connection?.connectionUrl || '',
    driverVersion: connection?.driverVersion || '5.7+',
    sshTunnelEnabled: connection?.sshTunnel?.enabled || false,
    sshConnectionId: connection?.sshTunnel?.sshConnectionId || '',
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
        setConnectionMode(connection.connectionUrl ? 'url' : 'standard')
        setFormData({
          name: connection.name,
          dbType: connection.dbType,
          host: connection.host,
          port: connection.port,
          username: connection.username,
          password: connection.password || '',
          database: connection.database || '',
          connectionUrl: connection.connectionUrl || '',
          driverVersion: connection.driverVersion || '5.7+',
          sshTunnelEnabled: connection.sshTunnel?.enabled || false,
          sshConnectionId: connection.sshTunnel?.sshConnectionId || '',
        })
      } else {
        setStep('select-type')
        setSelectedDbType(null)
        setConnectionMode('standard')
        setFormData({
          name: '',
          dbType: 'mysql',
          host: 'localhost',
          port: 3306,
          username: 'root',
          password: '',
          database: '',
          connectionUrl: '',
          driverVersion: '5.7+',
          sshTunnelEnabled: false,
          sshConnectionId: '',
        })
      }
      setErrors({})
      setTestResult(null)
      setShowPassword(false)
    }
  }, [open, connection])

  const URL_SUPPORTED_DBS = ['postgresql', 'mysql', 'mariadb', 'clickhouse', 'kingbase'] as const
  const sshConnections = connections.filter(
    (item): item is SSHConnection => item.moduleType === ModuleType.SSH
  )
  const selectedSshConnection = sshConnections.find((item) => item.id === formData.sshConnectionId)

  const handleDbTypeSelect = useCallback((dbType: DatabaseTypeConfig) => {
    setSelectedDbType(dbType)
    // 根据数据库类型设置默认值
    const defaultUsername = dbType.id === 'oracle' ? 'SYSTEM' :
                           dbType.id === 'postgresql' ? 'postgres' : 'root'
    // 切换到不支持 URL 模式的数据库时，重置连接方式为标准模式
    if (!(URL_SUPPORTED_DBS as readonly string[]).includes(dbType.id)) {
      setConnectionMode('standard')
    }
    setFormData(prev => ({
      ...prev,
      dbType: dbType.id as DatabaseType,
      port: dbType.defaultPort || prev.port,
      username: defaultUsername,
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
    (field: keyof typeof formData, value: string | number | boolean) => {
      setFormData((prev) => ({ ...prev, [field]: value }))
      setErrors((prev) => ({ ...prev, [field]: '' }))
    },
    []
  )

  const validate = useCallback(() => {
    const newErrors: Record<string, string> = {}
    const isFileDb = selectedDbType?.isFileDatabase

    if (!formData.name?.trim()) {
      newErrors.name = t('database.errors.nameRequired')
    }

    // URL 模式验证
    if (connectionMode === 'url') {
      if (!formData.connectionUrl?.trim()) {
        newErrors.connectionUrl = t('database.errors.urlRequired', '请输入连接 URL')
      }
      if (formData.sshTunnelEnabled) {
        newErrors.sshTunnel = t('database.errors.sshTunnelUrlUnsupported', 'SSH 隧道暂不支持 URL 模式，请使用标准连接方式')
      }
    } else if (isFileDb) {
      // 文件数据库只需要文件路径
      if (!formData.database?.trim()) {
        newErrors.database = t('database.errors.filePathRequired', '请选择数据库文件')
      }
    } else {
      // 常规数据库需要 host/port/username
      if (!formData.host?.trim()) {
        newErrors.host = t('database.errors.hostRequired')
      }
      if (!formData.port || formData.port < 1 || formData.port > 65535) {
        newErrors.port = t('database.errors.portInvalid')
      }
      if (!formData.username?.trim()) {
        newErrors.username = t('database.errors.usernameRequired')
      }
    }

    if (formData.sshTunnelEnabled && !selectedDbType?.isFileDatabase) {
      if (!formData.sshConnectionId) {
        newErrors.sshTunnel = t('database.errors.sshConnectionRequired', '请选择 SSH 连接')
      }
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }, [formData, selectedDbType, connectionMode, t])

  const handleSave = useCallback(() => {
    if (!validate()) return

    const connectionUrlValue = connectionMode === 'url' ? formData.connectionUrl : undefined
    const driverVersionValue = formData.dbType === 'mysql' ? formData.driverVersion : undefined
    const sshTunnelValue = formData.sshTunnelEnabled
      ? { enabled: true, sshConnectionId: formData.sshConnectionId }
      : undefined

    if (connection) {
      updateConnection(connection.id, {
        name: formData.name,
        dbType: formData.dbType,
        host: formData.host,
        port: formData.port,
        username: formData.username,
        password: formData.password || undefined,
        database: formData.database || undefined,
        connectionUrl: connectionUrlValue,
        driverVersion: driverVersionValue,
        sshTunnel: sshTunnelValue,
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
        connectionUrl: connectionUrlValue,
        driverVersion: driverVersionValue,
        sshTunnel: sshTunnelValue,
      }
      const newConnection = createConnection(connectionData as any) as DatabaseConnection
      onSave?.(newConnection)
    }

    onOpenChange(false)
  }, [
    validate,
    formData,
    connection,
    connectionMode,
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
      const sshTunnel = formData.sshTunnelEnabled && selectedSshConnection
        ? {
            enabled: true,
            host: selectedSshConnection.host,
            port: selectedSshConnection.port,
            username: selectedSshConnection.username,
            authType: selectedSshConnection.authType,
            password: selectedSshConnection.password,
            privateKey: selectedSshConnection.privateKey,
            passphrase: selectedSshConnection.passphrase,
          }
        : undefined

      await dbTestConnection({
        connectionId: connection?.id || 'test',
        dbType: formData.dbType,
        host: formData.host,
        port: formData.port,
        username: formData.username,
        password: formData.password || undefined,
        database: formData.database || undefined,
        connectionUrl: connectionMode === 'url' ? formData.connectionUrl : undefined,
        driverVersion: formData.dbType === 'mysql' ? formData.driverVersion : undefined,
        sshTunnel,
      })
      setTestResult({ success: true, message: t('database.connectionSuccess') })
    } catch (err) {
      setTestResult({ success: false, message: `${t('database.connectionFailed')}: ${err}` })
    } finally {
      setTesting(false)
    }
  }, [validate, formData, selectedSshConnection, connection, connectionMode, t])

  // URL 模式 placeholder 和提示文字
  const getUrlPlaceholder = (dbType: string) => {
    switch (dbType) {
      case 'mysql': return 'mysql://user:password@host:3306/database'
      case 'mariadb': return 'mysql://user:password@host:3306/database'
      case 'clickhouse': return 'clickhouse://user:password@host:8123/database'
      case 'kingbase': return 'kingbase://user:password@host:54321/database'
      default: return 'postgres://user:password@host:5432/database?sslmode=require'
    }
  }

  const getUrlHint = (dbType: string) => {
    switch (dbType) {
      case 'mysql': return t('database.urlHintMysql', '格式: mysql://用户名:密码@主机:端口/数据库')
      case 'mariadb': return t('database.urlHintMariadb', '格式: mysql://用户名:密码@主机:端口/数据库')
      case 'clickhouse': return t('database.urlHintClickhouse', '格式: clickhouse://用户名:密码@主机:端口/数据库')
      case 'kingbase': return t('database.urlHintKingbase', '格式: kingbase://用户名:密码@主机:端口/数据库')
      default: return t('database.urlHint', '格式: postgres://用户名:密码@主机:端口/数据库?sslmode=require')
    }
  }

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

                {/* MySQL 驱动版本选择 */}
                {formData.dbType === 'mysql' && (
                  <div>
                    <label className={cn('block text-sm font-medium mb-1', textSecondary)}>
                      {t('database.driverVersion', '驱动版本')}
                    </label>
                    <select
                      value={formData.driverVersion}
                      onChange={(e) => handleChange('driverVersion', e.target.value)}
                      className={cn(
                        'w-full px-3 py-2 rounded border text-sm',
                        'focus:outline-none focus:border-accent-primary',
                        inputBg, borderColor, textPrimary
                      )}
                    >
                      <option value="5.7+">{t('database.driverV57', '5.7 / 8.x（推荐）')}</option>
                      <option value="5.6">{t('database.driverV56', '5.6 及以下')}</option>
                    </select>
                    {formData.driverVersion === '5.6' && (
                      <p className="text-xs mt-1 text-status-warning">
                        {t('database.legacyDriverHint', 'MySQL 5.6 已停止官方维护，建议升级至 5.7+')}
                      </p>
                    )}
                  </div>
                )}

                {/* 连接模式切换 - 支持 URL 模式的数据库 */}
                {(['postgresql', 'mysql', 'mariadb', 'clickhouse', 'kingbase'] as const).includes(formData.dbType as any) && !selectedDbType?.isFileDatabase && (
                  <div className="flex items-center gap-4">
                    <label className={cn('text-sm font-medium', textSecondary)}>
                      {t('database.connectionMode', '连接方式')}:
                    </label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setConnectionMode('standard')}
                        className={cn(
                          'px-3 py-1.5 rounded text-sm transition-colors',
                          connectionMode === 'standard'
                            ? 'bg-accent-primary text-white'
                            : cn(borderColor, textPrimary, hoverBg, 'border')
                        )}
                      >
                        {t('database.standardMode', '标准')}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConnectionMode('url')}
                        className={cn(
                          'px-3 py-1.5 rounded text-sm transition-colors',
                          connectionMode === 'url'
                            ? 'bg-accent-primary text-white'
                            : cn(borderColor, textPrimary, hoverBg, 'border')
                        )}
                      >
                        URL
                      </button>
                    </div>
                  </div>
                )}

                {!selectedDbType?.isFileDatabase && (
                  <div className={cn('rounded border p-3 space-y-3', borderColor)}>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={formData.sshTunnelEnabled}
                        onChange={(e) => handleChange('sshTunnelEnabled', e.target.checked)}
                        className="w-4 h-4"
                      />
                      <span className={cn('text-sm font-medium', textSecondary)}>
                        {t('database.sshTunnel', '通过 SSH 连接')}
                      </span>
                    </label>

                    {formData.sshTunnelEnabled && (
                      <div>
                        <label className={cn('block text-sm font-medium mb-1', textSecondary)}>
                          {t('database.sshConnection', 'SSH 连接')}
                        </label>
                        <select
                          value={formData.sshConnectionId}
                          onChange={(e) => handleChange('sshConnectionId', e.target.value)}
                          className={cn(
                            'w-full px-3 py-2 rounded border text-sm',
                            'focus:outline-none focus:border-accent-primary',
                            inputBg,
                            borderColor,
                            textPrimary,
                            errors.sshTunnel && 'border-status-error'
                          )}
                        >
                          <option value="">
                            {t('database.selectSshConnection', '选择 SSH 连接')}
                          </option>
                          {sshConnections.map((ssh) => (
                            <option key={ssh.id} value={ssh.id}>
                              {ssh.name} ({ssh.username}@{ssh.host}:{ssh.port})
                            </option>
                          ))}
                        </select>
                        {errors.sshTunnel && (
                          <p className="text-xs text-status-error mt-1">{errors.sshTunnel}</p>
                        )}
                        {sshConnections.length === 0 && (
                          <p className={cn('text-xs mt-1', textSecondary)}>
                            {t('database.noSshConnections', '暂无 SSH 连接，请先创建 SSH 连接')}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* URL 连接模式 */}
                {connectionMode === 'url' && (['postgresql', 'mysql', 'mariadb', 'clickhouse', 'kingbase'] as const).includes(formData.dbType as any) && (
                  <div>
                    <label className={cn('block text-sm font-medium mb-1', textSecondary)}>
                      {t('database.connectionUrl', '连接 URL')}
                    </label>
                    <input
                      type="text"
                      value={formData.connectionUrl}
                      onChange={(e) => handleChange('connectionUrl', e.target.value)}
                      placeholder={getUrlPlaceholder(formData.dbType)}
                      className={cn(
                        'w-full px-3 py-2 rounded border text-sm font-mono',
                        'focus:outline-none focus:border-accent-primary',
                        inputBg,
                        borderColor,
                        textPrimary,
                        errors.connectionUrl && 'border-status-error'
                      )}
                    />
                    {errors.connectionUrl && (
                      <p className="text-xs text-status-error mt-1">{errors.connectionUrl}</p>
                    )}
                    <p className={cn('text-xs mt-1', textSecondary)}>
                      {getUrlHint(formData.dbType)}
                    </p>
                  </div>
                )}

                {/* SQLite: 文件路径选择 */}
                {selectedDbType?.isFileDatabase ? (
                  <div>
                    <label className={cn('block text-sm font-medium mb-1', textSecondary)}>
                      {t('database.filePath', '数据库文件')}
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={formData.database}
                        onChange={(e) => handleChange('database', e.target.value)}
                        placeholder="/path/to/database.db"
                        className={cn(
                          'flex-1 px-3 py-2 rounded border text-sm',
                          'focus:outline-none focus:border-accent-primary',
                          inputBg,
                          borderColor,
                          textPrimary,
                          errors.database && 'border-status-error'
                        )}
                      />
                      <button
                        type="button"
                        onClick={async () => {
                          const selected = await openDialog({
                            multiple: false,
                            filters: [
                              { name: 'SQLite Database', extensions: ['db', 'sqlite', 'sqlite3', 'db3'] },
                              { name: 'All Files', extensions: ['*'] },
                            ],
                          })
                          if (selected && typeof selected === 'string') {
                            handleChange('database', selected)
                          }
                        }}
                        className={cn(
                          'px-3 py-2 rounded border text-sm transition-colors',
                          borderColor,
                          textPrimary,
                          hoverBg
                        )}
                      >
                        <FolderOpen className="w-4 h-4" />
                      </button>
                    </div>
                    {errors.database && (
                      <p className="text-xs text-status-error mt-1">{errors.database}</p>
                    )}
                    <p className={cn('text-xs mt-1', textSecondary)}>
                      {t('database.sqliteHint', '选择现有数据库文件，或输入新文件路径创建')}
                    </p>
                  </div>
                ) : connectionMode === 'url' ? null : (
                  <>
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

                    {/* Database / Service Name (Oracle) */}
                    <div>
                      <label className={cn('block text-sm font-medium mb-1', textSecondary)}>
                        {formData.dbType === 'oracle'
                          ? t('database.serviceName', 'Service Name')
                          : t('database.database')}
                        <span className={cn('ml-1 text-xs', textSecondary)}>({t('common.optional')})</span>
                      </label>
                      <input
                        type="text"
                        value={formData.database}
                        onChange={(e) => handleChange('database', e.target.value)}
                        placeholder={formData.dbType === 'oracle' ? 'ORCL' : 'mysql'}
                        className={cn(
                          'w-full px-3 py-2 rounded border text-sm',
                          'focus:outline-none focus:border-accent-primary',
                          inputBg,
                          borderColor,
                          textPrimary
                        )}
                      />
                    </div>
                  </>
                )}
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
