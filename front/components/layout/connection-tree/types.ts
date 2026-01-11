/**
 * Connection Tree Types
 */

import { ModuleType, TreeNode } from '@/types'

// Database tree node type
export interface DbTreeNode {
  id: string
  name: string
  type: 'database' | 'schema' | 'category' | 'table' | 'view' | 'function' | 'procedure'
  count?: number
  children?: DbTreeNode[]
  loading?: boolean
  dbName?: string  // For schema/category nodes to track parent database
  schemaName?: string  // For category nodes in PostgreSQL
  engine?: string  // For ClickHouse tables to distinguish local vs distributed
}

// Database table action type
export type DbTableAction = 'editData' | 'viewDDL' | 'createTable' | 'editStructure' | 'rename' | 'drop'

// Global drag state for cross-component communication (mouse-based drag)
export interface DragState {
  connectionId: string | null
  moduleType: ModuleType | null
  isDragging: boolean
  startX: number
  startY: number
}

// Event callback type for drop targets
export type DropTargetCallback = (folderId: string | null, isOver: boolean) => void

// ConnectionTree component props
export interface ConnectionTreeProps {
  nodes: TreeNode[]
  moduleType: ModuleType
  level: number
  searchQuery?: string
  onEditConnection?: (connection: any) => void
  onCreateConnection?: (folderId: string | null) => void
}

// TreeNodeItem component props
export interface TreeNodeItemProps {
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
  onMoveTo: (targetFolderId: string | null) => void
  onOpenInNewWindow: () => void
  onDbTableAction?: (action: DbTableAction, dbName: string, tableName: string, schemaName?: string) => void
  onDropConnection?: (connectionId: string, targetFolderId: string | null) => void
  availableFolders?: { id: string; name: string }[]
}

// Database tree node rendering props
export interface DbTreeNodeRenderProps {
  dbNode: DbTreeNode
  depth: number
  level: number
  connectionId: string
  dbType: string
  expandedDbNodes: Set<string>
  loadingDbNodes: Set<string>
  onNodeClick: (dbNode: DbTreeNode) => void
  onOpenTableQuery: (dbName: string, tableName: string, schemaName?: string) => void
  onEditTableData: (dbName: string, tableName: string, schemaName?: string) => void
  onViewTableDdl: (dbName: string, tableName: string, schemaName?: string) => void
  onCreateTable: (dbName: string, schemaName?: string) => void
  onEditTableStructure: (dbName: string, tableName: string, schemaName?: string) => void
  onRenameTable: (dbName: string, tableName: string, schema?: string) => void
  onDropTable: (dbName: string, tableName: string, schema?: string) => void
  onCopyTableName: (tableName: string) => void
  onOptimizeTable: (dbName: string, tableName: string, schemaName?: string) => void
  onOpenERDesigner: (dbName: string, schemaName?: string) => void
}
