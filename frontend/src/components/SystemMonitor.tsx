import { AlertTriangle, Cpu, HardDrive, MemoryStick, Zap } from 'lucide-react'
import clsx from 'clsx'
import { formatMb } from '@/lib/format'
import { hasDiskDetails, hasRamDetails } from '@/lib/system'
import type { SystemStats } from '@/types'

interface SystemMonitorProps {
  stats: SystemStats | null
}

function StatusItem({
  label,
  icon: Icon,
  percent,
  detail,
  warning,
  warningLabel
}: {
  label: string
  icon: React.ComponentType<{ className?: string }>
  percent: number
  detail: string
  warning?: boolean
  warningLabel?: string
}) {
  return (
    <div
      className={clsx(
        'flex min-w-0 items-center gap-3 rounded-md px-3 py-1',
        warning && 'bg-amber-500/10'
      )}
      title={`${label}: ${detail} (${percent.toFixed(0)}%)${warningLabel ? ` — ${warningLabel}` : ''}`}
    >
      <div className="flex shrink-0 items-center gap-1.5">
        <Icon className={clsx('h-3.5 w-3.5', warning ? 'text-amber-400' : 'text-slate-400')} />
        <span className="text-xs font-medium text-slate-400">{label}</span>
      </div>

      <div className="hidden h-1.5 w-24 overflow-hidden rounded-full bg-surface-border sm:block">
        <div
          className={clsx(
            'h-full rounded-full transition-all duration-500',
            warning ? 'bg-amber-400' : 'bg-accent'
          )}
          style={{ width: `${Math.min(percent, 100)}%` }}
        />
      </div>

      <span
        className={clsx(
          'shrink-0 font-mono text-xs font-semibold',
          warning ? 'text-amber-400' : 'text-slate-300'
        )}
      >
        {percent.toFixed(0)}%
      </span>

      <span className="hidden truncate font-mono text-xs text-slate-500 md:inline">{detail}</span>

      {warning && warningLabel && (
        <span className="flex shrink-0 items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-400">
          <AlertTriangle className="h-3 w-3" />
          {warningLabel}
        </span>
      )}
    </div>
  )
}

function DeviceItem({ device, gpuName }: { device: string; gpuName: string | null }) {
  const isGpu = device !== 'cpu'
  const label = isGpu ? gpuName ?? device.toUpperCase() : 'CPU'
  const tooltip = isGpu
    ? `Transcribing on GPU (${label}).`
    : 'Transcribing on CPU. GPU acceleration requires an NVIDIA CUDA GPU — Apple Silicon Macs always run on CPU. Large files will take longer than real time; consider a smaller model for faster results.'

  return (
    <div className="flex min-w-0 shrink-0 items-center gap-1.5 px-3 py-1" title={tooltip}>
      {isGpu ? (
        <Zap className="h-3.5 w-3.5 text-accent" />
      ) : (
        <Cpu className="h-3.5 w-3.5 text-slate-400" />
      )}
      <span className="text-xs font-medium text-slate-400">Engine</span>
      <span className="font-mono text-xs font-semibold text-slate-300">{label}</span>
    </div>
  )
}

export function SystemMonitor({ stats }: SystemMonitorProps) {
  if (!stats) return null

  const ramWarning = stats.ram_percent >= 85
  const diskCritical = hasDiskDetails(stats) && stats.disk_free_mb < 5_120
  const diskWarning =
    hasDiskDetails(stats) &&
    (stats.disk_used_percent >= 90 || stats.disk_free_mb < 10_240)

  const ramDetail = hasRamDetails(stats)
    ? `${formatMb(stats.ram_used_mb)} / ${formatMb(stats.ram_total_mb)}`
    : 'Live'

  const diskDetail = hasDiskDetails(stats)
    ? `${formatMb(stats.disk_free_mb)} free`
    : 'N/A'

  return (
    <footer className="flex shrink-0 items-center justify-between gap-4 border-t border-surface-border bg-surface-raised px-4 py-1.5">
      <p className="hidden text-[10px] font-medium uppercase tracking-wider text-slate-600 lg:block">
        System
      </p>

      <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2 sm:gap-4">
        <DeviceItem device={stats.device} gpuName={stats.gpu_name} />
        <div className="hidden h-4 w-px bg-surface-border sm:block" />
        <StatusItem
          label="RAM"
          icon={MemoryStick}
          percent={stats.ram_percent}
          detail={ramDetail}
          warning={ramWarning}
        />
        <div className="hidden h-4 w-px bg-surface-border sm:block" />
        <StatusItem
          label="Disk"
          icon={HardDrive}
          percent={hasDiskDetails(stats) ? stats.disk_used_percent : 0}
          detail={diskDetail}
          warning={diskWarning}
          warningLabel={
            diskWarning
              ? diskCritical
                ? 'Critically low disk space'
                : 'Low disk space'
              : undefined
          }
        />
      </div>
    </footer>
  )
}