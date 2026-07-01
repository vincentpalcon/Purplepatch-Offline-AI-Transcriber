import { Download, HardDrive, Loader2, Trash2, Users } from 'lucide-react'
import clsx from 'clsx'
import { formatMb } from '@/lib/format'
import type { DiarizationDownloadStatus, DiarizationStatus } from '@/types'

interface DiarizationModelCardProps {
  status: DiarizationStatus | null
  downloadStatus: DiarizationDownloadStatus | null
  huggingfaceToken: string
  onTokenChange: (token: string) => void
  onDownload: () => void
  onDelete: () => void
}

export function DiarizationModelCard({
  status,
  downloadStatus,
  huggingfaceToken,
  onTokenChange,
  onDownload,
  onDelete
}: DiarizationModelCardProps) {
  const isDownloading = downloadStatus?.status === 'downloading'
  const downloaded = status?.downloaded ?? false
  const estimatedMb = status?.estimated_size_mb ?? 1200
  const localMb = status?.local_size_mb ?? downloadStatus?.local_size_mb

  return (
    <div className="rounded-xl border border-surface-border bg-surface-raised p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 shrink-0 text-accent" />
            <h3 className="font-semibold text-slate-100">Speaker Diarization</h3>
          </div>
          <p className="mt-1 text-sm text-slate-400">
            pyannote/speaker-diarization-community-1 — identifies who is speaking in
            multi-speaker audio.
          </p>
          <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-500">
            <span className="flex items-center gap-1">
              <HardDrive className="h-3 w-3" />
              {downloaded && localMb
                ? formatMb(localMb)
                : `~${formatMb(estimatedMb)}`}
            </span>
            <span>High accuracy · offline after download</span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {downloaded ? (
            <>
              <span className="rounded-full bg-status-running/20 px-2 py-1 text-[10px] font-semibold uppercase text-status-running">
                Ready
              </span>
              <button
                onClick={onDelete}
                disabled={isDownloading}
                className="flex items-center gap-1 rounded-lg border border-status-failed/30 bg-status-failed/10 px-2.5 py-1.5 text-xs font-medium text-status-failed hover:bg-status-failed/20 disabled:opacity-50"
                title="Delete diarization models to free disk space"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </button>
            </>
          ) : isDownloading ? (
            <span className="flex items-center gap-1 rounded-full bg-accent-muted/40 px-2 py-1 text-[10px] font-semibold uppercase text-accent">
              <Loader2 className="h-3 w-3 animate-spin" />
              Downloading
            </span>
          ) : (
            <button
              onClick={onDownload}
              disabled={!huggingfaceToken || !status?.pyannote_installed}
              className="flex items-center gap-1 rounded-lg border border-surface-border bg-surface-overlay px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:bg-surface-border disabled:opacity-50"
            >
              <Download className="h-3.5 w-3.5" />
              Download
            </button>
          )}
        </div>
      </div>

      <div className="mt-4">
        <label className="mb-1 block text-xs font-medium text-slate-400">
          Hugging Face access token
        </label>
        <input
          type="password"
          value={huggingfaceToken}
          onChange={(e) => onTokenChange(e.target.value)}
          placeholder="hf_..."
          className="w-full rounded-lg border border-surface-border bg-surface-overlay px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600"
        />
        <p className="mt-2 text-xs text-slate-500">
          1) Create a token at{' '}
          <a
            href="https://huggingface.co/settings/tokens"
            className="text-accent hover:underline"
            target="_blank"
            rel="noreferrer"
          >
            huggingface.co/settings/tokens
          </a>
          . 2) Accept terms at{' '}
          <a
            href="https://huggingface.co/pyannote/speaker-diarization-community-1"
            className="text-accent hover:underline"
            target="_blank"
            rel="noreferrer"
          >
            speaker-diarization-community-1
          </a>
          . 3) Paste token and click Download.
        </p>
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

      {downloadStatus?.status === 'error' && downloadStatus.error && (
        <p className="mt-2 text-xs text-status-failed">{downloadStatus.error}</p>
      )}

      {status && !status.pyannote_installed && (
        <p className={clsx('mt-2 text-xs text-amber-400')}>{status.message}</p>
      )}
    </div>
  )
}