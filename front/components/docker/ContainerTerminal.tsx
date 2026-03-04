/**
 * Container Terminal Component
 *
 * XTerm.js based interactive terminal for Docker containers.
 * Provides a real terminal experience like `docker exec -it`.
 */

import { useEffect, useRef, useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { listen, UnlistenFn } from '@tauri-apps/api/event'
import { readText, writeText } from '@tauri-apps/plugin-clipboard-manager'
import { X, Terminal, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useThemeStore } from '@/stores'
import {
  dockerExecStart,
  dockerExecSendData,
  dockerExecResize,
  dockerExecClose,
} from '@/services/docker'
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

interface ContainerTerminalProps {
  connectionId: string
  containerId: string
  containerName: string
  onClose: () => void
}

export function ContainerTerminal({
  connectionId,
  containerId,
  containerName,
  onClose,
}: ContainerTerminalProps) {
  const { t } = useTranslation()
  const { theme } = useThemeStore()
  const isDark = theme === 'dark'

  const containerRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<XTerm | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const execIdRef = useRef<string | null>(null)

  const [connecting, setConnecting] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [shell, setShell] = useState('/bin/sh')

  // Theme styles
  const bgPrimary = isDark ? 'bg-dark-bg-primary' : 'bg-light-bg-primary'
  const borderColor = isDark ? 'border-dark-border' : 'border-light-border'
  const textPrimary = isDark ? 'text-dark-text-primary' : 'text-light-text-primary'
  const textSecondary = isDark ? 'text-dark-text-secondary' : 'text-light-text-secondary'
  const hoverBg = isDark ? 'hover:bg-dark-bg-hover' : 'hover:bg-light-bg-hover'
  const bgSecondary = isDark ? 'bg-dark-bg-secondary' : 'bg-light-bg-secondary'

  // Store unlisten function for cleanup
  const unlistenRef = useRef<UnlistenFn | null>(null)

  // Start exec session (shellOverride allows passing shell directly without waiting for state update)
  const startExec = useCallback(async (term: XTerm, shellOverride?: string) => {
    setConnecting(true)
    setError(null)

    const shellToUse = shellOverride ?? shell
    try {
      const execId = await dockerExecStart(
        connectionId,
        containerId,
        [shellToUse],
        term.cols,
        term.rows
      )
      execIdRef.current = execId

      // Set up event listener IMMEDIATELY after getting execId
      // This ensures we don't miss any data from the backend
      const eventName = `docker-exec-data-${execId}`
      console.log('Setting up listener for:', eventName)

      const unlisten = await listen<number[]>(eventName, (event) => {
        if (terminalRef.current) {
          // Write raw bytes directly - xterm handles UTF-8 decoding internally
          terminalRef.current.write(new Uint8Array(event.payload))
        }
      })

      // Store for cleanup
      if (unlistenRef.current) {
        unlistenRef.current()
      }
      unlistenRef.current = unlisten

      setConnecting(false)
    } catch (err) {
      setError(String(err))
      setConnecting(false)
      term.write(`\r\n\x1b[31m${t('docker.terminalError')}: ${err}\x1b[0m\r\n`)
    }
  }, [connectionId, containerId, shell, t])

  // Initialize terminal
  useEffect(() => {
    if (!containerRef.current) return

    const terminal = new XTerm({
      fontSize: 14,
      fontFamily: 'JetBrains Mono, Fira Code, monospace',
      theme: isDark ? darkTheme : lightTheme,
      cursorBlink: true,
      cursorStyle: 'block',
      scrollback: 10000,
      allowProposedApi: true,
      rightClickSelectsWord: true, // 禁用右键粘贴菜单，使用 Ctrl+V
    })

    // Add addons
    const fitAddon = new FitAddon()
    const webLinksAddon = new WebLinksAddon()

    terminal.loadAddon(fitAddon)
    terminal.loadAddon(webLinksAddon)

    // Note: WebGL addon disabled - can cause flickering in Tauri WebView
    // Canvas renderer is used by default and is stable

    terminal.open(containerRef.current)
    fitAddon.fit()

    terminalRef.current = terminal
    fitAddonRef.current = fitAddon

    // Handle resize with debounce - use longer debounce to batch resize events
    let resizeTimeout: ReturnType<typeof setTimeout> | null = null
    let lastSentSize = { cols: 0, rows: 0 }
    const handleResize = () => {
      if (resizeTimeout) {
        clearTimeout(resizeTimeout)
      }
      resizeTimeout = setTimeout(() => {
        if (fitAddonRef.current && terminalRef.current) {
          fitAddonRef.current.fit()
          // Notify backend about resize only if size actually changed
          if (execIdRef.current) {
            const cols = terminalRef.current.cols
            const rows = terminalRef.current.rows
            // Only send if reasonable values and different from last sent
            if (cols > 0 && cols < 500 && rows > 0 && rows < 200 &&
                (cols !== lastSentSize.cols || rows !== lastSentSize.rows)) {
              lastSentSize = { cols, rows }
              dockerExecResize(
                connectionId,
                execIdRef.current,
                cols,
                rows
              ).catch(() => { /* ignore resize errors */ })
            }
          }
        }
      }, 300) // Debounce 300ms - longer to batch resize events during layout
    }

    const resizeObserver = new ResizeObserver(handleResize)
    resizeObserver.observe(containerRef.current)

    // Handle user input
    terminal.onData((data) => {
      if (execIdRef.current) {
        // Convert string to byte array
        const encoder = new TextEncoder()
        const bytes = encoder.encode(data)
        const byteArray = Array.from(bytes)
        dockerExecSendData(connectionId, execIdRef.current, byteArray).catch((err) => {
          console.error('Failed to send data:', err)
        })
      }
    })

    // Start the exec session
    startExec(terminal)

    // Cleanup
    return () => {
      // Clear resize debounce timeout
      if (resizeTimeout) {
        clearTimeout(resizeTimeout)
      }
      resizeObserver.disconnect()
      // Clean up event listener
      if (unlistenRef.current) {
        unlistenRef.current()
        unlistenRef.current = null
      }
      if (execIdRef.current) {
        dockerExecClose(connectionId, execIdRef.current).catch(() => {})
        execIdRef.current = null
      }
      terminal.dispose()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionId, containerId])

  // Update theme when it changes - no refresh needed, xterm handles it automatically
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.options.theme = isDark ? darkTheme : lightTheme
    }
  }, [isDark])

  // Copy selection to clipboard
  const handleCopy = useCallback(async () => {
    if (terminalRef.current) {
      const selection = terminalRef.current.getSelection()
      if (selection) {
        await writeText(selection).catch(() => {})
      }
    }
  }, [])

  // Paste from clipboard
  const handlePaste = useCallback(async () => {
    try {
      const text = await readText()
      if (text && execIdRef.current) {
        const encoder = new TextEncoder()
        const bytes = encoder.encode(text)
        const byteArray = Array.from(bytes)
        await dockerExecSendData(connectionId, execIdRef.current, byteArray)
      }
    } catch (err) {
      console.error('Failed to paste:', err)
    }
  }, [connectionId])

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + C when there's selection = copy
      if ((e.metaKey || e.ctrlKey) && e.key === 'c') {
        const selection = terminalRef.current?.getSelection()
        if (selection) {
          e.preventDefault()
          handleCopy()
        }
      }
      // Cmd/Ctrl + V = paste
      if ((e.metaKey || e.ctrlKey) && e.key === 'v') {
        e.preventDefault()
        handlePaste()
      }
    }

    const container = containerRef.current
    container?.addEventListener('keydown', handleKeyDown)

    return () => {
      container?.removeEventListener('keydown', handleKeyDown)
    }
  }, [handleCopy, handlePaste])

  // Handle shell change
  const handleShellChange = useCallback(async (newShell: string) => {
    setShell(newShell)

    // Close current session and start new one
    if (execIdRef.current) {
      await dockerExecClose(connectionId, execIdRef.current).catch(() => {})
      execIdRef.current = null
    }

    if (terminalRef.current) {
      terminalRef.current.clear()
      // Pass newShell directly - React state update is async, shell from closure is still old value
      startExec(terminalRef.current, newShell)
    }
  }, [connectionId, startExec])

  // Handle close
  const handleClose = useCallback(async () => {
    if (execIdRef.current) {
      await dockerExecClose(connectionId, execIdRef.current).catch(() => {})
      execIdRef.current = null
    }
    onClose()
  }, [connectionId, onClose])

  return (
    <div className={cn('flex flex-col h-full', bgPrimary)}>
      {/* Header */}
      <div className={cn('flex items-center justify-between px-4 py-2 border-b', borderColor)}>
        <div className="flex items-center gap-2">
          <Terminal className={cn('w-5 h-5', textSecondary)} />
          <h3 className={cn('font-medium', textPrimary)}>
            {t('docker.terminal')}: {containerName}
          </h3>
          {connecting && (
            <Loader2 className="w-4 h-4 animate-spin text-status-info" />
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Shell selector */}
          <select
            value={shell}
            onChange={(e) => handleShellChange(e.target.value)}
            disabled={connecting}
            className={cn(
              'px-2 py-1 rounded text-sm border',
              bgSecondary,
              borderColor,
              textPrimary,
              'disabled:opacity-50'
            )}
          >
            <option value="/bin/sh">/bin/sh</option>
            <option value="/bin/bash">/bin/bash</option>
            <option value="/bin/ash">/bin/ash</option>
          </select>

          {/* Close button */}
          <button
            onClick={handleClose}
            className={cn('p-1.5 rounded transition-colors', hoverBg)}
            title={t('common.close')}
          >
            <X className={cn('w-4 h-4', textSecondary)} />
          </button>
        </div>
      </div>

      {/* Terminal area */}
      <div className="flex-1 relative">
        {error && (
          <div className={cn(
            'absolute inset-0 flex items-center justify-center',
            bgSecondary
          )}>
            <div className="text-center text-status-error">
              <p>{t('docker.terminalError')}</p>
              <p className="text-sm mt-2">{error}</p>
            </div>
          </div>
        )}
        <div
          ref={containerRef}
          className={cn(
            'absolute inset-0',
            isDark ? 'bg-[#1a1a1a]' : 'bg-white'
          )}
        />
      </div>
    </div>
  )
}
