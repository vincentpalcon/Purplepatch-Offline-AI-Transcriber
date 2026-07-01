import { contextBridge, ipcRenderer, webUtils } from 'electron'

export interface ElectronAPI {
  getApiBaseUrl: () => Promise<string>
  openFileDialog: () => Promise<string | null>
  getPathForFile: (file: File) => string
  openPath: (filePath: string) => Promise<string>
  showItemInFolder: (filePath: string) => Promise<void>
  platform: NodeJS.Platform
}

const electronAPI: ElectronAPI = {
  getApiBaseUrl: () => ipcRenderer.invoke('api:getBaseUrl'),
  openFileDialog: () => ipcRenderer.invoke('dialog:openFile'),
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
  openPath: (filePath: string) => ipcRenderer.invoke('shell:openPath', filePath),
  showItemInFolder: (filePath: string) => ipcRenderer.invoke('shell:showItemInFolder', filePath),
  platform: process.platform
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)