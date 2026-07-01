import { useCallback, useEffect, useState } from 'react'
import {
  FolderOpen,
  Mic,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Settings,
  StopCircle,
  Trash2,
  Wifi,
  WifiOff
} from 'lucide-react'
import { api } from '@/lib/api'
import { ActivityLog } from '@/components/ActivityLog'
import { JobQueue } from '@/components/JobQueue'
import { OnboardingModal } from '@/components/OnboardingModal'
import { PipelineStatus } from '@/components/PipelineStatus'
import { ProgressDashboard } from '@/components/ProgressDashboard'
import { SettingsPanel } from '@/components/SettingsPanel'
import { DropZone } from '@/components/DropZone'
import { SystemMonitor } from '@/components/SystemMonitor'
import { TranscriptPreview } from '@/components/TranscriptPreview'
import { MEDIA_EXTENSIONS_LABEL } from '@/lib/media'
import type { ActivityLogEntry, AppSettings, SystemStats, TranscriptionJob } from '@/types'

const POLL_INTERVAL_MS = 1500
const isMac = window.electronAPI.platform === 'darwin'

const DEFAULT_SETTINGS: AppSettings = {
  model: 'base',
  output_format: 'txt',
  language: null,
  device: 'auto',
  compute_type: 'int8',
  beam_size: 5,
  vad_filter: true,
  onboarding_complete: false,
  export_dir: null,
  vocabulary: null,
  fast_batched: false
}

type AppView = 'main' | 'settings'

const FINISHED_STATUSES = ['completed', 'cancelled', 'failed']

export default function App() {
  const [view, setView] = useState<AppView>('main')
  const [connected, setConnected] = useState(false)
  const [appSettings, setAppSettings] = useState<AppSettings | null>(null)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [jobs, setJobs] = useState<TranscriptionJob[]>([])
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null)
  const [activityLog, setActivityLog] = useState<ActivityLogEntry[]>([])
  const [systemStats, setSystemStats] = useState<SystemStats | null>(null)
  const [isAdding, setIsAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selectedJob = jobs.find((j) => j.id === selectedJobId) ?? jobs[0] ?? null

  const refresh = useCallback(async () => {
    try {
      await api.health()
      setConnected(true)

      const [jobList, logs] = await Promise.all([
        api.listJobs(),
        api.getActivityLog(selectedJob?.id)
      ])

      setJobs(jobList)
      setActivityLog(logs)

      try {
        setSystemStats(await api.getSystemStats())
      } catch {
        setSystemStats(null)
      }

      try {
        const settings = await api.getSettings()
        setAppSettings(settings)
        setShowOnboarding(!settings.onboarding_complete)
      } catch {
        setAppSettings((prev) => prev ?? DEFAULT_SETTINGS)
      }

      setError(null)

      if (!selectedJobId && jobList.length > 0) {
        setSelectedJobId(jobList[0].id)
      }
    } catch (err) {
      setConnected(false)
      setError(err instanceof Error ? err.message : 'Local engine unavailable')
    }
  }, [selectedJob?.id, selectedJobId])

  useEffect(() => {
    refresh()
    const interval = setInterval(refresh, POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [refresh])

  const addJobsFromPaths = async (filePaths: string[]) => {
    if (filePaths.length === 0) return

    setIsAdding(true)
    setError(null)
    try {
      let lastJobId: string | null = null
      for (const filePath of filePaths) {
        const job = await api.createJob({ file_path: filePath })
        lastJobId = job.id
      }
      if (lastJobId) setSelectedJobId(lastJobId)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create job')
    } finally {
      setIsAdding(false)
    }
  }

  const handleAddJob = async () => {
    const filePath = await window.electronAPI.openFileDialog()
    if (!filePath) return
    await addJobsFromPaths([filePath])
  }

  const handleJobAction = async (
    action: 'pause' | 'resume' | 'cancel' | 'retry' | 'remove',
    id: string
  ) => {
    try {
      switch (action) {
        case 'pause':
          await api.pauseJob(id)
          break
        case 'resume':
          await api.resumeJob(id)
          break
        case 'cancel':
          await api.cancelJob(id)
          break
        case 'retry':
          await api.retryJob(id)
          break
        case 'remove':
          await api.deleteJob(id)
          if (selectedJobId === id) setSelectedJobId(null)
          break
      }
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed')
    }
  }

  const handleClearFinished = async () => {
    try {
      const { deleted } = await api.clearFinishedJobs()
      if (selectedJobId && deleted.includes(selectedJobId)) setSelectedJobId(null)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clear finished jobs')
    }
  }

  const handleOpenExport = async () => {
    if (selectedJob?.export_path) {
      await window.electronAPI.showItemInFolder(selectedJob.export_path)
    }
  }

  const handleOnboardingComplete = async () => {
    setShowOnboarding(false)
    await refresh()
  }

  if (view === 'settings') {
    return (
      <div className="flex h-screen flex-col bg-surface">
        <SettingsPanel onBack={() => setView('main')} />
      </div>
    )
  }

  return (
    <div className="flex h-screen flex-col">
      {showOnboarding && connected && (
        <OnboardingModal onComplete={handleOnboardingComplete} />
      )}

      <header
        className={`app-drag flex shrink-0 items-center justify-between border-b border-surface-border bg-surface-raised px-6 ${
          isMac ? 'h-[52px] pl-[84px]' : 'h-14'
        }`}
      >
        <div className="flex min-w-0 flex-1 items-center gap-3 select-none">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent">
            <Mic className="h-4 w-4 text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold text-slate-100">
              Purplepatch Offline AI Transcriber
            </h1>
            <p className="truncate text-xs text-slate-500">
              {appSettings ? `Model: ${appSettings.model}` : 'Purplepatch · Offline transcription'}
            </p>
          </div>
        </div>

        <div className="app-no-drag flex shrink-0 items-center gap-3">
          <div className="flex items-center gap-2 text-xs">
            {connected ? (
              <>
                <Wifi className="h-3.5 w-3.5 text-status-running" />
                <span className="hidden text-status-running md:inline">Local engine online</span>
              </>
            ) : (
              <>
                <WifiOff className="h-3.5 w-3.5 text-status-failed" />
                <span className="hidden text-status-failed md:inline">Local engine offline</span>
              </>
            )}
          </div>

          <button
            onClick={() => setView('settings')}
            disabled={!connected}
            className="flex items-center gap-2 rounded-lg border border-surface-border bg-surface-overlay px-3 py-2 text-sm text-slate-300 hover:bg-surface-border disabled:opacity-50"
            title="Settings"
          >
            <Settings className="h-4 w-4" />
          </button>

          <button
            onClick={handleAddJob}
            disabled={isAdding || !connected || showOnboarding}
            className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            {isAdding ? 'Adding...' : 'Add Media'}
          </button>
        </div>
      </header>

      {error && (
        <div className="border-b border-status-failed/30 bg-status-failed/10 px-6 py-2 text-sm text-status-failed">
          {error}
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col">
      <DropZone
        disabled={!connected || isAdding || showOnboarding}
        onFilesDropped={addJobsFromPaths}
        onInvalidDrop={() =>
          setError(`Unsupported file type. Supported formats: ${MEDIA_EXTENSIONS_LABEL}`)
        }
      >
      <div className="flex h-full min-h-0">
        <aside className="w-80 shrink-0 overflow-y-auto border-r border-surface-border bg-surface p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Job Queue
            </h2>
            {jobs.some((j) => FINISHED_STATUSES.includes(j.status)) && (
              <button
                onClick={handleClearFinished}
                className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium text-slate-500 hover:bg-surface-overlay hover:text-slate-300"
                title="Remove all completed, cancelled, and failed jobs"
              >
                <Trash2 className="h-3 w-3" />
                Clear finished
              </button>
            )}
          </div>
          <JobQueue
            jobs={jobs}
            selectedJobId={selectedJob?.id ?? null}
            onSelect={setSelectedJobId}
            onPause={(id) => handleJobAction('pause', id)}
            onResume={(id) => handleJobAction('resume', id)}
            onCancel={(id) => handleJobAction('cancel', id)}
            onRetry={(id) => handleJobAction('retry', id)}
            onRemove={(id) => handleJobAction('remove', id)}
          />
        </aside>

        <main className="min-w-0 flex-1 overflow-y-auto p-6">
          {selectedJob ? (
            <div className="mx-auto max-w-5xl space-y-6">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h2 className="truncate text-lg font-semibold text-slate-100">{selectedJob.file_name}</h2>
                  <p className="mt-0.5 truncate text-xs text-slate-500">{selectedJob.file_path}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {selectedJob.status === 'running' && (
                    <button
                      onClick={() => handleJobAction('pause', selectedJob.id)}
                      className="flex items-center gap-2 rounded-lg border border-surface-border bg-surface-raised px-3 py-2 text-sm text-slate-300 hover:bg-surface-overlay"
                    >
                      <Pause className="h-4 w-4" />
                      Pause
                    </button>
                  )}
                  {selectedJob.status === 'paused' && (
                    <button
                      onClick={() => handleJobAction('resume', selectedJob.id)}
                      className="flex items-center gap-2 rounded-lg border border-surface-border bg-surface-raised px-3 py-2 text-sm text-slate-300 hover:bg-surface-overlay"
                    >
                      <Play className="h-4 w-4" />
                      Resume
                    </button>
                  )}
                  {selectedJob.status === 'failed' && (
                    <button
                      onClick={() => handleJobAction('retry', selectedJob.id)}
                      className="flex items-center gap-2 rounded-lg border border-surface-border bg-surface-raised px-3 py-2 text-sm text-slate-300 hover:bg-surface-overlay"
                    >
                      <RefreshCw className="h-4 w-4" />
                      Retry
                    </button>
                  )}
                  {!FINISHED_STATUSES.includes(selectedJob.status) && (
                    <button
                      onClick={() => handleJobAction('cancel', selectedJob.id)}
                      className="flex items-center gap-2 rounded-lg border border-status-failed/40 bg-status-failed/10 px-3 py-2 text-sm text-status-failed hover:bg-status-failed/20"
                      title="Stop transcription permanently"
                    >
                      <StopCircle className="h-4 w-4" />
                      Stop
                    </button>
                  )}
                  {FINISHED_STATUSES.includes(selectedJob.status) && (
                    <button
                      onClick={() => handleJobAction('remove', selectedJob.id)}
                      className="flex items-center gap-2 rounded-lg border border-surface-border bg-surface-raised px-3 py-2 text-sm text-slate-300 hover:bg-surface-overlay"
                      title="Remove this job from the queue"
                    >
                      <Trash2 className="h-4 w-4" />
                      Remove
                    </button>
                  )}
                  {selectedJob.export_path && (
                    <button
                      onClick={handleOpenExport}
                      className="flex items-center gap-2 rounded-lg border border-surface-border bg-surface-raised px-3 py-2 text-sm text-slate-300 hover:bg-surface-overlay"
                    >
                      <FolderOpen className="h-4 w-4" />
                      Open Export
                    </button>
                  )}
                </div>
              </div>

              <PipelineStatus
                currentStage={selectedJob.progress.current_stage}
                jobStatus={selectedJob.status}
              />

              <ProgressDashboard progress={selectedJob.progress} systemStats={systemStats} />

              <TranscriptPreview text={selectedJob.progress.live_transcript} />

              <ActivityLog entries={activityLog} />
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <Mic className="mb-4 h-16 w-16 text-slate-700" />
              <h2 className="text-xl font-semibold text-slate-300">Ready to transcribe</h2>
              <p className="mt-2 max-w-md text-sm text-slate-500">
                Drag and drop a media file here, or click below to browse. Configure your model and
                output format in Settings.
              </p>
              <p className="mt-1 text-xs text-slate-600">{MEDIA_EXTENSIONS_LABEL}</p>
              <button
                onClick={handleAddJob}
                disabled={isAdding || !connected || showOnboarding}
                className="mt-6 flex items-center gap-2 rounded-lg bg-accent px-6 py-3 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
              >
                <Plus className="h-4 w-4" />
                Select Media File
              </button>
            </div>
          )}
        </main>
      </div>
      </DropZone>

      {connected && <SystemMonitor stats={systemStats} />}
      </div>
    </div>
  )
}