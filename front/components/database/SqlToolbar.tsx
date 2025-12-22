/**
 * SQL Toolbar Component
 *
 * Toolbar for SQL editor with execute, format, export, and other actions.
 */

import { useTranslation } from 'react-i18next'
import {
  Database,
  Play,
  Loader2,
  MoreHorizontal,
  FileCode,
  ChevronDownIcon,
  AlignLeft,
  Minimize2,
  FileSpreadsheet,
  Download,
  ClipboardList,
  Workflow,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { ThemeStyles } from './types'

interface SqlToolbarProps {
  databases: string[]
  selectedDatabase: string
  sql: string
  isExecuting: boolean
  hasResults: boolean
  styles: ThemeStyles
  onDatabaseSelect: (db: string) => void
  onExecute: () => void
  onExplain: () => void
  onFormat: () => void
  onCompress: () => void
  onExportCsv: () => void
  onExportJson: () => void
  onClear: () => void
  onOpenERDesigner?: () => void
}

export function SqlToolbar({
  databases,
  selectedDatabase,
  sql,
  isExecuting,
  hasResults,
  styles,
  onDatabaseSelect,
  onExecute,
  onExplain,
  onFormat,
  onCompress,
  onExportCsv,
  onExportJson,
  onClear,
  onOpenERDesigner,
}: SqlToolbarProps) {
  const { t } = useTranslation()
  const { borderColor, hoverBg } = styles

  return (
    <div className={cn('flex items-center gap-2 px-3 py-2 border-b shrink-0', borderColor)}>
      {/* Database selector */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className={cn('flex items-center gap-1 px-2 py-1.5 rounded text-sm border', borderColor, hoverBg)}>
            <Database className="w-4 h-4" />
            <span className="max-w-[120px] truncate">{selectedDatabase || t('database.selectDatabase')}</span>
            <ChevronDownIcon className="w-3 h-3" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {databases.map((db) => (
            <DropdownMenuItem key={db} onSelect={() => onDatabaseSelect(db)}>
              <Database className="w-4 h-4 mr-2" />
              {db}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Execute button */}
      <button
        onClick={onExecute}
        disabled={isExecuting || !sql.trim()}
        className={cn(
          'flex items-center gap-1 px-3 py-1.5 rounded text-sm',
          'bg-accent-primary text-white',
          'hover:bg-accent-hover transition-colors',
          'disabled:opacity-50 disabled:cursor-not-allowed'
        )}
      >
        {isExecuting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
        {t('database.execute')}
      </button>

      {/* Explain button */}
      <button
        onClick={onExplain}
        disabled={isExecuting || !sql.trim()}
        className={cn(
          'flex items-center gap-1 px-2 py-1.5 rounded text-sm border',
          borderColor,
          hoverBg,
          'disabled:opacity-50 disabled:cursor-not-allowed'
        )}
        title={t('database.explainPlan')}
      >
        <ClipboardList className="w-4 h-4" />
        {t('database.explain')}
      </button>

      {/* Format button */}
      <button
        onClick={onFormat}
        disabled={!sql.trim()}
        className={cn('p-1.5 rounded border', borderColor, hoverBg, 'disabled:opacity-50 disabled:cursor-not-allowed')}
        title={t('database.format')}
      >
        <AlignLeft className="w-4 h-4" />
      </button>

      {/* Compress button */}
      <button
        onClick={onCompress}
        disabled={!sql.trim()}
        className={cn('p-1.5 rounded border', borderColor, hoverBg, 'disabled:opacity-50 disabled:cursor-not-allowed')}
        title={t('database.compress')}
      >
        <Minimize2 className="w-4 h-4" />
      </button>

      {/* Export dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            disabled={!hasResults}
            className={cn(
              'flex items-center gap-1 px-2 py-1.5 rounded text-sm border',
              borderColor,
              hoverBg,
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
          >
            <Download className="w-4 h-4" />
            {t('database.export')}
            <ChevronDownIcon className="w-3 h-3" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onSelect={onExportCsv}>
            <FileSpreadsheet className="w-4 h-4 mr-2" />
            {t('database.exportCsv')}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onExportJson}>
            <FileCode className="w-4 h-4 mr-2" />
            {t('database.exportJson')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* More actions */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className={cn('p-1.5 rounded', hoverBg)}>
            <MoreHorizontal className="w-4 h-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onSelect={onClear}>{t('database.clearEditor')}</DropdownMenuItem>
          {onOpenERDesigner && (
            <DropdownMenuItem onSelect={onOpenERDesigner}>
              <Workflow className="w-4 h-4 mr-2" />
              {t('database.erDesigner.title')}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
