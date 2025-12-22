/**
 * ER 图表节点组件
 *
 * 显示表结构，支持：
 * - 点击选中
 * - 双击打开编辑
 * - 悬停显示操作按钮
 * - 字段悬停显示详情弹窗
 * 拖拽由 Canvas 层统一处理
 */

import React, { useState, useMemo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Edit2, Lock, Unlock, Trash2, MoreHorizontal, Minus } from 'lucide-react'
import type { TableNode as TableNodeType, TableField } from './types'
import { useDiagramStore } from '@/stores/diagramStore'
import { useThemeStore } from '@/stores/themeStore'
import { getTypeColor } from '@/config/datatypes'
import type { DatabaseType } from '@/config/datatypes/types'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface TableNodeProps {
  table: TableNodeType
  isSelected: boolean
  onPointerDown: (e: React.PointerEvent) => void
  onDoubleClick?: () => void
  onStartConnection?: (tableId: string, fieldId: string, e: React.PointerEvent) => void
  onEndConnection?: (tableId: string, fieldId: string) => void
}

// 字段行高度
const FIELD_HEIGHT = 28
// 表头高度
const HEADER_HEIGHT = 40
// 颜色条高度
const COLOR_STRIP_HEIGHT = 6
// 最小表宽度
const MIN_TABLE_WIDTH = 200

// 字段详情弹窗组件 - 使用 Portal 渲染到 body
function FieldTooltip({
  field,
  isDark,
  database,
  position,
}: {
  field: TableField
  isDark: boolean
  database: string
  position: { x: number; y: number }
}) {
  const bgClass = isDark ? 'bg-zinc-800 border-zinc-600' : 'bg-white border-zinc-300'
  const textClass = isDark ? 'text-zinc-200' : 'text-zinc-800'

  return createPortal(
    <div
      className={`fixed z-[9999] p-3 rounded-lg border shadow-lg min-w-[200px] ${bgClass} ${textClass}`}
      style={{
        left: position.x + 10,
        top: position.y - 10,
        pointerEvents: 'none',
      }}
    >
      {/* 标题行：字段名 + 类型 */}
      <div className="flex justify-between items-center pb-2 border-b border-gray-400 gap-4">
        <span className="font-bold">{field.name}</span>
        <span
          className={`font-mono text-sm ${getTypeColor(database as DatabaseType, field.type)}`}
        >
          {field.type}
          {field.size ? `(${field.size})` : ''}
        </span>
      </div>

      {/* 属性标签 */}
      <div className="flex flex-wrap gap-1 mt-2">
        {field.primary && (
          <span className="px-2 py-0.5 text-xs rounded bg-blue-500 text-white">Primary</span>
        )}
        {field.unique && (
          <span className="px-2 py-0.5 text-xs rounded bg-amber-500 text-white">Unique</span>
        )}
        {field.notNull && (
          <span className="px-2 py-0.5 text-xs rounded bg-purple-500 text-white">Not null</span>
        )}
        {field.increment && (
          <span className="px-2 py-0.5 text-xs rounded bg-green-500 text-white">
            Autoincrement
          </span>
        )}
      </div>

      {/* 默认值 */}
      <div className="mt-2 text-sm">
        <strong>Default:</strong>{' '}
        <span className={isDark ? 'text-zinc-400' : 'text-zinc-500'}>
          {field.default || 'Not set'}
        </span>
      </div>

      {/* 注释 */}
      <div className="mt-1 text-sm">
        <strong>Comment:</strong>{' '}
        <span className={isDark ? 'text-zinc-400' : 'text-zinc-500'}>
          {field.comment || 'Not set'}
        </span>
      </div>
    </div>,
    document.body
  )
}

export function TableNodeComponent({
  table,
  isSelected,
  onPointerDown,
  onDoubleClick,
  onStartConnection,
  onEndConnection,
}: TableNodeProps) {
  const { theme } = useThemeStore()
  const isDark = theme === 'dark'
  const { diagram, updateTable, deleteTable, deleteField, isConnecting, connectionStart } = useDiagramStore()

  const [hoveredFieldId, setHoveredFieldId] = useState<string | null>(null)
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 })

  // 字段列表
  const fields = table.fields || []

  // 计算表高度
  const calculatedHeight = useMemo(() => {
    const fieldsCount = Math.max(fields.length, 1) // 至少显示一行高度
    // 颜色条 + 表头 + 字段行 + 底部间距
    return COLOR_STRIP_HEIGHT + HEADER_HEIGHT + fieldsCount * FIELD_HEIGHT + 16
  }, [fields.length])

  const tableWidth = table.width || MIN_TABLE_WIDTH

  // 锁定/解锁表
  const handleLockToggle = (e: React.MouseEvent) => {
    e.stopPropagation()
    updateTable(table.id, { locked: !table.locked })
  }

  // 删除表
  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation()
    deleteTable(table.id)
  }

  // 删除字段
  const handleDeleteField = (e: React.MouseEvent, fieldId: string) => {
    e.stopPropagation()
    deleteField(table.id, fieldId)
  }

  // 连接点拖拽开始
  const handleConnectionStart = useCallback(
    (fieldId: string, e: React.PointerEvent) => {
      e.stopPropagation()
      e.preventDefault()
      onStartConnection?.(table.id, fieldId, e)
    },
    [table.id, onStartConnection]
  )

  // 连接点放置（当拖拽到此字段上时）
  const handleConnectionEnd = useCallback(
    (fieldId: string) => {
      if (isConnecting && connectionStart) {
        // 不能连接到同一个字段
        if (connectionStart.tableId === table.id && connectionStart.fieldId === fieldId) {
          return
        }
        onEndConnection?.(table.id, fieldId)
      }
    },
    [table.id, isConnecting, connectionStart, onEndConnection]
  )

  // 判断字段是否是有效的放置目标
  const isValidDropTarget = useCallback(
    (fieldId: string) => {
      if (!isConnecting || !connectionStart) return false
      // 不能连接到同一个字段
      if (connectionStart.tableId === table.id && connectionStart.fieldId === fieldId) {
        return false
      }
      return true
    },
    [table.id, isConnecting, connectionStart]
  )

  // 样式
  const borderColor = isDark ? 'border-zinc-600' : 'border-zinc-300'

  return (
    <foreignObject
      x={table.x}
      y={table.y}
      width={tableWidth}
      height={calculatedHeight}
      className="group cursor-move"
      onPointerDown={onPointerDown}
    >
      <div
        onDoubleClick={onDoubleClick}
        className={`
          border-2 select-none rounded-lg w-full
          hover:border-dashed hover:border-blue-500
          ${isDark ? 'bg-zinc-800 text-zinc-200' : 'bg-zinc-100 text-zinc-800'}
          ${isSelected ? 'border-solid border-blue-500' : borderColor}
        `}
      >
        {/* 颜色条 */}
        <div
          className="h-[6px] w-full rounded-t-md"
          style={{ backgroundColor: table.color }}
        />

        {/* 表头 */}
        <div
          className={`
            h-[40px] flex justify-between items-center border-b border-gray-400
            ${isDark ? 'bg-zinc-900' : 'bg-zinc-200'}
          `}
        >
          <div className="px-3 overflow-hidden text-ellipsis whitespace-nowrap font-bold">
            {table.name || 'unnamed'}
          </div>

          {/* 悬停时显示的操作按钮 */}
          <div className="hidden group-hover:flex items-center gap-1 mx-2">
            {/* 锁定按钮 */}
            <button
              className="p-1 rounded bg-blue-500/70 hover:bg-blue-500 text-white"
              onClick={handleLockToggle}
              title={table.locked ? '解锁' : '锁定'}
            >
              {table.locked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
            </button>

            {/* 编辑按钮 */}
            <button
              className="p-1 rounded bg-blue-500/70 hover:bg-blue-500 text-white"
              onClick={(e) => {
                e.stopPropagation()
                onDoubleClick?.()
              }}
              title="编辑"
            >
              <Edit2 className="w-3 h-3" />
            </button>

            {/* 更多菜单 */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="p-1 rounded bg-gray-500/70 hover:bg-gray-500 text-white"
                  onClick={(e) => e.stopPropagation()}
                >
                  <MoreHorizontal className="w-3 h-3" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="right" className="w-48">
                {table.comment && (
                  <div className="px-2 py-1.5 text-xs">
                    <strong>备注:</strong> {table.comment}
                  </div>
                )}
                {table.indices.length > 0 && (
                  <div className="px-2 py-1.5 text-xs">
                    <strong>索引:</strong>
                    {table.indices.map((idx) => (
                      <div key={idx.id} className="mt-1 text-muted-foreground">
                        {idx.name}: {idx.fields.join(', ')}
                      </div>
                    ))}
                  </div>
                )}
                <DropdownMenuItem
                  className="text-red-500 focus:text-red-500"
                  onClick={handleDelete}
                >
                  <Trash2 className="w-3 h-3 mr-2" />
                  删除表
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* 锁定图标（非悬停时显示） */}
          {table.locked && (
            <div className="group-hover:hidden px-2">
              <Lock className="w-4 h-4 text-zinc-400" />
            </div>
          )}
        </div>

        {/* 字段列表 */}
        <div className={`${isDark ? 'bg-zinc-800' : 'bg-zinc-100'} text-xs`}>
          {fields.map((field, index) => {
            const isDropTarget = isValidDropTarget(field.id)
            const isSourceField = connectionStart?.tableId === table.id && connectionStart?.fieldId === field.id

            return (
            <div
              key={field.id}
              className={`
                h-[28px] px-2 flex justify-between items-center
                ${index !== fields.length - 1 ? 'border-b border-gray-400' : ''}
                ${isDark ? 'hover:bg-zinc-700' : 'hover:bg-gray-50'}
                ${isDropTarget ? 'bg-green-500/20' : ''}
                ${isSourceField ? 'bg-blue-500/20' : ''}
              `}
              onPointerEnter={(e) => {
                setHoveredFieldId(field.id)
                setTooltipPosition({ x: e.clientX, y: e.clientY })
              }}
              onPointerMove={(e) => {
                if (hoveredFieldId === field.id) {
                  setTooltipPosition({ x: e.clientX, y: e.clientY })
                }
              }}
              onPointerLeave={() => setHoveredFieldId(null)}
              onPointerUp={() => handleConnectionEnd(field.id)}
            >
              {/* 左侧：连接点 + 字段名 */}
              <div className="flex items-center gap-2 overflow-hidden">
                {/* 连接点 - 可拖拽 */}
                <div
                  className={`
                    shrink-0 w-3 h-3 rounded-full cursor-crosshair transition-all
                    ${isDropTarget ? 'bg-green-500 scale-125 ring-2 ring-green-300' : 'bg-blue-500/80 hover:bg-blue-500 hover:scale-110'}
                    ${isSourceField ? 'bg-orange-500 scale-125' : ''}
                  `}
                  onPointerDown={(e) => handleConnectionStart(field.id, e)}
                  title="拖拽创建关系"
                />
                <span className="text-xs truncate font-medium">
                  {field.name || 'unnamed'}
                </span>
              </div>

              {/* 右侧：字段类型或删除按钮 */}
              <div className="flex items-center gap-1 text-zinc-400">
                {hoveredFieldId === field.id ? (
                  <button
                    className="p-0.5 rounded bg-red-500/80 hover:bg-red-500 text-white"
                    onClick={(e) => handleDeleteField(e, field.id)}
                  >
                    <Minus className="w-3 h-3" />
                  </button>
                ) : (
                  <>
                    {field.primary && <span className="text-[10px]">🔑</span>}
                    {!field.notNull && <span className="font-mono text-xs">?</span>}
                    <span
                      className={`text-[10px] px-1 py-0.5 rounded font-mono ${getTypeColor(
                        diagram.database as DatabaseType,
                        field.type
                      )}`}
                    >
                      {field.type}
                      {field.size ? `(${field.size})` : ''}
                    </span>
                  </>
                )}
              </div>

              {/* 字段详情弹窗 */}
              {hoveredFieldId === field.id && (
                <FieldTooltip
                  field={field}
                  isDark={isDark}
                  database={diagram.database}
                  position={tooltipPosition}
                />
              )}
            </div>
            )
          })}

          {/* 空表提示 */}
          {fields.length === 0 && (
            <div
              className={`px-3 py-2 text-xs italic ${
                isDark ? 'text-zinc-500' : 'text-gray-400'
              }`}
            >
              No fields
            </div>
          )}
        </div>
      </div>
    </foreignObject>
  )
}

export default TableNodeComponent
