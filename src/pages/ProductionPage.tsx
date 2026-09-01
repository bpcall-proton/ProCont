import { useMemo, useState, type FormEvent } from 'react'
import {
  activeAccounting,
  allocatedExpense,
  money,
  roundMoney,
  today,
} from '../domain/accounting'
import { createId } from '../domain/defaults'
import type { ProductionEntryPeriod } from '../domain/types'
import { useAppStore } from '../store/AppStoreContext'

type ReportPeriod = 'day' | 'week' | 'month'
const noSellerIds: string[] = []

function settingsFormFor(
  settings:
    | {
        productName: string
        salePrice: number
        sellerIds: string[]
      }
    | null,
) {
  return {
    productName: settings?.productName ?? '',
    salePrice: settings ? String(settings.salePrice) : '',
    sellerIds: settings?.sellerIds ?? [],
  }
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

function rangeFor(period: ReportPeriod, selected: string) {
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
  const [selectedProductId, setSelectedProductId] = useState<string | null>(
    firstProduct?.id ?? null,
  )
  const savedSettings =
    data.productionSettings.find(
      (settings) => settings.id === selectedProductId,
    ) ?? null
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
  const [reportPeriod, setReportPeriod] = useState<ReportPeriod>('month')
  const [selectedDate, setSelectedDate] = useState(today())
  const [formError, setFormError] = useState('')
  const range = rangeFor(reportPeriod, selectedDate)
  const selectedSellerIds = savedSettings?.sellerIds ?? noSellerIds

  const results = useMemo(() => {
    const inRange = (date: string) => date >= range.start && date <= range.end
    const invoices = data.invoices.filter(
      (invoice) =>
        invoice.sellerId !== null &&
        selectedSellerIds.includes(invoice.sellerId) &&
        inRange(invoice.date),
    )
    const fixedExpenses = data.expenses.filter(
      (expense) =>
        expense.recurrence === 'monthly' &&
        expense.sellerId !== null &&
        selectedSellerIds.includes(expense.sellerId),
    )
    const productionEntries = data.productionEntries.filter(
      (entry) =>
        entry.productId === selectedProductId &&
        inRange(entry.date) &&
        (reportPeriod !== 'day' || entry.period === 'day'),
    )
    const invoiceCosts = invoices.reduce(
      (total, invoice) => total + invoice.total,
      0,
    )
    const fixedCosts = fixedExpenses.reduce(
      (total, expense) =>
        total + allocatedExpense(expense, range.start, range.end),
      0,
    )
    const quantity = productionEntries.reduce(
      (total, entry) => total + entry.quantity,
      0,
    )
    const totalCosts = invoiceCosts + fixedCosts
    const revenue = quantity * (savedSettings?.salePrice ?? 0)
    return {
      invoiceCosts: roundMoney(invoiceCosts),
      fixedCosts: roundMoney(fixedCosts),
      quantity,
      totalCosts: roundMoney(totalCosts),
      unitCost: quantity > 0 ? roundMoney(totalCosts / quantity) : 0,
      revenue: roundMoney(revenue),
      profit: roundMoney(revenue - totalCosts),
      invoices: invoices.length,
    }
  }, [
    data.expenses,
    data.invoices,
    data.productionEntries,
    range.end,
    range.start,
    reportPeriod,
    savedSettings?.salePrice,
    selectedProductId,
    selectedSellerIds,
  ])

  function selectProduct(productId: string) {
    const product =
      data.productionSettings.find((settings) => settings.id === productId) ??
      null
    setSelectedProductId(productId)
    setSettingsForm(settingsFormFor(product))
    setEntryForm((current) => ({ ...current, quantity: '' }))
    setFormError('')
  }

  function startAddingProduct() {
    setSelectedProductId(null)
    setSettingsForm(settingsFormFor(null))
    setEntryForm((current) => ({ ...current, quantity: '' }))
    setFormError('')
  }

  function toggleSeller(sellerId: string) {
    setSettingsForm((current) => ({
      ...current,
      sellerIds: current.sellerIds.includes(sellerId)
        ? current.sellerIds.filter((id) => id !== sellerId)
        : [...current.sellerIds, sellerId],
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
  const entries = data.productionEntries
    .filter((entry) => entry.productId === selectedProductId)
    .sort((left, right) => right.date.localeCompare(left.date))

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
              setReportPeriod(event.target.value as ReportPeriod)
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
        <article className="stat-card stat-cyan">
          <span className="stat-glow" />
          <span className="stat-label">Pezzi prodotti</span>
          <strong>{results.quantity.toLocaleString('it-IT')}</strong>
          <span className="stat-detail">
            {savedSettings?.productName || 'Prodotto non configurato'}
          </span>
        </article>
        <article className="stat-card stat-violet">
          <span className="stat-glow" />
          <span className="stat-label">Costo complessivo</span>
          <strong>{money(results.totalCosts)}</strong>
          <span className="stat-detail">{results.invoices} fatture incluse</span>
        </article>
        <article className="stat-card stat-amber">
          <span className="stat-glow" />
          <span className="stat-label">Costo prodotto finito</span>
          <strong>{money(results.unitCost)}</strong>
          <span className="stat-detail">Costo per pezzo prodotto</span>
        </article>
        <article className="stat-card stat-green">
          <span className="stat-glow" />
          <span className="stat-label">Guadagno</span>
          <strong>{money(results.profit)}</strong>
          <span className="stat-detail">
            Ricavi {money(results.revenue)}
          </span>
        </article>
      </section>

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
          <p className="production-help">
            Le fatture dei venditori selezionati e le loro spese mensili
            ricorrenti formano il costo del prodotto.
          </p>
          <p className="production-help">
            Se selezioni lo stesso venditore in più prodotti, le sue fatture e
            spese saranno incluse nel calcolo di ciascun prodotto.
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
            <span>Prezzo di vendita</span>
            <strong>{money(savedSettings?.salePrice ?? 0)}</strong>
          </div>
          <div>
            <span>Venditori inclusi</span>
            <strong>{selectedSellerIds.length}</strong>
          </div>
        </div>
        <p className="production-help">
          {sellerNames
            ? `Costi calcolati per: ${sellerNames}.`
            : 'Salva le impostazioni e seleziona almeno un venditore.'}
        </p>
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
