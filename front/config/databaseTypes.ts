/**
 * 数据库类型配置
 *
 * 定义支持的数据库类型、图标、默认端口等信息
 */

export interface DatabaseTypeConfig {
  id: string
  name: string
  icon: string
  defaultPort: number
  enabled: boolean
  category: 'relational' | 'nosql' | 'bigdata' | 'timeseries'
}

// 数据库类型配置列表
export const DATABASE_TYPES: DatabaseTypeConfig[] = [
  // 关系型数据库
  {
    id: 'mysql',
    name: 'MySQL',
    icon: '/assets/icons/mysql-icon.webp',
    defaultPort: 3306,
    enabled: true,
    category: 'relational',
  },
  {
    id: 'postgresql',
    name: 'PostgreSQL',
    icon: '/assets/icons/postgresql-icon.svg',
    defaultPort: 5432,
    enabled: true,
    category: 'relational',
  },
  {
    id: 'mariadb',
    name: 'MariaDB',
    icon: '/assets/icons/mariadb-icon.png',
    defaultPort: 3306,
    enabled: false,
    category: 'relational',
  },
  {
    id: 'oracle',
    name: 'Oracle',
    icon: '/assets/icons/oracle-icon.svg',
    defaultPort: 1521,
    enabled: false,
    category: 'relational',
  },
  {
    id: 'sqlserver',
    name: 'SQL Server',
    icon: '/assets/icons/sqlserver-icon.svg',
    defaultPort: 1433,
    enabled: false,
    category: 'relational',
  },
  {
    id: 'sqlite',
    name: 'SQLite',
    icon: '/assets/icons/sqlite-icon.svg',
    defaultPort: 0,
    enabled: false,
    category: 'relational',
  },
  {
    id: 'db2',
    name: 'Db2 for LUW',
    icon: '/assets/icons/db2-icon.svg',
    defaultPort: 50000,
    enabled: false,
    category: 'relational',
  },
  // 大数据/分析型
  {
    id: 'clickhouse',
    name: 'ClickHouse',
    icon: '/assets/icons/clickhouse-icon.svg',
    defaultPort: 8123,
    enabled: false,
    category: 'bigdata',
  },
  {
    id: 'hive',
    name: 'Apache Hive',
    icon: '/assets/icons/hive-icon.svg',
    defaultPort: 10000,
    enabled: false,
    category: 'bigdata',
  },
]

// 按分类获取数据库类型
export function getDatabaseTypesByCategory(category: DatabaseTypeConfig['category']) {
  return DATABASE_TYPES.filter(db => db.category === category)
}

// 根据 ID 获取数据库类型配置
export function getDatabaseTypeById(id: string): DatabaseTypeConfig | undefined {
  return DATABASE_TYPES.find(db => db.id === id)
}

// 获取所有启用的数据库类型
export function getEnabledDatabaseTypes() {
  return DATABASE_TYPES.filter(db => db.enabled)
}
