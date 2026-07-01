export function formatMb(mb?: number | null): string {
  if (mb == null || Number.isNaN(mb)) return '—'
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`
  return `${mb.toFixed(1)} MB`
}

export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`
}