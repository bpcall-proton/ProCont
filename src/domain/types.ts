export type UserRole = 'owner' | 'accountant'
export type DataMode = 'local' | 'cloud'
export type Locale = 'it' | 'ro' | 'en'
export type SyncState = 'idle' | 'saving' | 'saved' | 'error'

export interface SessionUser {
  id: string
  companyId: string
  email: string
  role: UserRole
  preview: boolean
}

export interface Company {
  id: string
  name: string
  taxId: string
  locale: Locale
}

export interface Seller {
  id: string
  name: string
  phone: string
  whatsappEnabled: boolean
  viberEnabled: boolean
}

export interface Store {
  id: string
  name: string
  city: string
  sellerId: string
}

export interface ReviewSummary {
  pending: number
  unrecognized: number
  possibleDuplicates: number
}

export interface FinancialSummary {
  invoiceValue: number
  theoreticalRevenue: number
  realTakings: number
  stockRevenue: number
}

export interface DataSettings {
  mode: DataMode
  driveBackupAfterApproval: boolean
  imageRetentionDays: number | null
}

export interface AppState {
  schemaVersion: 1
  company: Company
  stores: Store[]
  sellers: Seller[]
  review: ReviewSummary
  financial: FinancialSummary
  dataSettings: DataSettings
  updatedAt: string
}
