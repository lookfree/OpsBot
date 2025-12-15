/**
 * 连接与目录状态管理
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { v4 as uuidv4 } from 'uuid'
import {
  ModuleType,
  Folder,
  Connection,
  ConnectionStatus,
  TreeNode,
  TreeNodeType,
} from '@/types'

interface ConnectionStatusMap {
  [connectionId: string]: ConnectionStatus
}

// 最大目录层级限制
export const MAX_FOLDER_DEPTH = 3

interface ConnectionState {
  // 数据
  folders: Folder[]
  connections: Connection[]
  connectionStatus: ConnectionStatusMap

  // 目录操作
  createFolder: (name: string, moduleType: ModuleType, parentId: string | null) => Folder | null
  updateFolder: (id: string, updates: Partial<Folder>) => void
  deleteFolder: (id: string) => void
  toggleFolderExpand: (id: string) => void
  getFolderDepth: (folderId: string | null) => number

  // 连接操作
  createConnection: (connection: Omit<Connection, 'id' | 'createdAt' | 'updatedAt'>) => Connection
  updateConnection: (id: string, updates: Partial<Connection>) => void
  deleteConnection: (id: string) => void
  moveConnection: (id: string, targetFolderId: string | null) => void

  // 状态操作
  setConnectionStatus: (id: string, status: ConnectionStatus) => void

  // 排序操作
  reorderItems: (
    moduleType: ModuleType,
    parentId: string | null,
    itemId: string,
    newIndex: number
  ) => void

  // 获取树形结构
  getTreeNodes: () => TreeNode[]
  getTreeNodesByModule: (moduleType: ModuleType) => TreeNode[]
}

// 创建树节点
const createTreeNode = (
  item: Folder | Connection,
  type: TreeNodeType,
  status?: ConnectionStatus
): TreeNode => ({
  id: item.id,
  type,
  name: item.name,
  moduleType: item.moduleType,
  parentId: 'folderId' in item ? item.folderId : (item as Folder).parentId,
  order: item.order,
  expanded: type === 'folder' ? (item as Folder).expanded : undefined,
  status,
  data: item,
})

export const useConnectionStore = create<ConnectionState>()(
  persist(
    (set, get) => ({
      folders: [],
      connections: [],
      connectionStatus: {},

      // 计算目录深度（从根开始，根目录为0，第一级子目录为1）
      getFolderDepth: (folderId) => {
        if (!folderId) return 0
        const { folders } = get()
        let depth = 1
        let currentId: string | null = folderId
        while (currentId) {
          const folder = folders.find((f) => f.id === currentId)
          if (!folder || !folder.parentId) break
          currentId = folder.parentId
          depth++
        }
        return depth
      },

      // 创建目录
      createFolder: (name, moduleType, parentId) => {
        // 检查层级限制
        const currentDepth = get().getFolderDepth(parentId)
        if (currentDepth >= MAX_FOLDER_DEPTH) {
          console.warn(`Cannot create folder: max depth (${MAX_FOLDER_DEPTH}) reached`)
          return null
        }

        const now = new Date().toISOString()
        const siblings = get().folders.filter(
          (f) => f.moduleType === moduleType && f.parentId === parentId
        )
        const maxOrder = siblings.reduce((max, f) => Math.max(max, f.order), -1)

        const folder: Folder = {
          id: uuidv4(),
          name,
          moduleType,
          parentId,
          order: maxOrder + 1,
          expanded: true,
          createdAt: now,
          updatedAt: now,
        }

        set((state) => ({
          folders: [...state.folders, folder],
        }))

        return folder
      },

      // 更新目录
      updateFolder: (id, updates) => {
        set((state) => ({
          folders: state.folders.map((f) =>
            f.id === id
              ? { ...f, ...updates, updatedAt: new Date().toISOString() }
              : f
          ),
        }))
      },

      // 删除目录（将子项移动到上级）
      deleteFolder: (id) => {
        const folder = get().folders.find((f) => f.id === id)
        if (!folder) return

        set((state) => {
          // 将子目录移动到父级
          const updatedFolders = state.folders
            .filter((f) => f.id !== id)
            .map((f) =>
              f.parentId === id
                ? { ...f, parentId: folder.parentId, updatedAt: new Date().toISOString() }
                : f
            )

          // 将子连接移动到父级
          const updatedConnections = state.connections.map((c) =>
            c.folderId === id
              ? { ...c, folderId: folder.parentId, updatedAt: new Date().toISOString() }
              : c
          )

          return {
            folders: updatedFolders,
            connections: updatedConnections,
          }
        })
      },

      // 切换目录展开状态
      toggleFolderExpand: (id) => {
        set((state) => ({
          folders: state.folders.map((f) =>
            f.id === id ? { ...f, expanded: !f.expanded } : f
          ),
        }))
      },

      // 创建连接
      createConnection: (connectionData) => {
        const now = new Date().toISOString()
        const siblings = get().connections.filter(
          (c) =>
            c.moduleType === connectionData.moduleType &&
            c.folderId === connectionData.folderId
        )
        const maxOrder = siblings.reduce((max, c) => Math.max(max, c.order), -1)

        const connection = {
          ...connectionData,
          id: uuidv4(),
          order: maxOrder + 1,
          createdAt: now,
          updatedAt: now,
        } as Connection

        set((state) => ({
          connections: [...state.connections, connection],
          connectionStatus: {
            ...state.connectionStatus,
            [connection.id]: 'disconnected',
          },
        }))

        return connection
      },

      // 更新连接
      updateConnection: (id, updates) => {
        set((state) => ({
          connections: state.connections.map((c) =>
            c.id === id
              ? { ...c, ...updates, updatedAt: new Date().toISOString() }
              : c
          ) as Connection[],
        }))
      },

      // 删除连接
      deleteConnection: (id) => {
        set((state) => {
          const { [id]: _, ...restStatus } = state.connectionStatus
          return {
            connections: state.connections.filter((c) => c.id !== id),
            connectionStatus: restStatus,
          }
        })
      },

      // 移动连接
      moveConnection: (id, targetFolderId) => {
        set((state) => ({
          connections: state.connections.map((c) =>
            c.id === id
              ? { ...c, folderId: targetFolderId, updatedAt: new Date().toISOString() }
              : c
          ) as Connection[],
        }))
      },

      // 设置连接状态
      setConnectionStatus: (id, status) => {
        set((state) => ({
          connectionStatus: {
            ...state.connectionStatus,
            [id]: status,
          },
        }))
      },

      // 重新排序
      reorderItems: (moduleType, parentId, itemId, newIndex) => {
        set((state) => {
          // 获取同级的目录和连接
          const siblingFolders = state.folders
            .filter((f) => f.moduleType === moduleType && f.parentId === parentId)
            .sort((a, b) => a.order - b.order)

          const siblingConnections = state.connections
            .filter((c) => c.moduleType === moduleType && c.folderId === parentId)
            .sort((a, b) => a.order - b.order)

          // 合并并重新排序
          const allItems = [...siblingFolders, ...siblingConnections]
          const itemIndex = allItems.findIndex((item) => item.id === itemId)

          if (itemIndex === -1) return state

          const [item] = allItems.splice(itemIndex, 1)
          allItems.splice(newIndex, 0, item)

          // 更新排序
          const updatedFolders = state.folders.map((f) => {
            const idx = allItems.findIndex((item) => item.id === f.id)
            if (idx !== -1) {
              return { ...f, order: idx }
            }
            return f
          })

          const updatedConnections = state.connections.map((c) => {
            const idx = allItems.findIndex((item) => item.id === c.id)
            if (idx !== -1) {
              return { ...c, order: idx }
            }
            return c
          }) as Connection[]

          return {
            folders: updatedFolders,
            connections: updatedConnections,
          }
        })
      },

      // 获取树形结构
      getTreeNodes: () => {
        const { folders, connections, connectionStatus } = get()
        const nodes: TreeNode[] = []

        // 为每个模块类型创建根节点
        Object.values(ModuleType).forEach((moduleType) => {
          const moduleNode: TreeNode = {
            id: moduleType,
            type: 'module',
            name: moduleType,
            moduleType,
            parentId: null,
            order: 0,
            expanded: true,
            children: [],
          }

          // 递归构建子节点
          const buildChildren = (parentId: string | null): TreeNode[] => {
            const childFolders = folders
              .filter((f) => f.moduleType === moduleType && f.parentId === parentId)
              .sort((a, b) => a.order - b.order)
              .map((f) => {
                const node = createTreeNode(f, 'folder')
                node.children = buildChildren(f.id)
                return node
              })

            const childConnections = connections
              .filter((c) => c.moduleType === moduleType && c.folderId === parentId)
              .sort((a, b) => a.order - b.order)
              .map((c) =>
                createTreeNode(c, 'connection', connectionStatus[c.id] || 'disconnected')
              )

            return [...childFolders, ...childConnections]
          }

          moduleNode.children = buildChildren(null)
          nodes.push(moduleNode)
        })

        return nodes
      },

      // 按模块获取树形结构
      getTreeNodesByModule: (moduleType) => {
        const allNodes = get().getTreeNodes()
        const moduleNode = allNodes.find((n) => n.moduleType === moduleType)
        return moduleNode?.children || []
      },
    }),
    {
      name: 'zwd-opsbot-connections',
      partialize: (state) => ({
        folders: state.folders,
        connections: state.connections,
      }),
    }
  )
)
