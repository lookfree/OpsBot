/**
 * Drag and Drop Manager
 * Handles cross-component drag & drop communication
 */

import { DragState, DropTargetCallback } from './types'

// Global drag state for cross-component communication
export const dragState: DragState = {
  connectionId: null,
  moduleType: null,
  isDragging: false,
  startX: 0,
  startY: 0,
}

// Global state for drag overlay
let dragOverlayElement: HTMLDivElement | null = null
let currentDropTarget: string | null = null

// Event emitter for drop targets
const dropTargetCallbacks = new Map<string, DropTargetCallback>()

/**
 * Create drag overlay element
 */
export function createDragOverlay(name: string) {
  if (dragOverlayElement) return
  dragOverlayElement = document.createElement('div')
  dragOverlayElement.className = 'fixed pointer-events-none z-50 bg-dark-accent/90 text-white px-2 py-1 rounded text-sm shadow-lg'
  dragOverlayElement.textContent = name
  dragOverlayElement.style.display = 'none'
  document.body.appendChild(dragOverlayElement)
}

/**
 * Update drag overlay position
 */
export function updateDragOverlay(x: number, y: number) {
  if (dragOverlayElement) {
    dragOverlayElement.style.display = 'block'
    dragOverlayElement.style.left = `${x + 15}px`
    dragOverlayElement.style.top = `${y + 15}px`
  }
}

/**
 * Remove drag overlay element
 */
export function removeDragOverlay() {
  if (dragOverlayElement) {
    dragOverlayElement.remove()
    dragOverlayElement = null
  }
}

/**
 * Register a folder as drop target
 */
export function registerDropTarget(id: string, callback: DropTargetCallback) {
  dropTargetCallbacks.set(id, callback)
}

/**
 * Unregister a drop target
 */
export function unregisterDropTarget(id: string) {
  dropTargetCallbacks.delete(id)
}

/**
 * Notify drop targets of hover state
 */
export function notifyDropTargets(folderId: string | null, isOver: boolean) {
  // First, clear all previous highlights
  dropTargetCallbacks.forEach((cb, id) => {
    if (id !== folderId) {
      cb(id, false)
    }
  })
  // Then highlight the current target
  if (folderId && dropTargetCallbacks.has(folderId)) {
    dropTargetCallbacks.get(folderId)?.(folderId, isOver)
  }
}

/**
 * Get current drop target
 */
export function getCurrentDropTarget(): string | null {
  return currentDropTarget
}

/**
 * Set current drop target
 */
export function setCurrentDropTarget(target: string | null) {
  currentDropTarget = target
}

/**
 * Get drag state (for Sidebar to use)
 */
export function getDragState(): DragState {
  return dragState
}

/**
 * Reset drag state
 */
export function resetDragState() {
  dragState.isDragging = false
  dragState.connectionId = null
  dragState.moduleType = null
  currentDropTarget = null
  notifyDropTargets(null, false)
  removeDragOverlay()
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
}
