import { normalizeSystemStats } from '@/lib/system'
import type {
  ActivityLogEntry,
  AppSettings,
  CreateJobRequest,
  ModelDownloadStatus,
  ModelWithStatus,
  OutputFormatOption,
  SystemInfo,
  SystemStats,
  TranscriptionJob,
  UpdateSettingsRequest
} from '@/types'

let baseUrl: string | null = null

async function getBaseUrl(): Promise<string> {
  if (baseUrl) return baseUrl
  baseUrl = await window.electronAPI.getApiBaseUrl()
  return baseUrl
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${await getBaseUrl()}${path}`
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options
  })

  if (!response.ok) {
    const body = await response.json().catch(() => ({ detail: response.statusText }))
    throw new Error(body.detail ?? `Request failed: ${response.status}`)
  }

  return response.json()
}

export const api = {
  health: () => request<{ status: string; version: string }>('/health'),

  listJobs: () => request<TranscriptionJob[]>('/jobs'),

  getJob: (id: string) => request<TranscriptionJob>(`/jobs/${id}`),

  createJob: (data: CreateJobRequest) =>
    request<TranscriptionJob>('/jobs', {
      method: 'POST',
      body: JSON.stringify(data)
    }),

  pauseJob: (id: string) => request<TranscriptionJob>(`/jobs/${id}/pause`, { method: 'POST' }),

  resumeJob: (id: string) => request<TranscriptionJob>(`/jobs/${id}/resume`, { method: 'POST' }),

  cancelJob: (id: string) => request<TranscriptionJob>(`/jobs/${id}/cancel`, { method: 'POST' }),

  retryJob: (id: string) => request<TranscriptionJob>(`/jobs/${id}/retry`, { method: 'POST' }),

  getActivityLog: (jobId?: string) =>
    request<ActivityLogEntry[]>(jobId ? `/activity?job_id=${jobId}` : '/activity'),

  getSystemStats: async () =>
    normalizeSystemStats(await request<Partial<SystemStats>>('/system/stats')),

  getSettings: () => request<AppSettings>('/settings/'),

  updateSettings: (data: UpdateSettingsRequest) =>
    request<AppSettings>('/settings/', {
      method: 'PUT',
      body: JSON.stringify(data)
    }),

  getModels: () => request<ModelWithStatus[]>('/settings/models'),

  downloadModel: (modelId: string) =>
    request<ModelDownloadStatus>(`/settings/models/${modelId}/download`, { method: 'POST' }),

  getModelDownloadStatus: () =>
    request<ModelDownloadStatus>('/settings/models/download-status'),

  getOutputFormats: () => request<OutputFormatOption[]>('/settings/output-formats'),

  getSystemInfo: () => request<SystemInfo>('/settings/system-info')
}