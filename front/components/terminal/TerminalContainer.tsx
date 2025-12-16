/**
 * Terminal Container Component
 *
 * Wrapper component that combines Terminal and TerminalToolbar.
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen, UnlistenFn } from '@tauri-apps/api/event'
import { save } from '@tauri-apps/plugin-dialog'
import { writeTextFile } from '@tauri-apps/plugin-fs'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { SearchAddon } from '@xterm/addon-search'
import { WebglAddon } from '@xterm/addon-webgl'
import * as ContextMenu from '@radix-ui/react-context-menu'
import {
  TrashIcon,
  UnplugIcon,
  RefreshCwIcon,
  SaveIcon,
  PlayCircleIcon,
  StopCircleIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTranslation } from 'react-i18next'
import { useThemeStore } from '@/stores'
import { TerminalToolbar } from './TerminalToolbar'
import { FilePanel } from '@/components/sftp/FilePanel'
import '@xterm/xterm/css/xterm.css'

// Terminal theme configurations
const darkTheme = {
  background: '#1a1a1a',
  foreground: '#ffffff',
  cursor: '#ffffff',
  cursorAccent: '#1a1a1a',
  selectionBackground: '#3b82f6',
  selectionForeground: '#ffffff',
  black: '#000000',
  red: '#ef4444',
  green: '#22c55e',
  yellow: '#eab308',
  blue: '#3b82f6',
  magenta: '#a855f7',
  cyan: '#06b6d4',
  white: '#ffffff',
  brightBlack: '#666666',
  brightRed: '#f87171',
  brightGreen: '#4ade80',
  brightYellow: '#facc15',
  brightBlue: '#60a5fa',
  brightMagenta: '#c084fc',
  brightCyan: '#22d3ee',
  brightWhite: '#ffffff',
}

const lightTheme = {
  background: '#ffffff',
  foreground: '#1a1a1a',
  cursor: '#1a1a1a',
  cursorAccent: '#ffffff',
  selectionBackground: '#3b82f6',
  selectionForeground: '#ffffff',
  black: '#000000',
  red: '#dc2626',
  green: '#16a34a',
  yellow: '#ca8a04',
  blue: '#2563eb',
  magenta: '#9333ea',
  cyan: '#0891b2',
  white: '#f5f5f5',
  brightBlack: '#737373',
  brightRed: '#ef4444',
  brightGreen: '#22c55e',
  brightYellow: '#eab308',
  brightBlue: '#3b82f6',
  brightMagenta: '#a855f7',
  brightCyan: '#06b6d4',
  brightWhite: '#ffffff',
}

// UTF-8 safe base64 decoding
function base64ToUtf8(base64: string): string {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  const decoder = new TextDecoder('utf-8')
  return decoder.decode(bytes)
}

interface TerminalContainerProps {
  sessionId?: string
  className?: string
  onConnected?: () => void
  onDisconnected?: () => void
  onError?: (error: string) => void
}

export function TerminalContainer({
  sessionId,
  className,
  onConnected,
  onDisconnected,
  onError,
}: TerminalContainerProps) {
  const { t } = useTranslation()
  const { theme } = useThemeStore()
  const isDark = theme === 'dark'
  const [fontSize, setFontSize] = useState(14)
  const [filePanelVisible, setFilePanelVisible] = useState(false)
  const [isLogging, setIsLogging] = useState(false)
  const [logPath, setLogPath] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<XTerm | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const searchAddonRef = useRef<SearchAddon | null>(null)
  const currentSessionId = useRef<string | null>(sessionId || null)
  // logContentRef is reserved for future use (e.g., batch logging)

  // Initialize terminal
  useEffect(() => {
    if (!containerRef.current) return

    const terminal = new XTerm({
      fontSize,
      fontFamily: 'JetBrains Mono, Fira Code, monospace',
      theme: isDark ? darkTheme : lightTheme,
      cursorBlink: true,
      cursorStyle: 'block',
      scrollback: 10000,
      allowProposedApi: true,
    })

    // Add addons
    const fitAddon = new FitAddon()
    const webLinksAddon = new WebLinksAddon()
    const searchAddon = new SearchAddon()

    terminal.loadAddon(fitAddon)
    terminal.loadAddon(webLinksAddon)
    terminal.loadAddon(searchAddon)

    // Try to load WebGL addon
    try {
      const webglAddon = new WebglAddon()
      terminal.loadAddon(webglAddon)
    } catch {
      // WebGL not supported
    }

    terminal.open(containerRef.current)
    fitAddon.fit()

    terminalRef.current = terminal
    fitAddonRef.current = fitAddon
    searchAddonRef.current = searchAddon

    // Handle resize
    const handleResize = () => {
      if (fitAddonRef.current) {
        fitAddonRef.current.fit()
        if (currentSessionId.current) {
          invoke('ssh_resize', {
            sessionId: currentSessionId.current,
            cols: terminal.cols,
            rows: terminal.rows,
          }).catch(() => { /* ignore */ })
        }
      }
    }

    const resizeObserver = new ResizeObserver(handleResize)
    resizeObserver.observe(containerRef.current)

    // Handle user input
    terminal.onData((data) => {
      if (currentSessionId.current) {
        const base64Data = btoa(data)
        invoke('ssh_send_data', {
          sessionId: currentSessionId.current,
          data: base64Data,
        }).catch((err) => {
          onError?.(`Failed to send data: ${err}`)
        })
      }
    })

    // Cleanup
    return () => {
      resizeObserver.disconnect()
      terminal.dispose()
    }
  }, [])

  // Update theme when it changes
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.options.theme = isDark ? darkTheme : lightTheme
      // Force refresh to apply new theme colors
      terminalRef.current.refresh(0, terminalRef.current.rows - 1)
    }
  }, [isDark])

  // Listen for SSH events
  useEffect(() => {
    if (!sessionId) return

    currentSessionId.current = sessionId
    let unlistenData: UnlistenFn | undefined
    let unlistenStatus: UnlistenFn | undefined
    let isMounted = true

    const setupListeners = async () => {
      // 设置数据监听
      const dataListener = await listen<string>(`ssh-data-${sessionId}`, (event) => {
        if (terminalRef.current && isMounted) {
          const data = base64ToUtf8(event.payload)
          terminalRef.current.write(data)
        }
      })

      // 设置状态监听
      const statusListener = await listen<string>(`ssh-status-${sessionId}`, (event) => {
        if (event.payload === 'disconnected' && isMounted) {
          onDisconnected?.()
          terminalRef.current?.write('\r\n\x1b[31m[Connection closed]\x1b[0m\r\n')
        }
      })

      // 如果组件已经卸载，立即清理监听器
      if (!isMounted) {
        dataListener()
        statusListener()
        return
      }

      unlistenData = dataListener
      unlistenStatus = statusListener
      onConnected?.()
    }

    setupListeners()

    return () => {
      isMounted = false
      unlistenData?.()
      unlistenStatus?.()
    }
  }, [sessionId, onConnected, onDisconnected])

  // Update font size
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.options.fontSize = fontSize
      fitAddonRef.current?.fit()
    }
  }, [fontSize])

  // Copy & Paste handlers
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'c') {
        const selection = terminalRef.current?.getSelection()
        if (selection) {
          e.preventDefault()
          navigator.clipboard.writeText(selection)
        }
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'v') {
        e.preventDefault()
        navigator.clipboard.readText().then((text) => {
          if (text && currentSessionId.current) {
            const base64Data = btoa(text)
            invoke('ssh_send_data', {
              sessionId: currentSessionId.current,
              data: base64Data,
            })
          }
        })
      }
    }

    const container = containerRef.current?.parentElement
    container?.addEventListener('keydown', handleKeyDown)
    return () => container?.removeEventListener('keydown', handleKeyDown)
  }, [])

  // 清屏
  const handleClear = useCallback(() => {
    if (terminalRef.current) {
      terminalRef.current.clear()
    }
  }, [])

  // 断开连接
  const handleDisconnect = useCallback(async () => {
    if (currentSessionId.current) {
      try {
        await invoke('ssh_disconnect', { sessionId: currentSessionId.current })
        terminalRef.current?.write('\r\n\x1b[33m[Disconnected by user]\x1b[0m\r\n')
        onDisconnected?.()
      } catch (err) {
        onError?.(`Disconnect failed: ${err}`)
      }
    }
  }, [onDisconnected, onError])

  // 重新连接
  const handleReconnect = useCallback(async () => {
    if (currentSessionId.current) {
      try {
        terminalRef.current?.write('\r\n\x1b[36m[Reconnecting...]\x1b[0m\r\n')
        await invoke('ssh_reconnect', { sessionId: currentSessionId.current })
        terminalRef.current?.write('\x1b[32m[Reconnected]\x1b[0m\r\n')
        onConnected?.()
      } catch (err) {
        onError?.(`Reconnect failed: ${err}`)
        terminalRef.current?.write(`\r\n\x1b[31m[Reconnect failed: ${err}]\x1b[0m\r\n`)
      }
    }
  }, [onConnected, onError])

  // 保存当前日志
  const handleSaveLog = useCallback(async () => {
    if (!terminalRef.current) return

    try {
      // 获取终端所有内容
      const buffer = terminalRef.current.buffer.active
      let content = ''
      for (let i = 0; i < buffer.length; i++) {
        const line = buffer.getLine(i)
        if (line) {
          content += line.translateToString(true) + '\n'
        }
      }

      const filePath = await save({
        defaultPath: `terminal-log-${new Date().toISOString().replace(/[:.]/g, '-')}.log`,
        title: t('terminal.saveLog'),
        filters: [{ name: 'Log Files', extensions: ['log', 'txt'] }],
      })

      if (filePath) {
        await writeTextFile(filePath, content)
      }
    } catch (err) {
      onError?.(`Save log failed: ${err}`)
    }
  }, [t, onError])

  // 开始/停止记录日志
  const handleStartLogging = useCallback(async () => {
    if (isLogging) {
      // 停止记录
      setIsLogging(false)
      terminalRef.current?.write(`\r\n\x1b[32m[Logging stopped: ${logPath}]\x1b[0m\r\n`)
      setLogPath(null)
    } else {
      // 选择保存路径并开始记录
      try {
        const filePath = await save({
          defaultPath: `terminal-session-${new Date().toISOString().replace(/[:.]/g, '-')}.log`,
          title: t('terminal.selectLogPath'),
          filters: [{ name: 'Log Files', extensions: ['log', 'txt'] }],
        })

        if (filePath) {
          // 初始化日志文件，写入开始时间
          const header = `=== Terminal Log Started: ${new Date().toISOString()} ===\n`
          await writeTextFile(filePath, header)
          setLogPath(filePath)
          setIsLogging(true)
          terminalRef.current?.write(`\r\n\x1b[36m[Logging started: ${filePath}]\x1b[0m\r\n`)
        }
      } catch (err) {
        onError?.(`Start logging failed: ${err}`)
      }
    }
  }, [isLogging, logPath, t, onError])

  // 当接收到数据时实时追加到日志文件
  useEffect(() => {
    if (!sessionId || !isLogging || !logPath) return

    let buffer = ''
    let writeTimer: ReturnType<typeof setTimeout> | null = null

    // 批量写入，避免频繁 I/O
    const flushBuffer = async () => {
      if (buffer && logPath) {
        try {
          // 读取现有内容并追加
          const currentContent = buffer
          buffer = ''
          // 使用 invoke 调用后端追加写入
          await invoke('append_to_file', { path: logPath, content: currentContent })
        } catch {
          // 忽略写入错误，继续记录
        }
      }
    }

    const unsubscribe = listen<string>(`ssh-data-${sessionId}`, (event) => {
      const data = base64ToUtf8(event.payload)
      buffer += data

      // 清除旧定时器，设置新定时器（500ms 后写入）
      if (writeTimer) clearTimeout(writeTimer)
      writeTimer = setTimeout(flushBuffer, 500)
    })

    return () => {
      // 清理：写入剩余内容
      if (writeTimer) clearTimeout(writeTimer)
      if (buffer) {
        invoke('append_to_file', { path: logPath, content: buffer }).catch(() => {})
      }
      unsubscribe.then((fn) => fn())
    }
  }, [sessionId, isLogging, logPath])

  return (
    <div className={cn('flex h-full', className)}>
      {/* Terminal area */}
      <div className="flex-1 flex flex-col min-w-0">
        <TerminalToolbar
          fontSize={fontSize}
          onFontSizeChange={setFontSize}
          filePanelVisible={filePanelVisible}
          onToggleFilePanel={() => setFilePanelVisible(!filePanelVisible)}
        />
        {/* Terminal with context menu */}
        <ContextMenu.Root>
          <ContextMenu.Trigger asChild>
            <div ref={containerRef} className={cn("flex-1 overflow-hidden", isDark ? "bg-[#1a1a1a]" : "bg-white")} />
          </ContextMenu.Trigger>
          <ContextMenu.Portal>
            <ContextMenu.Content className={cn(
              "min-w-[180px] rounded-md p-1 shadow-lg z-50",
              isDark ? "bg-dark-bg-tertiary border border-dark-border" : "bg-light-bg-primary border border-light-border"
            )}>
              <ContextMenu.Item
                onSelect={handleClear}
                className={cn(
                  "flex items-center gap-2 px-2 py-1.5 text-sm rounded cursor-pointer outline-none",
                  isDark ? "text-dark-text-primary hover:bg-dark-bg-hover" : "text-light-text-primary hover:bg-light-bg-hover"
                )}
              >
                <TrashIcon className="w-4 h-4" />
                {t('terminal.clear')}
              </ContextMenu.Item>

              <ContextMenu.Separator className={cn("h-px my-1", isDark ? "bg-dark-border" : "bg-light-border")} />

              <ContextMenu.Item
                onSelect={handleDisconnect}
                className={cn(
                  "flex items-center gap-2 px-2 py-1.5 text-sm rounded cursor-pointer outline-none",
                  isDark ? "text-dark-text-primary hover:bg-dark-bg-hover" : "text-light-text-primary hover:bg-light-bg-hover"
                )}
              >
                <UnplugIcon className="w-4 h-4" />
                {t('terminal.disconnect')}
              </ContextMenu.Item>
              <ContextMenu.Item
                onSelect={handleReconnect}
                className={cn(
                  "flex items-center gap-2 px-2 py-1.5 text-sm rounded cursor-pointer outline-none",
                  isDark ? "text-dark-text-primary hover:bg-dark-bg-hover" : "text-light-text-primary hover:bg-light-bg-hover"
                )}
              >
                <RefreshCwIcon className="w-4 h-4" />
                {t('terminal.reconnect')}
              </ContextMenu.Item>

              <ContextMenu.Separator className={cn("h-px my-1", isDark ? "bg-dark-border" : "bg-light-border")} />

              <ContextMenu.Item
                onSelect={handleSaveLog}
                className={cn(
                  "flex items-center gap-2 px-2 py-1.5 text-sm rounded cursor-pointer outline-none",
                  isDark ? "text-dark-text-primary hover:bg-dark-bg-hover" : "text-light-text-primary hover:bg-light-bg-hover"
                )}
              >
                <SaveIcon className="w-4 h-4" />
                {t('terminal.saveLog')}
              </ContextMenu.Item>
              <ContextMenu.Item
                onSelect={handleStartLogging}
                className={cn(
                  "flex items-center gap-2 px-2 py-1.5 text-sm rounded cursor-pointer outline-none",
                  isDark ? "text-dark-text-primary hover:bg-dark-bg-hover" : "text-light-text-primary hover:bg-light-bg-hover"
                )}
              >
                {isLogging ? (
                  <>
                    <StopCircleIcon className="w-4 h-4 text-red-400" />
                    <span className="text-red-400">{t('terminal.stopLogging')}</span>
                  </>
                ) : (
                  <>
                    <PlayCircleIcon className="w-4 h-4" />
                    {t('terminal.startLogging')}
                  </>
                )}
              </ContextMenu.Item>
            </ContextMenu.Content>
          </ContextMenu.Portal>
        </ContextMenu.Root>
      </div>

      {/* File panel */}
      {sessionId && (
        <FilePanel
          sessionId={sessionId}
          visible={filePanelVisible}
          onClose={() => setFilePanelVisible(false)}
        />
      )}
    </div>
  )
}
