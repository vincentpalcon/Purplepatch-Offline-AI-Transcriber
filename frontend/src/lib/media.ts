const MEDIA_EXTENSIONS = new Set([
  'mp3',
  'wav',
  'm4a',
  'flac',
  'ogg',
  'mp4',
  'mkv',
  'mov',
  'avi',
  'webm'
])

export function isMediaFilePath(filePath: string): boolean {
  const ext = filePath.split('.').pop()?.toLowerCase()
  return ext ? MEDIA_EXTENSIONS.has(ext) : false
}

export function filterMediaFilePaths(filePaths: string[]): string[] {
  return filePaths.filter(isMediaFilePath)
}

export const MEDIA_EXTENSIONS_LABEL =
  'MP3, WAV, M4A, FLAC, OGG, MP4, MKV, MOV, AVI, WEBM'