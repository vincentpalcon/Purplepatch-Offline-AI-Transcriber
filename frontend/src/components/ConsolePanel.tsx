import { useEffect, useRef } from 'react'
import { Copy, Trash2, X } from 'lucide-react'

interface ConsolePanelProps {
  lines: string[]
  onClear: () => void
  onClose: () => void
}

export function ConsolePanel({ lines, onClear, onClose }: ConsolePanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [lines])

  const handleCopy = async () => {
    if (!lines.length) return
    try {
      await navigator.clipboard.writeText(lines.join('\n'))
    } catch {
      // Clipboard may be unavailable in some contexts
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#0a0c10]">
      <div className="flex shrink-0 items-center justify-between border-b border-surface-border px-4 py-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-300">Engine Console</h3>
          <p className="text-[11px] text-slate-500">
            Backend stdout and stderr — useful for diagnosing download or transcription errors
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleCopy}
            disabled={!lines.length}
            className="rounded-lg p-2 text-slate-400 hover:bg-surface-overlay hover:text-slate-200 disabled:opacity-40"
            title="Copy all logs"
          >
            <Copy className="h-4 w-4" />
          </button>
          <button
            onClick={onClear}
            className="rounded-lg p-2 text-slate-400 hover:bg-surface-overlay hover:text-slate-200"
            title="Clear console"
          >
            <Trash2 className="h-4 w-4" />
          </button>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-surface-overlay hover:text-slate-200"
            title="Close console"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto p-3 font-mono text-xs leading-relaxed">
        {lines.length === 0 ? (
          <p className="text-slate-600">No engine output yet.</p>
        ) : (
          lines.map((line, index) => (
            <div key={`${index}-${line.slice(0, 24)}`} className="whitespace-pre-wrap break-all text-slate-400">
              {line}
            </div>
          ))
        )}
      </div>
    </div>
  )
}