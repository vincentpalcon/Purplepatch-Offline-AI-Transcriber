import clsx from 'clsx'
import type { ActivityLogEntry } from '@/types'

const LEVEL_STYLES = {
  info: 'text-slate-400',
  warn: 'text-amber-400',
  error: 'text-status-failed',
  success: 'text-status-running'
}

interface ActivityLogProps {
  entries: ActivityLogEntry[]
}

export function ActivityLog({ entries }: ActivityLogProps) {
  return (
    <div className="rounded-xl border border-surface-border bg-surface-raised">
      <div className="border-b border-surface-border px-4 py-3">
        <h3 className="text-sm font-semibold text-slate-300">Activity Log</h3>
      </div>
      <div className="max-h-48 overflow-y-auto p-3 font-mono text-xs">
        {entries.length === 0 ? (
          <p className="text-slate-500">No activity yet</p>
        ) : (
          <div className="space-y-1">
            {entries.map((entry) => (
              <div key={entry.id} className="flex gap-2">
                <span className="shrink-0 text-slate-600">
                  {new Date(entry.timestamp).toLocaleTimeString()}
                </span>
                <span className={clsx('shrink-0 uppercase', LEVEL_STYLES[entry.level])}>
                  [{entry.level}]
                </span>
                <span className="text-slate-300">{entry.message}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}