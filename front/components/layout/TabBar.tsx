/**
 * 标签页栏组件
 */

import { useTranslation } from 'react-i18next'
import * as ContextMenu from '@radix-ui/react-context-menu'
import {
  X,
  Pin,
  PinOff,
  Server,
  Database,
  Container,
  Settings2,
  FolderOpen,
  Plus,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTabStore } from '@/stores'
import { Tab, TabType, ConnectionStatus } from '@/types'

// 标签页图标
const tabIcons: Record<TabType, React.ComponentType<{ className?: string }>> = {
  terminal: Server,
  sftp: FolderOpen,
  database: Database,
  docker: Container,
  middleware: Settings2,
}

// 状态颜色
const statusColors: Record<ConnectionStatus, string> = {
  connected: 'bg-status-success',
  disconnected: 'status-disconnected',
  connecting: 'bg-status-warning animate-pulse',
  error: 'bg-status-error',
}

interface TabBarProps {
  className?: string
}

export function TabBar({ className }: TabBarProps) {
  const { t } = useTranslation()
  const { tabs, activeTabId, setActiveTab, removeTab, togglePinned, closeOtherTabs, closeTabsToRight } =
    useTabStore()

  if (tabs.length === 0) {
    return (
      <div className={cn('tabbar flex items-center h-10', className)}>
        <div className="flex items-center gap-2 px-4 text-sm text-secondary">
          <span>{t('tabs.noTabs')}</span>
        </div>
      </div>
    )
  }

  return (
    <div
      className={cn(
        'tabbar flex items-center h-10 overflow-x-auto',
        className
      )}
    >
      {tabs.map((tab) => (
        <TabItem
          key={tab.id}
          tab={tab}
          isActive={tab.id === activeTabId}
          onSelect={() => setActiveTab(tab.id)}
          onClose={() => removeTab(tab.id)}
          onTogglePin={() => togglePinned(tab.id)}
          onCloseOthers={() => closeOtherTabs(tab.id)}
          onCloseToRight={() => closeTabsToRight(tab.id)}
        />
      ))}

      {/* 新建标签按钮 */}
      <button
        className="tab-add-btn flex items-center justify-center w-8 h-8 mx-1 rounded"
        title={t('tabs.newTab')}
      >
        <Plus className="w-4 h-4" />
      </button>
    </div>
  )
}

interface TabItemProps {
  tab: Tab
  isActive: boolean
  onSelect: () => void
  onClose: () => void
  onTogglePin: () => void
  onCloseOthers: () => void
  onCloseToRight: () => void
}

function TabItem({
  tab,
  isActive,
  onSelect,
  onClose,
  onTogglePin,
  onCloseOthers,
  onCloseToRight,
}: TabItemProps) {
  const { t } = useTranslation()
  const Icon = tabIcons[tab.type]

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>
        <div
          className={cn(
            'tab group flex items-center gap-2 px-3 h-full min-w-0 max-w-[200px]',
            isActive && 'active'
          )}
          onClick={onSelect}
          onMouseDown={(e) => {
            // 中键关闭
            if (e.button === 1 && tab.closable) {
              e.preventDefault()
              onClose()
            }
          }}
        >
          {/* 状态点 */}
          <span className={cn('status-dot flex-shrink-0', statusColors[tab.status])} />

          {/* 图标 */}
          <Icon className="w-4 h-4 flex-shrink-0" />

          {/* 标题 */}
          <span className="text-sm truncate flex-1">{tab.title}</span>

          {/* 固定图标 */}
          {tab.pinned && <Pin className="w-3 h-3 flex-shrink-0 text-secondary" />}

          {/* 关闭按钮 */}
          {tab.closable && !tab.pinned && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onClose()
              }}
              className="tab-close-btn opacity-0 group-hover:opacity-100 p-0.5 rounded flex-shrink-0"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </ContextMenu.Trigger>

      {/* 右键菜单 */}
      <ContextMenu.Portal>
        <ContextMenu.Content className="context-menu min-w-[160px] rounded-md shadow-lg py-1 z-50">
          <ContextMenu.Item
            className="context-menu-item flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer outline-none"
            onClick={onTogglePin}
          >
            {tab.pinned ? (
              <>
                <PinOff className="w-4 h-4" />
                {t('tabs.unpin')}
              </>
            ) : (
              <>
                <Pin className="w-4 h-4" />
                {t('tabs.pin')}
              </>
            )}
          </ContextMenu.Item>

          <ContextMenu.Separator className="context-menu-separator h-px my-1" />

          {tab.closable && (
            <ContextMenu.Item
              className="context-menu-item flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer outline-none"
              onClick={onClose}
            >
              <X className="w-4 h-4" />
              {t('tabs.close')}
            </ContextMenu.Item>
          )}

          <ContextMenu.Item
            className="context-menu-item flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer outline-none"
            onClick={onCloseOthers}
          >
            {t('tabs.closeOthers')}
          </ContextMenu.Item>

          <ContextMenu.Item
            className="context-menu-item flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer outline-none"
            onClick={onCloseToRight}
          >
            {t('tabs.closeToRight')}
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  )
}
