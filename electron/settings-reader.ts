import { app } from 'electron'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'

export interface LocalAppSettings {
  auto_check_updates?: boolean
  auto_download_updates?: boolean
}

export function readLocalAppSettings(): LocalAppSettings {
  const settingsPath = join(app.getPath('userData'), 'settings.json')
  if (!existsSync(settingsPath)) {
    return {}
  }

  try {
    return JSON.parse(readFileSync(settingsPath, 'utf-8')) as LocalAppSettings
  } catch {
    return {}
  }
}

export function shouldAutoCheckUpdates(): boolean {
  const settings = readLocalAppSettings()
  return settings.auto_check_updates !== false
}

export function shouldAutoDownloadUpdates(): boolean {
  const settings = readLocalAppSettings()
  return settings.auto_download_updates !== false
}