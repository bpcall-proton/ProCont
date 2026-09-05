import {
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react'
import {
  activeAccounting,
  addDays,
  defaultPaymentTermsDays,
  expenseCategories,
  invoiceDueState,
  invoiceRemaining,
  markupPercentage,
  money,
  paymentMethods,
  productSalePrice,
  realTaking,
  roundMoney,
  sellerColorClass,
  splitVat,
  today,
} from '../domain/accounting'
import { createId } from '../domain/defaults'
import type {
  AccountantInvoice,
  AccountingExpense,
  AccountingInvoice,
  AccountingState,
  AccountingTaking,
  InvoiceLine,
  PaymentMethod,
  Rental,
} from '../domain/types'
import { useAppStore } from '../store/AppStoreContext'

type Section = 'invoices' | 'takings' | 'contacts' | 'expenses'

function numberValue(value: string) {
  const parsed = Number(value.replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : 0
}

function amountExpression(value: string) {
  const expression = value
    .trim()
    .replace(/^=/, '')
    .replaceAll(',', '.')
    .replaceAll('×', '*')
    .replaceAll('÷', '/')
    .replace(/\s+/g, '')
  if (!expression) return 0

  let index = 0

  function parseExpression(): number | null {
    let value = parseTerm()
    if (value === null) return null
    while (expression[index] === '+' || expression[index] === '-') {
      const operator = expression[index]
      index += 1
      const right = parseTerm()
      if (right === null) return null
      value = operator === '+' ? value + right : value - right
    }
    return value
  }

  function parseTerm(): number | null {
    let value = parseFactor()
    if (value === null) return null
    while (expression[index] === '*' || expression[index] === '/') {
      const operator = expression[index]
      index += 1
      const right = parseFactor()
      if (right === null || (operator === '/' && right === 0)) return null
      value = operator === '*' ? value * right : value / right
    }
    return value
  }

  function parseFactor(): number | null {
    if (expression[index] === '+' || expression[index] === '-') {
      const operator = expression[index]
      index += 1
      const value = parseFactor()
      if (value === null) return null
      return operator === '-' ? -value : value
    }
    if (expression[index] === '(') {
      index += 1
      const value = parseExpression()
      if (value === null || expression[index] !== ')') return null
      index += 1
      return value
    }
    const match = expression.slice(index).match(/^(?:\d+\.?\d*|\.\d+)/)
    if (!match) return null
    index += match[0].length
    return Number(match[0])
  }

  const result = parseExpression()
  if (result === null || index !== expression.length || !Number.isFinite(result)) {
    return null
  }
  return roundMoney(result)
}

function filenamePart(value: string) {
  return (
    value
      .trim()
      .toLocaleLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'azienda'
  )
}

function cashBalanceByTaking(takings: AccountingTaking[]) {
  const balanceBySeller = new Map<string, number>()
  const balanceByTaking = new Map<string, number>()
  const orderedTakings = takings
    .map((taking, index) => ({ taking, index }))
    .sort(
      (left, right) =>
        left.taking.date.localeCompare(right.taking.date) ||
        right.index - left.index,
    )

  for (const { taking } of orderedTakings) {
    const sellerName = taking.sellerName.trim().toLocaleLowerCase()
    const sellerKey = taking.sellerId
      ? `id:${taking.sellerId}`
      : `name:${sellerName || 'non-assegnato'}`
    const realTotal = Number.isFinite(taking.realTotal)
      ? Math.max(0, taking.realTotal)
      : 0
    const pos = Number.isFinite(taking.pos) ? taking.pos : 0
    const withdrawal = Number.isFinite(taking.withdrawal)
      ? taking.withdrawal
      : 0
    const unregisteredGoods = Number.isFinite(taking.unregisteredGoods)
      ? taking.unregisteredGoods
      : 0
    const balance = roundMoney(
      (balanceBySeller.get(sellerKey) ?? 0) +
        realTotal -
        pos -
        withdrawal -
        unregisteredGoods,
    )
    balanceBySeller.set(sellerKey, balance)
    balanceByTaking.set(taking.id, balance)
  }

  return balanceByTaking
}

function mutateCompany(
  state: AccountingState,
  updater: (activeId: string) => AccountingState,
) {
  return state.activeCompanyId ? updater(state.activeCompanyId) : state
}

interface AccountingPageProps {
  onOpenInvoiceArchive: () => void
}

export function AccountingPage({
  onOpenInvoiceArchive,
}: AccountingPageProps) {
  const {
    state,
    setActiveAccountingCompany,
    addAccountingCompany,
  } = useAppStore()
  const [section, setSection] = useState<Section>('invoices')
  const [companyName, setCompanyName] = useState('')
  const [companyError, setCompanyError] = useState<string | null>(null)
  const active = activeAccounting(state.accounting)

  function addCompany(event: FormEvent) {
    event.preventDefault()
    const name = companyName.trim()
    if (!name) return
    const result = addAccountingCompany({
      name,
      taxId: '',
      city: '',
      notes: '',
      seasonEndDate: null,
    })
    setCompanyError(result.error ?? null)
    if (result.ok) setCompanyName('')
  }

  return (
    <div className="page-stack">
      <div className="accounting-sticky-header">
        <header className="page-heading accounting-heading">
          <div>
            <span className="eyebrow">GESTIONE COMPLETA</span>
            <h1>Contabilità manuale</h1>
            <p>
              Tutte le funzioni della precedente Contabilità Pro, nello stesso
              archivio dei documenti automatici.
            </p>
          </div>
          <div className="accounting-heading-actions">
            <button
              className="button button-primary"
              onClick={onOpenInvoiceArchive}
              type="button"
            >
              Archivio fatture
            </button>
            <div className="company-switcher">
              <select
                aria-label="Azienda contabile attiva"
                onChange={(event) =>
                  setActiveAccountingCompany(event.target.value)
                }
                value={state.accounting.activeCompanyId ?? ''}
              >
                {state.accounting.companies.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.name}
                  </option>
                ))}
              </select>
              <form onSubmit={addCompany}>
                <input
                  onChange={(event) => setCompanyName(event.target.value)}
                  placeholder="Nuova azienda"
                  value={companyName}
                />
                <button className="button button-secondary" type="submit">
                  Aggiungi
                </button>
              </form>
              {companyError && <p className="import-message">{companyError}</p>}
            </div>
          </div>
        </header>

        <nav className="section-tabs" aria-label="Sezioni contabili">
          {[
            ['invoices', 'Fatture'],
            ['takings', 'Incassi'],
            ['contacts', 'Venditori e fornitori'],
            ['expenses', 'Spese, affitti e contabile'],
          ].map(([id, label]) => (
            <button
              className={section === id ? 'active' : ''}
              key={id}
              onClick={() => setSection(id as Section)}
              type="button"
            >
              {label}
            </button>
          ))}
        </nav>
      </div>

      {!active.company ? (
        <div className="panel empty-state">
          <strong>Aggiungi un'azienda contabile</strong>
          <span>Serve per registrare fatture, incassi e spese.</span>
        </div>
      ) : (
        <>
          {section === 'invoices' && (
            <InvoicesPanel key={active.company.id} />
          )}
          {section === 'takings' && <TakingsPanel />}
          {section === 'contacts' && <ContactsPanel />}
          {section === 'expenses' && <ExpensesPanel />}
        </>
      )}
    </div>
  )
}

const emptyInvoice = {
  number: '',
  supplierId: '',
  sellerId: '',
  description: '',
  category: 'Acquisti',
  taxableAmount: '',
  vat: '',
  theoreticalRevenue: '',
  unregisteredGoods: '',
  date: today(),
  settled: false,
}

const emptyInvoiceLine = {
  productId: '',
  description: '',
  quantity: '1',
  unitPurchaseCostInclVat: '',
  unitSalePriceInclVat: '',
}

interface InvoicesPanelProps {
  archiveOnly?: boolean
}

export function InvoicesPanel({
  archiveOnly = false,
}: InvoicesPanelProps) {
  const { state, updateAccounting } = useAppStore()
  const data = activeAccounting(state.accounting)
  const [form, setForm] = useState(emptyInvoice)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [repeatSupplier, setRepeatSupplier] = useState(false)
  const [repeatSeller, setRepeatSeller] = useState(false)
  const [repeatDate, setRepeatDate] = useState(false)
  const [lines, setLines] = useState<InvoiceLine[]>([])
  const [lineForm, setLineForm] = useState(emptyInvoiceLine)
  const invoiceFormRef = useRef<HTMLFormElement>(null)
  const submitAfterValidationRef = useRef(false)
  const dateInputRef = useRef<HTMLInputElement>(null)
  const supplierInputRef = useRef<HTMLSelectElement>(null)
  const sellerInputRef = useRef<HTMLSelectElement>(null)
  const taxableAmountInputRef = useRef<HTMLInputElement>(null)
  const theoreticalRevenueInputRef = useRef<HTMLInputElement>(null)
  const [filter, setFilter] = useState<'all' | 'open' | 'paid'>('all')
  const [supplierFilter, setSupplierFilter] = useState('')
  const [sellerFilter, setSellerFilter] = useState('')
  const [monthFilter, setMonthFilter] = useState('')
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<string[]>([])
  const [paymentTarget, setPaymentTarget] =
    useState<AccountingInvoice | null>(null)
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentDate, setPaymentDate] = useState(today())
  const [paymentMethod, setPaymentMethod] =
    useState<PaymentMethod>('Bonifico')
  const [advanceSupplier, setAdvanceSupplier] = useState('')
  const [advanceAmount, setAdvanceAmount] = useState('')
  const activeSupplierFilter = data.suppliers.some(
    (supplier) => supplier.id === supplierFilter,
  )
    ? supplierFilter
    : ''
  const activeSellerFilter = data.sellers.some(
    (seller) => seller.id === sellerFilter,
  )
    ? sellerFilter
    : ''

  const invoices = useMemo(
    () =>
      data.invoices
        .filter((invoice) =>
          filter === 'paid'
            ? invoice.settled
            : filter === 'open'
              ? !invoice.settled
              : true,
        )
        .filter(
          (invoice) =>
            !activeSupplierFilter ||
            invoice.supplierId === activeSupplierFilter,
        )
        .filter(
          (invoice) =>
            !activeSellerFilter || invoice.sellerId === activeSellerFilter,
        )
        .filter(
          (invoice) =>
            !monthFilter || invoice.date.slice(0, 7) === monthFilter,
        )
        .sort((left, right) => right.date.localeCompare(left.date)),
    [
      activeSellerFilter,
      activeSupplierFilter,
      data.invoices,
      filter,
      monthFilter,
    ],
  )
  const total = invoices.reduce((sum, item) => sum + item.total, 0)
  const paid = invoices.reduce(
    (sum, item) => sum + (item.settled ? item.total : item.paidAmount),
    0,
  )
  const theoretical = invoices.reduce(
    (sum, item) => sum + item.theoreticalRevenue,
    0,
  )
  const selectedInvoices = invoices.filter((invoice) =>
    selectedInvoiceIds.includes(invoice.id),
  )
  const selectedInvoiceTotal = selectedInvoices.reduce(
    (sum, invoice) => sum + invoice.total,
    0,
  )
  const allVisibleInvoicesSelected =
    invoices.length > 0 && selectedInvoices.length === invoices.length
  const invoiceTotal = roundMoney(
    numberValue(form.taxableAmount) + numberValue(form.vat),
  )
  const lineRevenue = roundMoney(
    lines.reduce((sum, line) => sum + line.saleTotalInclVat, 0),
  )
  const invoiceRevenue =
    lines.length > 0 ? lineRevenue : numberValue(form.theoreticalRevenue)
  const invoiceMarkup = markupPercentage(invoiceTotal, invoiceRevenue)
  const selectedSupplier = data.suppliers.find(
    (supplier) => supplier.id === form.supplierId,
  )
  const editingInvoice = data.invoices.find(
    (invoice) => invoice.id === editingId,
  )
  const preservesDocumentedInvoice =
    editingInvoice?.supplierId === form.supplierId &&
    editingInvoice.total > 0
  const automaticCashPurchase =
    (selectedSupplier?.cashUnregisteredByDefault ?? false) &&
    !preservesDocumentedInvoice

  function selectInvoiceSupplier(supplierId: string) {
    const supplier = data.suppliers.find((item) => item.id === supplierId)
    setForm((current) => ({
      ...current,
      supplierId,
      settled: supplier?.cashUnregisteredByDefault
        ? true
        : data.suppliers.find((item) => item.id === current.supplierId)
              ?.cashUnregisteredByDefault
          ? false
          : current.settled,
      vat: supplier?.cashUnregisteredByDefault ? '' : current.vat,
    }))
  }

  function handleInvoiceEnter(event: KeyboardEvent<HTMLFormElement>) {
    if (
      event.key !== 'Enter' ||
      event.shiftKey ||
      event.nativeEvent.isComposing
    ) {
      return
    }
    const target = event.target
    if (
      !(target instanceof HTMLInputElement) &&
      !(target instanceof HTMLSelectElement)
    ) {
      return
    }
    if (!target.matches('[data-invoice-entry]')) return

    event.preventDefault()
    const invoiceForm = invoiceFormRef.current
    if (!invoiceForm) return
    if (submitAfterValidationRef.current) {
      invoiceForm.requestSubmit()
      return
    }

    const fields = Array.from(
      invoiceForm.querySelectorAll<HTMLInputElement | HTMLSelectElement>(
        '[data-invoice-entry]',
      ),
    ).filter((field) => !field.disabled)
    const nextField = fields[fields.indexOf(target) + 1]
    if (nextField) {
      nextField.focus()
      return
    }

    submitAfterValidationRef.current = true
    invoiceForm.requestSubmit()
  }

  function selectProduct(productId: string) {
    const product = data.products.find((item) => item.id === productId)
    if (!product) {
      setLineForm({ ...emptyInvoiceLine, productId })
      return
    }
    setLineForm({
      productId,
      description: product.name,
      quantity: '1',
      unitPurchaseCostInclVat: String(product.purchaseCostInclVat),
      unitSalePriceInclVat:
        product.pricingMode === 'manual'
          ? ''
          : String(productSalePrice(product)),
    })
    if (product.supplierId) {
      selectInvoiceSupplier(product.supplierId)
    }
  }

  function addInvoiceLine() {
    const quantity = Math.max(0, numberValue(lineForm.quantity))
    const unitPurchaseCostInclVat = numberValue(
      lineForm.unitPurchaseCostInclVat,
    )
    const unitSalePriceInclVat = numberValue(lineForm.unitSalePriceInclVat)
    if (!lineForm.description.trim() || quantity <= 0) return
    const purchaseTotalInclVat = roundMoney(
      quantity * unitPurchaseCostInclVat,
    )
    const saleTotalInclVat = roundMoney(quantity * unitSalePriceInclVat)
    const product = data.products.find(
      (item) => item.id === lineForm.productId,
    )
    setLines((current) => [
      ...current,
      {
        id: createId('invoice-line'),
        productId: product?.id ?? null,
        productCode: product?.code ?? '',
        description: lineForm.description.trim(),
        quantity,
        unitPurchaseCostInclVat,
        unitSalePriceInclVat,
        purchaseTotalInclVat,
        saleTotalInclVat,
        markupPercent: markupPercentage(
          purchaseTotalInclVat,
          saleTotalInclVat,
        ),
      },
    ])
    setLineForm(emptyInvoiceLine)
  }

  function resetInvoiceForm() {
    submitAfterValidationRef.current = false
    setEditingId(null)
    setForm({ ...emptyInvoice, date: today() })
    setLines([])
    setLineForm(emptyInvoiceLine)
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    submitAfterValidationRef.current = false
    updateAccounting((current) =>
      mutateCompany(current, (companyId) => {
        const supplier = data.suppliers.find(
          (item) => item.id === form.supplierId,
        )
        const seller = data.sellers.find((item) => item.id === form.sellerId)
        const previous = current.invoices.find(
          (item) => item.id === editingId,
        )
        const cashUnregistered = automaticCashPurchase
        const storedTotal = cashUnregistered ? 0 : invoiceTotal
        const storedUnregisteredGoods = cashUnregistered
          ? invoiceTotal
          : numberValue(form.unregisteredGoods)
        const settled = cashUnregistered || form.settled
        const invoice: AccountingInvoice = {
          id: editingId ?? createId('invoice'),
          companyId,
          number: form.number.trim(),
          supplierId: supplier?.id ?? null,
          supplierName: supplier?.name ?? '',
          sellerId: seller?.id ?? null,
          sellerName: seller?.name ?? '',
          description: form.description.trim(),
          category: form.category,
          taxableAmount: cashUnregistered
            ? 0
            : numberValue(form.taxableAmount),
          vat: cashUnregistered ? 0 : numberValue(form.vat),
          theoreticalRevenue: invoiceRevenue,
          unregisteredGoods: storedUnregisteredGoods,
          total: storedTotal,
          markupPercent: invoiceMarkup,
          lines,
          date: form.date,
          dueDate: addDays(
            form.date,
            supplier?.paymentTermsDays ?? defaultPaymentTermsDays,
          ),
          settled,
          paidAmount: settled
            ? storedTotal
            : previous?.paidAmount ?? 0,
          payments: previous?.payments ?? [],
          paymentDate: settled
            ? previous?.paymentDate ?? form.date
            : previous?.paymentDate ?? null,
          paymentMethod: settled
            ? previous?.paymentMethod ??
              (cashUnregistered ? 'Contanti' : 'Bonifico')
            : previous?.paymentMethod ?? null,
        }
        return {
          ...current,
          invoices: editingId
            ? current.invoices.map((item) =>
                item.id === editingId ? invoice : item,
              )
            : [invoice, ...current.invoices],
        }
      }),
    )
    const nextForm = editingId
      ? { ...emptyInvoice, date: today() }
      : {
          ...emptyInvoice,
          supplierId: repeatSupplier ? form.supplierId : '',
          sellerId: repeatSeller ? form.sellerId : '',
          date: repeatDate ? form.date : today(),
          settled: repeatSupplier && automaticCashPurchase,
        }
    setEditingId(null)
    setForm(nextForm)
    setLines([])
    setLineForm(emptyInvoiceLine)
    if (!editingId) {
      window.requestAnimationFrame(() => {
        const nextInput = !repeatDate
          ? dateInputRef.current
          : !repeatSeller
            ? sellerInputRef.current
            : !repeatSupplier
              ? supplierInputRef.current
              : taxableAmountInputRef.current
        nextInput?.focus()
      })
    }
  }

  function edit(invoice: AccountingInvoice) {
    submitAfterValidationRef.current = false
    const vat = invoice.vat ?? 0
    const cashUnregistered =
      data.suppliers.find((supplier) => supplier.id === invoice.supplierId)
        ?.cashUnregisteredByDefault ?? false
    const taxableAmount =
      cashUnregistered && invoice.total === 0
        ? invoice.unregisteredGoods
        : (invoice.taxableAmount ?? 0) === 0 && vat === 0 && invoice.total > 0
        ? invoice.total
        : invoice.taxableAmount
    setEditingId(invoice.id)
    setForm({
      number: invoice.number,
      supplierId: invoice.supplierId ?? '',
      sellerId: invoice.sellerId ?? '',
      description: invoice.description,
      category: invoice.category,
      taxableAmount: String(taxableAmount),
      vat: String(vat),
      theoreticalRevenue: String(invoice.theoreticalRevenue),
      unregisteredGoods: String(invoice.unregisteredGoods),
      date: invoice.date,
      settled: invoice.settled,
    })
    setLines(invoice.lines)
    window.requestAnimationFrame(() => {
      invoiceFormRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      })
      dateInputRef.current?.focus({ preventScroll: true })
    })
  }

  function remove(id: string) {
    if (!window.confirm('Eliminare questa fattura?')) return
    setSelectedInvoiceIds((current) =>
      current.filter((invoiceId) => invoiceId !== id),
    )
    updateAccounting((current) => ({
      ...current,
      invoices: current.invoices.filter((item) => item.id !== id),
    }))
  }

  function toggleInvoiceSelection(id: string) {
    setSelectedInvoiceIds((current) =>
      current.includes(id)
        ? current.filter((invoiceId) => invoiceId !== id)
        : [...current, id],
    )
  }

  function toggleAllVisibleInvoices() {
    setSelectedInvoiceIds(
      allVisibleInvoicesSelected ? [] : invoices.map((invoice) => invoice.id),
    )
  }

  function resetInvoiceSelection() {
    setSelectedInvoiceIds([])
  }

  function toggleInvoicePaid(invoiceId: string) {
    updateAccounting((current) => ({
      ...current,
      invoices: current.invoices.map((invoice) => {
        if (invoice.id !== invoiceId) return invoice
        const settled = !invoice.settled
        const recordedPayments = invoice.payments.reduce(
          (sum, payment) => sum + payment.amount,
          0,
        )
        return {
          ...invoice,
          settled,
          paidAmount: settled
            ? invoice.total
            : Math.min(invoice.total, recordedPayments),
          paymentDate: settled ? invoice.paymentDate ?? today() : null,
        }
      }),
    }))
  }

  function addPayment(event: FormEvent) {
    event.preventDefault()
    if (!paymentTarget) return
    const amount = numberValue(paymentAmount)
    if (amount <= 0) return
    updateAccounting((current) => ({
      ...current,
      invoices: current.invoices.map((invoice) => {
        if (invoice.id !== paymentTarget.id) return invoice
        const applied = Math.min(amount, invoiceRemaining(invoice))
        const paidAmount = Math.min(invoice.total, invoice.paidAmount + applied)
        const settled = paidAmount >= invoice.total - 0.001
        return {
          ...invoice,
          paidAmount,
          settled,
          payments: [
            ...invoice.payments,
            {
              id: createId('payment'),
              date: paymentDate,
              amount: applied,
              method: paymentMethod,
            },
          ],
          paymentDate: settled ? paymentDate : invoice.paymentDate,
          paymentMethod,
        }
      }),
    }))
    setPaymentTarget(null)
    setPaymentAmount('')
  }

  function distributeAdvance(event: FormEvent) {
    event.preventDefault()
    let remaining = numberValue(advanceAmount)
    if (!advanceSupplier || remaining <= 0) return
    updateAccounting((current) => {
      const eligible = current.invoices
        .filter(
          (invoice) =>
            invoice.companyId === current.activeCompanyId &&
            invoice.supplierId === advanceSupplier &&
            !invoice.settled,
        )
        .sort((left, right) => left.date.localeCompare(right.date))
      const updated = new Map<string, AccountingInvoice>()
      for (const invoice of eligible) {
        if (remaining <= 0.001) break
        const applied = Math.min(remaining, invoiceRemaining(invoice))
        if (applied <= 0) continue
        const paidAmount = Math.min(invoice.total, invoice.paidAmount + applied)
        const settled = paidAmount >= invoice.total - 0.001
        updated.set(invoice.id, {
          ...invoice,
          paidAmount,
          settled,
          payments: [
            ...invoice.payments,
            {
              id: createId('payment'),
              date: today(),
              amount: applied,
              method: 'Bonifico',
            },
          ],
          paymentDate: settled ? today() : invoice.paymentDate,
          paymentMethod: 'Bonifico',
        })
        remaining -= applied
      }
      return {
        ...current,
        invoices: current.invoices.map(
          (invoice) => updated.get(invoice.id) ?? invoice,
        ),
      }
    })
    setAdvanceAmount('')
  }

  async function exportInvoicesExcel() {
    const XLSX = await import('xlsx')
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(
        invoices.map((invoice) => ({
          Data: invoice.date,
          Numero: invoice.number,
          Fornitore: invoice.supplierName,
          Venditore: invoice.sellerName,
          Descrizione: invoice.description,
          Categoria: invoice.category,
          Imponibile: invoice.taxableAmount,
          IVA: invoice.vat,
          Totale: invoice.total,
          Venit: invoice.theoreticalRevenue,
          'Merce senza fattura': invoice.unregisteredGoods,
          'Ricarico %': invoice.markupPercent,
          Pagata: invoice.settled ? 'Sì' : 'No',
          Residuo: invoiceRemaining(invoice),
          Scadenza: invoice.dueDate,
        })),
      ),
      'Fatture',
    )
    XLSX.writeFile(
      workbook,
      `fatture-${filenamePart(data.company?.name ?? '')}-${new Date().toISOString().slice(0, 10)}.xlsx`,
    )
  }

  return (
    <>
      {!archiveOnly && (
        <section className="stats-strip">
          <div><span>Totale fatture</span><strong>{money(total)}</strong></div>
          <div><span>Pagato</span><strong>{money(paid)}</strong></div>
          <div><span>Residuo</span><strong>{money(total - paid)}</strong></div>
          <div><span>Venit previsto</span><strong>{money(theoretical)}</strong></div>
        </section>
      )}

      {(!archiveOnly || editingId) && (
      <form
        className="panel accounting-form"
        onInvalidCapture={() => {
          submitAfterValidationRef.current = true
        }}
        onKeyDown={handleInvoiceEnter}
        onSubmit={submit}
        ref={invoiceFormRef}
      >
        <div className="panel-heading invoice-form-heading">
          <div className="invoice-form-title">
            <div>
              <span className="eyebrow">INSERIMENTO MANUALE</span>
              <h2>{editingId ? 'Modifica fattura' : 'Nuova fattura'}</h2>
            </div>
            <button className="button button-primary" type="submit">
              {editingId ? 'Salva modifiche' : 'Registra fattura'}
            </button>
          </div>
          <div className="invoice-entry-shortcuts">
            {!editingId && (
              <div className="invoice-entry-options">
                <label className="checkbox-row">
                  <input
                    checked={repeatDate}
                    onChange={(event) => setRepeatDate(event.target.checked)}
                    type="checkbox"
                  />
                  Mantieni ultima data
                </label>
                <label className="checkbox-row">
                  <input
                    checked={repeatSeller}
                    onChange={(event) =>
                      setRepeatSeller(event.target.checked)
                    }
                    type="checkbox"
                  />
                  Riparti da venditore
                </label>
                <label className="checkbox-row">
                  <input
                    checked={repeatSupplier}
                    onChange={(event) =>
                      setRepeatSupplier(event.target.checked)
                    }
                    type="checkbox"
                  />
                  Riparti da fornitore
                </label>
              </div>
            )}
            <button
              className="button button-secondary"
              onClick={resetInvoiceForm}
              type="button"
            >
              Reset dati
            </button>
          </div>
        </div>
        <div className="form-grid accounting-fields">
          <label>Data<input data-invoice-entry ref={dateInputRef} type="date" required value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} /></label>
          <label>Venditore<select data-invoice-entry ref={sellerInputRef} value={form.sellerId} onChange={(event) => setForm({ ...form, sellerId: event.target.value })}><option value="">Nessuno</option>{data.sellers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label>Fornitore<select data-invoice-entry ref={supplierInputRef} value={form.supplierId} onChange={(event) => selectInvoiceSupplier(event.target.value)}><option value="">Nessuno</option>{data.suppliers.map((item) => <option key={item.id} value={item.id}>{item.name}{item.cashUnregisteredByDefault ? ' · cash senza fattura' : ''}</option>)}</select></label>
          <label>Numero fattura<input data-invoice-entry placeholder="Facoltativo" value={form.number} onChange={(event) => setForm({ ...form, number: event.target.value })} /></label>
          <label>Descrizione<input data-invoice-entry value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
          <label>Categoria<select data-invoice-entry value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>{expenseCategories.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label>Imponibile<input data-invoice-entry ref={taxableAmountInputRef} inputMode="decimal" min="0" required value={form.taxableAmount} onChange={(event) => setForm({ ...form, taxableAmount: event.target.value })} /></label>
          <label>IVA facoltativa<input data-invoice-entry inputMode="decimal" min="0" placeholder="0,00" value={form.vat} onChange={(event) => setForm({ ...form, vat: event.target.value })} onKeyDown={(event) => { if (event.key === 'Tab' && !event.shiftKey && lines.length === 0) { event.preventDefault(); theoreticalRevenueInputRef.current?.focus() } }} /></label>
          <label>Totale automatico<input readOnly tabIndex={-1} value={money(invoiceTotal)} /></label>
          <label>Venit totale<input data-invoice-entry ref={theoreticalRevenueInputRef} disabled={lines.length > 0} inputMode="decimal" value={lines.length > 0 ? String(lineRevenue) : form.theoreticalRevenue} onChange={(event) => setForm({ ...form, theoreticalRevenue: event.target.value })} /></label>
          <label>Merce acquistata senza fattura<input data-invoice-entry inputMode="decimal" min="0" placeholder="0,00" readOnly={automaticCashPurchase} value={automaticCashPurchase ? String(invoiceTotal) : form.unregisteredGoods} onChange={(event) => setForm({ ...form, unregisteredGoods: event.target.value })} /></label>
          <label>Ricarico fattura<input readOnly tabIndex={-1} value={`${invoiceMarkup}%`} /></label>
          <label className="checkbox-row accounting-paid-field"><input type="checkbox" checked={automaticCashPurchase || form.settled} disabled={automaticCashPurchase} onChange={(event) => setForm({ ...form, settled: event.target.checked })} /> Già pagata</label>
        </div>
        <section className="invoice-lines-editor">
          <div className="panel-heading">
            <div>
              <strong>Righe prodotto</strong>
              <small>Costi e valori di vendita sono comprensivi di IVA.</small>
            </div>
          </div>
          <div className="invoice-line-form">
            <select
              aria-label="Prodotto della riga"
              onChange={(event) => selectProduct(event.target.value)}
              value={lineForm.productId}
            >
              <option value="">Prodotto libero</option>
              {data.products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name}
                  {product.code ? ` · ${product.code}` : ''}
                </option>
              ))}
            </select>
            <input
              onChange={(event) =>
                setLineForm({
                  ...lineForm,
                  description: event.target.value,
                })
              }
              placeholder="Descrizione prodotto"
              value={lineForm.description}
            />
            <input
              aria-label="Quantità"
              inputMode="decimal"
              min="0"
              onChange={(event) =>
                setLineForm({ ...lineForm, quantity: event.target.value })
              }
              placeholder="Quantità"
              value={lineForm.quantity}
            />
            <input
              aria-label="Costo unitario IVA inclusa"
              inputMode="decimal"
              min="0"
              onChange={(event) =>
                setLineForm({
                  ...lineForm,
                  unitPurchaseCostInclVat: event.target.value,
                })
              }
              placeholder="Costo IVA inclusa"
              value={lineForm.unitPurchaseCostInclVat}
            />
            <input
              aria-label="Vendita unitaria IVA inclusa"
              inputMode="decimal"
              min="0"
              onChange={(event) =>
                setLineForm({
                  ...lineForm,
                  unitSalePriceInclVat: event.target.value,
                })
              }
              placeholder="Vendita / venit"
              value={lineForm.unitSalePriceInclVat}
            />
            <button
              className="button button-secondary"
              onClick={addInvoiceLine}
              type="button"
            >
              Aggiungi riga
            </button>
          </div>
          {lines.length > 0 && (
            <div className="data-table-wrap">
              <table className="data-table invoice-lines-table">
                <thead>
                  <tr>
                    <th>Prodotto</th>
                    <th>Qtà</th>
                    <th>Costo totale</th>
                    <th>Venit totale</th>
                    <th>Ricarico</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line) => (
                    <tr key={line.id}>
                      <td>
                        {line.description}
                        <small>{line.productCode || 'Riga manuale'}</small>
                      </td>
                      <td>{line.quantity}</td>
                      <td>{money(line.purchaseTotalInclVat)}</td>
                      <td>{money(line.saleTotalInclVat)}</td>
                      <td>{line.markupPercent}%</td>
                      <td className="row-actions">
                        <button
                          className="danger-text"
                          onClick={() =>
                            setLines((current) =>
                              current.filter((item) => item.id !== line.id),
                            )
                          }
                          type="button"
                        >
                          Rimuovi
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        {editingId && (
          <div className="form-actions">
            <button className="button button-secondary" type="button" onClick={resetInvoiceForm}>Annulla</button>
          </div>
        )}
      </form>
      )}

      {!archiveOnly && (
      <form className="panel compact-form" onSubmit={distributeAdvance}>
        <div><strong>Anticipo fornitore a cascata</strong><small>Distribuisce il pagamento dalle fatture più vecchie.</small></div>
        <select required value={advanceSupplier} onChange={(event) => setAdvanceSupplier(event.target.value)}><option value="">Fornitore</option>{data.suppliers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
        <input inputMode="decimal" placeholder="Importo" required value={advanceAmount} onChange={(event) => setAdvanceAmount(event.target.value)} />
        <button className="button button-secondary" type="submit">Distribuisci</button>
      </form>
      )}

      <section className={`panel${archiveOnly ? ' invoice-archive-panel' : ''}`}>
        <div className="table-toolbar invoice-table-toolbar">
          <h2>Archivio fatture</h2>
          <div className="invoice-selection-total" aria-live="polite">
            <small>Totale fatture selezionate</small>
            <strong>{money(selectedInvoiceTotal)}</strong>
            <span>
              {selectedInvoices.length}{' '}
              {selectedInvoices.length === 1 ? 'fattura' : 'fatture'}
            </span>
          </div>
          <div className="invoice-filters">
            <select
              aria-label="Filtra per stato"
              value={filter}
              onChange={(event) => {
                setFilter(event.target.value as typeof filter)
                resetInvoiceSelection()
              }}
            >
              <option value="all">Tutti gli stati</option>
              <option value="open">Da pagare</option>
              <option value="paid">Pagate</option>
            </select>
            <select
              aria-label="Filtra per fornitore"
              value={activeSupplierFilter}
              onChange={(event) => {
                setSupplierFilter(event.target.value)
                resetInvoiceSelection()
              }}
            >
              <option value="">Tutti i fornitori</option>
              {data.suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
            </select>
            <select
              aria-label="Filtra per venditore"
              value={activeSellerFilter}
              onChange={(event) => {
                setSellerFilter(event.target.value)
                resetInvoiceSelection()
              }}
            >
              <option value="">Tutti i venditori</option>
              {data.sellers.map((seller) => <option key={seller.id} value={seller.id}>{seller.name}</option>)}
            </select>
            <input
              aria-label="Filtra per mese fattura"
              type="month"
              value={monthFilter}
              onChange={(event) => {
                setMonthFilter(event.target.value)
                resetInvoiceSelection()
              }}
            />
            <button className="button button-secondary" disabled={invoices.length === 0} onClick={() => void exportInvoicesExcel()} type="button">Esporta Excel</button>
          </div>
        </div>
        <div className={`data-table-wrap${archiveOnly ? ' invoice-archive-table-wrap' : ''}`}>
          <table className="data-table">
            <thead><tr><th className="invoice-selection-column"><input
              aria-label="Seleziona tutte le fatture visualizzate"
              checked={allVisibleInvoicesSelected}
              disabled={invoices.length === 0}
              onChange={toggleAllVisibleInvoices}
              type="checkbox"
            /></th><th className="invoice-paid-column">Pagata</th><th>Data / N.</th><th>Fornitore / venditore</th><th>Totale</th><th>Venit / ricarico</th><th>Merce senza fattura</th><th>Stato / scadenza</th><th>Azioni</th></tr></thead>
            <tbody>
              {invoices.map((invoice) => {
                const dueState = invoiceDueState(invoice)
                return (
                <tr className={`invoice-row ${dueState}`} key={invoice.id}>
                  <td className="invoice-selection-column"><input
                    aria-label={`Seleziona fattura ${invoice.number || invoice.date}`}
                    checked={selectedInvoiceIds.includes(invoice.id)}
                    onChange={() => toggleInvoiceSelection(invoice.id)}
                    type="checkbox"
                  /></td>
                  <td className="invoice-paid-column"><input
                    aria-label={`Segna fattura ${invoice.number || invoice.date} come pagata`}
                    checked={invoice.settled}
                    className="invoice-paid-checkbox"
                    onChange={() => toggleInvoicePaid(invoice.id)}
                    type="checkbox"
                  /></td>
                  <td><strong>{invoice.date}</strong><small>{invoice.number || '—'} · {invoice.category}</small></td>
                  <td>
                    {invoice.supplierName || '—'}
                    <small>
                      <span className={`seller-name ${sellerColorClass(invoice.sellerName)}`}>
                        {invoice.sellerName || 'Venditore non indicato'}
                      </span>
                      {' · '}{invoice.description}
                    </small>
                  </td>
                  <td>{money(invoice.total)}<small>Residuo {money(invoiceRemaining(invoice))}</small></td>
                  <td>{money(invoice.theoreticalRevenue)}<small>Ricarico {invoice.markupPercent}% · {invoice.lines.length} righe</small></td>
                  <td>{money(invoice.unregisteredGoods)}</td>
                  <td>
                    <span className={`record-status ${dueState}`}>
                      {dueState === 'paid'
                        ? 'Pagata'
                        : dueState === 'overdue'
                          ? 'Scaduta'
                          : dueState === 'due-soon'
                            ? 'In scadenza'
                            : invoice.paidAmount > 0
                              ? 'Parziale'
                              : 'Da pagare'}
                    </span>
                    <small>Scadenza {invoice.dueDate || 'non indicata'}</small>
                  </td>
                  <td className="row-actions">
                    <button type="button" onClick={() => edit(invoice)}>Modifica</button>
                    {!invoice.settled && <button type="button" onClick={() => { setPaymentTarget(invoice); setPaymentAmount('') }}>Acconto / paga</button>}
                    <button className="danger-text" type="button" onClick={() => remove(invoice.id)}>Elimina</button>
                  </td>
                </tr>
                )
              })}
            </tbody>
          </table>
          {invoices.length === 0 && <div className="empty-state compact-empty"><strong>Nessuna fattura</strong><span>{archiveOnly ? 'Modifica i filtri per cercare nell’archivio.' : "Usa il modulo sopra per l'inserimento manuale."}</span></div>}
        </div>
      </section>

      {paymentTarget && (
        <form className="panel payment-panel" onSubmit={addPayment}>
          <div><strong>Pagamento parziale o saldo fattura {paymentTarget.number}</strong><small>Inserisci un acconto oppure l'intero residuo di {money(invoiceRemaining(paymentTarget))}</small></div>
          <input inputMode="decimal" max={invoiceRemaining(paymentTarget)} placeholder="Importo pagato" required value={paymentAmount} onChange={(event) => setPaymentAmount(event.target.value)} />
          <input type="date" required value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} />
          <select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as PaymentMethod)}>{paymentMethods.map((item) => <option key={item}>{item}</option>)}</select>
          <button className="button button-primary" type="submit">Registra pagamento</button>
          <button className="button button-secondary" type="button" onClick={() => setPaymentTarget(null)}>Chiudi</button>
        </form>
      )}
    </>
  )
}

const emptyTaking = {
  date: today(),
  sellerId: '',
  cash: '',
  pos: '',
  vat: '',
  realTotal: '',
  withdrawal: '',
  unregisteredGoods: '',
}

function TakingsPanel() {
  const { state, updateAccounting } = useAppStore()
  const data = activeAccounting(state.accounting)
  const [form, setForm] = useState(emptyTaking)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [repeatDate, setRepeatDate] = useState(false)
  const [repeatSeller, setRepeatSeller] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [sellerFilter, setSellerFilter] = useState('')
  const [monthFilter, setMonthFilter] = useState('')
  const takingFormRef = useRef<HTMLFormElement>(null)
  const dateInputRef = useRef<HTMLInputElement>(null)
  const sellerInputRef = useRef<HTMLSelectElement>(null)
  const cashInputRef = useRef<HTMLInputElement>(null)
  const official = data.takings.reduce(
    (sum, item) => sum + item.cash + item.pos,
    0,
  )
  const real = data.takings.reduce(
    (sum, item) => sum + realTaking(item),
    0,
  )
  const activeSellerFilter = data.sellers.some(
    (seller) => seller.id === sellerFilter,
  )
    ? sellerFilter
    : ''
  const cashBalances = cashBalanceByTaking(data.takings)
  const takings = data.takings
    .filter(
      (taking) =>
        !activeSellerFilter || taking.sellerId === activeSellerFilter,
    )
    .filter(
      (taking) => !monthFilter || taking.date.slice(0, 7) === monthFilter,
    )
    .sort((left, right) => right.date.localeCompare(left.date))

  function pendingUnregisteredGoods(
    date: string,
    sellerId: string,
    excludedTakingId: string | null,
  ) {
    if (!date || !sellerId) return 0
    const invoiced = data.invoices
      .filter(
        (invoice) =>
          invoice.date === date && invoice.sellerId === sellerId,
      )
      .reduce((sum, invoice) => sum + invoice.unregisteredGoods, 0)
    const alreadyRecorded = data.takings
      .filter(
        (taking) =>
          taking.id !== excludedTakingId &&
          taking.date === date &&
          taking.sellerId === sellerId,
      )
      .reduce((sum, taking) => sum + taking.unregisteredGoods, 0)
    return roundMoney(Math.max(0, invoiced - alreadyRecorded))
  }

  function updateTakingDate(date: string) {
    setForm((current) => ({
      ...current,
      date,
      unregisteredGoods: String(
        pendingUnregisteredGoods(date, current.sellerId, editingId),
      ),
    }))
  }

  function updateTakingSeller(sellerId: string) {
    setForm((current) => ({
      ...current,
      sellerId,
      unregisteredGoods: String(
        pendingUnregisteredGoods(current.date, sellerId, editingId),
      ),
    }))
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    const realTotal = amountExpression(form.realTotal)
    if (realTotal === null) {
      setFormError(
        'Incasso reale non valido: usa numeri e i simboli +, -, ×, ÷ o parentesi.',
      )
      return
    }
    const cash = numberValue(form.cash)
    const pos = numberValue(form.pos)
    const vat = numberValue(form.vat)
    if (vat > cash + pos) {
      setFormError("L'IVA inclusa non può superare Cash + POS.")
      return
    }
    updateAccounting((current) =>
      mutateCompany(current, (companyId) => {
        const seller = data.sellers.find((item) => item.id === form.sellerId)
        const taking: AccountingTaking = {
          id: editingId ?? createId('taking'),
          companyId,
          date: form.date,
          sellerId: seller?.id ?? null,
          sellerName: seller?.name ?? '',
          cash,
          pos,
          vat,
          realTotal,
          withdrawal: numberValue(form.withdrawal),
          unregisteredGoods: numberValue(form.unregisteredGoods),
        }
        return {
          ...current,
          takings: editingId
            ? current.takings.map((item) =>
                item.id === editingId ? taking : item,
              )
            : [taking, ...current.takings],
        }
      }),
    )
    const wasEditing = editingId !== null
    setEditingId(null)
    setForm(
      wasEditing
        ? { ...emptyTaking, date: today() }
        : {
            ...emptyTaking,
            date: repeatDate ? form.date : today(),
            sellerId: repeatSeller ? form.sellerId : '',
          },
    )
    setFormError(null)
    if (!wasEditing) {
      window.requestAnimationFrame(() => {
        const nextInput = !repeatDate
          ? dateInputRef.current
          : !repeatSeller
            ? sellerInputRef.current
            : cashInputRef.current
        nextInput?.focus()
      })
    }
  }

  function calculateRealTotal() {
    const result = amountExpression(form.realTotal)
    if (result === null) {
      setFormError(
        'Incasso reale non valido: usa numeri e i simboli +, -, ×, ÷ o parentesi.',
      )
      return
    }
    setForm((current) => ({ ...current, realTotal: String(result) }))
    setFormError(null)
  }

  function handleTakingEnter(event: KeyboardEvent<HTMLFormElement>) {
    if (
      event.key !== 'Enter' ||
      event.shiftKey ||
      event.nativeEvent.isComposing
    ) {
      return
    }
    const target = event.target
    if (
      !(target instanceof HTMLInputElement) &&
      !(target instanceof HTMLSelectElement)
    ) {
      return
    }
    if (!target.matches('[data-taking-entry]')) return

    event.preventDefault()
    const takingForm = takingFormRef.current
    if (!takingForm) return
    const fields = Array.from(
      takingForm.querySelectorAll<HTMLInputElement | HTMLSelectElement>(
        '[data-taking-entry]',
      ),
    ).filter((field) => !field.disabled)
    const nextField = fields[fields.indexOf(target) + 1]
    if (nextField) {
      nextField.focus()
      return
    }
    takingForm.requestSubmit()
  }

  function editTaking(taking: AccountingTaking) {
    setEditingId(taking.id)
    setForm({
      date: taking.date,
      sellerId: taking.sellerId ?? '',
      cash: String(taking.cash),
      pos: String(taking.pos),
      vat: String(taking.vat),
      realTotal: String(taking.realTotal),
      withdrawal: String(taking.withdrawal),
      unregisteredGoods: String(taking.unregisteredGoods),
    })
    setFormError(null)
    window.requestAnimationFrame(() => {
      takingFormRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      })
      dateInputRef.current?.focus({ preventScroll: true })
    })
  }

  async function exportTakingsExcel() {
    const XLSX = await import('xlsx')
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(
        takings.map((taking) => ({
          Data: taking.date,
          Venditore: taking.sellerName,
          Cash: taking.cash,
          POS: taking.pos,
          'IVA inclusa': taking.vat,
          'Incasso reale': taking.realTotal,
          'Cash ritirato': taking.withdrawal,
          'Merce acquistata senza fattura': taking.unregisteredGoods,
          'Cash in mano': cashBalances.get(taking.id) ?? 0,
        })),
      ),
      'Incassi',
    )
    XLSX.writeFile(
      workbook,
      `incassi-${filenamePart(data.company?.name ?? '')}-${new Date().toISOString().slice(0, 10)}.xlsx`,
    )
  }

  return (
    <>
      <section className="stats-strip">
        <div><span>Ufficiale</span><strong>{money(official)}</strong></div>
        <div><span>Reale</span><strong>{money(real)}</strong></div>
        <div><span>Ritiri cash</span><strong>{money(data.takings.reduce((sum, item) => sum + item.withdrawal, 0))}</strong></div>
        <div><span>Merce senza fattura</span><strong>{money(data.takings.reduce((sum, item) => sum + item.unregisteredGoods, 0))}</strong></div>
      </section>
      <form
        className="panel accounting-form"
        onKeyDown={handleTakingEnter}
        onSubmit={submit}
        ref={takingFormRef}
      >
        <div className="panel-heading invoice-form-heading">
          <div>
            <span className="eyebrow">INSERIMENTO MANUALE</span>
            <h2>{editingId ? 'Modifica incasso' : 'Nuovo incasso'}</h2>
          </div>
          {!editingId && (
            <div className="invoice-entry-options">
              <label className="checkbox-row">
                <input
                  checked={repeatDate}
                  onChange={(event) => setRepeatDate(event.target.checked)}
                  type="checkbox"
                />
                Mantieni ultima data
              </label>
              <label className="checkbox-row">
                <input
                  checked={repeatSeller}
                  onChange={(event) => setRepeatSeller(event.target.checked)}
                  type="checkbox"
                />
                Mantieni venditore
              </label>
            </div>
          )}
        </div>
        <div className="form-grid accounting-fields">
          <label>Data<input data-taking-entry ref={dateInputRef} type="date" required value={form.date} onChange={(event) => updateTakingDate(event.target.value)} /></label>
          <label>Venditore<select data-taking-entry ref={sellerInputRef} value={form.sellerId} onChange={(event) => updateTakingSeller(event.target.value)}><option value="">Nessuno</option>{data.sellers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label>Cash<input data-taking-entry ref={cashInputRef} inputMode="decimal" value={form.cash} onChange={(event) => setForm({ ...form, cash: event.target.value })} /></label>
          <label>POS<input data-taking-entry inputMode="decimal" value={form.pos} onChange={(event) => setForm({ ...form, pos: event.target.value })} /></label>
          <label>IVA inclusa in Cash + POS<input data-taking-entry inputMode="decimal" value={form.vat} onChange={(event) => setForm({ ...form, vat: event.target.value })} /></label>
          <label>Incasso reale totale<input data-taking-entry inputMode="text" placeholder="Es. =1000+2000" value={form.realTotal} onBlur={calculateRealTotal} onChange={(event) => setForm({ ...form, realTotal: event.target.value })} /></label>
          <label>Cash ritirato<input data-taking-entry inputMode="decimal" value={form.withdrawal} onChange={(event) => setForm({ ...form, withdrawal: event.target.value })} /></label>
          <label>Merce aq. senza fattura<input data-taking-entry inputMode="decimal" min="0" placeholder="0,00" value={form.unregisteredGoods} onChange={(event) => setForm({ ...form, unregisteredGoods: event.target.value })} /></label>
        </div>
        {formError && <p className="import-message">{formError}</p>}
        <div className="form-actions">
          {editingId && <button className="button button-secondary" type="button" onClick={() => { setEditingId(null); setForm(emptyTaking); setFormError(null) }}>Annulla</button>}
          <button className="button button-primary" type="submit">{editingId ? 'Salva modifiche' : 'Registra incasso'}</button>
        </div>
      </form>
      <section className="panel">
        <div className="table-toolbar invoice-table-toolbar">
          <h2>Storico incassi</h2>
          <div className="invoice-filters">
            <select aria-label="Filtra incassi per venditore" value={activeSellerFilter} onChange={(event) => setSellerFilter(event.target.value)}>
              <option value="">Tutti i venditori</option>
              {data.sellers.map((seller) => <option key={seller.id} value={seller.id}>{seller.name}</option>)}
            </select>
            <input aria-label="Filtra incassi per mese" type="month" value={monthFilter} onChange={(event) => setMonthFilter(event.target.value)} />
            <button className="button button-secondary" disabled={takings.length === 0} onClick={() => void exportTakingsExcel()} type="button">Esporta Excel</button>
          </div>
        </div>
        <div className="data-table-wrap">
          <table className="data-table"><thead><tr><th>Data</th><th>Venditore</th><th>Cash</th><th>POS</th><th>IVA inclusa</th><th>Reale</th><th>Cash ritirato</th><th>Merce aq. senza fattura</th><th>Cash in mano</th><th>Azioni</th></tr></thead>
            <tbody>{takings.map((taking) => (
              <tr key={taking.id}><td>{taking.date}</td><td>{taking.sellerName || '—'}</td><td>{money(taking.cash)}</td><td>{money(taking.pos)}</td><td>{money(taking.vat)}</td><td>{money(realTaking(taking))}</td><td>{money(taking.withdrawal)}</td><td>{money(taking.unregisteredGoods)}</td><td><strong>{money(cashBalances.get(taking.id) ?? 0)}</strong></td><td className="row-actions"><button type="button" onClick={() => editTaking(taking)}>Modifica</button><button className="danger-text" type="button" onClick={() => updateAccounting((current) => ({ ...current, takings: current.takings.filter((item) => item.id !== taking.id) }))}>Elimina</button></td></tr>
            ))}</tbody>
          </table>
          {takings.length === 0 && <div className="empty-state compact-empty"><strong>Nessun incasso</strong><span>Modifica i filtri oppure registra un nuovo incasso.</span></div>}
        </div>
      </section>
    </>
  )
}

function ContactsPanel() {
  const { state, updateAccounting } = useAppStore()
  const data = activeAccounting(state.accounting)
  const [sellerName, setSellerName] = useState('')
  const [sellerPhone, setSellerPhone] = useState('')
  const [supplierName, setSupplierName] = useState('')
  const [supplierTaxId, setSupplierTaxId] = useState('')
  const [supplierCashUnregistered, setSupplierCashUnregistered] =
    useState(false)
  const [supplierPaymentTerms, setSupplierPaymentTerms] = useState(
    String(defaultPaymentTermsDays),
  )

  function addSeller(event: FormEvent) {
    event.preventDefault()
    updateAccounting((current) =>
      mutateCompany(current, (companyId) => ({
        ...current,
        sellers: [
          {
            id: createId('accounting-seller'),
            companyId,
            name: sellerName.trim(),
            email: '',
            phone: sellerPhone.trim(),
            city: '',
            notes: '',
          },
          ...current.sellers,
        ],
      })),
    )
    setSellerName('')
    setSellerPhone('')
  }

  function addSupplier(event: FormEvent) {
    event.preventDefault()
    updateAccounting((current) =>
      mutateCompany(current, (companyId) => ({
        ...current,
        suppliers: [
          {
            id: createId('accounting-supplier'),
            companyId,
            name: supplierName.trim(),
            taxId: supplierTaxId.trim(),
            email: '',
            phone: '',
            city: '',
            notes: '',
            paymentTermsDays: Math.max(
              0,
              Math.round(numberValue(supplierPaymentTerms)),
            ),
            cashUnregisteredByDefault: supplierCashUnregistered,
          },
          ...current.suppliers,
        ],
      })),
    )
    setSupplierName('')
    setSupplierTaxId('')
    setSupplierPaymentTerms(String(defaultPaymentTermsDays))
    setSupplierCashUnregistered(false)
  }

  function updateSupplierPaymentTerms(supplierId: string, value: string) {
    const paymentTermsDays = Math.max(
      0,
      Math.min(365, Math.round(numberValue(value))),
    )
    updateAccounting((current) => ({
      ...current,
      suppliers: current.suppliers.map((supplier) =>
        supplier.id === supplierId
          ? { ...supplier, paymentTermsDays }
          : supplier,
      ),
    }))
  }

  function updateSupplierCashUnregistered(
    supplierId: string,
    cashUnregisteredByDefault: boolean,
  ) {
    updateAccounting((current) => ({
      ...current,
      suppliers: current.suppliers.map((supplier) =>
        supplier.id === supplierId
          ? { ...supplier, cashUnregisteredByDefault }
          : supplier,
      ),
    }))
  }

  return (
    <section className="contact-columns">
      <article className="panel">
        <div className="panel-heading"><div><span className="eyebrow">ANAGRAFICA</span><h2>Venditori</h2></div><span className="count-pill">{data.sellers.length}</span></div>
        <form className="inline-create-form" onSubmit={addSeller}><input placeholder="Nome venditore" required value={sellerName} onChange={(event) => setSellerName(event.target.value)} /><input placeholder="Telefono" value={sellerPhone} onChange={(event) => setSellerPhone(event.target.value)} /><button className="button button-primary" type="submit">Aggiungi</button></form>
        <div className="record-list">{data.sellers.map((seller) => {
          const takings = data.takings.filter((item) => item.sellerId === seller.id)
          const total = takings.reduce((sum, item) => sum + realTaking(item), 0)
          return <div className="record-card" key={seller.id}><span><strong>{seller.name}</strong><small>{seller.phone || 'Nessun telefono'} · {takings.length} incassi</small></span><span><strong>{money(total)}</strong><button className="danger-text" type="button" onClick={() => updateAccounting((current) => ({ ...current, sellers: current.sellers.filter((item) => item.id !== seller.id) }))}>Elimina</button></span></div>
        })}</div>
      </article>
      <article className="panel">
        <div className="panel-heading"><div><span className="eyebrow">ANAGRAFICA</span><h2>Fornitori</h2></div><span className="count-pill">{data.suppliers.length}</span></div>
        <form className="inline-create-form supplier-create-form" onSubmit={addSupplier}><input placeholder="Ragione sociale" required value={supplierName} onChange={(event) => setSupplierName(event.target.value)} /><input placeholder="Partita IVA" value={supplierTaxId} onChange={(event) => setSupplierTaxId(event.target.value)} /><input aria-label="Giorni per il pagamento" min="0" max="365" placeholder="Giorni pagamento" type="number" value={supplierPaymentTerms} onChange={(event) => setSupplierPaymentTerms(event.target.value)} /><label className="supplier-cash-default"><input checked={supplierCashUnregistered} onChange={(event) => setSupplierCashUnregistered(event.target.checked)} type="checkbox" /> Sempre cash senza fattura</label><button className="button button-primary" type="submit">Aggiungi</button></form>
        <div className="record-list">{data.suppliers.map((supplier) => {
          const invoices = data.invoices.filter((item) => item.supplierId === supplier.id)
          const total = invoices.reduce(
            (sum, item) => sum + item.total + item.unregisteredGoods,
            0,
          )
          return <div className="record-card supplier-card" key={supplier.id}><span><strong>{supplier.name}</strong><small>{supplier.taxId || 'P.IVA non indicata'} · {invoices.length} fatture</small></span><label className="supplier-payment-terms">Pagamento entro <input aria-label={`Giorni pagamento ${supplier.name}`} defaultValue={supplier.paymentTermsDays} min="0" max="365" onBlur={(event) => updateSupplierPaymentTerms(supplier.id, event.target.value)} type="number" /> giorni</label><label className="supplier-cash-default"><input checked={supplier.cashUnregisteredByDefault} onChange={(event) => updateSupplierCashUnregistered(supplier.id, event.target.checked)} type="checkbox" /> Sempre cash senza fattura</label><span><strong>{money(total)}</strong><button className="danger-text" type="button" onClick={() => updateAccounting((current) => ({ ...current, suppliers: current.suppliers.filter((item) => item.id !== supplier.id) }))}>Elimina</button></span></div>
        })}</div>
      </article>
    </section>
  )
}

function ExpensesPanel() {
  const { state, updateAccounting } = useAppStore()
  const data = activeAccounting(state.accounting)
  const [expenseDescription, setExpenseDescription] = useState('')
  const [expenseAmount, setExpenseAmount] = useState('')
  const [expenseType, setExpenseType] =
    useState<AccountingExpense['type']>('tassa')
  const [expenseDate, setExpenseDate] = useState(today())
  const [expenseRecurrence, setExpenseRecurrence] =
    useState<AccountingExpense['recurrence']>('once')
  const [expenseEndDate, setExpenseEndDate] = useState('')
  const [expenseSellerId, setExpenseSellerId] = useState('')
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null)
  const [rentalProperty, setRentalProperty] = useState('')
  const [rentalTotal, setRentalTotal] = useState('')
  const [accountantDescription, setAccountantDescription] = useState('')
  const [accountantTotal, setAccountantTotal] = useState('')

  function addExpense(event: FormEvent) {
    event.preventDefault()
    const seller = data.sellers.find((item) => item.id === expenseSellerId)
    updateAccounting((current) =>
      mutateCompany(current, (companyId) => ({
        ...current,
        expenses: editingExpenseId
          ? current.expenses.map((expense) =>
              expense.id === editingExpenseId
                ? {
                    ...expense,
                    type: expenseType,
                    description: expenseDescription.trim(),
                    sellerId:
                      expenseType === 'stipendio' ? seller?.id ?? null : null,
                    sellerName:
                      expenseType === 'stipendio' ? seller?.name ?? '' : '',
                    amount: numberValue(expenseAmount),
                    date: expenseDate,
                    recurrence: expenseRecurrence,
                    recurrenceEndDate: expenseEndDate || null,
                  }
                : expense,
            )
          : [
              {
                id: createId('expense'),
                companyId,
                type: expenseType,
                description: expenseDescription.trim(),
                sellerId:
                  expenseType === 'stipendio' ? seller?.id ?? null : null,
                sellerName:
                  expenseType === 'stipendio' ? seller?.name ?? '' : '',
                amount: numberValue(expenseAmount),
                date: expenseDate,
                recurrence: expenseRecurrence,
                recurrenceEndDate: expenseEndDate || null,
                notes: '',
                settled: false,
              },
              ...current.expenses,
            ],
      })),
    )
    setEditingExpenseId(null)
    setExpenseDescription('')
    setExpenseAmount('')
    setExpenseDate(today())
    setExpenseRecurrence('once')
    setExpenseEndDate('')
    setExpenseSellerId('')
  }

  function editExpense(expense: AccountingExpense) {
    setEditingExpenseId(expense.id)
    setExpenseType(expense.type)
    setExpenseDescription(expense.description)
    setExpenseAmount(String(expense.amount))
    setExpenseDate(expense.date)
    setExpenseRecurrence(expense.recurrence)
    setExpenseEndDate(expense.recurrenceEndDate ?? '')
    setExpenseSellerId(expense.sellerId ?? '')
  }

  function addRental(event: FormEvent) {
    event.preventDefault()
    const total = numberValue(rentalTotal)
    const vat = splitVat(total, 22)
    updateAccounting((current) =>
      mutateCompany(current, (companyId) => {
        const rental: Rental = {
          id: createId('rental'),
          companyId,
          property: rentalProperty.trim(),
          tenant: '',
          total,
          vatRate: 22,
          taxableAmount: vat.taxableAmount,
          vat: vat.vat,
          date: today(),
          period: new Intl.DateTimeFormat('it-IT', {
            month: 'long',
            year: 'numeric',
          }).format(new Date()),
          settled: false,
          paidAmount: 0,
          paymentDate: null,
          paymentMethod: null,
        }
        return { ...current, rentals: [rental, ...current.rentals] }
      }),
    )
    setRentalProperty('')
    setRentalTotal('')
  }

  function addAccountantInvoice(event: FormEvent) {
    event.preventDefault()
    const total = numberValue(accountantTotal)
    const vat = splitVat(total, 22)
    updateAccounting((current) =>
      mutateCompany(current, (companyId) => {
        const invoice: AccountantInvoice = {
          id: createId('accountant-invoice'),
          companyId,
          description: accountantDescription.trim(),
          number: '',
          total,
          vatRate: 22,
          taxableAmount: vat.taxableAmount,
          vat: vat.vat,
          date: today(),
          dueDate: addDays(today(), 10),
          settled: false,
          paidAmount: 0,
          paymentDate: null,
          paymentMethod: null,
        }
        return {
          ...current,
          accountantInvoices: [invoice, ...current.accountantInvoices],
        }
      }),
    )
    setAccountantDescription('')
    setAccountantTotal('')
  }

  return (
    <section className="expense-grid">
      <article className="panel">
        <div className="panel-heading"><div><span className="eyebrow">USCITE</span><h2>Stipendi, tasse e altre spese</h2></div></div>
        <form className="inline-create-form vertical-form" onSubmit={addExpense}>
          <select value={expenseType} onChange={(event) => setExpenseType(event.target.value as AccountingExpense['type'])}><option value="tassa">Tassa</option><option value="stipendio">Stipendio</option><option value="contabile">Costo contabile</option><option value="altra">Altra spesa</option></select>
          {expenseType === 'stipendio' && (
            <select value={expenseSellerId} onChange={(event) => setExpenseSellerId(event.target.value)}>
              <option value="">Dipendente / venditrice</option>
              {data.sellers.map((seller) => <option key={seller.id} value={seller.id}>{seller.name}</option>)}
            </select>
          )}
          <input placeholder="Descrizione" required value={expenseDescription} onChange={(event) => setExpenseDescription(event.target.value)} />
          <input inputMode="decimal" placeholder="Importo" required value={expenseAmount} onChange={(event) => setExpenseAmount(event.target.value)} />
          <input aria-label="Data spesa o inizio ricorrenza" type="date" required value={expenseDate} onChange={(event) => setExpenseDate(event.target.value)} />
          <select value={expenseRecurrence} onChange={(event) => setExpenseRecurrence(event.target.value as AccountingExpense['recurrence'])}>
            <option value="once">Spesa singola</option>
            <option value="monthly">Spesa fissa mensile</option>
          </select>
          {expenseRecurrence === 'monthly' && (
            <label>Fine ricorrenza (facoltativa)<input type="date" min={expenseDate} value={expenseEndDate} onChange={(event) => setExpenseEndDate(event.target.value)} /></label>
          )}
          <div className="form-actions">
            {editingExpenseId && <button className="button button-secondary" type="button" onClick={() => setEditingExpenseId(null)}>Annulla</button>}
            <button className="button button-primary" type="submit">{editingExpenseId ? 'Salva modifica' : 'Registra'}</button>
          </div>
        </form>
        <ExpenseList items={data.expenses} onEdit={editExpense} onUpdate={(items) => updateAccounting((current) => ({ ...current, expenses: [...current.expenses.filter((expense) => expense.companyId !== current.activeCompanyId), ...items] }))} />
      </article>
      <article className="panel">
        <div className="panel-heading"><div><span className="eyebrow">CANONI</span><h2>Gestione affitti</h2></div></div>
        <form className="inline-create-form vertical-form" onSubmit={addRental}>
          <input placeholder="Immobile / locale" required value={rentalProperty} onChange={(event) => setRentalProperty(event.target.value)} />
          <input inputMode="decimal" placeholder="Totale IVA inclusa" required value={rentalTotal} onChange={(event) => setRentalTotal(event.target.value)} />
          <button className="button button-primary" type="submit">Registra</button>
        </form>
        <SettlementList items={data.rentals} kind="rentals" />
      </article>
      <article className="panel">
        <div className="panel-heading"><div><span className="eyebrow">PRESTAZIONI</span><h2>Fatture del contabile</h2></div></div>
        <form className="inline-create-form vertical-form" onSubmit={addAccountantInvoice}>
          <input placeholder="Descrizione" required value={accountantDescription} onChange={(event) => setAccountantDescription(event.target.value)} />
          <input inputMode="decimal" placeholder="Totale IVA inclusa" required value={accountantTotal} onChange={(event) => setAccountantTotal(event.target.value)} />
          <button className="button button-primary" type="submit">Registra</button>
        </form>
        <SettlementList items={data.accountantInvoices} kind="accountantInvoices" />
      </article>
    </section>
  )
}

function ExpenseList({
  items,
  onEdit,
  onUpdate,
}: {
  items: AccountingExpense[]
  onEdit: (item: AccountingExpense) => void
  onUpdate: (items: AccountingExpense[]) => void
}) {
  return <div className="record-list">{items.map((item) => <div className="record-card" key={item.id}><span><strong>{item.description}</strong><small>{item.type} · {item.date}{item.sellerName ? ` · ${item.sellerName}` : ''}{item.recurrence === 'monthly' ? ` · mensile${item.recurrenceEndDate ? ` fino al ${item.recurrenceEndDate}` : ''}` : ''}</small></span><span><strong>{money(item.amount)}{item.recurrence === 'monthly' ? '/mese' : ''}</strong><button type="button" onClick={() => onEdit(item)}>Modifica</button><button type="button" onClick={() => onUpdate(items.map((current) => current.id === item.id ? { ...current, settled: !current.settled } : current))}>{item.settled ? 'Pagata' : 'Da pagare'}</button><button className="danger-text" type="button" onClick={() => onUpdate(items.filter((current) => current.id !== item.id))}>Elimina</button></span></div>)}</div>
}

function SettlementList({
  items,
  kind,
}: {
  items: Rental[] | AccountantInvoice[]
  kind: 'rentals' | 'accountantInvoices'
}) {
  const { updateAccounting } = useAppStore()
  return <div className="record-list">{items.map((item) => {
    const label = 'property' in item ? item.property : item.description
    return <div className="record-card" key={item.id}><span><strong>{label}</strong><small>{item.date} · IVA {money(item.vat)}</small></span><span><strong>{money(item.total)}</strong><button type="button" onClick={() => updateAccounting((current) => ({ ...current, [kind]: current[kind].map((currentItem) => currentItem.id === item.id ? { ...currentItem, settled: !currentItem.settled, paidAmount: currentItem.settled ? 0 : currentItem.total, paymentDate: currentItem.settled ? null : today(), paymentMethod: currentItem.settled ? null : 'Bonifico' } : currentItem) }))}>{item.settled ? 'Pagata' : 'Da pagare'}</button><button className="danger-text" type="button" onClick={() => updateAccounting((current) => ({ ...current, [kind]: current[kind].filter((currentItem) => currentItem.id !== item.id) }))}>Elimina</button></span></div>
  })}</div>
}
