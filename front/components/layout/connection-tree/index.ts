/**
 * Connection Tree Module
 * Re-exports all public components and utilities
 */

// Main component
export { ConnectionTree } from './ConnectionTree'

// Types
export type {
  DbTreeNode,
  DbTableAction,
  DragState,
  DropTargetCallback,
  ConnectionTreeProps,
  TreeNodeItemProps,
  DbTreeNodeRenderProps,
} from './types'

// Constants
export { statusColors, connectionIcons, DRAG_THRESHOLD } from './constants'

// Drag and drop utilities (for Sidebar)
export {
  getDragState,
  registerDropTarget,
  unregisterDropTarget,
} from './DragDropManager'
