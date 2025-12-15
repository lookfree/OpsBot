/**
 * 连接树组件
 */

import { useState } from 'react'
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
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { getDatabaseIcon } from '@/components/icons/DatabaseIcons'
import { useConnectionStore, useTabStore, createTabFromConnection, MAX_FOLDER_DEPTH } from '@/stores'
import { sshDisconnect } from '@/services'
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
              // 查找该连接对应的标签页
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
        />
        )
      })}
    </div>
  )
}

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
}: TreeNodeItemProps) {
  const { t } = useTranslation()
  const isFolder = node.type === 'folder'
  const isConnection = node.type === 'connection'

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
            }
          }}
          onDoubleClick={() => {
            if (isConnection) {
              onConnect()
            }
          }}
        >
          {/* 展开/折叠图标 */}
          {isFolder && (
            <span className="w-4 h-4 flex items-center justify-center flex-shrink-0">
              {node.expanded ? (
                <ChevronDown className="w-3 h-3" />
              ) : (
                <ChevronRight className="w-3 h-3" />
              )}
            </span>
          )}

          {/* 连接状态点 */}
          {isConnection && (
            <span
              className={cn(
                'status-dot mr-1.5 flex-shrink-0',
                statusColors[node.status || 'disconnected']
              )}
            />
          )}

          {/* 图标 */}
          <Icon className="w-4 h-4 mr-1.5 flex-shrink-0 text-dark-text-secondary" />

          {/* 名称 */}
          <span className="flex-1 text-sm truncate">{node.name}</span>

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
                onSelect={onDisconnect}
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
  </>
  )
}
