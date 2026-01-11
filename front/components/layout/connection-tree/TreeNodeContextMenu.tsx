/**
 * Tree Node Context Menu Component
 * Renders context menus for folder and connection nodes
 */

import { useTranslation } from 'react-i18next'
import * as ContextMenu from '@radix-ui/react-context-menu'
import {
  ChevronRight,
  Folder,
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
import { MAX_FOLDER_DEPTH } from '@/stores'

interface FolderContextMenuProps {
  folderDepth: number
  onCreateConnection: () => void
  onCreateSubfolder: () => void
  onExpandAll: () => void
  onCollapseAll: () => void
  onRename: () => void
  onDelete: () => void
}

export function FolderContextMenu({
  folderDepth,
  onCreateConnection,
  onCreateSubfolder,
  onExpandAll,
  onCollapseAll,
  onRename,
  onDelete,
}: FolderContextMenuProps) {
  const { t } = useTranslation()

  return (
    <>
      <ContextMenu.Item
        className="context-menu-item flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer outline-none"
        onSelect={onCreateConnection}
      >
        <Plus className="w-4 h-4" />
        {t('sidebar.newConnection')}
      </ContextMenu.Item>
      {folderDepth < MAX_FOLDER_DEPTH && (
        <ContextMenu.Item
          className="context-menu-item flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer outline-none"
          onSelect={onCreateSubfolder}
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
      <ContextMenu.Item
        className="context-menu-item flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer outline-none"
        onSelect={onRename}
      >
        <Edit className="w-4 h-4" />
        {t('sidebar.rename')}
      </ContextMenu.Item>
      <ContextMenu.Item
        className="context-menu-item flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer outline-none text-status-error"
        onSelect={onDelete}
      >
        <Trash2 className="w-4 h-4" />
        {t('sidebar.delete')}
      </ContextMenu.Item>
    </>
  )
}

interface ConnectionContextMenuProps {
  isDatabaseConnection: boolean
  onConnect: () => void
  onDisconnect: () => void
  onEdit: () => void
  onRename: () => void
  onCopy: () => void
  onDelete: () => void
  onMoveTo: (targetFolderId: string | null) => void
  onOpenInNewWindow: () => void
  availableFolders: { id: string; name: string }[]
}

export function ConnectionContextMenu({
  isDatabaseConnection: _isDatabaseConnection,
  onConnect,
  onDisconnect,
  onEdit,
  onRename,
  onCopy,
  onDelete,
  onMoveTo,
  onOpenInNewWindow,
  availableFolders,
}: ConnectionContextMenuProps) {
  const { t } = useTranslation()

  return (
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
      <ContextMenu.Item
        className="context-menu-item flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer outline-none"
        onSelect={onRename}
      >
        <Edit className="w-4 h-4" />
        {t('sidebar.rename')}
      </ContextMenu.Item>
      <ContextMenu.Item
        className="context-menu-item flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer outline-none"
        onSelect={onCopy}
      >
        <Copy className="w-4 h-4" />
        {t('sidebar.copy')}
      </ContextMenu.Item>
      <ContextMenu.Item
        className="context-menu-item flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer outline-none text-status-error"
        onSelect={onDelete}
      >
        <Trash2 className="w-4 h-4" />
        {t('sidebar.delete')}
      </ContextMenu.Item>
      <ContextMenu.Separator className="context-menu-separator h-px my-1" />
      <ContextMenu.Sub>
        <ContextMenu.SubTrigger className="context-menu-item flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer outline-none">
          <Move className="w-4 h-4" />
          {t('sidebar.moveTo')}
          <ChevronRight className="w-3 h-3 ml-auto" />
        </ContextMenu.SubTrigger>
        <ContextMenu.Portal>
          <ContextMenu.SubContent className="context-menu min-w-[140px] rounded-md shadow-lg py-1 z-50">
            <ContextMenu.Item
              className="context-menu-item flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer outline-none"
              onSelect={() => onMoveTo(null)}
            >
              <Folder className="w-4 h-4" />
              {t('sidebar.rootFolder', 'Root')}
            </ContextMenu.Item>
            {availableFolders.length > 0 && (
              <ContextMenu.Separator className="context-menu-separator h-px my-1" />
            )}
            {availableFolders.map((folder) => (
              <ContextMenu.Item
                key={folder.id}
                className="context-menu-item flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer outline-none"
                onSelect={() => onMoveTo(folder.id)}
              >
                <Folder className="w-4 h-4" />
                {folder.name}
              </ContextMenu.Item>
            ))}
          </ContextMenu.SubContent>
        </ContextMenu.Portal>
      </ContextMenu.Sub>
      <ContextMenu.Item
        className="context-menu-item flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer outline-none"
        onSelect={onOpenInNewWindow}
      >
        <ExternalLink className="w-4 h-4" />
        {t('sidebar.openInNewWindow')}
      </ContextMenu.Item>
    </>
  )
}
