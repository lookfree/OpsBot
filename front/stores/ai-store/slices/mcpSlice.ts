/**
 * MCP Slice
 * Manages MCP (Model Context Protocol) server operations
 */

import { invoke } from '@tauri-apps/api/core'
import type { McpServerInfo, McpTool } from '@/types'
import type { McpState, McpActions, StateCreator } from '../types'

// Initial state
export const mcpInitialState: McpState = {
  mcpServers: [],
  mcpServerTools: {},
  isMcpLoading: false,
  isMcpCreating: false,
  mcpError: null,
}

// Slice creator
export const createMcpSlice: StateCreator<McpState & McpActions> = (set, get) => ({
  ...mcpInitialState,

  fetchMcpServers: async () => {
    set({ isMcpLoading: true, mcpError: null })

    try {
      const servers = await invoke<McpServerInfo[]>('ai_mcp_list_servers')
      set({ mcpServers: servers, isMcpLoading: false })
    } catch (error) {
      set({
        mcpError: error instanceof Error ? error.message : String(error),
        isMcpLoading: false,
      })
    }
  },

  createMcpServer: async (config) => {
    set({ isMcpCreating: true, mcpError: null })

    try {
      const serverId = await invoke<string>('ai_mcp_create_server', { config })
      set({ isMcpCreating: false })

      await get().fetchMcpServers()
      return serverId
    } catch (error) {
      set({
        mcpError: error instanceof Error ? error.message : String(error),
        isMcpCreating: false,
      })
      throw error
    }
  },

  deleteMcpServer: async (serverId) => {
    try {
      await invoke('ai_mcp_delete_server', { serverId })

      await get().fetchMcpServers()
    } catch (error) {
      set({
        mcpError: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  },

  startMcpServer: async (serverId) => {
    try {
      await invoke('ai_mcp_start_server', { serverId })

      await get().fetchMcpServers()
    } catch (error) {
      set({
        mcpError: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  },

  stopMcpServer: async (serverId) => {
    try {
      await invoke('ai_mcp_stop_server', { serverId })

      await get().fetchMcpServers()
    } catch (error) {
      set({
        mcpError: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  },

  updateMcpServer: async (serverId, config) => {
    try {
      await invoke('ai_mcp_update_server', { serverId, config })

      await get().fetchMcpServers()
    } catch (error) {
      set({
        mcpError: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  },

  fetchMcpServerTools: async (serverId) => {
    try {
      const tools = await invoke<McpTool[]>('ai_mcp_get_tools', { serverId })

      set((state) => ({
        mcpServerTools: {
          ...state.mcpServerTools,
          [serverId]: tools,
        },
      }))
    } catch (error) {
      set({
        mcpError: error instanceof Error ? error.message : String(error),
      })
    }
  },

  bindMcpTool: async (serverId, tool) => {
    try {
      await invoke('ai_mcp_bind_tool', { serverId, tool })

      await get().fetchMcpServerTools(serverId)
    } catch (error) {
      set({
        mcpError: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  },

  unbindMcpTool: async (serverId, toolName) => {
    try {
      await invoke('ai_mcp_unbind_tool', { serverId, toolName })

      await get().fetchMcpServerTools(serverId)
    } catch (error) {
      set({
        mcpError: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  },

  clearMcpError: () => set({ mcpError: null }),
})
