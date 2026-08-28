import type {
  AccountingState,
  AppState,
  Company,
  Seller,
  Store,
} from './types'

export function createId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`
}

export function createInitialState(companyId = createId('company')): AppState {
  return {
    schemaVersion: 2,
    company: {
      id: companyId,
      name: 'La tua azienda',
      taxId: '',
      locale: 'it',
    },
    stores: [],
    sellers: [],
    review: {
      pending: 0,
      unrecognized: 0,
      possibleDuplicates: 0,
    },
    financial: {
      invoiceValue: 0,
      theoreticalRevenue: 0,
      realTakings: 0,
      stockRevenue: 0,
    },
    dataSettings: {
      mode: 'local',
      language: 'it',
      driveBackupAfterApproval: true,
      imageRetentionDays: null,
    },
    accounting: createEmptyAccountingState(companyId),
    updatedAt: new Date().toISOString(),
  }
}

export function createEmptyAccountingState(companyId: string): AccountingState {
  return {
    companies: [
      {
        id: companyId,
        name: 'La tua azienda',
        taxId: '',
        city: '',
        notes: '',
        seasonEndDate: null,
      },
    ],
    activeCompanyId: companyId,
    invoices: [],
    takings: [],
    sellers: [],
    suppliers: [],
    rentals: [],
    accountantInvoices: [],
    expenses: [],
  }
}

export function createStoreWithSeller(input: {
  storeName: string
  city: string
  sellerName: string
  sellerPhone: string
}): { store: Store; seller: Seller } {
  const seller: Seller = {
    id: createId('seller'),
    name: input.sellerName.trim(),
    phone: input.sellerPhone.trim(),
    whatsappEnabled: true,
    viberEnabled: true,
  }
  const store: Store = {
    id: createId('store'),
    name: input.storeName.trim(),
    city: input.city.trim(),
    sellerId: seller.id,
  }
  return { store, seller }
}

export function updateCompany(company: Company, patch: Partial<Company>): Company {
  return { ...company, ...patch }
}
