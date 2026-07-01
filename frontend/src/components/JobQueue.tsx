import {
  FileAudio,
  GripVertical,
  Pause,
  Play,
  RefreshCw,
  StopCircle,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Loader2
} from 'lucide-react'
import clsx from 'clsx'
import type { TranscriptionJob } from '@/types'

const STATUS_STYLES: Record<string, string> = {
  queued: 'bg-slate-500/20 text-slate-300',
  running: 'bg-status-running/20 text-status-running',
  paused: 'bg-amber-500/20 text-amber-400',
  completed: 'bg-status-completed/20 text-status-completed',
  failed: 'bg-status-failed/20 text-status-failed',
  cancelled: 'bg-slate-600/20 text-slate-400'
}

const FINISHED_STATUSES = ['completed', 'cancelled', 'failed']

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'running':
      return <Loader2 className="h-4 w-4 animate-spin text-status-running" />
    case 'completed':
      return <CheckCircle2 className="h-4 w-4 text-status-completed" />
    case 'failed':
      return <AlertCircle className="h-4 w-4 text-status-failed" />
    default:
      return <FileAudio className="h-4 w-4 text-slate-400" />
  }
}

interface JobQueueProps {
  jobs: TranscriptionJob[]
  selectedJobId: string | null
  onSelect: (id: string) => void
  onPause: (id: string) => void
  onResume: (id: string) => void
  onCancel: (id: string) => void
  onRetry: (id: string) => void
  onRemove: (id: string) => void
}

export function JobQueue({
  jobs,
  selectedJobId,
  onSelect,
  onPause,
  onResume,
  onCancel,
  onRetry,
  onRemove
}: JobQueueProps) {
  if (jobs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-surface-border bg-surface-raised p-8 text-center">
        <FileAudio className="mb-3 h-10 w-10 text-slate-600" />
        <p className="text-sm font-medium text-slate-400">No jobs in queue</p>
        <p className="mt-1 text-xs text-slate-500">Add a media file to start transcribing</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {jobs.map((job) => (
        <div
          key={job.id}
          onClick={() => onSelect(job.id)}
          className={clsx(
            'group cursor-pointer rounded-xl border p-3 transition-colors',
            selectedJobId === job.id
              ? 'border-accent bg-accent-muted/30'
              : 'border-surface-border bg-surface-raised hover:border-surface-border/80 hover:bg-surface-overlay'
          )}
        >
          <div className="flex items-start gap-2">
            <GripVertical className="mt-1 h-4 w-4 shrink-0 text-slate-600 opacity-0 group-hover:opacity-100" />
            <StatusIcon status={job.status} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-200">{job.file_name}</p>
              <div className="mt-1 flex items-center gap-2">
                <span
                  className={clsx(
                    'rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase',
                    STATUS_STYLES[job.status]
                  )}
                >
                  {job.status}
                </span>
                <span className="text-xs text-slate-500">
                  {job.progress.overall_percent.toFixed(0)}%
                </span>
              </div>
            </div>
            <div className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
              {job.status === 'running' && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onPause(job.id)
                  }}
                  className="rounded p-1 text-slate-400 hover:bg-surface-overlay hover:text-slate-200"
                  title="Pause"
                >
                  <Pause className="h-3.5 w-3.5" />
                </button>
              )}
              {job.status === 'paused' && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onResume(job.id)
                  }}
                  className="rounded p-1 text-slate-400 hover:bg-surface-overlay hover:text-slate-200"
                  title="Resume"
                >
                  <Play className="h-3.5 w-3.5" />
                </button>
              )}
              {job.status === 'failed' && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onRetry(job.id)
                  }}
                  className="rounded p-1 text-slate-400 hover:bg-surface-overlay hover:text-slate-200"
                  title="Retry"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </button>
              )}
              {!FINISHED_STATUSES.includes(job.status) && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onCancel(job.id)
                  }}
                  className="rounded p-1 text-slate-400 hover:bg-status-failed/20 hover:text-status-failed"
                  title="Stop"
                >
                  <StopCircle className="h-3.5 w-3.5" />
                </button>
              )}
              {FINISHED_STATUSES.includes(job.status) && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onRemove(job.id)
                  }}
                  className="rounded p-1 text-slate-400 hover:bg-status-failed/20 hover:text-status-failed"
                  title="Remove from queue"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}