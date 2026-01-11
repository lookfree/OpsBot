/**
 * Cloud API Slice
 * Manages cloud AI API configurations and models
 */

import { invoke } from '@tauri-apps/api/core'
import { v4 as uuidv4 } from 'uuid'
import type { CloudApiConfig, CloudApiModel, CloudApiTestResult } from '@/types'
import type { CloudApiState, CloudApiActions, StateCreator } from '../types'

// Initial state
export const cloudApiInitialState: CloudApiState = {
  cloudApiConfigs: [],
  cloudApiModels: [],
  cloudApiError: null,
  isLoadingCloudApi: false,
  isTestingCloudApi: false,
}

// Slice creator
export const createCloudApiSlice: StateCreator<CloudApiState & CloudApiActions> = (set) => ({
  ...cloudApiInitialState,

  testCloudApiConnection: async (provider, apiKey, baseUrl, organization) => {
    set({ isTestingCloudApi: true, cloudApiError: null })

    try {
      const result = await invoke<CloudApiTestResult>('ai_cloud_api_test_connection', {
        provider,
        apiKey,
        baseUrl,
        organization,
      })
      set({ isTestingCloudApi: false })
      return result
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      set({
        cloudApiError: errorMsg,
        isTestingCloudApi: false,
      })
      return { success: false, message: errorMsg }
    }
  },

  fetchCloudApiModels: async (provider, apiKey, baseUrl, organization) => {
    set({ isLoadingCloudApi: true, cloudApiError: null })

    try {
      const models = await invoke<CloudApiModel[]>('ai_cloud_api_list_models', {
        provider,
        apiKey,
        baseUrl,
        organization,
      })

      set((state) => {
        const otherModels = state.cloudApiModels.filter((m) => m.provider !== provider)
        return {
          cloudApiModels: [...otherModels, ...models],
          isLoadingCloudApi: false,
        }
      })
    } catch (error) {
      set({
        cloudApiError: error instanceof Error ? error.message : String(error),
        isLoadingCloudApi: false,
      })
    }
  },

  fetchCloudApiDefaultModels: async (provider) => {
    try {
      const models = await invoke<CloudApiModel[]>('ai_cloud_api_get_default_models', {
        provider,
      })

      set((state) => {
        const otherModels = state.cloudApiModels.filter((m) => m.provider !== provider)
        return {
          cloudApiModels: [...otherModels, ...models],
        }
      })
    } catch (error) {
      console.warn('Failed to fetch default models:', error)
    }
  },

  addCloudApiConfig: async (config) => {
    set({ isLoadingCloudApi: true, cloudApiError: null })

    try {
      const newConfig: CloudApiConfig = {
        ...config,
        id: uuidv4(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }

      set((state) => ({
        cloudApiConfigs: [...state.cloudApiConfigs, newConfig],
        isLoadingCloudApi: false,
      }))
    } catch (error) {
      set({
        cloudApiError: error instanceof Error ? error.message : String(error),
        isLoadingCloudApi: false,
      })
      throw error
    }
  },

  updateCloudApiConfig: async (id, config) => {
    set({ isLoadingCloudApi: true, cloudApiError: null })

    try {
      set((state) => ({
        cloudApiConfigs: state.cloudApiConfigs.map((c) =>
          c.id === id
            ? {
                ...c,
                ...config,
                updatedAt: new Date().toISOString(),
              }
            : c
        ),
        isLoadingCloudApi: false,
      }))
    } catch (error) {
      set({
        cloudApiError: error instanceof Error ? error.message : String(error),
        isLoadingCloudApi: false,
      })
      throw error
    }
  },

  deleteCloudApiConfig: async (id) => {
    set({ isLoadingCloudApi: true, cloudApiError: null })

    try {
      set((state) => ({
        cloudApiConfigs: state.cloudApiConfigs.filter((c) => c.id !== id),
        isLoadingCloudApi: false,
      }))
    } catch (error) {
      set({
        cloudApiError: error instanceof Error ? error.message : String(error),
        isLoadingCloudApi: false,
      })
      throw error
    }
  },
})
