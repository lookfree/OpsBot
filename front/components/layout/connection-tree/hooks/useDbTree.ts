/**
 * Database Tree Hook
 * Manages database tree state and operations
 */

import { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { dbConnect, dbGetDatabases, dbGetSchemas, dbGetObjectsCount, dbGetTables, dbGetViews, dbGetRoutines } from '@/services/database'
import { DatabaseConnection } from '@/types'
import { DbTreeNode } from '../types'

interface UseDbTreeOptions {
  connection: DatabaseConnection
  onStatusChange: (status: 'connecting' | 'connected' | 'error' | 'disconnected') => void
}

interface UseDbTreeResult {
  dbExpanded: boolean
  dbLoading: boolean
  dbTree: DbTreeNode[]
  expandedDbNodes: Set<string>
  loadingDbNodes: Set<string>
  handleDbConnectionClick: () => Promise<void>
  handleDbNodeClick: (dbNode: DbTreeNode) => Promise<void>
  refreshDatabases: () => Promise<void>
  collapseAll: () => void
}

/**
 * Helper to update tree node recursively
 */
function updateTreeNode(nodes: DbTreeNode[], targetId: string, update: Partial<DbTreeNode>): DbTreeNode[] {
  return nodes.map((n) => {
    if (n.id === targetId) {
      return { ...n, ...update }
    }
    if (n.children && n.children.length > 0) {
      return { ...n, children: updateTreeNode(n.children, targetId, update) }
    }
    return n
  })
}

export function useDbTree({ connection, onStatusChange }: UseDbTreeOptions): UseDbTreeResult {
  const { t } = useTranslation()
  const [dbExpanded, setDbExpanded] = useState(false)
  const [dbLoading, setDbLoading] = useState(false)
  const [dbTree, setDbTree] = useState<DbTreeNode[]>([])
  const [expandedDbNodes, setExpandedDbNodes] = useState<Set<string>>(new Set())
  const [loadingDbNodes, setLoadingDbNodes] = useState<Set<string>>(new Set())

  const hasSchemaSupport = connection.dbType === 'postgresql' || connection.dbType === 'kingbase'
  const isClickHouse = connection.dbType === 'clickhouse'

  // Handle database connection expand/collapse
  const handleDbConnectionClick = useCallback(async () => {
    if (dbExpanded) {
      setDbExpanded(false)
      return
    }

    setDbLoading(true)
    onStatusChange('connecting')

    try {
      await dbConnect({
        connectionId: connection.id,
        dbType: connection.dbType || 'mysql',
        host: connection.host,
        port: connection.port,
        username: connection.username,
        password: connection.password,
        database: connection.database,
        connectionUrl: connection.connectionUrl,
        driverVersion: connection.driverVersion,
      })

      onStatusChange('connected')

      const dbs = await dbGetDatabases(connection.id)
      const tree: DbTreeNode[] = dbs.map((dbName) => ({
        id: `db:${connection.id}:${dbName}`,
        name: dbName,
        type: 'database' as const,
        children: [],
      }))

      setDbTree(tree)
      setDbExpanded(true)
    } catch (err) {
      console.error('[DB] Failed to connect or fetch databases:', err)
      onStatusChange('error')
    } finally {
      setDbLoading(false)
    }
  }, [connection, dbExpanded, onStatusChange])

  // Handle database node expand
  const handleDbNodeClick = useCallback(async (dbNode: DbTreeNode) => {
    const nodeId = dbNode.id

    if (expandedDbNodes.has(nodeId)) {
      setExpandedDbNodes((prev) => {
        const next = new Set(prev)
        next.delete(nodeId)
        return next
      })
      return
    }

    // For database node
    if (dbNode.type === 'database') {
      if (dbNode.children && dbNode.children.length > 0) {
        setExpandedDbNodes((prev) => new Set(prev).add(nodeId))
        return
      }

      setLoadingDbNodes((prev) => new Set(prev).add(nodeId))
      try {
        if (hasSchemaSupport) {
          // For URL mode, don't reconnect if it's the same database from URL
          // Otherwise reconnect to the specified database
          if (!connection.connectionUrl) {
            await dbConnect({
              connectionId: connection.id,
              dbType: connection.dbType,
              host: connection.host,
              port: connection.port,
              username: connection.username,
              password: connection.password,
              database: dbNode.name,
              driverVersion: connection.driverVersion,
            })
          }

          const schemas = await dbGetSchemas(connection.id, dbNode.name)
          const schemaNodes: DbTreeNode[] = schemas.map((schemaName) => ({
            id: `schema:${connection.id}:${dbNode.name}:${schemaName}`,
            name: schemaName,
            type: 'schema' as const,
            dbName: dbNode.name,
            children: [],
          }))
          setDbTree((prev) => updateTreeNode(prev, nodeId, { children: schemaNodes }))
        } else {
          const counts = await dbGetObjectsCount(connection.id, dbNode.name)
          const categories: DbTreeNode[] = [
            { id: `cat:${connection.id}:${dbNode.name}::tables`, name: t('database.tables'), type: 'category', count: counts.tables, dbName: dbNode.name, children: [] },
            { id: `cat:${connection.id}:${dbNode.name}::views`, name: t('database.views'), type: 'category', count: counts.views, dbName: dbNode.name, children: [] },
            ...(!isClickHouse ? [
              { id: `cat:${connection.id}:${dbNode.name}::functions`, name: t('database.functions'), type: 'category' as const, count: counts.functions, dbName: dbNode.name, children: [] },
              { id: `cat:${connection.id}:${dbNode.name}::procedures`, name: t('database.procedures'), type: 'category' as const, count: counts.procedures, dbName: dbNode.name, children: [] },
            ] : []),
          ]
          setDbTree((prev) => updateTreeNode(prev, nodeId, { children: categories }))
        }
      } catch (err) {
        console.error('Failed to load database objects:', err)
      } finally {
        setLoadingDbNodes((prev) => {
          const next = new Set(prev)
          next.delete(nodeId)
          return next
        })
      }
    }

    // For schema node (PostgreSQL only)
    if (dbNode.type === 'schema' && (!dbNode.children || dbNode.children.length === 0)) {
      setLoadingDbNodes((prev) => new Set(prev).add(nodeId))
      try {
        const dbName = dbNode.dbName || ''
        const schemaName = dbNode.name
        const counts = await dbGetObjectsCount(connection.id, dbName, schemaName)
        const categories: DbTreeNode[] = [
          { id: `cat:${connection.id}:${dbName}:${schemaName}:tables`, name: t('database.tables'), type: 'category', count: counts.tables, dbName, schemaName, children: [] },
          { id: `cat:${connection.id}:${dbName}:${schemaName}:views`, name: t('database.views'), type: 'category', count: counts.views, dbName, schemaName, children: [] },
          { id: `cat:${connection.id}:${dbName}:${schemaName}:functions`, name: t('database.functions'), type: 'category', count: counts.functions, dbName, schemaName, children: [] },
          { id: `cat:${connection.id}:${dbName}:${schemaName}:procedures`, name: t('database.procedures'), type: 'category', count: counts.procedures, dbName, schemaName, children: [] },
        ]
        setDbTree((prev) => updateTreeNode(prev, nodeId, { children: categories }))
      } catch (err) {
        console.error('Failed to load schema objects:', err)
      } finally {
        setLoadingDbNodes((prev) => {
          const next = new Set(prev)
          next.delete(nodeId)
          return next
        })
      }
    }

    // For category node, load items
    if (dbNode.type === 'category' && (!dbNode.children || dbNode.children.length === 0)) {
      setLoadingDbNodes((prev) => new Set(prev).add(nodeId))
      try {
        const parts = nodeId.split(':')
        const dbName = parts[2]
        const schemaName = parts[3] || undefined
        const catType = parts[4]

        let items: DbTreeNode[] = []
        if (catType === 'tables') {
          const tables = await dbGetTables(connection.id, dbName, schemaName)
          items = tables.map((tbl) => ({ id: `tbl:${connection.id}:${dbName}:${schemaName || ''}:${tbl.name}`, name: tbl.name, type: 'table' as const, engine: tbl.tableType }))
        } else if (catType === 'views') {
          const views = await dbGetViews(connection.id, dbName, schemaName)
          items = views.map((v) => ({ id: `view:${connection.id}:${dbName}:${schemaName || ''}:${v.name}`, name: v.name, type: 'view' as const }))
        } else if (catType === 'functions' || catType === 'procedures') {
          const routines = await dbGetRoutines(connection.id, dbName, schemaName)
          items = routines
            .filter((r) => (catType === 'functions' ? r.routineType === 'FUNCTION' : r.routineType === 'PROCEDURE'))
            .map((r) => ({ id: `${catType}:${connection.id}:${dbName}:${schemaName || ''}:${r.name}`, name: r.name, type: catType === 'functions' ? 'function' as const : 'procedure' as const }))
        }

        setDbTree((prev) => updateTreeNode(prev, nodeId, { children: items }))
      } catch (err) {
        console.error('Failed to load category items:', err)
      } finally {
        setLoadingDbNodes((prev) => {
          const next = new Set(prev)
          next.delete(nodeId)
          return next
        })
      }
    }

    setExpandedDbNodes((prev) => new Set(prev).add(nodeId))
  }, [connection, expandedDbNodes, hasSchemaSupport, isClickHouse, t])

  // Refresh databases
  const refreshDatabases = useCallback(async () => {
    setDbLoading(true)
    try {
      let dbs: string[]
      if (connection.dbType === 'postgresql') {
        dbs = await dbGetSchemas(connection.id)
      } else {
        dbs = await dbGetDatabases(connection.id)
      }
      const tree: DbTreeNode[] = dbs.map((dbName) => ({
        id: `db:${connection.id}:${dbName}`,
        name: dbName,
        type: 'database' as const,
        children: [],
      }))
      setDbTree(tree)
      setExpandedDbNodes(new Set())
    } catch (err) {
      console.error('Failed to refresh databases:', err)
    } finally {
      setDbLoading(false)
    }
  }, [connection])

  // Collapse all and reset
  const collapseAll = useCallback(() => {
    setDbExpanded(false)
    setDbTree([])
    setExpandedDbNodes(new Set())
  }, [])

  return {
    dbExpanded,
    dbLoading,
    dbTree,
    expandedDbNodes,
    loadingDbNodes,
    handleDbConnectionClick,
    handleDbNodeClick,
    refreshDatabases,
    collapseAll,
  }
}
