import { createContext, useContext } from 'react'
import type {
  AppState,
  Company,
  DataMode,
  SyncState,
} from '../domain/types'

export interface NewStoreInput {
  storeName: string
  city: string
  sellerName: string
  sellerPhone: string
}

export interface AppStoreContextValue {
  state: AppState
  loading: boolean
  syncState: SyncState
  syncMessage: string | null
  cloudAvailable: boolean
  updateCompany: (patch: Partial<Company>) => void
  addStore: (input: NewStoreInput) => void
  removeStore: (storeId: string) => void
  setDataMode: (mode: DataMode) => Promise<void>
  setDriveBackup: (enabled: boolean) => void
  setImageRetention: (days: number | null) => void
}

export const AppStoreContext = createContext<AppStoreContextValue | null>(null)

export function useAppStore() {
  const value = useContext(AppStoreContext)
  if (!value) throw new Error('AppStoreProvider mancante')
  return value
}
