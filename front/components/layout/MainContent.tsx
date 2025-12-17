/**
 * 主内容区组件
 */

import { useState, useCallback, useEffect, useRef, useMemo, Component, ErrorInfo, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { useTabStore, useConnectionStore } from '@/stores'
import { TabBar } from './TabBar'
import { Server, Database, Container, Settings2, AlertTriangle, Globe, Table2, Layers } from 'lucide-react'
import { getDatabaseIcon } from '@/components/icons/DatabaseIcons'
import { TerminalContainer } from '@/components/terminal'
import { DatabaseContainer } from '@/components/database'
import { SshConnectionDialog } from '@/components/ssh'
import { sshConnect } from '@/services'
import type { Tab, SSHConnection, DatabaseConnection } from '@/types'

// Error Boundary for catching render errors
interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

class ContentErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: ReactNode }) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('MainContent ErrorBoundary caught error:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-full p-4 text-status-error">
          <AlertTriangle className="w-12 h-12 mb-4" />
          <p className="text-lg font-medium mb-2">渲染错误 / Render Error</p>
          <p className="text-sm text-center max-w-md mb-2">{this.state.error?.message}</p>
          <pre className="text-xs text-center max-w-lg overflow-auto bg-dark-bg-secondary p-2 rounded mb-4">
            {this.state.error?.stack?.split('\n').slice(0, 5).join('\n')}
          </pre>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="px-4 py-2 bg-accent-primary text-white rounded hover:bg-accent-hover"
          >
            重试 / Retry
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

interface MainContentProps {
  className?: string
}

export function MainContent({ className }: MainContentProps) {
  const { tabs, activeTabId, updateTab } = useTabStore()
  const { connections, setConnectionStatus } = useConnectionStore()
  const activeTab = tabs.find((t) => t.id === activeTabId)
  const [showSshDialog, setShowSshDialog] = useState(false)

  // Build path segments for the active tab
  const pathSegments = useMemo(() => {
    if (!activeTab || !activeTab.connectionId) return []

    const connection = connections.find(c => c.id === activeTab.connectionId)
    if (!connection) return []

    const segments: { icon?: React.ComponentType<{ className?: string }>; label: string; type: string }[] = []

    if (activeTab.type === 'terminal') {
      const sshConn = connection as SSHConnection
      segments.push({ icon: Server, label: sshConn.host || sshConn.name, type: 'host' })
    } else if (activeTab.type === 'database') {
      const dbConn = connection as DatabaseConnection
      const DbIcon = getDatabaseIcon(dbConn.dbType || 'mysql')
      segments.push({ icon: DbIcon, label: dbConn.host || dbConn.name, type: 'host' })

      // Get tab data for database/schema/table info
      const tabData = activeTab.data as Record<string, unknown> | undefined
      if (tabData) {
        if (tabData.database) {
          segments.push({ icon: Database, label: tabData.database as string, type: 'database' })
        }
        if (tabData.schemaName) {
          segments.push({ icon: Layers, label: tabData.schemaName as string, type: 'schema' })
        }
        if (tabData.tableName) {
          segments.push({ icon: Table2, label: tabData.tableName as string, type: 'table' })
        }
      }
    }

    return segments
  }, [activeTab, connections])

  // Track tabs that are being connected to avoid duplicate connections
  const connectingTabsRef = useRef<Set<string>>(new Set())

  // Handle SSH connection
  const handleConnect = useCallback(async (tab: Tab) => {
    // Debug: log all data
    console.error('=== SSH Connect Debug ===')
    console.error('Tab:', tab)
    console.error('Tab connectionId:', tab.connectionId)
    console.error('All connections:', connections)

    if (!tab.connectionId) {
      console.error('No connectionId for tab:', tab.id)
      updateTab(tab.id, {
        status: 'error',
        data: { ...tab.data, error: 'No connection ID specified' },
      })
      return
    }

    const connection = connections.find(c => c.id === tab.connectionId) as SSHConnection | undefined
    console.error('Found connection:', connection)

    if (!connection) {
      console.error('Connection not found:', tab.connectionId)
      updateTab(tab.id, {
        status: 'error',
        data: { ...tab.data, error: 'Connection configuration not found' },
      })
      return
    }

    // Set connecting status
    updateTab(tab.id, {
      status: 'connecting',
      data: { ...tab.data, error: undefined },
    })

    // Update connection status to connecting (yellow dot)
    setConnectionStatus(tab.connectionId, 'connecting')

    // Build request object
    const request = {
      connectionId: connection.id,
      host: connection.host || '',
      port: connection.port || 22,
      username: connection.username || '',
      authType: (connection.authType || 'password') as 'password' | 'key',
      password: connection.password,
      privateKey: connection.privateKey,
      passphrase: connection.passphrase,
      terminalSize: { cols: 80, rows: 24 },
    }

    // Debug: log request data
    console.error('SSH Connect Request:', request)

    if (!request.host) {
      updateTab(tab.id, {
        status: 'error',
        data: { ...tab.data, error: 'Host address is empty' },
      })
      return
    }

    try {
      const sessionId = await sshConnect(request)

      // Update tab with session ID
      updateTab(tab.id, {
        data: { ...tab.data, sessionId, error: undefined },
        status: 'connected',
      })

      // Update connection status to connected (green dot)
      setConnectionStatus(tab.connectionId, 'connected')
    } catch (err) {
      console.error('Failed to connect:', err)
      updateTab(tab.id, {
        status: 'error',
        data: { ...tab.data, error: String(err) },
      })

      // Update connection status to error
      setConnectionStatus(tab.connectionId, 'error')
    }
  }, [connections, updateTab, setConnectionStatus])

  // Auto-connect tabs that are in 'connecting' status (triggered by double-click or context menu)
  useEffect(() => {
    tabs.forEach((tab) => {
      // Only process terminal tabs with 'connecting' status that haven't started connecting yet
      if (
        tab.type === 'terminal' &&
        tab.status === 'connecting' &&
        !tab.data?.sessionId &&
        !connectingTabsRef.current.has(tab.id)
      ) {
        connectingTabsRef.current.add(tab.id)
        handleConnect(tab).finally(() => {
          connectingTabsRef.current.delete(tab.id)
        })
      }
    })
  }, [tabs, handleConnect])

  return (
    <div className={cn('main-content flex flex-col flex-1 overflow-hidden', className)}>
      {/* 路径栏 - 显示当前 tab 的完整路径 */}
      {pathSegments.length > 0 && (
        <div className="path-bar flex items-center h-8 px-3 text-sm border-b border-dark-border bg-dark-bg-secondary">
          <span className="text-accent-primary mr-1">/</span>
          {pathSegments.map((segment, index) => (
            <div key={index} className="flex items-center">
              {index > 0 && <span className="mx-2 text-accent-primary">/</span>}
              {segment.icon && <segment.icon className="w-4 h-4 mr-1.5 text-accent-primary" />}
              <span className="text-accent-primary">{segment.label}</span>
            </div>
          ))}
        </div>
      )}

      {/* 标签页栏 */}
      <TabBar />

      {/* 内容区 */}
      <div className="flex-1 overflow-auto">
        <ContentErrorBoundary>
          {activeTab ? (
            <TabContent
              tab={activeTab}
              onConnect={() => handleConnect(activeTab)}
              onDisconnected={() => {
                if (activeTab.connectionId) {
                  setConnectionStatus(activeTab.connectionId, 'disconnected')
                  updateTab(activeTab.id, { status: 'disconnected' })
                }
              }}
            />
          ) : (
            <EmptyState onNewConnection={() => setShowSshDialog(true)} />
          )}
        </ContentErrorBoundary>
      </div>

      {/* SSH Connection Dialog */}
      <SshConnectionDialog
        open={showSshDialog}
        onOpenChange={setShowSshDialog}
      />
    </div>
  )
}

// 标签页内容
function TabContent({
  tab,
  onConnect,
  onDisconnected,
}: {
  tab: Tab
  onConnect: () => void
  onDisconnected?: () => void
}) {
  const { t } = useTranslation()
  const sessionId = tab.data?.sessionId as string | undefined
  const error = tab.data?.error as string | undefined
  const isConnecting = tab.status === 'connecting'

  // Terminal tab
  if (tab.type === 'terminal') {
    if (sessionId && tab.status === 'connected') {
      return (
        <TerminalContainer
          sessionId={sessionId}
          className="h-full"
          onDisconnected={onDisconnected}
        />
      )
    }

    // Not connected yet, show connect prompt
    return (
      <div className="flex flex-col items-center justify-center h-full text-secondary">
        <div className="text-center">
          <Server className="w-12 h-12 mx-auto mb-4 text-accent-primary" />
          <p className="text-lg mb-2">{tab.title}</p>
          <p className="text-sm text-disabled mb-4">{t('home.clickToConnect')}</p>

          {/* Error display */}
          {error && (
            <div className="mb-4 px-4 py-2 bg-status-error/10 text-status-error border border-status-error/30 rounded text-sm max-w-md">
              {error}
            </div>
          )}

          <button
            onClick={onConnect}
            disabled={isConnecting}
            className={cn(
              'px-4 py-2 rounded',
              'bg-accent-primary text-white',
              'hover:bg-accent-hover transition-colors',
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
          >
            {isConnecting ? t('status.connecting') : t('sidebar.connect')}
          </button>
        </div>
      </div>
    )
  }

  // Database tab - use key={tab.id} to ensure each tab has its own component instance
  if (tab.type === 'database' && tab.connectionId) {
    return (
      <DatabaseContainer
        key={tab.id}
        connectionId={tab.connectionId}
        className="h-full"
      />
    )
  }

  // Other tab types (placeholder)
  return (
    <div className="flex items-center justify-center h-full text-secondary">
      <div className="text-center">
        <p className="text-lg mb-2">{tab.title}</p>
        <p className="text-sm">{t('tabs.tabType')}: {tab.type}</p>
        <p className="text-xs mt-4 text-disabled">
          ({t('home.featureUnderDevelopment')})
        </p>
      </div>
    </div>
  )
}

// 空状态
function EmptyState({ onNewConnection }: { onNewConnection: () => void }) {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col items-center justify-center h-full text-secondary">
      <div className="text-center max-w-md">
        <h2 className="text-2xl font-semibold mb-4">{t('home.welcome')}</h2>
        <p className="text-sm mb-8 text-disabled">
          {t('home.description')}
        </p>

        <div className="grid grid-cols-2 gap-4">
          <QuickAction
            icon={Server}
            title={t('home.sshTerminal')}
            description={t('home.sshDescription')}
            onClick={onNewConnection}
          />
          <QuickAction
            icon={Database}
            title={t('home.databaseTitle')}
            description={t('home.databaseDescription')}
          />
          <QuickAction
            icon={Container}
            title={t('home.dockerTitle')}
            description={t('home.dockerDescription')}
          />
          <QuickAction
            icon={Settings2}
            title={t('home.middlewareTitle')}
            description={t('home.middlewareDescription')}
          />
        </div>

        <p className="text-xs mt-8 text-disabled">
          {t('home.tip')}
        </p>
      </div>
    </div>
  )
}

// 快速操作卡片
function QuickAction({
  icon: Icon,
  title,
  description,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  description: string
  onClick?: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="quick-action-card flex items-center gap-3 p-4 rounded-lg border transition-colors text-left"
    >
      <Icon className="w-6 h-6 text-accent-primary" />
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-disabled">{description}</p>
      </div>
    </button>
  )
}
