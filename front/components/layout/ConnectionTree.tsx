/**
 * 连接树组件
 */

import { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import * as ContextMenu from '@radix-ui/react-context-menu'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  Server,
  Database,
  Container,
  Settings2,
  Plus,
  Edit,
  Trash2,
  Copy,
  FolderPlus,
  Link,
  Link2Off,
  ExternalLink,
  Move,
  ChevronsDown,
  ChevronsUp,
  Table2,
  Eye,
  FunctionSquare,
  Loader2,
  RefreshCw,
  FileText,
  FileCode,
  Pencil,
  Edit3,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { getDatabaseIcon } from '@/components/icons/DatabaseIcons'
import { useConnectionStore, useTabStore, createTabFromConnection, MAX_FOLDER_DEPTH } from '@/stores'
import { sshDisconnect } from '@/services'
import { dbConnect, dbDisconnect, dbGetDatabases, dbGetSchemas, dbGetObjectsCount, dbGetTables, dbGetViews, dbGetRoutines, dbGetTableDdl, dbDropTable, dbRenameTable } from '@/services/database'
import { ConfirmDialog, InputDialog } from '@/components/common'
import {
  ModuleType,
  TreeNode,
  ConnectionStatus,
  SSHConnection,
  DatabaseConnection,
  DockerConnection,
  MiddlewareConnection,
} from '@/types'

// Database tree node type
interface DbTreeNode {
  id: string
  name: string
  type: 'database' | 'schema' | 'category' | 'table' | 'view' | 'function' | 'procedure'
  count?: number
  children?: DbTreeNode[]
  loading?: boolean
  dbName?: string  // For schema/category nodes to track parent database
  schemaName?: string  // For category nodes in PostgreSQL
}

// 状态颜色
const statusColors: Record<ConnectionStatus, string> = {
  connected: 'bg-status-success',
  disconnected: 'bg-dark-text-disabled',
  connecting: 'bg-status-warning',
  error: 'bg-status-error',
}

// 模块图标
const connectionIcons: Record<ModuleType, React.ComponentType<{ className?: string }>> = {
  [ModuleType.SSH]: Server,
  [ModuleType.Database]: Database,
  [ModuleType.Docker]: Container,
  [ModuleType.Middleware]: Settings2,
}

interface ConnectionTreeProps {
  nodes: TreeNode[]
  moduleType: ModuleType
  level: number
  searchQuery?: string
  onEditConnection?: (connection: any) => void
  onCreateConnection?: (folderId: string | null) => void
}

export function ConnectionTree({
  nodes,
  moduleType,
  level,
  searchQuery = '',
  onEditConnection,
  onCreateConnection,
}: ConnectionTreeProps) {
  const { t } = useTranslation()
  const {
    folders,
    toggleFolderExpand,
    deleteFolder,
    deleteConnection,
    createFolder,
    createConnection,
    updateFolder,
    updateConnection,
    moveConnection,
    getFolderDepth,
  } = useConnectionStore()
  const { tabs, addTab, updateTab } = useTabStore()

  // 递归展开/折叠所有子文件夹
  const setExpandRecursive = (node: TreeNode, expanded: boolean) => {
    if (node.type === 'folder') {
      updateFolder(node.id, { expanded })
      if (node.children) {
        node.children.forEach((child) => setExpandRecursive(child, expanded))
      }
    }
  }

  // 过滤节点
  const filteredNodes = searchQuery
    ? nodes.filter((node) =>
        node.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : nodes

  if (filteredNodes.length === 0) {
    return null
  }

  return (
    <div className="ml-2">
      {filteredNodes.map((node) => {
        // 计算当前文件夹的深度
        const currentFolderDepth = node.type === 'folder' ? getFolderDepth(node.id) : 0
        return (
        <TreeNodeItem
          key={node.id}
          node={node}
          moduleType={moduleType}
          level={level}
          folderDepth={currentFolderDepth}
          searchQuery={searchQuery}
          onToggleExpand={() => {
            if (node.type === 'folder') {
              toggleFolderExpand(node.id)
            }
          }}
          onDelete={() => {
            if (node.type === 'folder') {
              deleteFolder(node.id)
            } else if (node.type === 'connection') {
              deleteConnection(node.id)
            }
          }}
          onRename={(newName: string) => {
            if (node.type === 'folder') {
              updateFolder(node.id, { name: newName })
            } else if (node.type === 'connection') {
              updateConnection(node.id, { name: newName })
            }
          }}
          onCreateSubfolder={(name: string) => {
            createFolder(name, moduleType, node.id)
          }}
          onCreateConnection={() => {
            // 调用上层传入的创建连接回调，传入当前文件夹ID
            onCreateConnection?.(node.id)
          }}
          onConnect={() => {
            if (node.type === 'connection' && node.data) {
              const connection = node.data as SSHConnection | DatabaseConnection | DockerConnection | MiddlewareConnection
              // 根据连接类型确定标签页类型
              let tabType: 'terminal' | 'sftp' | 'database' | 'docker' | 'middleware' = 'terminal'
              if (moduleType === ModuleType.Database) {
                tabType = 'database'
              } else if (moduleType === ModuleType.Docker) {
                tabType = 'docker'
              } else if (moduleType === ModuleType.Middleware) {
                tabType = 'middleware'
              }

              addTab(
                createTabFromConnection(
                  connection.id,
                  connection.name,
                  moduleType,
                  tabType,
                  'connecting'
                )
              )
            }
          }}
          onDisconnect={async () => {
            if (node.type === 'connection') {
              // 数据库连接断开处理
              if (moduleType === ModuleType.Database && node.data) {
                try {
                  const conn = node.data as DatabaseConnection
                  await dbDisconnect(conn.id)
                } catch (err) {
                  console.error('Failed to disconnect database:', err)
                }
              }
              // SSH连接断开处理
              const tab = tabs.find(t => t.connectionId === node.id && t.status === 'connected')
              if (tab && tab.data?.sessionId) {
                try {
                  await sshDisconnect(tab.data.sessionId as string)
                  updateTab(tab.id, {
                    status: 'disconnected',
                    data: { ...tab.data, sessionId: undefined }
                  })
                } catch (err) {
                  console.error('Failed to disconnect:', err)
                }
              }
            }
          }}
          onEdit={() => {
            if (node.type === 'connection' && node.data && onEditConnection) {
              onEditConnection(node.data)
            }
          }}
          onExpandAll={() => {
            setExpandRecursive(node, true)
          }}
          onCollapseAll={() => {
            setExpandRecursive(node, false)
          }}
          onEditConnection={onEditConnection}
          onCreateConnectionInFolder={onCreateConnection}
          onCopy={() => {
            if (node.type === 'connection' && node.data) {
              const { id, createdAt, updatedAt, lastConnectedAt, ...rest } = node.data as any
              const newConnection = createConnection({
                ...rest,
                name: `${node.name} (Copy)`,
              })
              console.log('Connection copied:', newConnection)
            }
          }}
          onMoveTo={() => {
            if (node.type === 'connection') {
              // 获取该模块类型下的所有文件夹
              const moduleFolders = folders.filter(f => f.moduleType === moduleType)
              const folderOptions = [
                { id: '', name: t('sidebar.rootFolder') },
                ...moduleFolders.map(f => ({ id: f.id, name: f.name }))
              ]

              // 简单的文件夹选择（后续可以改为更好的UI）
              setTimeout(() => {
                const options = folderOptions.map((f, i) => `${i}: ${f.name}`).join('\n')
                const input = window.prompt(
                  `${t('sidebar.selectTargetFolder')}\n${options}`,
                  '0'
                )
                if (input !== null) {
                  const index = parseInt(input)
                  if (!isNaN(index) && index >= 0 && index < folderOptions.length) {
                    const targetFolderId = folderOptions[index].id || null
                    moveConnection(node.id, targetFolderId)
                  }
                }
              }, 0)
            }
          }}
          onOpenInNewWindow={() => {
            // TODO: 实现在新窗口打开功能
            // 需要使用 Tauri 的多窗口 API
            console.log('Open in new window:', node)
          }}
          onDbTableAction={(action, dbName, tableName, schemaName) => {
            // TODO: 实现数据库表操作
            console.log('Database table action:', action, dbName, tableName, schemaName)
            // 这里可以根据 action 类型打开相应的对话框或执行操作
            // action: 'editData' | 'viewDDL' | 'createTable' | 'editStructure' | 'rename' | 'drop'
          }}
        />
        )
      })}
    </div>
  )
}

// Database table action type
type DbTableAction = 'editData' | 'viewDDL' | 'createTable' | 'editStructure' | 'rename' | 'drop'

interface TreeNodeItemProps {
  node: TreeNode
  moduleType: ModuleType
  level: number
  folderDepth: number
  searchQuery?: string
  onToggleExpand: () => void
  onDelete: () => void
  onRename: (newName: string) => void
  onCreateSubfolder: (name: string) => void
  onCreateConnection: () => void
  onConnect: () => void
  onDisconnect: () => void
  onEdit: () => void
  onExpandAll: () => void
  onCollapseAll: () => void
  onEditConnection?: (connection: any) => void
  onCreateConnectionInFolder?: (folderId: string | null) => void
  onCopy: () => void
  onMoveTo: () => void
  onOpenInNewWindow: () => void
  onDbTableAction?: (action: DbTableAction, dbName: string, tableName: string, schemaName?: string) => void
}

function TreeNodeItem({
  node,
  moduleType,
  level,
  folderDepth,
  searchQuery,
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
  onEditConnection,
  onCreateConnectionInFolder,
  onCopy,
  onMoveTo,
  onOpenInNewWindow,
  onDbTableAction,
}: TreeNodeItemProps) {
  const { t } = useTranslation()
  const { setConnectionStatus } = useConnectionStore()
  const { addTab } = useTabStore()
  const isFolder = node.type === 'folder'
  const isConnection = node.type === 'connection'
  const isDatabaseConnection = isConnection && moduleType === ModuleType.Database

  // Database tree state (for database connections)
  const [dbExpanded, setDbExpanded] = useState(false)
  const [dbLoading, setDbLoading] = useState(false)
  const [dbTree, setDbTree] = useState<DbTreeNode[]>([])
  const [expandedDbNodes, setExpandedDbNodes] = useState<Set<string>>(new Set())
  const [loadingDbNodes, setLoadingDbNodes] = useState<Set<string>>(new Set())

  // Get icon based on node type
  const getNodeIcon = () => {
    if (isFolder) {
      return node.expanded ? FolderOpen : Folder
    }
    // For database connections, use database-specific icon
    if (moduleType === ModuleType.Database && node.data) {
      const dbConnection = node.data as DatabaseConnection
      if (dbConnection.dbType) {
        return getDatabaseIcon(dbConnection.dbType)
      }
    }
    return connectionIcons[moduleType]
  }
  const Icon = getNodeIcon()

  const paddingLeft = level * 12

  // 对话框状态
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [renameDialogOpen, setRenameDialogOpen] = useState(false)
  const [subfolderDialogOpen, setSubfolderDialogOpen] = useState(false)

  // Handle database connection expand/collapse
  const handleDbConnectionClick = useCallback(async () => {
    if (!isDatabaseConnection || !node.data) return

    const conn = node.data as DatabaseConnection

    if (dbExpanded) {
      // Collapse
      setDbExpanded(false)
      return
    }

    // Expand - connect and load databases
    setDbLoading(true)
    setConnectionStatus(node.id, 'connecting')

    try {
      await dbConnect({
        connectionId: conn.id,
        dbType: conn.dbType || 'mysql',
        host: conn.host,
        port: conn.port,
        username: conn.username,
        password: conn.password,
        database: conn.database,
      })

      setConnectionStatus(node.id, 'connected')

      // Get all databases
      const dbs = await dbGetDatabases(conn.id)

      // Build tree - all databases can be expanded
      const tree: DbTreeNode[] = dbs.map((dbName) => ({
        id: `db:${conn.id}:${dbName}`,
        name: dbName,
        type: 'database' as const,
        children: [],
      }))

      setDbTree(tree)
      setDbExpanded(true)
    } catch (err) {
      console.error('Failed to connect:', err)
      setConnectionStatus(node.id, 'error')
    } finally {
      setDbLoading(false)
    }
  }, [isDatabaseConnection, node, dbExpanded, setConnectionStatus])

  // Helper to update tree node recursively
  const updateTreeNode = (nodes: DbTreeNode[], targetId: string, update: Partial<DbTreeNode>): DbTreeNode[] => {
    return nodes.map((n) => {
      if (n.id === targetId) {
        return { ...n, ...update }
      }
      if (n.children && n.children.length > 0) {
        return { ...n, children: updateTreeNode(n.children, targetId, update) }
      }
      return n
    })
  }

  // Handle database node expand (load schemas/tables, views, etc.)
  const handleDbNodeClick = useCallback(async (dbNode: DbTreeNode) => {
    if (!node.data) return
    const conn = node.data as DatabaseConnection
    const nodeId = dbNode.id
    const isPostgres = conn.dbType === 'postgresql'

    if (expandedDbNodes.has(nodeId)) {
      // Collapse
      setExpandedDbNodes((prev) => {
        const next = new Set(prev)
        next.delete(nodeId)
        return next
      })
      return
    }

    // For database node
    if (dbNode.type === 'database') {
      // If already has children, just expand
      if (dbNode.children && dbNode.children.length > 0) {
        setExpandedDbNodes((prev) => new Set(prev).add(nodeId))
        return
      }

      setLoadingDbNodes((prev) => new Set(prev).add(nodeId))
      try {
        if (isPostgres) {
          // PostgreSQL: reconnect to this database first, then load schemas
          await dbConnect({
            connectionId: conn.id,
            dbType: 'postgresql',
            host: conn.host,
            port: conn.port,
            username: conn.username,
            password: conn.password,
            database: dbNode.name, // Connect to the clicked database
          })

          // Now load schemas for this database
          const schemas = await dbGetSchemas(conn.id, dbNode.name)
          const schemaNodes: DbTreeNode[] = schemas.map((schemaName) => ({
            id: `schema:${conn.id}:${dbNode.name}:${schemaName}`,
            name: schemaName,
            type: 'schema' as const,
            dbName: dbNode.name,
            children: [],
          }))
          setDbTree((prev) => updateTreeNode(prev, nodeId, { children: schemaNodes }))
        } else {
          // MySQL: load categories directly under database
          const counts = await dbGetObjectsCount(conn.id, dbNode.name)
          const categories: DbTreeNode[] = [
            { id: `cat:${conn.id}:${dbNode.name}::tables`, name: t('database.tables'), type: 'category', count: counts.tables, dbName: dbNode.name, children: [] },
            { id: `cat:${conn.id}:${dbNode.name}::views`, name: t('database.views'), type: 'category', count: counts.views, dbName: dbNode.name, children: [] },
            { id: `cat:${conn.id}:${dbNode.name}::functions`, name: t('database.functions'), type: 'category', count: counts.functions, dbName: dbNode.name, children: [] },
            { id: `cat:${conn.id}:${dbNode.name}::procedures`, name: t('database.procedures'), type: 'category', count: counts.procedures, dbName: dbNode.name, children: [] },
          ]
          setDbTree((prev) => updateTreeNode(prev, nodeId, { children: categories }))
        }
      } catch (err) {
        console.error('Failed to load database objects:', err)
      } finally {
        setLoadingDbNodes((prev) => {
          const next = new Set(prev)
          next.delete(nodeId)
          return next
        })
      }
    }

    // For schema node (PostgreSQL only)
    if (dbNode.type === 'schema' && (!dbNode.children || dbNode.children.length === 0)) {
      setLoadingDbNodes((prev) => new Set(prev).add(nodeId))
      try {
        const dbName = dbNode.dbName || ''
        const schemaName = dbNode.name
        const counts = await dbGetObjectsCount(conn.id, dbName, schemaName)
        const categories: DbTreeNode[] = [
          { id: `cat:${conn.id}:${dbName}:${schemaName}:tables`, name: t('database.tables'), type: 'category', count: counts.tables, dbName, schemaName, children: [] },
          { id: `cat:${conn.id}:${dbName}:${schemaName}:views`, name: t('database.views'), type: 'category', count: counts.views, dbName, schemaName, children: [] },
          { id: `cat:${conn.id}:${dbName}:${schemaName}:functions`, name: t('database.functions'), type: 'category', count: counts.functions, dbName, schemaName, children: [] },
          { id: `cat:${conn.id}:${dbName}:${schemaName}:procedures`, name: t('database.procedures'), type: 'category', count: counts.procedures, dbName, schemaName, children: [] },
        ]
        setDbTree((prev) => updateTreeNode(prev, nodeId, { children: categories }))
      } catch (err) {
        console.error('Failed to load schema objects:', err)
      } finally {
        setLoadingDbNodes((prev) => {
          const next = new Set(prev)
          next.delete(nodeId)
          return next
        })
      }
    }

    // For category node, load items
    if (dbNode.type === 'category' && (!dbNode.children || dbNode.children.length === 0)) {
      setLoadingDbNodes((prev) => new Set(prev).add(nodeId))
      try {
        const parts = nodeId.split(':')
        // Format: cat:connId:dbName:schemaName:catType (schemaName may be empty for MySQL)
        const dbName = parts[2]
        const schemaName = parts[3] || undefined
        const catType = parts[4]

        let items: DbTreeNode[] = []
        if (catType === 'tables') {
          const tables = await dbGetTables(conn.id, dbName, schemaName)
          items = tables.map((t) => ({ id: `tbl:${conn.id}:${dbName}:${schemaName || ''}:${t.name}`, name: t.name, type: 'table' as const }))
        } else if (catType === 'views') {
          const views = await dbGetViews(conn.id, dbName, schemaName)
          items = views.map((v) => ({ id: `view:${conn.id}:${dbName}:${schemaName || ''}:${v.name}`, name: v.name, type: 'view' as const }))
        } else if (catType === 'functions' || catType === 'procedures') {
          const routines = await dbGetRoutines(conn.id, dbName, schemaName)
          items = routines
            .filter((r) => (catType === 'functions' ? r.routineType === 'FUNCTION' : r.routineType === 'PROCEDURE'))
            .map((r) => ({ id: `${catType}:${conn.id}:${dbName}:${schemaName || ''}:${r.name}`, name: r.name, type: catType === 'functions' ? 'function' as const : 'procedure' as const }))
        }

        setDbTree((prev) => updateTreeNode(prev, nodeId, { children: items }))
      } catch (err) {
        console.error('Failed to load category items:', err)
      } finally {
        setLoadingDbNodes((prev) => {
          const next = new Set(prev)
          next.delete(nodeId)
          return next
        })
      }
    }

    setExpandedDbNodes((prev) => new Set(prev).add(nodeId))
  }, [node, expandedDbNodes, t])

  // Dialog states for database operations
  const [dropConfirmOpen, setDropConfirmOpen] = useState(false)
  const [dropTableInfo, setDropTableInfo] = useState<{ db: string; table: string; schema?: string } | null>(null)
  const [renameTableDialogOpen, setRenameTableDialogOpen] = useState(false)
  const [renameTableInfo, setRenameTableInfo] = useState<{ db: string; table: string; schema?: string } | null>(null)

  // Copy table name to clipboard
  const handleCopyTableName = (tableName: string) => {
    navigator.clipboard.writeText(tableName)
  }

  // Open new query tab for table with SELECT query
  const handleOpenTableQuery = (dbName: string, tableName: string, schemaName?: string) => {
    if (!node.data) return
    const conn = node.data as DatabaseConnection
    const location = schemaName || dbName
    const tabName = tableName
      ? `${t('database.newQuery')} - ${tableName} [${location}]`
      : `${t('database.newQuery')} [${location}]`
    // Generate SELECT query
    let query = ''
    if (tableName) {
      if (conn.dbType === 'postgresql') {
        // PostgreSQL uses schema.table format
        const schema = schemaName || 'public'
        query = `SELECT * FROM "${schema}"."${tableName}" LIMIT 100;`
      } else {
        // MySQL uses database.table format
        query = `SELECT * FROM \`${dbName}\`.\`${tableName}\` LIMIT 100;`
      }
    }
    const tab = createTabFromConnection(conn.id, tabName, ModuleType.Database, 'database', 'connected')
    tab.data = { ...tab.data, initialSql: query, database: dbName, schemaName }
    addTab(tab)
  }

  // View table DDL
  const handleViewTableDdl = async (dbName: string, tableName: string, schemaName?: string) => {
    if (!node.data) return
    const conn = node.data as DatabaseConnection
    const location = schemaName || dbName
    try {
      const ddl = await dbGetTableDdl(conn.id, dbName, tableName)
      const tab = createTabFromConnection(conn.id, `${t('database.viewDDL')} - ${tableName} [${location}]`, ModuleType.Database, 'database', 'connected')
      tab.data = { ...tab.data, initialSql: ddl, database: dbName, schemaName }
      addTab(tab)
    } catch (err) {
      console.error('Get DDL error:', err)
    }
  }

  // Edit table data - open DataEditor
  const handleEditTableData = (dbName: string, tableName: string, schemaName?: string) => {
    if (!node.data) return
    const conn = node.data as DatabaseConnection
    const location = schemaName || dbName
    const tab = createTabFromConnection(conn.id, `${t('database.editData')} - ${tableName} [${location}]`, ModuleType.Database, 'database', 'connected')
    tab.data = { ...tab.data, editMode: true, database: dbName, tableName, schemaName }
    addTab(tab)
  }

  // Open drop table confirmation
  const handleDropTableClick = (dbName: string, tableName: string, schema?: string) => {
    setDropTableInfo({ db: dbName, table: tableName, schema })
    setDropConfirmOpen(true)
  }

  // Confirm drop table
  const handleConfirmDropTable = async () => {
    if (!node.data || !dropTableInfo) return
    const conn = node.data as DatabaseConnection
    try {
      await dbDropTable(conn.id, dropTableInfo.db, dropTableInfo.table)
      setDropConfirmOpen(false)
      setDropTableInfo(null)
      // Refresh database tree
      handleDbConnectionClick()
    } catch (err) {
      console.error('Drop table error:', err)
      alert(`Failed to drop table: ${err}`)
    }
  }

  // Open rename table dialog
  const handleRenameTableClick = (dbName: string, tableName: string, schema?: string) => {
    setRenameTableInfo({ db: dbName, table: tableName, schema })
    setRenameTableDialogOpen(true)
  }

  // Confirm rename table
  const handleConfirmRenameTable = async (newName: string) => {
    if (!node.data || !renameTableInfo) return
    const conn = node.data as DatabaseConnection
    try {
      await dbRenameTable(conn.id, renameTableInfo.db, renameTableInfo.table, newName)
      setRenameTableDialogOpen(false)
      setRenameTableInfo(null)
      // Refresh database tree
      handleDbConnectionClick()
    } catch (err) {
      console.error('Rename table error:', err)
      alert(`Failed to rename table: ${err}`)
    }
  }

  // Create table - open tab with createTable flag
  const handleCreateTable = (dbName: string, schemaName?: string) => {
    if (!node.data) return
    const conn = node.data as DatabaseConnection
    const location = schemaName || dbName
    const tab = createTabFromConnection(conn.id, `${t('database.createTable')} [${location}]`, ModuleType.Database, 'database', 'connected')
    tab.data = { ...tab.data, createTable: true, database: dbName, schemaName }
    addTab(tab)
  }

  // Edit table structure - open tab with editStructure flag
  const handleEditTableStructure = (dbName: string, tableName: string, schemaName?: string) => {
    if (!node.data) return
    const conn = node.data as DatabaseConnection
    const location = schemaName || dbName
    const tab = createTabFromConnection(conn.id, `${t('database.editTableStructure')} - ${tableName} [${location}]`, ModuleType.Database, 'database', 'connected')
    tab.data = { ...tab.data, editStructure: true, database: dbName, tableName, schemaName }
    addTab(tab)
  }

  // Render database tree node
  const renderDbTreeNode = (dbNode: DbTreeNode, depth: number) => {
    const isExpanded = expandedDbNodes.has(dbNode.id)
    const isLoading = loadingDbNodes.has(dbNode.id)
    const hasChildren = dbNode.type === 'database' || dbNode.type === 'schema' || dbNode.type === 'category'

    const getDbNodeIcon = () => {
      switch (dbNode.type) {
        case 'database': return Database
        case 'schema': return Folder
        case 'category':
          if (dbNode.id.includes(':tables')) return Table2
          if (dbNode.id.includes(':views')) return Eye
          return FunctionSquare
        case 'table': return Table2
        case 'view': return Eye
        default: return FunctionSquare
      }
    }
    const DbIcon = getDbNodeIcon()

    const getIconColor = () => {
      switch (dbNode.type) {
        case 'database': return 'text-yellow-500'
        case 'schema': return 'text-orange-400'
        case 'table': return 'text-blue-500'
        case 'view': return 'text-cyan-500'
        default: return 'text-purple-500'
      }
    }

    const nodeContent = (
      <div
        className="tree-item group"
        style={{ paddingLeft: `${(level + depth + 1) * 12}px` }}
        onClick={() => hasChildren && handleDbNodeClick(dbNode)}
      >
        {hasChildren && (
          <span className="w-4 h-4 flex items-center justify-center flex-shrink-0">
            {isLoading ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : isExpanded ? (
              <ChevronDown className="w-3 h-3" />
            ) : (
              <ChevronRight className="w-3 h-3" />
            )}
          </span>
        )}
        {!hasChildren && <span className="w-4" />}
        <DbIcon className={cn('w-4 h-4 mr-1.5 flex-shrink-0', getIconColor())} />
        <span className="flex-1 text-sm truncate">{dbNode.name}</span>
        {dbNode.count !== undefined && (
          <span className="text-xs text-dark-text-secondary mr-2">({dbNode.count})</span>
        )}
      </div>
    )

    // Table node with context menu
    if (dbNode.type === 'table') {
      const parts = dbNode.id.split(':')
      const dbName = parts[2]
      const schemaName = parts[3] || undefined
      return (
        <div key={dbNode.id}>
          <ContextMenu.Root>
            <ContextMenu.Trigger asChild>{nodeContent}</ContextMenu.Trigger>
            <ContextMenu.Portal>
              <ContextMenu.Content className="context-menu min-w-[180px] rounded-md shadow-lg py-1 z-50">
                <ContextMenu.Item
                  className="context-menu-item flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer outline-none"
                  onSelect={() => handleOpenTableQuery(dbName, dbNode.name, schemaName)}
                >
                  <FileText className="w-4 h-4" />
                  {t('database.newQuery')}
                </ContextMenu.Item>
                <ContextMenu.Item
                  className="context-menu-item flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer outline-none"
                  onSelect={() => handleEditTableData(dbName, dbNode.name, schemaName)}
                >
                  <Edit3 className="w-4 h-4" />
                  {t('database.editData')}
                </ContextMenu.Item>
                <ContextMenu.Separator className="context-menu-separator h-px my-1" />
                <ContextMenu.Item
                  className="context-menu-item flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer outline-none"
                  onSelect={() => handleViewTableDdl(dbName, dbNode.name, schemaName)}
                >
                  <FileCode className="w-4 h-4" />
                  {t('database.viewDDL')}
                </ContextMenu.Item>
                <ContextMenu.Separator className="context-menu-separator h-px my-1" />
                <ContextMenu.Item
                  className="context-menu-item flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer outline-none"
                  onSelect={() => handleCreateTable(dbName, schemaName)}
                >
                  <Plus className="w-4 h-4" />
                  {t('database.createTable')}
                </ContextMenu.Item>
                <ContextMenu.Item
                  className="context-menu-item flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer outline-none"
                  onSelect={() => handleEditTableStructure(dbName, dbNode.name, schemaName)}
                >
                  <Settings2 className="w-4 h-4" />
                  {t('database.editTableStructure')}
                </ContextMenu.Item>
                <ContextMenu.Item
                  className="context-menu-item flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer outline-none"
                  onSelect={() => handleRenameTableClick(dbName, dbNode.name, schemaName)}
                >
                  <Pencil className="w-4 h-4" />
                  {t('database.renameTable')}
                </ContextMenu.Item>
                <ContextMenu.Separator className="context-menu-separator h-px my-1" />
                <ContextMenu.Item
                  className="context-menu-item flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer outline-none"
                  onSelect={() => handleCopyTableName(dbNode.name)}
                >
                  <Copy className="w-4 h-4" />
                  {t('database.copyTableName')}
                </ContextMenu.Item>
                <ContextMenu.Separator className="context-menu-separator h-px my-1" />
                <ContextMenu.Item
                  className="context-menu-item flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer outline-none text-status-error"
                  onSelect={() => handleDropTableClick(dbName, dbNode.name, schemaName)}
                >
                  <Trash2 className="w-4 h-4" />
                  {t('database.dropTable')}
                </ContextMenu.Item>
              </ContextMenu.Content>
            </ContextMenu.Portal>
          </ContextMenu.Root>
          {isExpanded && dbNode.children && dbNode.children.map((child) => renderDbTreeNode(child, depth + 1))}
        </div>
      )
    }

    // Category node (tables) with context menu
    if (dbNode.type === 'category' && dbNode.id.includes(':tables')) {
      const parts = dbNode.id.split(':')
      // Format: cat:connId:dbName:schemaName:catType
      const catDbName = parts[2]
      const catSchemaName = parts[3] || undefined
      return (
        <div key={dbNode.id}>
          <ContextMenu.Root>
            <ContextMenu.Trigger asChild>{nodeContent}</ContextMenu.Trigger>
            <ContextMenu.Portal>
              <ContextMenu.Content className="context-menu min-w-[180px] rounded-md shadow-lg py-1 z-50">
                <ContextMenu.Item
                  className="context-menu-item flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer outline-none"
                  onSelect={() => handleOpenTableQuery(catDbName, '', catSchemaName)}
                >
                  <FileText className="w-4 h-4" />
                  {t('database.newQuery')}
                </ContextMenu.Item>
                <ContextMenu.Item
                  className="context-menu-item flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer outline-none"
                  onSelect={() => handleCreateTable(catDbName, catSchemaName)}
                >
                  <Plus className="w-4 h-4" />
                  {t('database.createTable')}
                </ContextMenu.Item>
              </ContextMenu.Content>
            </ContextMenu.Portal>
          </ContextMenu.Root>
          {isExpanded && dbNode.children && dbNode.children.map((child) => renderDbTreeNode(child, depth + 1))}
        </div>
      )
    }

    return (
      <div key={dbNode.id}>
        {nodeContent}
        {isExpanded && dbNode.children && dbNode.children.map((child) => renderDbTreeNode(child, depth + 1))}
      </div>
    )
  }

  return (
    <>
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>
        <div
          className="tree-item group"
          style={{ paddingLeft: `${paddingLeft}px` }}
          onClick={() => {
            if (isFolder) {
              onToggleExpand()
            } else if (isDatabaseConnection) {
              handleDbConnectionClick()
            }
          }}
          onDoubleClick={() => {
            if (isConnection && !isDatabaseConnection) {
              onConnect()
            }
          }}
        >
          {/* 展开/折叠图标 */}
          {(isFolder || isDatabaseConnection) && (
            <span className="w-4 h-4 flex items-center justify-center flex-shrink-0">
              {dbLoading ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (isFolder ? node.expanded : dbExpanded) ? (
                <ChevronDown className="w-3 h-3" />
              ) : (
                <ChevronRight className="w-3 h-3" />
              )}
            </span>
          )}

          {/* 连接状态点 */}
          {isConnection && !isDatabaseConnection && (
            <span
              className={cn(
                'status-dot mr-1.5 flex-shrink-0',
                statusColors[node.status || 'disconnected']
              )}
            />
          )}

          {/* 图标 */}
          <Icon className={cn('w-4 h-4 flex-shrink-0', isDatabaseConnection ? 'mr-1' : 'mr-1.5 text-dark-text-secondary')} />

          {/* 数据库连接状态点 (在图标后面) */}
          {isDatabaseConnection && (
            <span
              className={cn(
                'status-dot mr-1.5 flex-shrink-0',
                statusColors[node.status || 'disconnected']
              )}
            />
          )}

          {/* 名称 */}
          <span className="flex-1 text-sm truncate">{node.name}</span>

          {/* 数据库连接刷新按钮 */}
          {isDatabaseConnection && dbExpanded && (
            <button
              onClick={async (e) => {
                e.stopPropagation()
                if (!node.data) return
                const conn = node.data as DatabaseConnection
                setDbLoading(true)
                try {
                  let dbs: string[]
                  if (conn.dbType === 'postgresql') {
                    dbs = await dbGetSchemas(conn.id)
                  } else {
                    dbs = await dbGetDatabases(conn.id)
                  }
                  const tree: DbTreeNode[] = dbs.map((dbName) => ({
                    id: `db:${conn.id}:${dbName}`,
                    name: dbName,
                    type: 'database' as const,
                    children: [],
                  }))
                  setDbTree(tree)
                  setExpandedDbNodes(new Set())
                } catch (err) {
                  console.error('Failed to refresh databases:', err)
                } finally {
                  setDbLoading(false)
                }
              }}
              className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-dark-bg-hover rounded flex-shrink-0"
              title={t('common.refresh')}
            >
              <RefreshCw className={cn('w-3 h-3', dbLoading && 'animate-spin')} />
            </button>
          )}

          {/* 悬浮操作按钮 - 下拉菜单支持新建连接和子目录 */}
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
                  {/* 仅在未达到最大层级时显示新建子目录 */}
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

      {/* 右键菜单 */}
      <ContextMenu.Portal>
        <ContextMenu.Content className="context-menu min-w-[180px] rounded-md shadow-lg py-1 z-50">
          {isConnection && (
            <>
              <ContextMenu.Item
                className="context-menu-item flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer outline-none"
                onSelect={onConnect}
              >
                <Link className="w-4 h-4" />
                {t('sidebar.connect')}
              </ContextMenu.Item>
              <ContextMenu.Item
                className="context-menu-item flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer outline-none"
                onSelect={() => {
                  if (isDatabaseConnection) {
                    setDbExpanded(false)
                    setDbTree([])
                    setExpandedDbNodes(new Set())
                    setConnectionStatus(node.id, 'disconnected')
                  }
                  onDisconnect()
                }}
              >
                <Link2Off className="w-4 h-4" />
                {t('sidebar.disconnect')}
              </ContextMenu.Item>
              <ContextMenu.Separator className="context-menu-separator h-px my-1" />
              <ContextMenu.Item
                className="context-menu-item flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer outline-none"
                onSelect={onEdit}
              >
                <Edit className="w-4 h-4" />
                {t('sidebar.edit')}
              </ContextMenu.Item>
              <ContextMenu.Separator className="context-menu-separator h-px my-1" />
            </>
          )}

          {isFolder && (
            <>
              <ContextMenu.Item
                className="context-menu-item flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer outline-none"
                onSelect={onCreateConnection}
              >
                <Plus className="w-4 h-4" />
                {t('sidebar.newConnection')}
              </ContextMenu.Item>
              {/* 仅在未达到最大层级时显示新建子文件夹选项 */}
              {folderDepth < MAX_FOLDER_DEPTH && (
                <ContextMenu.Item
                  className="context-menu-item flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer outline-none"
                  onSelect={() => setSubfolderDialogOpen(true)}
                >
                  <FolderPlus className="w-4 h-4" />
                  {t('sidebar.newSubfolder')}
                </ContextMenu.Item>
              )}
              <ContextMenu.Separator className="context-menu-separator h-px my-1" />
              <ContextMenu.Item
                className="context-menu-item flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer outline-none"
                onSelect={onExpandAll}
              >
                <ChevronsDown className="w-4 h-4" />
                {t('sidebar.expandAll')}
              </ContextMenu.Item>
              <ContextMenu.Item
                className="context-menu-item flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer outline-none"
                onSelect={onCollapseAll}
              >
                <ChevronsUp className="w-4 h-4" />
                {t('sidebar.collapseAll')}
              </ContextMenu.Item>
              <ContextMenu.Separator className="context-menu-separator h-px my-1" />
            </>
          )}

          <ContextMenu.Item
            className="context-menu-item flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer outline-none"
            onSelect={() => setRenameDialogOpen(true)}
          >
            <Edit className="w-4 h-4" />
            {t('sidebar.rename')}
          </ContextMenu.Item>

          {isConnection && (
            <ContextMenu.Item
              className="context-menu-item flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer outline-none"
              onSelect={onCopy}
            >
              <Copy className="w-4 h-4" />
              {t('sidebar.copy')}
            </ContextMenu.Item>
          )}

          <ContextMenu.Item
            className="context-menu-item flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer outline-none text-status-error"
            onSelect={() => setDeleteDialogOpen(true)}
          >
            <Trash2 className="w-4 h-4" />
            {t('sidebar.delete')}
          </ContextMenu.Item>

          {isConnection && (
            <>
              <ContextMenu.Separator className="context-menu-separator h-px my-1" />
              <ContextMenu.Item
                className="context-menu-item flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer outline-none"
                onSelect={onMoveTo}
              >
                <Move className="w-4 h-4" />
                {t('sidebar.moveTo')}
              </ContextMenu.Item>
              <ContextMenu.Item
                className="context-menu-item flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer outline-none"
                onSelect={onOpenInNewWindow}
              >
                <ExternalLink className="w-4 h-4" />
                {t('sidebar.openInNewWindow')}
              </ContextMenu.Item>
            </>
          )}
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>

    {/* 删除确认对话框 */}
    <ConfirmDialog
      open={deleteDialogOpen}
      onOpenChange={setDeleteDialogOpen}
      title={isFolder ? t('sidebar.deleteFolder') : t('sidebar.deleteConnection')}
      description={isFolder ? t('sidebar.confirmDeleteFolder') : t('sidebar.confirmDeleteConnection')}
      variant="danger"
      confirmText={t('common.delete')}
      onConfirm={onDelete}
    />

    {/* 重命名对话框 */}
    <InputDialog
      open={renameDialogOpen}
      onOpenChange={setRenameDialogOpen}
      title={t('sidebar.rename')}
      placeholder={t('sidebar.enterNewName')}
      defaultValue={node.name}
      onConfirm={onRename}
    />

    {/* 新建子文件夹对话框 */}
    {isFolder && (
      <InputDialog
        open={subfolderDialogOpen}
        onOpenChange={setSubfolderDialogOpen}
        title={t('sidebar.newSubfolder')}
        placeholder={t('sidebar.enterFolderName')}
        onConfirm={onCreateSubfolder}
      />
    )}

    {/* 子节点 - 必须放在 ContextMenu.Root 外部 */}
    {isFolder && node.expanded && node.children && node.children.length > 0 && (
      <ConnectionTree
        nodes={node.children}
        moduleType={moduleType}
        level={level + 1}
        searchQuery={searchQuery}
        onEditConnection={onEditConnection}
        onCreateConnection={onCreateConnectionInFolder}
      />
    )}

    {/* 数据库树节点 */}
    {isDatabaseConnection && dbExpanded && dbTree.length > 0 && (
      <div>
        {dbTree.map((dbNode) => renderDbTreeNode(dbNode, 1))}
      </div>
    )}

    {/* 删除表确认对话框 */}
    <ConfirmDialog
      open={dropConfirmOpen}
      onOpenChange={setDropConfirmOpen}
      title={t('database.dropTable')}
      description={t('database.dropTableConfirm', { table: dropTableInfo?.table || '' })}
      variant="danger"
      confirmText={t('database.drop')}
      onConfirm={handleConfirmDropTable}
    />

    {/* 重命名表对话框 */}
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
