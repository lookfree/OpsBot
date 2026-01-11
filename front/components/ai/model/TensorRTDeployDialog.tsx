/**
 * TensorRT Deploy Dialog
 *
 * Dialog for deploying a new TensorRT-LLM model.
 */

import { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { X, Rocket, Loader2, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAiStyles } from '../hooks'
import { useAiStore } from '@/stores'
import type { TensorRTModelConfig } from '@/types/ai'

interface TensorRTDeployDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function TensorRTDeployDialog({
  open,
  onOpenChange,
}: TensorRTDeployDialogProps) {
  const { t } = useTranslation()
  const styles = useAiStyles()

  const { tensorrtConnectionId, deployTensorrtModel } = useAiStore()

  const [isDeploying, setIsDeploying] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Form state
  const [name, setName] = useState('')
  const [modelPath, setModelPath] = useState('')
  const [maxBatchSize, setMaxBatchSize] = useState('8')
  const [maxInputLen, setMaxInputLen] = useState('2048')
  const [maxOutputLen, setMaxOutputLen] = useState('2048')
  const [quantization, setQuantization] = useState('fp16')
  const [tensorParallelSize, setTensorParallelSize] = useState('1')

  const resetForm = useCallback(() => {
    setName('')
    setModelPath('')
    setMaxBatchSize('8')
    setMaxInputLen('2048')
    setMaxOutputLen('2048')
    setQuantization('fp16')
    setTensorParallelSize('1')
    setError(null)
  }, [])

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      setError(null)

      if (!tensorrtConnectionId) {
        setError(t('ai.tensorrt.notConnected'))
        return
      }

      if (!name.trim()) {
        setError(t('ai.tensorrt.nameRequired'))
        return
      }

      if (!modelPath.trim()) {
        setError(t('ai.tensorrt.modelPathRequired'))
        return
      }

      const config: TensorRTModelConfig = {
        name: name.trim(),
        modelPath: modelPath.trim(),
        maxBatchSize: parseInt(maxBatchSize, 10) || 8,
        maxInputLen: parseInt(maxInputLen, 10) || 2048,
        maxOutputLen: parseInt(maxOutputLen, 10) || 2048,
        quantization: quantization || undefined,
        tensorParallelSize: parseInt(tensorParallelSize, 10) || 1,
      }

      setIsDeploying(true)
      try {
        await deployTensorrtModel(tensorrtConnectionId, config)
        resetForm()
        onOpenChange(false)
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setIsDeploying(false)
      }
    },
    [
      tensorrtConnectionId,
      name,
      modelPath,
      maxBatchSize,
      maxInputLen,
      maxOutputLen,
      quantization,
      tensorParallelSize,
      deployTensorrtModel,
      resetForm,
      onOpenChange,
      t,
    ]
  )

  const handleClose = useCallback(() => {
    if (!isDeploying) {
      onOpenChange(false)
      resetForm()
    }
  }, [isDeploying, onOpenChange, resetForm])

  if (!open) return null

  const inputClasses = cn(
    'w-full px-3 py-2 rounded border text-sm',
    styles.inputBg,
    styles.borderColor,
    styles.textPrimary
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={handleClose}
      />

      {/* Dialog */}
      <div className={cn(
        'relative w-full max-w-lg rounded-lg shadow-xl border max-h-[90vh] overflow-y-auto',
        styles.bgPrimary,
        styles.borderColor
      )}>
        {/* Header */}
        <div className={cn(
          'flex items-center justify-between px-4 py-3 border-b sticky top-0',
          styles.bgPrimary,
          styles.borderColor
        )}>
          <h2 className={cn('text-lg font-medium', styles.textPrimary)}>
            {t('ai.tensorrt.deploy.title')}
          </h2>
          <button
            onClick={handleClose}
            disabled={isDeploying}
            className={cn('p-1 rounded', styles.hoverBg, styles.textSecondary)}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* SSH Required Notice */}
          <div className="flex items-start gap-2 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>{t('ai.tensorrt.deploy.sshRequired')}</span>
          </div>

          {/* Model Name */}
          <div>
            <label className={cn('block text-sm font-medium mb-1', styles.textPrimary)}>
              {t('ai.tensorrt.deploy.modelName')} *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="llama-7b"
              className={inputClasses}
              disabled={isDeploying}
            />
          </div>

          {/* Model Path */}
          <div>
            <label className={cn('block text-sm font-medium mb-1', styles.textPrimary)}>
              {t('ai.tensorrt.deploy.modelPath')} *
            </label>
            <input
              type="text"
              value={modelPath}
              onChange={(e) => setModelPath(e.target.value)}
              placeholder="meta-llama/Llama-2-7b-hf"
              className={inputClasses}
              disabled={isDeploying}
            />
            <p className={cn('text-xs mt-1', styles.textSecondary)}>
              {t('ai.tensorrt.deploy.modelPathHint')}
            </p>
          </div>

          {/* Batch Size & Input/Output Length */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={cn('block text-sm font-medium mb-1', styles.textPrimary)}>
                {t('ai.tensorrt.deploy.batchSize')}
              </label>
              <input
                type="number"
                value={maxBatchSize}
                onChange={(e) => setMaxBatchSize(e.target.value)}
                className={inputClasses}
                disabled={isDeploying}
                min="1"
                max="256"
              />
            </div>
            <div>
              <label className={cn('block text-sm font-medium mb-1', styles.textPrimary)}>
                {t('ai.tensorrt.deploy.maxInputLen')}
              </label>
              <input
                type="number"
                value={maxInputLen}
                onChange={(e) => setMaxInputLen(e.target.value)}
                className={inputClasses}
                disabled={isDeploying}
                min="128"
              />
            </div>
            <div>
              <label className={cn('block text-sm font-medium mb-1', styles.textPrimary)}>
                {t('ai.tensorrt.deploy.maxOutputLen')}
              </label>
              <input
                type="number"
                value={maxOutputLen}
                onChange={(e) => setMaxOutputLen(e.target.value)}
                className={inputClasses}
                disabled={isDeploying}
                min="128"
              />
            </div>
          </div>

          {/* Quantization */}
          <div>
            <label className={cn('block text-sm font-medium mb-1', styles.textPrimary)}>
              {t('ai.tensorrt.deploy.quantization')}
            </label>
            <select
              value={quantization}
              onChange={(e) => setQuantization(e.target.value)}
              className={inputClasses}
              disabled={isDeploying}
            >
              <option value="fp16">FP16</option>
              <option value="int8">INT8</option>
              <option value="int4">INT4</option>
              <option value="">None (FP32)</option>
            </select>
          </div>

          {/* Tensor Parallel Size */}
          <div>
            <label className={cn('block text-sm font-medium mb-1', styles.textPrimary)}>
              {t('ai.tensorrt.deploy.tensorParallel')}
            </label>
            <input
              type="number"
              value={tensorParallelSize}
              onChange={(e) => setTensorParallelSize(e.target.value)}
              className={inputClasses}
              disabled={isDeploying}
              min="1"
              max="8"
            />
            <p className={cn('text-xs mt-1', styles.textSecondary)}>
              {t('ai.tensorrt.deploy.tensorParallelHint')}
            </p>
          </div>

          {/* Error */}
          {error && (
            <div className="p-3 rounded bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={handleClose}
              disabled={isDeploying}
              className={cn(
                'px-4 py-2 text-sm rounded transition-colors',
                styles.hoverBg,
                styles.textSecondary
              )}
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={isDeploying}
              className="flex items-center gap-1 px-4 py-2 text-sm rounded transition-colors bg-green-600 hover:bg-green-700 text-white disabled:opacity-50"
            >
              {isDeploying ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{t('ai.tensorrt.deploying')}</span>
                </>
              ) : (
                <>
                  <Rocket className="w-4 h-4" />
                  <span>{t('ai.tensorrt.deployModel')}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
