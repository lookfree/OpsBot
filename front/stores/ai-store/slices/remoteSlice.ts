/**
 * Remote Mode Slice
 * Manages remote SSH AI environment operations
 */

import { invoke } from '@tauri-apps/api/core'
import type { OllamaModel, RemoteAiEnvironment } from '@/types'
import type { RemoteState, RemoteActions, StateCreator } from '../types'

// Initial state
export const remoteInitialState: RemoteState = {
  isRemoteMode: false,
  remoteSshConnectionId: null,
  remoteEnvironment: null,
  remoteModels: [],
  isRemoteDetecting: false,
  isRemoteSyncing: false,
  remoteError: null,
}

// Slice creator
export const createRemoteSlice: StateCreator<RemoteState & RemoteActions> = (set, get) => ({
  ...remoteInitialState,

  setRemoteMode: (isRemote) => {
    set({
      isRemoteMode: isRemote,
      ...(!isRemote && {
        remoteSshConnectionId: null,
        remoteEnvironment: null,
        remoteModels: [],
        remoteError: null,
      }),
    })
  },

  setRemoteSshConnection: (connectionId) => {
    set({
      remoteSshConnectionId: connectionId,
      remoteEnvironment: null,
      remoteModels: [],
      remoteError: null,
    })
  },

  // Store the environment detected by RemoteConnectionSelector so the panel's
  // render gates (which read remoteEnvironment from the store) actually reflect
  // it. Without this the detected env lived only in the selector's local state
  // and the store field stayed null forever.
  setRemoteEnvironment: (env) => set({ remoteEnvironment: env }),

  detectRemoteEnvironment: async (sshConnectionId) => {
    set({ isRemoteDetecting: true, remoteError: null })

    try {
      const env = await invoke<RemoteAiEnvironment>('ai_remote_detect_environment', {
        sshConnectionId,
      })
      set({
        remoteEnvironment: env,
        isRemoteDetecting: false,
      })
      return env
    } catch (error) {
      set({
        remoteError: error instanceof Error ? error.message : String(error),
        isRemoteDetecting: false,
      })
      throw error
    }
  },

  executeRemoteOllamaCommand: async (command) => {
    const { remoteSshConnectionId } = get()
    if (!remoteSshConnectionId) {
      throw new Error('No SSH connection selected')
    }

    try {
      const output = await invoke<string>('ai_remote_ollama_command', {
        sshConnectionId: remoteSshConnectionId,
        command,
      })
      return output
    } catch (error) {
      set({
        remoteError: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  },

  syncRemoteModels: async () => {
    const { remoteSshConnectionId } = get()
    if (!remoteSshConnectionId) return

    set({ isRemoteSyncing: true, remoteError: null })

    try {
      const models = await invoke<OllamaModel[]>('ai_remote_sync_models', {
        sshConnectionId: remoteSshConnectionId,
      })
      set({
        remoteModels: models,
        isRemoteSyncing: false,
      })
    } catch (error) {
      set({
        remoteError: error instanceof Error ? error.message : String(error),
        isRemoteSyncing: false,
      })
    }
  },

  clearRemoteError: () => set({ remoteError: null }),
})
