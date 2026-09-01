export type UserRole = 'owner' | 'accountant'
export type DataMode = 'local' | 'cloud'
export type InterfaceLanguage = 'it' | 'ro' | 'en'
export type Locale = 'it' | 'ro' | 'en'
export type Currency = 'EUR' | 'MDL' | 'USD'
export type SyncState = 'idle' | 'saving' | 'saved' | 'error'
export type PaymentMethod =
  | 'Bonifico'
  | 'Contanti'
  | 'Carta'
  | 'Assegno'
  | 'Altro'
export type ExpenseType = 'tassa' | 'stipendio' | 'contabile' | 'altra'
export type ExpenseRecurrence = 'once' | 'monthly'
export type ProductPricingMode = 'sale-price' | 'markup' | 'manual'
export type ProductionEntryPeriod = 'day' | 'week'
export type ReviewDocumentStatus =
  | 'pending'
  | 'unrecognized'
  | 'possible-duplicate'
export type ReviewDocumentSource = 'whatsapp' | 'viber' | 'manual-upload'

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
  companyId: string
  accountingSellerId: string
  name: string
  phone: string
  viberUserId: string
  whatsappEnabled: boolean
  viberEnabled: boolean
}

export interface Store {
  id: string
  companyId: string
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
  language: InterfaceLanguage
  currency: Currency
  driveBackupAfterApproval: boolean
  driveFolder: string
  imageRetentionDays: number | null
}

export interface AccountingCompany {
  id: string
  name: string
  taxId: string
  city: string
  notes: string
  seasonEndDate: string | null
}

export interface InvoicePayment {
  id: string
  date: string
  amount: number
  method: PaymentMethod
}

export interface AccountingProduct {
  id: string
  companyId: string
  supplierId: string | null
  supplierName: string
  code: string
  name: string
  purchaseCostInclVat: number
  pricingMode: ProductPricingMode
  salePriceInclVat: number
  markupPercent: number
  notes: string
}

export interface InvoiceLine {
  id: string
  productId: string | null
  productCode: string
  description: string
  quantity: number
  unitPurchaseCostInclVat: number
  unitSalePriceInclVat: number
  purchaseTotalInclVat: number
  saleTotalInclVat: number
  markupPercent: number
}

export interface AccountingInvoice {
  id: string
  companyId: string
  number: string
  supplierId: string | null
  supplierName: string
  sellerId: string | null
  sellerName: string
  description: string
  category: string
  taxableAmount: number
  vat: number
  theoreticalRevenue: number
  total: number
  markupPercent: number
  lines: InvoiceLine[]
  date: string
  dueDate: string
  settled: boolean
  paidAmount: number
  payments: InvoicePayment[]
  paymentDate: string | null
  paymentMethod: PaymentMethod | null
}

export interface AccountingTaking {
  id: string
  companyId: string
  date: string
  sellerId: string | null
  sellerName: string
  cash: number
  pos: number
  withdrawal: number
  vat: number
  realTotal: number
}

export interface AccountingSeller {
  id: string
  companyId: string
  name: string
  email: string
  phone: string
  city: string
  notes: string
}

export interface AccountingSupplier {
  id: string
  companyId: string
  name: string
  taxId: string
  email: string
  phone: string
  city: string
  notes: string
  paymentTermsDays: number
}

export interface Rental {
  id: string
  companyId: string
  property: string
  tenant: string
  total: number
  vatRate: number
  taxableAmount: number
  vat: number
  date: string
  period: string
  settled: boolean
  paidAmount: number
  paymentDate: string | null
  paymentMethod: PaymentMethod | null
}

export interface AccountantInvoice {
  id: string
  companyId: string
  description: string
  number: string
  total: number
  vatRate: number
  taxableAmount: number
  vat: number
  date: string
  dueDate: string
  settled: boolean
  paidAmount: number
  paymentDate: string | null
  paymentMethod: PaymentMethod | null
}

export interface AccountingExpense {
  id: string
  companyId: string
  type: ExpenseType
  description: string
  sellerId: string | null
  sellerName: string
  amount: number
  date: string
  recurrence: ExpenseRecurrence
  recurrenceEndDate: string | null
  notes: string
  settled: boolean
}

export interface ProductionSettings {
  id: string
  companyId: string
  productName: string
  salePrice: number
  sellerIds: string[]
}

export interface ProductionEntry {
  id: string
  companyId: string
  productId: string
  period: ProductionEntryPeriod
  date: string
  quantity: number
}

export interface AccountingState {
  companies: AccountingCompany[]
  activeCompanyId: string | null
  invoices: AccountingInvoice[]
  takings: AccountingTaking[]
  sellers: AccountingSeller[]
  suppliers: AccountingSupplier[]
  products: AccountingProduct[]
  rentals: Rental[]
  accountantInvoices: AccountantInvoice[]
  expenses: AccountingExpense[]
  productionSettings: ProductionSettings[]
  productionEntries: ProductionEntry[]
}

export interface ReviewInvoiceSuggestion {
  number: string
  supplierId: string | null
  sellerId: string | null
  description: string
  taxableAmount: number
  vat: number
  theoreticalRevenue: number
  date: string
}

export interface ReviewDocument {
  id: string
  companyId: string
  source: ReviewDocumentSource
  senderName: string
  receivedAt: string
  status: ReviewDocumentStatus
  images: string[]
  suggestion: ReviewInvoiceSuggestion
}

export interface AppState {
  schemaVersion: 8
  company: Company
  stores: Store[]
  sellers: Seller[]
  review: ReviewSummary
  reviewDocuments: ReviewDocument[]
  financial: FinancialSummary
  dataSettings: DataSettings
  accounting: AccountingState
  updatedAt: string
}
