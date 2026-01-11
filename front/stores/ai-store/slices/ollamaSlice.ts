/**
 * Ollama Slice
 * Manages Ollama connection, models, and service control
 */

import { invoke } from '@tauri-apps/api/core'
import { v4 as uuidv4 } from 'uuid'
import type { OllamaStatus, OllamaModel, OllamaRunningModel, OllamaConnectRequest } from '@/types'
import type { OllamaState, OllamaActions, StateCreator } from '../types'

// Initial state
export const ollamaInitialState: OllamaState = {
  ollamaConnectionId: null,
  ollamaStatus: null,
  ollamaModels: [],
  ollamaRunningModels: [],
  isConnecting: false,
  isLoadingModels: false,
  isPullingModel: false,
  pullingModelName: null,
  isControllingService: false,
  error: null,
}

// Slice creator
export const createOllamaSlice: StateCreator<OllamaState & OllamaActions> = (set, get) => ({
  ...ollamaInitialState,

  connectOllama: async (host, port) => {
    const connectionId = uuidv4()
    set({ isConnecting: true, error: null })

    try {
      const request: OllamaConnectRequest = { host, port }
      const status = await invoke<OllamaStatus>('ai_ollama_connect', {
        connectionId,
        request,
      })

      set({
        ollamaConnectionId: connectionId,
        ollamaStatus: status,
        isConnecting: false,
      })

      await get().fetchOllamaModels()
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : String(error),
        isConnecting: false,
      })
      throw error
    }
  },

  disconnectOllama: async () => {
    const { ollamaConnectionId } = get()
    if (!ollamaConnectionId) return

    try {
      await invoke('ai_ollama_disconnect', { connectionId: ollamaConnectionId })
      set({
        ollamaConnectionId: null,
        ollamaStatus: null,
        ollamaModels: [],
        ollamaRunningModels: [],
      })
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  },

  testOllamaConnection: async (host, port) => {
    const status = await invoke<OllamaStatus>('ai_ollama_test_connection', {
      host,
      port,
    })
    return status
  },

  refreshOllamaStatus: async () => {
    const { ollamaConnectionId } = get()
    if (!ollamaConnectionId) return

    try {
      const status = await invoke<OllamaStatus>('ai_ollama_get_status', {
        connectionId: ollamaConnectionId,
      })
      set({ ollamaStatus: status })
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : String(error),
      })
    }
  },

  fetchOllamaModels: async () => {
    const { ollamaConnectionId } = get()
    if (!ollamaConnectionId) return

    set({ isLoadingModels: true })

    try {
      const models = await invoke<OllamaModel[]>('ai_ollama_list_models', {
        connectionId: ollamaConnectionId,
      })
      set({ ollamaModels: models, isLoadingModels: false })
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : String(error),
        isLoadingModels: false,
      })
    }
  },

  pullOllamaModel: async (modelName) => {
    const { ollamaConnectionId } = get()
    if (!ollamaConnectionId) return

    set({ isPullingModel: true, pullingModelName: modelName, error: null })

    try {
      await invoke('ai_ollama_pull_model', {
        connectionId: ollamaConnectionId,
        modelName,
      })
      set({ isPullingModel: false, pullingModelName: null })

      await get().fetchOllamaModels()
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : String(error),
        isPullingModel: false,
        pullingModelName: null,
      })
      throw error
    }
  },

  deleteOllamaModel: async (modelName) => {
    const { ollamaConnectionId } = get()
    if (!ollamaConnectionId) return

    try {
      await invoke('ai_ollama_delete_model', {
        connectionId: ollamaConnectionId,
        modelName,
      })

      await get().fetchOllamaModels()
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  },

  fetchRunningModels: async () => {
    const { ollamaConnectionId } = get()
    if (!ollamaConnectionId) return

    try {
      const models = await invoke<OllamaRunningModel[]>('ai_ollama_get_running_models', {
        connectionId: ollamaConnectionId,
      })
      set({ ollamaRunningModels: models })
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : String(error),
      })
    }
  },

  startOllamaService: async () => {
    set({ isControllingService: true, error: null })

    try {
      const message = await invoke<string>('ai_ollama_start_service')
      set({ isControllingService: false })
      return message
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : String(error),
        isControllingService: false,
      })
      throw error
    }
  },

  stopOllamaService: async () => {
    set({ isControllingService: true, error: null })

    try {
      const message = await invoke<string>('ai_ollama_stop_service')
      set({ isControllingService: false })
      return message
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : String(error),
        isControllingService: false,
      })
      throw error
    }
  },

  restartOllamaService: async () => {
    set({ isControllingService: true, error: null })

    try {
      const message = await invoke<string>('ai_ollama_restart_service')
      set({ isControllingService: false })
      return message
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : String(error),
        isControllingService: false,
      })
      throw error
    }
  },

  checkOllamaServiceRunning: async () => {
    try {
      const isRunning = await invoke<boolean>('ai_ollama_is_service_running')
      return isRunning
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  },
})
