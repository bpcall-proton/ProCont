import { createContext, useContext } from 'react'
import type {
  AccountingState,
  AppState,
  Company,
  DataMode,
  InterfaceLanguage,
  SyncState,
} from '../domain/types'

export interface NewStoreInput {
  companyId: string
  storeName: string
  city: string
  sellerName: string
  sellerPhone: string
  sellerViberUserId: string
}

export interface AppStoreContextValue {
  state: AppState
  loading: boolean
  syncState: SyncState
  syncMessage: string | null
  cloudAvailable: boolean
  updateCompany: (patch: Partial<Company>) => void
  addStore: (input: NewStoreInput) => { ok: boolean; error?: string }
  setSellerViberUserId: (
    sellerId: string,
    viberUserId: string,
  ) => { ok: boolean; error?: string }
  removeStore: (storeId: string) => void
  setDataMode: (mode: DataMode) => Promise<void>
  setDriveBackup: (enabled: boolean) => void
  setDriveFolder: (folder: string) => void
  setImageRetention: (days: number | null) => void
  setLanguage: (language: InterfaceLanguage) => void
  updateAccounting: (
    updater: (accounting: AccountingState) => AccountingState,
  ) => void
  importLegacyData: (json: string) => { ok: boolean; error?: string }
  exportUnifiedData: () => string
  exportLegacyData: () => string
}

export const AppStoreContext = createContext<AppStoreContextValue | null>(null)

export function useAppStore() {
  const value = useContext(AppStoreContext)
  if (!value) throw new Error('AppStoreProvider mancante')
  return value
}
