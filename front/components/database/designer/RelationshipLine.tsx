/**
 * ER 图关系线组件
 *
 * 渲染表之间的外键关系连接线
 */

import React, { useMemo } from 'react'
import { Relationship, TableNode, Cardinality } from './types'
import { useDiagramStore } from '@/stores/diagramStore'
import { useThemeStore } from '@/stores/themeStore'

interface RelationshipLineProps {
  relationship: Relationship
  isSelected: boolean
}

// 字段行高度 - 需要与 TableNode.tsx 保持一致
const FIELD_HEIGHT = 26
// 表头高度
const HEADER_HEIGHT = 32

// 计算字段在表中的 Y 偏移
function getFieldYOffset(table: TableNode, fieldId: string): number {
  const fieldIndex = table.fields.findIndex((f) => f.id === fieldId)
  if (fieldIndex === -1) return HEADER_HEIGHT
  return HEADER_HEIGHT + fieldIndex * FIELD_HEIGHT + FIELD_HEIGHT / 2
}

// 计算连接点
function getConnectionPoints(
  startTable: TableNode,
  startFieldId: string,
  endTable: TableNode,
  endFieldId: string
): { x1: number; y1: number; x2: number; y2: number } {
  const startFieldY = getFieldYOffset(startTable, startFieldId)
  const endFieldY = getFieldYOffset(endTable, endFieldId)

  // 计算表的中心 X
  const startCenterX = startTable.x + (startTable.width || 180) / 2
  const endCenterX = endTable.x + (endTable.width || 180) / 2

  // 判断连接从左边还是右边
  let x1: number, x2: number

  if (startCenterX < endCenterX) {
    // 起始表在左边
    x1 = startTable.x + (startTable.width || 180)
    x2 = endTable.x
  } else {
    // 起始表在右边
    x1 = startTable.x
    x2 = endTable.x + (endTable.width || 180)
  }

  return {
    x1,
    y1: startTable.y + startFieldY,
    x2,
    y2: endTable.y + endFieldY,
  }
}

// 生成贝塞尔曲线路径
function generatePath(
  x1: number,
  y1: number,
  x2: number,
  y2: number
): string {
  const dx = Math.abs(x2 - x1)
  const controlOffset = Math.min(dx * 0.5, 80)

  // 水平贝塞尔曲线
  const cx1 = x1 < x2 ? x1 + controlOffset : x1 - controlOffset
  const cx2 = x1 < x2 ? x2 - controlOffset : x2 + controlOffset

  return `M ${x1} ${y1} C ${cx1} ${y1}, ${cx2} ${y2}, ${x2} ${y2}`
}

// 基数标记组件
function CardinalityMarker({
  x,
  y,
  cardinality,
  isStart,
  isDark,
}: {
  x: number
  y: number
  cardinality: Cardinality
  isStart: boolean
  isDark: boolean
}) {
  const offset = isStart ? -15 : 15
  const textColor = isDark ? '#9ca3af' : '#6b7280'

  // 根据基数类型确定标记
  let marker = ''
  if (isStart) {
    marker = cardinality === 'one_to_one' || cardinality === 'one_to_many' ? '1' : 'N'
  } else {
    marker = cardinality === 'one_to_one' || cardinality === 'many_to_one' ? '1' : 'N'
  }

  return (
    <text
      x={x + offset}
      y={y - 8}
      fontSize="10"
      fill={textColor}
      textAnchor="middle"
    >
      {marker}
    </text>
  )
}

export function RelationshipLineComponent({
  relationship,
  isSelected,
}: RelationshipLineProps) {
  const { theme } = useThemeStore()
  const isDark = theme === 'dark'

  const { diagram, selectRelationship } = useDiagramStore()

  // 查找起始表和目标表
  const startTable = diagram.tables.find((t) => t.id === relationship.startTableId)
  const endTable = diagram.tables.find((t) => t.id === relationship.endTableId)

  // 计算连接点和路径
  const { x1, y1, x2, y2, path } = useMemo(() => {
    if (!startTable || !endTable) {
      return { x1: 0, y1: 0, x2: 0, y2: 0, path: '' }
    }

    const points = getConnectionPoints(
      startTable,
      relationship.startFieldId,
      endTable,
      relationship.endFieldId
    )

    return {
      ...points,
      path: generatePath(points.x1, points.y1, points.x2, points.y2),
    }
  }, [startTable, endTable, relationship.startFieldId, relationship.endFieldId])

  // 如果找不到表，不渲染
  if (!startTable || !endTable || !path) {
    return null
  }

  // 点击处理
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    selectRelationship(relationship.id)
  }

  // 样式
  const lineColor = isSelected
    ? '#3b82f6'
    : isDark
    ? '#6b7280'
    : '#9ca3af'

  const lineWidth = isSelected ? 2.5 : 1.5

  return (
    <g onClick={handleClick} style={{ cursor: 'pointer' }}>
      {/* 透明的较粗路径用于更容易点击 */}
      <path
        d={path}
        fill="none"
        stroke="transparent"
        strokeWidth={12}
      />

      {/* 实际的关系线 */}
      <path
        d={path}
        fill="none"
        stroke={lineColor}
        strokeWidth={lineWidth}
        strokeDasharray={relationship.cardinality === 'one_to_one' ? 'none' : 'none'}
      />

      {/* 起始端点标记 */}
      <circle
        cx={x1}
        cy={y1}
        r={4}
        fill={lineColor}
      />

      {/* 结束端点箭头 */}
      <polygon
        points={`${x2},${y2} ${x2 + (x1 < x2 ? -10 : 10)},${y2 - 5} ${x2 + (x1 < x2 ? -10 : 10)},${y2 + 5}`}
        fill={lineColor}
      />

      {/* 基数标记 */}
      <CardinalityMarker
        x={x1}
        y={y1}
        cardinality={relationship.cardinality}
        isStart={true}
        isDark={isDark}
      />
      <CardinalityMarker
        x={x2}
        y={y2}
        cardinality={relationship.cardinality}
        isStart={false}
        isDark={isDark}
      />

      {/* 选中时显示关系名称 */}
      {isSelected && relationship.name && (
        <text
          x={(x1 + x2) / 2}
          y={(y1 + y2) / 2 - 10}
          fontSize="11"
          fill={lineColor}
          textAnchor="middle"
          className="pointer-events-none"
        >
          {relationship.name}
        </text>
      )}
    </g>
  )
}

export default RelationshipLineComponent
