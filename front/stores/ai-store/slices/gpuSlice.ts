/**
 * GPU Slice
 * Manages GPU detection and monitoring (local and remote)
 */

import { invoke } from '@tauri-apps/api/core'
import type { GpuInfo, GpuProcess, GpuHistory } from '@/types'
import type { GpuState, GpuActions, StateCreator } from '../types'

// Initial state
export const gpuInitialState: GpuState = {
  // Local GPU state
  gpuDetected: false,
  gpuInfo: [],
  gpuProcesses: [],
  gpuHistory: [],
  isLoadingGpu: false,
  gpuError: null,
  // Remote GPU state
  isGpuRemoteMode: false,
  gpuRemoteSshConnectionId: null,
  remoteGpuDetected: false,
  remoteGpuInfo: [],
  remoteGpuProcesses: [],
  isLoadingRemoteGpu: false,
  remoteGpuError: null,
}

// Slice creator
export const createGpuSlice: StateCreator<GpuState & GpuActions> = (set) => ({
  ...gpuInitialState,

  // ============ Local GPU Actions ============

  detectGpu: async () => {
    set({ isLoadingGpu: true, gpuError: null })

    try {
      const detected = await invoke<boolean>('ai_detect_gpu')
      set({ gpuDetected: detected, isLoadingGpu: false })
    } catch (error) {
      set({
        gpuDetected: false,
        gpuError: error instanceof Error ? error.message : String(error),
        isLoadingGpu: false,
      })
    }
  },

  fetchGpuInfo: async () => {
    set({ isLoadingGpu: true })

    try {
      const info = await invoke<GpuInfo[]>('ai_get_gpu_info')
      set({ gpuInfo: info, gpuDetected: true, isLoadingGpu: false })
    } catch (error) {
      set({
        gpuError: error instanceof Error ? error.message : String(error),
        isLoadingGpu: false,
      })
    }
  },

  fetchGpuProcesses: async () => {
    try {
      const processes = await invoke<GpuProcess[]>('ai_get_gpu_processes')
      set({ gpuProcesses: processes })
    } catch (error) {
      set({
        gpuError: error instanceof Error ? error.message : String(error),
      })
    }
  },

  fetchGpuHistory: async (gpuIndex, startTime, endTime, interval) => {
    set({ isLoadingGpu: true })

    try {
      const history = await invoke<GpuHistory[]>('ai_get_gpu_history', {
        gpuIndex,
        startTime,
        endTime,
        interval,
      })
      set({ gpuHistory: history, isLoadingGpu: false })
    } catch (error) {
      set({
        gpuError: error instanceof Error ? error.message : String(error),
        isLoadingGpu: false,
      })
    }
  },

  // ============ Remote GPU Actions ============

  setGpuRemoteMode: (isRemote) => {
    set({
      isGpuRemoteMode: isRemote,
      // Clear remote state when switching modes
      ...(isRemote ? {} : {
        remoteGpuDetected: false,
        remoteGpuInfo: [],
        remoteGpuProcesses: [],
        remoteGpuError: null,
      }),
    })
  },

  setGpuRemoteSshConnection: (connectionId) => {
    set({
      gpuRemoteSshConnectionId: connectionId,
      // Clear remote GPU data when connection changes
      remoteGpuDetected: false,
      remoteGpuInfo: [],
      remoteGpuProcesses: [],
      remoteGpuError: null,
    })
  },

  detectRemoteGpu: async (sshConnectionId) => {
    set({ isLoadingRemoteGpu: true, remoteGpuError: null })

    try {
      const detected = await invoke<boolean>('ai_remote_detect_gpu', {
        sshConnectionId,
      })
      set({ remoteGpuDetected: detected, isLoadingRemoteGpu: false })
    } catch (error) {
      set({
        remoteGpuDetected: false,
        remoteGpuError: error instanceof Error ? error.message : String(error),
        isLoadingRemoteGpu: false,
      })
    }
  },

  fetchRemoteGpuInfo: async (sshConnectionId) => {
    set({ isLoadingRemoteGpu: true })

    try {
      const info = await invoke<GpuInfo[]>('ai_remote_get_gpu_info', {
        sshConnectionId,
      })
      set({
        remoteGpuInfo: info,
        remoteGpuDetected: true,
        isLoadingRemoteGpu: false,
      })
    } catch (error) {
      set({
        remoteGpuError: error instanceof Error ? error.message : String(error),
        isLoadingRemoteGpu: false,
      })
    }
  },

  fetchRemoteGpuProcesses: async (sshConnectionId) => {
    try {
      const processes = await invoke<GpuProcess[]>('ai_remote_get_gpu_processes', {
        sshConnectionId,
      })
      set({ remoteGpuProcesses: processes })
    } catch (error) {
      set({
        remoteGpuError: error instanceof Error ? error.message : String(error),
      })
    }
  },

  clearRemoteGpuError: () => {
    set({ remoteGpuError: null })
  },
})
