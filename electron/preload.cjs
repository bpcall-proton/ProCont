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
  openBackupDirectory: () =>
    ipcRenderer.invoke('local-state:open-backup-directory'),
  backupLocalStates: () =>
    ipcRenderer.invoke('local-state:backup-now'),
  getDriveDataFolder: () =>
    ipcRenderer.invoke('drive-data:get-folder'),
  selectDriveDataFolder: () =>
    ipcRenderer.invoke('drive-data:select-folder'),
  openDriveDataFolder: () =>
    ipcRenderer.invoke('drive-data:open-folder'),
  loadDriveState: (storageId) =>
    ipcRenderer.invoke('drive-data:load', storageId),
  saveDriveState: (storageId, content) =>
    ipcRenderer.invoke('drive-data:save', storageId, content),
  selectDriveBackupFolder: () =>
    ipcRenderer.invoke('drive-backup:select-folder'),
  saveDriveBackup: (folderPath, filename, content) =>
    ipcRenderer.invoke('drive-backup:save', folderPath, filename, content),
})
