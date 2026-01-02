/**
 * 中间件类型配置
 *
 * 定义支持的中间件类型、图标、默认端口等信息
 */

export interface MiddlewareTypeConfig {
  id: string
  name: string
  icon: string
  defaultPort: number
  enabled: boolean
  category: 'mq' | 'cache' | 'search'
  description?: string
}

// 中间件类型配置列表
export const MIDDLEWARE_TYPES: MiddlewareTypeConfig[] = [
  // 消息队列
  {
    id: 'kafka',
    name: 'Apache Kafka',
    icon: '/assets/icons/kafka-icon.svg',
    defaultPort: 9092,
    enabled: true,
    category: 'mq',
    description: 'Distributed event streaming platform',
  },
  {
    id: 'rocketmq',
    name: 'RocketMQ',
    icon: '/assets/icons/rocketmq-icon.svg',
    defaultPort: 9876,
    enabled: false,
    category: 'mq',
    description: 'Distributed messaging and streaming platform',
  },
  {
    id: 'rabbitmq',
    name: 'RabbitMQ',
    icon: '/assets/icons/rabbitmq-icon.svg',
    defaultPort: 5672,
    enabled: false,
    category: 'mq',
    description: 'Open source message broker',
  },
  // 缓存
  {
    id: 'redis',
    name: 'Redis',
    icon: '/assets/icons/redis-icon.svg',
    defaultPort: 6379,
    enabled: true,
    category: 'cache',
    description: 'In-memory data structure store',
  },
  // 搜索引擎
  {
    id: 'elasticsearch',
    name: 'Elasticsearch',
    icon: '/assets/icons/elasticsearch-icon.svg',
    defaultPort: 9200,
    enabled: true,
    category: 'search',
    description: 'Distributed search and analytics engine',
  },
]

// 按分类获取中间件类型
export function getMiddlewareTypesByCategory(category: MiddlewareTypeConfig['category']) {
  return MIDDLEWARE_TYPES.filter(mw => mw.category === category)
}

// 根据 ID 获取中间件类型配置
export function getMiddlewareTypeById(id: string): MiddlewareTypeConfig | undefined {
  return MIDDLEWARE_TYPES.find(mw => mw.id === id)
}

// 获取所有启用的中间件类型
export function getEnabledMiddlewareTypes() {
  return MIDDLEWARE_TYPES.filter(mw => mw.enabled)
}
