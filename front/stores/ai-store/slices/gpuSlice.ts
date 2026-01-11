/**
 * GPU Slice
 * Manages GPU detection and monitoring
 */

import { invoke } from '@tauri-apps/api/core'
import type { GpuInfo, GpuProcess, GpuHistory } from '@/types'
import type { GpuState, GpuActions, StateCreator } from '../types'

// Initial state
export const gpuInitialState: GpuState = {
  gpuDetected: false,
  gpuInfo: [],
  gpuProcesses: [],
  gpuHistory: [],
  isLoadingGpu: false,
  gpuError: null,
}

// Slice creator
export const createGpuSlice: StateCreator<GpuState & GpuActions> = (set) => ({
  ...gpuInitialState,

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
})
