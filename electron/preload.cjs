const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('desktopApp', {
  platform: process.platform,
  loadLocalState: (companyId) =>
    ipcRenderer.invoke('local-state:load', companyId),
  saveLocalState: (companyId, content) =>
    ipcRenderer.invoke('local-state:save', companyId, content),
  deleteLocalState: (companyId) =>
    ipcRenderer.invoke('local-state:delete', companyId),
  getLocalStatePaths: (accountId, activeCompanyId) =>
    ipcRenderer.invoke('local-state:paths', accountId, activeCompanyId),
  selectDriveBackupFolder: () =>
    ipcRenderer.invoke('drive-backup:select-folder'),
  saveDriveBackup: (folderPath, filename, content) =>
    ipcRenderer.invoke('drive-backup:save', folderPath, filename, content),
})
