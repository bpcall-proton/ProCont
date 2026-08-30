import { createEmptyAccountingState, createInitialState } from '../domain/defaults'
import type {
  AccountantInvoice,
  AccountingCompany,
  AccountingExpense,
  AccountingInvoice,
  AccountingSeller,
  AccountingState,
  AccountingSupplier,
  AccountingTaking,
  AppState,
  InvoicePayment,
  PaymentMethod,
  Rental,
} from '../domain/types'

type JsonRecord = Record<string, unknown>

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function text(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback
}

function amount(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function positiveInteger(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.round(value))
    : fallback
}

function flag(value: unknown) {
  return value === true
}

function nullableText(value: unknown) {
  return typeof value === 'string' ? value : null
}

function paymentMethod(value: unknown): PaymentMethod | null {
  return value === 'Bonifico' ||
    value === 'Contanti' ||
    value === 'Carta' ||
    value === 'Assegno' ||
    value === 'Altro'
    ? value
    : null
}

function records(value: unknown) {
  return Array.isArray(value) ? value.filter(isRecord) : []
}

function contactKey(value: string) {
  const digits = value.replace(/\D/g, '')
  return digits.startsWith('00') ? digits.slice(2) : digits
}

function mapPayment(value: JsonRecord): InvoicePayment {
  return {
    id: text(value.id, crypto.randomUUID()),
    date: text(value.data),
    amount: amount(value.importo),
    method: paymentMethod(value.metodo) ?? 'Bonifico',
  }
}

function mapCompany(value: JsonRecord): AccountingCompany {
  return {
    id: text(value.id, crypto.randomUUID()),
    name: text(value.nome, 'Azienda importata'),
    taxId: text(value.partitaIva),
    city: text(value.citta),
    notes: text(value.note),
    seasonEndDate: nullableText(value.dataFineStagione),
  }
}

function mapInvoice(value: JsonRecord): AccountingInvoice {
  const total = amount(value.importo)
  const settled = flag(value.pagata)
  let paid = settled
    ? total
    : Math.min(total, Math.max(0, amount(value.pagatoParziale)))
  let payments = records(value.acconti).map(mapPayment)
  if (
    !settled &&
    typeof value.pagatoParziale !== 'number' &&
    payments.length > 0
  ) {
    paid = Math.min(
      total,
      payments.reduce((sum, payment) => sum + payment.amount, 0),
    )
  }
  if (payments.length === 0 && paid > 0) {
    payments = [
      {
        id: crypto.randomUUID(),
        date: nullableText(value.dataPagamento) ?? text(value.data),
        amount: paid,
        method: paymentMethod(value.metodoPagamento) ?? 'Bonifico',
      },
    ]
  }
  return {
    id: text(value.id, crypto.randomUUID()),
    companyId: text(value.aziendaId),
    number: text(value.numero),
    supplierId: nullableText(value.fornitoreId),
    supplierName: text(value.fornitoreNome),
    sellerId: nullableText(value.venditoreId),
    sellerName: text(value.venditoreNome),
    description: text(value.descrizione),
    category: text(value.categoria),
    taxableAmount: amount(value.imponibile),
    vat: amount(value.iva),
    theoreticalRevenue: amount(value.venit),
    total,
    date: text(value.data),
    dueDate: text(value.scadenza),
    settled,
    paidAmount: paid,
    payments,
    paymentDate: nullableText(value.dataPagamento),
    paymentMethod: paymentMethod(value.metodoPagamento),
  }
}

function mapTaking(value: JsonRecord): AccountingTaking {
  return {
    id: text(value.id, crypto.randomUUID()),
    companyId: text(value.aziendaId),
    date: text(value.data),
    sellerId: nullableText(value.venditoreId),
    sellerName: text(value.venditoreNome),
    cash: amount(value.cash),
    pos: amount(value.pos),
    withdrawal: amount(value.ritiro),
    vat: amount(value.iva),
    realTotal: amount(value.reale),
  }
}

function mapSeller(value: JsonRecord): AccountingSeller {
  return {
    id: text(value.id, crypto.randomUUID()),
    companyId: text(value.aziendaId),
    name: text(value.nome),
    email: text(value.email),
    phone: text(value.telefono),
    city: text(value.citta),
    notes: text(value.note),
  }
}

function mapSupplier(value: JsonRecord): AccountingSupplier {
  return {
    id: text(value.id, crypto.randomUUID()),
    companyId: text(value.aziendaId),
    name: text(value.nome),
    taxId: text(value.partitaIva),
    email: text(value.email),
    phone: text(value.telefono),
    city: text(value.citta),
    notes: text(value.note),
    paymentTermsDays: positiveInteger(value.giorniPagamento, 10),
  }
}

function splitVat(total: number, rate: number) {
  const taxableAmount = rate > 0 ? total / (1 + rate / 100) : total
  return {
    taxableAmount: Math.round(taxableAmount * 100) / 100,
    vat: Math.round((total - taxableAmount) * 100) / 100,
  }
}

function mapRental(value: JsonRecord): Rental {
  const total = amount(value.canone)
  const vatRate = amount(value.aliquotaIva)
  const split = splitVat(total, vatRate)
  return {
    id: text(value.id, crypto.randomUUID()),
    companyId: text(value.aziendaId),
    property: text(value.immobile),
    tenant: text(value.inquilino),
    total,
    vatRate,
    taxableAmount:
      typeof value.imponibile === 'number'
        ? amount(value.imponibile)
        : split.taxableAmount,
    vat: typeof value.iva === 'number' ? amount(value.iva) : split.vat,
    date: text(value.data),
    period: text(value.periodo),
    settled: flag(value.pagato),
    paidAmount: flag(value.pagato)
      ? total
      : Math.min(total, Math.max(0, amount(value.pagatoParziale))),
    paymentDate: nullableText(value.dataPagamento),
    paymentMethod: paymentMethod(value.metodoPagamento),
  }
}

function mapAccountantInvoice(value: JsonRecord): AccountantInvoice {
  const total = amount(value.importo)
  const vatRate = amount(value.aliquotaIva)
  const split = splitVat(total, vatRate)
  return {
    id: text(value.id, crypto.randomUUID()),
    companyId: text(value.aziendaId),
    description: text(value.descrizione),
    number: text(value.numero),
    total,
    vatRate,
    taxableAmount:
      typeof value.imponibile === 'number'
        ? amount(value.imponibile)
        : split.taxableAmount,
    vat: typeof value.iva === 'number' ? amount(value.iva) : split.vat,
    date: text(value.data),
    dueDate: text(value.scadenza),
    settled: flag(value.pagata),
    paidAmount: flag(value.pagata)
      ? total
      : Math.min(total, Math.max(0, amount(value.pagatoParziale))),
    paymentDate: nullableText(value.dataPagamento),
    paymentMethod: paymentMethod(value.metodoPagamento),
  }
}

function mapExpense(value: JsonRecord): AccountingExpense {
  const type =
    value.tipo === 'stipendio' ||
    value.tipo === 'contabile' ||
    value.tipo === 'altra'
      ? value.tipo
      : 'tassa'
  return {
    id: text(value.id, crypto.randomUUID()),
    companyId: text(value.aziendaId),
    type,
    description: text(value.descrizione),
    sellerId: nullableText(value.venditoreId),
    sellerName: text(value.venditoreNome),
    amount: amount(value.importo),
    date: text(value.data),
    recurrence: value.ricorrenza === 'monthly' ? 'monthly' : 'once',
    recurrenceEndDate: nullableText(value.dataFineRicorrenza),
    notes: text(value.note),
    settled: flag(value.pagata),
  }
}

export function parseLegacyAccountingJson(json: string): AccountingState {
  const parsed: unknown = JSON.parse(json)
  if (!isRecord(parsed)) throw new Error('File JSON non valido')
  const candidate = isRecord(parsed.data) ? parsed.data : parsed
  if (!Array.isArray(candidate.aziende)) {
    throw new Error('Il file non contiene dati di Contabilità Pro')
  }
  const companies = records(candidate.aziende).map(mapCompany)
  return {
    companies,
    activeCompanyId:
      nullableText(candidate.aziendaAttivaId) ?? companies[0]?.id ?? null,
    invoices: records(candidate.fatture).map(mapInvoice),
    takings: records(candidate.incassi).map(mapTaking),
    sellers: records(candidate.venditori).map(mapSeller),
    suppliers: records(candidate.fornitori).map(mapSupplier),
    rentals: records(candidate.affitti).map(mapRental),
    accountantInvoices: records(candidate.contabile).map(mapAccountantInvoice),
    expenses: records(candidate.stipendiTasse).map(mapExpense),
  }
}

export function normalizeStoredState(
  value: unknown,
  companyId: string,
): AppState | null {
  if (!isRecord(value)) return null
  if (
    (value.schemaVersion === 2 ||
      value.schemaVersion === 3 ||
      value.schemaVersion === 4 ||
      value.schemaVersion === 5) &&
    isRecord(value.company)
  ) {
    const state = value as unknown as AppState
    const accounting = isRecord(value.accounting)
      ? state.accounting
      : createEmptyAccountingState(companyId)
    const fallbackCompanyId =
      accounting.activeCompanyId ?? accounting.companies[0]?.id ?? companyId
    const accountingSellers = [...accounting.sellers]
    const sellers = (state.sellers ?? []).map((seller) => {
      const linked =
        accountingSellers.find(
          (candidate) => candidate.id === seller.accountingSellerId,
        ) ??
        accountingSellers.find(
          (candidate) =>
            contactKey(candidate.phone) !== '' &&
            contactKey(candidate.phone) === contactKey(seller.phone),
        ) ??
        accountingSellers.find(
          (candidate) =>
            candidate.name.trim().toLocaleLowerCase() ===
            seller.name.trim().toLocaleLowerCase(),
        )
      const sellerCompanyId =
        seller.companyId || linked?.companyId || fallbackCompanyId
      const accountingSellerId =
        linked?.id ?? seller.accountingSellerId ?? seller.id
      if (!linked) {
        accountingSellers.push({
          id: accountingSellerId,
          companyId: sellerCompanyId,
          name: seller.name,
          email: '',
          phone: seller.phone,
          city: '',
          notes: 'Venditrice collegata a un punto vendita',
        })
      }
      return {
        ...seller,
        companyId: sellerCompanyId,
        accountingSellerId,
        viberUserId: seller.viberUserId ?? '',
      }
    })
    const sellersById = new Map(sellers.map((seller) => [seller.id, seller]))
    const stores = (state.stores ?? []).map((store) => ({
      ...store,
      companyId:
        sellersById.get(store.sellerId)?.companyId ||
        store.companyId ||
        fallbackCompanyId,
    }))
    return {
      ...state,
      schemaVersion: 5,
      stores,
      sellers,
      dataSettings: {
        ...state.dataSettings,
        language: state.dataSettings.language ?? 'it',
        driveFolder: state.dataSettings.driveFolder ?? '',
      },
      accounting: {
        ...accounting,
        sellers: accountingSellers,
        suppliers: (accounting.suppliers ?? []).map((supplier) => ({
          ...supplier,
          paymentTermsDays: positiveInteger(
            supplier.paymentTermsDays,
            10,
          ),
        })),
        expenses: (accounting.expenses ?? []).map((expense) => ({
          ...expense,
          recurrence: expense.recurrence ?? 'once',
          recurrenceEndDate: expense.recurrenceEndDate ?? null,
        })),
      },
    }
  }
  if (value.schemaVersion === 1 && isRecord(value.company)) {
    const previous = value as unknown as Omit<
      AppState,
      'schemaVersion' | 'accounting'
    >
    return normalizeStoredState(
      {
        ...previous,
        schemaVersion: 2,
        dataSettings: {
          ...previous.dataSettings,
          language: 'it',
        },
        accounting: createEmptyAccountingState(companyId),
      },
      companyId,
    )
  }
  return null
}

export function importLegacyIntoState(
  current: AppState,
  json: string,
): AppState {
  const parsed: unknown = JSON.parse(json)
  const candidate =
    isRecord(parsed) && isRecord(parsed.data) ? parsed.data : parsed
  const unified = normalizeStoredState(candidate, current.company.id)
  if (unified) return unified
  const accounting = parseLegacyAccountingJson(json)
  const active =
    accounting.companies.find(
      (company) => company.id === accounting.activeCompanyId,
    ) ?? accounting.companies[0]
  const mergeById = <Item extends { id: string }>(
    existing: Item[],
    imported: Item[],
  ) => {
    const merged = new Map(existing.map((item) => [item.id, item]))
    imported.forEach((item) => merged.set(item.id, item))
    return [...merged.values()]
  }
  const mergedAccounting: AccountingState = {
    companies: mergeById(
      current.accounting.companies,
      accounting.companies,
    ),
    activeCompanyId:
      accounting.activeCompanyId ?? current.accounting.activeCompanyId,
    invoices: mergeById(current.accounting.invoices, accounting.invoices),
    takings: mergeById(current.accounting.takings, accounting.takings),
    sellers: mergeById(current.accounting.sellers, accounting.sellers),
    suppliers: mergeById(current.accounting.suppliers, accounting.suppliers),
    rentals: mergeById(current.accounting.rentals, accounting.rentals),
    accountantInvoices: mergeById(
      current.accounting.accountantInvoices,
      accounting.accountantInvoices,
    ),
    expenses: mergeById(current.accounting.expenses, accounting.expenses),
  }
  return {
    ...current,
    company: active
      ? {
          ...current.company,
          name: active.name,
          taxId: active.taxId,
        }
      : current.company,
    accounting: mergedAccounting,
  }
}

export function exportUnifiedState(state: AppState) {
  return JSON.stringify(
    {
      app: 'fatture-incassi-pro',
      version: 5,
      exportedAt: new Date().toISOString(),
      data: state,
    },
    null,
    2,
  )
}

export function exportLegacyAccounting(state: AccountingState) {
  return JSON.stringify(
    {
      app: 'contabilita-pro',
      version: 5,
      exportedAt: new Date().toISOString(),
      data: {
        aziende: state.companies.map((company) => ({
          id: company.id,
          nome: company.name,
          partitaIva: company.taxId,
          citta: company.city,
          note: company.notes,
          dataFineStagione: company.seasonEndDate,
        })),
        aziendaAttivaId: state.activeCompanyId,
        fatture: state.invoices.map((invoice) => ({
          id: invoice.id,
          aziendaId: invoice.companyId,
          numero: invoice.number,
          fornitoreId: invoice.supplierId,
          fornitoreNome: invoice.supplierName,
          venditoreId: invoice.sellerId,
          venditoreNome: invoice.sellerName,
          descrizione: invoice.description,
          categoria: invoice.category,
          imponibile: invoice.taxableAmount,
          iva: invoice.vat,
          venit: invoice.theoreticalRevenue,
          importo: invoice.total,
          data: invoice.date,
          scadenza: invoice.dueDate,
          pagata: invoice.settled,
          pagatoParziale: invoice.paidAmount,
          acconti: invoice.payments.map((payment) => ({
            id: payment.id,
            data: payment.date,
            importo: payment.amount,
            metodo: payment.method,
          })),
          dataPagamento: invoice.paymentDate,
          metodoPagamento: invoice.paymentMethod,
        })),
        incassi: state.takings.map((taking) => ({
          id: taking.id,
          aziendaId: taking.companyId,
          data: taking.date,
          venditoreId: taking.sellerId,
          venditoreNome: taking.sellerName,
          cash: taking.cash,
          pos: taking.pos,
          ritiro: taking.withdrawal,
          iva: taking.vat,
          reale: taking.realTotal,
        })),
        venditori: state.sellers.map((seller) => ({
          id: seller.id,
          aziendaId: seller.companyId,
          nome: seller.name,
          email: seller.email,
          telefono: seller.phone,
          citta: seller.city,
          note: seller.notes,
        })),
        fornitori: state.suppliers.map((supplier) => ({
          id: supplier.id,
          aziendaId: supplier.companyId,
          nome: supplier.name,
          partitaIva: supplier.taxId,
          email: supplier.email,
          telefono: supplier.phone,
          citta: supplier.city,
          note: supplier.notes,
          giorniPagamento: supplier.paymentTermsDays,
        })),
        affitti: state.rentals.map((rental) => ({
          id: rental.id,
          aziendaId: rental.companyId,
          immobile: rental.property,
          inquilino: rental.tenant,
          canone: rental.total,
          aliquotaIva: rental.vatRate,
          imponibile: rental.taxableAmount,
          iva: rental.vat,
          data: rental.date,
          periodo: rental.period,
          pagato: rental.settled,
          pagatoParziale: rental.paidAmount,
          dataPagamento: rental.paymentDate,
          metodoPagamento: rental.paymentMethod,
        })),
        contabile: state.accountantInvoices.map((invoice) => ({
          id: invoice.id,
          aziendaId: invoice.companyId,
          descrizione: invoice.description,
          numero: invoice.number,
          importo: invoice.total,
          aliquotaIva: invoice.vatRate,
          imponibile: invoice.taxableAmount,
          iva: invoice.vat,
          data: invoice.date,
          scadenza: invoice.dueDate,
          pagata: invoice.settled,
          pagatoParziale: invoice.paidAmount,
          dataPagamento: invoice.paymentDate,
          metodoPagamento: invoice.paymentMethod,
        })),
        stipendiTasse: state.expenses.map((expense) => ({
          id: expense.id,
          aziendaId: expense.companyId,
          tipo: expense.type,
          descrizione: expense.description,
          venditoreId: expense.sellerId,
          venditoreNome: expense.sellerName,
          importo: expense.amount,
          data: expense.date,
          ricorrenza: expense.recurrence,
          dataFineRicorrenza: expense.recurrenceEndDate,
          note: expense.notes,
          pagata: expense.settled,
        })),
      },
    },
    null,
    2,
  )
}

export function normalizeOrCreateState(value: unknown, companyId: string) {
  return normalizeStoredState(value, companyId) ?? createInitialState(companyId)
}
