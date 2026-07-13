/**
 * Tree Node Item Component
 * Main component for rendering individual tree nodes (folders and connections)
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import * as ContextMenu from '@radix-ui/react-context-menu'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  Plus,
  Link,
  FolderPlus,
  Loader2,
  RefreshCw,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { getDatabaseIcon, KafkaIcon, DockerIcon, RedisIcon, ElasticsearchIcon } from '@/components/icons/DatabaseIcons'
import { useConnectionStore, useTabStore, createTabFromConnection, MAX_FOLDER_DEPTH } from '@/stores'
import { dbGetTableDdl, dbDropTable, dbRenameTable, dbDisconnect } from '@/services/database'
import { ConfirmDialog, InputDialog } from '@/components/common'
import { ModuleType, DatabaseConnection, MiddlewareConnection } from '@/types'
import { TreeNodeItemProps, DbTreeNode } from './types'
import { statusColors, connectionIcons, DRAG_THRESHOLD } from './constants'
import {
  dragState,
  createDragOverlay,
  updateDragOverlay,
  registerDropTarget,
  unregisterDropTarget,
  notifyDropTargets,
  getCurrentDropTarget,
  setCurrentDropTarget,
  resetDragState,
} from './DragDropManager'
import { useDbTree } from './hooks/useDbTree'
import { DatabaseTreeNode } from './DatabaseTreeNode'
import { FolderContextMenu, ConnectionContextMenu } from './TreeNodeContextMenu'

export function TreeNodeItem({
  node,
  moduleType,
  level,
  folderDepth,
  searchQuery: _searchQuery,
  onToggleExpand,
  onDelete,
  onRename,
  onCreateSubfolder,
  onCreateConnection,
  onConnect,
  onDisconnect,
  onEdit,
  onExpandAll,
  onCollapseAll,
  onEditConnection: _onEditConnection,
  onCreateConnectionInFolder: _onCreateConnectionInFolder,
  onCopy,
  onMoveTo,
  onOpenInNewWindow,
  onDbTableAction: _onDbTableAction,
  onDropConnection,
  availableFolders = [],
}: TreeNodeItemProps) {
  const { t } = useTranslation()
  const { setConnectionStatus } = useConnectionStore()
  const { addTab } = useTabStore()

  const isFolder = node.type === 'folder'
  const isConnection = node.type === 'connection'
  const isDatabaseConnection = isConnection && moduleType === ModuleType.Database

  // Drag and drop state
  const [isDragOver, setIsDragOver] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const nodeRef = useRef<HTMLDivElement>(null)

  // Dialog states
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [renameDialogOpen, setRenameDialogOpen] = useState(false)
  const [subfolderDialogOpen, setSubfolderDialogOpen] = useState(false)
  const [dropConfirmOpen, setDropConfirmOpen] = useState(false)
  const [dropTableInfo, setDropTableInfo] = useState<{ db: string; table: string; schema?: string } | null>(null)
  const [renameTableDialogOpen, setRenameTableDialogOpen] = useState(false)
  const [renameTableInfo, setRenameTableInfo] = useState<{ db: string; table: string; schema?: string } | null>(null)

  // Database tree hook
  const dbTreeHook = isDatabaseConnection && node.data
    ? useDbTree({
        connection: node.data as DatabaseConnection,
        onStatusChange: (status) => setConnectionStatus(node.id, status),
      })
    : null

  // Register folder as drop target
  useEffect(() => {
    if (isFolder) {
      registerDropTarget(node.id, (_folderId, isOver) => {
        setIsDragOver(isOver)
      })
      return () => {
        unregisterDropTarget(node.id)
      }
    }
  }, [isFolder, node.id])

  // Mouse-based drag handlers for connections
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!isConnection) return
    if (e.button !== 0) return

    const target = e.target as HTMLElement
    if (target.closest('button')) return

    dragState.connectionId = node.id
    dragState.moduleType = moduleType
    dragState.startX = e.clientX
    dragState.startY = e.clientY
    dragState.isDragging = false

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const dx = Math.abs(moveEvent.clientX - dragState.startX)
      const dy = Math.abs(moveEvent.clientY - dragState.startY)

      if (!dragState.isDragging && (dx > DRAG_THRESHOLD || dy > DRAG_THRESHOLD)) {
        dragState.isDragging = true
        setIsDragging(true)
        createDragOverlay(node.name)
        document.body.style.cursor = 'grabbing'
        document.body.style.userSelect = 'none'
      }

      if (dragState.isDragging) {
        updateDragOverlay(moveEvent.clientX, moveEvent.clientY)

        const elementsUnderCursor = document.elementsFromPoint(moveEvent.clientX, moveEvent.clientY)
        let foundTarget = false

        for (const elem of elementsUnderCursor) {
          const folderElem = elem.closest('[data-folder-id]') as HTMLElement
          if (folderElem) {
            const folderId = folderElem.dataset.folderId
            const folderModuleType = folderElem.dataset.moduleType

            if (folderId && folderModuleType === moduleType) {
              setCurrentDropTarget(folderId)
              notifyDropTargets(folderId, true)
              foundTarget = true
              break
            }
          }
        }

        if (!foundTarget) {
          setCurrentDropTarget(null)
          notifyDropTargets(null, false)
        }
      }
    }

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)

      const currentTarget = getCurrentDropTarget()
      if (dragState.isDragging && currentTarget && onDropConnection) {
        const targetFolderId = currentTarget.startsWith('root:') ? null : currentTarget
        onDropConnection(dragState.connectionId!, targetFolderId)
      }

      setIsDragging(false)
      resetDragState()
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }

  // Get icon based on node type
  const getNodeIcon = () => {
    if (isFolder) {
      return node.expanded ? FolderOpen : Folder
    }
    if (moduleType === ModuleType.Database && node.data) {
      const dbConnection = node.data as DatabaseConnection
      if (dbConnection.dbType) {
        return getDatabaseIcon(dbConnection.dbType)
      }
    }
    if (moduleType === ModuleType.Docker) {
      return DockerIcon
    }
    if (moduleType === ModuleType.Middleware && node.data) {
      const mwConnection = node.data as MiddlewareConnection
      if (mwConnection.middlewareType === 'kafka') return KafkaIcon
      if (mwConnection.middlewareType === 'redis') return RedisIcon
      if (mwConnection.middlewareType === 'elasticsearch') return ElasticsearchIcon
    }
    return connectionIcons[moduleType]
  }
  const Icon = getNodeIcon()
  const paddingLeft = level * 12

  // Database table operations
  const handleCopyTableName = (tableName: string) => {
    navigator.clipboard.writeText(tableName)
  }

  const handleOpenTableQuery = (dbName: string, tableName: string, schemaName?: string) => {
    if (!node.data) return
    const conn = node.data as DatabaseConnection
    const location = schemaName || dbName
    const tabName = tableName
      ? `${t('database.newQuery')} - ${tableName} [${location}]`
      : `${t('database.newQuery')} [${location}]`

    let query = ''
    if (tableName) {
      if (conn.dbType === 'postgresql' || conn.dbType === 'kingbase') {
        const schema = schemaName || 'public'
        query = `SELECT * FROM "${schema}"."${tableName}" LIMIT 100;`
      } else if (conn.dbType === 'oracle') {
        const schema = schemaName || dbName
        query = `SELECT * FROM "${schema}"."${tableName}" FETCH FIRST 100 ROWS ONLY`
      } else {
        query = `SELECT * FROM \`${dbName}\`.\`${tableName}\` LIMIT 100;`
      }
    }
    const tab = createTabFromConnection(conn.id, tabName, ModuleType.Database, 'database', 'connected')
    tab.data = { ...tab.data, initialSql: query, database: dbName, schemaName }
    addTab(tab)
  }

  const handleViewTableDdl = async (dbName: string, tableName: string, schemaName?: string) => {
    if (!node.data) return
    const conn = node.data as DatabaseConnection
    const location = schemaName || dbName
    try {
      const ddl = await dbGetTableDdl(conn.id, dbName, tableName, schemaName)
      const tab = createTabFromConnection(conn.id, `${t('database.viewDDL')} - ${tableName} [${location}]`, ModuleType.Database, 'database', 'connected')
      tab.data = { ...tab.data, initialSql: ddl, database: dbName, schemaName }
      addTab(tab)
    } catch (err) {
      console.error('Get DDL error:', err)
    }
  }

  const handleEditTableData = (dbName: string, tableName: string, schemaName?: string) => {
    if (!node.data) return
    const conn = node.data as DatabaseConnection
    const location = schemaName || dbName
    const tab = createTabFromConnection(conn.id, `${t('database.editData')} - ${tableName} [${location}]`, ModuleType.Database, 'database', 'connected')
    tab.data = { ...tab.data, editMode: true, database: dbName, tableName, schemaName }
    addTab(tab)
  }

  const handleDropTableClick = (dbName: string, tableName: string, schema?: string) => {
    setDropTableInfo({ db: dbName, table: tableName, schema })
    setDropConfirmOpen(true)
  }

  const handleConfirmDropTable = async () => {
    if (!node.data || !dropTableInfo) return
    const conn = node.data as DatabaseConnection
    try {
      await dbDropTable(conn.id, dropTableInfo.db, dropTableInfo.table, dropTableInfo.schema)
      setDropConfirmOpen(false)
      setDropTableInfo(null)
      dbTreeHook?.handleDbConnectionClick()
    } catch (err) {
      console.error('Drop table error:', err)
      alert(`Failed to drop table: ${err}`)
    }
  }

  const handleRenameTableClick = (dbName: string, tableName: string, schema?: string) => {
    setRenameTableInfo({ db: dbName, table: tableName, schema })
    setRenameTableDialogOpen(true)
  }

  const handleConfirmRenameTable = async (newName: string) => {
    if (!node.data || !renameTableInfo) return
    const conn = node.data as DatabaseConnection
    try {
      await dbRenameTable(conn.id, renameTableInfo.db, renameTableInfo.table, newName, renameTableInfo.schema)
      setRenameTableDialogOpen(false)
      setRenameTableInfo(null)
      dbTreeHook?.handleDbConnectionClick()
    } catch (err) {
      console.error('Rename table error:', err)
      alert(`Failed to rename table: ${err}`)
    }
  }

  const handleCreateTable = (dbName: string, schemaName?: string) => {
    if (!node.data) return
    const conn = node.data as DatabaseConnection
    const location = schemaName || dbName
    const tab = createTabFromConnection(conn.id, `${t('database.createTable')} [${location}]`, ModuleType.Database, 'database', 'connected')
    tab.data = { ...tab.data, createTable: true, database: dbName, schemaName }
    addTab(tab)
  }

  const handleEditTableStructure = (dbName: string, tableName: string, schemaName?: string) => {
    if (!node.data) return
    const conn = node.data as DatabaseConnection
    const location = schemaName || dbName
    const tab = createTabFromConnection(conn.id, `${t('database.editTableStructure')} - ${tableName} [${location}]`, ModuleType.Database, 'database', 'connected')
    tab.data = { ...tab.data, editStructure: true, database: dbName, tableName, schemaName }
    addTab(tab)
  }

  const handleOpenERDesigner = (dbName: string, schemaName?: string) => {
    if (!node.data) return
    const conn = node.data as DatabaseConnection
    const location = schemaName || dbName
    const tab = createTabFromConnection(conn.id, `${t('database.erDesigner.title')} [${location}]`, ModuleType.Database, 'database', 'connected')
    tab.data = { ...tab.data, erDesigner: true, database: dbName, schemaName }
    addTab(tab)
  }

  const handleOptimizeTable = (dbName: string, tableName: string, schemaName?: string) => {
    if (!node.data) return
    const conn = node.data as DatabaseConnection
    const location = schemaName || dbName
    const sql = `OPTIMIZE TABLE \`${dbName}\`.\`${tableName}\` FINAL;`
    const tab = createTabFromConnection(conn.id, `OPTIMIZE ${tableName} [${location}]`, ModuleType.Database, 'database', 'connected')
    tab.data = { ...tab.data, initialSql: sql, database: dbName, schemaName }
    addTab(tab)
  }

  const getConnectionDbType = (): string => {
    if (!node.data) return 'mysql'
    const conn = node.data as DatabaseConnection
    return conn.dbType || 'mysql'
  }

  // Render database tree node recursively
  const renderDbTreeNode = useCallback((dbNode: DbTreeNode, depth: number) => {
    if (!dbTreeHook || !node.data) return null
    const conn = node.data as DatabaseConnection

    return (
      <DatabaseTreeNode
        key={dbNode.id}
        dbNode={dbNode}
        depth={depth}
        level={level}
        connectionId={conn.id}
        dbType={getConnectionDbType()}
        expandedDbNodes={dbTreeHook.expandedDbNodes}
        loadingDbNodes={dbTreeHook.loadingDbNodes}
        onNodeClick={dbTreeHook.handleDbNodeClick}
        onOpenTableQuery={handleOpenTableQuery}
        onEditTableData={handleEditTableData}
        onViewTableDdl={handleViewTableDdl}
        onCreateTable={handleCreateTable}
        onEditTableStructure={handleEditTableStructure}
        onRenameTable={handleRenameTableClick}
        onDropTable={handleDropTableClick}
        onCopyTableName={handleCopyTableName}
        onOptimizeTable={handleOptimizeTable}
        onOpenERDesigner={handleOpenERDesigner}
        renderChildren={(parent, d) => parent.children?.map((child) => renderDbTreeNode(child, d + 1))}
      />
    )
  }, [dbTreeHook, node.data, level])

  // Handle disconnect with cleanup
  const handleDisconnect = async () => {
    if (isDatabaseConnection) {
      dbTreeHook?.collapseAll()
      setConnectionStatus(node.id, 'disconnected')
      if (node.data) {
        try {
          await dbDisconnect((node.data as DatabaseConnection).id)
        } catch (err) {
          console.error('Failed to disconnect database:', err)
        }
      }
    }
    onDisconnect()
  }

  return (
    <>
      <div
        ref={nodeRef}
        className={cn(
          'tree-item group',
          isDragOver && 'bg-dark-accent/20 border border-dark-accent border-dashed',
          isDragging && 'opacity-50',
          isConnection && 'cursor-grab'
        )}
        style={{ paddingLeft: `${paddingLeft}px` }}
        data-folder-id={isFolder ? node.id : undefined}
        data-module-type={isFolder ? moduleType : undefined}
        onMouseDown={handleMouseDown}
        onClick={() => {
          if (dragState.isDragging) return
          if (isFolder) {
            onToggleExpand()
          } else if (isDatabaseConnection && dbTreeHook) {
            dbTreeHook.handleDbConnectionClick()
          }
        }}
        onDoubleClick={() => {
          if (isConnection && !isDatabaseConnection) {
            onConnect()
          }
        }}
      >
        <ContextMenu.Root>
          <ContextMenu.Trigger asChild>
            <div className="flex items-center flex-1 min-w-0">
              {/* Expand/collapse icon */}
              {(isFolder || isDatabaseConnection) && (
                <span className="w-4 h-4 flex items-center justify-center flex-shrink-0">
                  {dbTreeHook?.dbLoading ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (isFolder ? node.expanded : dbTreeHook?.dbExpanded) ? (
                    <ChevronDown className="w-3 h-3" />
                  ) : (
                    <ChevronRight className="w-3 h-3" />
                  )}
                </span>
              )}

              {/* Connection status dot (before icon for non-database) */}
              {isConnection && !isDatabaseConnection && (
                <span
                  className={cn(
                    'status-dot mr-1.5 flex-shrink-0',
                    statusColors[node.status || 'disconnected']
                  )}
                />
              )}

              {/* Icon */}
              <Icon className={cn('w-4 h-4 flex-shrink-0', isDatabaseConnection ? 'mr-1' : 'mr-1.5 text-dark-text-secondary')} />

              {/* Connection status dot (after icon for database) */}
              {isDatabaseConnection && (
                <span
                  className={cn(
                    'status-dot mr-1.5 flex-shrink-0',
                    statusColors[node.status || 'disconnected']
                  )}
                />
              )}

              {/* Name */}
              <span className="flex-1 text-sm truncate">{node.name}</span>

              {/* Refresh button for database connections */}
              {isDatabaseConnection && dbTreeHook?.dbExpanded && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    dbTreeHook?.refreshDatabases()
                  }}
                  className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-dark-bg-hover rounded flex-shrink-0"
                  title={t('common.refresh')}
                >
                  <RefreshCw className={cn('w-3 h-3', dbTreeHook?.dbLoading && 'animate-spin')} />
                </button>
              )}

              {/* Add button for folders */}
              {isFolder && (
                <DropdownMenu.Root>
                  <DropdownMenu.Trigger asChild>
                    <button
                      onClick={(e) => e.stopPropagation()}
                      className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-dark-bg-hover rounded flex-shrink-0"
                      title={t('common.add')}
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </DropdownMenu.Trigger>
                  <DropdownMenu.Portal>
                    <DropdownMenu.Content
                      className="dropdown-content min-w-[140px] p-1 z-50"
                      sideOffset={5}
                      align="start"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <DropdownMenu.Item
                        className="dropdown-item rounded-md flex items-center gap-2 px-2 py-1.5 text-sm cursor-pointer outline-none"
                        onSelect={onCreateConnection}
                      >
                        <Link className="w-4 h-4" />
                        {t('sidebar.newConnection')}
                      </DropdownMenu.Item>
                      {folderDepth < MAX_FOLDER_DEPTH && (
                        <DropdownMenu.Item
                          className="dropdown-item rounded-md flex items-center gap-2 px-2 py-1.5 text-sm cursor-pointer outline-none"
                          onSelect={() => setSubfolderDialogOpen(true)}
                        >
                          <FolderPlus className="w-4 h-4" />
                          {t('sidebar.newSubfolder')}
                        </DropdownMenu.Item>
                      )}
                    </DropdownMenu.Content>
                  </DropdownMenu.Portal>
                </DropdownMenu.Root>
              )}
            </div>
          </ContextMenu.Trigger>

          {/* Context menu */}
          <ContextMenu.Portal>
            <ContextMenu.Content className="context-menu min-w-[180px] rounded-md shadow-lg py-1 z-50">
              {isConnection && (
                <ConnectionContextMenu
                  isDatabaseConnection={isDatabaseConnection}
                  onConnect={onConnect}
                  onDisconnect={handleDisconnect}
                  onEdit={onEdit}
                  onRename={() => setRenameDialogOpen(true)}
                  onCopy={onCopy}
                  onDelete={() => setDeleteDialogOpen(true)}
                  onMoveTo={onMoveTo}
                  onOpenInNewWindow={onOpenInNewWindow}
                  availableFolders={availableFolders}
                />
              )}
              {isFolder && (
                <FolderContextMenu
                  folderDepth={folderDepth}
                  onCreateConnection={onCreateConnection}
                  onCreateSubfolder={() => setSubfolderDialogOpen(true)}
                  onExpandAll={onExpandAll}
                  onCollapseAll={onCollapseAll}
                  onRename={() => setRenameDialogOpen(true)}
                  onDelete={() => setDeleteDialogOpen(true)}
                />
              )}
            </ContextMenu.Content>
          </ContextMenu.Portal>
        </ContextMenu.Root>
      </div>

      {/* Delete confirmation dialog */}
      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title={isFolder ? t('sidebar.deleteFolder') : t('sidebar.deleteConnection')}
        description={isFolder ? t('sidebar.confirmDeleteFolder') : t('sidebar.confirmDeleteConnection')}
        variant="danger"
        confirmText={t('common.delete')}
        onConfirm={onDelete}
      />

      {/* Rename dialog */}
      <InputDialog
        open={renameDialogOpen}
        onOpenChange={setRenameDialogOpen}
        title={t('sidebar.rename')}
        placeholder={t('sidebar.enterNewName')}
        defaultValue={node.name}
        onConfirm={onRename}
      />

      {/* New subfolder dialog */}
      {isFolder && (
        <InputDialog
          open={subfolderDialogOpen}
          onOpenChange={setSubfolderDialogOpen}
          title={t('sidebar.newSubfolder')}
          placeholder={t('sidebar.enterFolderName')}
          onConfirm={onCreateSubfolder}
        />
      )}

      {/* Children (folders) */}
      {isFolder && node.expanded && node.children && node.children.length > 0 && (
        <div className="connection-tree-children">
          {/* This will be rendered by parent ConnectionTree */}
        </div>
      )}

      {/* Database tree nodes */}
      {isDatabaseConnection && dbTreeHook?.dbExpanded && dbTreeHook.dbTree.length > 0 && (
        <div>
          {dbTreeHook.dbTree.map((dbNode) => renderDbTreeNode(dbNode, 1))}
        </div>
      )}

      {/* Drop table confirmation dialog */}
      <ConfirmDialog
        open={dropConfirmOpen}
        onOpenChange={setDropConfirmOpen}
        title={t('database.dropTable')}
        description={t('database.dropTableConfirm', { table: dropTableInfo?.table || '' })}
        variant="danger"
        confirmText={t('database.drop')}
        onConfirm={handleConfirmDropTable}
      />

      {/* Rename table dialog */}
      <InputDialog
        open={renameTableDialogOpen}
        onOpenChange={setRenameTableDialogOpen}
        title={t('database.renameTable')}
        placeholder={t('database.enterNewTableName')}
        defaultValue={renameTableInfo?.table || ''}
        onConfirm={handleConfirmRenameTable}
      />
    </>
  )
}
