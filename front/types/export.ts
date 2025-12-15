/**
 * 配置导入导出相关类型定义
 */

import { Folder, Connection } from './connection'

// 导出配置版本
export const EXPORT_VERSION = '1.0'

// 导出文件扩展名
export const EXPORT_FILE_EXTENSION = '.zwd-config.json'

// 导出配置格式
export interface ExportConfig {
  version: string
  exportedAt: string
  appVersion: string
  folders: Folder[]
  connections: ExportedConnection[]
}

// 导出的连接（敏感信息可选脱敏）
export interface ExportedConnection extends Omit<Connection, 'password'> {
  // 密码字段可选，导出时可选择是否包含
  password?: string
  // 私钥字段可选
  privateKey?: string
  passphrase?: string
}

// 导出选项
export interface ExportOptions {
  // 是否包含密码等敏感信息
  includeSensitiveData: boolean
  // 导出的模块类型（空数组表示全部）
  moduleTypes: string[]
  // 导出的目录ID（空数组表示全部）
  folderIds: string[]
}

// 导入选项
export interface ImportOptions {
  // 导入模式：merge（合并）或 replace（替换）
  mode: 'merge' | 'replace'
  // 是否覆盖同名连接
  overwriteExisting: boolean
  // 导入的模块类型（空数组表示全部）
  moduleTypes: string[]
}

// 导入结果
export interface ImportResult {
  success: boolean
  message: string
  stats: {
    foldersImported: number
    foldersSkipped: number
    connectionsImported: number
    connectionsSkipped: number
    connectionsOverwritten: number
  }
  errors: string[]
}

// 配置校验结果
export interface ValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
  config?: ExportConfig
}
