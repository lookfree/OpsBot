/**
 * 标签页状态管理
 */

import { create } from 'zustand'
import { v4 as uuidv4 } from 'uuid'
import { Tab, TabType } from '@/types'
import { ModuleType, ConnectionStatus } from '@/types'

interface TabState {
  tabs: Tab[]
  activeTabId: string | null

  // 标签页操作
  addTab: (tab: Omit<Tab, 'id'>) => Tab
  removeTab: (id: string) => void
  setActiveTab: (id: string) => void
  updateTab: (id: string, updates: Partial<Tab>) => void

  // 批量操作
  closeAllTabs: () => void
  closeOtherTabs: (id: string) => void
  closeTabsToRight: (id: string) => void

  // 标签页排序
  reorderTabs: (fromIndex: number, toIndex: number) => void

  // 固定/取消固定
  togglePinned: (id: string) => void
}

export const useTabStore = create<TabState>()((set) => ({
  tabs: [],
  activeTabId: null,

  addTab: (tabData) => {
    const tab: Tab = {
      ...tabData,
      id: uuidv4(),
    }

    set((state) => {
      // 如果是固定的标签，插入到固定标签的最后
      const pinnedCount = state.tabs.filter((t) => t.pinned).length
      const insertIndex = tab.pinned ? pinnedCount : state.tabs.length

      const newTabs = [...state.tabs]
      newTabs.splice(insertIndex, 0, tab)

      return {
        tabs: newTabs,
        activeTabId: tab.id,
      }
    })

    return tab
  },

  removeTab: (id) => {
    set((state) => {
      const tabIndex = state.tabs.findIndex((t) => t.id === id)
      if (tabIndex === -1) return state

      const tab = state.tabs[tabIndex]
      if (!tab.closable) return state

      const newTabs = state.tabs.filter((t) => t.id !== id)
      let newActiveTabId = state.activeTabId

      // 如果关闭的是当前活动标签，切换到相邻标签
      if (state.activeTabId === id) {
        if (tabIndex < newTabs.length) {
          newActiveTabId = newTabs[tabIndex].id
        } else if (newTabs.length > 0) {
          newActiveTabId = newTabs[newTabs.length - 1].id
        } else {
          newActiveTabId = null
        }
      }

      return {
        tabs: newTabs,
        activeTabId: newActiveTabId,
      }
    })
  },

  setActiveTab: (id) => {
    set({ activeTabId: id })
  },

  updateTab: (id, updates) => {
    set((state) => ({
      tabs: state.tabs.map((t) => (t.id === id ? { ...t, ...updates } : t)),
    }))
  },

  closeAllTabs: () => {
    set((state) => ({
      tabs: state.tabs.filter((t) => !t.closable || t.pinned),
      activeTabId: state.tabs.find((t) => t.pinned)?.id || null,
    }))
  },

  closeOtherTabs: (id) => {
    set((state) => ({
      tabs: state.tabs.filter((t) => t.id === id || !t.closable || t.pinned),
      activeTabId: id,
    }))
  },

  closeTabsToRight: (id) => {
    set((state) => {
      const tabIndex = state.tabs.findIndex((t) => t.id === id)
      if (tabIndex === -1) return state

      const newTabs = state.tabs.filter(
        (t, i) => i <= tabIndex || !t.closable || t.pinned
      )

      return {
        tabs: newTabs,
        activeTabId: state.activeTabId,
      }
    })
  },

  reorderTabs: (fromIndex, toIndex) => {
    set((state) => {
      const newTabs = [...state.tabs]
      const [removed] = newTabs.splice(fromIndex, 1)
      newTabs.splice(toIndex, 0, removed)
      return { tabs: newTabs }
    })
  },

  togglePinned: (id) => {
    set((state) => {
      const tab = state.tabs.find((t) => t.id === id)
      if (!tab) return state

      const newPinned = !tab.pinned
      const updatedTabs = state.tabs.map((t) =>
        t.id === id ? { ...t, pinned: newPinned } : t
      )

      // 重新排序：固定的在前面
      updatedTabs.sort((a, b) => {
        if (a.pinned === b.pinned) return 0
        return a.pinned ? -1 : 1
      })

      return { tabs: updatedTabs }
    })
  },
}))

// 辅助函数：从连接创建标签页
export function createTabFromConnection(
  connectionId: string,
  connectionName: string,
  moduleType: ModuleType,
  tabType: TabType,
  status: ConnectionStatus = 'disconnected'
): Omit<Tab, 'id'> {
  return {
    type: tabType,
    title: connectionName,
    moduleType,
    connectionId,
    status,
    closable: true,
    pinned: false,
  }
}
