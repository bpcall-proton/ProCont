/// <reference types="vite/client" />

interface Window {
  desktopApp?: {
    platform: string
    loadLocalState: (companyId: string) => Promise<string | null>
    saveLocalState: (companyId: string, content: string) => Promise<void>
    deleteLocalState: (companyId: string) => Promise<void>
    getLocalStatePaths: (
      accountId: string,
      activeCompanyId: string,
    ) => Promise<{ workspace: string; company: string; backup: string }>
    openBackupDirectory: () => Promise<string | null>
    backupLocalStates: () => Promise<{ directory: string; files: number }>
    getDriveDataFolder: () => Promise<string | null>
    selectDriveDataFolder: () => Promise<string | null>
    openDriveDataFolder: () => Promise<string | null>
    loadDriveState: (storageId: string) => Promise<string | null>
    saveDriveState: (storageId: string, content: string) => Promise<void>
    selectDriveBackupFolder: () => Promise<string | null>
    saveDriveBackup: (
      folderPath: string,
      filename: string,
      content: string,
    ) => Promise<string>
  }
  showDirectoryPicker?: (options?: {
    mode?: 'read' | 'readwrite'
  }) => Promise<FileSystemDirectoryHandle>
}

interface FileSystemDirectoryHandle {
  queryPermission: (options?: {
    mode?: 'read' | 'readwrite'
  }) => Promise<PermissionState>
  requestPermission: (options?: {
    mode?: 'read' | 'readwrite'
  }) => Promise<PermissionState>
}
