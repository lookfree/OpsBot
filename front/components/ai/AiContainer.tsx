/**
 * AI Container Component
 *
 * Main component for AI module - renders content based on selected engine.
 * Navigation is handled by the sidebar tree.
 */

import { cn } from '@/lib/utils'
import { useAiStore } from '@/stores'
import { OllamaPanel } from './model/OllamaPanel'
import { TensorRTPanel } from './model/TensorRTPanel'
import { CloudApiPanel } from './model/CloudApiPanel'
import { GpuMonitorPanel } from './gpu/GpuMonitorPanel'
import { McpPanel } from './mcp/McpPanel'
import { useAiStyles } from './hooks'

interface AiContainerProps {
  className?: string
}

export function AiContainer({ className }: AiContainerProps) {
  const styles = useAiStyles()
  const { activeEngine } = useAiStore()

  return (
    <div className={cn('h-full overflow-auto', styles.bgPrimary, className)}>
      {activeEngine === 'ollama' && <OllamaPanel />}
      {activeEngine === 'tensorrt' && <TensorRTPanel />}
      {activeEngine === 'cloudApi' && <CloudApiPanel />}
      {activeEngine === 'gpu' && <GpuMonitorPanel />}
      {activeEngine === 'mcp' && <McpPanel />}
    </div>
  )
}
