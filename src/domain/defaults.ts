import type {
  AccountingSeller,
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
    schemaVersion: 6,
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
    reviewDocuments: [],
    financial: {
      invoiceValue: 0,
      theoreticalRevenue: 0,
      realTakings: 0,
      stockRevenue: 0,
    },
    dataSettings: {
      mode: 'local',
      language: 'it',
      currency: 'EUR',
      driveBackupAfterApproval: true,
      driveFolder: '',
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
    products: [],
    rentals: [],
    accountantInvoices: [],
    expenses: [],
  }
}

export function createStoreWithSeller(input: {
  companyId: string
  storeName: string
  city: string
  sellerName: string
  sellerPhone: string
  sellerViberUserId: string
}): {
  store: Store
  seller: Seller
  accountingSeller: AccountingSeller
} {
  const sellerId = createId('seller')
  const seller: Seller = {
    id: sellerId,
    companyId: input.companyId,
    accountingSellerId: sellerId,
    name: input.sellerName.trim(),
    phone: input.sellerPhone.trim(),
    viberUserId: input.sellerViberUserId.trim(),
    whatsappEnabled: true,
    viberEnabled: true,
  }
  const store: Store = {
    id: createId('store'),
    companyId: input.companyId,
    name: input.storeName.trim(),
    city: input.city.trim(),
    sellerId: seller.id,
  }
  const accountingSeller: AccountingSeller = {
    id: sellerId,
    companyId: input.companyId,
    name: seller.name,
    email: '',
    phone: seller.phone,
    city: store.city,
    notes: `Responsabile del punto vendita ${store.name}`,
  }
  return { store, seller, accountingSeller }
}

export function updateCompany(company: Company, patch: Partial<Company>): Company {
  return { ...company, ...patch }
}
