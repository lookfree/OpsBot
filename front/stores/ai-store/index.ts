/**
 * AI Store
 * Combined store from all AI-related slices
 */

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { createEncryptedStorage } from '@/services/secureStorage'
import type { AiState } from './types'
import { createOllamaSlice, ollamaInitialState } from './slices/ollamaSlice'
import { createRemoteSlice, remoteInitialState } from './slices/remoteSlice'
import { createGpuSlice, gpuInitialState } from './slices/gpuSlice'
import { createCloudApiSlice, cloudApiInitialState } from './slices/cloudApiSlice'
import { createTensorrtSlice, tensorrtInitialState } from './slices/tensorrtSlice'
import { createMcpSlice, mcpInitialState } from './slices/mcpSlice'

export const useAiStore = create<AiState>()(
  persist(
    (set, get) => ({
      // Core state
      activeEngine: 'ollama',

      // Merge all initial states
      ...ollamaInitialState,
      ...remoteInitialState,
      ...gpuInitialState,
      ...cloudApiInitialState,
      ...tensorrtInitialState,
      ...mcpInitialState,

      // Core actions
      setActiveEngine: (engine) => set({ activeEngine: engine }),
      clearError: () => set({ error: null, gpuError: null }),

      // Merge all slice actions
      ...createOllamaSlice(set, get),
      ...createRemoteSlice(set, get),
      ...createGpuSlice(set, get),
      ...createCloudApiSlice(set, get),
      ...createTensorrtSlice(set, get),
      ...createMcpSlice(set, get),
    }),
    {
      // Cloud API configs hold API keys and were previously lost on every
      // reload/restart. Persist them (and the active engine) through the same
      // AES-encrypted storage the connection store uses, so keys survive a
      // restart without ever being written to disk in plaintext. Live/session
      // state (connections, GPU samples, models) is intentionally NOT persisted.
      name: 'zwd-opsbot-ai',
      storage: createJSONStorage(() => createEncryptedStorage()),
      partialize: (state) => ({
        activeEngine: state.activeEngine,
        cloudApiConfigs: state.cloudApiConfigs,
      }),
    }
  )
)

// Re-export types
export type { AiState } from './types'
