/**
 * 安全存储服务
 * 使用固定密钥对 localStorage 数据进行加密
 * 支持跨设备迁移
 */

import { invoke } from '@tauri-apps/api/core'

/**
 * 加密数据（用于存储）
 */
export const encryptForStorage = async (data: string): Promise<string> => {
  try {
    return await invoke<string>('encrypt_storage', { data })
  } catch (error) {
    console.error('Storage encryption failed:', error)
    throw error
  }
}

/**
 * 解密数据（从存储读取）
 */
export const decryptFromStorage = async (encrypted: string): Promise<string> => {
  try {
    return await invoke<string>('decrypt_storage', { data: encrypted })
  } catch (error) {
    console.error('Storage decryption failed:', error)
    throw error
  }
}

/**
 * 检查数据是否已加密
 */
export const isStorageEncrypted = async (data: string): Promise<boolean> => {
  try {
    return await invoke<boolean>('is_storage_encrypted', { data })
  } catch {
    return false
  }
}

// 存储队列，用于处理异步加密操作（单例）
const pendingWrites = new Map<string, Promise<void>>()

// 单例存储实例
let storageInstance: ReturnType<typeof createEncryptedStorageImpl> | null = null

/**
 * 创建加密存储实现
 */
const createEncryptedStorageImpl = () => ({
  getItem: async (name: string): Promise<string | null> => {
    try {
      const value = localStorage.getItem(name)
      if (!value) return null

      // 解密数据
      const decrypted = await decryptFromStorage(value)
      return decrypted
    } catch (error) {
      console.error(`Failed to read encrypted storage [${name}]:`, error)
      return null
    }
  },

  setItem: async (name: string, value: string): Promise<void> => {
    // 等待之前的写入完成
    const pending = pendingWrites.get(name)
    if (pending) {
      await pending
    }

    const writePromise = (async () => {
      try {
        // 加密后存储
        const encrypted = await encryptForStorage(value)
        localStorage.setItem(name, encrypted)
      } catch (error) {
        console.error(`Failed to write encrypted storage [${name}]:`, error)
        // 降级为明文存储
        localStorage.setItem(name, value)
      }
    })()

    pendingWrites.set(name, writePromise)
    await writePromise
    pendingWrites.delete(name)
  },

  removeItem: async (name: string): Promise<void> => {
    localStorage.removeItem(name)
  },
})

/**
 * 获取加密存储单例
 * 用于替换默认的 localStorage 存储
 */
export const createEncryptedStorage = () => {
  if (!storageInstance) {
    storageInstance = createEncryptedStorageImpl()
  }
  return storageInstance
}
