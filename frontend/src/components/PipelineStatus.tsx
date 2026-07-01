import { CheckCircle2, Circle, PlayCircle, XCircle } from 'lucide-react'
import clsx from 'clsx'
import type { PipelineStage, StageState } from '@/types'

const STAGES: { id: PipelineStage; label: string }[] = [
  { id: 'metadata', label: 'Metadata' },
  { id: 'streaming', label: 'Stream' },
  { id: 'vad', label: 'VAD' },
  { id: 'diarization', label: 'Diarization' },
  { id: 'chunking', label: 'Chunking' },
  { id: 'transcription', label: 'Transcribe' },
  { id: 'alignment', label: 'Alignment' },
  { id: 'merge', label: 'Merge' },
  { id: 'export', label: 'Export' }
]

function StageIcon({ state }: { state: StageState }) {
  switch (state) {
    case 'completed':
      return <CheckCircle2 className="h-4 w-4 text-status-completed" />
    case 'running':
      return <PlayCircle className="h-4 w-4 text-status-running animate-pulse" />
    case 'failed':
      return <XCircle className="h-4 w-4 text-status-failed" />
    default:
      return <Circle className="h-4 w-4 text-status-waiting" />
  }
}

function getStageState(
  stageId: PipelineStage,
  currentStage: PipelineStage,
  jobStatus: string
): StageState {
  const order = STAGES.map((s) => s.id)
  const currentIndex = order.indexOf(currentStage)
  const stageIndex = order.indexOf(stageId)

  if (jobStatus === 'failed' && stageId === currentStage) return 'failed'
  if (stageIndex < currentIndex) return 'completed'
  if (stageIndex === currentIndex && jobStatus === 'running') return 'running'
  if (stageIndex === currentIndex && jobStatus === 'completed') return 'completed'
  return 'waiting'
}

interface PipelineStatusProps {
  currentStage: PipelineStage
  jobStatus: string
}

export function PipelineStatus({ currentStage, jobStatus }: PipelineStatusProps) {
  return (
    <div className="rounded-xl border border-surface-border bg-surface-raised p-4">
      <h3 className="mb-3 text-sm font-semibold text-slate-300">Pipeline</h3>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-9">
        {STAGES.map((stage) => {
          const state = getStageState(stage.id, currentStage, jobStatus)
          return (
            <div
              key={stage.id}
              className={clsx(
                'flex flex-col items-center gap-1 rounded-lg px-2 py-2 text-center',
                state === 'running' && 'bg-accent-muted/40',
                state === 'completed' && 'bg-status-completed/10'
              )}
            >
              <StageIcon state={state} />
              <span className="text-[10px] font-medium text-slate-400">{stage.label}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}