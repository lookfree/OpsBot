/**
 * 配置导入服务
 * 从JSON文件导入连接和目录配置
 */

import { v4 as uuidv4 } from 'uuid'
import {
  ExportConfig,
  ImportOptions,
  ImportResult,
  ValidationResult,
  EXPORT_VERSION,
  Folder,
  Connection,
  ModuleType,
} from '@/types'

/**
 * 读取文件内容
 */
export const readFileContent = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('文件读取失败'))
    reader.readAsText(file)
  })
}

/**
 * 校验导入配置
 */
export const validateImportConfig = (content: string): ValidationResult => {
  const errors: string[] = []
  const warnings: string[] = []

  let config: ExportConfig

  // 解析JSON
  try {
    config = JSON.parse(content)
  } catch {
    return {
      valid: false,
      errors: ['无效的JSON格式'],
      warnings: [],
    }
  }

  // 检查版本
  if (!config.version) {
    errors.push('缺少版本信息')
  } else if (config.version !== EXPORT_VERSION) {
    warnings.push(`配置版本(${config.version})与当前版本(${EXPORT_VERSION})不匹配，可能存在兼容性问题`)
  }

  // 检查必要字段
  if (!Array.isArray(config.folders)) {
    errors.push('缺少folders字段或格式错误')
  }

  if (!Array.isArray(config.connections)) {
    errors.push('缺少connections字段或格式错误')
  }

  // 检查目录数据完整性
  if (Array.isArray(config.folders)) {
    config.folders.forEach((folder, index) => {
      if (!folder.id) {
        errors.push(`目录[${index}]缺少id`)
      }
      if (!folder.name) {
        errors.push(`目录[${index}]缺少name`)
      }
      if (!folder.moduleType) {
        errors.push(`目录[${index}]缺少moduleType`)
      } else if (!Object.values(ModuleType).includes(folder.moduleType)) {
        errors.push(`目录[${index}]的moduleType无效: ${folder.moduleType}`)
      }
    })
  }

  // 检查连接数据完整性
  if (Array.isArray(config.connections)) {
    config.connections.forEach((conn, index) => {
      if (!conn.id) {
        errors.push(`连接[${index}]缺少id`)
      }
      if (!conn.name) {
        errors.push(`连接[${index}]缺少name`)
      }
      if (!conn.moduleType) {
        errors.push(`连接[${index}]缺少moduleType`)
      } else if (!Object.values(ModuleType).includes(conn.moduleType)) {
        errors.push(`连接[${index}]的moduleType无效: ${conn.moduleType}`)
      }
    })

    // 检查敏感信息
    const hasPasswords = config.connections.some(
      (c) => 'password' in c || 'privateKey' in c
    )
    if (hasPasswords) {
      warnings.push('配置文件包含敏感信息（密码/密钥），请确保来源可信')
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    config: errors.length === 0 ? config : undefined,
  }
}

/**
 * 生成ID映射（用于处理目录层级关系）
 */
const generateIdMapping = (
  items: { id: string }[]
): Map<string, string> => {
  const mapping = new Map<string, string>()
  items.forEach((item) => {
    mapping.set(item.id, uuidv4())
  })
  return mapping
}

/**
 * 执行配置导入
 */
export const importConfig = (
  config: ExportConfig,
  existingFolders: Folder[],
  existingConnections: Connection[],
  options: ImportOptions
): ImportResult => {
  const result: ImportResult = {
    success: false,
    message: '',
    stats: {
      foldersImported: 0,
      foldersSkipped: 0,
      connectionsImported: 0,
      connectionsSkipped: 0,
      connectionsOverwritten: 0,
    },
    errors: [],
  }

  try {
    let foldersToImport = [...config.folders]
    let connectionsToImport = [...config.connections]

    // 按模块类型过滤
    if (options.moduleTypes.length > 0) {
      const moduleSet = new Set(options.moduleTypes)
      foldersToImport = foldersToImport.filter((f) => moduleSet.has(f.moduleType))
      connectionsToImport = connectionsToImport.filter((c) => moduleSet.has(c.moduleType))
    }

    const newFolders: Folder[] = []
    const newConnections: Connection[] = []

    if (options.mode === 'replace') {
      // 替换模式：清空现有数据，直接使用导入数据
      // 为目录生成新ID映射
      const folderIdMapping = generateIdMapping(foldersToImport)

      // 处理目录
      foldersToImport.forEach((folder) => {
        const newFolder: Folder = {
          ...folder,
          id: folderIdMapping.get(folder.id) || uuidv4(),
          parentId: folder.parentId ? folderIdMapping.get(folder.parentId) || null : null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }
        newFolders.push(newFolder)
        result.stats.foldersImported++
      })

      // 处理连接
      connectionsToImport.forEach((conn) => {
        const newConn: Connection = {
          ...conn,
          id: uuidv4(),
          folderId: conn.folderId ? folderIdMapping.get(conn.folderId) || null : null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        } as Connection
        newConnections.push(newConn)
        result.stats.connectionsImported++
      })
    } else {
      // 合并模式：保留现有数据，合并新数据
      // 保留现有数据
      newFolders.push(...existingFolders)
      newConnections.push(...existingConnections)

      // 为新目录生成ID映射
      const folderIdMapping = generateIdMapping(foldersToImport)

      // 处理目录（按名称和模块类型检查重复）
      foldersToImport.forEach((folder) => {
        const existingFolder = newFolders.find(
          (f) => f.name === folder.name && f.moduleType === folder.moduleType
        )

        if (existingFolder) {
          // 使用现有目录的ID更新映射
          folderIdMapping.set(folder.id, existingFolder.id)
          result.stats.foldersSkipped++
        } else {
          const newFolder: Folder = {
            ...folder,
            id: folderIdMapping.get(folder.id) || uuidv4(),
            parentId: folder.parentId ? folderIdMapping.get(folder.parentId) || null : null,
            order: newFolders.filter((f) => f.moduleType === folder.moduleType).length,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }
          newFolders.push(newFolder)
          result.stats.foldersImported++
        }
      })

      // 处理连接（按名称和模块类型检查重复）
      connectionsToImport.forEach((conn) => {
        const existingConnIndex = newConnections.findIndex(
          (c) => c.name === conn.name && c.moduleType === conn.moduleType
        )

        if (existingConnIndex !== -1) {
          if (options.overwriteExisting) {
            // 覆盖现有连接
            const existingId = newConnections[existingConnIndex].id
            newConnections[existingConnIndex] = {
              ...conn,
              id: existingId,
              folderId: conn.folderId ? folderIdMapping.get(conn.folderId) || null : null,
              updatedAt: new Date().toISOString(),
            } as Connection
            result.stats.connectionsOverwritten++
          } else {
            result.stats.connectionsSkipped++
          }
        } else {
          const newConn: Connection = {
            ...conn,
            id: uuidv4(),
            folderId: conn.folderId ? folderIdMapping.get(conn.folderId) || null : null,
            order: newConnections.filter((c) => c.moduleType === conn.moduleType).length,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          } as Connection
          newConnections.push(newConn)
          result.stats.connectionsImported++
        }
      })
    }

    result.success = true
    result.message = `导入完成：${result.stats.foldersImported}个目录，${result.stats.connectionsImported}个连接`

    // 返回处理后的数据供store使用
    return {
      ...result,
      // @ts-expect-error 添加额外数据供调用方使用
      folders: newFolders,
      connections: newConnections,
    }
  } catch (error) {
    result.errors.push(error instanceof Error ? error.message : '未知错误')
    result.message = '导入失败'
    return result
  }
}

/**
 * 获取导入预览信息
 */
export const getImportPreview = (
  config: ExportConfig,
  existingFolders: Folder[],
  existingConnections: Connection[],
  options: ImportOptions
): {
  newFolders: number
  duplicateFolders: number
  newConnections: number
  duplicateConnections: number
} => {
  let foldersToImport = [...config.folders]
  let connectionsToImport = [...config.connections]

  // 按模块类型过滤
  if (options.moduleTypes.length > 0) {
    const moduleSet = new Set(options.moduleTypes)
    foldersToImport = foldersToImport.filter((f) => moduleSet.has(f.moduleType))
    connectionsToImport = connectionsToImport.filter((c) => moduleSet.has(c.moduleType))
  }

  if (options.mode === 'replace') {
    return {
      newFolders: foldersToImport.length,
      duplicateFolders: 0,
      newConnections: connectionsToImport.length,
      duplicateConnections: 0,
    }
  }

  // 合并模式：检查重复
  const duplicateFolders = foldersToImport.filter((f) =>
    existingFolders.some((ef) => ef.name === f.name && ef.moduleType === f.moduleType)
  ).length

  const duplicateConnections = connectionsToImport.filter((c) =>
    existingConnections.some((ec) => ec.name === c.name && ec.moduleType === c.moduleType)
  ).length

  return {
    newFolders: foldersToImport.length - duplicateFolders,
    duplicateFolders,
    newConnections: connectionsToImport.length - duplicateConnections,
    duplicateConnections,
  }
}
