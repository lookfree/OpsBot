/**
 * ER 图状态管理
 *
 * 管理图表数据、选中状态、历史记录等
 */

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import {
  DiagramData,
  TableNode,
  TableField,
  TableIndex,
  Relationship,
  NoteNode,
  AreaNode,
  DatabaseDialect,
  CanvasTransform,
  createEmptyDiagram,
  createDefaultTable,
  createDefaultField,
} from '@/components/database/designer/types'

// 最大历史记录数
const MAX_HISTORY_SIZE = 50

interface DiagramState {
  // 图表数据
  diagram: DiagramData

  // 画布变换
  transform: CanvasTransform

  // 选中状态
  selectedTableId: string | null
  selectedFieldId: string | null
  selectedRelationshipId: string | null
  selectedNoteId: string | null
  selectedAreaId: string | null

  // 编辑状态
  isDirty: boolean

  // 连接状态（拖拽创建关系）
  isConnecting: boolean
  connectionStart: { tableId: string; fieldId: string } | null
  connectionMousePos: { x: number; y: number } | null

  // 历史记录
  history: DiagramData[]
  historyIndex: number

  // 历史操作
  pushHistory: () => void
  undo: () => void
  redo: () => void
  canUndo: () => boolean
  canRedo: () => boolean
  clearHistory: () => void

  // 数据库切换
  setDatabase: (database: DatabaseDialect) => void
  setTitle: (title: string) => void

  // 画布操作
  setTransform: (transform: Partial<CanvasTransform>) => void
  resetTransform: () => void

  // 表操作
  addTable: (x?: number, y?: number) => TableNode
  updateTable: (id: string, updates: Partial<TableNode>) => void
  deleteTable: (id: string) => void
  moveTable: (id: string, x: number, y: number) => void
  resizeTable: (id: string, width: number, height: number) => void

  // 字段操作
  addField: (tableId: string) => TableField | null
  updateField: (tableId: string, fieldId: string, updates: Partial<TableField>) => void
  deleteField: (tableId: string, fieldId: string) => void
  reorderFields: (tableId: string, fieldIds: string[]) => void

  // 索引操作
  addIndex: (tableId: string) => TableIndex | null
  updateIndex: (tableId: string, indexId: string, updates: Partial<TableIndex>) => void
  deleteIndex: (tableId: string, indexId: string) => void

  // 关系操作
  addRelationship: (relationship: Omit<Relationship, 'id'>) => Relationship
  updateRelationship: (id: string, updates: Partial<Relationship>) => void
  deleteRelationship: (id: string) => void

  // 注释操作
  addNote: (x?: number, y?: number) => NoteNode
  updateNote: (id: string, updates: Partial<NoteNode>) => void
  deleteNote: (id: string) => void

  // 区域操作
  addArea: (x?: number, y?: number) => AreaNode
  updateArea: (id: string, updates: Partial<AreaNode>) => void
  deleteArea: (id: string) => void

  // 选择操作
  selectTable: (id: string | null) => void
  selectField: (tableId: string | null, fieldId: string | null) => void
  selectRelationship: (id: string | null) => void
  selectNote: (id: string | null) => void
  selectArea: (id: string | null) => void
  clearSelection: () => void

  // 导入/导出
  loadDiagram: (data: DiagramData) => void
  exportDiagram: () => DiagramData
  reset: () => void

  // 连接操作
  startConnection: (tableId: string, fieldId: string) => void
  updateConnectionMousePos: (x: number, y: number) => void
  endConnection: (targetTableId: string, targetFieldId: string) => Relationship | null
  cancelConnection: () => void

  // 工具函数
  getTable: (id: string) => TableNode | undefined
  getField: (tableId: string, fieldId: string) => TableField | undefined
  getRelationship: (id: string) => Relationship | undefined
}

const initialTransform: CanvasTransform = {
  scale: 1,
  translateX: 0,
  translateY: 0,
}

export const useDiagramStore = create<DiagramState>()(
  persist(
    (set, get) => ({
      diagram: createEmptyDiagram(),
      transform: initialTransform,
      selectedTableId: null,
      selectedFieldId: null,
      selectedRelationshipId: null,
      selectedNoteId: null,
      selectedAreaId: null,
      isDirty: false,
      isConnecting: false,
      connectionStart: null,
      connectionMousePos: null,
      history: [],
      historyIndex: -1,

      // 历史操作
      pushHistory: () => {
        const state = get()
        const currentDiagram = JSON.parse(JSON.stringify(state.diagram)) as DiagramData
        const newHistory = state.history.slice(0, state.historyIndex + 1)
        newHistory.push(currentDiagram)

        // 限制历史记录数量
        if (newHistory.length > MAX_HISTORY_SIZE) {
          newHistory.shift()
        }

        set({
          history: newHistory,
          historyIndex: newHistory.length - 1,
        })
      },

      undo: () => {
        const state = get()
        if (state.historyIndex <= 0) return

        const newIndex = state.historyIndex - 1
        const previousDiagram = JSON.parse(
          JSON.stringify(state.history[newIndex])
        ) as DiagramData

        set({
          diagram: previousDiagram,
          historyIndex: newIndex,
          isDirty: true,
        })
      },

      redo: () => {
        const state = get()
        if (state.historyIndex >= state.history.length - 1) return

        const newIndex = state.historyIndex + 1
        const nextDiagram = JSON.parse(
          JSON.stringify(state.history[newIndex])
        ) as DiagramData

        set({
          diagram: nextDiagram,
          historyIndex: newIndex,
          isDirty: true,
        })
      },

      canUndo: () => {
        const state = get()
        return state.historyIndex > 0
      },

      canRedo: () => {
        const state = get()
        return state.historyIndex < state.history.length - 1
      },

      clearHistory: () => {
        set({
          history: [],
          historyIndex: -1,
        })
      },

      // 数据库切换
      setDatabase: (database) =>
        set((state) => ({
          diagram: { ...state.diagram, database },
          isDirty: true,
        })),

      setTitle: (title) =>
        set((state) => ({
          diagram: { ...state.diagram, title },
          isDirty: true,
        })),

      // 画布操作
      setTransform: (transform) =>
        set((state) => ({
          transform: { ...state.transform, ...transform },
        })),

      resetTransform: () => set({ transform: initialTransform }),

      // 表操作
      addTable: (x = 100, y = 100) => {
        const table = createDefaultTable(x, y)
        get().pushHistory()
        set((state) => ({
          diagram: {
            ...state.diagram,
            tables: [...state.diagram.tables, table],
          },
          selectedTableId: table.id,
          isDirty: true,
        }))
        return table
      },

      updateTable: (id, updates) => {
        get().pushHistory()
        set((state) => ({
          diagram: {
            ...state.diagram,
            tables: state.diagram.tables.map((t) =>
              t.id === id ? { ...t, ...updates } : t
            ),
          },
          isDirty: true,
        }))
      },

      deleteTable: (id) => {
        get().pushHistory()
        set((state) => ({
          diagram: {
            ...state.diagram,
            tables: state.diagram.tables.filter((t) => t.id !== id),
            // 同时删除相关的关系
            relationships: state.diagram.relationships.filter(
              (r) => r.startTableId !== id && r.endTableId !== id
            ),
          },
          selectedTableId: state.selectedTableId === id ? null : state.selectedTableId,
          isDirty: true,
        }))
      },

      moveTable: (id, x, y) =>
        set((state) => ({
          diagram: {
            ...state.diagram,
            tables: state.diagram.tables.map((t) =>
              t.id === id ? { ...t, x, y } : t
            ),
          },
          isDirty: true,
        })),

      resizeTable: (id, width, height) =>
        set((state) => ({
          diagram: {
            ...state.diagram,
            tables: state.diagram.tables.map((t) =>
              t.id === id ? { ...t, width, height } : t
            ),
          },
          isDirty: true,
        })),

      // 字段操作
      addField: (tableId) => {
        const state = get()
        const table = state.diagram.tables.find((t) => t.id === tableId)
        if (!table) return null

        // 生成默认字段名，如 field_1, field_2...
        const existingNames = new Set(table.fields.map((f) => f.name))
        let fieldNum = table.fields.length + 1
        let defaultName = `field_${fieldNum}`
        while (existingNames.has(defaultName)) {
          fieldNum++
          defaultName = `field_${fieldNum}`
        }

        const field = { ...createDefaultField(), name: defaultName }

        get().pushHistory()
        set((state) => ({
          diagram: {
            ...state.diagram,
            tables: state.diagram.tables.map((t) =>
              t.id === tableId
                ? { ...t, fields: [...t.fields, field] }
                : t
            ),
          },
          isDirty: true,
        }))
        return field
      },

      updateField: (tableId, fieldId, updates) => {
        get().pushHistory()
        set((state) => ({
          diagram: {
            ...state.diagram,
            tables: state.diagram.tables.map((t) =>
              t.id === tableId
                ? {
                    ...t,
                    fields: t.fields.map((f) =>
                      f.id === fieldId ? { ...f, ...updates } : f
                    ),
                  }
                : t
            ),
          },
          isDirty: true,
        }))
      },

      deleteField: (tableId, fieldId) => {
        get().pushHistory()
        set((state) => ({
          diagram: {
            ...state.diagram,
            tables: state.diagram.tables.map((t) =>
              t.id === tableId
                ? { ...t, fields: t.fields.filter((f) => f.id !== fieldId) }
                : t
            ),
            // 删除相关的关系
            relationships: state.diagram.relationships.filter(
              (r) =>
                !(
                  (r.startTableId === tableId && r.startFieldId === fieldId) ||
                  (r.endTableId === tableId && r.endFieldId === fieldId)
                )
            ),
          },
          isDirty: true,
        }))
      },

      reorderFields: (tableId, fieldIds) => {
        get().pushHistory()
        set((state) => ({
          diagram: {
            ...state.diagram,
            tables: state.diagram.tables.map((t) => {
              if (t.id !== tableId) return t
              const fieldMap = new Map(t.fields.map((f) => [f.id, f]))
              const reorderedFields = fieldIds
                .map((id) => fieldMap.get(id))
                .filter((f): f is TableField => f !== undefined)
              return { ...t, fields: reorderedFields }
            }),
          },
          isDirty: true,
        }))
      },

      // 索引操作
      addIndex: (tableId) => {
        const index: TableIndex = {
          id: crypto.randomUUID(),
          name: '',
          unique: false,
          fields: [],
        }
        const state = get()
        const table = state.diagram.tables.find((t) => t.id === tableId)
        if (!table) return null

        get().pushHistory()
        set((state) => ({
          diagram: {
            ...state.diagram,
            tables: state.diagram.tables.map((t) =>
              t.id === tableId
                ? { ...t, indices: [...t.indices, index] }
                : t
            ),
          },
          isDirty: true,
        }))
        return index
      },

      updateIndex: (tableId, indexId, updates) => {
        get().pushHistory()
        set((state) => ({
          diagram: {
            ...state.diagram,
            tables: state.diagram.tables.map((t) =>
              t.id === tableId
                ? {
                    ...t,
                    indices: t.indices.map((i) =>
                      i.id === indexId ? { ...i, ...updates } : i
                    ),
                  }
                : t
            ),
          },
          isDirty: true,
        }))
      },

      deleteIndex: (tableId, indexId) => {
        get().pushHistory()
        set((state) => ({
          diagram: {
            ...state.diagram,
            tables: state.diagram.tables.map((t) =>
              t.id === tableId
                ? { ...t, indices: t.indices.filter((i) => i.id !== indexId) }
                : t
            ),
          },
          isDirty: true,
        }))
      },

      // 关系操作
      addRelationship: (relationship) => {
        const newRelationship: Relationship = {
          ...relationship,
          id: crypto.randomUUID(),
        }
        get().pushHistory()
        set((state) => ({
          diagram: {
            ...state.diagram,
            relationships: [...state.diagram.relationships, newRelationship],
          },
          isDirty: true,
        }))
        return newRelationship
      },

      updateRelationship: (id, updates) => {
        get().pushHistory()
        set((state) => ({
          diagram: {
            ...state.diagram,
            relationships: state.diagram.relationships.map((r) =>
              r.id === id ? { ...r, ...updates } : r
            ),
          },
          isDirty: true,
        }))
      },

      deleteRelationship: (id) => {
        get().pushHistory()
        set((state) => ({
          diagram: {
            ...state.diagram,
            relationships: state.diagram.relationships.filter((r) => r.id !== id),
          },
          selectedRelationshipId:
            state.selectedRelationshipId === id ? null : state.selectedRelationshipId,
          isDirty: true,
        }))
      },

      // 注释操作
      addNote: (x = 100, y = 100) => {
        const note: NoteNode = {
          id: crypto.randomUUID(),
          x,
          y,
          title: 'Note',
          content: '',
          color: '#fef3c7',
          width: 200,
          height: 100,
        }
        get().pushHistory()
        set((state) => ({
          diagram: {
            ...state.diagram,
            notes: [...state.diagram.notes, note],
          },
          isDirty: true,
        }))
        return note
      },

      updateNote: (id, updates) => {
        get().pushHistory()
        set((state) => ({
          diagram: {
            ...state.diagram,
            notes: state.diagram.notes.map((n) =>
              n.id === id ? { ...n, ...updates } : n
            ),
          },
          isDirty: true,
        }))
      },

      deleteNote: (id) => {
        get().pushHistory()
        set((state) => ({
          diagram: {
            ...state.diagram,
            notes: state.diagram.notes.filter((n) => n.id !== id),
          },
          selectedNoteId: state.selectedNoteId === id ? null : state.selectedNoteId,
          isDirty: true,
        }))
      },

      // 区域操作
      addArea: (x = 50, y = 50) => {
        const area: AreaNode = {
          id: crypto.randomUUID(),
          name: 'Area',
          x,
          y,
          width: 400,
          height: 300,
          color: '#e5e7eb',
        }
        get().pushHistory()
        set((state) => ({
          diagram: {
            ...state.diagram,
            areas: [...state.diagram.areas, area],
          },
          isDirty: true,
        }))
        return area
      },

      updateArea: (id, updates) => {
        get().pushHistory()
        set((state) => ({
          diagram: {
            ...state.diagram,
            areas: state.diagram.areas.map((a) =>
              a.id === id ? { ...a, ...updates } : a
            ),
          },
          isDirty: true,
        }))
      },

      deleteArea: (id) => {
        get().pushHistory()
        set((state) => ({
          diagram: {
            ...state.diagram,
            areas: state.diagram.areas.filter((a) => a.id !== id),
          },
          selectedAreaId: state.selectedAreaId === id ? null : state.selectedAreaId,
          isDirty: true,
        }))
      },

      // 选择操作
      selectTable: (id) =>
        set({
          selectedTableId: id,
          selectedFieldId: null,
          selectedRelationshipId: null,
          selectedNoteId: null,
          selectedAreaId: null,
        }),

      selectField: (tableId, fieldId) =>
        set({
          selectedTableId: tableId,
          selectedFieldId: fieldId,
          selectedRelationshipId: null,
          selectedNoteId: null,
          selectedAreaId: null,
        }),

      selectRelationship: (id) =>
        set({
          selectedTableId: null,
          selectedFieldId: null,
          selectedRelationshipId: id,
          selectedNoteId: null,
          selectedAreaId: null,
        }),

      selectNote: (id) =>
        set({
          selectedTableId: null,
          selectedFieldId: null,
          selectedRelationshipId: null,
          selectedNoteId: id,
          selectedAreaId: null,
        }),

      selectArea: (id) =>
        set({
          selectedTableId: null,
          selectedFieldId: null,
          selectedRelationshipId: null,
          selectedNoteId: null,
          selectedAreaId: id,
        }),

      clearSelection: () =>
        set({
          selectedTableId: null,
          selectedFieldId: null,
          selectedRelationshipId: null,
          selectedNoteId: null,
          selectedAreaId: null,
        }),

      // 导入/导出
      loadDiagram: (data) =>
        set({
          diagram: data,
          selectedTableId: null,
          selectedFieldId: null,
          selectedRelationshipId: null,
          selectedNoteId: null,
          selectedAreaId: null,
          isDirty: false,
          history: [],
          historyIndex: -1,
        }),

      exportDiagram: () => get().diagram,

      reset: () =>
        set({
          diagram: createEmptyDiagram(),
          transform: initialTransform,
          selectedTableId: null,
          selectedFieldId: null,
          selectedRelationshipId: null,
          selectedNoteId: null,
          selectedAreaId: null,
          isDirty: false,
          isConnecting: false,
          connectionStart: null,
          connectionMousePos: null,
          history: [],
          historyIndex: -1,
        }),

      // 连接操作
      startConnection: (tableId, fieldId) =>
        set({
          isConnecting: true,
          connectionStart: { tableId, fieldId },
          connectionMousePos: null,
        }),

      updateConnectionMousePos: (x, y) =>
        set({
          connectionMousePos: { x, y },
        }),

      endConnection: (targetTableId, targetFieldId) => {
        const state = get()
        const { connectionStart } = state

        // 验证连接有效性
        if (!connectionStart) {
          set({ isConnecting: false, connectionStart: null, connectionMousePos: null })
          return null
        }

        // 不能连接到同一个表的同一个字段
        if (connectionStart.tableId === targetTableId && connectionStart.fieldId === targetFieldId) {
          set({ isConnecting: false, connectionStart: null, connectionMousePos: null })
          return null
        }

        // 检查是否已存在相同的关系
        const existingRelationship = state.diagram.relationships.find(
          (r) =>
            (r.startTableId === connectionStart.tableId &&
              r.startFieldId === connectionStart.fieldId &&
              r.endTableId === targetTableId &&
              r.endFieldId === targetFieldId) ||
            (r.startTableId === targetTableId &&
              r.startFieldId === targetFieldId &&
              r.endTableId === connectionStart.tableId &&
              r.endFieldId === connectionStart.fieldId)
        )

        if (existingRelationship) {
          set({ isConnecting: false, connectionStart: null, connectionMousePos: null })
          return null
        }

        // 创建新关系
        const newRelationship: Relationship = {
          id: crypto.randomUUID(),
          name: '',
          startTableId: connectionStart.tableId,
          startFieldId: connectionStart.fieldId,
          endTableId: targetTableId,
          endFieldId: targetFieldId,
          cardinality: 'one_to_many',
          updateConstraint: 'NO ACTION',
          deleteConstraint: 'NO ACTION',
        }

        get().pushHistory()
        set((state) => ({
          diagram: {
            ...state.diagram,
            relationships: [...state.diagram.relationships, newRelationship],
          },
          isConnecting: false,
          connectionStart: null,
          connectionMousePos: null,
          isDirty: true,
        }))

        return newRelationship
      },

      cancelConnection: () =>
        set({
          isConnecting: false,
          connectionStart: null,
          connectionMousePos: null,
        }),

      // 工具函数
      getTable: (id) => get().diagram.tables.find((t) => t.id === id),

      getField: (tableId, fieldId) => {
        const table = get().diagram.tables.find((t) => t.id === tableId)
        return table?.fields.find((f) => f.id === fieldId)
      },

      getRelationship: (id) => get().diagram.relationships.find((r) => r.id === id),
    }),
    {
      name: 'zwd-opsbot-diagram',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        diagram: state.diagram,
        transform: state.transform,
      }),
    }
  )
)
