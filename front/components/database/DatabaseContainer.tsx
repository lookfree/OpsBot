/**
 * Database Container Component
 *
 * Main component for database management with schema tree and query interface.
 */

import { useState, useCallback, useEffect, useMemo, useRef, Component, ErrorInfo, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { Database, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useThemeStore, useConnectionStore, useTabStore } from '@/stores'
import {
  dbConnect,
  dbDisconnect,
  dbGetDatabases,
  dbGetSchemas,
  dbDropTable,
} from '@/services/database'
import type { DatabaseConnection } from '@/types'
import { SqlEditor } from './SqlEditor'
import { SqlToolbar } from './SqlToolbar'
import { ResultsTable } from './ResultsTable'
import { RenameTableDialog } from './RenameTableDialog'
import { CreateTableInline } from './CreateTableInline'
import { EditTableStructureInline } from './EditTableStructureInline'
import { DataEditor } from './DataEditor'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { useDatabaseQuery } from './useDatabaseQuery'
import type { ThemeStyles } from './types'

// Error Boundary for catching render errors
interface ErrorBoundaryProps {
  children: ReactNode
  fallback?: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('DatabaseContainer ErrorBoundary caught error:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="flex flex-col items-center justify-center h-full p-4 text-status-error">
          <AlertTriangle className="w-12 h-12 mb-4" />
          <p className="text-lg font-medium mb-2">Component Error</p>
          <p className="text-sm text-center max-w-md">{this.state.error?.message}</p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="mt-4 px-4 py-2 bg-accent-primary text-white rounded hover:bg-accent-hover"
          >
            Retry
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

interface DatabaseContainerProps {
  connectionId: string
  className?: string
}

export function DatabaseContainer({ connectionId, className }: DatabaseContainerProps) {
  const { t } = useTranslation()
  const { theme } = useThemeStore()
  const isDark = theme === 'dark'
  const { connections, setConnectionStatus } = useConnectionStore()
  const { tabs, activeTabId } = useTabStore()
  const connection = connections.find((c) => c.id === connectionId) as
    | DatabaseConnection
    | undefined

  // Get current tab data - use activeTabId to find the correct tab
  const currentTab = tabs.find((t) => t.id === activeTabId)
  const tabData = currentTab?.data as Record<string, unknown> | undefined

  const [isConnected, setIsConnected] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [databases, setDatabases] = useState<string[]>([])
  const [selectedDatabase, setSelectedDatabase] = useState<string>('')

  // View mode: 'query' | 'createTable' | 'editStructure' | 'dataEditor'
  type ViewMode = 'query' | 'createTable' | 'editStructure' | 'dataEditor'
  const [viewMode, setViewMode] = useState<ViewMode>('query')

  // Dialog states (only for modal dialogs like rename, drop)
  const [renameDialogOpen, setRenameDialogOpen] = useState(false)
  const [renameTableInfo, _setRenameTableInfo] = useState<{ db: string; table: string } | null>(null)
  const [createTableDb, setCreateTableDb] = useState('')
  const [editStructureTableInfo, setEditStructureTableInfo] = useState<{ db: string; table: string } | null>(null)
  const [dropConfirmOpen, setDropConfirmOpen] = useState(false)
  const [dropTableInfo, setDropTableInfo] = useState<{ db: string; table: string } | null>(null)
  const [dataEditorInfo, setDataEditorInfo] = useState<{ db: string; table: string } | null>(null)

  // Theme styles
  const styles: ThemeStyles = useMemo(
    () => ({
      bgSecondary: isDark ? 'bg-dark-bg-secondary' : 'bg-light-bg-secondary',
      borderColor: isDark ? 'border-dark-border' : 'border-light-border',
      textPrimary: isDark ? 'text-dark-text-primary' : 'text-light-text-primary',
      textSecondary: isDark ? 'text-dark-text-secondary' : 'text-light-text-secondary',
      hoverBg: isDark ? 'hover:bg-dark-bg-hover' : 'hover:bg-light-bg-hover',
      isDark,
    }),
    [isDark]
  )

  // Use database query hook
  const {
    sql,
    setSql,
    queryResult,
    isExecuting,
    queryError,
    handleExecuteSql,
    handleExplain,
    handleFormatSql,
    handleCompressSql,
    handleExportCsv,
    handleExportJson,
    handleClear,
  } = useDatabaseQuery({ connectionId, selectedDatabase })

  // Connect to database
  const handleConnect = useCallback(async () => {
    if (!connection) return

    setIsConnecting(true)
    setError(null)
    setConnectionStatus(connectionId, 'connecting')

    try {
      await dbConnect({
        connectionId: connection.id,
        dbType: connection.dbType || 'mysql',
        host: connection.host,
        port: connection.port,
        username: connection.username,
        password: connection.password,
        database: connection.database,
      })

      setIsConnected(true)
      setConnectionStatus(connectionId, 'connected')

      // Get databases/schemas list
      let dbs: string[]
      if (connection.dbType === 'postgresql') {
        // For PostgreSQL, get schemas
        dbs = await dbGetSchemas(connection.id)
      } else {
        // For MySQL, get databases
        dbs = await dbGetDatabases(connection.id)
      }
      setDatabases(dbs)

      if (dbs.length > 0) {
        setSelectedDatabase(dbs[0])
      }
    } catch (err) {
      setError(String(err))
      setConnectionStatus(connectionId, 'error')
    } finally {
      setIsConnecting(false)
    }
  }, [connection, connectionId, setConnectionStatus])

  // Refresh databases list
  const handleRefresh = useCallback(async () => {
    if (!connectionId || !isConnected || !connection) return

    try {
      // Get databases/schemas list
      let dbs: string[]
      if (connection.dbType === 'postgresql') {
        dbs = await dbGetSchemas(connectionId)
      } else {
        dbs = await dbGetDatabases(connectionId)
      }
      setDatabases(dbs)
    } catch (err) {
      console.error('Refresh error:', err)
    }
  }, [connectionId, isConnected, connection])

  // Confirm drop table
  const handleConfirmDropTable = useCallback(async () => {
    if (!connectionId || !dropTableInfo) return
    try {
      await dbDropTable(connectionId, dropTableInfo.db, dropTableInfo.table)
      setDropConfirmOpen(false)
      setDropTableInfo(null)
      handleRefresh()
    } catch (err) {
      console.error('Drop table error:', err)
    }
  }, [connectionId, dropTableInfo, handleRefresh])

  // Handle table operation success (refresh tree)
  const handleTableOperationSuccess = useCallback(() => {
    handleRefresh()
  }, [handleRefresh])

  // Cleanup: disconnect when component unmounts (tab closed)
  useEffect(() => {
    const currentConnectionId = connectionId
    return () => {
      if (currentConnectionId) {
        dbDisconnect(currentConnectionId).catch((err) => {
          console.error('Failed to disconnect:', err)
        })
      }
    }
  }, [connectionId])

  // Auto-connect on mount
  useEffect(() => {
    if (connection && !isConnected && !isConnecting) {
      handleConnect()
    }
  }, [connection, isConnected, isConnecting, handleConnect])

  // Process tab.data flags after connection - track which tab was processed
  const processedTabId = useRef<string | null>(null)
  useEffect(() => {
    // Skip if not connected, no tab data, or already processed this tab
    if (!isConnected || !tabData || !activeTabId || processedTabId.current === activeTabId) return
    processedTabId.current = activeTabId

    const database = (tabData.database as string) || selectedDatabase
    const isPostgres = connection?.dbType === 'postgresql'

    // For PostgreSQL, ensure we're connected to the correct database before opening editors
    const ensureConnection = async () => {
      if (isPostgres && database && connection) {
        // Reconnect to the specified database
        try {
          await dbConnect({
            connectionId: connection.id,
            dbType: 'postgresql',
            host: connection.host,
            port: connection.port,
            username: connection.username,
            password: connection.password,
            database: database,
          })
        } catch (err) {
          console.error('Failed to switch database:', err)
        }
      }
    }

    // Handle initialSql
    if (tabData.initialSql) {
      ensureConnection().then(() => {
        setSql(tabData.initialSql as string)
        if (database) {
          setSelectedDatabase(database)
        }
        setViewMode('query')
      })
      return
    }

    // Handle editMode - open DataEditor inline
    if (tabData.editMode && tabData.tableName) {
      ensureConnection().then(() => {
        // For PostgreSQL, use schemaName as the table prefix (since we're connected to the database)
        // For MySQL, use database name as the prefix
        const schemaOrDb = (tabData.schemaName as string) || database
        setDataEditorInfo({ db: schemaOrDb, table: tabData.tableName as string })
        setViewMode('dataEditor')
        if (database) {
          setSelectedDatabase(database)
        }
      })
      return
    }

    // Handle createTable - open CreateTable inline
    if (tabData.createTable) {
      ensureConnection().then(() => {
        // For PostgreSQL, use schemaName as the table prefix
        const schemaOrDb = (tabData.schemaName as string) || database
        setCreateTableDb(schemaOrDb)
        setViewMode('createTable')
        if (database) {
          setSelectedDatabase(database)
        }
      })
      return
    }

    // Handle editStructure - open EditStructure inline
    if (tabData.editStructure && tabData.tableName) {
      ensureConnection().then(() => {
        // For PostgreSQL, use schemaName as the table prefix
        const schemaOrDb = (tabData.schemaName as string) || database
        setEditStructureTableInfo({ db: schemaOrDb, table: tabData.tableName as string })
        setViewMode('editStructure')
        if (database) {
          setSelectedDatabase(database)
        }
      })
      return
    }
  }, [isConnected, tabData, activeTabId, selectedDatabase, setSql, connection])

  // Handle back to query mode - MUST be before any conditional returns (React hooks rule)
  const handleBackToQuery = useCallback(() => {
    setViewMode('query')
    setDataEditorInfo(null)
    setCreateTableDb('')
    setEditStructureTableInfo(null)
  }, [])

  // Not connected - show connect prompt
  if (!isConnected) {
    return (
      <div className={cn('flex flex-col items-center justify-center h-full', styles.textSecondary)}>
        <Database className="w-12 h-12 mb-4 text-accent-primary" />
        <p className="text-lg mb-2">{connection?.name || t('database.newConnection')}</p>
        <p className="text-sm mb-4">{t('home.clickToConnect')}</p>

        {error && (
          <div className="mb-4 px-4 py-2 bg-status-error/10 text-status-error border border-status-error/30 rounded text-sm max-w-md">
            {error}
          </div>
        )}

        <button
          onClick={handleConnect}
          disabled={isConnecting}
          className={cn(
            'px-4 py-2 rounded',
            'bg-accent-primary text-white',
            'hover:bg-accent-hover transition-colors',
            'disabled:opacity-50 disabled:cursor-not-allowed'
          )}
        >
          {isConnecting ? t('status.connecting') : t('sidebar.connect')}
        </button>
      </div>
    )
  }

  return (
    <div className={cn('flex flex-col h-full overflow-hidden', className)}>
      {/* Main Content Area - wrapped in ErrorBoundary */}
      <ErrorBoundary>
        {viewMode === 'dataEditor' && dataEditorInfo ? (
          <DataEditor
            connectionId={connectionId}
            database={dataEditorInfo.db}
            tableName={dataEditorInfo.table}
            onClose={handleBackToQuery}
            isDark={isDark}
          />
        ) : viewMode === 'createTable' ? (
          <CreateTableInline
            connectionId={connectionId}
            database={createTableDb || selectedDatabase || ''}
            onSuccess={() => {
              handleTableOperationSuccess()
              handleBackToQuery()
            }}
            onClose={handleBackToQuery}
          />
        ) : viewMode === 'editStructure' && editStructureTableInfo ? (
          <EditTableStructureInline
            connectionId={connectionId}
            database={editStructureTableInfo.db}
            tableName={editStructureTableInfo.table}
            onSuccess={() => {
              handleTableOperationSuccess()
              handleBackToQuery()
            }}
            onClose={handleBackToQuery}
          />
        ) : (
          <PanelGroup direction="vertical" className="flex-1">
            {/* SQL Editor Panel */}
            <Panel defaultSize={40} minSize={20}>
              <div className={cn('h-full flex flex-col', styles.borderColor)}>
                {/* Toolbar */}
                <SqlToolbar
                  databases={databases}
                  selectedDatabase={selectedDatabase}
                  sql={sql}
                  isExecuting={isExecuting}
                  hasResults={!!(queryResult?.rows?.length)}
                  styles={styles}
                  onDatabaseSelect={setSelectedDatabase}
                  onExecute={handleExecuteSql}
                  onExplain={handleExplain}
                  onFormat={handleFormatSql}
                  onCompress={handleCompressSql}
                  onExportCsv={handleExportCsv}
                  onExportJson={handleExportJson}
                  onClear={handleClear}
                />

                {/* SQL Editor with Monaco */}
                <SqlEditor value={sql} onChange={setSql} onExecute={handleExecuteSql} className="flex-1" />
              </div>
            </Panel>

            {/* Resize Handle */}
            <PanelResizeHandle
              className={cn(
                'h-1.5 flex items-center justify-center border-y',
                styles.borderColor,
                'hover:bg-accent-primary/50'
              )}
            >
              <div className="w-8 h-0.5 rounded bg-dark-text-secondary" />
            </PanelResizeHandle>

            {/* Results Panel */}
            <Panel defaultSize={60} minSize={20}>
              <ResultsTable queryResult={queryResult} queryError={queryError} styles={styles} />
            </Panel>
          </PanelGroup>
        )}
      </ErrorBoundary>

      {/* Dialogs - only for modal dialogs (rename, drop) */}
      {renameTableInfo && (
        <RenameTableDialog
          open={renameDialogOpen}
          onOpenChange={setRenameDialogOpen}
          connectionId={connectionId}
          database={renameTableInfo.db}
          tableName={renameTableInfo.table}
          onSuccess={handleTableOperationSuccess}
        />
      )}

      <ConfirmDialog
        open={dropConfirmOpen}
        onOpenChange={setDropConfirmOpen}
        title={t('database.dropTable')}
        description={t('database.dropTableConfirm', { table: dropTableInfo?.table })}
        confirmText={t('database.drop')}
        variant="danger"
        onConfirm={handleConfirmDropTable}
      />
    </div>
  )
}
