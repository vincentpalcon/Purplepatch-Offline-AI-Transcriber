import { useCallback, useEffect, useState } from 'react'
import { Download, Loader2, RefreshCw } from 'lucide-react'
import clsx from 'clsx'
import type { UpdateStatusPayload } from '@/types'

interface AppUpdatePanelProps {
  autoCheckUpdates: boolean
  autoDownloadUpdates: boolean
  onAutoCheckChange: (enabled: boolean) => void
  onAutoDownloadChange: (enabled: boolean) => void
}

export function AppUpdatePanel({
  autoCheckUpdates,
  autoDownloadUpdates,
  onAutoCheckChange,
  onAutoDownloadChange
}: AppUpdatePanelProps) {
  const [status, setStatus] = useState<UpdateStatusPayload | null>(null)
  const [checking, setChecking] = useState(false)

  const refreshStatus = useCallback(async () => {
    try {
      setStatus(await window.electronAPI.getUpdateStatus())
    } catch {
      setStatus(null)
    }
  }, [])

  useEffect(() => {
    void refreshStatus()
    const unsubscribe = window.electronAPI.onUpdateStatusChanged((next) => {
      setStatus(next)
      if (next.state !== 'checking' && next.state !== 'downloading') {
        setChecking(false)
      }
    })
    return unsubscribe
  }, [refreshStatus])

  const handleManualUpdate = async () => {
    setChecking(true)
    setStatus((prev) =>
      prev
        ? { ...prev, state: 'checking', message: 'Checking for updates...' }
        : prev
    )
    try {
      setStatus(await window.electronAPI.checkForUpdates())
    } finally {
      setChecking(false)
    }
  }

  const handleDownload = async () => {
    setStatus(await window.electronAPI.downloadUpdate())
  }

  const isBusy = checking || status?.state === 'checking' || status?.state === 'downloading'
  const showDownloadButton = status?.state === 'available'
  const updateReady = status?.state === 'downloaded'

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-surface-border bg-surface-raised p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-slate-200">Installed version</p>
            <p className="mt-1 text-2xl font-semibold text-slate-100">
              v{status?.currentVersion ?? '—'}
            </p>
            {status?.latestVersion && status.latestVersion !== status.currentVersion && (
              <p className="mt-1 text-sm text-accent">Latest: v{status.latestVersion}</p>
            )}
          </div>

          <button
            onClick={handleManualUpdate}
            disabled={isBusy || updateReady}
            className="flex items-center gap-2 rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 text-sm font-medium text-accent hover:bg-accent/20 disabled:opacity-50"
          >
            {isBusy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Check for updates
          </button>
        </div>

        <p
          className={clsx(
            'mt-3 text-sm',
            status?.state === 'error' ? 'text-status-failed' : 'text-slate-400'
          )}
        >
          {updateReady
            ? 'Update downloaded. A restart prompt will appear — the app must restart to apply it.'
            : (status?.message ?? 'Click Check for updates to look for a new version.')}
        </p>

        {status?.state === 'downloading' && (
          <div className="mt-3">
            <div className="mb-1 flex justify-between text-xs text-slate-500">
              <span>
                {status.transferredMb != null && status.totalMb != null
                  ? `${status.transferredMb} / ${status.totalMb} MB`
                  : 'Downloading update'}
              </span>
              <span>{status.progressPercent.toFixed(0)}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-surface-overlay">
              <div
                className="h-full rounded-full bg-accent transition-all duration-300"
                style={{ width: `${status.progressPercent}%` }}
              />
            </div>
          </div>
        )}

        {showDownloadButton && (
          <button
            onClick={handleDownload}
            className="mt-4 flex items-center gap-2 rounded-lg border border-surface-border bg-surface-overlay px-3 py-2 text-sm text-slate-300 hover:bg-surface-border"
          >
            <Download className="h-4 w-4" />
            Download update
          </button>
        )}

        {status?.state === 'dev' && (
          <p className="mt-3 text-xs text-slate-500">
            Running from source — updates apply to installed builds from GitHub Releases.
          </p>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex items-start gap-2 rounded-xl border border-surface-border bg-surface-raised p-4 text-sm text-slate-300">
          <input
            type="checkbox"
            checked={autoCheckUpdates}
            onChange={(e) => onAutoCheckChange(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            <span className="font-medium text-slate-200">Automatic update checks</span>
            <span className="mt-1 block text-xs text-slate-500">
              Check for new versions in the background when the app starts.
            </span>
          </span>
        </label>

        <label className="flex items-start gap-2 rounded-xl border border-surface-border bg-surface-raised p-4 text-sm text-slate-300">
          <input
            type="checkbox"
            checked={autoDownloadUpdates}
            onChange={(e) => onAutoDownloadChange(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            <span className="font-medium text-slate-200">Automatic download</span>
            <span className="mt-1 block text-xs text-slate-500">
              Download updates automatically when found. You will be asked to restart when ready.
            </span>
          </span>
        </label>
      </div>
    </div>
  )
}