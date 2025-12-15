/**
 * Database Component Types
 */

import type { TableStructure, QueryResult } from '@/services/database'

// Schema node types
export type SchemaNodeType =
  | 'database'
  | 'category'
  | 'table'
  | 'view'
  | 'function'
  | 'procedure'
  | 'column'
  | 'index'

export interface SchemaNode {
  id: string
  name: string
  type: SchemaNodeType
  expanded?: boolean
  children?: SchemaNode[]
  data?: TableStructure
  count?: number
  dbName?: string
  categoryType?: 'tables' | 'views' | 'functions' | 'procedures'
}

export interface ThemeStyles {
  bgSecondary: string
  borderColor: string
  textPrimary: string
  textSecondary: string
  hoverBg: string
  isDark: boolean
}

export type { QueryResult }
