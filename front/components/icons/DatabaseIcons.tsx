/**
 * Database Type Icons
 *
 * Custom SVG icons for different database types.
 */

import { cn } from '@/lib/utils'

interface IconProps {
  className?: string
}

// MySQL Dolphin Icon (Classic MySQL dolphin logo)
export function MySQLIcon({ className }: IconProps) {
  return (
    <img
      src="/assets/icons/mysql-icon.webp"
      alt="MySQL"
      className={cn('w-4 h-4', className)}
    />
  )
}

// PostgreSQL Elephant Icon
export function PostgreSQLIcon({ className }: IconProps) {
  return (
    <img
      src="/assets/icons/postgresql-icon.svg"
      alt="PostgreSQL"
      className={cn('w-4 h-4', className)}
    />
  )
}

// SQLite Icon (official feather logo)
export function SQLiteIcon({ className }: IconProps) {
  return (
    <img
      src="/assets/icons/sqlite-icon.svg"
      alt="SQLite"
      className={cn('w-4 h-4', className)}
    />
  )
}

// MariaDB Icon (sea lion)
export function MariaDBIcon({ className }: IconProps) {
  return (
    <img
      src="/assets/icons/mariadb-icon.png"
      alt="MariaDB"
      className={cn('w-4 h-4', className)}
    />
  )
}

// KingBase Icon (电科金仓/人大金仓) - Simple "K" letter icon
export function KingBaseIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn('w-4 h-4', className)}
      fill="none"
    >
      {/* Red rounded square background */}
      <rect x="2" y="2" width="20" height="20" rx="4" fill="#E53935" />
      {/* White "K" letter */}
      <path
        d="M8 6v12M8 12l6-6M8 12l6 6"
        stroke="white"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

// ClickHouse Icon (official yellow bars logo)
export function ClickHouseIcon({ className }: IconProps) {
  return (
    <img
      src="/assets/icons/clickhouse-icon.svg"
      alt="ClickHouse"
      className={cn('w-4 h-4', className)}
    />
  )
}

// Kafka Icon - Apache Kafka official logo
export function KafkaIcon({ className }: IconProps) {
  return (
    <img
      src="/assets/icons/kafka-icon.svg"
      alt="Apache Kafka"
      className={cn('w-4 h-4', className)}
    />
  )
}

// Docker Icon - Docker whale logo
export function DockerIcon({ className }: IconProps) {
  return (
    <img
      src="/assets/icons/docker-icon.svg"
      alt="Docker"
      className={cn('w-4 h-4', className)}
    />
  )
}

// Elasticsearch Icon - Official Elastic logo
export function ElasticsearchIcon({ className }: IconProps) {
  return (
    <img
      src="/assets/icons/elasticsearch-icon.svg"
      alt="Elasticsearch"
      className={cn('w-4 h-4', className)}
    />
  )
}

// Redis Icon - Redis cube logo
export function RedisIcon({ className }: IconProps) {
  return (
    <img
      src="/assets/icons/redis-icon.svg"
      alt="Redis"
      className={cn('w-4 h-4', className)}
    />
  )
}

// DM (达梦) Icon - Blue rounded square with "DM" text
export function DMIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn('w-4 h-4', className)}
      fill="none"
    >
      {/* Blue rounded square background */}
      <rect x="2" y="2" width="20" height="20" rx="4" fill="#1E88E5" />
      {/* White "DM" text */}
      <text
        x="12"
        y="15"
        textAnchor="middle"
        fill="white"
        fontSize="8"
        fontWeight="bold"
        fontFamily="Arial, sans-serif"
      >
        DM
      </text>
    </svg>
  )
}

// Generic Database Icon (fallback)
export function GenericDatabaseIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn('w-4 h-4', className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
      <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
    </svg>
  )
}

// Get database icon by type
export function getDatabaseIcon(dbType: string): React.ComponentType<IconProps> {
  const type = dbType.toLowerCase()
  switch (type) {
    case 'mysql':
      return MySQLIcon
    case 'mariadb':
      return MariaDBIcon
    case 'postgresql':
    case 'postgres':
      return PostgreSQLIcon
    case 'sqlite':
      return SQLiteIcon
    case 'kingbase':
      return KingBaseIcon
    case 'dm':
    case 'dameng':
      return DMIcon
    case 'clickhouse':
      return ClickHouseIcon
    default:
      return GenericDatabaseIcon
  }
}
