/**
 * Schema Tree Component
 *
 * Displays database schema tree with databases, tables, views, functions, procedures.
 */

import { useTranslation } from 'react-i18next'
import {
  Database,
  Table2,
  Columns3,
  Key,
  ChevronRight,
  ChevronDown,
  RefreshCw,
  Loader2,
  Eye,
  FunctionSquare,
  Copy,
  FileCode,
  FileText,
  Plus,
  Pencil,
  Trash2,
  Settings2,
  Edit3,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import type { SchemaNode, ThemeStyles } from './types'

interface SchemaTreeProps {
  schemaTree: SchemaNode[]
  expandedNodes: Set<string>
  selectedNode: SchemaNode | null
  loadingNodes: Set<string>
  styles: ThemeStyles
  onNodeClick: (node: SchemaNode) => void
  onRefresh: () => void
  onNewQuery: (dbName: string) => void
  onViewTableData: (dbName: string, tableName: string) => void
  onEditTableData: (dbName: string, tableName: string) => void
  onViewTableDdl: (dbName: string, tableName: string) => void
  onCopyTableName: (tableName: string) => void
  onCreateTable: (dbName: string) => void
  onEditTableStructure: (dbName: string, tableName: string) => void
  onRenameTable: (dbName: string, tableName: string) => void
  onDropTable: (dbName: string, tableName: string) => void
}

export function SchemaTree({
  schemaTree,
  expandedNodes,
  selectedNode,
  loadingNodes,
  styles,
  onNodeClick,
  onRefresh,
  onNewQuery,
  onViewTableData,
  onEditTableData,
  onViewTableDdl,
  onCopyTableName,
  onCreateTable,
  onEditTableStructure,
  onRenameTable,
  onDropTable,
}: SchemaTreeProps) {
  const { t } = useTranslation()
  const { bgSecondary, borderColor, textPrimary, textSecondary, hoverBg, isDark } = styles

  const renderNodeIcon = (node: SchemaNode) => {
    const iconClass = 'w-4 h-4'
    switch (node.type) {
      case 'database':
        return <Database className={cn(iconClass, 'text-yellow-500')} />
      case 'category':
        if (node.categoryType === 'tables') {
          return <Table2 className={cn(iconClass, 'text-blue-500')} />
        } else if (node.categoryType === 'views') {
          return <Eye className={cn(iconClass, 'text-cyan-500')} />
        } else {
          return <FunctionSquare className={cn(iconClass, 'text-purple-500')} />
        }
      case 'table':
        return <Table2 className={cn(iconClass, 'text-blue-500')} />
      case 'view':
        return <Eye className={cn(iconClass, 'text-cyan-500')} />
      case 'function':
      case 'procedure':
        return <FunctionSquare className={cn(iconClass, 'text-purple-500')} />
      case 'column':
        return <Columns3 className={cn(iconClass, 'text-green-500')} />
      case 'index':
        return <Key className={cn(iconClass, 'text-orange-500')} />
      default:
        return null
    }
  }

  const renderNode = (node: SchemaNode, level: number = 0) => {
    const isExpanded = expandedNodes.has(node.id)
    const isLoading = loadingNodes.has(node.id)
    const hasChildren = node.type === 'database' || node.type === 'category' || node.type === 'table'
    const isSelected = selectedNode?.id === node.id

    const nodeContent = (
      <div
        className={cn(
          'flex items-center gap-1 px-2 py-1 cursor-pointer rounded text-sm',
          hoverBg,
          isSelected && (isDark ? 'bg-dark-bg-hover' : 'bg-light-bg-hover')
        )}
        style={{ paddingLeft: `${level * 16 + 8}px` }}
        onClick={() => onNodeClick(node)}
      >
        {hasChildren && (
          <span className="w-4 h-4 flex items-center justify-center">
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
        {renderNodeIcon(node)}
        <span className={cn('truncate', textPrimary)}>{node.name}</span>
        {node.type === 'category' && node.count !== undefined && (
          <span className={cn('ml-1 text-xs', textSecondary)}>({node.count})</span>
        )}
      </div>
    )

    // Tables category context menu
    if (node.type === 'category' && node.categoryType === 'tables' && node.dbName) {
      return (
        <div key={node.id}>
          <ContextMenu>
            <ContextMenuTrigger>{nodeContent}</ContextMenuTrigger>
            <ContextMenuContent>
              <ContextMenuItem onSelect={() => onNewQuery(node.dbName!)}>
                <FileText className="w-4 h-4 mr-2" />
                {t('database.newQuery')}
              </ContextMenuItem>
              <ContextMenuItem onSelect={() => onCreateTable(node.dbName!)}>
                <Plus className="w-4 h-4 mr-2" />
                {t('database.createTable')}
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
          {isExpanded && node.children && (
            <div>{node.children.map((child) => renderNode(child, level + 1))}</div>
          )}
        </div>
      )
    }

    // Table node context menu
    if (node.type === 'table' && node.dbName) {
      return (
        <div key={node.id}>
          <ContextMenu>
            <ContextMenuTrigger>{nodeContent}</ContextMenuTrigger>
            <ContextMenuContent>
              <ContextMenuItem onSelect={() => onViewTableData(node.dbName!, node.name)}>
                <FileText className="w-4 h-4 mr-2" />
                {t('database.newQuery')}
              </ContextMenuItem>
              <ContextMenuItem onSelect={() => onEditTableData(node.dbName!, node.name)}>
                <Edit3 className="w-4 h-4 mr-2" />
                {t('database.editData')}
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem onSelect={() => onViewTableDdl(node.dbName!, node.name)}>
                <FileCode className="w-4 h-4 mr-2" />
                {t('database.viewDDL')}
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem onSelect={() => onCreateTable(node.dbName!)}>
                <Plus className="w-4 h-4 mr-2" />
                {t('database.createTable')}
              </ContextMenuItem>
              <ContextMenuItem onSelect={() => onEditTableStructure(node.dbName!, node.name)}>
                <Settings2 className="w-4 h-4 mr-2" />
                {t('database.editTableStructure')}
              </ContextMenuItem>
              <ContextMenuItem onSelect={() => onRenameTable(node.dbName!, node.name)}>
                <Pencil className="w-4 h-4 mr-2" />
                {t('database.renameTable')}
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem onSelect={() => onCopyTableName(node.name)}>
                <Copy className="w-4 h-4 mr-2" />
                {t('database.copyTableName')}
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem
                onSelect={() => onDropTable(node.dbName!, node.name)}
                className="text-status-error focus:text-status-error"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                {t('database.dropTable')}
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
          {isExpanded && node.children && (
            <div>{node.children.map((child) => renderNode(child, level + 1))}</div>
          )}
        </div>
      )
    }

    return (
      <div key={node.id}>
        {nodeContent}
        {isExpanded && node.children && (
          <div>{node.children.map((child) => renderNode(child, level + 1))}</div>
        )}
      </div>
    )
  }

  return (
    <div className={cn('w-64 shrink-0 flex flex-col border-r', borderColor, bgSecondary)}>
      <div className={cn('flex items-center justify-between px-3 py-2 border-b', borderColor)}>
        <span className={cn('text-sm font-medium', textPrimary)}>{t('database.databases')}</span>
        <button onClick={onRefresh} className={cn('p-1 rounded', hoverBg)} title={t('common.refresh')}>
          <RefreshCw className={cn('w-4 h-4', textSecondary)} />
        </button>
      </div>
      <div className="flex-1 overflow-auto py-1">
        {schemaTree.map((node) => renderNode(node))}
      </div>
    </div>
  )
}
