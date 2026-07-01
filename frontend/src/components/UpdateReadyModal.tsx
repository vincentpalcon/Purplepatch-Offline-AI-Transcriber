import { Rocket, X } from 'lucide-react'

interface UpdateReadyModalProps {
  open: boolean
  currentVersion: string
  latestVersion: string | null
  onRestart: () => void
  onLater: () => void
}

export function UpdateReadyModal({
  open,
  currentVersion,
  latestVersion,
  onRestart,
  onLater
}: UpdateReadyModalProps) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4">
      <div
        role="dialog"
        aria-labelledby="update-ready-title"
        className="relative w-full max-w-sm rounded-2xl border border-surface-border bg-surface-raised p-5 shadow-2xl"
      >
        <button
          onClick={onLater}
          className="absolute right-3 top-3 rounded-lg p-1 text-slate-500 hover:bg-surface-overlay hover:text-slate-300"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-status-running/20">
          <Rocket className="h-5 w-5 text-status-running" />
        </div>

        <h3 id="update-ready-title" className="text-lg font-semibold text-slate-100">
          Update ready
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-slate-400">
          Version <span className="text-slate-200">v{latestVersion}</span> has been downloaded.
          Restart the app to finish installing — your transcripts and settings will be kept.
        </p>
        <p className="mt-1 text-xs text-slate-500">Current version: v{currentVersion}</p>

        <div className="mt-5 flex gap-2">
          <button
            onClick={onRestart}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white hover:bg-accent-hover"
          >
            <Rocket className="h-4 w-4" />
            Restart now
          </button>
          <button
            onClick={onLater}
            className="rounded-lg border border-surface-border bg-surface-overlay px-4 py-2.5 text-sm text-slate-300 hover:bg-surface-border"
          >
            Later
          </button>
        </div>
      </div>
    </div>
  )
}