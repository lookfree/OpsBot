/**
 * Database Tree Node Component
 * Renders database tree nodes with context menus
 */

import { useTranslation } from 'react-i18next'
import * as ContextMenu from '@radix-ui/react-context-menu'
import {
  Database,
  Folder,
  Table2,
  Eye,
  FunctionSquare,
  ChevronDown,
  ChevronRight,
  Loader2,
  FileText,
  FileCode,
  Plus,
  Settings2,
  Pencil,
  Copy,
  Trash2,
  Zap,
  Workflow,
  Globe,
  Edit3,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { DbTreeNode, DbTreeNodeRenderProps } from './types'

interface DatabaseTreeNodeProps extends DbTreeNodeRenderProps {
  renderChildren: (dbNode: DbTreeNode, depth: number) => React.ReactNode
}

/**
 * Get icon for database node type
 */
function getDbNodeIcon(dbNode: DbTreeNode) {
  switch (dbNode.type) {
    case 'database': return Database
    case 'schema': return Folder
    case 'category':
      if (dbNode.id.includes(':tables')) return Table2
      if (dbNode.id.includes(':views')) return Eye
      return FunctionSquare
    case 'table':
      if (dbNode.engine === 'Distributed') return Globe
      return Table2
    case 'view': return Eye
    default: return FunctionSquare
  }
}

/**
 * Get icon color for database node type
 */
function getIconColor(dbNode: DbTreeNode): string {
  switch (dbNode.type) {
    case 'database': return 'text-yellow-500'
    case 'schema': return 'text-orange-400'
    case 'table':
      if (dbNode.engine === 'Distributed') return 'text-green-500'
      return 'text-blue-500'
    case 'view': return 'text-cyan-500'
    default: return 'text-purple-500'
  }
}

export function DatabaseTreeNode({
  dbNode,
  depth,
  level,
  connectionId: _connectionId,
  dbType,
  expandedDbNodes,
  loadingDbNodes,
  onNodeClick,
  onOpenTableQuery,
  onEditTableData,
  onViewTableDdl,
  onCreateTable,
  onEditTableStructure,
  onRenameTable,
  onDropTable,
  onCopyTableName,
  onOptimizeTable,
  onOpenERDesigner,
  renderChildren,
}: DatabaseTreeNodeProps) {
  const { t } = useTranslation()
  const isExpanded = dbNode.expanded === true || expandedDbNodes.has(dbNode.id)
  const isLoading = loadingDbNodes.has(dbNode.id)
  const hasChildren = dbNode.type === 'database' || dbNode.type === 'schema' || dbNode.type === 'category'
  const isClickHouse = dbType === 'clickhouse'

  const DbIcon = getDbNodeIcon(dbNode)
  const iconColor = getIconColor(dbNode)

  const nodeContent = (
    <div
      className="tree-item group"
      style={{ paddingLeft: `${(level + depth + 1) * 12}px` }}
      onClick={(e) => { e.stopPropagation(); hasChildren && onNodeClick(dbNode) }}
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
      <DbIcon className={cn('w-4 h-4 mr-1.5 flex-shrink-0', iconColor)} />
      <span className="flex-1 text-sm truncate">{dbNode.name}</span>
      {dbNode.count !== undefined && (
        <span className="text-xs text-dark-text-secondary mr-2">({dbNode.count})</span>
      )}
    </div>
  )

  // Parse node ID to get database and schema info
  const parts = dbNode.id.split(':')
  const dbName = parts[2]
  const schemaName = parts[3] || undefined

  // Table node with context menu
  if (dbNode.type === 'table') {
    return (
      <div key={dbNode.id}>
        <ContextMenu.Root>
          <ContextMenu.Trigger asChild>{nodeContent}</ContextMenu.Trigger>
          <ContextMenu.Portal>
            <ContextMenu.Content className="context-menu min-w-[180px] rounded-md shadow-lg py-1 z-50">
              <ContextMenu.Item
                className="context-menu-item flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer outline-none"
                onSelect={() => onOpenTableQuery(dbName, dbNode.name, schemaName)}
              >
                <FileText className="w-4 h-4" />
                {t('database.newQuery')}
              </ContextMenu.Item>
              <ContextMenu.Item
                className="context-menu-item flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer outline-none"
                onSelect={() => onEditTableData(dbName, dbNode.name, schemaName)}
              >
                <Edit3 className="w-4 h-4" />
                {t('database.editData')}
              </ContextMenu.Item>
              <ContextMenu.Separator className="context-menu-separator h-px my-1" />
              <ContextMenu.Item
                className="context-menu-item flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer outline-none"
                onSelect={() => onViewTableDdl(dbName, dbNode.name, schemaName)}
              >
                <FileCode className="w-4 h-4" />
                {t('database.viewDDL')}
              </ContextMenu.Item>
              {isClickHouse && (
                <>
                  <ContextMenu.Separator className="context-menu-separator h-px my-1" />
                  <ContextMenu.Item
                    className="context-menu-item flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer outline-none"
                    onSelect={() => onOptimizeTable(dbName, dbNode.name, schemaName)}
                  >
                    <Zap className="w-4 h-4" />
                    {t('database.optimizeTable', 'Optimize Table')}
                  </ContextMenu.Item>
                </>
              )}
              <ContextMenu.Separator className="context-menu-separator h-px my-1" />
              <ContextMenu.Item
                className="context-menu-item flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer outline-none"
                onSelect={() => onCreateTable(dbName, schemaName)}
              >
                <Plus className="w-4 h-4" />
                {t('database.createTable')}
              </ContextMenu.Item>
              <ContextMenu.Item
                className="context-menu-item flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer outline-none"
                onSelect={() => onEditTableStructure(dbName, dbNode.name, schemaName)}
              >
                <Settings2 className="w-4 h-4" />
                {t('database.editTableStructure')}
              </ContextMenu.Item>
              <ContextMenu.Item
                className="context-menu-item flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer outline-none"
                onSelect={() => onRenameTable(dbName, dbNode.name, schemaName)}
              >
                <Pencil className="w-4 h-4" />
                {t('database.renameTable')}
              </ContextMenu.Item>
              <ContextMenu.Separator className="context-menu-separator h-px my-1" />
              <ContextMenu.Item
                className="context-menu-item flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer outline-none"
                onSelect={() => onCopyTableName(dbNode.name)}
              >
                <Copy className="w-4 h-4" />
                {t('database.copyTableName')}
              </ContextMenu.Item>
              <ContextMenu.Separator className="context-menu-separator h-px my-1" />
              <ContextMenu.Item
                className="context-menu-item flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer outline-none text-status-error"
                onSelect={() => onDropTable(dbName, dbNode.name, schemaName)}
              >
                <Trash2 className="w-4 h-4" />
                {t('database.dropTable')}
              </ContextMenu.Item>
            </ContextMenu.Content>
          </ContextMenu.Portal>
        </ContextMenu.Root>
        {isExpanded && dbNode.children && renderChildren(dbNode, depth)}
      </div>
    )
  }

  // Category node (tables) with context menu
  if (dbNode.type === 'category' && dbNode.id.includes(':tables')) {
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
                onSelect={() => onOpenTableQuery(catDbName, '', catSchemaName)}
              >
                <FileText className="w-4 h-4" />
                {t('database.newQuery')}
              </ContextMenu.Item>
              <ContextMenu.Item
                className="context-menu-item flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer outline-none"
                onSelect={() => onCreateTable(catDbName, catSchemaName)}
              >
                <Plus className="w-4 h-4" />
                {t('database.createTable')}
              </ContextMenu.Item>
            </ContextMenu.Content>
          </ContextMenu.Portal>
        </ContextMenu.Root>
        {isExpanded && dbNode.children && renderChildren(dbNode, depth)}
      </div>
    )
  }

  // Database node with context menu
  if (dbNode.type === 'database') {
    return (
      <div key={dbNode.id}>
        <ContextMenu.Root>
          <ContextMenu.Trigger asChild>{nodeContent}</ContextMenu.Trigger>
          <ContextMenu.Portal>
            <ContextMenu.Content className="context-menu min-w-[180px] rounded-md shadow-lg py-1 z-50">
              <ContextMenu.Item
                className="context-menu-item flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer outline-none"
                onSelect={() => onOpenTableQuery(dbName, '')}
              >
                <FileText className="w-4 h-4" />
                {t('database.newQuery')}
              </ContextMenu.Item>
              <ContextMenu.Item
                className="context-menu-item flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer outline-none"
                onSelect={() => onCreateTable(dbName)}
              >
                <Plus className="w-4 h-4" />
                {t('database.createTable')}
              </ContextMenu.Item>
              <ContextMenu.Separator className="context-menu-separator h-px my-1" />
              <ContextMenu.Item
                className="context-menu-item flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer outline-none"
                onSelect={() => onOpenERDesigner(dbName)}
              >
                <Workflow className="w-4 h-4" />
                {t('database.erDesigner.title')}
              </ContextMenu.Item>
            </ContextMenu.Content>
          </ContextMenu.Portal>
        </ContextMenu.Root>
        {isExpanded && dbNode.children && renderChildren(dbNode, depth)}
      </div>
    )
  }

  // Schema node with context menu (PostgreSQL)
  if (dbNode.type === 'schema') {
    return (
      <div key={dbNode.id}>
        <ContextMenu.Root>
          <ContextMenu.Trigger asChild>{nodeContent}</ContextMenu.Trigger>
          <ContextMenu.Portal>
            <ContextMenu.Content className="context-menu min-w-[180px] rounded-md shadow-lg py-1 z-50">
              <ContextMenu.Item
                className="context-menu-item flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer outline-none"
                onSelect={() => onOpenTableQuery(dbName, '', schemaName)}
              >
                <FileText className="w-4 h-4" />
                {t('database.newQuery')}
              </ContextMenu.Item>
              <ContextMenu.Item
                className="context-menu-item flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer outline-none"
                onSelect={() => onCreateTable(dbName, schemaName)}
              >
                <Plus className="w-4 h-4" />
                {t('database.createTable')}
              </ContextMenu.Item>
              <ContextMenu.Separator className="context-menu-separator h-px my-1" />
              <ContextMenu.Item
                className="context-menu-item flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer outline-none"
                onSelect={() => onOpenERDesigner(dbName, schemaName)}
              >
                <Workflow className="w-4 h-4" />
                {t('database.erDesigner.title')}
              </ContextMenu.Item>
            </ContextMenu.Content>
          </ContextMenu.Portal>
        </ContextMenu.Root>
        {isExpanded && dbNode.children && renderChildren(dbNode, depth)}
      </div>
    )
  }

  // Default node (views, functions, procedures, category without tables)
  return (
    <div key={dbNode.id}>
      {nodeContent}
      {isExpanded && dbNode.children && renderChildren(dbNode, depth)}
    </div>
  )
}
