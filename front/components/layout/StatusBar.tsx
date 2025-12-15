/**
 * 状态栏组件
 */

import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { useConnectionStore, useLanguageStore, useThemeStore } from '@/stores'
import { Wifi, WifiOff, HardDrive, Clock, CircleCheck } from 'lucide-react'

interface StatusBarProps {
  className?: string
}

export function StatusBar({ className }: StatusBarProps) {
  const { t } = useTranslation()
  const { connections, connectionStatus } = useConnectionStore()
  const { theme } = useThemeStore()
  const isDark = theme === 'dark'

  // 计算连接数
  const connectedCount = Object.values(connectionStatus).filter(
    (status) => status === 'connected'
  ).length
  const totalConnections = connections.length

  // 计算传输任务数（TODO: 实际实现）
  const transferTasks = 0

  return (
    <div
      className={cn(
        'flex items-center justify-between h-6 px-3 text-xs border-t select-none',
        isDark
          ? 'bg-dark-bg-sidebar border-dark-border text-dark-text-secondary'
          : 'bg-light-bg-sidebar border-light-border text-light-text-secondary',
        className
      )}
    >
      {/* 左侧状态 */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1">
          <CircleCheck className="w-3 h-3 text-status-success" />
          <span>{t('status.ready')}</span>
        </div>
      </div>

      {/* 右侧信息 */}
      <div className="flex items-center gap-4">
        {/* 连接数 */}
        <div className="flex items-center gap-1" title={t('status.connectionCount')}>
          {connectedCount > 0 ? (
            <Wifi className="w-3 h-3 text-status-success" />
          ) : (
            <WifiOff className="w-3 h-3" />
          )}
          <span>
            {t('status.connections')}: {connectedCount}/{totalConnections}
          </span>
        </div>

        {/* 传输任务 */}
        {transferTasks > 0 && (
          <div className="flex items-center gap-1" title={t('status.transferTaskCount')}>
            <HardDrive className="w-3 h-3" />
            <span>{t('status.transfer')}: {transferTasks}</span>
          </div>
        )}

        {/* 当前时间 */}
        <div className="flex items-center gap-1">
          <Clock className="w-3 h-3" />
          <CurrentTime />
        </div>
      </div>
    </div>
  )
}

// 当前时间组件
function CurrentTime() {
  const { language } = useLanguageStore()
  const [time, setTime] = useState(new Date())

  useEffect(() => {
    const timer = setInterval(() => {
      setTime(new Date())
    }, 1000)

    return () => clearInterval(timer)
  }, [])

  // 语言到locale的映射
  const localeMap: Record<string, string> = {
    'zh-CN': 'zh-CN',
    'zh-TW': 'zh-TW',
    'en-US': 'en-US',
    'ja-JP': 'ja-JP',
  }

  return (
    <span>
      {time.toLocaleTimeString(localeMap[language] || 'zh-CN', {
        hour: '2-digit',
        minute: '2-digit',
      })}
    </span>
  )
}
