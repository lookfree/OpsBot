/**
 * ER 图工具栏组件
 *
 * 提供添加表、切换数据库、缩放控制、导出等功能
 */

import { useCallback, useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useDiagramStore } from '@/stores/diagramStore'
import { useThemeStore } from '@/stores/themeStore'
import { DatabaseDialect } from './types'
import { generateSQL } from '@/utils/sql-generator'
import { Undo2, Redo2 } from 'lucide-react'

interface ERDiagramToolbarProps {
  onClose?: () => void
}

// 支持的数据库列表
const DATABASES: { value: DatabaseDialect; label: string }[] = [
  { value: 'mysql', label: 'MySQL' },
  { value: 'postgresql', label: 'PostgreSQL' },
  { value: 'mariadb', label: 'MariaDB' },
  { value: 'oracle', label: 'Oracle' },
  { value: 'mssql', label: 'SQL Server' },
  { value: 'sqlite', label: 'SQLite' },
]

export function ERDiagramToolbar({ onClose }: ERDiagramToolbarProps) {
  const { t } = useTranslation()
  const { theme } = useThemeStore()
  const isDark = theme === 'dark'

  const {
    diagram,
    transform,
    isDirty,
    addTable,
    addNote,
    setDatabase,
    setTitle,
    setTransform,
    resetTransform,
    reset,
    undo,
    redo,
    canUndo,
    canRedo,
  } = useDiagramStore()

  const [showSQLPreview, setShowSQLPreview] = useState(false)

  // 键盘快捷键
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+Z / Cmd+Z for undo
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        if (canUndo()) {
          undo()
        }
      }
      // Ctrl+Y / Cmd+Shift+Z for redo
      if (
        ((e.ctrlKey || e.metaKey) && e.key === 'y') ||
        ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'z')
      ) {
        e.preventDefault()
        if (canRedo()) {
          redo()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [undo, redo, canUndo, canRedo])

  // 添加表
  const handleAddTable = useCallback(() => {
    // 在视口中心添加表
    const centerX = (window.innerWidth / 2 - transform.translateX) / transform.scale
    const centerY = (window.innerHeight / 2 - transform.translateY) / transform.scale
    addTable(centerX, centerY)
  }, [transform, addTable])

  // 添加注释
  const handleAddNote = useCallback(() => {
    const centerX = (window.innerWidth / 2 - transform.translateX) / transform.scale
    const centerY = (window.innerHeight / 2 - transform.translateY) / transform.scale
    addNote(centerX, centerY)
  }, [transform, addNote])

  // 切换数据库
  const handleDatabaseChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      setDatabase(e.target.value as DatabaseDialect)
    },
    [setDatabase]
  )

  // 修改标题
  const handleTitleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setTitle(e.target.value)
    },
    [setTitle]
  )

  // 缩放控制
  const handleZoomIn = useCallback(() => {
    setTransform({ scale: Math.min(2, transform.scale * 1.2) })
  }, [transform.scale, setTransform])

  const handleZoomOut = useCallback(() => {
    setTransform({ scale: Math.max(0.25, transform.scale / 1.2) })
  }, [transform.scale, setTransform])

  const handleZoomReset = useCallback(() => {
    resetTransform()
  }, [resetTransform])

  // 导出 SQL
  const handleExportSQL = useCallback(() => {
    const sql = generateSQL(diagram)
    const blob = new Blob([sql], { type: 'text/sql' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${diagram.title || 'diagram'}.sql`
    a.click()
    URL.revokeObjectURL(url)
  }, [diagram])

  // 清空图表
  const handleClear = useCallback(() => {
    if (window.confirm(t('database.erDesigner.confirmClearDiagram'))) {
      reset()
    }
  }, [reset, t])

  // 样式类
  const toolbarClass = `
    flex items-center gap-2 px-3 py-2 border-b
    ${isDark ? 'bg-dark-bg-secondary border-dark-border' : 'bg-white border-light-border'}
  `

  const buttonClass = `
    px-3 py-1.5 text-sm rounded transition-colors
    ${
      isDark
        ? 'bg-dark-bg-hover hover:bg-dark-bg-hover text-dark-text-primary'
        : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
    }
  `

  const primaryButtonClass = `
    px-3 py-1.5 text-sm rounded transition-colors
    bg-blue-500 hover:bg-blue-600 text-white
  `

  const inputClass = `
    px-2 py-1 text-sm rounded border
    ${
      isDark
        ? 'bg-dark-bg-hover border-dark-border text-dark-text-primary'
        : 'bg-white border-gray-300 text-gray-700'
    }
  `

  const selectClass = `
    px-2 py-1 text-sm rounded border
    ${
      isDark
        ? 'bg-dark-bg-hover border-dark-border text-dark-text-primary'
        : 'bg-white border-gray-300 text-gray-700'
    }
  `

  return (
    <>
      <div className={toolbarClass}>
        {/* 关闭按钮 */}
        {onClose && (
          <button
            className={buttonClass}
            onClick={onClose}
            title={t('database.erDesigner.closeDesigner')}
          >
            ✕
          </button>
        )}

        {/* 分隔线 */}
        {onClose && (
          <div className={`h-6 w-px ${isDark ? 'bg-dark-border' : 'bg-gray-300'}`} />
        )}

        {/* 标题输入 */}
        <input
          type="text"
          value={diagram.title}
          onChange={handleTitleChange}
          className={`${inputClass} w-48`}
          placeholder={t('database.erDesigner.diagramTitle')}
        />

        {/* 数据库选择 */}
        <select
          value={diagram.database}
          onChange={handleDatabaseChange}
          className={selectClass}
        >
          {DATABASES.map((db) => (
            <option key={db.value} value={db.value}>
              {db.label}
            </option>
          ))}
        </select>

        {/* 分隔线 */}
        <div className={`h-6 w-px ${isDark ? 'bg-dark-border' : 'bg-gray-300'}`} />

        {/* 撤销/重做按钮 */}
        <div className="flex items-center gap-1">
          <button
            className={`${buttonClass} ${!canUndo() ? 'opacity-40 cursor-not-allowed' : ''}`}
            onClick={undo}
            disabled={!canUndo()}
            title={`${t('database.erDesigner.undo')} (Ctrl+Z)`}
          >
            <Undo2 className="w-4 h-4" />
          </button>
          <button
            className={`${buttonClass} ${!canRedo() ? 'opacity-40 cursor-not-allowed' : ''}`}
            onClick={redo}
            disabled={!canRedo()}
            title={`${t('database.erDesigner.redo')} (Ctrl+Y)`}
          >
            <Redo2 className="w-4 h-4" />
          </button>
        </div>

        {/* 分隔线 */}
        <div className={`h-6 w-px ${isDark ? 'bg-dark-border' : 'bg-gray-300'}`} />

        {/* 添加按钮 */}
        <button
          className={primaryButtonClass}
          onClick={handleAddTable}
          title={t('database.erDesigner.addTable')}
        >
          {t('database.erDesigner.addTable')}
        </button>

        <button
          className={buttonClass}
          onClick={handleAddNote}
          title={t('database.erDesigner.addNote')}
        >
          {t('database.erDesigner.addNote')}
        </button>

        {/* 分隔线 */}
        <div className={`h-6 w-px ${isDark ? 'bg-dark-border' : 'bg-gray-300'}`} />

        {/* 缩放控制 */}
        <div className="flex items-center gap-1">
          <button
            className={buttonClass}
            onClick={handleZoomOut}
            title={t('database.erDesigner.zoomOut')}
          >
            −
          </button>
          <button
            className={`${buttonClass} min-w-[60px] text-center`}
            onClick={handleZoomReset}
            title={t('database.erDesigner.resetZoom')}
          >
            {Math.round(transform.scale * 100)}%
          </button>
          <button
            className={buttonClass}
            onClick={handleZoomIn}
            title={t('database.erDesigner.zoomIn')}
          >
            +
          </button>
        </div>

        {/* 右侧按钮 */}
        <div className="flex-1" />

        {/* SQL 预览 */}
        <button
          className={buttonClass}
          onClick={() => setShowSQLPreview(!showSQLPreview)}
          title={t('database.erDesigner.previewSQL')}
        >
          {t('database.erDesigner.sqlPreview')}
        </button>

        {/* 导出 */}
        <button
          className={primaryButtonClass}
          onClick={handleExportSQL}
          title={t('database.erDesigner.exportSQL')}
        >
          {t('database.erDesigner.exportSQL')}
        </button>

        {/* 清空 */}
        <button
          className={`${buttonClass} text-red-500`}
          onClick={handleClear}
          title={t('database.erDesigner.clearDiagram')}
        >
          {t('common.clear')}
        </button>

        {/* 修改指示 */}
        {isDirty && (
          <span className={`text-xs ${isDark ? 'text-yellow-400' : 'text-yellow-600'}`}>
            ●
          </span>
        )}
      </div>

      {/* SQL 预览面板 */}
      {showSQLPreview && (
        <div
          className={`absolute right-0 top-12 w-96 max-h-[60vh] overflow-auto shadow-lg rounded-bl-lg border-l border-b z-50 ${
            isDark ? 'bg-dark-bg-secondary border-dark-border' : 'bg-white border-gray-200'
          }`}
        >
          <div
            className={`flex items-center justify-between px-3 py-2 border-b ${
              isDark ? 'border-dark-border' : 'border-gray-200'
            }`}
          >
            <span className={`font-medium text-sm ${isDark ? 'text-dark-text-primary' : 'text-gray-700'}`}>
              {t('database.erDesigner.sqlPreview')} ({diagram.database.toUpperCase()})
            </span>
            <button
              className="text-gray-400 hover:text-gray-600"
              onClick={() => setShowSQLPreview(false)}
            >
              ✕
            </button>
          </div>
          <pre
            className={`p-3 text-xs font-mono whitespace-pre-wrap ${
              isDark ? 'text-dark-text-secondary' : 'text-gray-600'
            }`}
          >
            {diagram.tables.length > 0
              ? generateSQL(diagram)
              : `-- ${t('database.erDesigner.noTablesYet')}`}
          </pre>
        </div>
      )}
    </>
  )
}

export default ERDiagramToolbar
