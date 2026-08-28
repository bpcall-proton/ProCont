import type {
  AccountingInvoice,
  AccountingState,
  AccountingTaking,
} from './types'

export const paymentMethods = [
  'Bonifico',
  'Contanti',
  'Carta',
  'Assegno',
  'Altro',
] as const

export const expenseCategories = [
  'Utenze',
  'Acquisti',
  'Servizi',
  'Affitti',
  'Tasse',
  'Stipendi',
  'Altro',
]

export function today() {
  return new Date().toISOString().slice(0, 10)
}

export function addDays(iso: string, days: number) {
  const date = new Date(`${iso}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

export function money(value: number) {
  return new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
  }).format(value)
}

export function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

export function splitVat(total: number, rate: number) {
  const taxableAmount = rate > 0 ? total / (1 + rate / 100) : total
  return {
    taxableAmount: roundMoney(taxableAmount),
    vat: roundMoney(total - taxableAmount),
  }
}

export function officialTaking(taking: AccountingTaking) {
  return taking.cash + taking.pos
}

export function realTaking(taking: AccountingTaking) {
  return taking.realTotal > 0 ? taking.realTotal : officialTaking(taking)
}

export function undeclaredTaking(taking: AccountingTaking) {
  return Math.max(0, realTaking(taking) - officialTaking(taking))
}

export function invoiceRemaining(invoice: AccountingInvoice) {
  return roundMoney(
    Math.max(0, invoice.total - (invoice.settled ? invoice.total : invoice.paidAmount)),
  )
}

export function activeAccounting(state: AccountingState) {
  const id = state.activeCompanyId
  return {
    company:
      state.companies.find((company) => company.id === id) ??
      state.companies[0] ??
      null,
    invoices: state.invoices.filter((item) => item.companyId === id),
    takings: state.takings.filter((item) => item.companyId === id),
    sellers: state.sellers.filter((item) => item.companyId === id),
    suppliers: state.suppliers.filter((item) => item.companyId === id),
    rentals: state.rentals.filter((item) => item.companyId === id),
    accountantInvoices: state.accountantInvoices.filter(
      (item) => item.companyId === id,
    ),
    expenses: state.expenses.filter((item) => item.companyId === id),
  }
}
