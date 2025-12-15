/**
 * Database Container Component
 *
 * Main component for database management with schema tree and query interface.
 */

import { useState, useCallback, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { Database } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useThemeStore, useConnectionStore, useTabStore } from '@/stores'
import {
  dbConnect,
  dbGetDatabases,
  dbGetTables,
  dbGetTableStructure,
  dbGetViews,
  dbGetRoutines,
  dbGetObjectsCount,
  dbGetTableDdl,
  dbDropTable,
} from '@/services/database'
import type { DatabaseConnection } from '@/types'
import { SqlEditor } from './SqlEditor'
import { SchemaTree } from './SchemaTree'
import { SqlToolbar } from './SqlToolbar'
import { ResultsTable } from './ResultsTable'
import { RenameTableDialog } from './RenameTableDialog'
import { CreateTableDialog } from './CreateTableDialog'
import { EditTableStructureDialog } from './EditTableStructureDialog'
import { DataEditor } from './DataEditor'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { useDatabaseQuery } from './useDatabaseQuery'
import type { SchemaNode, ThemeStyles } from './types'

interface DatabaseContainerProps {
  connectionId: string
  className?: string
}

export function DatabaseContainer({ connectionId, className }: DatabaseContainerProps) {
  const { t } = useTranslation()
  const { theme } = useThemeStore()
  const isDark = theme === 'dark'
  const { connections, setConnectionStatus } = useConnectionStore()
  const { tabs, updateTab } = useTabStore()

  const connection = connections.find((c) => c.id === connectionId) as
    | DatabaseConnection
    | undefined

  // Find the tab associated with this connection
  const currentTab = tabs.find((t) => t.connectionId === connectionId)

  const [isConnected, setIsConnected] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [databases, setDatabases] = useState<string[]>([])
  const [schemaTree, setSchemaTree] = useState<SchemaNode[]>([])
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set())
  const [selectedNode, setSelectedNode] = useState<SchemaNode | null>(null)
  const [loadingNodes, setLoadingNodes] = useState<Set<string>>(new Set())
  const [selectedDatabase, setSelectedDatabase] = useState<string>('')

  // Dialog states
  const [renameDialogOpen, setRenameDialogOpen] = useState(false)
  const [renameTableInfo, setRenameTableInfo] = useState<{ db: string; table: string } | null>(null)
  const [createTableDialogOpen, setCreateTableDialogOpen] = useState(false)
  const [createTableDb, setCreateTableDb] = useState('')
  const [editStructureDialogOpen, setEditStructureDialogOpen] = useState(false)
  const [editStructureTableInfo, setEditStructureTableInfo] = useState<{ db: string; table: string } | null>(null)
  const [dropConfirmOpen, setDropConfirmOpen] = useState(false)
  const [dropTableInfo, setDropTableInfo] = useState<{ db: string; table: string } | null>(null)
  const [dataEditorOpen, setDataEditorOpen] = useState(false)
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
    if (currentTab) {
      updateTab(currentTab.id, { status: 'connecting' })
    }

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
      if (currentTab) {
        updateTab(currentTab.id, { status: 'connected' })
      }

      const dbs = await dbGetDatabases(connection.id)
      setDatabases(dbs)

      const tree: SchemaNode[] = dbs.map((dbName) => ({
        id: `db:${dbName}`,
        name: dbName,
        type: 'database' as const,
        expanded: false,
        children: [],
      }))
      setSchemaTree(tree)

      if (dbs.length > 0) {
        setSelectedDatabase(dbs[0])
      }
    } catch (err) {
      setError(String(err))
      setConnectionStatus(connectionId, 'error')
      if (currentTab) {
        updateTab(currentTab.id, { status: 'error' })
      }
    } finally {
      setIsConnecting(false)
    }
  }, [connection, connectionId, setConnectionStatus, currentTab, updateTab])

  // Load database objects with categories
  const loadDatabaseObjects = useCallback(
    async (dbName: string) => {
      if (!connectionId) return

      const nodeId = `db:${dbName}`
      setLoadingNodes((prev) => new Set(prev).add(nodeId))

      try {
        const counts = await dbGetObjectsCount(connectionId, dbName)

        const categoryChildren: SchemaNode[] = [
          {
            id: `cat:${dbName}:tables`,
            name: t('database.tables'),
            type: 'category',
            categoryType: 'tables',
            dbName,
            count: counts.tables,
            children: [],
          },
          {
            id: `cat:${dbName}:views`,
            name: t('database.views'),
            type: 'category',
            categoryType: 'views',
            dbName,
            count: counts.views,
            children: [],
          },
          {
            id: `cat:${dbName}:functions`,
            name: t('database.functions'),
            type: 'category',
            categoryType: 'functions',
            dbName,
            count: counts.functions,
            children: [],
          },
          {
            id: `cat:${dbName}:procedures`,
            name: t('database.procedures'),
            type: 'category',
            categoryType: 'procedures',
            dbName,
            count: counts.procedures,
            children: [],
          },
        ]

        setSchemaTree((prev) =>
          prev.map((db) => (db.id === nodeId ? { ...db, children: categoryChildren } : db))
        )
      } catch (err) {
        console.error('Load database objects error:', err)
      } finally {
        setLoadingNodes((prev) => {
          const next = new Set(prev)
          next.delete(nodeId)
          return next
        })
      }
    },
    [connectionId, t]
  )

  // Load tables for a category
  const loadTables = useCallback(
    async (dbName: string, categoryId: string) => {
      if (!connectionId) return
      setLoadingNodes((prev) => new Set(prev).add(categoryId))

      try {
        const tables = await dbGetTables(connectionId, dbName)
        setSchemaTree((prev) =>
          prev.map((db) => {
            if (db.id !== `db:${dbName}`) return db
            return {
              ...db,
              children: db.children?.map((cat) => {
                if (cat.id !== categoryId) return cat
                return {
                  ...cat,
                  children: tables.map((table) => ({
                    id: `table:${dbName}.${table.name}`,
                    name: table.name,
                    type: 'table' as const,
                    dbName,
                    children: [],
                  })),
                }
              }),
            }
          })
        )
      } catch (err) {
        console.error('Load tables error:', err)
      } finally {
        setLoadingNodes((prev) => {
          const next = new Set(prev)
          next.delete(categoryId)
          return next
        })
      }
    },
    [connectionId]
  )

  // Load views for a category
  const loadViews = useCallback(
    async (dbName: string, categoryId: string) => {
      if (!connectionId) return
      setLoadingNodes((prev) => new Set(prev).add(categoryId))

      try {
        const views = await dbGetViews(connectionId, dbName)
        setSchemaTree((prev) =>
          prev.map((db) => {
            if (db.id !== `db:${dbName}`) return db
            return {
              ...db,
              children: db.children?.map((cat) => {
                if (cat.id !== categoryId) return cat
                return {
                  ...cat,
                  children: views.map((view) => ({
                    id: `view:${dbName}.${view.name}`,
                    name: view.name,
                    type: 'view' as const,
                    dbName,
                  })),
                }
              }),
            }
          })
        )
      } catch (err) {
        console.error('Load views error:', err)
      } finally {
        setLoadingNodes((prev) => {
          const next = new Set(prev)
          next.delete(categoryId)
          return next
        })
      }
    },
    [connectionId]
  )

  // Load functions/procedures for a category
  const loadRoutines = useCallback(
    async (dbName: string, categoryId: string, routineType: 'functions' | 'procedures') => {
      if (!connectionId) return
      setLoadingNodes((prev) => new Set(prev).add(categoryId))

      try {
        const routines = await dbGetRoutines(connectionId, dbName)
        const filtered = routines.filter((r) =>
          routineType === 'functions' ? r.routineType === 'FUNCTION' : r.routineType === 'PROCEDURE'
        )

        setSchemaTree((prev) =>
          prev.map((db) => {
            if (db.id !== `db:${dbName}`) return db
            return {
              ...db,
              children: db.children?.map((cat) => {
                if (cat.id !== categoryId) return cat
                return {
                  ...cat,
                  children: filtered.map((routine) => ({
                    id: `${routineType === 'functions' ? 'func' : 'proc'}:${dbName}.${routine.name}`,
                    name: routine.name,
                    type: routineType === 'functions' ? ('function' as const) : ('procedure' as const),
                    dbName,
                  })),
                }
              }),
            }
          })
        )
      } catch (err) {
        console.error('Load routines error:', err)
      } finally {
        setLoadingNodes((prev) => {
          const next = new Set(prev)
          next.delete(categoryId)
          return next
        })
      }
    },
    [connectionId]
  )

  // Load table structure
  const loadTableStructure = useCallback(
    async (dbName: string, tableName: string) => {
      if (!connectionId) return

      const nodeId = `table:${dbName}.${tableName}`
      setLoadingNodes((prev) => new Set(prev).add(nodeId))

      try {
        const structure = await dbGetTableStructure(connectionId, dbName, tableName)
        setSchemaTree((prev) =>
          prev.map((db) => {
            if (db.id !== `db:${dbName}`) return db
            return {
              ...db,
              children: db.children?.map((cat) => {
                if (cat.categoryType !== 'tables') return cat
                return {
                  ...cat,
                  children: cat.children?.map((table) => {
                    if (table.id !== nodeId) return table
                    return {
                      ...table,
                      data: structure,
                      children: [
                        ...structure.columns.map((col) => ({
                          id: `col:${dbName}.${tableName}.${col.name}`,
                          name: `${col.name} (${col.columnType})`,
                          type: 'column' as const,
                        })),
                        ...structure.indexes.map((idx) => ({
                          id: `idx:${dbName}.${tableName}.${idx.name}`,
                          name: `${idx.name} [${idx.columns.join(', ')}]`,
                          type: 'index' as const,
                        })),
                      ],
                    }
                  }),
                }
              }),
            }
          })
        )
      } catch (err) {
        console.error('Load table structure error:', err)
      } finally {
        setLoadingNodes((prev) => {
          const next = new Set(prev)
          next.delete(nodeId)
          return next
        })
      }
    },
    [connectionId]
  )

  // Toggle node expansion
  const toggleNode = useCallback(
    async (node: SchemaNode) => {
      const isExpanded = expandedNodes.has(node.id)

      if (!isExpanded) {
        if (node.type === 'database' && (!node.children || node.children.length === 0)) {
          await loadDatabaseObjects(node.name)
        } else if (node.type === 'category' && node.dbName && node.categoryType) {
          if (!node.children || node.children.length === 0) {
            if (node.categoryType === 'tables') {
              await loadTables(node.dbName, node.id)
            } else if (node.categoryType === 'views') {
              await loadViews(node.dbName, node.id)
            } else if (node.categoryType === 'functions' || node.categoryType === 'procedures') {
              await loadRoutines(node.dbName, node.id, node.categoryType)
            }
          }
        } else if (node.type === 'table' && node.dbName) {
          if (!node.children || node.children.length === 0) {
            await loadTableStructure(node.dbName, node.name)
          }
        }
        setExpandedNodes((prev) => new Set(prev).add(node.id))
      } else {
        setExpandedNodes((prev) => {
          const next = new Set(prev)
          next.delete(node.id)
          return next
        })
      }
    },
    [expandedNodes, loadDatabaseObjects, loadTables, loadViews, loadRoutines, loadTableStructure]
  )

  // Handle node click
  const handleNodeClick = useCallback(
    (node: SchemaNode) => {
      setSelectedNode(node)
      const hasChildren = node.type === 'database' || node.type === 'category' || node.type === 'table'
      if (hasChildren) {
        toggleNode(node)
      }
      if (node.type === 'database') {
        setSelectedDatabase(node.name)
      } else if (node.dbName) {
        setSelectedDatabase(node.dbName)
      }
    },
    [toggleNode]
  )

  // Refresh schema
  const handleRefresh = useCallback(async () => {
    if (!connectionId || !isConnected) return

    try {
      const dbs = await dbGetDatabases(connectionId)
      setDatabases(dbs)

      const tree: SchemaNode[] = dbs.map((dbName) => ({
        id: `db:${dbName}`,
        name: dbName,
        type: 'database' as const,
        expanded: false,
        children: [],
      }))
      setSchemaTree(tree)
      setExpandedNodes(new Set())
    } catch (err) {
      console.error('Refresh error:', err)
    }
  }, [connectionId, isConnected])

  // Copy table name
  const handleCopyTableName = useCallback((tableName: string) => {
    navigator.clipboard.writeText(tableName)
  }, [])

  // New query (empty SQL editor for database)
  const handleNewQuery = useCallback((dbName: string) => {
    setSql('')
    setSelectedDatabase(dbName)
    setDataEditorOpen(false)
  }, [setSql])

  // View table data (new query)
  const handleViewTableData = useCallback((dbName: string, tableName: string) => {
    const query = `SELECT * FROM \`${dbName}\`.\`${tableName}\` LIMIT 100;`
    setSql(query)
    setSelectedDatabase(dbName)
  }, [setSql])

  // Edit table data (opens DataEditor)
  const handleEditTableData = useCallback((dbName: string, tableName: string) => {
    setDataEditorInfo({ db: dbName, table: tableName })
    setDataEditorOpen(true)
    setSelectedDatabase(dbName)
  }, [])

  // View table DDL
  const handleViewTableDdl = useCallback(
    async (dbName: string, tableName: string) => {
      if (!connectionId) return
      try {
        const ddl = await dbGetTableDdl(connectionId, dbName, tableName)
        setSql(ddl)
        setSelectedDatabase(dbName)
      } catch (err) {
        console.error('Get DDL error:', err)
      }
    },
    [connectionId, setSql]
  )

  // Open create table dialog
  const handleCreateTable = useCallback((dbName: string) => {
    setCreateTableDb(dbName)
    setCreateTableDialogOpen(true)
  }, [])

  // Open edit table structure dialog
  const handleEditTableStructure = useCallback((dbName: string, tableName: string) => {
    setEditStructureTableInfo({ db: dbName, table: tableName })
    setEditStructureDialogOpen(true)
  }, [])

  // Open rename table dialog
  const handleRenameTable = useCallback((dbName: string, tableName: string) => {
    setRenameTableInfo({ db: dbName, table: tableName })
    setRenameDialogOpen(true)
  }, [])

  // Open drop table confirmation
  const handleDropTable = useCallback((dbName: string, tableName: string) => {
    setDropTableInfo({ db: dbName, table: tableName })
    setDropConfirmOpen(true)
  }, [])

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

  // Auto-connect on mount
  useEffect(() => {
    if (connection && !isConnected && !isConnecting) {
      handleConnect()
    }
  }, [connection, isConnected, isConnecting, handleConnect])

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
    <div className={cn('flex h-full overflow-hidden', className)}>
      {/* Schema Tree Sidebar */}
      <SchemaTree
        schemaTree={schemaTree}
        expandedNodes={expandedNodes}
        selectedNode={selectedNode}
        loadingNodes={loadingNodes}
        styles={styles}
        onNodeClick={handleNodeClick}
        onRefresh={handleRefresh}
        onNewQuery={handleNewQuery}
        onViewTableData={handleViewTableData}
        onEditTableData={handleEditTableData}
        onViewTableDdl={handleViewTableDdl}
        onCopyTableName={handleCopyTableName}
        onCreateTable={handleCreateTable}
        onEditTableStructure={handleEditTableStructure}
        onRenameTable={handleRenameTable}
        onDropTable={handleDropTable}
      />

      {/* Main Content Area */}
      {dataEditorOpen && dataEditorInfo ? (
        <DataEditor
          connectionId={connectionId}
          database={dataEditorInfo.db}
          tableName={dataEditorInfo.table}
          onClose={() => {
            setDataEditorOpen(false)
            setDataEditorInfo(null)
          }}
          isDark={isDark}
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

      {/* Dialogs */}
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

      <CreateTableDialog
        open={createTableDialogOpen}
        onOpenChange={setCreateTableDialogOpen}
        connectionId={connectionId}
        database={createTableDb}
        onSuccess={handleTableOperationSuccess}
      />

      {editStructureTableInfo && (
        <EditTableStructureDialog
          open={editStructureDialogOpen}
          onOpenChange={setEditStructureDialogOpen}
          connectionId={connectionId}
          database={editStructureTableInfo.db}
          tableName={editStructureTableInfo.table}
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
