import { useCallback, useEffect, useState } from 'react'
import { Mic, Sparkles } from 'lucide-react'
import { api } from '@/lib/api'
import { ModelSelector } from '@/components/ModelSelector'
import type { ModelDownloadStatus, ModelWithStatus } from '@/types'

interface OnboardingModalProps {
  onComplete: () => void
}

export function OnboardingModal({ onComplete }: OnboardingModalProps) {
  const [models, setModels] = useState<ModelWithStatus[]>([])
  const [selectedModelId, setSelectedModelId] = useState('base')
  const [downloadStatus, setDownloadStatus] = useState<ModelDownloadStatus | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refreshModels = useCallback(async () => {
    const list = await api.getModels()
    setModels(list)
    const recommended = list.find((m) => m.id === 'base') ?? list[0]
    if (recommended && !list.some((m) => m.id === selectedModelId)) {
      setSelectedModelId(recommended.id)
    }
  }, [selectedModelId])

  useEffect(() => {
    refreshModels().catch((err) =>
      setError(err instanceof Error ? err.message : 'Failed to load models')
    )
  }, [refreshModels])

  useEffect(() => {
    if (downloadStatus?.status !== 'downloading') return

    const interval = setInterval(async () => {
      try {
        const status = await api.getModelDownloadStatus()
        setDownloadStatus(status)
        if (status.status === 'completed') {
          await refreshModels()
        }
        if (status.status === 'error') {
          setError(status.error ?? 'Download failed')
          await refreshModels()
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to check download status')
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [downloadStatus?.status, refreshModels])

  const handleDownload = async (modelId: string) => {
    setError(null)
    try {
      const status = await api.downloadModel(modelId)
      setDownloadStatus(status)
      setSelectedModelId(modelId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed')
    }
  }

  const handleContinue = async () => {
    const selected = models.find((m) => m.id === selectedModelId)
    if (!selected?.downloaded) {
      setError('Please download the selected model before continuing.')
      return
    }

    setSaving(true)
    setError(null)
    try {
      await api.updateSettings({
        model: selectedModelId,
        onboarding_complete: true
      })
      onComplete()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  const selectedReady = models.find((m) => m.id === selectedModelId)?.downloaded ?? false

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-surface-border bg-surface-raised shadow-2xl">
        <div className="border-b border-surface-border px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-100">Welcome to Purplepatch</h2>
              <p className="text-sm text-slate-400">
                Choose a Whisper model to download and use for offline transcription.
              </p>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          <div className="mb-4 rounded-lg border border-accent-muted/40 bg-accent-muted/20 p-3 text-sm text-slate-300">
            <div className="flex items-start gap-2">
              <Mic className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
              <p>
                Models are downloaded once and stored locally in the <code className="text-accent">models/</code>{' '}
                folder. You can change your model anytime in Settings.
              </p>
            </div>
          </div>

          <ModelSelector
            models={models}
            selectedModelId={selectedModelId}
            onSelect={setSelectedModelId}
            onDownload={handleDownload}
            downloadStatus={downloadStatus}
            compact
          />
        </div>

        {error && (
          <div className="border-t border-status-failed/30 bg-status-failed/10 px-6 py-2 text-sm text-status-failed">
            {error}
          </div>
        )}

        <div className="flex items-center justify-between border-t border-surface-border px-6 py-4">
          <p className="text-xs text-slate-500">
            {selectedReady
              ? `${selectedModelId} is ready to use`
              : 'Download a model to continue'}
          </p>
          <button
            onClick={handleContinue}
            disabled={!selectedReady || saving}
            className="rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Get Started'}
          </button>
        </div>
      </div>
    </div>
  )
}