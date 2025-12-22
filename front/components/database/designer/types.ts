/**
 * ER 图设计器类型定义
 *
 * 参考 DrawDB 的 JSON Schema 设计
 */

// 支持的数据库类型
export type DatabaseDialect =
  | 'mysql'
  | 'postgresql'
  | 'mariadb'
  | 'sqlite'
  | 'mssql'
  | 'oracle'

// 外键约束动作
export type ConstraintAction =
  | 'NO ACTION'
  | 'RESTRICT'
  | 'CASCADE'
  | 'SET NULL'
  | 'SET DEFAULT'

// 关系基数
export type Cardinality = 'one_to_one' | 'one_to_many' | 'many_to_one'

// 字段定义
export interface TableField {
  id: string
  name: string
  type: string
  size?: number
  precision?: number
  scale?: number
  default: string
  check: string
  primary: boolean
  unique: boolean
  notNull: boolean
  increment: boolean
  unsigned?: boolean
  isArray?: boolean
  comment: string
  values?: string[]
}

// 索引定义
export interface TableIndex {
  id: string
  name: string
  unique: boolean
  fields: string[]
  type?: string
}

// 表节点定义
export interface TableNode {
  id: string
  name: string
  x: number
  y: number
  width: number
  height: number
  fields: TableField[]
  indices: TableIndex[]
  comment: string
  color: string
  locked?: boolean
  hidden?: boolean
}

// 关系定义
export interface Relationship {
  id: string
  name: string
  startTableId: string
  startFieldId: string
  endTableId: string
  endFieldId: string
  cardinality: Cardinality
  updateConstraint: ConstraintAction
  deleteConstraint: ConstraintAction
}

// 注释节点
export interface NoteNode {
  id: string
  x: number
  y: number
  title: string
  content: string
  color: string
  width: number
  height: number
  locked?: boolean
}

// 分组区域
export interface AreaNode {
  id: string
  name: string
  x: number
  y: number
  width: number
  height: number
  color: string
  locked?: boolean
}

// 完整图表数据
export interface DiagramData {
  title: string
  database: DatabaseDialect
  tables: TableNode[]
  relationships: Relationship[]
  notes: NoteNode[]
  areas: AreaNode[]
}

// 图表文件格式
export interface DiagramFile {
  author: string
  project: string
  title: string
  date: string
  version: string
  data: DiagramData
}

// 画布变换状态
export interface CanvasTransform {
  scale: number
  translateX: number
  translateY: number
}

// 拖拽状态
export interface DragState {
  isDragging: boolean
  startX: number
  startY: number
  elementId: string | null
}

// 连接点位置
export type ConnectionSide = 'top' | 'right' | 'bottom' | 'left'

// 连接点
export interface ConnectionPoint {
  x: number
  y: number
  side: ConnectionSide
}

// 默认表颜色列表
export const TABLE_COLORS = [
  '#175e7a', // 蓝色
  '#2a6f4e', // 绿色
  '#7c3aed', // 紫色
  '#dc2626', // 红色
  '#d97706', // 橙色
  '#0891b2', // 青色
  '#be185d', // 粉色
  '#4b5563', // 灰色
]

// 创建默认字段
export function createDefaultField(): TableField {
  return {
    id: crypto.randomUUID(),
    name: '',
    type: 'INT',
    default: '',
    check: '',
    primary: false,
    unique: false,
    notNull: false,
    increment: false,
    comment: '',
  }
}

// 创建默认表
export function createDefaultTable(x: number = 100, y: number = 100): TableNode {
  return {
    id: crypto.randomUUID(),
    name: 'new_table',
    x,
    y,
    width: 200,
    height: 150,
    fields: [
      {
        id: crypto.randomUUID(),
        name: 'id',
        type: 'INT',
        default: '',
        check: '',
        primary: true,
        unique: false,
        notNull: true,
        increment: true,
        comment: '',
      },
    ],
    indices: [],
    comment: '',
    color: TABLE_COLORS[0],
  }
}

// 创建默认关系
export function createDefaultRelationship(
  startTableId: string,
  startFieldId: string,
  endTableId: string,
  endFieldId: string
): Relationship {
  return {
    id: crypto.randomUUID(),
    name: '',
    startTableId,
    startFieldId,
    endTableId,
    endFieldId,
    cardinality: 'one_to_many',
    updateConstraint: 'NO ACTION',
    deleteConstraint: 'CASCADE',
  }
}

// 创建空图表
export function createEmptyDiagram(database: DatabaseDialect = 'mysql'): DiagramData {
  return {
    title: 'Untitled Diagram',
    database,
    tables: [],
    relationships: [],
    notes: [],
    areas: [],
  }
}
