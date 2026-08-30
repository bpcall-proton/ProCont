import type {
  AccountingInvoice,
  AccountingExpense,
  AccountingProduct,
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

export const defaultPaymentTermsDays = 10

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

export function markupPercentage(costInclVat: number, saleInclVat: number) {
  if (costInclVat <= 0) return 0
  return roundMoney(((saleInclVat - costInclVat) / costInclVat) * 100)
}

export function productSalePrice(
  product: AccountingProduct,
  purchaseCostInclVat = product.purchaseCostInclVat,
) {
  if (product.pricingMode === 'sale-price') return product.salePriceInclVat
  if (product.pricingMode === 'markup') {
    return roundMoney(purchaseCostInclVat * (1 + product.markupPercent / 100))
  }
  return 0
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

export type InvoiceDueState = 'paid' | 'overdue' | 'due-soon' | 'open'

export function invoiceDueState(
  invoice: AccountingInvoice,
  referenceDate = today(),
): InvoiceDueState {
  if (invoice.settled) return 'paid'
  if (!invoice.dueDate) return 'open'
  if (invoice.dueDate < referenceDate) return 'overdue'
  if (invoice.dueDate <= addDays(referenceDate, 2)) return 'due-soon'
  return 'open'
}

export function allocatedExpense(
  expense: AccountingExpense,
  rangeStart: string,
  rangeEnd: string,
) {
  if (expense.recurrence !== 'monthly') {
    return expense.date >= rangeStart && expense.date <= rangeEnd
      ? expense.amount
      : 0
  }
  const start =
    rangeStart && rangeStart > expense.date ? rangeStart : expense.date
  const boundedEnd = rangeEnd === '9999-12-31' ? today() : rangeEnd
  const end =
    expense.recurrenceEndDate &&
    expense.recurrenceEndDate < boundedEnd
      ? expense.recurrenceEndDate
      : boundedEnd
  if (start > end) return 0

  const cursor = new Date(`${start}T00:00:00Z`)
  const last = new Date(`${end}T00:00:00Z`)
  let allocated = 0
  while (cursor <= last) {
    const daysInMonth = new Date(
      Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0),
    ).getUTCDate()
    allocated += expense.amount / daysInMonth
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return allocated
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
    products: state.products.filter((item) => item.companyId === id),
    rentals: state.rentals.filter((item) => item.companyId === id),
    accountantInvoices: state.accountantInvoices.filter(
      (item) => item.companyId === id,
    ),
    expenses: state.expenses.filter((item) => item.companyId === id),
  }
}
