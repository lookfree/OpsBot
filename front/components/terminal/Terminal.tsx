/**
 * Terminal Component
 *
 * XTerm.js based terminal component for SSH sessions.
 */

import { useEffect, useRef, useCallback } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { SearchAddon } from '@xterm/addon-search'
import { WebglAddon } from '@xterm/addon-webgl'
import { invoke } from '@tauri-apps/api/core'
import { listen, UnlistenFn } from '@tauri-apps/api/event'
import { cn } from '@/lib/utils'
import '@xterm/xterm/css/xterm.css'

export interface TerminalProps {
  sessionId?: string
  className?: string
  fontSize?: number
  fontFamily?: string
  onConnected?: () => void
  onDisconnected?: () => void
  onError?: (error: string) => void
}

export interface TerminalRef {
  write: (data: string) => void
  focus: () => void
  clear: () => void
  search: (text: string) => boolean
  searchNext: () => boolean
  searchPrevious: () => boolean
  resize: () => void
}

export function Terminal({
  sessionId,
  className,
  fontSize = 14,
  fontFamily = 'JetBrains Mono, Fira Code, monospace',
  onConnected,
  onDisconnected,
  onError,
}: TerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<XTerm | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const searchAddonRef = useRef<SearchAddon | null>(null)
  const currentSessionId = useRef<string | null>(sessionId || null)

  // Initialize terminal
  useEffect(() => {
    if (!containerRef.current) return

    const terminal = new XTerm({
      fontSize,
      fontFamily,
      theme: {
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
      },
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

    // Try to load WebGL addon for better performance
    try {
      const webglAddon = new WebglAddon()
      terminal.loadAddon(webglAddon)
    } catch {
      // WebGL not supported, continue without it
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
        // Notify backend about resize
        if (currentSessionId.current) {
          invoke('ssh_resize', {
            sessionId: currentSessionId.current,
            cols: terminal.cols,
            rows: terminal.rows,
          }).catch(() => { /* ignore resize errors */ })
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
  }, [fontSize, fontFamily, onError])

  // Listen for SSH data events
  useEffect(() => {
    if (!sessionId) return

    currentSessionId.current = sessionId
    let unlistenData: UnlistenFn | undefined
    let unlistenStatus: UnlistenFn | undefined
    let isMounted = true

    const setupListeners = async () => {
      // Listen for data events
      const dataListener = await listen<string>(`ssh-data-${sessionId}`, (event) => {
        if (terminalRef.current && isMounted) {
          const data = atob(event.payload)
          terminalRef.current.write(data)
        }
      })

      // Listen for status events
      const statusListener = await listen<string>(`ssh-status-${sessionId}`, (event) => {
        if (event.payload === 'disconnected' && isMounted) {
          onDisconnected?.()
          if (terminalRef.current) {
            terminalRef.current.write('\r\n\x1b[31m[Connection closed]\x1b[0m\r\n')
          }
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

  // Update font family
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.options.fontFamily = fontFamily
      fitAddonRef.current?.fit()
    }
  }, [fontFamily])

  // Copy selection to clipboard
  const handleCopy = useCallback(() => {
    if (terminalRef.current) {
      const selection = terminalRef.current.getSelection()
      if (selection) {
        navigator.clipboard.writeText(selection)
      }
    }
  }, [])

  // Paste from clipboard
  const handlePaste = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText()
      if (text && currentSessionId.current) {
        const base64Data = btoa(text)
        await invoke('ssh_send_data', {
          sessionId: currentSessionId.current,
          data: base64Data,
        })
      }
    } catch (err) {
      onError?.(`Failed to paste: ${err}`)
    }
  }, [onError])

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

  return (
    <div
      ref={containerRef}
      className={cn(
        'terminal-container w-full h-full bg-[#1a1a1a] overflow-hidden',
        className
      )}
    />
  )
}

// Export search functions
export function useTerminalSearch(terminalRef: React.RefObject<TerminalRef>) {
  const search = useCallback((text: string) => {
    return terminalRef.current?.search(text) ?? false
  }, [terminalRef])

  const searchNext = useCallback(() => {
    return terminalRef.current?.searchNext() ?? false
  }, [terminalRef])

  const searchPrevious = useCallback(() => {
    return terminalRef.current?.searchPrevious() ?? false
  }, [terminalRef])

  return { search, searchNext, searchPrevious }
}
