import { useCallback, useEffect, useState } from 'react'
import {
  ArrowLeft,
  Cpu,
  FolderOpen,
  HardDrive,
  MemoryStick,
  RefreshCw,
  Save,
  Settings2
} from 'lucide-react'
import clsx from 'clsx'
import { api } from '@/lib/api'
import { formatMb, formatPercent } from '@/lib/format'
import { AppUpdatePanel } from '@/components/AppUpdatePanel'
import { DiarizationModelCard } from '@/components/DiarizationModelCard'
import { ModelSelector } from '@/components/ModelSelector'
import type {
  AppSettings,
  DiarizationDownloadStatus,
  DiarizationStatus,
  ModelDownloadStatus,
  ModelWithStatus,
  OutputFormatOption,
  SystemInfo
} from '@/types'

type SettingsTab = 'general' | 'models' | 'system'
const isMac = window.electronAPI.platform === 'darwin'

function isDiskLow(freeMb: number, totalMb: number): boolean {
  const usedPercent = totalMb > 0 ? (1 - freeMb / totalMb) * 100 : 0
  return usedPercent >= 90 || freeMb < 10_240
}

interface SettingsPanelProps {
  onBack: () => void
}

const LANGUAGES = [
  { value: '', label: 'Auto-detect' },
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Spanish' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
  { value: 'it', label: 'Italian' },
  { value: 'pt', label: 'Portuguese' },
  { value: 'ja', label: 'Japanese' },
  { value: 'ko', label: 'Korean' },
  { value: 'zh', label: 'Chinese' }
]

export function SettingsPanel({ onBack }: SettingsPanelProps) {
  const [tab, setTab] = useState<SettingsTab>('general')
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [draft, setDraft] = useState<AppSettings | null>(null)
  const [models, setModels] = useState<ModelWithStatus[]>([])
  const [outputFormats, setOutputFormats] = useState<OutputFormatOption[]>([])
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null)
  const [downloadStatus, setDownloadStatus] = useState<ModelDownloadStatus | null>(null)
  const [diarizationStatus, setDiarizationStatus] = useState<DiarizationStatus | null>(null)
  const [diarizationDownloadStatus, setDiarizationDownloadStatus] =
    useState<DiarizationDownloadStatus | null>(null)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadAll = useCallback(async () => {
    const [s, m, f, info, dl, diarization, diarizationDl] = await Promise.all([
      api.getSettings(),
      api.getModels(),
      api.getOutputFormats(),
      api.getSystemInfo(),
      api.getModelDownloadStatus(),
      api.getDiarizationStatus().catch(() => null),
      api.getDiarizationDownloadStatus().catch(() => null)
    ])
    setSettings(s)
    setDraft(s)
    setModels(m)
    setOutputFormats(f)
    setSystemInfo(info)
    setDownloadStatus(dl)
    setDiarizationStatus(diarization)
    setDiarizationDownloadStatus(diarizationDl)
  }, [])

  useEffect(() => {
    loadAll().catch((err) =>
      setError(err instanceof Error ? err.message : 'Failed to load settings')
    )
  }, [loadAll])

  useEffect(() => {
    if (downloadStatus?.status !== 'downloading') return
    const interval = setInterval(async () => {
      try {
        const status = await api.getModelDownloadStatus()
        setDownloadStatus(status)
        if (status.status === 'completed') {
          const [m, info] = await Promise.all([api.getModels(), api.getSystemInfo()])
          setModels(m)
          setSystemInfo(info)
          setMessage(`${status.model_id} downloaded successfully.`)
        }
        if (status.status === 'error') {
          setError(status.error ?? 'Download failed')
          await loadAll()
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to check download status')
      }
    }, 1000)
    return () => clearInterval(interval)
  }, [downloadStatus?.status, loadAll])

  useEffect(() => {
    if (diarizationDownloadStatus?.status !== 'downloading') return
    const interval = setInterval(async () => {
      try {
        const status = await api.getDiarizationDownloadStatus()
        setDiarizationDownloadStatus(status)
        if (status.status === 'completed') {
          const [diarization, info] = await Promise.all([
            api.getDiarizationStatus(),
            api.getSystemInfo()
          ])
          setDiarizationStatus(diarization)
          setSystemInfo(info)
          setMessage('Diarization models downloaded successfully.')
        }
        if (status.status === 'error') {
          setError(status.error ?? 'Diarization download failed')
          await loadAll()
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to check diarization download')
      }
    }, 1000)
    return () => clearInterval(interval)
  }, [diarizationDownloadStatus?.status, loadAll])

  useEffect(() => {
    if (tab !== 'system') return
    const interval = setInterval(async () => {
      try {
        setSystemInfo(await api.getSystemInfo())
      } catch {
        // ignore polling errors
      }
    }, 2000)
    return () => clearInterval(interval)
  }, [tab])

  const handleSave = async () => {
    if (!draft) return
    setSaving(true)
    setError(null)
    setMessage(null)
    try {
      const updated = await api.updateSettings({
        model: draft.model,
        output_format: draft.output_format,
        language: draft.language,
        device: draft.device,
        compute_type: draft.compute_type,
        beam_size: draft.beam_size,
        vad_filter: draft.vad_filter,
        export_dir: draft.export_dir,
        vocabulary: draft.vocabulary,
        fast_batched: draft.fast_batched,
        enable_speaker_labels: draft.enable_speaker_labels,
        huggingface_token: draft.huggingface_token,
        diarization_min_speakers: draft.diarization_min_speakers,
        diarization_max_speakers: draft.diarization_max_speakers,
        auto_check_updates: draft.auto_check_updates,
        auto_download_updates: draft.auto_download_updates
      })
      setSettings(updated)
      setDraft(updated)
      await window.electronAPI.configureUpdater()
      const [m, info, diarization] = await Promise.all([
        api.getModels(),
        api.getSystemInfo(),
        api.getDiarizationStatus().catch(() => null)
      ])
      setModels(m)
      setSystemInfo(info)
      setDiarizationStatus(diarization)
      setMessage('Settings saved successfully.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  const handleDownloadDiarization = async () => {
    if (!draft?.huggingface_token) {
      setError('Add your Hugging Face token in the Models tab before downloading.')
      return
    }

    setError(null)
    setMessage(null)
    try {
      const updated = await api.updateSettings({
        huggingface_token: draft.huggingface_token,
        enable_speaker_labels: draft.enable_speaker_labels,
        diarization_min_speakers: draft.diarization_min_speakers,
        diarization_max_speakers: draft.diarization_max_speakers
      })
      setSettings(updated)
      setDraft(updated)

      const status = await api.downloadDiarizationModels()
      setDiarizationDownloadStatus(status)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start diarization download')
    }
  }

  const handleDeleteDiarization = async () => {
    if (!window.confirm('Delete diarization models? You can re-download them later.')) return
    setError(null)
    try {
      await api.deleteDiarizationModels()
      await loadAll()
      setMessage('Diarization models deleted.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete diarization models')
    }
  }

  const handleDeleteModel = async (modelId: string) => {
    if (
      !window.confirm(
        `Delete ${modelId}? You will need to download it again before transcribing with this model.`
      )
    ) {
      return
    }
    setError(null)
    try {
      await api.deleteModel(modelId)
      const [m, info] = await Promise.all([api.getModels(), api.getSystemInfo()])
      setModels(m)
      setSystemInfo(info)
      setMessage(`${modelId} deleted.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete model')
    }
  }

  const handleDownload = async (modelId: string) => {
    setError(null)
    try {
      const status = await api.downloadModel(modelId)
      setDownloadStatus(status)
      setDraft((prev) => (prev ? { ...prev, model: modelId } : prev))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed')
    }
  }

  const updateDraft = (patch: Partial<AppSettings>) => {
    setDraft((prev) => (prev ? { ...prev, ...patch } : prev))
  }

  const handleChooseExportDir = async () => {
    const dir = await window.electronAPI.openDirectoryDialog()
    if (dir) updateDraft({ export_dir: dir })
  }

  const tabs: { id: SettingsTab; label: string }[] = [
    { id: 'general', label: 'General' },
    { id: 'models', label: 'Models' },
    { id: 'system', label: 'System Info' }
  ]

  if (!draft) {
    return (
      <div className="flex h-full items-center justify-center text-slate-400">
        Loading settings...
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div
        className={`app-drag flex shrink-0 items-center justify-between border-b border-surface-border bg-surface-raised px-6 ${
          isMac ? 'min-h-[52px] pl-[84px]' : 'py-4'
        }`}
      >
        <div className="flex min-w-0 items-center gap-3 select-none">
          <button
            onClick={onBack}
            className="app-no-drag flex shrink-0 items-center gap-2 rounded-lg border border-surface-border px-3 py-2 text-sm text-slate-300 hover:bg-surface-overlay"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
          <div className="flex min-w-0 items-center gap-2">
            <Settings2 className="h-5 w-5 shrink-0 text-slate-400" />
            <h2 className="truncate text-lg font-semibold text-slate-100">Settings</h2>
          </div>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="app-no-drag flex shrink-0 items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
        >
          <Save className="h-4 w-4" />
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>

      {(message || error) && (
        <div
          className={clsx(
            'border-b px-6 py-2 text-sm',
            error
              ? 'border-status-failed/30 bg-status-failed/10 text-status-failed'
              : 'border-status-running/30 bg-status-running/10 text-status-running'
          )}
        >
          {error ?? message}
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <nav className="w-48 shrink-0 border-r border-surface-border bg-surface p-4">
          <div className="space-y-1">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={clsx(
                  'w-full rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors',
                  tab === t.id
                    ? 'bg-accent-muted/40 text-accent'
                    : 'text-slate-400 hover:bg-surface-overlay hover:text-slate-200'
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </nav>

        <div className="min-w-0 flex-1 overflow-y-auto p-6">
          <div className="mx-auto max-w-3xl space-y-6">
            {tab === 'general' && (
              <>
                <Section title="Output Format" description="Default format for exported transcripts.">
                  <div className="space-y-2">
                    {outputFormats.map((format) => (
                      <label
                        key={format.id}
                        className={clsx(
                          'flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors',
                          !format.available && 'cursor-not-allowed opacity-60',
                          draft.output_format === format.id
                            ? 'border-accent bg-accent-muted/20'
                            : 'border-surface-border bg-surface-raised'
                        )}
                      >
                        <input
                          type="radio"
                          name="output_format"
                          value={format.id}
                          checked={draft.output_format === format.id}
                          disabled={!format.available}
                          onChange={() =>
                            updateDraft({ output_format: format.id as AppSettings['output_format'] })
                          }
                          className="mt-1"
                        />
                        <div>
                          <p className="font-medium text-slate-200">
                            {format.label}
                            {!format.available && (
                              <span className="ml-2 text-xs text-slate-500">(Coming soon)</span>
                            )}
                          </p>
                          <p className="mt-0.5 text-sm text-slate-500">{format.description}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                </Section>

                <Section
                  title="Output Location"
                  description="Where transcript exports are saved. Defaults to the app's data folder."
                >
                  <div className="flex items-center gap-2">
                    <div className="min-w-0 flex-1 truncate rounded-lg border border-surface-border bg-surface-overlay px-3 py-2 text-sm text-slate-300">
                      {draft.export_dir ?? 'Default (app data folder)'}
                    </div>
                    <button
                      onClick={handleChooseExportDir}
                      className="flex shrink-0 items-center gap-2 rounded-lg border border-surface-border px-3 py-2 text-sm text-slate-300 hover:bg-surface-overlay"
                    >
                      <FolderOpen className="h-4 w-4" />
                      Choose...
                    </button>
                    {draft.export_dir && (
                      <button
                        onClick={() => updateDraft({ export_dir: null })}
                        className="shrink-0 rounded-lg border border-surface-border px-3 py-2 text-sm text-slate-400 hover:bg-surface-overlay"
                      >
                        Reset
                      </button>
                    )}
                  </div>
                </Section>

                <Section title="Language" description="Leave on auto-detect or force a specific language.">
                  <select
                    value={draft.language ?? ''}
                    onChange={(e) =>
                      updateDraft({ language: e.target.value || null })
                    }
                    className="w-full rounded-lg border border-surface-border bg-surface-overlay px-3 py-2 text-sm text-slate-200"
                  >
                    {LANGUAGES.map((lang) => (
                      <option key={lang.value} value={lang.value}>
                        {lang.label}
                      </option>
                    ))}
                  </select>
                </Section>

                <Section title="Processing" description="Fine-tune transcription performance and quality.">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Device">
                      <select
                        value={draft.device}
                        onChange={(e) => updateDraft({ device: e.target.value })}
                        className="w-full rounded-lg border border-surface-border bg-surface-overlay px-3 py-2 text-sm text-slate-200"
                      >
                        <option value="auto">Auto (GPU if available)</option>
                        <option value="cpu">CPU only</option>
                        <option value="cuda">CUDA GPU</option>
                      </select>
                    </Field>
                    <Field label="Compute precision">
                      <select
                        value={draft.compute_type}
                        onChange={(e) => updateDraft({ compute_type: e.target.value })}
                        className="w-full rounded-lg border border-surface-border bg-surface-overlay px-3 py-2 text-sm text-slate-200"
                      >
                        <option value="int8">int8 (fastest, less RAM)</option>
                        <option value="float16">float16 (balanced)</option>
                        <option value="float32">float32 (highest precision)</option>
                      </select>
                    </Field>
                    <Field label="Beam size">
                      <input
                        type="number"
                        min={1}
                        max={10}
                        value={draft.beam_size}
                        onChange={(e) =>
                          updateDraft({ beam_size: Number(e.target.value) })
                        }
                        className="w-full rounded-lg border border-surface-border bg-surface-overlay px-3 py-2 text-sm text-slate-200"
                      />
                    </Field>
                    <Field label="Voice activity detection">
                      <label className="flex items-center gap-2 text-sm text-slate-300">
                        <input
                          type="checkbox"
                          checked={draft.vad_filter}
                          onChange={(e) => updateDraft({ vad_filter: e.target.checked })}
                        />
                        Skip silent sections (recommended)
                      </label>
                    </Field>
                    <Field label="Fast batched transcription (experimental)">
                      <label className="flex items-center gap-2 text-sm text-slate-300">
                        <input
                          type="checkbox"
                          checked={draft.fast_batched}
                          onChange={(e) => updateDraft({ fast_batched: e.target.checked })}
                        />
                        Up to 5x faster on CPU
                      </label>
                      <p className="mt-1 text-xs text-amber-400">
                        Off by default: in testing this dropped ~1 in 4 sentences on continuous,
                        low-pause speech (e.g. presentations, lectures) compared to zero errors
                        without it. Only enable for content you can spot-check, or short/casual
                        clips where a gap is low-stakes.
                      </p>
                    </Field>
                    <Field label="Speaker labels">
                      <label className="flex items-center gap-2 text-sm text-slate-300">
                        <input
                          type="checkbox"
                          checked={draft.enable_speaker_labels ?? true}
                          onChange={(e) =>
                            updateDraft({ enable_speaker_labels: e.target.checked })
                          }
                        />
                        Identify speakers and export a second labeled transcript
                      </label>
                      <p className="mt-1 text-xs text-slate-500">
                        Download diarization models in the Models tab before transcribing.
                      </p>
                    </Field>
                    {draft.enable_speaker_labels && (
                      <div className="grid gap-4 sm:grid-cols-2 sm:col-span-2">
                        <Field label="Min speakers (optional)">
                          <input
                            type="number"
                            min={1}
                            max={20}
                            value={draft.diarization_min_speakers ?? ''}
                            onChange={(e) =>
                              updateDraft({
                                diarization_min_speakers: e.target.value
                                  ? Number(e.target.value)
                                  : null
                              })
                            }
                            placeholder="Auto"
                            className="w-full rounded-lg border border-surface-border bg-surface-overlay px-3 py-2 text-sm text-slate-200"
                          />
                        </Field>
                        <Field label="Max speakers (optional)">
                          <input
                            type="number"
                            min={1}
                            max={20}
                            value={draft.diarization_max_speakers ?? ''}
                            onChange={(e) =>
                              updateDraft({
                                diarization_max_speakers: e.target.value
                                  ? Number(e.target.value)
                                  : null
                              })
                            }
                            placeholder="Auto"
                            className="w-full rounded-lg border border-surface-border bg-surface-overlay px-3 py-2 text-sm text-slate-200"
                          />
                        </Field>
                      </div>
                    )}
                  </div>
                </Section>

                <Section
                  title="Custom Vocabulary"
                  description="Names, acronyms, or jargon likely to appear — helps the model get tricky pronunciation right."
                >
                  <textarea
                    value={draft.vocabulary ?? ''}
                    onChange={(e) => updateDraft({ vocabulary: e.target.value || null })}
                    placeholder="e.g. Purplepatch, Salesforce, Accellor, CTranslate2, Whisper large-v3"
                    rows={3}
                    className="w-full resize-none rounded-lg border border-surface-border bg-surface-overlay px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600"
                  />
                </Section>
              </>
            )}

            {tab === 'models' && (
              <>
                <Section
                  title="Whisper Models"
                  description="Select the active model. Download before use — delete to free disk space and re-download anytime."
                >
                  <ModelSelector
                    models={models}
                    selectedModelId={draft.model}
                    onSelect={(id) => updateDraft({ model: id })}
                    onDownload={handleDownload}
                    onDelete={handleDeleteModel}
                    downloadStatus={downloadStatus}
                  />
                </Section>

                {draft.enable_speaker_labels && (
                  <Section
                    title="Speaker Diarization"
                    description="Download pyannote models before transcribing with speaker labels. Shows live progress during download."
                  >
                    <DiarizationModelCard
                      status={diarizationStatus}
                      downloadStatus={diarizationDownloadStatus}
                      huggingfaceToken={draft.huggingface_token ?? ''}
                      onTokenChange={(token) =>
                        updateDraft({ huggingface_token: token.trim() || null })
                      }
                      onDownload={handleDownloadDiarization}
                      onDelete={handleDeleteDiarization}
                    />
                  </Section>
                )}
              </>
            )}

            {tab === 'system' && systemInfo && (
              <>
                <div className="flex justify-end">
                  <button
                    onClick={() => loadAll()}
                    className="flex items-center gap-2 rounded-lg border border-surface-border px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Refresh
                  </button>
                </div>

                <Section
                  title="App Updates"
                  description="Manual: click Check for updates. Automatic: enable the toggles below to check and download in the background. A restart prompt appears when an update is ready."
                >
                  <AppUpdatePanel
                    autoCheckUpdates={draft.auto_check_updates ?? true}
                    autoDownloadUpdates={draft.auto_download_updates ?? true}
                    onAutoCheckChange={(enabled) =>
                      updateDraft({ auto_check_updates: enabled })
                    }
                    onAutoDownloadChange={(enabled) =>
                      updateDraft({ auto_download_updates: enabled })
                    }
                  />
                  <p className="mt-3 text-xs text-slate-500">
                    Save settings to apply auto-update preferences. Updates require a published
                    GitHub Release with built installers.
                  </p>
                </Section>

                <Section title="Application">
                  <InfoGrid
                    items={[
                      ['Version', systemInfo.app_version],
                      ['Active model', systemInfo.active_model],
                      ['Loaded in memory', systemInfo.model_in_memory ? 'Yes' : 'No'],
                      ['Device', systemInfo.device],
                      ['Compute type', systemInfo.compute_type],
                      ['GPU', systemInfo.gpu_name ?? 'Not available'],
                      ['Downloaded models', systemInfo.downloaded_models.join(', ') || 'None']
                    ]}
                  />
                </Section>

                <Section title="Memory" description="Real-time memory usage (updates every 2 seconds).">
                  <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <StatCard
                      icon={MemoryStick}
                      label="RAM Used"
                      value={formatMb(systemInfo.memory.ram_used_mb)}
                      sub={`of ${formatMb(systemInfo.memory.ram_total_mb)}`}
                    />
                    <StatCard
                      icon={MemoryStick}
                      label="RAM %"
                      value={formatPercent(systemInfo.memory.ram_percent)}
                    />
                    <StatCard
                      icon={Cpu}
                      label="CPU"
                      value={formatPercent(systemInfo.cpu_percent)}
                    />
                    <StatCard
                      icon={MemoryStick}
                      label="App Process"
                      value={formatMb(systemInfo.memory.process_memory_mb)}
                    />
                  </div>
                  <UsageBar
                    label="System RAM"
                    percent={systemInfo.memory.ram_percent}
                    detail={`${formatMb(systemInfo.memory.ram_used_mb)} / ${formatMb(systemInfo.memory.ram_total_mb)}`}
                  />
                </Section>

                <Section title="Disk Usage" description="Storage used by app data and models.">
                  <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                    <StatCard
                      icon={HardDrive}
                      label="Models"
                      value={formatMb(systemInfo.disk.models_mb)}
                    />
                    <StatCard
                      icon={HardDrive}
                      label="Exports"
                      value={formatMb(systemInfo.disk.exports_mb)}
                    />
                    <StatCard
                      icon={HardDrive}
                      label="Total App Data"
                      value={formatMb(systemInfo.disk.total_data_mb)}
                    />
                  </div>
                  <div className="space-y-2 text-sm">
                    <DiskRow label="Models" value={systemInfo.disk.models_mb} />
                    <DiskRow label="Exports" value={systemInfo.disk.exports_mb} />
                    <DiskRow label="Cache" value={systemInfo.disk.cache_mb} />
                    <DiskRow label="Database" value={systemInfo.disk.database_mb} />
                    <DiskRow label="Logs" value={systemInfo.disk.logs_mb} />
                    <DiskRow label="Temp" value={systemInfo.disk.temp_mb} />
                    <div className="mt-3 border-t border-surface-border pt-3 text-slate-400">
                      <p
                        className={clsx(
                          isDiskLow(systemInfo.disk.disk_free_mb, systemInfo.disk.disk_total_mb) &&
                            'font-medium text-amber-400'
                        )}
                      >
                        Free disk: {formatMb(systemInfo.disk.disk_free_mb)}
                        {isDiskLow(systemInfo.disk.disk_free_mb, systemInfo.disk.disk_total_mb) &&
                          ' — low disk space, free up storage before transcribing large files'}
                      </p>
                      <p className="mt-1 truncate text-xs text-slate-500">
                        Data: {systemInfo.data_dir}
                      </p>
                      <p className="truncate text-xs text-slate-500">
                        Models: {systemInfo.models_dir}
                      </p>
                    </div>
                  </div>
                </Section>
              </>
            )}
          </div>
        </div>
      </div>

      {settings && JSON.stringify(draft) !== JSON.stringify(settings) && (
        <div className="border-t border-amber-500/30 bg-amber-500/10 px-6 py-2 text-center text-sm text-amber-400">
          You have unsaved changes
        </div>
      )}
    </div>
  )
}

function Section({
  title,
  description,
  children
}: {
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-xl border border-surface-border bg-surface-raised p-5">
      <h3 className="text-sm font-semibold text-slate-200">{title}</h3>
      {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-slate-400">{label}</label>
      {children}
    </div>
  )
}

function InfoGrid({ items }: { items: [string, string][] }) {
  return (
    <dl className="grid gap-3 sm:grid-cols-2">
      {items.map(([label, value]) => (
        <div key={label} className="rounded-lg bg-surface-overlay px-3 py-2">
          <dt className="text-xs text-slate-500">{label}</dt>
          <dd className="mt-0.5 text-sm font-medium text-slate-200">{value}</dd>
        </div>
      ))}
    </dl>
  )
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  sub?: string
}) {
  return (
    <div className="rounded-lg border border-surface-border bg-surface-overlay p-3">
      <div className="mb-1 flex items-center gap-1.5 text-xs text-slate-500">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <p className="font-mono text-lg font-semibold text-slate-100">{value}</p>
      {sub && <p className="text-xs text-slate-500">{sub}</p>}
    </div>
  )
}

function UsageBar({
  label,
  percent,
  detail
}: {
  label: string
  percent: number
  detail: string
}) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs text-slate-400">
        <span>{label}</span>
        <span>{detail}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-surface-overlay">
        <div
          className="h-full rounded-full bg-accent transition-all duration-500"
          style={{ width: `${Math.min(percent, 100)}%` }}
        />
      </div>
    </div>
  )
}

function DiskRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between text-slate-400">
      <span>{label}</span>
      <span className="font-mono text-slate-300">{formatMb(value)}</span>
    </div>
  )
}