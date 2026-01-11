/**
 * AI Store
 * Combined store from all AI-related slices
 */

import { create } from 'zustand'
import type { AiState } from './types'
import { createOllamaSlice, ollamaInitialState } from './slices/ollamaSlice'
import { createRemoteSlice, remoteInitialState } from './slices/remoteSlice'
import { createGpuSlice, gpuInitialState } from './slices/gpuSlice'
import { createCloudApiSlice, cloudApiInitialState } from './slices/cloudApiSlice'
import { createTensorrtSlice, tensorrtInitialState } from './slices/tensorrtSlice'
import { createMcpSlice, mcpInitialState } from './slices/mcpSlice'

export const useAiStore = create<AiState>()((set, get) => ({
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
}))

// Re-export types
export type { AiState } from './types'
