/**
 * 侧边栏组件
 */

import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import * as ContextMenu from '@radix-ui/react-context-menu'
import {
  Server,
  Database,
  Container,
  Settings2,
  Plus,
  Search,
  ChevronRight,
  ChevronDown,
  FolderPlus,
  Link,
  ChevronsUpDown,
  ChevronsDownUp,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useConnectionStore } from '@/stores'
import { ModuleType } from '@/types'
import { ConnectionTree } from './ConnectionTree'
import { SettingsDropdown } from '@/components/settings'
import { SshConnectionDialog } from '@/components/ssh'
import { DatabaseConnectionDialog } from '@/components/database'
import { InputDialog } from '@/components/common'

// 模块图标映射
const ModuleIcons: Record<ModuleType, React.ComponentType<{ className?: string }>> = {
  [ModuleType.SSH]: Server,
  [ModuleType.Database]: Database,
  [ModuleType.Docker]: Container,
  [ModuleType.Middleware]: Settings2,
}

interface SidebarProps {
  className?: string
}

export function Sidebar({ className }: SidebarProps) {
  const { t } = useTranslation()
  // 需要直接订阅 folders, connections 和 connectionStatus 以确保状态变化时组件重新渲染
  const folders = useConnectionStore((state) => state.folders)
  const connections = useConnectionStore((state) => state.connections)
  const connectionStatus = useConnectionStore((state) => state.connectionStatus)
  const getTreeNodes = useConnectionStore((state) => state.getTreeNodes)
  const createFolder = useConnectionStore((state) => state.createFolder)
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedModules, setExpandedModules] = useState<Record<ModuleType, boolean>>({
    [ModuleType.SSH]: true,
    [ModuleType.Database]: true,
    [ModuleType.Docker]: true,
    [ModuleType.Middleware]: true,
  })
  const [sshDialogOpen, setSshDialogOpen] = useState(false)
  const [databaseDialogOpen, setDatabaseDialogOpen] = useState(false)
  const [editingConnection, setEditingConnection] = useState<any>(null)
  const [folderDialogOpen, setFolderDialogOpen] = useState(false)
  const [folderDialogModuleType, setFolderDialogModuleType] = useState<ModuleType>(ModuleType.SSH)
  // 新建连接时的目标文件夹ID
  const [targetFolderId, setTargetFolderId] = useState<string | null>(null)

  // 使用 useMemo 优化树节点计算，依赖 folders, connections 和 connectionStatus 变化
  const treeNodes = useMemo(() => {
    return getTreeNodes()
  }, [folders, connections, connectionStatus, getTreeNodes])

  const toggleModule = (moduleType: ModuleType) => {
    setExpandedModules((prev) => ({
      ...prev,
      [moduleType]: !prev[moduleType],
    }))
  }

  const handleCreateFolder = (moduleType: ModuleType) => {
    setFolderDialogModuleType(moduleType)
    setFolderDialogOpen(true)
  }

  const handleFolderDialogConfirm = (name: string) => {
    const folder = createFolder(name, folderDialogModuleType, null)
    console.log('Created folder:', folder)
  }

  // 编辑连接
  const handleEditConnection = (connection: any) => {
    setEditingConnection(connection)
    if (connection.moduleType === ModuleType.SSH) {
      setSshDialogOpen(true)
    } else if (connection.moduleType === ModuleType.Database) {
      setDatabaseDialogOpen(true)
    }
  }

  // 关闭SSH对话框时清除编辑状态和目标文件夹
  const handleSshDialogOpenChange = (open: boolean) => {
    setSshDialogOpen(open)
    if (!open) {
      setEditingConnection(null)
      setTargetFolderId(null)
    }
  }

  // 关闭数据库对话框时清除编辑状态和目标文件夹
  const handleDatabaseDialogOpenChange = (open: boolean) => {
    setDatabaseDialogOpen(open)
    if (!open) {
      setEditingConnection(null)
      setTargetFolderId(null)
    }
  }

  // 展开模块下所有目录
  const expandAllInModule = (moduleType: ModuleType) => {
    const moduleFolders = folders.filter((f) => f.moduleType === moduleType)
    moduleFolders.forEach((folder) => {
      if (!folder.expanded) {
        useConnectionStore.getState().updateFolder(folder.id, { expanded: true })
      }
    })
  }

  // 折叠模块下所有目录
  const collapseAllInModule = (moduleType: ModuleType) => {
    const moduleFolders = folders.filter((f) => f.moduleType === moduleType)
    moduleFolders.forEach((folder) => {
      if (folder.expanded) {
        useConnectionStore.getState().updateFolder(folder.id, { expanded: false })
      }
    })
  }

  // 打开新建连接对话框
  const openNewConnectionDialog = (moduleType: ModuleType, folderId: string | null = null) => {
    setTargetFolderId(folderId)
    if (moduleType === ModuleType.SSH) {
      setSshDialogOpen(true)
    } else if (moduleType === ModuleType.Database) {
      setDatabaseDialogOpen(true)
    }
    // TODO: Docker, Middleware 连接对话框
  }

  return (
    <div className={cn('sidebar w-64 flex flex-col', className)}>
      {/* 顶部标题栏 */}
      <div className="flex items-center justify-between px-4 py-3">
        <h1 className="text-lg font-semibold">{t('sidebar.connections')}</h1>
        <div className="flex items-center gap-1">
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button className="btn-ghost p-1.5 rounded-md" title={t('common.add')}>
                <Plus className="w-4 h-4" />
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                className="dropdown-content min-w-[160px] p-1"
                sideOffset={5}
                align="end"
              >
                {/* 新建连接子菜单 */}
                <DropdownMenu.Sub>
                  <DropdownMenu.SubTrigger className="dropdown-item rounded-md">
                    <Link className="w-4 h-4 mr-2" />
                    <span className="flex-1">{t('sidebar.newConnection')}</span>
                    <ChevronRight className="w-4 h-4 text-dark-text-secondary" />
                  </DropdownMenu.SubTrigger>
                  <DropdownMenu.Portal>
                    <DropdownMenu.SubContent
                      className="dropdown-content min-w-[140px] p-1"
                      sideOffset={8}
                    >
                      <DropdownMenu.Item
                        className="dropdown-item rounded-md"
                        onClick={() => setSshDialogOpen(true)}
                      >
                        <Server className="w-4 h-4 mr-2" />
                        {t('modules.ssh')}
                      </DropdownMenu.Item>
                      <DropdownMenu.Item
                        className="dropdown-item rounded-md"
                        onClick={() => setDatabaseDialogOpen(true)}
                      >
                        <Database className="w-4 h-4 mr-2" />
                        {t('modules.database')}
                      </DropdownMenu.Item>
                      <DropdownMenu.Item className="dropdown-item rounded-md" disabled>
                        <Container className="w-4 h-4 mr-2" />
                        {t('modules.docker')}
                      </DropdownMenu.Item>
                      <DropdownMenu.Item className="dropdown-item rounded-md" disabled>
                        <Settings2 className="w-4 h-4 mr-2" />
                        {t('modules.middleware')}
                      </DropdownMenu.Item>
                    </DropdownMenu.SubContent>
                  </DropdownMenu.Portal>
                </DropdownMenu.Sub>

                {/* 新建目录子菜单 */}
                <DropdownMenu.Sub>
                  <DropdownMenu.SubTrigger className="dropdown-item rounded-md">
                    <FolderPlus className="w-4 h-4 mr-2" />
                    <span className="flex-1">{t('sidebar.newFolder')}</span>
                    <ChevronRight className="w-4 h-4 text-dark-text-secondary" />
                  </DropdownMenu.SubTrigger>
                  <DropdownMenu.Portal>
                    <DropdownMenu.SubContent
                      className="dropdown-content min-w-[140px] p-1"
                      sideOffset={8}
                    >
                      <DropdownMenu.Item
                        className="dropdown-item rounded-md"
                        onClick={() => handleCreateFolder(ModuleType.SSH)}
                      >
                        <Server className="w-4 h-4 mr-2" />
                        {t('modules.ssh')}
                      </DropdownMenu.Item>
                      <DropdownMenu.Item
                        className="dropdown-item rounded-md"
                        onClick={() => handleCreateFolder(ModuleType.Database)}
                      >
                        <Database className="w-4 h-4 mr-2" />
                        {t('modules.database')}
                      </DropdownMenu.Item>
                      <DropdownMenu.Item
                        className="dropdown-item rounded-md"
                        onClick={() => handleCreateFolder(ModuleType.Docker)}
                      >
                        <Container className="w-4 h-4 mr-2" />
                        {t('modules.docker')}
                      </DropdownMenu.Item>
                      <DropdownMenu.Item
                        className="dropdown-item rounded-md"
                        onClick={() => handleCreateFolder(ModuleType.Middleware)}
                      >
                        <Settings2 className="w-4 h-4 mr-2" />
                        {t('modules.middleware')}
                      </DropdownMenu.Item>
                    </DropdownMenu.SubContent>
                  </DropdownMenu.Portal>
                </DropdownMenu.Sub>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
      </div>

      {/* 搜索框 */}
      <div className="px-3 py-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-text-disabled" />
          <input
            type="text"
            placeholder={t('sidebar.searchConnections')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input pl-8 py-1.5 text-sm"
          />
        </div>
      </div>

      {/* 连接树 */}
      <div className="flex-1 overflow-y-auto px-2 py-1">
        {treeNodes.map((moduleNode) => {
          const Icon = ModuleIcons[moduleNode.moduleType]
          const isExpanded = expandedModules[moduleNode.moduleType]

          return (
            <div key={moduleNode.id} className="mb-1">
              {/* 模块标题 - 支持右键菜单 */}
              <ContextMenu.Root>
                <ContextMenu.Trigger asChild>
                  <div
                    className="tree-item group"
                    onClick={() => toggleModule(moduleNode.moduleType)}
                  >
                    <span className="w-4 h-4 flex items-center justify-center">
                      {isExpanded ? (
                        <ChevronDown className="w-3 h-3" />
                      ) : (
                        <ChevronRight className="w-3 h-3" />
                      )}
                    </span>
                    <Icon className="w-4 h-4 mr-2" />
                    <span className="flex-1 text-sm font-medium">
                      {t(`modules.${moduleNode.moduleType}`)}
                    </span>
                    {/* 悬浮+号下拉菜单 - 新建连接或目录 */}
                    <DropdownMenu.Root>
                      <DropdownMenu.Trigger asChild>
                        <button
                          onClick={(e) => e.stopPropagation()}
                          className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-dark-bg-hover rounded"
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
                            onSelect={() => openNewConnectionDialog(moduleNode.moduleType, null)}
                          >
                            <Link className="w-4 h-4" />
                            {t('sidebar.newConnection')}
                          </DropdownMenu.Item>
                          <DropdownMenu.Item
                            className="dropdown-item rounded-md flex items-center gap-2 px-2 py-1.5 text-sm cursor-pointer outline-none"
                            onSelect={() => handleCreateFolder(moduleNode.moduleType)}
                          >
                            <FolderPlus className="w-4 h-4" />
                            {t('sidebar.newFolder')}
                          </DropdownMenu.Item>
                        </DropdownMenu.Content>
                      </DropdownMenu.Portal>
                    </DropdownMenu.Root>
                  </div>
                </ContextMenu.Trigger>

                {/* 模块右键菜单 */}
                <ContextMenu.Portal>
                  <ContextMenu.Content className="context-menu min-w-[160px] rounded-md shadow-lg py-1 z-50">
                    <ContextMenu.Item
                      className="context-menu-item flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer outline-none"
                      onClick={() => openNewConnectionDialog(moduleNode.moduleType)}
                    >
                      <Link className="w-4 h-4" />
                      {t('sidebar.newConnection')}
                    </ContextMenu.Item>
                    <ContextMenu.Item
                      className="context-menu-item flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer outline-none"
                      onClick={() => handleCreateFolder(moduleNode.moduleType)}
                    >
                      <FolderPlus className="w-4 h-4" />
                      {t('sidebar.newFolder')}
                    </ContextMenu.Item>

                    <ContextMenu.Separator className="context-menu-separator h-px my-1" />

                    <ContextMenu.Item
                      className="context-menu-item flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer outline-none"
                      onClick={() => expandAllInModule(moduleNode.moduleType)}
                    >
                      <ChevronsUpDown className="w-4 h-4" />
                      {t('sidebar.expandAll')}
                    </ContextMenu.Item>
                    <ContextMenu.Item
                      className="context-menu-item flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer outline-none"
                      onClick={() => collapseAllInModule(moduleNode.moduleType)}
                    >
                      <ChevronsDownUp className="w-4 h-4" />
                      {t('sidebar.collapseAll')}
                    </ContextMenu.Item>
                  </ContextMenu.Content>
                </ContextMenu.Portal>
              </ContextMenu.Root>

              {/* 子节点 */}
              {isExpanded && moduleNode.children && (
                <ConnectionTree
                  nodes={moduleNode.children}
                  moduleType={moduleNode.moduleType}
                  level={1}
                  searchQuery={searchQuery}
                  onEditConnection={handleEditConnection}
                  onCreateConnection={(folderId) => openNewConnectionDialog(moduleNode.moduleType, folderId)}
                />
              )}
            </div>
          )
        })}
      </div>

      {/* 底部设置区域 - 参考Claude风格 */}
      <div className="p-2">
        <SettingsDropdown />
      </div>

      {/* SSH连接对话框 */}
      <SshConnectionDialog
        open={sshDialogOpen}
        onOpenChange={handleSshDialogOpenChange}
        connection={editingConnection}
        folderId={editingConnection ? undefined : targetFolderId}
      />

      {/* 数据库连接对话框 */}
      <DatabaseConnectionDialog
        open={databaseDialogOpen}
        onOpenChange={handleDatabaseDialogOpenChange}
        connection={editingConnection}
        folderId={editingConnection ? undefined : targetFolderId}
      />

      {/* 新建目录对话框 */}
      <InputDialog
        open={folderDialogOpen}
        onOpenChange={setFolderDialogOpen}
        title={t('sidebar.newFolder')}
        placeholder={t('sidebar.enterFolderName')}
        onConfirm={handleFolderDialogConfirm}
      />
    </div>
  )
}
