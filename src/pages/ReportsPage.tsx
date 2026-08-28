import { useMemo, useState } from 'react'
import {
  activeAccounting,
  addDays,
  allocatedExpense,
  invoiceRemaining,
  money,
  officialTaking,
  realTaking,
  today,
  undeclaredTaking,
} from '../domain/accounting'
import { useAppStore } from '../store/AppStoreContext'

type Period = 'week' | 'month' | 'year' | 'all'

function rangeFor(period: Period, selected: string) {
  const date = new Date(`${selected}T00:00:00Z`)
  if (period === 'all' || Number.isNaN(date.valueOf())) {
    return { start: '', end: '9999-12-31' }
  }
  if (period === 'year') {
    const year = date.getUTCFullYear()
    const current = new Date(`${today()}T00:00:00Z`)
    const end =
      year === current.getUTCFullYear()
        ? new Date(
            Date.UTC(year, current.getUTCMonth() + 1, 0),
          )
            .toISOString()
            .slice(0, 10)
        : `${year}-12-31`
    return { start: `${year}-01-01`, end }
  }
  if (period === 'month') {
    const year = date.getUTCFullYear()
    const month = date.getUTCMonth()
    const start = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10)
    const end = new Date(Date.UTC(year, month + 1, 0))
      .toISOString()
      .slice(0, 10)
    return { start, end }
  }
  const day = date.getUTCDay()
  const mondayOffset = day === 0 ? -6 : 1 - day
  const startDate = new Date(date)
  startDate.setUTCDate(date.getUTCDate() + mondayOffset)
  const endDate = new Date(startDate)
  endDate.setUTCDate(startDate.getUTCDate() + 6)
  return {
    start: startDate.toISOString().slice(0, 10),
    end: endDate.toISOString().slice(0, 10),
  }
}

function inRange(date: string, start: string, end: string) {
  return date >= start && date <= end
}

function businessDaysBetween(start: string, end: string) {
  const cursor = new Date(`${start}T00:00:00Z`)
  const last = new Date(`${end}T00:00:00Z`)
  let days = 0
  while (cursor <= last) {
    const weekday = cursor.getUTCDay()
    if (weekday !== 0 && weekday !== 6) days += 1
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return days
}

export function ReportsPage() {
  const { state } = useAppStore()
  const [period, setPeriod] = useState<Period>('month')
  const [selected, setSelected] = useState(today())
  const source = activeAccounting(state.accounting)
  const range = rangeFor(period, selected)

  const data = useMemo(
    () => ({
      invoices: source.invoices.filter((item) =>
        inRange(item.date, range.start, range.end),
      ),
      takings: source.takings.filter((item) =>
        inRange(item.date, range.start, range.end),
      ),
      rentals: source.rentals.filter((item) =>
        inRange(item.date, range.start, range.end),
      ),
      accountantInvoices: source.accountantInvoices.filter((item) =>
        inRange(item.date, range.start, range.end),
      ),
      expenses: source.expenses,
    }),
    [
      range.end,
      range.start,
      source.accountantInvoices,
      source.expenses,
      source.invoices,
      source.rentals,
      source.takings,
    ],
  )

  const official = data.takings.reduce(
    (sum, item) => sum + officialTaking(item),
    0,
  )
  const real = data.takings.reduce((sum, item) => sum + realTaking(item), 0)
  const undeclared = data.takings.reduce(
    (sum, item) => sum + undeclaredTaking(item),
    0,
  )
  const purchases = data.invoices.reduce(
    (sum, item) => sum + item.total,
    0,
  )
  const rents = data.rentals.reduce((sum, item) => sum + item.total, 0)
  const accountant = data.accountantInvoices.reduce(
    (sum, item) => sum + item.total,
    0,
  )
  const expenseCosts = data.expenses.reduce(
    (sum, item) => sum + allocatedExpense(item, range.start, range.end),
    0,
  )
  const costs = purchases + rents + accountant + expenseCosts
  const fixedCosts = data.expenses
    .filter((item) => item.recurrence === 'monthly')
    .reduce(
      (sum, item) => sum + allocatedExpense(item, range.start, range.end),
      0,
    )
  const expenseByType = {
    stipendi: data.expenses
      .filter((item) => item.type === 'stipendio')
      .reduce(
        (sum, item) => sum + allocatedExpense(item, range.start, range.end),
        0,
      ),
    tasse: data.expenses
      .filter((item) => item.type === 'tassa')
      .reduce(
        (sum, item) => sum + allocatedExpense(item, range.start, range.end),
        0,
      ),
    contabile: data.expenses
      .filter((item) => item.type === 'contabile')
      .reduce(
        (sum, item) => sum + allocatedExpense(item, range.start, range.end),
        0,
      ),
    altre: data.expenses
      .filter((item) => item.type === 'altra')
      .reduce(
        (sum, item) => sum + allocatedExpense(item, range.start, range.end),
        0,
      ),
  }
  const inputVat =
    data.invoices.reduce((sum, item) => sum + item.vat, 0) +
    data.rentals.reduce((sum, item) => sum + item.vat, 0) +
    data.accountantInvoices.reduce((sum, item) => sum + item.vat, 0)
  const outputVat = data.takings.reduce((sum, item) => sum + item.vat, 0)
  const theoretical = data.invoices.reduce(
    (sum, item) => sum + item.theoreticalRevenue,
    0,
  )

  const sellerStats = source.sellers.map((seller) => {
    const takings = data.takings.filter((item) => item.sellerId === seller.id)
    const invoices = data.invoices.filter(
      (item) => item.sellerId === seller.id,
    )
    return {
      id: seller.id,
      name: seller.name,
      official: takings.reduce(
        (sum, item) => sum + officialTaking(item),
        0,
      ),
      real: takings.reduce((sum, item) => sum + realTaking(item), 0),
      theoretical: invoices.reduce(
        (sum, item) => sum + item.theoreticalRevenue,
        0,
      ),
    }
  })

  const supplierStats = source.suppliers.map((supplier) => {
    const invoices = data.invoices.filter(
      (item) => item.supplierId === supplier.id,
    )
    return {
      id: supplier.id,
      name: supplier.name,
      count: invoices.length,
      total: invoices.reduce((sum, item) => sum + item.total, 0),
      remaining: invoices.reduce(
        (sum, item) => sum + invoiceRemaining(item),
        0,
      ),
    }
  })

  const months = useMemo(() => {
    const grouped = new Map<
      string,
      { official: number; real: number; costs: number }
    >()
    const month = (date: string) => date.slice(0, 7)
    const ensure = (key: string) => {
      const existing = grouped.get(key)
      if (existing) return existing
      const created = { official: 0, real: 0, costs: 0 }
      grouped.set(key, created)
      return created
    }
    const cursor = new Date(`${today().slice(0, 7)}-01T00:00:00Z`)
    for (let index = 0; index < 12; index += 1) {
      ensure(cursor.toISOString().slice(0, 7))
      cursor.setUTCMonth(cursor.getUTCMonth() - 1)
    }
    source.takings.forEach((item) => {
      const target = ensure(month(item.date))
      target.official += officialTaking(item)
      target.real += realTaking(item)
    })
    source.invoices.forEach((item) => {
      ensure(month(item.date)).costs += item.total
    })
    source.rentals.forEach((item) => {
      ensure(month(item.date)).costs += item.total
    })
    source.accountantInvoices.forEach((item) => {
      ensure(month(item.date)).costs += item.total
    })
    grouped.forEach((values, key) => {
      const monthStart = `${key}-01`
      const date = new Date(`${monthStart}T00:00:00Z`)
      const monthEnd = new Date(
        Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
      )
        .toISOString()
        .slice(0, 10)
      values.costs += source.expenses.reduce(
        (sum, item) => sum + allocatedExpense(item, monthStart, monthEnd),
        0,
      )
    })
    return [...grouped.entries()]
      .sort(([left], [right]) => right.localeCompare(left))
      .slice(0, 12)
  }, [
    source.accountantInvoices,
    source.expenses,
    source.invoices,
    source.rentals,
    source.takings,
  ])

  const maxChart = Math.max(
    1,
    ...months.flatMap(([, values]) => [
      values.official,
      values.real,
      values.costs,
    ]),
  )
  const currentYearStart = `${new Date().getFullYear()}-01-01`
  const yearTakings = source.takings.filter((item) =>
    inRange(item.date, currentYearStart, today()),
  )
  const allTakingDays = new Set(yearTakings.map((item) => item.date)).size
  const allRealTakings = yearTakings.reduce(
    (sum, item) => sum + realTaking(item),
    0,
  )
  const averageDailyTaking =
    allTakingDays > 0 ? allRealTakings / allTakingDays : 0
  const defaultSeasonEnd = `${new Date().getFullYear()}-12-31`
  const seasonEnd = source.company?.seasonEndDate ?? defaultSeasonEnd
  const remainingDays =
    seasonEnd >= today() ? businessDaysBetween(today(), seasonEnd) : 0
  const yearCosts =
    source.invoices
      .filter((item) => inRange(item.date, currentYearStart, today()))
      .reduce((sum, item) => sum + item.total, 0) +
    source.rentals
      .filter((item) => inRange(item.date, currentYearStart, today()))
      .reduce((sum, item) => sum + item.total, 0) +
    source.accountantInvoices
      .filter((item) => inRange(item.date, currentYearStart, today()))
      .reduce((sum, item) => sum + item.total, 0) +
    source.expenses.reduce(
      (sum, item) => sum + allocatedExpense(item, currentYearStart, today()),
      0,
    )
  const futureFixedCosts =
    seasonEnd >= today()
      ? source.expenses
          .filter((item) => item.recurrence === 'monthly')
          .reduce(
            (sum, item) =>
              sum + allocatedExpense(item, addDays(today(), 1), seasonEnd),
            0,
          )
      : 0
  const seasonForecast =
    allRealTakings +
    averageDailyTaking * remainingDays -
    yearCosts -
    futureFixedCosts

  return (
    <div className="page-stack">
      <header className="page-heading">
        <div>
          <span className="eyebrow">STATISTICHE E FISCO</span>
          <h1>Situazione aziendale</h1>
          <p>
            Confronto ufficiale/reale, IVA, utile, venit stock e andamento per
            venditore.
          </p>
        </div>
        <div className="report-filter">
          <select
            value={period}
            onChange={(event) => setPeriod(event.target.value as Period)}
          >
            <option value="week">Settimana</option>
            <option value="month">Mese</option>
            <option value="year">Anno</option>
            <option value="all">Tutto</option>
          </select>
          {period !== 'all' && (
            <input
              type="date"
              value={selected}
              onChange={(event) => setSelected(event.target.value)}
            />
          )}
        </div>
      </header>

      <section className="report-kpis">
        <ReportCard label="Incasso ufficiale" value={official} tone="green" />
        <ReportCard label="Incasso reale" value={real} tone="cyan" />
        <ReportCard label="Non dichiarato" value={undeclared} tone="violet" />
        <ReportCard label="Costi totali" value={costs} tone="amber" />
        <ReportCard
          label="Spese fisse ripartite"
          value={fixedCosts}
          tone="amber"
        />
        <ReportCard
          label="Utile ufficiale"
          value={official - costs}
          tone={official - costs >= 0 ? 'green' : 'red'}
        />
        <ReportCard
          label="Utile reale"
          value={real - costs}
          tone={real - costs >= 0 ? 'cyan' : 'red'}
        />
        <ReportCard label="IVA a credito" value={inputVat} tone="cyan" />
        <ReportCard label="IVA a debito" value={outputVat} tone="amber" />
        <ReportCard
          label="Saldo IVA"
          value={outputVat - inputVat}
          tone={outputVat - inputVat > 0 ? 'red' : 'green'}
        />
        <ReportCard
          label="Venit stock"
          value={theoretical - real}
          tone="violet"
        />
        <ReportCard
          label={`Pronostico utile al ${seasonEnd}`}
          value={seasonForecast}
          tone="cyan"
        />
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">RIPARTIZIONE USCITE</span>
            <h2>Costi del periodo selezionato</h2>
          </div>
        </div>
        <div className="stats-strip expense-breakdown">
          <div><span>Fatture fornitori</span><strong>{money(purchases)}</strong></div>
          <div><span>Affitti</span><strong>{money(rents)}</strong></div>
          <div><span>Fatture contabile</span><strong>{money(accountant)}</strong></div>
          <div><span>Stipendi</span><strong>{money(expenseByType.stipendi)}</strong></div>
          <div><span>Tasse</span><strong>{money(expenseByType.tasse)}</strong></div>
          <div><span>Costi contabile</span><strong>{money(expenseByType.contabile)}</strong></div>
          <div><span>Altre spese</span><strong>{money(expenseByType.altre)}</strong></div>
        </div>
      </section>

      <section className="report-columns">
        <article className="panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">PUNTI / VENDITORI</span>
              <h2>Rendimento venditori</h2>
            </div>
          </div>
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Venditore</th>
                  <th>Ufficiale</th>
                  <th>Reale</th>
                  <th>Venit previsto</th>
                  <th>Venit stock</th>
                </tr>
              </thead>
              <tbody>
                {sellerStats.map((seller) => (
                  <tr key={seller.id}>
                    <td><strong>{seller.name}</strong></td>
                    <td>{money(seller.official)}</td>
                    <td>{money(seller.real)}</td>
                    <td>{money(seller.theoretical)}</td>
                    <td>{money(seller.theoretical - seller.real)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

        <article className="panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">FORNITORI</span>
              <h2>Acquisti e residui</h2>
            </div>
          </div>
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Fornitore</th>
                  <th>Fatture</th>
                  <th>Totale</th>
                  <th>Residuo</th>
                </tr>
              </thead>
              <tbody>
                {supplierStats.map((supplier) => (
                  <tr key={supplier.id}>
                    <td><strong>{supplier.name}</strong></td>
                    <td>{supplier.count}</td>
                    <td>{money(supplier.total)}</td>
                    <td>{money(supplier.remaining)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">ULTIMI 12 MESI</span>
            <h2>Andamento mensile</h2>
          </div>
        </div>
        <div className="monthly-chart">
          {months.map(([month, values]) => (
            <div className="month-row" key={month}>
              <strong>{month}</strong>
              <div className="bar-track">
                <span
                  className="bar official"
                  style={{ width: `${(values.official / maxChart) * 100}%` }}
                />
                <span
                  className="bar real"
                  style={{ width: `${(values.real / maxChart) * 100}%` }}
                />
                <span
                  className="bar costs"
                  style={{ width: `${(values.costs / maxChart) * 100}%` }}
                />
              </div>
              <small>
                U {money(values.official)} · R {money(values.real)} · C{' '}
                {money(values.costs)}
              </small>
            </div>
          ))}
          {months.length === 0 && (
            <div className="empty-state compact-empty">
              <strong>Nessun dato statistico</strong>
              <span>Registra fatture e incassi per generare i grafici.</span>
            </div>
          )}
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">FATTURE PAGATE</span>
            <h2>Storico saldato</h2>
          </div>
        </div>
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Data pagamento</th>
                <th>Fattura</th>
                <th>Fornitore</th>
                <th>Metodo</th>
                <th>Totale</th>
              </tr>
            </thead>
            <tbody>
              {source.invoices
                .filter((invoice) => invoice.settled)
                .sort((left, right) =>
                  (right.paymentDate ?? right.date).localeCompare(
                    left.paymentDate ?? left.date,
                  ),
                )
                .map((invoice) => (
                  <tr key={invoice.id}>
                    <td>{invoice.paymentDate ?? invoice.date}</td>
                    <td>{invoice.number}</td>
                    <td>{invoice.supplierName || '—'}</td>
                    <td>{invoice.paymentMethod ?? '—'}</td>
                    <td>{money(invoice.total)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

function ReportCard({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone: 'green' | 'cyan' | 'violet' | 'amber' | 'red'
}) {
  return (
    <article className={`report-card report-${tone}`}>
      <span>{label}</span>
      <strong>{money(value)}</strong>
    </article>
  )
}
