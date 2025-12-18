/**
 * 配置导出服务
 * 将连接和目录配置导出为JSON文件，支持加密
 */

import { invoke } from '@tauri-apps/api/core'
import { save } from '@tauri-apps/plugin-dialog'
import { writeTextFile } from '@tauri-apps/plugin-fs'
import {
  ExportConfig,
  ExportOptions,
  ExportedConnection,
  EXPORT_VERSION,
  EXPORT_FILE_EXTENSION,
  ENCRYPTED_FILE_EXTENSION,
  Folder,
  Connection,
  ModuleType,
} from '@/types'

// 应用版本（后续从package.json或配置读取）
const APP_VERSION = '0.1.0'

// 敏感字段列表
const SENSITIVE_FIELDS = ['password', 'privateKey', 'passphrase']

/**
 * 移除连接中的敏感信息
 */
const removeSensitiveData = (connection: Connection): ExportedConnection => {
  // 创建深拷贝
  const exported = JSON.parse(JSON.stringify(connection)) as Record<string, unknown>

  // 移除顶层敏感字段
  SENSITIVE_FIELDS.forEach((field) => {
    delete exported[field]
  })

  // 处理嵌套的敏感字段（如 jumpHost, sshTunnel 等）
  if (exported.jumpHost && typeof exported.jumpHost === 'object') {
    const jumpHost = exported.jumpHost as Record<string, unknown>
    delete jumpHost.password
    delete jumpHost.privateKey
  }

  if (exported.proxy && typeof exported.proxy === 'object') {
    const proxy = exported.proxy as Record<string, unknown>
    delete proxy.password
  }

  if (exported.sshTunnel && typeof exported.sshTunnel === 'object') {
    const tunnel = exported.sshTunnel as Record<string, unknown>
    delete tunnel.password
    delete tunnel.privateKey
  }

  // 处理中间件配置中的敏感字段
  if (exported.redisConfig && typeof exported.redisConfig === 'object') {
    const config = exported.redisConfig as Record<string, unknown>
    delete config.password
  }

  if (exported.kafkaConfig && typeof exported.kafkaConfig === 'object') {
    const config = exported.kafkaConfig as Record<string, unknown>
    delete config.password
  }

  if (exported.esConfig && typeof exported.esConfig === 'object') {
    const config = exported.esConfig as Record<string, unknown>
    delete config.password
    delete config.apiKey
  }

  return exported as unknown as ExportedConnection
}

/**
 * 获取目录的所有子目录ID（递归）
 */
const getAllChildFolderIds = (folderId: string, folders: Folder[]): string[] => {
  const childIds: string[] = []
  const directChildren = folders.filter((f) => f.parentId === folderId)

  for (const child of directChildren) {
    childIds.push(child.id)
    childIds.push(...getAllChildFolderIds(child.id, folders))
  }

  return childIds
}

/**
 * 生成导出配置
 */
export const generateExportConfig = (
  folders: Folder[],
  connections: Connection[],
  options: ExportOptions
): ExportConfig => {
  let filteredFolders = [...folders]
  let filteredConnections = [...connections]

  // 按模块类型过滤
  if (options.moduleTypes.length > 0) {
    const moduleSet = new Set(options.moduleTypes)
    filteredFolders = filteredFolders.filter((f) => moduleSet.has(f.moduleType))
    filteredConnections = filteredConnections.filter((c) => moduleSet.has(c.moduleType))
  }

  // 按目录过滤
  if (options.folderIds.length > 0) {
    const folderIdSet = new Set(options.folderIds)

    // 添加所有子目录
    for (const folderId of options.folderIds) {
      const childIds = getAllChildFolderIds(folderId, folders)
      childIds.forEach((id) => folderIdSet.add(id))
    }

    filteredFolders = filteredFolders.filter((f) => folderIdSet.has(f.id))
    filteredConnections = filteredConnections.filter(
      (c) => c.folderId === null || folderIdSet.has(c.folderId)
    )
  }

  // 处理敏感信息
  const exportedConnections: ExportedConnection[] = filteredConnections.map((conn) =>
    options.includeSensitiveData ? conn : removeSensitiveData(conn)
  )

  return {
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    appVersion: APP_VERSION,
    folders: filteredFolders,
    connections: exportedConnections,
  }
}

/**
 * 生成导出文件名
 */
export const generateExportFileName = (encrypted: boolean = false): string => {
  const date = new Date()
  const dateStr = date.toISOString().split('T')[0]
  const timeStr = date.toTimeString().split(' ')[0].replace(/:/g, '-')
  const extension = encrypted ? ENCRYPTED_FILE_EXTENSION : EXPORT_FILE_EXTENSION
  return `zwd-opsbot-config-${dateStr}-${timeStr}${extension}`
}

/**
 * 使用固定密钥加密数据（用于导出）
 */
export const encryptConfigForExport = async (data: string): Promise<string> => {
  return await invoke<string>('encrypt_storage', { data })
}

/**
 * 导出配置到文件
 * 使用 Tauri 文件对话框让用户选择保存位置
 * 始终使用固定密钥加密，简化用户操作
 */
export const exportConfigToFile = async (
  folders: Folder[],
  connections: Connection[],
  options: ExportOptions
): Promise<void> => {
  const config = generateExportConfig(folders, connections, options)
  const jsonStr = JSON.stringify(config, null, 2)

  // 始终加密导出
  const content = await encryptConfigForExport(jsonStr)

  // 使用 Tauri 文件保存对话框
  const filePath = await save({
    defaultPath: generateExportFileName(true),
    filters: [
      {
        name: 'ZWD-OpsBot Config',
        extensions: ['zwd-config.enc'],
      },
    ],
  })

  if (filePath) {
    await writeTextFile(filePath, content)
  }
}

/**
 * 获取导出配置的统计信息
 */
export const getExportStats = (
  folders: Folder[],
  connections: Connection[],
  options: ExportOptions
): { folderCount: number; connectionCount: number; moduleTypes: ModuleType[] } => {
  const config = generateExportConfig(folders, connections, options)
  const moduleTypes = [...new Set(config.connections.map((c) => c.moduleType))]

  return {
    folderCount: config.folders.length,
    connectionCount: config.connections.length,
    moduleTypes,
  }
}
