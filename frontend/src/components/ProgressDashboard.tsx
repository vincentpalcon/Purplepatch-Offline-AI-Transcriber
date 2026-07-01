import { Activity, Clock, Cpu, Gauge, HardDrive, MemoryStick, Timer, Users, Zap } from 'lucide-react'
import { formatMb } from '@/lib/format'
import { hasDiskDetails, hasRamDetails } from '@/lib/system'
import type { JobProgress, SystemStats } from '@/types'

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) return `${h}h ${m}m ${s}s`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

function StatCard({
  icon: Icon,
  label,
  value,
  subValue
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  subValue?: string
}) {
  return (
    <div className="rounded-lg border border-surface-border bg-surface-overlay p-3">
      <div className="mb-1 flex items-center gap-2 text-slate-400">
        <Icon className="h-3.5 w-3.5" />
        <span className="text-xs font-medium">{label}</span>
      </div>
      <p className="font-mono text-lg font-semibold text-slate-100">{value}</p>
      {subValue && <p className="mt-0.5 text-xs text-slate-500">{subValue}</p>}
    </div>
  )
}

interface ProgressDashboardProps {
  progress: JobProgress
  systemStats: SystemStats | null
}

export function ProgressDashboard({ progress, systemStats }: ProgressDashboardProps) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-surface-border bg-surface-raised p-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-medium text-slate-300">Overall Progress</span>
          <span className="font-mono text-sm font-semibold text-accent">
            {progress.overall_percent.toFixed(1)}%
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-surface-overlay">
          <div
            className="h-full rounded-full bg-gradient-to-r from-accent to-status-running transition-all duration-500"
            style={{ width: `${Math.min(progress.overall_percent, 100)}%` }}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          icon={Gauge}
          label="Chunk"
          value={`${progress.current_chunk} / ${progress.total_chunks || '—'}`}
        />
        <StatCard
          icon={Timer}
          label="Elapsed"
          value={formatDuration(progress.elapsed_seconds)}
        />
        <StatCard
          icon={Clock}
          label="ETA"
          value={progress.eta_seconds != null ? formatDuration(progress.eta_seconds) : '—'}
        />
        <StatCard
          icon={Zap}
          label="Speed"
          value={progress.speed_rtf != null ? `${progress.speed_rtf.toFixed(2)}x RT` : '—'}
        />
        <StatCard
          icon={Users}
          label="Speaker"
          value={progress.current_speaker ?? '—'}
        />
        <StatCard
          icon={Cpu}
          label="CPU"
          value={systemStats ? `${systemStats.cpu_percent.toFixed(0)}%` : '—'}
        />
        <StatCard
          icon={MemoryStick}
          label="RAM"
          value={systemStats ? `${systemStats.ram_percent.toFixed(0)}%` : '—'}
          subValue={
            systemStats && hasRamDetails(systemStats)
              ? `${formatMb(systemStats.ram_used_mb)} / ${formatMb(systemStats.ram_total_mb)}`
              : undefined
          }
        />
        <StatCard
          icon={HardDrive}
          label="Disk Free"
          value={
            systemStats && hasDiskDetails(systemStats)
              ? formatMb(systemStats.disk_free_mb)
              : '—'
          }
          subValue={
            systemStats && hasDiskDetails(systemStats)
              ? `${systemStats.disk_used_percent.toFixed(0)}% used`
              : undefined
          }
        />
        <StatCard
          icon={Activity}
          label="GPU"
          value={
            systemStats?.gpu_percent != null
              ? `${systemStats.gpu_percent.toFixed(0)}%`
              : 'N/A'
          }
          subValue={systemStats?.gpu_name ?? undefined}
        />
      </div>
    </div>
  )
}