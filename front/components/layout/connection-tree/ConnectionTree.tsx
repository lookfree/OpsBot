/**
 * Connection Tree Component
 * Main tree component for displaying connections and folders
 */

import { useConnectionStore, useTabStore, createTabFromConnection } from '@/stores'
import { sshDisconnect } from '@/services'
import { dbDisconnect } from '@/services/database'
import {
  ModuleType,
  TreeNode,
  SSHConnection,
  DatabaseConnection,
  DockerConnection,
  MiddlewareConnection,
} from '@/types'
import { ConnectionTreeProps } from './types'
import { TreeNodeItem } from './TreeNodeItem'

export function ConnectionTree({
  nodes,
  moduleType,
  level,
  searchQuery = '',
  onEditConnection,
  onCreateConnection,
}: ConnectionTreeProps) {
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

  // Recursively expand/collapse all child folders
  const setExpandRecursive = (node: TreeNode, expanded: boolean) => {
    if (node.type === 'folder') {
      updateFolder(node.id, { expanded })
      if (node.children) {
        node.children.forEach((child) => setExpandRecursive(child, expanded))
      }
    }
  }

  // Filter nodes by search query
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
              onCreateConnection?.(node.id)
            }}
            onConnect={() => {
              if (node.type === 'connection' && node.data) {
                const connection = node.data as SSHConnection | DatabaseConnection | DockerConnection | MiddlewareConnection
                let tabType: 'terminal' | 'sftp' | 'database' | 'docker' | 'middleware' = 'terminal'
                if (moduleType === ModuleType.Database) {
                  tabType = 'database'
                } else if (moduleType === ModuleType.Docker) {
                  tabType = 'docker'
                } else if (moduleType === ModuleType.Middleware) {
                  tabType = 'middleware'
                }

                const tab = createTabFromConnection(
                  connection.id,
                  connection.name,
                  moduleType,
                  tabType,
                  'connecting'
                )

                if (moduleType === ModuleType.Middleware) {
                  const mwConn = connection as MiddlewareConnection
                  tab.data = { ...tab.data, middlewareType: mwConn.middlewareType }
                }

                addTab(tab)
              }
            }}
            onDisconnect={async () => {
              if (node.type === 'connection') {
                if (moduleType === ModuleType.Database && node.data) {
                  try {
                    const conn = node.data as DatabaseConnection
                    await dbDisconnect(conn.id)
                  } catch (err) {
                    console.error('Failed to disconnect database:', err)
                  }
                }
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
                createConnection({
                  ...rest,
                  name: `${node.name} (Copy)`,
                })
              }
            }}
            onMoveTo={(targetFolderId) => {
              if (node.type === 'connection') {
                moveConnection(node.id, targetFolderId)
              }
            }}
            availableFolders={folders.filter(f => f.moduleType === moduleType)}
            onOpenInNewWindow={() => {
              // TODO: Implement open in new window
              console.log('Open in new window:', node)
            }}
            onDbTableAction={(action, dbName, tableName, schemaName) => {
              console.log('Database table action:', action, dbName, tableName, schemaName)
            }}
            onDropConnection={(connectionId, targetFolderId) => {
              moveConnection(connectionId, targetFolderId)
            }}
          />
        )
      })}

      {/* Render children for expanded folders */}
      {filteredNodes.map((node) => {
        if (node.type === 'folder' && node.expanded && node.children && node.children.length > 0) {
          return (
            <ConnectionTree
              key={`children-${node.id}`}
              nodes={node.children}
              moduleType={moduleType}
              level={level + 1}
              searchQuery={searchQuery}
              onEditConnection={onEditConnection}
              onCreateConnection={onCreateConnection}
            />
          )
        }
        return null
      })}
    </div>
  )
}
