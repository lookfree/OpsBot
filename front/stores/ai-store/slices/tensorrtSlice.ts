/**
 * TensorRT Slice
 * Manages TensorRT connection and model deployment
 */

import { invoke } from '@tauri-apps/api/core'
import { v4 as uuidv4 } from 'uuid'
import type { TensorRTStatus, TensorRTModel, TensorRTConnectRequest } from '@/types'
import type { TensorrtState, TensorrtActions, StateCreator } from '../types'

// Initial state
export const tensorrtInitialState: TensorrtState = {
  tensorrtConnectionId: null,
  tensorrtStatus: null,
  tensorrtModels: [],
  isTensorrtConnecting: false,
  isTensorrtLoadingModels: false,
  isTensorrtDeploying: false,
  tensorrtError: null,
}

// Slice creator
export const createTensorrtSlice: StateCreator<TensorrtState & TensorrtActions> = (set, get) => ({
  ...tensorrtInitialState,

  connectTensorrt: async (host, port) => {
    const connectionId = uuidv4()
    set({ isTensorrtConnecting: true, tensorrtError: null })

    try {
      const request: TensorRTConnectRequest = { host, port }
      const status = await invoke<TensorRTStatus>('ai_tensorrt_connect', {
        connectionId,
        request,
      })

      set({
        tensorrtConnectionId: connectionId,
        tensorrtStatus: status,
        isTensorrtConnecting: false,
      })

      await get().fetchTensorrtModels(connectionId)
    } catch (error) {
      set({
        tensorrtError: error instanceof Error ? error.message : String(error),
        isTensorrtConnecting: false,
      })
      throw error
    }
  },

  disconnectTensorrt: async () => {
    const { tensorrtConnectionId } = get()
    if (!tensorrtConnectionId) return

    try {
      await invoke('ai_tensorrt_disconnect', { connectionId: tensorrtConnectionId })
      set({
        tensorrtConnectionId: null,
        tensorrtStatus: null,
        tensorrtModels: [],
      })
    } catch (error) {
      set({
        tensorrtError: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  },

  testTensorrtConnection: async (host, port) => {
    const status = await invoke<TensorRTStatus>('ai_tensorrt_test_connection', {
      host,
      port,
    })
    return status
  },

  fetchTensorrtModels: async (connectionId) => {
    set({ isTensorrtLoadingModels: true })

    try {
      const models = await invoke<TensorRTModel[]>('ai_tensorrt_list_models', {
        connectionId,
      })
      set({ tensorrtModels: models, isTensorrtLoadingModels: false })
    } catch (error) {
      set({
        tensorrtError: error instanceof Error ? error.message : String(error),
        isTensorrtLoadingModels: false,
      })
    }
  },

  deployTensorrtModel: async (connectionId, config) => {
    set({ isTensorrtDeploying: true, tensorrtError: null })

    try {
      await invoke('ai_tensorrt_deploy_model', {
        connectionId,
        config,
      })
      set({ isTensorrtDeploying: false })

      await get().fetchTensorrtModels(connectionId)
    } catch (error) {
      set({
        tensorrtError: error instanceof Error ? error.message : String(error),
        isTensorrtDeploying: false,
      })
      throw error
    }
  },

  startTensorrtModel: async (connectionId, modelId) => {
    try {
      await invoke('ai_tensorrt_start_model', {
        connectionId,
        modelId,
      })

      await get().fetchTensorrtModels(connectionId)
    } catch (error) {
      set({
        tensorrtError: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  },

  stopTensorrtModel: async (connectionId, modelId) => {
    try {
      await invoke('ai_tensorrt_stop_model', {
        connectionId,
        modelId,
      })

      await get().fetchTensorrtModels(connectionId)
    } catch (error) {
      set({
        tensorrtError: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  },

  clearTensorrtError: () => set({ tensorrtError: null }),
})
