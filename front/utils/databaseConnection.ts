import type { Connection, DatabaseConnection, SSHConnection } from '@/types'
import type { DatabaseConnectRequest } from '@/services/database'
import { ModuleType } from '@/types'

export function buildDatabaseConnectRequest(
  connection: DatabaseConnection,
  allConnections: Connection[],
  overrides: Partial<Pick<DatabaseConnectRequest, 'database'>> = {}
): DatabaseConnectRequest {
  const request: DatabaseConnectRequest = {
    connectionId: connection.id,
    dbType: connection.dbType || 'mysql',
    host: connection.host,
    port: connection.port,
    username: connection.username,
    password: connection.password,
    database: overrides.database ?? connection.database,
    connectionUrl: connection.connectionUrl,
    driverVersion: connection.driverVersion,
  }

  const tunnel = connection.sshTunnel
  if (!tunnel?.enabled || !tunnel.sshConnectionId) {
    return request
  }

  const sshConnection = allConnections.find(
    (item): item is SSHConnection =>
      item.moduleType === ModuleType.SSH && item.id === tunnel.sshConnectionId
  )

  if (!sshConnection) {
    return request
  }

  request.sshTunnel = {
    enabled: true,
    host: sshConnection.host,
    port: sshConnection.port,
    username: sshConnection.username,
    authType: sshConnection.authType,
    password: sshConnection.password,
    privateKey: sshConnection.privateKey,
    passphrase: sshConnection.passphrase,
  }

  return request
}
