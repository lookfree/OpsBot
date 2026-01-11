/**
 * Connection Tree Constants
 */

import {
  Server,
  Database,
  Container,
  Settings2,
  Brain,
} from 'lucide-react'
import { ConnectionStatus, ModuleType } from '@/types'

// Status colors mapping
export const statusColors: Record<ConnectionStatus, string> = {
  connected: 'bg-status-success',
  disconnected: 'bg-dark-text-disabled',
  connecting: 'bg-status-warning',
  error: 'bg-status-error',
}

// Module icons mapping
export const connectionIcons: Record<ModuleType, React.ComponentType<{ className?: string }>> = {
  [ModuleType.SSH]: Server,
  [ModuleType.Database]: Database,
  [ModuleType.Docker]: Container,
  [ModuleType.Middleware]: Settings2,
  [ModuleType.AI]: Brain,
}

// Drag threshold to distinguish click from drag
export const DRAG_THRESHOLD = 5
