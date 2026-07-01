export type JobStatus = 'queued' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled'

export type PipelineStage =
  | 'metadata'
  | 'streaming'
  | 'vad'
  | 'diarization'
  | 'chunking'
  | 'transcription'
  | 'alignment'
  | 'merge'
  | 'export'

export type StageState = 'completed' | 'running' | 'waiting' | 'failed'

export interface JobProgress {
  overall_percent: number
  current_stage: PipelineStage
  current_chunk: number
  total_chunks: number
  eta_seconds: number | null
  elapsed_seconds: number
  current_speaker: string | null
  speed_rtf: number | null
  live_transcript: string
}

export interface SystemStats {
  cpu_percent: number
  ram_percent: number
  ram_used_mb: number
  ram_total_mb: number
  disk_used_percent: number
  disk_free_mb: number
  disk_total_mb: number
  gpu_percent: number | null
  gpu_name: string | null
  device: string
}

export interface TranscriptionJob {
  id: string
  file_path: string
  file_name: string
  status: JobStatus
  created_at: string
  updated_at: string
  progress: JobProgress
  error_message: string | null
  export_path: string | null
}

export interface ActivityLogEntry {
  id: string
  job_id: string
  timestamp: string
  level: 'info' | 'warn' | 'error' | 'success'
  message: string
}

export interface CreateJobRequest {
  file_path: string
  model?: string
  language?: string
}

export type OutputFormat = 'txt' | 'srt' | 'vtt' | 'json'

export interface AppSettings {
  model: string
  output_format: OutputFormat
  language: string | null
  device: string
  compute_type: string
  beam_size: number
  vad_filter: boolean
  onboarding_complete: boolean
}

export interface UpdateSettingsRequest {
  model?: string
  output_format?: OutputFormat
  language?: string | null
  device?: string
  compute_type?: string
  beam_size?: number
  vad_filter?: boolean
  onboarding_complete?: boolean
}

export interface ModelInfo {
  id: string
  name: string
  description: string
  size_mb: number
  speed: string
  accuracy: string
  recommended_vram_mb: number
}

export interface ModelWithStatus extends ModelInfo {
  downloaded: boolean
  is_active: boolean
  local_size_mb: number | null
}

export interface ModelDownloadStatus {
  status: 'idle' | 'downloading' | 'completed' | 'error'
  model_id: string | null
  progress_percent: number
  message: string
  error: string | null
}

export interface OutputFormatOption {
  id: string
  label: string
  available: boolean
  description: string
}

export interface DiskUsageInfo {
  models_mb: number
  exports_mb: number
  cache_mb: number
  database_mb: number
  logs_mb: number
  temp_mb: number
  total_data_mb: number
  disk_free_mb: number
  disk_total_mb: number
}

export interface MemoryInfo {
  ram_used_mb: number
  ram_total_mb: number
  ram_percent: number
  process_memory_mb: number
}

export interface SystemInfo {
  app_version: string
  data_dir: string
  models_dir: string
  active_model: string
  loaded_model: string | null
  model_in_memory: boolean
  downloaded_models: string[]
  device: string
  compute_type: string
  gpu_name: string | null
  disk: DiskUsageInfo
  memory: MemoryInfo
  cpu_percent: number
}