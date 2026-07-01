import type { SystemStats } from '@/types'

export function normalizeSystemStats(raw: Partial<SystemStats>): SystemStats {
  return {
    cpu_percent: raw.cpu_percent ?? 0,
    ram_percent: raw.ram_percent ?? 0,
    ram_used_mb: raw.ram_used_mb ?? 0,
    ram_total_mb: raw.ram_total_mb ?? 0,
    disk_used_percent: raw.disk_used_percent ?? 0,
    disk_free_mb: raw.disk_free_mb ?? 0,
    disk_total_mb: raw.disk_total_mb ?? 0,
    gpu_percent: raw.gpu_percent ?? null,
    gpu_name: raw.gpu_name ?? null
  }
}

export function hasRamDetails(stats: SystemStats): boolean {
  return stats.ram_total_mb > 0
}

export function hasDiskDetails(stats: SystemStats): boolean {
  return stats.disk_total_mb > 0
}