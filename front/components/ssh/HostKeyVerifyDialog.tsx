/**
 * SSH Host Key Verification Dialog
 *
 * Displays when connecting to a new or changed SSH host.
 * Implements Trust On First Use (TOFU) model.
 */

import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { invoke } from '@tauri-apps/api/core'
import { listen, UnlistenFn } from '@tauri-apps/api/event'
import * as Dialog from '@radix-ui/react-dialog'
import { ShieldAlert, ShieldCheck } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useThemeStore } from '@/stores'

interface HostKeyPayload {
  session_id: string
  host_port: string
  key_type: string
  fingerprint: string
  old_fingerprint: string
}

interface PendingVerification {
  payload: HostKeyPayload
  isKeyChanged: boolean
}

export function HostKeyVerifyDialog() {
  const { t } = useTranslation()
  const { theme } = useThemeStore()
  const isDark = theme === 'dark'
  const [pending, setPending] = useState<PendingVerification | null>(null)

  useEffect(() => {
    const unlisteners: UnlistenFn[] = []

    const setup = async () => {
      // Listen for new host key verification events (wildcard via prefix match)
      const unVerify = await listen<HostKeyPayload>('ssh-host-key-verify', (event) => {
        setPending({ payload: event.payload, isKeyChanged: false })
      })
      unlisteners.push(unVerify)

      // Listen for host key changed events
      const unChanged = await listen<HostKeyPayload>('ssh-host-key-changed', (event) => {
        setPending({ payload: event.payload, isKeyChanged: true })
      })
      unlisteners.push(unChanged)
    }

    setup()
    return () => unlisteners.forEach((fn) => fn())
  }, [])

  const respond = useCallback(
    async (accept: boolean) => {
      if (!pending) return
      try {
        await invoke('ssh_host_key_response', {
          sessionId: pending.payload.session_id,
          accept,
        })
      } catch (err) {
        console.error('Failed to respond to host key verification:', err)
      }
      setPending(null)
    },
    [pending]
  )

  const dialogBg = isDark ? 'bg-dark-bg-primary' : 'bg-light-bg-primary'
  const borderColor = isDark ? 'border-dark-border' : 'border-light-border'
  const textPrimary = isDark ? 'text-dark-text-primary' : 'text-light-text-primary'
  const textSecondary = isDark ? 'text-dark-text-secondary' : 'text-light-text-secondary'

  return (
    <Dialog.Root open={!!pending} onOpenChange={(open) => { if (!open) respond(false) }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
        <Dialog.Content
          className={cn(
            'fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2',
            'w-full max-w-md rounded-lg shadow-xl z-50 border',
            'focus:outline-none',
            dialogBg,
            borderColor
          )}
        >
          {/* Header */}
          <div className={cn('flex items-center gap-3 px-6 py-4 border-b', borderColor)}>
            {pending?.isKeyChanged ? (
              <ShieldAlert className="w-6 h-6 text-status-error flex-shrink-0" />
            ) : (
              <ShieldCheck className="w-6 h-6 text-status-warning flex-shrink-0" />
            )}
            <Dialog.Title className={cn('text-lg font-semibold', textPrimary)}>
              {pending?.isKeyChanged
                ? t('ssh.hostKey.keyChanged')
                : t('ssh.hostKey.newHost')}
            </Dialog.Title>
          </div>

          {/* Content */}
          <div className="px-6 py-4 space-y-3">
            {pending?.isKeyChanged && (
              <p className="text-sm text-status-error font-medium">
                {t('ssh.hostKey.keyChangedWarning')}
              </p>
            )}

            <p className={cn('text-sm', textSecondary)}>
              {t('ssh.hostKey.hostLabel')}: <span className={cn('font-mono font-medium', textPrimary)}>{pending?.payload.host_port}</span>
            </p>
            <p className={cn('text-sm', textSecondary)}>
              {t('ssh.hostKey.keyTypeLabel')}: <span className={cn('font-mono', textPrimary)}>{pending?.payload.key_type}</span>
            </p>
            <div>
              <p className={cn('text-sm mb-1', textSecondary)}>{t('ssh.hostKey.fingerprint')}:</p>
              <code className={cn(
                'block text-xs font-mono p-2 rounded break-all',
                isDark ? 'bg-dark-bg-hover' : 'bg-light-bg-hover',
                textPrimary
              )}>
                {pending?.payload.fingerprint}
              </code>
            </div>

            <p className={cn('text-sm', textSecondary)}>
              {t('ssh.hostKey.trustPrompt')}
            </p>
          </div>

          {/* Footer */}
          <div className={cn('flex items-center justify-end gap-3 px-6 py-4 border-t', borderColor)}>
            <button
              onClick={() => respond(false)}
              className={cn(
                'px-4 py-2 rounded text-sm border transition-colors',
                borderColor,
                textPrimary,
                isDark ? 'hover:bg-dark-bg-hover' : 'hover:bg-light-bg-hover'
              )}
            >
              {t('ssh.hostKey.reject')}
            </button>
            <button
              onClick={() => respond(true)}
              className={cn(
                'px-4 py-2 rounded text-sm transition-colors text-white',
                pending?.isKeyChanged
                  ? 'bg-status-error hover:bg-status-error/80'
                  : 'bg-accent-primary hover:bg-accent-hover'
              )}
            >
              {t('ssh.hostKey.accept')}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
