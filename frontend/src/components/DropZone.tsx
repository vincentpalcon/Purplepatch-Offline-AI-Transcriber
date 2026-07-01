import { useCallback, useRef, useState } from 'react'
import { Upload } from 'lucide-react'
import clsx from 'clsx'
import { filterMediaFilePaths } from '@/lib/media'

interface DropZoneProps {
  children: React.ReactNode
  disabled?: boolean
  onFilesDropped: (filePaths: string[]) => void
  onInvalidDrop?: () => void
}

export function DropZone({
  children,
  disabled = false,
  onFilesDropped,
  onInvalidDrop
}: DropZoneProps) {
  const [isDragging, setIsDragging] = useState(false)
  const dragDepthRef = useRef(0)

  const handleDragEnter = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault()
      event.stopPropagation()
      if (disabled) return
      dragDepthRef.current += 1
      if (dragDepthRef.current === 1) setIsDragging(true)
    },
    [disabled]
  )

  const handleDragLeave = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    event.stopPropagation()
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)
    if (dragDepthRef.current === 0) setIsDragging(false)
  }, [])

  const handleDragOver = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault()
      event.stopPropagation()
      if (!disabled) {
        event.dataTransfer.dropEffect = 'copy'
      }
    },
    [disabled]
  )

  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault()
      event.stopPropagation()
      dragDepthRef.current = 0
      setIsDragging(false)

      if (disabled) return

      const paths: string[] = []
      for (const file of Array.from(event.dataTransfer.files)) {
        try {
          const filePath = window.electronAPI.getPathForFile(file)
          if (filePath) paths.push(filePath)
        } catch {
          // Skip files we cannot resolve to a local path
        }
      }

      const mediaPaths = filterMediaFilePaths(paths)
      if (mediaPaths.length > 0) {
        onFilesDropped(mediaPaths)
      } else if (paths.length > 0) {
        onInvalidDrop?.()
      }
    },
    [disabled, onFilesDropped, onInvalidDrop]
  )

  return (
    <div
      className="relative min-h-0 flex-1"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {children}

      {isDragging && !disabled && (
        <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center bg-accent/10 backdrop-blur-[1px]">
          <div
            className={clsx(
              'flex flex-col items-center rounded-2xl border-2 border-dashed border-accent',
              'bg-surface-raised/95 px-10 py-8 shadow-2xl'
            )}
          >
            <Upload className="mb-3 h-10 w-10 text-accent" />
            <p className="text-lg font-semibold text-slate-100">Drop media files here</p>
            <p className="mt-1 text-sm text-slate-400">Release to add to the transcription queue</p>
          </div>
        </div>
      )}
    </div>
  )
}