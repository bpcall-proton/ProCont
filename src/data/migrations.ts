import { createEmptyAccountingState, createInitialState } from '../domain/defaults'
import type {
  AccountantInvoice,
  AccountingCompany,
  AccountingExpense,
  AccountingInvoice,
  AccountingProduct,
  AccountingSeller,
  AccountingState,
  AccountingSupplier,
  AccountingTaking,
  AppState,
  InvoiceLine,
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

function pricingMode(value: unknown) {
  return value === 'markup' || value === 'manual' ? value : 'sale-price'
}

function markupPercent(cost: number, sale: number) {
  if (cost <= 0) return 0
  return Math.round((((sale - cost) / cost) * 100 + Number.EPSILON) * 100) / 100
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
  const lines = records(value.righe).map(mapInvoiceLine)
  const theoreticalRevenue = amount(value.venit)
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
    theoreticalRevenue,
    total,
    markupPercent:
      typeof value.ricaricoPercentuale === 'number'
        ? amount(value.ricaricoPercentuale)
        : markupPercent(total, theoreticalRevenue),
    lines,
    date: text(value.data),
    dueDate: text(value.scadenza),
    settled,
    paidAmount: paid,
    payments,
    paymentDate: nullableText(value.dataPagamento),
    paymentMethod: paymentMethod(value.metodoPagamento),
  }
}

function mapInvoiceLine(value: JsonRecord): InvoiceLine {
  const quantity = Math.max(0, amount(value.quantita))
  const unitPurchaseCostInclVat = amount(value.costoUnitarioIvaInclusa)
  const unitSalePriceInclVat = amount(value.venditaUnitariaIvaInclusa)
  const purchaseTotalInclVat =
    typeof value.costoTotaleIvaInclusa === 'number'
      ? amount(value.costoTotaleIvaInclusa)
      : quantity * unitPurchaseCostInclVat
  const saleTotalInclVat =
    typeof value.venitTotaleIvaInclusa === 'number'
      ? amount(value.venitTotaleIvaInclusa)
      : quantity * unitSalePriceInclVat
  return {
    id: text(value.id, crypto.randomUUID()),
    productId: nullableText(value.prodottoId),
    productCode: text(value.codiceProdotto),
    description: text(value.descrizione),
    quantity,
    unitPurchaseCostInclVat,
    unitSalePriceInclVat,
    purchaseTotalInclVat,
    saleTotalInclVat,
    markupPercent:
      typeof value.ricaricoPercentuale === 'number'
        ? amount(value.ricaricoPercentuale)
        : markupPercent(purchaseTotalInclVat, saleTotalInclVat),
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

function mapProduct(value: JsonRecord): AccountingProduct {
  return {
    id: text(value.id, crypto.randomUUID()),
    companyId: text(value.aziendaId),
    supplierId: nullableText(value.fornitoreId),
    supplierName: text(value.fornitoreNome),
    code: text(value.codice),
    name: text(value.nome),
    purchaseCostInclVat: amount(value.costoIvaInclusa),
    pricingMode: pricingMode(value.regolaVenit),
    salePriceInclVat: amount(value.venditaIvaInclusa),
    markupPercent: amount(value.ricaricoPercentuale),
    notes: text(value.note),
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
    products: records(candidate.prodotti).map(mapProduct),
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
      value.schemaVersion === 5 ||
      value.schemaVersion === 6) &&
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
    const invoices = (accounting.invoices ?? []).map((invoice) => {
      const lines = invoice.lines ?? []
      const vat = invoice.vat ?? 0
      const storedTaxableAmount = invoice.taxableAmount ?? 0
      const taxableAmount =
        storedTaxableAmount === 0 && vat === 0 && invoice.total > 0
          ? invoice.total
          : storedTaxableAmount
      return {
        ...invoice,
        companyId: invoice.companyId || fallbackCompanyId,
        taxableAmount,
        vat,
        lines,
        markupPercent:
          invoice.markupPercent ??
          markupPercent(invoice.total, invoice.theoreticalRevenue),
      }
    })
    return {
      ...state,
      schemaVersion: 6,
      stores,
      sellers,
      reviewDocuments: (state.reviewDocuments ?? []).map((document) => ({
        ...document,
        companyId: document.companyId || fallbackCompanyId,
        source: document.source ?? 'manual-upload',
        senderName: document.senderName ?? '',
        status: document.status ?? 'unrecognized',
        images: Array.isArray(document.images) ? document.images : [],
        suggestion: {
          number: document.suggestion?.number ?? '',
          supplierId: document.suggestion?.supplierId ?? null,
          sellerId: document.suggestion?.sellerId ?? null,
          description: document.suggestion?.description ?? '',
          taxableAmount: document.suggestion?.taxableAmount ?? 0,
          vat: document.suggestion?.vat ?? 0,
          theoreticalRevenue:
            document.suggestion?.theoreticalRevenue ?? 0,
          date: document.suggestion?.date ?? '',
        },
      })),
      dataSettings: {
        ...state.dataSettings,
        language: state.dataSettings.language ?? 'it',
        currency:
          state.dataSettings.currency === 'MDL' ||
          state.dataSettings.currency === 'USD'
            ? state.dataSettings.currency
            : 'EUR',
        driveFolder: state.dataSettings.driveFolder ?? '',
      },
      accounting: {
        ...accounting,
        invoices,
        sellers: accountingSellers.map((seller) => ({
          ...seller,
          companyId: seller.companyId || fallbackCompanyId,
        })),
        suppliers: (accounting.suppliers ?? []).map((supplier) => ({
          ...supplier,
          companyId: supplier.companyId || fallbackCompanyId,
          paymentTermsDays: positiveInteger(
            supplier.paymentTermsDays,
            10,
          ),
        })),
        products: (accounting.products ?? []).map((product) => ({
          ...product,
          companyId: product.companyId || fallbackCompanyId,
          supplierId: product.supplierId ?? null,
          supplierName: product.supplierName ?? '',
          code: product.code ?? '',
          purchaseCostInclVat: product.purchaseCostInclVat ?? 0,
          pricingMode: product.pricingMode ?? 'manual',
          salePriceInclVat: product.salePriceInclVat ?? 0,
          markupPercent: product.markupPercent ?? 0,
          notes: product.notes ?? '',
        })),
        expenses: (accounting.expenses ?? []).map((expense) => ({
          ...expense,
          companyId: expense.companyId || fallbackCompanyId,
          recurrence: expense.recurrence ?? 'once',
          recurrenceEndDate: expense.recurrenceEndDate ?? null,
        })),
        takings: (accounting.takings ?? []).map((taking) => ({
          ...taking,
          companyId: taking.companyId || fallbackCompanyId,
        })),
        rentals: (accounting.rentals ?? []).map((rental) => ({
          ...rental,
          companyId: rental.companyId || fallbackCompanyId,
        })),
        accountantInvoices: (accounting.accountantInvoices ?? []).map(
          (invoice) => ({
            ...invoice,
            companyId: invoice.companyId || fallbackCompanyId,
          }),
        ),
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
    products: mergeById(current.accounting.products, accounting.products),
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

export function importLegacyIntoActiveCompany(
  current: AppState,
  json: string,
): AppState {
  const targetCompanyId = current.accounting.activeCompanyId
  if (!targetCompanyId) throw new Error('Seleziona prima un’azienda.')

  const imported = importLegacyIntoState(
    createInitialState(current.company.id),
    json,
  )
  const sourceCompanyId =
    imported.accounting.activeCompanyId ??
    imported.accounting.companies[0]?.id ??
    null
  if (!sourceCompanyId) {
    throw new Error('Il file non contiene dati di un’azienda.')
  }

  const mergeById = <Item extends { id: string }>(
    existing: Item[],
    additions: Item[],
  ) => {
    const merged = new Map(existing.map((item) => [item.id, item]))
    additions.forEach((item) => merged.set(item.id, item))
    return [...merged.values()]
  }
  const companyRecords = <Item extends { companyId: string }>(items: Item[]) =>
    items
      .filter((item) => item.companyId === sourceCompanyId)
      .map((item) => ({ ...item, companyId: targetCompanyId }))

  return {
    ...current,
    stores: mergeById(current.stores, companyRecords(imported.stores)),
    sellers: mergeById(current.sellers, companyRecords(imported.sellers)),
    reviewDocuments: mergeById(
      current.reviewDocuments,
      companyRecords(imported.reviewDocuments),
    ),
    accounting: {
      ...current.accounting,
      invoices: mergeById(
        current.accounting.invoices,
        companyRecords(imported.accounting.invoices),
      ),
      takings: mergeById(
        current.accounting.takings,
        companyRecords(imported.accounting.takings),
      ),
      sellers: mergeById(
        current.accounting.sellers,
        companyRecords(imported.accounting.sellers),
      ),
      suppliers: mergeById(
        current.accounting.suppliers,
        companyRecords(imported.accounting.suppliers),
      ),
      products: mergeById(
        current.accounting.products,
        companyRecords(imported.accounting.products),
      ),
      rentals: mergeById(
        current.accounting.rentals,
        companyRecords(imported.accounting.rentals),
      ),
      accountantInvoices: mergeById(
        current.accounting.accountantInvoices,
        companyRecords(imported.accounting.accountantInvoices),
      ),
      expenses: mergeById(
        current.accounting.expenses,
        companyRecords(imported.accounting.expenses),
      ),
    },
  }
}

export function exportUnifiedState(state: AppState) {
  return JSON.stringify(
    {
      app: 'fatture-incassi-pro',
      version: 6,
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
          ricaricoPercentuale: invoice.markupPercent,
          righe: invoice.lines.map((line) => ({
            id: line.id,
            prodottoId: line.productId,
            codiceProdotto: line.productCode,
            descrizione: line.description,
            quantita: line.quantity,
            costoUnitarioIvaInclusa: line.unitPurchaseCostInclVat,
            venditaUnitariaIvaInclusa: line.unitSalePriceInclVat,
            costoTotaleIvaInclusa: line.purchaseTotalInclVat,
            venitTotaleIvaInclusa: line.saleTotalInclVat,
            ricaricoPercentuale: line.markupPercent,
          })),
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
        prodotti: state.products.map((product) => ({
          id: product.id,
          aziendaId: product.companyId,
          fornitoreId: product.supplierId,
          fornitoreNome: product.supplierName,
          codice: product.code,
          nome: product.name,
          costoIvaInclusa: product.purchaseCostInclVat,
          regolaVenit: product.pricingMode,
          venditaIvaInclusa: product.salePriceInclVat,
          ricaricoPercentuale: product.markupPercent,
          note: product.notes,
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
