import { app, BrowserWindow } from 'electron'
import { autoUpdater } from 'electron-updater'

import { shouldAutoCheckUpdates, shouldAutoDownloadUpdates } from './settings-reader'

export type UpdateState =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error'
  | 'dev'

export interface UpdateStatusPayload {
  state: UpdateState
  currentVersion: string
  latestVersion: string | null
  progressPercent: number
  transferredMb: number | null
  totalMb: number | null
  message: string
  error: string | null
}

const AUTO_CHECK_DELAY_MS = 8_000

export class AppUpdater {
  private window: BrowserWindow | null = null
  private status: UpdateStatusPayload
  private checkTimeout: ReturnType<typeof setTimeout> | null = null
  private manualCheckActive = false

  constructor() {
    this.status = this.createStatus('idle', 'Ready to check for updates.')

    autoUpdater.logger = {
      info: (...args: unknown[]) => console.log('[updater]', ...args),
      warn: (...args: unknown[]) => console.warn('[updater]', ...args),
      error: (...args: unknown[]) => console.error('[updater]', ...args),
      debug: (...args: unknown[]) => console.debug('[updater]', ...args)
    }
    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = true
    autoUpdater.allowDowngrade = false

    autoUpdater.on('checking-for-update', () => {
      this.setStatus(this.createStatus('checking', 'Checking for updates...'))
    })

    autoUpdater.on('update-available', (info) => {
      const version = info.version ?? null
      this.setStatus(
        this.createStatus(
          'available',
          `Update available: v${version ?? 'unknown'}`,
          version
        )
      )

      if (shouldAutoDownloadUpdates() || this.manualCheckActive) {
        void this.downloadUpdate()
      }
    })

    autoUpdater.on('update-not-available', (info) => {
      this.setStatus(
        this.createStatus(
          'not-available',
          `You're on the latest version (v${info.version ?? app.getVersion()}).`,
          info.version ?? null
        )
      )
    })

    autoUpdater.on('download-progress', (progress) => {
      const percent = progress.percent ?? 0
      const transferredMb = progress.transferred / (1024 * 1024)
      const totalMb = progress.total > 0 ? progress.total / (1024 * 1024) : null

      this.setStatus({
        ...this.status,
        state: 'downloading',
        progressPercent: Math.round(percent * 10) / 10,
        transferredMb: Math.round(transferredMb * 10) / 10,
        totalMb: totalMb ? Math.round(totalMb * 10) / 10 : null,
        message: `Downloading update... ${percent.toFixed(0)}%`,
        error: null
      })
    })

    autoUpdater.on('update-downloaded', (info) => {
      this.setStatus(
        this.createStatus(
          'downloaded',
          `Update v${info.version ?? 'unknown'} downloaded. Restart to install.`,
          info.version ?? null
        )
      )
    })

    autoUpdater.on('error', (error) => {
      const message = error.message || 'Update check failed.'
      this.setStatus({
        ...this.createStatus('error', message),
        error: message
      })
    })
  }

  setWindow(window: BrowserWindow | null): void {
    this.window = window
  }

  getStatus(): UpdateStatusPayload {
    return this.status
  }

  configureFromSettings(): void {
    autoUpdater.autoDownload = shouldAutoDownloadUpdates()
  }

  scheduleAutoCheck(): void {
    if (!app.isPackaged) {
      this.setStatus(
        this.createStatus('dev', 'Updates are available only in installed builds.')
      )
      return
    }

    if (!shouldAutoCheckUpdates()) {
      this.setStatus(this.createStatus('idle', 'Automatic update checks are disabled.'))
      return
    }

    this.configureFromSettings()

    if (this.checkTimeout) {
      clearTimeout(this.checkTimeout)
    }

    this.checkTimeout = setTimeout(() => {
      void this.checkForUpdates(false)
    }, AUTO_CHECK_DELAY_MS)
  }

  async checkForUpdates(manual: boolean): Promise<UpdateStatusPayload> {
    if (!app.isPackaged) {
      const devStatus = this.createStatus(
        'dev',
        'Install the packaged app to receive updates from GitHub Releases.'
      )
      this.setStatus(devStatus)
      return devStatus
    }

    this.configureFromSettings()
    this.manualCheckActive = manual

    try {
      await autoUpdater.checkForUpdates()
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to check for updates.'
      const errorStatus = {
        ...this.createStatus('error', manual ? message : 'Background update check failed.'),
        error: message
      }
      this.setStatus(errorStatus)
      return errorStatus
    } finally {
      this.manualCheckActive = false
    }

    return this.status
  }

  async downloadUpdate(): Promise<UpdateStatusPayload> {
    if (!app.isPackaged) {
      return this.getStatus()
    }

    try {
      await autoUpdater.downloadUpdate()
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to download update.'
      this.setStatus({
        ...this.createStatus('error', message),
        error: message
      })
    }

    return this.status
  }

  async installUpdate(): Promise<void> {
    if (!app.isPackaged || this.status.state !== 'downloaded') {
      return
    }

    autoUpdater.quitAndInstall()
  }

  private createStatus(
    state: UpdateState,
    message: string,
    latestVersion: string | null = null
  ): UpdateStatusPayload {
    return {
      state,
      currentVersion: app.getVersion(),
      latestVersion,
      progressPercent: 0,
      transferredMb: null,
      totalMb: null,
      message,
      error: null
    }
  }

  private setStatus(status: UpdateStatusPayload): void {
    this.status = status
    this.window?.webContents.send('update:status-changed', status)
  }
}