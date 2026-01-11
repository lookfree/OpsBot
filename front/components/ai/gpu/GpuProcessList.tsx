/**
 * GPU Process List Component
 *
 * Displays list of processes using GPU memory.
 */

import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { Activity } from 'lucide-react'
import type { GpuProcess } from '@/types'
import { useAiStyles } from '../hooks'

interface GpuProcessListProps {
  processes: GpuProcess[]
  className?: string
}

export function GpuProcessList({ processes, className }: GpuProcessListProps) {
  const { t } = useTranslation()
  const styles = useAiStyles()

  return (
    <div className={cn('rounded-lg border p-4', styles.bgSecondary, styles.borderColor, className)}>
      {/* Header */}
      <h3 className={cn('text-base font-medium flex items-center gap-2 mb-4', styles.textPrimary)}>
        <Activity className="w-4 h-4" />
        {t('ai.gpu.processes')}
      </h3>

      {processes.length === 0 ? (
        <p className={cn('text-sm text-center py-4', styles.textSecondary)}>
          {t('ai.gpu.noProcesses')}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className={cn('border-b', styles.borderColor)}>
                <th className={cn('text-left py-2 font-medium', styles.textSecondary)}>PID</th>
                <th className={cn('text-left py-2 font-medium', styles.textSecondary)}>
                  {t('ai.gpu.processName')}
                </th>
                <th className={cn('text-right py-2 font-medium', styles.textSecondary)}>
                  {t('ai.gpu.usedMemory')}
                </th>
              </tr>
            </thead>
            <tbody>
              {processes.map((process) => (
                <tr key={`${process.gpuUuid}-${process.pid}`} className={cn('border-b', styles.borderColor)}>
                  <td className={cn('py-2 font-mono', styles.textPrimary)}>
                    {process.pid}
                  </td>
                  <td className={styles.textPrimary}>
                    {process.processName}
                  </td>
                  <td className={cn('text-right', styles.textPrimary)}>
                    {process.usedMemory} MB
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
