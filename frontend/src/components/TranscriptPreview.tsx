interface TranscriptPreviewProps {
  text: string
}

export function TranscriptPreview({ text }: TranscriptPreviewProps) {
  return (
    <div className="rounded-xl border border-surface-border bg-surface-raised">
      <div className="border-b border-surface-border px-4 py-3">
        <h3 className="text-sm font-semibold text-slate-300">Live Transcript</h3>
      </div>
      <div className="max-h-64 overflow-y-auto p-4">
        {text ? (
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-300">{text}</p>
        ) : (
          <p className="text-sm italic text-slate-500">
            Transcript will appear here as processing begins...
          </p>
        )}
      </div>
    </div>
  )
}