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
import { toKingBase } from './kingbase'
import { toDM } from './dm'
import { toSQLite } from './sqlite'
import { toClickHouse } from './clickhouse'

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
    case 'kingbase':
      return toKingBase(diagram)
    case 'dm':
      return toDM(diagram)
    case 'sqlite':
      return toSQLite(diagram)
    case 'clickhouse':
      return toClickHouse(diagram)
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
export { toKingBase } from './kingbase'
export { toDM } from './dm'
export { toSQLite } from './sqlite'
export { toClickHouse } from './clickhouse'

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
