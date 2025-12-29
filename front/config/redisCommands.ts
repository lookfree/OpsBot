/**
 * Redis Commands Configuration
 *
 * Defines command categories, quick commands, and autocomplete data.
 */

// ============ Types ============

/** Command category */
export type RedisCommandCategory = 'common' | 'keys' | 'list' | 'set' | 'hash' | 'zset'

/** Quick command definition */
export interface RedisQuickCommand {
  command: string
  args: string[]
  label: string
  category: RedisCommandCategory
  description?: string
}

/** Command info for autocomplete */
export interface RedisCommandInfo {
  name: string
  syntax: string
  description: string
}

// ============ Category Definitions ============

export const REDIS_COMMAND_CATEGORIES: { key: RedisCommandCategory; labelKey: string }[] = [
  { key: 'common', labelKey: 'redis.category.common' },
  { key: 'keys', labelKey: 'redis.category.keys' },
  { key: 'list', labelKey: 'redis.category.list' },
  { key: 'set', labelKey: 'redis.category.set' },
  { key: 'hash', labelKey: 'redis.category.hash' },
  { key: 'zset', labelKey: 'redis.category.zset' },
]

// ============ Quick Commands ============

export const REDIS_QUICK_COMMANDS: RedisQuickCommand[] = [
  // Common commands
  { command: 'INFO', args: [], label: 'INFO', category: 'common', description: 'Get server info' },
  { command: 'PING', args: [], label: 'PING', category: 'common', description: 'Test connection' },
  { command: 'KEYS', args: ['*'], label: 'KEYS *', category: 'common', description: 'List all keys' },
  { command: 'DBSIZE', args: [], label: 'DBSIZE', category: 'common', description: 'Get key count' },
  { command: 'CONFIG', args: ['GET', '*'], label: 'CONFIG GET *', category: 'common', description: 'Get all configs' },
  { command: 'CLIENT', args: ['LIST'], label: 'CLIENT LIST', category: 'common', description: 'List clients' },
  { command: 'SLOWLOG', args: ['GET', '10'], label: 'SLOWLOG GET 10', category: 'common', description: 'Get slow log' },
  { command: 'SELECT', args: ['0'], label: 'SELECT 0', category: 'common', description: 'Select DB 0' },
  { command: 'MEMORY', args: ['STATS'], label: 'MEMORY STATS', category: 'common', description: 'Memory stats' },
  { command: 'LASTSAVE', args: [], label: 'LASTSAVE', category: 'common', description: 'Last save time' },

  // Key operations
  { command: 'DEL', args: ['key'], label: 'DEL', category: 'keys', description: 'Delete key' },
  { command: 'EXISTS', args: ['key'], label: 'EXISTS', category: 'keys', description: 'Check key exists' },
  { command: 'EXPIRE', args: ['key', '60'], label: 'EXPIRE', category: 'keys', description: 'Set expiration (s)' },
  { command: 'PERSIST', args: ['key'], label: 'PERSIST', category: 'keys', description: 'Remove expiration' },
  { command: 'TTL', args: ['key'], label: 'TTL', category: 'keys', description: 'Get TTL (s)' },
  { command: 'PTTL', args: ['key'], label: 'PTTL', category: 'keys', description: 'Get TTL (ms)' },
  { command: 'TYPE', args: ['key'], label: 'TYPE', category: 'keys', description: 'Get key type' },
  { command: 'RENAME', args: ['key', 'newkey'], label: 'RENAME', category: 'keys', description: 'Rename key' },
  { command: 'SCAN', args: ['0', 'MATCH', '*', 'COUNT', '100'], label: 'SCAN', category: 'keys', description: 'Scan keys' },
  { command: 'DUMP', args: ['key'], label: 'DUMP', category: 'keys', description: 'Serialize key' },

  // List operations
  { command: 'LPUSH', args: ['key', 'value'], label: 'LPUSH', category: 'list', description: 'Left push' },
  { command: 'RPUSH', args: ['key', 'value'], label: 'RPUSH', category: 'list', description: 'Right push' },
  { command: 'LPOP', args: ['key'], label: 'LPOP', category: 'list', description: 'Left pop' },
  { command: 'RPOP', args: ['key'], label: 'RPOP', category: 'list', description: 'Right pop' },
  { command: 'LRANGE', args: ['key', '0', '-1'], label: 'LRANGE', category: 'list', description: 'Get range' },
  { command: 'LLEN', args: ['key'], label: 'LLEN', category: 'list', description: 'Get length' },
  { command: 'LINDEX', args: ['key', '0'], label: 'LINDEX', category: 'list', description: 'Get by index' },
  { command: 'LSET', args: ['key', '0', 'value'], label: 'LSET', category: 'list', description: 'Set by index' },
  { command: 'LREM', args: ['key', '0', 'value'], label: 'LREM', category: 'list', description: 'Remove element' },
  { command: 'LINSERT', args: ['key', 'BEFORE', 'pivot', 'value'], label: 'LINSERT', category: 'list', description: 'Insert element' },

  // Set operations
  { command: 'SADD', args: ['key', 'member'], label: 'SADD', category: 'set', description: 'Add member' },
  { command: 'SREM', args: ['key', 'member'], label: 'SREM', category: 'set', description: 'Remove member' },
  { command: 'SMEMBERS', args: ['key'], label: 'SMEMBERS', category: 'set', description: 'Get all members' },
  { command: 'SISMEMBER', args: ['key', 'member'], label: 'SISMEMBER', category: 'set', description: 'Check member' },
  { command: 'SCARD', args: ['key'], label: 'SCARD', category: 'set', description: 'Get count' },
  { command: 'SINTER', args: ['key1', 'key2'], label: 'SINTER', category: 'set', description: 'Intersection' },
  { command: 'SUNION', args: ['key1', 'key2'], label: 'SUNION', category: 'set', description: 'Union' },
  { command: 'SDIFF', args: ['key1', 'key2'], label: 'SDIFF', category: 'set', description: 'Difference' },
  { command: 'SPOP', args: ['key'], label: 'SPOP', category: 'set', description: 'Pop random' },
  { command: 'SRANDMEMBER', args: ['key', '1'], label: 'SRANDMEMBER', category: 'set', description: 'Get random' },

  // Hash operations
  { command: 'HSET', args: ['key', 'field', 'value'], label: 'HSET', category: 'hash', description: 'Set field' },
  { command: 'HGET', args: ['key', 'field'], label: 'HGET', category: 'hash', description: 'Get field' },
  { command: 'HMSET', args: ['key', 'f1', 'v1', 'f2', 'v2'], label: 'HMSET', category: 'hash', description: 'Set multiple' },
  { command: 'HMGET', args: ['key', 'f1', 'f2'], label: 'HMGET', category: 'hash', description: 'Get multiple' },
  { command: 'HGETALL', args: ['key'], label: 'HGETALL', category: 'hash', description: 'Get all fields' },
  { command: 'HDEL', args: ['key', 'field'], label: 'HDEL', category: 'hash', description: 'Delete field' },
  { command: 'HEXISTS', args: ['key', 'field'], label: 'HEXISTS', category: 'hash', description: 'Check field' },
  { command: 'HKEYS', args: ['key'], label: 'HKEYS', category: 'hash', description: 'Get all keys' },
  { command: 'HVALS', args: ['key'], label: 'HVALS', category: 'hash', description: 'Get all values' },
  { command: 'HLEN', args: ['key'], label: 'HLEN', category: 'hash', description: 'Get field count' },

  // Sorted set operations
  { command: 'ZADD', args: ['key', '1', 'member'], label: 'ZADD', category: 'zset', description: 'Add with score' },
  { command: 'ZREM', args: ['key', 'member'], label: 'ZREM', category: 'zset', description: 'Remove member' },
  { command: 'ZRANGE', args: ['key', '0', '-1', 'WITHSCORES'], label: 'ZRANGE', category: 'zset', description: 'Get by rank asc' },
  { command: 'ZREVRANGE', args: ['key', '0', '-1', 'WITHSCORES'], label: 'ZREVRANGE', category: 'zset', description: 'Get by rank desc' },
  { command: 'ZSCORE', args: ['key', 'member'], label: 'ZSCORE', category: 'zset', description: 'Get score' },
  { command: 'ZRANK', args: ['key', 'member'], label: 'ZRANK', category: 'zset', description: 'Get rank asc' },
  { command: 'ZREVRANK', args: ['key', 'member'], label: 'ZREVRANK', category: 'zset', description: 'Get rank desc' },
  { command: 'ZCOUNT', args: ['key', '-inf', '+inf'], label: 'ZCOUNT', category: 'zset', description: 'Count in range' },
  { command: 'ZINCRBY', args: ['key', '1', 'member'], label: 'ZINCRBY', category: 'zset', description: 'Increment score' },
  { command: 'ZCARD', args: ['key'], label: 'ZCARD', category: 'zset', description: 'Get count' },
]

// ============ Command List for Autocomplete ============

export const REDIS_COMMANDS: RedisCommandInfo[] = [
  // String commands
  { name: 'GET', syntax: 'GET key', description: 'Get value' },
  { name: 'SET', syntax: 'SET key value [EX s] [PX ms] [NX|XX]', description: 'Set value' },
  { name: 'GETEX', syntax: 'GETEX key [EX|PX|EXAT|PXAT time] [PERSIST]', description: 'Get and set expiry' },
  { name: 'GETDEL', syntax: 'GETDEL key', description: 'Get and delete' },
  { name: 'GETRANGE', syntax: 'GETRANGE key start end', description: 'Get substring' },
  { name: 'SETEX', syntax: 'SETEX key seconds value', description: 'Set with expiry' },
  { name: 'SETNX', syntax: 'SETNX key value', description: 'Set if not exists' },
  { name: 'MGET', syntax: 'MGET key [key ...]', description: 'Get multiple' },
  { name: 'MSET', syntax: 'MSET key value [key value ...]', description: 'Set multiple' },
  { name: 'INCR', syntax: 'INCR key', description: 'Increment by 1' },
  { name: 'DECR', syntax: 'DECR key', description: 'Decrement by 1' },
  { name: 'INCRBY', syntax: 'INCRBY key increment', description: 'Increment by value' },
  { name: 'DECRBY', syntax: 'DECRBY key decrement', description: 'Decrement by value' },
  { name: 'APPEND', syntax: 'APPEND key value', description: 'Append string' },
  { name: 'STRLEN', syntax: 'STRLEN key', description: 'Get string length' },

  // Key commands
  { name: 'DEL', syntax: 'DEL key [key ...]', description: 'Delete keys' },
  { name: 'EXISTS', syntax: 'EXISTS key [key ...]', description: 'Check existence' },
  { name: 'EXPIRE', syntax: 'EXPIRE key seconds', description: 'Set expiration' },
  { name: 'EXPIREAT', syntax: 'EXPIREAT key timestamp', description: 'Set expiration time' },
  { name: 'PERSIST', syntax: 'PERSIST key', description: 'Remove expiration' },
  { name: 'TTL', syntax: 'TTL key', description: 'Get TTL in seconds' },
  { name: 'PTTL', syntax: 'PTTL key', description: 'Get TTL in ms' },
  { name: 'TYPE', syntax: 'TYPE key', description: 'Get key type' },
  { name: 'RENAME', syntax: 'RENAME key newkey', description: 'Rename key' },
  { name: 'RENAMENX', syntax: 'RENAMENX key newkey', description: 'Rename if new not exists' },
  { name: 'KEYS', syntax: 'KEYS pattern', description: 'Find keys by pattern' },
  { name: 'SCAN', syntax: 'SCAN cursor [MATCH pattern] [COUNT count]', description: 'Scan keys' },
  { name: 'DUMP', syntax: 'DUMP key', description: 'Serialize key' },
  { name: 'RESTORE', syntax: 'RESTORE key ttl value', description: 'Deserialize key' },
  { name: 'OBJECT', syntax: 'OBJECT ENCODING key', description: 'Get encoding' },

  // List commands
  { name: 'LPUSH', syntax: 'LPUSH key element [element ...]', description: 'Prepend elements' },
  { name: 'RPUSH', syntax: 'RPUSH key element [element ...]', description: 'Append elements' },
  { name: 'LPOP', syntax: 'LPOP key [count]', description: 'Remove first elements' },
  { name: 'RPOP', syntax: 'RPOP key [count]', description: 'Remove last elements' },
  { name: 'LRANGE', syntax: 'LRANGE key start stop', description: 'Get range' },
  { name: 'LLEN', syntax: 'LLEN key', description: 'Get length' },
  { name: 'LINDEX', syntax: 'LINDEX key index', description: 'Get by index' },
  { name: 'LSET', syntax: 'LSET key index element', description: 'Set by index' },
  { name: 'LREM', syntax: 'LREM key count element', description: 'Remove elements' },
  { name: 'LINSERT', syntax: 'LINSERT key BEFORE|AFTER pivot element', description: 'Insert element' },
  { name: 'LTRIM', syntax: 'LTRIM key start stop', description: 'Trim list' },

  // Set commands
  { name: 'SADD', syntax: 'SADD key member [member ...]', description: 'Add members' },
  { name: 'SREM', syntax: 'SREM key member [member ...]', description: 'Remove members' },
  { name: 'SMEMBERS', syntax: 'SMEMBERS key', description: 'Get all members' },
  { name: 'SISMEMBER', syntax: 'SISMEMBER key member', description: 'Check membership' },
  { name: 'SCARD', syntax: 'SCARD key', description: 'Get set size' },
  { name: 'SINTER', syntax: 'SINTER key [key ...]', description: 'Intersect sets' },
  { name: 'SUNION', syntax: 'SUNION key [key ...]', description: 'Union sets' },
  { name: 'SDIFF', syntax: 'SDIFF key [key ...]', description: 'Difference sets' },
  { name: 'SPOP', syntax: 'SPOP key [count]', description: 'Pop random members' },
  { name: 'SRANDMEMBER', syntax: 'SRANDMEMBER key [count]', description: 'Get random members' },

  // Hash commands
  { name: 'HSET', syntax: 'HSET key field value [field value ...]', description: 'Set fields' },
  { name: 'HGET', syntax: 'HGET key field', description: 'Get field value' },
  { name: 'HMSET', syntax: 'HMSET key field value [field value ...]', description: 'Set multiple fields' },
  { name: 'HMGET', syntax: 'HMGET key field [field ...]', description: 'Get multiple fields' },
  { name: 'HGETALL', syntax: 'HGETALL key', description: 'Get all fields and values' },
  { name: 'HDEL', syntax: 'HDEL key field [field ...]', description: 'Delete fields' },
  { name: 'HEXISTS', syntax: 'HEXISTS key field', description: 'Check field exists' },
  { name: 'HKEYS', syntax: 'HKEYS key', description: 'Get all field names' },
  { name: 'HVALS', syntax: 'HVALS key', description: 'Get all values' },
  { name: 'HLEN', syntax: 'HLEN key', description: 'Get field count' },
  { name: 'HINCRBY', syntax: 'HINCRBY key field increment', description: 'Increment field' },
  { name: 'HSCAN', syntax: 'HSCAN key cursor [MATCH pattern] [COUNT count]', description: 'Scan fields' },

  // Sorted set commands
  { name: 'ZADD', syntax: 'ZADD key score member [score member ...]', description: 'Add members' },
  { name: 'ZREM', syntax: 'ZREM key member [member ...]', description: 'Remove members' },
  { name: 'ZRANGE', syntax: 'ZRANGE key start stop [WITHSCORES]', description: 'Get range by rank' },
  { name: 'ZREVRANGE', syntax: 'ZREVRANGE key start stop [WITHSCORES]', description: 'Get range by rank desc' },
  { name: 'ZRANGEBYSCORE', syntax: 'ZRANGEBYSCORE key min max [WITHSCORES]', description: 'Get range by score' },
  { name: 'ZSCORE', syntax: 'ZSCORE key member', description: 'Get member score' },
  { name: 'ZRANK', syntax: 'ZRANK key member', description: 'Get member rank' },
  { name: 'ZREVRANK', syntax: 'ZREVRANK key member', description: 'Get member rank desc' },
  { name: 'ZCOUNT', syntax: 'ZCOUNT key min max', description: 'Count in score range' },
  { name: 'ZINCRBY', syntax: 'ZINCRBY key increment member', description: 'Increment score' },
  { name: 'ZCARD', syntax: 'ZCARD key', description: 'Get member count' },
  { name: 'ZSCAN', syntax: 'ZSCAN key cursor [MATCH pattern] [COUNT count]', description: 'Scan members' },

  // Server commands
  { name: 'PING', syntax: 'PING [message]', description: 'Test connection' },
  { name: 'INFO', syntax: 'INFO [section]', description: 'Get server info' },
  { name: 'DBSIZE', syntax: 'DBSIZE', description: 'Get key count' },
  { name: 'SELECT', syntax: 'SELECT index', description: 'Select database' },
  { name: 'FLUSHDB', syntax: 'FLUSHDB [ASYNC]', description: 'Clear current database' },
  { name: 'FLUSHALL', syntax: 'FLUSHALL [ASYNC]', description: 'Clear all databases' },
  { name: 'CONFIG', syntax: 'CONFIG GET|SET parameter [value]', description: 'Get/set config' },
  { name: 'CLIENT', syntax: 'CLIENT LIST|KILL|SETNAME ...', description: 'Client commands' },
  { name: 'SLOWLOG', syntax: 'SLOWLOG GET [count]', description: 'Get slow log' },
  { name: 'MEMORY', syntax: 'MEMORY STATS|USAGE key', description: 'Memory info' },
  { name: 'DEBUG', syntax: 'DEBUG OBJECT key', description: 'Debug info' },
  { name: 'LASTSAVE', syntax: 'LASTSAVE', description: 'Last save timestamp' },
  { name: 'BGSAVE', syntax: 'BGSAVE', description: 'Background save' },
  { name: 'TIME', syntax: 'TIME', description: 'Server time' },
]

// ============ Helper Functions ============

/**
 * Get quick commands by category
 */
export function getQuickCommandsByCategory(category: RedisCommandCategory): RedisQuickCommand[] {
  return REDIS_QUICK_COMMANDS.filter(cmd => cmd.category === category)
}

/**
 * Match commands for autocomplete
 */
export function matchCommands(input: string): RedisCommandInfo[] {
  const upperInput = input.toUpperCase().trim()
  if (!upperInput) return []
  return REDIS_COMMANDS.filter(cmd => cmd.name.startsWith(upperInput)).slice(0, 10)
}

/**
 * Get command info by name
 */
export function getCommandInfo(name: string): RedisCommandInfo | undefined {
  return REDIS_COMMANDS.find(cmd => cmd.name === name.toUpperCase())
}

/**
 * Format command with args for display
 */
export function formatCommandString(command: string, args: string[]): string {
  if (args.length === 0) return command
  return `${command} ${args.join(' ')}`
}
