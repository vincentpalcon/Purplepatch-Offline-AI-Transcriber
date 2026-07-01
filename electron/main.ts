import { app, BrowserWindow, dialog, ipcMain, nativeImage, shell } from 'electron'
import { join } from 'path'
import { PythonManager } from './python-manager'
import { AppUpdater } from './updater'

const pythonManager = new PythonManager()
const appUpdater = new AppUpdater()
let mainWindow: BrowserWindow | null = null

const isDev = !app.isPackaged
const iconPath = join(__dirname, '../../build/icon.png')

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    icon: isDev ? iconPath : undefined,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: process.platform === 'darwin' ? { x: 16, y: 18 } : undefined,
    backgroundColor: '#0f1117',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  appUpdater.setWindow(mainWindow)

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  if (isDev && process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
    appUpdater.setWindow(null)
  })
}

function registerIpcHandlers(): void {
  ipcMain.handle('api:getBaseUrl', () => pythonManager.baseUrl)

  ipcMain.handle('dialog:openFile', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: 'Select media file',
      properties: ['openFile'],
      filters: [
        {
          name: 'Media',
          extensions: ['mp3', 'wav', 'm4a', 'flac', 'ogg', 'mp4', 'mkv', 'mov', 'avi', 'webm']
        },
        { name: 'All Files', extensions: ['*'] }
      ]
    })

    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle('dialog:openDirectory', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: 'Choose export folder',
      properties: ['openDirectory', 'createDirectory']
    })

    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle('shell:openPath', async (_event, filePath: string) => {
    return shell.openPath(filePath)
  })

  ipcMain.handle('shell:showItemInFolder', async (_event, filePath: string) => {
    shell.showItemInFolder(filePath)
  })

  ipcMain.handle('update:getStatus', () => appUpdater.getStatus())
  ipcMain.handle('update:check', () => appUpdater.checkForUpdates(true))
  ipcMain.handle('update:download', () => appUpdater.downloadUpdate())
  ipcMain.handle('update:install', () => appUpdater.installUpdate())
  ipcMain.handle('update:configure', () => {
    appUpdater.configureFromSettings()
    return appUpdater.getStatus()
  })

  ipcMain.handle('logs:get', () => pythonManager.getLogs())
  ipcMain.handle('logs:clear', () => {
    pythonManager.clearLogs()
  })
}

app.whenReady().then(async () => {
  if (isDev && process.platform === 'darwin') {
    app.dock?.setIcon(nativeImage.createFromPath(iconPath))
  }

  try {
    pythonManager.onLog((line) => {
      mainWindow?.webContents.send('logs:append', line)
    })

    await pythonManager.start()
    registerIpcHandlers()
    createWindow()
    appUpdater.scheduleAutoCheck()

    // Only wired up once the backend is actually running: on macOS, launching
    // the raw Electron binary (dev mode) can fire a spurious 'activate' event
    // right after startup. Registering this unconditionally meant a failed
    // pythonManager.start() could still end up opening a window with no
    // backend behind it, bypassing the error dialog above entirely.
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow()
      }
    })
  } catch (error) {
    console.error('Failed to start application:', error)
    const detail = error instanceof Error ? error.message : String(error)
    const hint = isDev
      ? 'Run "npm run backend:setup" first if you have not already.'
      : `Details were saved to backend-startup.log in the app's data folder (${app.getPath('userData')}).`
    dialog.showErrorBox(
      'Startup Error',
      `Could not start the local transcription engine.\n\n${detail}\n\n${hint}`
    )
    app.quit()
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  pythonManager.stop()
})