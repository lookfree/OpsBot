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
import { ERDiagramDesigner } from './designer'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { useDatabaseQuery } from './useDatabaseQuery'
import type { ThemeStyles } from './types'
import { buildDatabaseConnectRequest } from '@/utils/databaseConnection'

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
  /** The tab this container belongs to — its data drives this instance only */
  tabId: string
  className?: string
}

export function DatabaseContainer({ connectionId, tabId, className }: DatabaseContainerProps) {
  const { t } = useTranslation()
  const { theme } = useThemeStore()
  const isDark = theme === 'dark'
  const { connections, setConnectionStatus } = useConnectionStore()
  const { tabs } = useTabStore()
  const connection = connections.find((c) => c.id === connectionId) as
    | DatabaseConnection
    | undefined

  // This container's own tab — never the active one, so tab switches
  // cannot leak another tab's data into this editor
  const currentTab = tabs.find((t) => t.id === tabId)
  const tabData = currentTab?.data as Record<string, unknown> | undefined

  const [isConnected, setIsConnected] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [databases, setDatabases] = useState<string[]>([])
  const [selectedDatabase, setSelectedDatabase] = useState<string>('')

  // View mode: 'query' | 'createTable' | 'editStructure' | 'dataEditor' | 'erDesigner'
  type ViewMode = 'query' | 'createTable' | 'editStructure' | 'dataEditor' | 'erDesigner'
  const [viewMode, setViewMode] = useState<ViewMode>('query')

  // Table target: real database plus schema for engines that have one
  type TableTarget = { db: string; schema?: string; table: string }
  // Dialog states (only for modal dialogs like rename, drop)
  const [renameDialogOpen, setRenameDialogOpen] = useState(false)
  const [renameTableInfo, _setRenameTableInfo] = useState<TableTarget | null>(null)
  const [createTableInfo, setCreateTableInfo] = useState<{ db: string; schema?: string } | null>(null)
  const [editStructureTableInfo, setEditStructureTableInfo] = useState<TableTarget | null>(null)
  const [dropConfirmOpen, setDropConfirmOpen] = useState(false)
  const [dropTableInfo, setDropTableInfo] = useState<TableTarget | null>(null)
  const [dataEditorInfo, setDataEditorInfo] = useState<TableTarget | null>(null)

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
      const info = await dbConnect(buildDatabaseConnectRequest(connection, connections))

      setIsConnected(true)
      setConnectionStatus(connectionId, 'connected')

      // The selector always lists real databases; the backend routes queries
      // to the selected database (PostgreSQL gets a dedicated pool per database)
      const dbs = await dbGetDatabases(connection.id)
      setDatabases(dbs)

      // Prefer tab's database, then the database the session actually
      // connected to (resolved from the URL for URL-mode connections)
      const tabDb = tabData?.database as string | undefined
      const sessionDb = info.database ?? undefined
      const defaultDb =
        [tabDb, sessionDb, connection.database?.trim()].find(
          (db) => db && dbs.includes(db)
        ) || dbs[0]
      if (defaultDb) {
        setSelectedDatabase(defaultDb)
      }
    } catch (err) {
      setError(String(err))
      setConnectionStatus(connectionId, 'error')
    } finally {
      setIsConnecting(false)
    }
  }, [connection, connections, connectionId, setConnectionStatus])

  // Refresh databases list
  const handleRefresh = useCallback(async () => {
    if (!connectionId || !isConnected || !connection) return

    try {
      const dbs = await dbGetDatabases(connectionId)
      setDatabases(dbs)
    } catch (err) {
      console.error('Refresh error:', err)
    }
  }, [connectionId, isConnected, connection])

  // Confirm drop table
  const handleConfirmDropTable = useCallback(async () => {
    if (!connectionId || !dropTableInfo) return
    try {
      await dbDropTable(connectionId, dropTableInfo.db, dropTableInfo.table, dropTableInfo.schema)
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

  // Process this tab's data once after connection
  const tabDataProcessed = useRef(false)
  useEffect(() => {
    if (!isConnected || !tabData || tabDataProcessed.current) return
    tabDataProcessed.current = true

    // The backend routes each request to (database, schema) — no reconnect needed
    const database = (tabData.database as string) || selectedDatabase
    const hasSchemas = connection?.dbType === 'postgresql' || connection?.dbType === 'kingbase'
    const schema = (tabData.schemaName as string | undefined) || (hasSchemas ? 'public' : undefined)

    if (database) {
      setSelectedDatabase(database)
    }

    // Handle initialSql
    if (tabData.initialSql) {
      setSql(tabData.initialSql as string)
      setViewMode('query')
      return
    }

    // Handle editMode - open DataEditor inline
    if (tabData.editMode && tabData.tableName) {
      setDataEditorInfo({ db: database, schema, table: tabData.tableName as string })
      setViewMode('dataEditor')
      return
    }

    // Handle createTable - open CreateTable inline
    if (tabData.createTable) {
      setCreateTableInfo({ db: database, schema })
      setViewMode('createTable')
      return
    }

    // Handle editStructure - open EditStructure inline
    if (tabData.editStructure && tabData.tableName) {
      setEditStructureTableInfo({ db: database, schema, table: tabData.tableName as string })
      setViewMode('editStructure')
      return
    }

    // Handle erDesigner - open ER Diagram Designer
    if (tabData.erDesigner) {
      setViewMode('erDesigner')
      return
    }
  }, [isConnected, tabData, selectedDatabase, setSql, connection])

  // Handle back to query mode - MUST be before any conditional returns (React hooks rule)
  const handleBackToQuery = useCallback(() => {
    setViewMode('query')
    setDataEditorInfo(null)
    setCreateTableInfo(null)
    setEditStructureTableInfo(null)
  }, [])

  // Handle open ER designer
  const handleOpenERDesigner = useCallback(() => {
    setViewMode('erDesigner')
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
            schema={dataEditorInfo.schema}
            tableName={dataEditorInfo.table}
            onClose={handleBackToQuery}
            isDark={isDark}
          />
        ) : viewMode === 'createTable' ? (
          <CreateTableInline
            connectionId={connectionId}
            database={createTableInfo?.db || selectedDatabase || ''}
            schema={createTableInfo?.schema}
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
            schema={editStructureTableInfo.schema}
            tableName={editStructureTableInfo.table}
            onSuccess={() => {
              handleTableOperationSuccess()
              handleBackToQuery()
            }}
            onClose={handleBackToQuery}
          />
        ) : viewMode === 'erDesigner' ? (
          <ERDiagramDesigner onClose={handleBackToQuery} className="h-full" />
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
                  onOpenERDesigner={handleOpenERDesigner}
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
          schema={renameTableInfo.schema}
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
