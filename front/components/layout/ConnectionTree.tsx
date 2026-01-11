/**
 * Connection Tree Component
 * Re-exports from the refactored module for backward compatibility
 */

export {
  ConnectionTree,
  getDragState,
  registerDropTarget,
  unregisterDropTarget,
} from './connection-tree'

export type {
  DbTreeNode,
  DbTableAction,
  DragState,
  DropTargetCallback,
  ConnectionTreeProps,
  TreeNodeItemProps,
} from './connection-tree'
