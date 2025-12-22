/**
 * SQL 生成器入口
 *
 * 策略模式：根据目标数据库选择对应的生成器
 */

import { DiagramData } from '@/components/database/designer/types'
import { toMySQL } from './mysql'
import { toMariaDB } from './mariadb'
import { toPostgres } from './postgresql'
import { toOracle } from './oracle'
import { toMSSQL } from './mssql'

/**
 * 根据图表数据生成对应数据库的 SQL
 */
export function generateSQL(diagram: DiagramData): string {
  switch (diagram.database) {
    case 'mysql':
      return toMySQL(diagram)
    case 'postgresql':
      return toPostgres(diagram)
    case 'mariadb':
      return toMariaDB(diagram)
    case 'oracle':
      return toOracle(diagram)
    case 'mssql':
      return toMSSQL(diagram)
    case 'sqlite':
      // TODO: 实现 SQLite 生成器
      return toMySQL(diagram) // 临时使用 MySQL
    default:
      return toMySQL(diagram)
  }
}

// 导出各个生成器供直接使用
export { toMySQL } from './mysql'
export { toMariaDB } from './mariadb'
export { toPostgres } from './postgresql'
export { toOracle } from './oracle'
export { toMSSQL } from './mssql'

// 导出共享工具函数
export {
  isFunction,
  isKeyword,
  escapeQuotes,
  parseDefault,
  parseTypeSize,
  exportFieldComment,
  getInlineFK,
  generateFKName,
  getPrimaryKeyFields,
  hasAutoIncrement,
} from './shared'
