/**
 * Message Viewer Component
 *
 * Displays Kafka messages from a topic with fetch and produce capabilities.
 */

import { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { RefreshCw, Send, X, Key, FileText } from 'lucide-react'
import {
  mwKafkaFetchMessages,
  mwKafkaProduceMessage,
  type KafkaMessage,
} from '@/services/middleware'

interface ThemeStyles {
  bgSecondary: string
  borderColor: string
  textPrimary: string
  textSecondary: string
  hoverBg: string
  isDark: boolean
}

interface MessageViewerProps {
  connectionId: string
  topicName: string
  onClose: () => void
  styles: ThemeStyles
}

export function MessageViewer({ connectionId, topicName, onClose, styles }: MessageViewerProps) {
  const { t } = useTranslation()
  const [messages, setMessages] = useState<KafkaMessage[]>([])
  const [loading, setLoading] = useState(false)
  const [partition, setPartition] = useState(0)
  const [offset, setOffset] = useState(0)
  const [limit, setLimit] = useState(100)
  const [selectedMessage, setSelectedMessage] = useState<KafkaMessage | null>(null)

  // Producer state
  const [produceKey, setProduceKey] = useState('')
  const [produceValue, setProduceValue] = useState('')
  const [producePartition, setProducePartition] = useState<number | undefined>(undefined)
  const [producing, setProducing] = useState(false)
  const [produceResult, setProduceResult] = useState<string | null>(null)

  // Fetch messages
  const handleFetch = useCallback(async () => {
    setLoading(true)
    try {
      const result = await mwKafkaFetchMessages({
        connectionId,
        topic: topicName,
        partition,
        offset,
        limit,
      })
      setMessages(result)
      if (result.length > 0) {
        setSelectedMessage(result[0])
      }
    } catch (err) {
      console.error('Failed to fetch messages:', err)
    } finally {
      setLoading(false)
    }
  }, [connectionId, topicName, partition, offset, limit])

  // Produce message
  const handleProduce = useCallback(async () => {
    if (!produceValue.trim()) return

    setProducing(true)
    setProduceResult(null)
    try {
      const result = await mwKafkaProduceMessage({
        connectionId,
        topic: topicName,
        partition: producePartition,
        key: produceKey || undefined,
        value: produceValue,
      })
      setProduceResult(t('kafka.messageProduced', { partition: result.partition, offset: result.offset }))
      setProduceKey('')
      setProduceValue('')
    } catch (err) {
      setProduceResult(String(err))
    } finally {
      setProducing(false)
    }
  }, [connectionId, topicName, producePartition, produceKey, produceValue, t])

  // Format timestamp
  const formatTimestamp = (ts?: number) => {
    if (!ts) return '-'
    return new Date(ts).toLocaleString()
  }

  // Try to format JSON
  const formatValue = (value?: string) => {
    if (!value) return ''
    try {
      return JSON.stringify(JSON.parse(value), null, 2)
    } catch {
      return value
    }
  }

  // Badge shown when a key/value was not valid UTF-8 and is base64-encoded.
  const BinaryBadge = () => (
    <span
      title={t('kafka.binaryHint', 'Not valid UTF-8; shown base64-encoded')}
      className="px-1 rounded text-[10px] font-mono bg-accent-primary/20 text-accent-primary"
    >
      BASE64
    </span>
  )

  const inputStyles = cn(
    'px-3 py-1.5 rounded text-sm',
    'border bg-transparent',
    styles.borderColor,
    'focus:outline-none focus:border-accent-primary'
  )

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className={cn('flex items-center gap-4 p-3 border-b', styles.borderColor, styles.bgSecondary)}>
        <button onClick={onClose} className={cn('p-1 rounded', styles.hoverBg)}>
          <X className="w-4 h-4" />
        </button>
        <h3 className="font-medium">{topicName}</h3>
        <div className="flex-1" />

        {/* Fetch Controls */}
        <div className="flex items-center gap-2">
          <label className={cn('text-sm', styles.textSecondary)}>{t('kafka.partition')}:</label>
          <input
            type="number"
            value={partition}
            onChange={(e) => setPartition(parseInt(e.target.value) || 0)}
            min={0}
            className={cn(inputStyles, 'w-20')}
          />
          <label className={cn('text-sm', styles.textSecondary)}>{t('kafka.offset')}:</label>
          <input
            type="number"
            value={offset}
            onChange={(e) => setOffset(parseInt(e.target.value) || 0)}
            min={0}
            className={cn(inputStyles, 'w-24')}
          />
          <label className={cn('text-sm', styles.textSecondary)}>{t('kafka.limit')}:</label>
          <input
            type="number"
            value={limit}
            onChange={(e) => setLimit(Math.min(1000, Math.max(1, parseInt(e.target.value) || 100)))}
            min={1}
            max={1000}
            className={cn(inputStyles, 'w-20')}
          />
          <button
            onClick={handleFetch}
            disabled={loading}
            className="px-3 py-1.5 rounded text-sm bg-accent-primary text-white hover:bg-accent-hover disabled:opacity-50 flex items-center gap-2"
          >
            <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
            {t('kafka.fetch')}
          </button>
        </div>
      </div>

      {/* Main Content */}
      <PanelGroup direction="vertical" className="flex-1">
        {/* Messages Panel */}
        <Panel defaultSize={60} minSize={30}>
          <PanelGroup direction="horizontal" className="h-full">
            {/* Message List */}
            <Panel defaultSize={40} minSize={20}>
              <div className={cn('h-full flex flex-col border-r', styles.borderColor)}>
                <div className={cn('px-4 py-2 border-b text-sm font-medium', styles.borderColor, styles.bgSecondary)}>
                  {t('kafka.messages')} ({messages.length})
                </div>
                <div className="flex-1 overflow-auto">
                  {messages.map((msg) => (
                    <div
                      key={`${msg.partition}-${msg.offset}`}
                      onClick={() => setSelectedMessage(msg)}
                      className={cn(
                        'px-4 py-2 border-b cursor-pointer',
                        styles.borderColor,
                        styles.hoverBg,
                        selectedMessage === msg && (styles.isDark ? 'bg-dark-bg-hover' : 'bg-light-bg-hover')
                      )}
                    >
                      <div className="flex items-center gap-2 text-xs mb-1">
                        <span className="font-mono text-accent-primary">
                          P{msg.partition}:O{msg.offset}
                        </span>
                        <span className={styles.textSecondary}>
                          {formatTimestamp(msg.timestamp)}
                        </span>
                      </div>
                      {msg.key && (
                        <div className="flex items-center gap-1 text-xs mb-1">
                          <Key className="w-3 h-3" />
                          <span className="font-mono truncate">{msg.key}</span>
                          {msg.keyBinary && <BinaryBadge />}
                        </div>
                      )}
                      <div className={cn('text-sm truncate', styles.textSecondary)}>
                        {msg.value?.substring(0, 100) || t('kafka.emptyValue')}
                      </div>
                    </div>
                  ))}
                  {messages.length === 0 && (
                    <div className={cn('flex items-center justify-center py-12', styles.textSecondary)}>
                      {loading ? t('common.loading') : t('kafka.noMessages')}
                    </div>
                  )}
                </div>
              </div>
            </Panel>

            {/* Message Detail */}
            <Panel defaultSize={60} minSize={30}>
              <div className="h-full flex flex-col">
                <div className={cn('px-4 py-2 border-b text-sm font-medium', styles.borderColor, styles.bgSecondary)}>
                  {t('kafka.messageDetail')}
                </div>
                {selectedMessage ? (
                  <div className="flex-1 overflow-auto p-4">
                    {/* Metadata */}
                    <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
                      <div>
                        <span className={styles.textSecondary}>{t('kafka.partition')}: </span>
                        <span className="font-mono">{selectedMessage.partition}</span>
                      </div>
                      <div>
                        <span className={styles.textSecondary}>{t('kafka.offset')}: </span>
                        <span className="font-mono">{selectedMessage.offset}</span>
                      </div>
                      <div>
                        <span className={styles.textSecondary}>{t('kafka.timestamp')}: </span>
                        <span>{formatTimestamp(selectedMessage.timestamp)}</span>
                      </div>
                      <div>
                        <span className={styles.textSecondary}>{t('kafka.headers')}: </span>
                        <span>{selectedMessage.headers.length}</span>
                      </div>
                    </div>

                    {/* Key */}
                    {selectedMessage.key && (
                      <div className="mb-4">
                        <div className={cn('flex items-center gap-2 text-sm font-medium mb-2', styles.textSecondary)}>
                          <Key className="w-4 h-4" />
                          {t('kafka.key')}
                          {selectedMessage.keyBinary && <BinaryBadge />}
                        </div>
                        <pre className={cn('p-3 rounded text-sm font-mono overflow-auto', styles.bgSecondary)}>
                          {selectedMessage.key}
                        </pre>
                      </div>
                    )}

                    {/* Value */}
                    <div className="mb-4">
                      <div className={cn('flex items-center gap-2 text-sm font-medium mb-2', styles.textSecondary)}>
                        <FileText className="w-4 h-4" />
                        {t('kafka.value')}
                        {selectedMessage.valueBinary && <BinaryBadge />}
                      </div>
                      <pre className={cn('p-3 rounded text-sm font-mono overflow-auto max-h-64', styles.bgSecondary)}>
                        {selectedMessage.valueBinary
                          ? selectedMessage.value
                          : formatValue(selectedMessage.value) || t('kafka.emptyValue')}
                      </pre>
                    </div>

                    {/* Headers */}
                    {selectedMessage.headers.length > 0 && (
                      <div>
                        <div className={cn('text-sm font-medium mb-2', styles.textSecondary)}>
                          {t('kafka.headers')}
                        </div>
                        <div className={cn('rounded border', styles.borderColor)}>
                          {selectedMessage.headers.map((h, i) => (
                            <div key={i} className={cn('px-3 py-2 border-b flex', styles.borderColor)}>
                              <span className="font-mono w-1/3">{h.key}</span>
                              <span className="font-mono flex-1">{h.value}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className={cn('flex items-center justify-center h-full', styles.textSecondary)}>
                    {t('kafka.selectMessage')}
                  </div>
                )}
              </div>
            </Panel>
          </PanelGroup>
        </Panel>

        {/* Resize Handle */}
        <PanelResizeHandle className={cn('h-1.5 flex items-center justify-center border-y', styles.borderColor, 'hover:bg-accent-primary/50')}>
          <div className="w-8 h-0.5 rounded bg-dark-text-secondary" />
        </PanelResizeHandle>

        {/* Producer Panel */}
        <Panel defaultSize={40} minSize={20}>
          <div className="h-full flex flex-col">
            <div className={cn('px-4 py-2 border-b text-sm font-medium flex items-center gap-2', styles.borderColor, styles.bgSecondary)}>
              <Send className="w-4 h-4" />
              {t('kafka.produceMessage')}
            </div>
            <div className="flex-1 p-4 overflow-auto">
              {/* Producer Controls */}
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className={cn('block text-sm mb-1', styles.textSecondary)}>{t('kafka.partition')} ({t('kafka.optional')})</label>
                  <input
                    type="number"
                    value={producePartition ?? ''}
                    onChange={(e) => setProducePartition(e.target.value ? parseInt(e.target.value) : undefined)}
                    placeholder={t('kafka.autoAssign')}
                    min={0}
                    className={cn(inputStyles, 'w-full')}
                  />
                </div>
                <div>
                  <label className={cn('block text-sm mb-1', styles.textSecondary)}>{t('kafka.key')} ({t('kafka.optional')})</label>
                  <input
                    type="text"
                    value={produceKey}
                    onChange={(e) => setProduceKey(e.target.value)}
                    placeholder={t('kafka.messageKey')}
                    className={cn(inputStyles, 'w-full')}
                  />
                </div>
              </div>

              {/* Message Value */}
              <div className="mb-4">
                <label className={cn('block text-sm mb-1', styles.textSecondary)}>{t('kafka.value')}</label>
                <textarea
                  value={produceValue}
                  onChange={(e) => setProduceValue(e.target.value)}
                  placeholder={t('kafka.messageValue')}
                  rows={5}
                  className={cn(inputStyles, 'w-full font-mono resize-none')}
                />
              </div>

              {/* Produce Button & Result */}
              <div className="flex items-center gap-4">
                <button
                  onClick={handleProduce}
                  disabled={producing || !produceValue.trim()}
                  className="px-4 py-2 rounded text-sm bg-accent-primary text-white hover:bg-accent-hover disabled:opacity-50 flex items-center gap-2"
                >
                  <Send className="w-4 h-4" />
                  {producing ? t('kafka.sending') : t('kafka.send')}
                </button>
                {produceResult && (
                  <span className={cn('text-sm', produceResult.includes('error') ? 'text-status-error' : 'text-status-success')}>
                    {produceResult}
                  </span>
                )}
              </div>
            </div>
          </div>
        </Panel>
      </PanelGroup>
    </div>
  )
}
