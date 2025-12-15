/**
 * 连接与目录数据类型定义
 */

// 模块类型
export enum ModuleType {
  SSH = 'ssh',
  Database = 'database',
  Docker = 'docker',
  Middleware = 'middleware',
}

// 模块类型显示名称
export const ModuleTypeLabels: Record<ModuleType, string> = {
  [ModuleType.SSH]: 'SSH连接',
  [ModuleType.Database]: '数据库',
  [ModuleType.Docker]: 'Docker',
  [ModuleType.Middleware]: '中间件',
}

// 目录节点
export interface Folder {
  id: string
  name: string
  moduleType: ModuleType
  parentId: string | null
  order: number
  expanded: boolean
  createdAt: string
  updatedAt: string
}

// 连接基础信息
export interface ConnectionBase {
  id: string
  name: string
  moduleType: ModuleType
  folderId: string | null
  order: number
  tags: string[]
  createdAt: string
  updatedAt: string
  lastConnectedAt: string | null
}

// 认证方式
export type AuthType = 'password' | 'key' | 'interactive'

// SSH连接配置
export interface SSHConnection extends ConnectionBase {
  moduleType: ModuleType.SSH
  host: string
  port: number
  username: string
  authType: AuthType
  password?: string
  privateKey?: string
  passphrase?: string
  jumpHost?: {
    host: string
    port: number
    username: string
    authType: 'password' | 'key'
    password?: string
    privateKey?: string
  }
  proxy?: {
    type: 'socks5' | 'http'
    host: string
    port: number
    username?: string
    password?: string
  }
  terminalSettings?: {
    fontSize: number
    fontFamily: string
    colorScheme: string
  }
}

// 数据库类型
export type DatabaseType = 'mysql' | 'postgresql' | 'sqlite'

// 数据库连接配置
export interface DatabaseConnection extends ConnectionBase {
  moduleType: ModuleType.Database
  dbType: DatabaseType
  host: string
  port: number
  username: string
  password?: string
  database?: string
  sshTunnel?: {
    enabled: boolean
    sshConnectionId?: string
    host?: string
    port?: number
    username?: string
    authType?: 'password' | 'key'
    password?: string
    privateKey?: string
  }
}

// Docker连接类型
export type DockerConnectionType = 'local' | 'ssh' | 'tcp'

// Docker连接配置
export interface DockerConnection extends ConnectionBase {
  moduleType: ModuleType.Docker
  connectionType: DockerConnectionType
  sshConnectionId?: string
  host?: string
  port?: number
  tlsEnabled?: boolean
  tlsCert?: string
  tlsKey?: string
  tlsCa?: string
}

// 中间件类型
export type MiddlewareType = 'redis' | 'kafka' | 'elasticsearch' | 'clickhouse'

// Redis模式
export type RedisMode = 'standalone' | 'sentinel' | 'cluster'

// 中间件连接配置
export interface MiddlewareConnection extends ConnectionBase {
  moduleType: ModuleType.Middleware
  middlewareType: MiddlewareType
  redisConfig?: {
    mode: RedisMode
    nodes: { host: string; port: number }[]
    password?: string
    database?: number
  }
  kafkaConfig?: {
    bootstrapServers: string[]
    securityProtocol?: 'PLAINTEXT' | 'SASL_PLAINTEXT' | 'SASL_SSL'
    saslMechanism?: string
    username?: string
    password?: string
  }
  esConfig?: {
    nodes: string[]
    username?: string
    password?: string
    apiKey?: string
  }
  sshTunnel?: {
    enabled: boolean
    sshConnectionId?: string
  }
}

// 连接类型联合
export type Connection =
  | SSHConnection
  | DatabaseConnection
  | DockerConnection
  | MiddlewareConnection

// 连接状态
export type ConnectionStatus = 'connected' | 'disconnected' | 'connecting' | 'error'

// 连接树状态
export interface ConnectionTreeState {
  folders: Folder[]
  connections: Connection[]
}

// 树节点类型
export type TreeNodeType = 'module' | 'folder' | 'connection'

// 树节点
export interface TreeNode {
  id: string
  type: TreeNodeType
  name: string
  moduleType: ModuleType
  parentId: string | null
  order: number
  expanded?: boolean
  status?: ConnectionStatus
  children?: TreeNode[]
  data?: Folder | Connection
}
