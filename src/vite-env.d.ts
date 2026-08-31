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
    ) => Promise<{ workspace: string; company: string }>
    selectDriveBackupFolder: () => Promise<string | null>
    saveDriveBackup: (
      folderPath: string,
      filename: string,
      content: string,
    ) => Promise<string>
  }
}
