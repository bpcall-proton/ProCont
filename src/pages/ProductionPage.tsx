import { useState, type FormEvent } from 'react'
import {
  activeAccounting,
  allocatedExpense,
  money,
  roundMoney,
  today,
} from '../domain/accounting'
import { createId } from '../domain/defaults'
import type {
  ProductionEntryPeriod,
  ProductionReportPeriod,
} from '../domain/types'
import { useAppStore } from '../store/AppStoreContext'

type SelectedProductId = string | 'all' | null
type DetailCard = 'quantity' | 'costs' | 'unit-cost' | 'profit'
const noIds: string[] = []

function settingsFormFor(
  settings:
    | {
        productName: string
        salePrice: number
        sellerIds: string[]
        expenseIds?: string[]
        workerIds?: string[]
      }
    | null,
) {
  return {
    productName: settings?.productName ?? '',
    salePrice: settings ? String(settings.salePrice) : '',
    sellerIds: settings?.sellerIds ?? [],
    expenseIds: settings?.expenseIds ?? [],
    workerIds: settings?.workerIds ?? [],
  }
}

function configuredIds(value: string[] | undefined) {
  return Array.isArray(value) ? value : noIds
}

function numberValue(value: string) {
  const parsed = Number(value.replace(',', '.'))
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0
}

function startOfWeek(value: string) {
  const date = new Date(`${value}T00:00:00Z`)
  const day = date.getUTCDay()
  date.setUTCDate(date.getUTCDate() + (day === 0 ? -6 : 1 - day))
  return date.toISOString().slice(0, 10)
}

function addDays(value: string, days: number) {
  const date = new Date(`${value}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function rangeFor(period: ProductionReportPeriod, selected: string) {
  if (period === 'day') return { start: selected, end: selected }
  if (period === 'week') {
    const start = startOfWeek(selected)
    return { start, end: addDays(start, 6) }
  }
  const date = new Date(`${selected}T00:00:00Z`)
  const year = date.getUTCFullYear()
  const month = date.getUTCMonth()
  return {
    start: new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10),
    end: new Date(Date.UTC(year, month + 1, 0)).toISOString().slice(0, 10),
  }
}

function allocatedMonthlyCost(
  amount: number,
  date: string,
  rangeStart: string,
  rangeEnd: string,
) {
  const [year, month] = date.split('-').map(Number)
  if (!year || !month || amount <= 0) return 0
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const monthStart = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-01`
  const monthEnd = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`
  const start = rangeStart > monthStart ? rangeStart : monthStart
  const end = rangeEnd < monthEnd ? rangeEnd : monthEnd
  if (start > end) return 0
  const elapsedDays =
    Math.round(
      (new Date(`${end}T00:00:00Z`).getTime() -
        new Date(`${start}T00:00:00Z`).getTime()) /
        86_400_000,
    ) + 1
  return (amount * elapsedDays) / daysInMonth
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(`${value}T12:00:00Z`))
}

export function ProductionPage() {
  const { state, updateAccounting } = useAppStore()
  const data = activeAccounting(state.accounting)
  const companyId = state.accounting.activeCompanyId
  const firstProduct = data.productionSettings[0] ?? null
  const [selectedProductId, setSelectedProductId] = useState<SelectedProductId>(
    firstProduct?.id ?? null,
  )
  const savedSettings =
    selectedProductId === 'all'
      ? null
      : (data.productionSettings.find(
          (settings) => settings.id === selectedProductId,
        ) ?? null)
  const [settingsForm, setSettingsForm] = useState(() =>
    settingsFormFor(firstProduct),
  )
  const [entryForm, setEntryForm] = useState<{
    period: ProductionEntryPeriod
    date: string
    quantity: string
  }>({
    period: 'day',
    date: today(),
    quantity: '',
  })
  const [reportPeriod, setReportPeriod] = useState<ProductionReportPeriod>(
    data.productionViewSettings?.reportPeriod ?? 'month',
  )
  const [selectedDate, setSelectedDate] = useState(today())
  const [formError, setFormError] = useState('')
  const [detailCard, setDetailCard] = useState<DetailCard>('costs')
  const range = rangeFor(reportPeriod, selectedDate)
  const showingAllProducts =
    selectedProductId === 'all' || selectedProductId === null
  const selectedSellerIds = configuredIds(savedSettings?.sellerIds)
  const selectedWorkerIds = configuredIds(savedSettings?.workerIds)

  const results = (() => {
    const inRange = (date: string) => date >= range.start && date <= range.end
    const products = showingAllProducts
        ? data.productionSettings
        : data.productionSettings.filter(
            (product) => product.id === selectedProductId,
          )
    const productsResults = products.map((product) => {
      const productSellerIds = configuredIds(product.sellerIds)
      const productExpenseIds = configuredIds(product.expenseIds)
      const productWorkerIds = configuredIds(product.workerIds)
      const invoices = data.invoices
        .filter(
          (invoice) =>
            invoice.sellerId !== null &&
            productSellerIds.includes(invoice.sellerId) &&
            inRange(invoice.date),
        )
        .map((invoice) => ({
          invoice,
          amount: roundMoney(
            (invoice.total + invoice.unregisteredGoods) /
              Math.max(
                1,
                data.productionSettings.filter(
                  (configuredProduct) =>
                    invoice.sellerId !== null &&
                    configuredIds(configuredProduct.sellerIds).includes(
                      invoice.sellerId,
                    ),
                ).length,
              ),
          ),
        }))
      const fixedExpenses = data.expenses
        .filter(
          (expense) =>
            expense.type !== 'stipendio' &&
            expense.recurrence === 'monthly' &&
            productExpenseIds.includes(expense.id),
        )
        .map((expense) => ({
          expense,
          amount: roundMoney(
            allocatedExpense(expense, range.start, range.end) /
              Math.max(
                1,
                data.productionSettings.filter(
                  (configuredProduct) =>
                    configuredIds(configuredProduct.expenseIds).includes(
                      expense.id,
                    ),
                ).length,
              ),
          ),
        }))
        .filter((item) => item.amount > 0)
      const salaryExpenses = data.expenses
        .filter(
          (expense) =>
            expense.type === 'stipendio' &&
            expense.sellerId !== null &&
            productWorkerIds.includes(expense.sellerId),
        )
        .map((expense) => ({
          expense,
          amount: roundMoney(
            allocatedExpense(expense, range.start, range.end) /
              Math.max(
                1,
                data.productionSettings.filter(
                  (configuredProduct) =>
                    expense.sellerId !== null &&
                    configuredIds(configuredProduct.workerIds).includes(
                      expense.sellerId,
                    ),
                ).length,
              ),
          ),
        }))
        .filter((item) => item.amount > 0)
      const rentals = data.rentals
        .map((rental) => ({
          rental,
          amount: roundMoney(
            allocatedMonthlyCost(
              rental.total,
              rental.date,
              range.start,
              range.end,
            ) / Math.max(1, data.productionSettings.length),
          ),
        }))
        .filter((item) => item.amount > 0)
      const productionEntries = data.productionEntries.filter(
        (entry) =>
          entry.productId === product.id &&
          inRange(entry.date) &&
          (reportPeriod !== 'day' || entry.period === 'day'),
      )
      const invoiceCosts = invoices.reduce(
        (total, item) => total + item.amount,
        0,
      )
      const fixedCosts = fixedExpenses.reduce(
        (total, item) => total + item.amount,
        0,
      ) + rentals.reduce((total, item) => total + item.amount, 0)
      const salaryCosts = salaryExpenses.reduce(
        (total, item) => total + item.amount,
        0,
      )
      const quantity = productionEntries.reduce(
        (total, entry) => total + entry.quantity,
        0,
      )
      const totalCosts = invoiceCosts + fixedCosts + salaryCosts
      const revenue = quantity * product.salePrice
      return {
        product,
        invoices,
        fixedExpenses,
        rentals,
        salaryExpenses,
        productionEntries,
        invoiceCosts: roundMoney(invoiceCosts),
        fixedCosts: roundMoney(fixedCosts),
        salaryCosts: roundMoney(salaryCosts),
        quantity,
        totalCosts: roundMoney(totalCosts),
        unitCost: quantity > 0 ? roundMoney(totalCosts / quantity) : 0,
        revenue: roundMoney(revenue),
        profit: roundMoney(revenue - totalCosts),
      }
    })
    const uniqueInvoices = data.invoices.filter(
      (invoice) =>
        invoice.sellerId !== null &&
        inRange(invoice.date) &&
        products.some((product) =>
          configuredIds(product.sellerIds).includes(invoice.sellerId ?? ''),
        ),
    )
    const uniqueFixedExpenses = data.expenses.filter(
      (expense) =>
        expense.type !== 'stipendio' &&
        expense.recurrence === 'monthly' &&
        products.some((product) =>
          configuredIds(product.expenseIds).includes(expense.id),
        ),
    )
    const uniqueSalaryExpenses = data.expenses.filter(
      (expense) =>
        expense.type === 'stipendio' &&
        expense.sellerId !== null &&
        products.some((product) =>
          configuredIds(product.workerIds).includes(expense.sellerId ?? ''),
        ),
    )
    const uniqueRentals = data.rentals
      .map((rental) => ({
        rental,
        amount: allocatedMonthlyCost(
          rental.total,
          rental.date,
          range.start,
          range.end,
        ),
      }))
      .filter((item) => item.amount > 0)
    const invoiceCosts = showingAllProducts
      ? uniqueInvoices.reduce(
          (total, invoice) =>
            total + invoice.total + invoice.unregisteredGoods,
          0,
        )
      : productsResults.reduce(
          (total, product) => total + product.invoiceCosts,
          0,
        )
    const fixedCosts = showingAllProducts
      ? uniqueFixedExpenses.reduce(
          (total, expense) =>
            total + allocatedExpense(expense, range.start, range.end),
          0,
        ) + uniqueRentals.reduce((total, item) => total + item.amount, 0)
      : productsResults.reduce(
          (total, product) => total + product.fixedCosts,
          0,
        )
    const salaryCosts = showingAllProducts
      ? uniqueSalaryExpenses.reduce(
          (total, expense) =>
            total + allocatedExpense(expense, range.start, range.end),
          0,
        )
      : productsResults.reduce(
          (total, product) => total + product.salaryCosts,
          0,
        )
    const quantity = productsResults.reduce(
      (total, product) => total + product.quantity,
      0,
    )
    const totalCosts = invoiceCosts + fixedCosts + salaryCosts
    const revenue = productsResults.reduce(
      (total, product) => total + product.revenue,
      0,
    )
    return {
      invoiceCosts: roundMoney(invoiceCosts),
      fixedCosts: roundMoney(fixedCosts),
      salaryCosts: roundMoney(salaryCosts),
      quantity,
      totalCosts: roundMoney(totalCosts),
      unitCost: quantity > 0 ? roundMoney(totalCosts / quantity) : 0,
      revenue: roundMoney(revenue),
      profit: roundMoney(revenue - totalCosts),
      invoices: uniqueInvoices.length,
      products: productsResults,
    }
  })()

  function selectProduct(productId: string) {
    const product =
      data.productionSettings.find((settings) => settings.id === productId) ??
      null
    setSelectedProductId(productId)
    setSettingsForm(settingsFormFor(product))
    setEntryForm((current) => ({ ...current, quantity: '' }))
    setFormError('')
  }

  function selectAllProducts() {
    setSelectedProductId('all')
    setEntryForm((current) => ({ ...current, quantity: '' }))
    setFormError('')
  }

  function startAddingProduct() {
    setSelectedProductId(null)
    setSettingsForm(settingsFormFor(null))
    setEntryForm((current) => ({ ...current, quantity: '' }))
    setFormError('')
  }

  function persistSelectedIds(
    field: 'sellerIds' | 'expenseIds' | 'workerIds',
    ids: string[],
  ) {
    if (!savedSettings) return
    updateAccounting((current) => ({
      ...current,
      productionSettings: current.productionSettings.map((settings) =>
        settings.id === savedSettings.id
          ? { ...settings, [field]: ids }
          : settings,
      ),
    }))
  }

  function toggleSeller(sellerId: string) {
    const sellerIds = settingsForm.sellerIds.includes(sellerId)
      ? settingsForm.sellerIds.filter((id) => id !== sellerId)
      : [...settingsForm.sellerIds, sellerId]
    setSettingsForm((current) => ({ ...current, sellerIds }))
    persistSelectedIds('sellerIds', sellerIds)
  }

  function toggleWorker(workerId: string) {
    const workerIds = settingsForm.workerIds.includes(workerId)
      ? settingsForm.workerIds.filter((id) => id !== workerId)
      : [...settingsForm.workerIds, workerId]
    setSettingsForm((current) => ({ ...current, workerIds }))
    persistSelectedIds('workerIds', workerIds)
  }

  function toggleExpense(expenseId: string) {
    const expenseIds = settingsForm.expenseIds.includes(expenseId)
      ? settingsForm.expenseIds.filter((id) => id !== expenseId)
      : [...settingsForm.expenseIds, expenseId]
    setSettingsForm((current) => ({ ...current, expenseIds }))
    persistSelectedIds('expenseIds', expenseIds)
  }

  function changeReportPeriod(reportPeriod: ProductionReportPeriod) {
    setReportPeriod(reportPeriod)
    if (!companyId) return
    updateAccounting((current) => ({
      ...current,
      productionViewSettings: [
        ...current.productionViewSettings.filter(
          (settings) => settings.companyId !== companyId,
        ),
        { companyId, reportPeriod },
      ],
    }))
  }

  function saveSettings(event: FormEvent) {
    event.preventDefault()
    if (!companyId) return
    if (settingsForm.sellerIds.length === 0) {
      setFormError('Seleziona almeno un venditore da includere nei costi.')
      return
    }
    const productId = savedSettings?.id ?? createId('production-product')
    const nextSettings = {
      id: productId,
      companyId,
      productName: settingsForm.productName.trim(),
      salePrice: numberValue(settingsForm.salePrice),
      sellerIds: settingsForm.sellerIds,
      expenseIds: settingsForm.expenseIds,
      workerIds: settingsForm.workerIds,
    }
    updateAccounting((current) => ({
      ...current,
      productionSettings: current.productionSettings.some(
        (settings) => settings.id === productId,
      )
        ? current.productionSettings.map((settings) =>
            settings.id === productId ? nextSettings : settings,
          )
        : [...current.productionSettings, nextSettings],
    }))
    setSelectedProductId(productId)
    setFormError('')
  }

  function saveEntry(event: FormEvent) {
    event.preventDefault()
    if (!companyId) return
    if (!savedSettings) {
      setFormError('Salva prima le impostazioni del prodotto.')
      return
    }
    const quantity = numberValue(entryForm.quantity)
    if (quantity <= 0) {
      setFormError('Inserisci una quantità prodotta maggiore di zero.')
      return
    }
    const date =
      entryForm.period === 'week'
        ? startOfWeek(entryForm.date)
        : entryForm.date
    const weekStart = startOfWeek(date)
    const weekEnd = addDays(weekStart, 6)
    const companyEntries = data.productionEntries.filter(
      (entry) => entry.productId === savedSettings.id,
    )
    const hasConflict =
      entryForm.period === 'week'
        ? companyEntries.some(
            (entry) =>
              entry.period === 'day' &&
              entry.date >= weekStart &&
              entry.date <= weekEnd,
          )
        : companyEntries.some(
            (entry) =>
              entry.period === 'week' &&
              entry.date === startOfWeek(entryForm.date),
          )
    if (hasConflict) {
      setFormError(
        'Questa settimana contiene già quantità dell’altro tipo. Eliminale prima per evitare un doppio conteggio.',
      )
      return
    }
    const existing = companyEntries.find(
      (entry) => entry.period === entryForm.period && entry.date === date,
    )
    updateAccounting((current) => ({
      ...current,
      productionEntries: existing
        ? current.productionEntries.map((entry) =>
            entry.id === existing.id ? { ...entry, quantity } : entry,
          )
        : [
            {
              id: createId('production'),
              companyId,
              productId: savedSettings.id,
              period: entryForm.period,
              date,
              quantity,
            },
            ...current.productionEntries,
          ],
    }))
    setEntryForm((current) => ({ ...current, quantity: '' }))
    setFormError('')
  }

  function removeEntry(id: string) {
    if (!window.confirm('Eliminare questa quantità prodotta?')) return
    updateAccounting((current) => ({
      ...current,
      productionEntries: current.productionEntries.filter(
        (entry) => entry.id !== id,
      ),
    }))
  }

  function removeProduct() {
    if (!savedSettings) return
    if (
      !window.confirm(
        `Eliminare "${savedSettings.productName}" e tutte le quantità registrate?`,
      )
    ) {
      return
    }
    const remainingProducts = data.productionSettings.filter(
      (settings) => settings.id !== savedSettings.id,
    )
    updateAccounting((current) => ({
      ...current,
      productionSettings: current.productionSettings.filter(
        (settings) => settings.id !== savedSettings.id,
      ),
      productionEntries: current.productionEntries.filter(
        (entry) => entry.productId !== savedSettings.id,
      ),
    }))
    const nextProduct = remainingProducts[0] ?? null
    setSelectedProductId(nextProduct?.id ?? null)
    setSettingsForm(settingsFormFor(nextProduct))
    setEntryForm((current) => ({ ...current, quantity: '' }))
    setFormError('')
  }

  const sellerNames = data.sellers
    .filter((seller) => selectedSellerIds.includes(seller.id))
    .map((seller) => seller.name)
    .join(', ')
  const workerNames = data.sellers
    .filter((seller) => selectedWorkerIds.includes(seller.id))
    .map((seller) => seller.name)
    .join(', ')
  const entries = data.productionEntries
    .filter(
      (entry) =>
        showingAllProducts ||
        entry.productId === selectedProductId,
    )
    .sort((left, right) => right.date.localeCompare(left.date))
  const quantityDetails = results.products.flatMap((product) =>
    product.productionEntries.map((entry) => ({
      entry,
      productId: product.product.id,
      productName: product.product.productName,
    })),
  )
  const invoiceDetails = (() => {
    const details = results.products.flatMap((product) =>
      product.invoices.map(({ invoice, amount }) => ({
        invoice,
        amount,
        productId: product.product.id,
        productName: product.product.productName,
      })),
    )
    if (!showingAllProducts) return details
    const uniqueDetails = new Map<
      string,
      {
        invoice: (typeof details)[number]['invoice']
        amount: number
        productId: string
        productName: string
      }
    >()
    for (const detail of details) {
      const current = uniqueDetails.get(detail.invoice.id)
      uniqueDetails.set(detail.invoice.id, {
        ...detail,
        amount:
          detail.invoice.total + detail.invoice.unregisteredGoods,
        productName: current
          ? `${current.productName}, ${detail.productName}`
          : detail.productName,
      })
    }
    return [...uniqueDetails.values()]
  })()
  const fixedExpenseDetails = results.products.flatMap((product) =>
    product.fixedExpenses.map((item) => ({
      ...item,
      productId: product.product.id,
      productName: product.product.productName,
    })),
  )
  const fixedRentalDetails = results.products.flatMap((product) =>
    product.rentals.map((item) => ({
      ...item,
      productId: product.product.id,
      productName: product.product.productName,
    })),
  )
  const salaryDetails = results.products.flatMap((product) =>
    product.salaryExpenses.map((item) => ({
      ...item,
      productId: product.product.id,
      productName: product.product.productName,
    })),
  )
  const productNames = new Map(
    data.productionSettings.map((product) => [
      product.id,
      product.productName,
    ]),
  )
  const availableFixedExpenses = data.expenses.filter(
    (expense) =>
      expense.type !== 'stipendio' &&
      expense.recurrence === 'monthly',
  )

  return (
    <div className="page-stack">
      <header className="page-heading">
        <div>
          <span className="eyebrow">CONTROLLO PRODUZIONE</span>
          <h1>Costo prodotto e guadagno</h1>
          <p>
            Calcola il costo unitario e il guadagno usando fatture, spese fisse
            e quantità prodotte.
          </p>
        </div>
        <button
          className="button button-primary"
          onClick={startAddingProduct}
          type="button"
        >
          + Aggiungi
        </button>
      </header>

      {data.productionSettings.length > 0 && (
        <nav aria-label="Prodotti da analizzare" className="section-tabs">
          <button
            className={selectedProductId === 'all' ? 'active' : ''}
            onClick={selectAllProducts}
            type="button"
          >
            Tutti i prodotti
          </button>
          {data.productionSettings.map((product) => (
            <button
              className={product.id === selectedProductId ? 'active' : ''}
              key={product.id}
              onClick={() => selectProduct(product.id)}
              type="button"
            >
              {product.productName || 'Prodotto senza nome'}
            </button>
          ))}
        </nav>
      )}

      <section className="panel production-filter">
        <div>
          <span className="eyebrow">PERIODO DA ANALIZZARE</span>
          <strong>
            {formatDate(range.start)}
            {range.end !== range.start && ` – ${formatDate(range.end)}`}
          </strong>
        </div>
        <label>
          Visualizzazione
          <select
            onChange={(event) =>
              changeReportPeriod(
                event.target.value as ProductionReportPeriod,
              )
            }
            value={reportPeriod}
          >
            <option value="day">Giornaliera</option>
            <option value="week">Settimanale</option>
            <option value="month">Mensile</option>
          </select>
        </label>
        <label>
          Data di riferimento
          <input
            onChange={(event) => setSelectedDate(event.target.value)}
            type="date"
            value={selectedDate}
          />
        </label>
      </section>

      <section className="stats-grid production-stats">
        <button
          className={`stat-card stat-cyan production-stat-button ${
            detailCard === 'quantity' ? 'active' : ''
          }`}
          onClick={() => setDetailCard('quantity')}
          type="button"
        >
          <span className="stat-glow" />
          <span className="stat-label">Pezzi prodotti</span>
          <strong>{results.quantity.toLocaleString('it-IT')}</strong>
          <span className="stat-detail">
            {showingAllProducts
              ? `${results.products.length} prodotti`
              : savedSettings?.productName || 'Prodotto non configurato'}
          </span>
        </button>
        <button
          className={`stat-card stat-violet production-stat-button ${
            detailCard === 'costs' ? 'active' : ''
          }`}
          onClick={() => setDetailCard('costs')}
          type="button"
        >
          <span className="stat-glow" />
          <span className="stat-label">Costo complessivo</span>
          <strong>{money(results.totalCosts)}</strong>
          <span className="stat-detail">{results.invoices} fatture incluse</span>
        </button>
        <button
          className={`stat-card stat-amber production-stat-button ${
            detailCard === 'unit-cost' ? 'active' : ''
          }`}
          onClick={() => setDetailCard('unit-cost')}
          type="button"
        >
          <span className="stat-glow" />
          <span className="stat-label">Costo prodotto finito</span>
          <strong>{money(results.unitCost)}</strong>
          <span className="stat-detail">
            {showingAllProducts
              ? 'Costo medio per pezzo'
              : 'Costo per pezzo prodotto'}
          </span>
        </button>
        <button
          className={`stat-card stat-green production-stat-button ${
            detailCard === 'profit' ? 'active' : ''
          }`}
          onClick={() => setDetailCard('profit')}
          type="button"
        >
          <span className="stat-glow" />
          <span className="stat-label">Guadagno</span>
          <strong>{money(results.profit)}</strong>
          <span className="stat-detail">
            Ricavi {money(results.revenue)}
          </span>
        </button>
      </section>

      <section className="panel production-card-detail">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">DETTAGLIO DELLA CARD</span>
            <h2>
              {detailCard === 'quantity' && 'Pezzi prodotti'}
              {detailCard === 'costs' && 'Costo complessivo'}
              {detailCard === 'unit-cost' && 'Costo prodotto finito'}
              {detailCard === 'profit' && 'Guadagno'}
            </h2>
          </div>
        </div>

        {detailCard === 'quantity' &&
          (quantityDetails.length === 0 ? (
            <div className="empty-state compact-empty">
              <strong>Nessuna quantità nel periodo</strong>
            </div>
          ) : (
            <div className="record-list">
              {quantityDetails.map(({ entry, productId, productName }) => (
                <div
                  className="record-card"
                  key={`${productId}-${entry.id}`}
                >
                  <span>
                    <strong>{productName}</strong>
                    <small>
                      {entry.period === 'day'
                        ? formatDate(entry.date)
                        : `Settimana dal ${formatDate(entry.date)}`}
                    </small>
                  </span>
                  <strong>
                    {entry.quantity.toLocaleString('it-IT')} pezzi
                  </strong>
                </div>
              ))}
            </div>
          ))}

        {detailCard === 'costs' && (
          <div className="production-detail-groups">
            <div>
              <h3>Fatture incluse</h3>
              {invoiceDetails.length === 0 ? (
                <p className="production-help">Nessuna fattura nel periodo.</p>
              ) : (
                <div className="record-list">
                  {invoiceDetails.map(
                    ({ invoice, amount, productId, productName }) => (
                      <div
                        className="record-card"
                        key={`${productId}-${invoice.id}`}
                      >
                        <span>
                          <strong>
                            {invoice.supplierName || 'Fornitore non indicato'}
                          </strong>
                          <small>
                            {productName} · {formatDate(invoice.date)} · Fattura{' '}
                            {invoice.number || 'senza numero'}
                          </small>
                        </span>
                        <strong>{money(amount)}</strong>
                      </div>
                    ),
                  )}
                </div>
              )}
            </div>
            <div>
              <h3>Spese fisse incluse</h3>
              {fixedExpenseDetails.length === 0 &&
              fixedRentalDetails.length === 0 ? (
                <p className="production-help">
                  Nessuna spesa fissa nel periodo.
                </p>
              ) : (
                <div className="record-list">
                  {fixedExpenseDetails.map(
                    ({ expense, amount, productId, productName }) => (
                      <div
                        className="record-card"
                        key={`${productId}-${expense.id}`}
                      >
                        <span>
                          <strong>{expense.description}</strong>
                          <small>
                            {productName}
                            {expense.sellerName &&
                              ` · ${expense.sellerName}`}
                          </small>
                        </span>
                        <strong>{money(amount)}</strong>
                      </div>
                    ),
                  )}
                  {fixedRentalDetails.map(
                    ({ rental, amount, productId, productName }) => (
                      <div
                        className="record-card"
                        key={`${productId}-${rental.id}`}
                      >
                        <span>
                          <strong>
                            Affitto · {rental.property || 'Locale'}
                          </strong>
                          <small>
                            {productName} · mese di {rental.date.slice(0, 7)}
                          </small>
                        </span>
                        <strong>{money(amount)}</strong>
                      </div>
                    ),
                  )}
                </div>
              )}
            </div>
            <div>
              <h3>Stipendi produzione</h3>
              {salaryDetails.length === 0 ? (
                <p className="production-help">
                  Nessuno stipendio incluso nel periodo.
                </p>
              ) : (
                <div className="record-list">
                  {salaryDetails.map(
                    ({ expense, amount, productId, productName }) => (
                      <div
                        className="record-card"
                        key={`${productId}-${expense.id}`}
                      >
                        <span>
                          <strong>
                            {expense.sellerName || expense.description}
                          </strong>
                          <small>
                            {productName} · {expense.description}
                          </small>
                        </span>
                        <strong>{money(amount)}</strong>
                      </div>
                    ),
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {detailCard === 'unit-cost' && (
          <div className="record-list">
            {results.products.map((product) => (
              <div className="record-card" key={product.product.id}>
                <span>
                  <strong>{product.product.productName}</strong>
                  <small>
                    {money(product.totalCosts)} ÷{' '}
                    {product.quantity.toLocaleString('it-IT')} pezzi
                  </small>
                </span>
                <strong>{money(product.unitCost)}</strong>
              </div>
            ))}
          </div>
        )}

        {detailCard === 'profit' && (
          <div className="record-list">
            {results.products.map((product) => (
              <div className="record-card" key={product.product.id}>
                <span>
                  <strong>{product.product.productName}</strong>
                  <small>
                    Ricavi {money(product.revenue)} · Costi{' '}
                    {money(product.totalCosts)}
                  </small>
                </span>
                <strong>{money(product.profit)}</strong>
              </div>
            ))}
          </div>
        )}
      </section>

      {selectedProductId !== 'all' && (
        <section className="production-grid">
        <form className="panel accounting-form" onSubmit={saveSettings}>
          <div className="panel-heading">
            <div>
              <span className="eyebrow">IMPOSTAZIONI DELLA PAGINA</span>
              <h2>
                {savedSettings ? 'Prodotto e costi inclusi' : 'Nuovo prodotto'}
              </h2>
            </div>
            {savedSettings && (
              <button
                className="danger-text"
                onClick={removeProduct}
                type="button"
              >
                Elimina prodotto
              </button>
            )}
          </div>
          <div className="production-settings-fields">
            <label>
              Nome prodotto
              <input
                onChange={(event) =>
                  setSettingsForm({
                    ...settingsForm,
                    productName: event.target.value,
                  })
                }
                placeholder="Es. Panino finito"
                required
                value={settingsForm.productName}
              />
            </label>
            <label>
              Prezzo di vendita per pezzo
              <input
                inputMode="decimal"
                min="0"
                onChange={(event) =>
                  setSettingsForm({
                    ...settingsForm,
                    salePrice: event.target.value,
                  })
                }
                required
                step="0.01"
                type="number"
                value={settingsForm.salePrice}
              />
            </label>
          </div>
          <fieldset className="production-sellers">
            <legend>Venditori da includere</legend>
            {data.sellers.length === 0 ? (
              <p>Nessun venditore disponibile nell’azienda attiva.</p>
            ) : (
              data.sellers.map((seller) => (
                <label className="checkbox-row" key={seller.id}>
                  <input
                    checked={settingsForm.sellerIds.includes(seller.id)}
                    onChange={() => toggleSeller(seller.id)}
                    type="checkbox"
                  />
                  {seller.name}
                </label>
              ))
            )}
          </fieldset>
          <fieldset className="production-sellers">
            <legend>Spese fisse mensili da includere</legend>
            {availableFixedExpenses.length === 0 ? (
              <p>Nessuna spesa fissa mensile disponibile.</p>
            ) : (
              availableFixedExpenses.map((expense) => (
                <label className="checkbox-row" key={expense.id}>
                  <input
                    checked={settingsForm.expenseIds.includes(expense.id)}
                    onChange={() => toggleExpense(expense.id)}
                    type="checkbox"
                  />
                  {expense.description} · {money(expense.amount)}/mese
                </label>
              ))
            )}
          </fieldset>
          <fieldset className="production-sellers">
            <legend>Lavoratrici della produzione</legend>
            {data.sellers.length === 0 ? (
              <p>Nessuna lavoratrice disponibile nell’azienda attiva.</p>
            ) : (
              data.sellers.map((seller) => (
                <label className="checkbox-row" key={seller.id}>
                  <input
                    checked={settingsForm.workerIds.includes(seller.id)}
                    onChange={() => toggleWorker(seller.id)}
                    type="checkbox"
                  />
                  {seller.name}
                </label>
              ))
            )}
          </fieldset>
          <p className="production-help">
            Le fatture dei venditori, le spese mensili e le lavoratrici
            selezionate formano il costo del prodotto. Se una spesa o una
            lavoratrice riguarda più prodotti, il suo costo viene ripartito in
            parti uguali senza duplicarlo nel totale.
          </p>
          <p className="production-help">
            Se selezioni lo stesso venditore in più prodotti, le sue fatture
            saranno incluse in ciascun prodotto. Spese fisse e stipendi
            condivisi vengono invece ripartiti senza duplicarli nel totale.
          </p>
          <button className="button button-primary" type="submit">
            Salva impostazioni pagina
          </button>
        </form>

        <form className="panel accounting-form" onSubmit={saveEntry}>
          <div className="panel-heading">
            <div>
              <span className="eyebrow">QUANTITÀ PRODOTTA</span>
              <h2>Registra la produzione</h2>
            </div>
          </div>
          <div className="production-entry-fields">
            <label>
              Inserimento
              <select
                onChange={(event) =>
                  setEntryForm({
                    ...entryForm,
                    period: event.target.value as ProductionEntryPeriod,
                  })
                }
                value={entryForm.period}
              >
                <option value="day">Totale giornaliero</option>
                <option value="week">Totale della settimana</option>
              </select>
            </label>
            <label>
              {entryForm.period === 'day'
                ? 'Giorno'
                : 'Un giorno della settimana'}
              <input
                onChange={(event) =>
                  setEntryForm({ ...entryForm, date: event.target.value })
                }
                type="date"
                value={entryForm.date}
              />
            </label>
            <label>
              Numero pezzi
              <input
                inputMode="decimal"
                min="0"
                onChange={(event) =>
                  setEntryForm({
                    ...entryForm,
                    quantity: event.target.value,
                  })
                }
                required
                step="1"
                type="number"
                value={entryForm.quantity}
              />
            </label>
          </div>
          <p className="production-help">
            Un totale settimanale sostituisce gli inserimenti giornalieri della
            stessa settimana ed è visibile nei filtri settimana e mese.
          </p>
          <button
            className="button button-primary"
            disabled={!savedSettings}
            type="submit"
          >
            Registra quantità
          </button>
        </form>
        </section>
      )}

      {formError && <p className="form-error">{formError}</p>}

      <section className="panel production-breakdown">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">DETTAGLIO CALCOLO</span>
            <h2>Costi del periodo</h2>
          </div>
        </div>
        <div className="stats-strip">
          <div>
            <span>Totale fatture</span>
            <strong>{money(results.invoiceCosts)}</strong>
          </div>
          <div>
            <span>Quota spese fisse mensili</span>
            <strong>{money(results.fixedCosts)}</strong>
          </div>
          <div>
            <span>Stipendi produzione</span>
            <strong>{money(results.salaryCosts)}</strong>
          </div>
          <div>
            <span>Prodotti inclusi</span>
            <strong>{results.products.length}</strong>
          </div>
        </div>
        {selectedProductId !== 'all' && (
          <p className="production-help">
            {sellerNames
              ? `Fatture e spese calcolate per: ${sellerNames}.`
              : 'Salva le impostazioni e seleziona almeno un venditore.'}
            {workerNames &&
              ` Stipendi di produzione calcolati per: ${workerNames}.`}
          </p>
        )}
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">STORICO PRODUZIONE</span>
            <h2>Quantità registrate</h2>
          </div>
          <span className="count-pill">{entries.length}</span>
        </div>
        {entries.length === 0 ? (
          <div className="empty-state compact-empty">
            <strong>Nessuna quantità registrata</strong>
            <span>Inserisci il primo totale giornaliero o settimanale.</span>
          </div>
        ) : (
          <div className="record-list">
            {entries.map((entry) => (
              <div className="record-card" key={entry.id}>
                <span>
                  <strong>
                    {entry.period === 'day'
                      ? formatDate(entry.date)
                      : `Settimana dal ${formatDate(entry.date)}`}
                  </strong>
                  <small>
                    {entry.period === 'day'
                      ? 'Totale giornaliero'
                      : 'Totale settimanale'}
                    {showingAllProducts &&
                      ` · ${productNames.get(entry.productId) ?? 'Prodotto'}`}
                  </small>
                </span>
                <span>
                  <strong>{entry.quantity.toLocaleString('it-IT')} pezzi</strong>
                  <button
                    className="danger-text"
                    onClick={() => removeEntry(entry.id)}
                    type="button"
                  >
                    Elimina
                  </button>
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
