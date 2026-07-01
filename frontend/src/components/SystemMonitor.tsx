import { HardDrive, MemoryStick } from 'lucide-react'
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
  warning
}: {
  label: string
  icon: React.ComponentType<{ className?: string }>
  percent: number
  detail: string
  warning?: boolean
}) {
  return (
    <div
      className={clsx(
        'flex min-w-0 items-center gap-3 rounded-md px-3 py-1',
        warning && 'bg-amber-500/10'
      )}
      title={`${label}: ${detail} (${percent.toFixed(0)}%)`}
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
    </div>
  )
}

export function SystemMonitor({ stats }: SystemMonitorProps) {
  if (!stats) return null

  const ramWarning = stats.ram_percent >= 85
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
        />
      </div>
    </footer>
  )
}