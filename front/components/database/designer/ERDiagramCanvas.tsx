/**
 * ER 图画布组件
 *
 * SVG 画布，支持缩放、平移，渲染表节点和关系线
 */

import React, { useCallback, useRef, useState, useEffect, useMemo } from 'react'
import { X } from 'lucide-react'
import { useDiagramStore } from '@/stores/diagramStore'
import { useThemeStore } from '@/stores/themeStore'
import { TableNodeComponent } from './TableNode'
import { RelationshipLineComponent } from './RelationshipLine'

// 字段行高度常量（与 TableNode 保持一致）
const FIELD_HEIGHT = 28
const HEADER_HEIGHT = 40
const COLOR_STRIP_HEIGHT = 6

interface ERDiagramCanvasProps {
  className?: string
}

// 画布尺寸
const CANVAS_WIDTH = 5000
const CANVAS_HEIGHT = 5000

// 缩放限制
const MIN_SCALE = 0.25
const MAX_SCALE = 2

// 网格大小
const GRID_SIZE = 20

export function ERDiagramCanvas({ className = '' }: ERDiagramCanvasProps) {
  const { theme } = useThemeStore()
  const isDark = theme === 'dark'

  const {
    diagram,
    transform,
    selectedTableId,
    selectedRelationshipId,
    selectedNoteId,
    setTransform,
    clearSelection,
    selectTable,
    selectNote,
    moveTable,
    deleteNote,
    // 连接状态
    isConnecting,
    connectionStart,
    connectionMousePos,
    startConnection,
    updateConnectionMousePos,
    endConnection,
    cancelConnection,
  } = useDiagramStore()

  const containerRef = useRef<HTMLDivElement>(null)
  const [isPanning, setIsPanning] = useState(false)
  const panStartRef = useRef({ x: 0, y: 0, translateX: 0, translateY: 0 })

  // 表拖拽状态
  const [isDraggingTable, setIsDraggingTable] = useState(false)
  const dragTableRef = useRef<{
    tableId: string
    startX: number
    startY: number
    tableStartX: number
    tableStartY: number
  } | null>(null)

  // 连接模式状态 - Phase 2 实现
  // const [isConnecting, setIsConnecting] = useState(false)
  // const [connectionStart, setConnectionStart] = useState<{ tableId: string; fieldId: string } | null>(null)

  // 开始平移
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // 只有在点击空白区域时才开始平移
      if (e.target === e.currentTarget || (e.target as Element).tagName === 'svg') {
        clearSelection()

        // 中键或按住空格键时开始平移
        if (e.button === 1 || e.shiftKey) {
          e.preventDefault()
          setIsPanning(true)
          panStartRef.current = {
            x: e.clientX,
            y: e.clientY,
            translateX: transform.translateX,
            translateY: transform.translateY,
          }
        }
      }
    },
    [transform.translateX, transform.translateY, clearSelection]
  )

  // 平移中 / 表拖拽中 / 连接中
  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      // 连接模式：更新鼠标位置
      if (isConnecting) {
        const container = containerRef.current
        if (container) {
          const rect = container.getBoundingClientRect()
          // 转换为画布坐标系
          const canvasX = (e.clientX - rect.left - transform.translateX) / transform.scale
          const canvasY = (e.clientY - rect.top - transform.translateY) / transform.scale
          updateConnectionMousePos(canvasX, canvasY)
        }
        return
      }

      // 表拖拽
      if (isDraggingTable && dragTableRef.current) {
        const { tableId, startX, startY, tableStartX, tableStartY } = dragTableRef.current
        const dx = (e.clientX - startX) / transform.scale
        const dy = (e.clientY - startY) / transform.scale
        moveTable(tableId, tableStartX + dx, tableStartY + dy)
        return
      }

      // 画布平移
      if (!isPanning) return

      const dx = e.clientX - panStartRef.current.x
      const dy = e.clientY - panStartRef.current.y

      setTransform({
        translateX: panStartRef.current.translateX + dx,
        translateY: panStartRef.current.translateY + dy,
      })
    },
    [isPanning, isDraggingTable, isConnecting, transform, setTransform, moveTable, updateConnectionMousePos]
  )

  // 结束平移 / 表拖拽 / 连接
  const handleMouseUp = useCallback(() => {
    setIsPanning(false)
    setIsDraggingTable(false)
    dragTableRef.current = null
    // 如果在空白区域释放鼠标，取消连接
    if (isConnecting) {
      cancelConnection()
    }
  }, [isConnecting, cancelConnection])

  // 表节点 pointerdown 处理
  const handleTablePointerDown = useCallback(
    (tableId: string, e: React.PointerEvent) => {
      e.stopPropagation()
      selectTable(tableId)

      // 开始拖拽
      const table = diagram.tables.find((t) => t.id === tableId)
      if (table && !table.locked) {
        setIsDraggingTable(true)
        dragTableRef.current = {
          tableId,
          startX: e.clientX,
          startY: e.clientY,
          tableStartX: table.x,
          tableStartY: table.y,
        }
      }
    },
    [selectTable, diagram.tables]
  )

  // 鼠标离开画布
  const handleMouseLeave = useCallback(() => {
    setIsPanning(false)
    setIsDraggingTable(false)
    dragTableRef.current = null
    // 离开画布取消连接
    if (isConnecting) {
      cancelConnection()
    }
  }, [isConnecting, cancelConnection])

  // 滚轮缩放
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault()

      const container = containerRef.current
      if (!container) return

      const rect = container.getBoundingClientRect()
      const mouseX = e.clientX - rect.left
      const mouseY = e.clientY - rect.top

      // 计算新的缩放比例
      const delta = e.deltaY > 0 ? 0.9 : 1.1
      const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, transform.scale * delta))

      // 以鼠标位置为中心缩放
      const scaleRatio = newScale / transform.scale
      const newTranslateX = mouseX - (mouseX - transform.translateX) * scaleRatio
      const newTranslateY = mouseY - (mouseY - transform.translateY) * scaleRatio

      setTransform({
        scale: newScale,
        translateX: newTranslateX,
        translateY: newTranslateY,
      })
    },
    [transform, setTransform]
  )

  // 计算字段在画布上的连接点位置
  const getFieldConnectionPoint = useCallback(
    (tableId: string, fieldId: string, side: 'left' | 'right' = 'right') => {
      const table = diagram.tables.find((t) => t.id === tableId)
      if (!table) return null

      const fieldIndex = table.fields.findIndex((f) => f.id === fieldId)
      if (fieldIndex === -1) return null

      const tableWidth = table.width || 200
      // 字段的 Y 位置：颜色条 + 表头 + 字段行的一半
      const fieldY = table.y + COLOR_STRIP_HEIGHT + HEADER_HEIGHT + fieldIndex * FIELD_HEIGHT + FIELD_HEIGHT / 2

      return {
        x: side === 'left' ? table.x : table.x + tableWidth,
        y: fieldY,
      }
    },
    [diagram.tables]
  )

  // 开始连接
  const handleStartConnection = useCallback(
    (tableId: string, fieldId: string, e: React.PointerEvent) => {
      startConnection(tableId, fieldId)

      // 计算初始鼠标位置（相对于画布坐标系）
      const container = containerRef.current
      if (container) {
        const rect = container.getBoundingClientRect()
        const canvasX = (e.clientX - rect.left - transform.translateX) / transform.scale
        const canvasY = (e.clientY - rect.top - transform.translateY) / transform.scale
        updateConnectionMousePos(canvasX, canvasY)
      }
    },
    [startConnection, updateConnectionMousePos, transform]
  )

  // 结束连接
  const handleEndConnection = useCallback(
    (tableId: string, fieldId: string) => {
      endConnection(tableId, fieldId)
    },
    [endConnection]
  )

  // Escape 键取消连接
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isConnecting) {
        cancelConnection()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isConnecting, cancelConnection])

  // 计算临时连接线的起点
  const connectionLineStart = useMemo(() => {
    if (!connectionStart) return null
    return getFieldConnectionPoint(connectionStart.tableId, connectionStart.fieldId, 'right')
  }, [connectionStart, getFieldConnectionPoint])

  // 背景样式
  const bgColor = isDark ? '#1a1a2e' : '#f8fafc'
  const gridColor = isDark ? '#2d2d44' : '#e2e8f0'

  // 网格模式
  const gridPattern = `
    <pattern id="grid" width="${GRID_SIZE}" height="${GRID_SIZE}" patternUnits="userSpaceOnUse">
      <path d="M ${GRID_SIZE} 0 L 0 0 0 ${GRID_SIZE}" fill="none" stroke="${gridColor}" stroke-width="0.5"/>
    </pattern>
  `

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden ${className}`}
      style={{ cursor: isConnecting ? 'crosshair' : isDraggingTable ? 'move' : isPanning ? 'grabbing' : 'default' }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
      onWheel={handleWheel}
    >
      <svg
        width="100%"
        height="100%"
        style={{
          backgroundColor: bgColor,
        }}
      >
        {/* 网格背景 */}
        <defs dangerouslySetInnerHTML={{ __html: gridPattern }} />
        <rect
          x={-CANVAS_WIDTH / 2}
          y={-CANVAS_HEIGHT / 2}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          fill="url(#grid)"
          transform={`translate(${transform.translateX}, ${transform.translateY}) scale(${transform.scale})`}
        />

        {/* 主内容组 */}
        <g
          transform={`translate(${transform.translateX}, ${transform.translateY}) scale(${transform.scale})`}
        >
          {/* 区域 (背景层) */}
          {diagram.areas.map((area) => (
            <rect
              key={area.id}
              x={area.x}
              y={area.y}
              width={area.width}
              height={area.height}
              fill={area.color}
              fillOpacity={0.1}
              stroke={area.color}
              strokeWidth={1}
              rx={4}
            />
          ))}

          {/* 关系线 */}
          {diagram.relationships.map((relationship) => (
            <RelationshipLineComponent
              key={relationship.id}
              relationship={relationship}
              isSelected={selectedRelationshipId === relationship.id}
            />
          ))}

          {/* 表节点 */}
          {diagram.tables.map((table) => (
            <TableNodeComponent
              key={table.id}
              table={table}
              isSelected={selectedTableId === table.id}
              onPointerDown={(e) => handleTablePointerDown(table.id, e)}
              onDoubleClick={() => selectTable(table.id)}
              onStartConnection={handleStartConnection}
              onEndConnection={handleEndConnection}
            />
          ))}

          {/* 注释节点 */}
          {diagram.notes.map((note) => (
            <foreignObject
              key={note.id}
              x={note.x}
              y={note.y}
              width={note.width}
              height={note.height}
            >
              <div
                className={`group relative p-2 rounded shadow text-xs cursor-pointer border-2 ${
                  selectedNoteId === note.id
                    ? 'border-blue-500'
                    : 'border-transparent hover:border-dashed hover:border-blue-400'
                }`}
                style={{ backgroundColor: note.color }}
                onClick={(e) => {
                  e.stopPropagation()
                  selectNote(note.id)
                }}
              >
                {/* 删除按钮 - 悬停时显示 */}
                <button
                  className="absolute -top-2 -right-2 hidden group-hover:flex items-center justify-center w-5 h-5 rounded-full bg-red-500 hover:bg-red-600 text-white shadow"
                  onClick={(e) => {
                    e.stopPropagation()
                    deleteNote(note.id)
                  }}
                  title="删除注释"
                >
                  <X className="w-3 h-3" />
                </button>

                <div className="font-semibold mb-1">{note.title}</div>
                <div className="whitespace-pre-wrap">{note.content}</div>
              </div>
            </foreignObject>
          ))}

          {/* 临时连接线 - 拖拽创建关系时显示 */}
          {isConnecting && connectionLineStart && connectionMousePos && (
            <g>
              {/* 贝塞尔曲线 */}
              <path
                d={`M ${connectionLineStart.x} ${connectionLineStart.y}
                    C ${connectionLineStart.x + 50} ${connectionLineStart.y},
                      ${connectionMousePos.x - 50} ${connectionMousePos.y},
                      ${connectionMousePos.x} ${connectionMousePos.y}`}
                fill="none"
                stroke="#f97316"
                strokeWidth={2}
                strokeDasharray="6,3"
                className="pointer-events-none"
              />
              {/* 起点圆圈 */}
              <circle
                cx={connectionLineStart.x}
                cy={connectionLineStart.y}
                r={5}
                fill="#f97316"
                className="pointer-events-none"
              />
              {/* 终点圆圈 */}
              <circle
                cx={connectionMousePos.x}
                cy={connectionMousePos.y}
                r={5}
                fill="#f97316"
                className="pointer-events-none"
              />
            </g>
          )}
        </g>
      </svg>

      {/* 缩放指示器 */}
      <div
        className={`absolute bottom-4 right-4 px-2 py-1 rounded text-xs ${
          isDark ? 'bg-dark-bg-secondary text-dark-text-secondary' : 'bg-white text-gray-500'
        } shadow`}
      >
        {Math.round(transform.scale * 100)}%
      </div>

      {/* 连接模式提示 */}
      {isConnecting && (
        <div
          className={`absolute bottom-4 left-4 px-3 py-2 rounded text-sm ${
            isDark ? 'bg-orange-900/80 text-orange-200' : 'bg-orange-100 text-orange-800'
          } shadow flex items-center gap-2`}
        >
          <div className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
          拖拽到目标字段创建关系 (按 Esc 取消)
        </div>
      )}
    </div>
  )
}

export default ERDiagramCanvas
