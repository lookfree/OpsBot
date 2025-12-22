/**
 * 标签页相关类型定义
 */

import { ModuleType, ConnectionStatus } from './connection'

// 标签页类型
export type TabType = 'terminal' | 'sftp' | 'database' | 'docker' | 'middleware' | 'erDesigner'

// 标签页
export interface Tab {
  id: string
  type: TabType
  title: string
  icon?: string
  moduleType: ModuleType
  connectionId?: string
  status: ConnectionStatus
  closable: boolean
  pinned: boolean
  data?: Record<string, unknown>
}

// 标签页面板
export interface TabPanel {
  id: string
  tabs: Tab[]
  activeTabId: string | null
}
