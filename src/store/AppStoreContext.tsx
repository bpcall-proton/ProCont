import { createContext, useContext } from 'react'
import type {
  AccountingCompany,
  AccountingState,
  AppState,
  Company,
  DataMode,
  InterfaceLanguage,
  ReviewDocument,
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

export type AccountingCompanyInput = Omit<AccountingCompany, 'id'>

export interface AppStoreContextValue {
  state: AppState
  loading: boolean
  syncState: SyncState
  syncMessage: string | null
  cloudAvailable: boolean
  updateCompany: (patch: Partial<Company>) => void
  setActiveAccountingCompany: (companyId: string) => void
  addAccountingCompany: (
    input: AccountingCompanyInput,
  ) => { ok: boolean; error?: string }
  updateAccountingCompany: (
    companyId: string,
    input: AccountingCompanyInput,
  ) => { ok: boolean; error?: string }
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
  updateReviewDocuments: (
    updater: (documents: ReviewDocument[]) => ReviewDocument[],
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
