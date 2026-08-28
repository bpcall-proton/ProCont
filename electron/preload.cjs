const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('desktopApp', {
  platform: process.platform,
  loadLocalState: (companyId) =>
    ipcRenderer.invoke('local-state:load', companyId),
  saveLocalState: (companyId, content) =>
    ipcRenderer.invoke('local-state:save', companyId, content),
})
