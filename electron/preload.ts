import { contextBridge, ipcRenderer, type IpcRendererEvent, webUtils } from 'electron'
import type { UpdateStatusPayload } from './updater'

export type { UpdateStatusPayload }

export interface ElectronAPI {
  getApiBaseUrl: () => Promise<string>
  openFileDialog: () => Promise<string | null>
  openDirectoryDialog: () => Promise<string | null>
  getPathForFile: (file: File) => string
  openPath: (filePath: string) => Promise<string>
  showItemInFolder: (filePath: string) => Promise<void>
  platform: NodeJS.Platform
  getUpdateStatus: () => Promise<UpdateStatusPayload>
  checkForUpdates: () => Promise<UpdateStatusPayload>
  downloadUpdate: () => Promise<UpdateStatusPayload>
  installUpdate: () => Promise<void>
  configureUpdater: () => Promise<UpdateStatusPayload>
  onUpdateStatusChanged: (callback: (status: UpdateStatusPayload) => void) => () => void
  getEngineLogs: () => Promise<string[]>
  clearEngineLogs: () => Promise<void>
  onEngineLog: (callback: (line: string) => void) => () => void
}

const electronAPI: ElectronAPI = {
  getApiBaseUrl: () => ipcRenderer.invoke('api:getBaseUrl'),
  openFileDialog: () => ipcRenderer.invoke('dialog:openFile'),
  openDirectoryDialog: () => ipcRenderer.invoke('dialog:openDirectory'),
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
  openPath: (filePath: string) => ipcRenderer.invoke('shell:openPath', filePath),
  showItemInFolder: (filePath: string) => ipcRenderer.invoke('shell:showItemInFolder', filePath),
  platform: process.platform,
  getUpdateStatus: () => ipcRenderer.invoke('update:getStatus'),
  checkForUpdates: () => ipcRenderer.invoke('update:check'),
  downloadUpdate: () => ipcRenderer.invoke('update:download'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  configureUpdater: () => ipcRenderer.invoke('update:configure'),
  onUpdateStatusChanged: (callback) => {
    const handler = (_event: IpcRendererEvent, status: UpdateStatusPayload) => {
      callback(status)
    }
    ipcRenderer.on('update:status-changed', handler)
    return () => {
      ipcRenderer.removeListener('update:status-changed', handler)
    }
  },
  getEngineLogs: () => ipcRenderer.invoke('logs:get'),
  clearEngineLogs: () => ipcRenderer.invoke('logs:clear'),
  onEngineLog: (callback) => {
    const handler = (_event: IpcRendererEvent, line: string) => {
      callback(line)
    }
    ipcRenderer.on('logs:append', handler)
    return () => {
      ipcRenderer.removeListener('logs:append', handler)
    }
  }
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)