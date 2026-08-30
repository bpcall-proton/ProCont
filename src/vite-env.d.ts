/// <reference types="vite/client" />

interface Window {
  desktopApp?: {
    platform: string
    loadLocalState: (companyId: string) => Promise<string | null>
    saveLocalState: (companyId: string, content: string) => Promise<void>
    deleteLocalState: (companyId: string) => Promise<void>
  }
}
