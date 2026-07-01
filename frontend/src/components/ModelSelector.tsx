import { CheckCircle2, Circle, Download, HardDrive, Loader2, Trash2, Zap } from 'lucide-react'
import clsx from 'clsx'
import { formatMb } from '@/lib/format'
import type { ModelDownloadStatus, ModelWithStatus } from '@/types'

interface ModelSelectorProps {
  models: ModelWithStatus[]
  selectedModelId: string
  onSelect: (modelId: string) => void
  onDownload: (modelId: string) => void
  onDelete?: (modelId: string) => void
  downloadStatus: ModelDownloadStatus | null
  compact?: boolean
}

export function ModelSelector({
  models,
  selectedModelId,
  onSelect,
  onDownload,
  onDelete,
  downloadStatus,
  compact = false
}: ModelSelectorProps) {
  const downloadingId =
    downloadStatus?.status === 'downloading' ? downloadStatus.model_id : null

  return (
    <div className={clsx('space-y-2', compact ? 'max-h-80 overflow-y-auto pr-1' : '')}>
      {models.map((model) => {
        const isSelected = selectedModelId === model.id
        const isDownloading = downloadingId === model.id

        return (
          <div
            key={model.id}
            onClick={() => onSelect(model.id)}
            className={clsx(
              'cursor-pointer rounded-xl border p-4 transition-colors',
              isSelected
                ? 'border-accent bg-accent-muted/30'
                : 'border-surface-border bg-surface-raised hover:border-surface-border/80 hover:bg-surface-overlay'
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  {isSelected ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-accent" />
                  ) : (
                    <Circle className="h-4 w-4 shrink-0 text-slate-600" />
                  )}
                  <h3 className="font-semibold text-slate-100">{model.name}</h3>
                  {model.is_active && (
                    <span className="rounded bg-status-running/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-status-running">
                      Active
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm text-slate-400">{model.description}</p>
                <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-500">
                  <span className="flex items-center gap-1">
                    <HardDrive className="h-3 w-3" />
                    {model.downloaded && model.local_size_mb
                      ? formatMb(model.local_size_mb)
                      : `~${formatMb(model.size_mb)}`}
                  </span>
                  <span className="flex items-center gap-1">
                    <Zap className="h-3 w-3" />
                    {model.speed}
                  </span>
                  <span>Accuracy: {model.accuracy}</span>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                {model.downloaded ? (
                  <>
                    <span className="rounded-full bg-status-running/20 px-2 py-1 text-[10px] font-semibold uppercase text-status-running">
                      Ready
                    </span>
                    {onDelete && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          onDelete(model.id)
                        }}
                        disabled={isDownloading}
                        className="flex items-center gap-1 rounded-lg border border-status-failed/30 bg-status-failed/10 px-2 py-1 text-[10px] font-medium text-status-failed hover:bg-status-failed/20 disabled:opacity-50"
                        title="Delete model to free disk space"
                      >
                        <Trash2 className="h-3 w-3" />
                        Delete
                      </button>
                    )}
                  </>
                ) : isDownloading ? (
                  <span className="flex items-center gap-1 rounded-full bg-accent-muted/40 px-2 py-1 text-[10px] font-semibold uppercase text-accent">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Downloading
                  </span>
                ) : (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onDownload(model.id)
                    }}
                    className="flex items-center gap-1 rounded-lg border border-surface-border bg-surface-overlay px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:bg-surface-border"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Download
                  </button>
                )}
              </div>
            </div>

            {isDownloading && downloadStatus && (
              <div className="mt-3">
                <div className="mb-1 flex justify-between text-xs text-slate-500">
                  <span>{downloadStatus.message}</span>
                  <span>{downloadStatus.progress_percent.toFixed(0)}%</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-surface-overlay">
                  <div
                    className="h-full rounded-full bg-accent transition-all duration-300"
                    style={{ width: `${downloadStatus.progress_percent}%` }}
                  />
                </div>
              </div>
            )}

            {downloadStatus?.status === 'error' &&
              downloadStatus.model_id === model.id &&
              downloadStatus.error && (
                <p className="mt-2 text-xs text-status-failed">{downloadStatus.error}</p>
              )}
          </div>
        )
      })}
    </div>
  )
}