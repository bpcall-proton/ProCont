import { useMemo, useState } from 'react'
import {
  activeAccounting,
  addDays,
  allocatedExpense,
  invoiceDueState,
  invoiceRemaining,
  money,
  officialTaking,
  realTaking,
  sellerColorClass,
  today,
} from '../domain/accounting'
import { useAppStore } from '../store/AppStoreContext'

type Period = 'week' | 'month' | 'year' | 'all'
type MetricKey =
  | 'official'
  | 'undeclared'
  | 'actual'
  | 'purchases'
  | 'fixed-costs'
  | 'official-profit'
  | 'actual-profit'
  | 'input-vat'
  | 'output-vat'
  | 'vat-balance'
  | 'stock'
  | 'forecast'
type ReportDetail =
  | { type: 'seller'; id: string }
  | { type: 'supplier'; id: string }
  | { type: 'metric'; metric: MetricKey }
  | null

interface MetricDetailRow {
  date: string
  category: string
  description: string
  reference: string
  amount: number
}

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

function filenamePart(value: string) {
  return (
    value
      .trim()
      .toLocaleLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'azienda'
  )
}

export function ReportsPage() {
  const { state } = useAppStore()
  const [period, setPeriod] = useState<Period>('month')
  const [selected, setSelected] = useState(today())
  const [detail, setDetail] = useState<ReportDetail>(null)
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
  const undeclared = data.takings.reduce(
    (sum, item) => sum + realTaking(item),
    0,
  )
  const totalTakings = official + undeclared
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
  const fixedCosts = rents + accountant + expenseCosts
  const operatingCosts = purchases + fixedCosts
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
      actual: takings.reduce(
        (sum, item) => sum + officialTaking(item) + realTaking(item),
        0,
      ),
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
  const selectedSeller =
    detail?.type === 'seller'
      ? source.sellers.find((seller) => seller.id === detail.id)
      : undefined
  const selectedSupplier =
    detail?.type === 'supplier'
      ? source.suppliers.find((supplier) => supplier.id === detail.id)
      : undefined
  const sellerInvoices = selectedSeller
    ? data.invoices.filter((invoice) => invoice.sellerId === selectedSeller.id)
    : []
  const sellerTakings = selectedSeller
    ? data.takings.filter((taking) => taking.sellerId === selectedSeller.id)
    : []
  const supplierInvoices = selectedSupplier
    ? data.invoices.filter(
        (invoice) => invoice.supplierId === selectedSupplier.id,
      )
    : []

  const months = useMemo(() => {
    const grouped = new Map<
      string,
      { official: number; actual: number; costs: number }
    >()
    const month = (date: string) => date.slice(0, 7)
    const ensure = (key: string) => {
      const existing = grouped.get(key)
      if (existing) return existing
      const created = { official: 0, actual: 0, costs: 0 }
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
      target.actual += officialTaking(item) + realTaking(item)
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
      values.actual,
      values.costs,
    ]),
  )
  const currentYearStart = `${new Date().getFullYear()}-01-01`
  const yearTakings = source.takings.filter((item) =>
    inRange(item.date, currentYearStart, today()),
  )
  const allTakingDays = new Set(yearTakings.map((item) => item.date)).size
  const allActualTakings = yearTakings.reduce(
    (sum, item) => sum + officialTaking(item) + realTaking(item),
    0,
  )
  const averageDailyTaking =
    allTakingDays > 0 ? allActualTakings / allTakingDays : 0
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
    allActualTakings +
    averageDailyTaking * remainingDays -
    yearCosts -
    futureFixedCosts
  const officialRows: MetricDetailRow[] = data.takings.map((item) => ({
    date: item.date,
    category: 'Incasso fiscale',
    description: item.sellerName || 'Venditore non indicato',
    reference: `Cash ${money(item.cash)} · POS ${money(item.pos)}`,
    amount: officialTaking(item),
  }))
  const undeclaredRows: MetricDetailRow[] = data.takings.map((item) => ({
    date: item.date,
    category: 'Incasso non fiscale',
    description: item.sellerName || 'Venditore non indicato',
    reference: item.supplierName || 'Nessun fornitore indicato',
    amount: realTaking(item),
  }))
  const actualRows: MetricDetailRow[] = data.takings.map((item) => ({
    date: item.date,
    category: 'Totale incasso reale',
    description: item.sellerName || 'Venditore non indicato',
    reference: `Fiscale ${money(officialTaking(item))} · Non fiscale ${money(realTaking(item))}`,
    amount: officialTaking(item) + realTaking(item),
  }))
  const purchaseRows: MetricDetailRow[] = data.invoices.map((item) => ({
    date: item.date,
    category: 'Fattura fornitore',
    description: item.supplierName || 'Fornitore non indicato',
    reference: `${item.number || 'Senza numero'} · ${item.sellerName || 'Venditore non indicato'}`,
    amount: item.total,
  }))
  const fixedCostRows: MetricDetailRow[] = [
    ...data.rentals.map((item) => ({
      date: item.date,
      category: 'Affitto',
      description: item.property || item.tenant || 'Affitto',
      reference: item.period || 'Periodo non indicato',
      amount: item.total,
    })),
    ...data.accountantInvoices.map((item) => ({
      date: item.date,
      category: 'Contabile',
      description: item.description || 'Fattura contabile',
      reference: item.number || 'Senza numero',
      amount: item.total,
    })),
    ...data.expenses
      .map((item) => ({
        item,
        allocated: allocatedExpense(item, range.start, range.end),
      }))
      .filter(({ allocated }) => allocated !== 0)
      .map(({ item, allocated }) => ({
        date: item.date,
        category: {
          stipendio: 'Stipendio',
          tassa: 'Tassa',
          contabile: 'Contabile',
          altra: 'Altra spesa',
        }[item.type],
        description: item.description || item.sellerName || 'Spesa',
        reference:
          item.recurrence === 'monthly'
            ? 'Importo mensile ripartito nel periodo'
            : item.notes || 'Spesa del periodo',
        amount: allocated,
      })),
  ]
  const inputVatRows: MetricDetailRow[] = [
    ...data.invoices.map((item) => ({
      date: item.date,
      category: 'IVA fattura fornitore',
      description: item.supplierName || 'Fornitore non indicato',
      reference: item.number || 'Senza numero',
      amount: item.vat,
    })),
    ...data.rentals.map((item) => ({
      date: item.date,
      category: 'IVA affitto',
      description: item.property || item.tenant || 'Affitto',
      reference: item.period || 'Periodo non indicato',
      amount: item.vat,
    })),
    ...data.accountantInvoices.map((item) => ({
      date: item.date,
      category: 'IVA contabile',
      description: item.description || 'Fattura contabile',
      reference: item.number || 'Senza numero',
      amount: item.vat,
    })),
  ]
  const outputVatRows: MetricDetailRow[] = data.takings.map((item) => ({
    date: item.date,
    category: 'IVA incassi',
    description: item.sellerName || 'Venditore non indicato',
    reference: 'Già inclusa in Cash + POS',
    amount: item.vat,
  }))
  const negativeOperatingRows = [...purchaseRows, ...fixedCostRows].map(
    (row) => ({
      ...row,
      amount: -row.amount,
    }),
  )
  const metricDetails: Record<
    MetricKey,
    {
      title: string
      note: string
      value: number
      rows: MetricDetailRow[]
      tone: 'green' | 'cyan' | 'violet' | 'amber' | 'red'
    }
  > = {
    official: {
      title: 'Incasso fiscale',
      note: 'Somma di Cash e POS; l’IVA indicata è già compresa.',
      value: official,
      rows: officialRows,
      tone: 'green',
    },
    undeclared: {
      title: 'Incasso non fiscale',
      note: 'Importi aggiuntivi inseriti manualmente nel campo Incasso reale.',
      value: undeclared,
      rows: undeclaredRows,
      tone: 'cyan',
    },
    actual: {
      title: 'Totale incasso reale',
      note: 'Totale effettivo: incasso fiscale più incasso non fiscale.',
      value: totalTakings,
      rows: actualRows,
      tone: 'violet',
    },
    purchases: {
      title: 'Costi totali delle fatture',
      note: 'Imponibile più IVA di tutte le fatture fornitori del periodo.',
      value: purchases,
      rows: purchaseRows,
      tone: 'amber',
    },
    'fixed-costs': {
      title: 'Spese fisse e ripartite',
      note: 'Affitti, stipendi, tasse, contabile e altre spese del periodo.',
      value: fixedCosts,
      rows: fixedCostRows,
      tone: 'amber',
    },
    'official-profit': {
      title: 'Utile fiscale',
      note: 'Incasso fiscale meno fatture fornitori e spese fisse.',
      value: official - operatingCosts,
      rows: [...officialRows, ...negativeOperatingRows],
      tone: official - operatingCosts >= 0 ? 'green' : 'red',
    },
    'actual-profit': {
      title: 'Utile reale',
      note: 'Totale incasso reale meno fatture fornitori e spese fisse.',
      value: totalTakings - operatingCosts,
      rows: [...actualRows, ...negativeOperatingRows],
      tone: totalTakings - operatingCosts >= 0 ? 'cyan' : 'red',
    },
    'input-vat': {
      title: 'IVA a credito',
      note: 'IVA delle fatture fornitori, degli affitti e del contabile.',
      value: inputVat,
      rows: inputVatRows,
      tone: 'cyan',
    },
    'output-vat': {
      title: 'IVA a debito',
      note: 'IVA già inclusa negli importi fiscali Cash e POS.',
      value: outputVat,
      rows: outputVatRows,
      tone: 'amber',
    },
    'vat-balance': {
      title: 'Saldo IVA',
      note: 'IVA a debito meno IVA a credito.',
      value: outputVat - inputVat,
      rows: [
        ...outputVatRows,
        ...inputVatRows.map((row) => ({ ...row, amount: -row.amount })),
      ],
      tone: outputVat - inputVat > 0 ? 'red' : 'green',
    },
    stock: {
      title: 'Venit stock',
      note: 'Venit teorico delle fatture meno il totale incasso reale.',
      value: theoretical - totalTakings,
      rows: [
        ...data.invoices.map((item) => ({
          date: item.date,
          category: 'Venit teorico',
          description: item.supplierName || 'Fornitore non indicato',
          reference: item.number || 'Senza numero',
          amount: item.theoreticalRevenue,
        })),
        ...actualRows.map((row) => ({ ...row, amount: -row.amount })),
      ],
      tone: 'violet',
    },
    forecast: {
      title: `Pronostico utile al ${seasonEnd}`,
      note: 'Incassi reali acquisiti e stimati meno costi sostenuti e futuri.',
      value: seasonForecast,
      rows: [
        {
          date: today(),
          category: 'Incassi reali acquisiti',
          description: 'Totale dall’inizio dell’anno',
          reference: `${allTakingDays} giornate con incassi`,
          amount: allActualTakings,
        },
        {
          date: seasonEnd,
          category: 'Incassi reali stimati',
          description: 'Proiezione fino a fine stagione',
          reference: `${remainingDays} giorni lavorativi rimanenti`,
          amount: averageDailyTaking * remainingDays,
        },
        {
          date: today(),
          category: 'Costi sostenuti',
          description: 'Fatture e spese dall’inizio dell’anno',
          reference: 'Voce sottratta dal pronostico',
          amount: -yearCosts,
        },
        {
          date: seasonEnd,
          category: 'Spese fisse future',
          description: 'Spese mensili ripartite fino a fine stagione',
          reference: 'Voce sottratta dal pronostico',
          amount: -futureFixedCosts,
        },
      ],
      tone: seasonForecast >= 0 ? 'cyan' : 'red',
    },
  }
  const selectedMetric =
    detail?.type === 'metric' ? metricDetails[detail.metric] : undefined

  async function exportMetricExcel() {
    if (!selectedMetric) return
    const XLSX = await import('xlsx')
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(
        selectedMetric.rows.map((row) => ({
          Data: row.date,
          Categoria: row.category,
          Descrizione: row.description,
          Riferimento: row.reference,
          Importo: row.amount,
        })),
      ),
      'Dettaglio',
    )
    XLSX.writeFile(
      workbook,
      `statistiche-${filenamePart(selectedMetric.title)}-${filenamePart(source.company?.name ?? '')}-${new Date().toISOString().slice(0, 10)}.xlsx`,
    )
  }

  async function exportSellerExcel() {
    if (!selectedSeller) return
    const XLSX = await import('xlsx')
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(
        sellerInvoices.map((invoice) => ({
          Data: invoice.date,
          Numero: invoice.number,
          Fornitore: invoice.supplierName,
          Totale: invoice.total,
          'Venit previsto': invoice.theoreticalRevenue,
          'Ricarico %': invoice.markupPercent,
        })),
      ),
      'Fatture',
    )
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(
        sellerTakings.map((taking) => ({
          Data: taking.date,
          Cash: taking.cash,
          POS: taking.pos,
          'Incasso fiscale': officialTaking(taking),
          'Incasso non fiscale': realTaking(taking),
          'Totale incasso reale':
            officialTaking(taking) + realTaking(taking),
          'IVA inclusa': taking.vat,
        })),
      ),
      'Incassi',
    )
    XLSX.writeFile(
      workbook,
      `statistiche-venditore-${filenamePart(selectedSeller.name)}-${new Date().toISOString().slice(0, 10)}.xlsx`,
    )
  }

  async function exportSupplierExcel() {
    if (!selectedSupplier) return
    const XLSX = await import('xlsx')
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(
        supplierInvoices.map((invoice) => ({
          Data: invoice.date,
          Numero: invoice.number,
          Venditore: invoice.sellerName,
          Imponibile: invoice.taxableAmount,
          IVA: invoice.vat,
          Totale: invoice.total,
          Pagato: invoice.total - invoiceRemaining(invoice),
          Residuo: invoiceRemaining(invoice),
          Scadenza: invoice.dueDate,
        })),
      ),
      'Fatture',
    )
    XLSX.writeFile(
      workbook,
      `statistiche-fornitore-${filenamePart(selectedSupplier.name)}-${new Date().toISOString().slice(0, 10)}.xlsx`,
    )
  }

  if (selectedMetric) {
    return (
      <div className="page-stack">
        <DetailHeader
          eyebrow="DETTAGLIO STATISTICA"
          name={selectedMetric.title}
          note={selectedMetric.note}
          onBack={() => setDetail(null)}
          onExport={exportMetricExcel}
          period={period}
          selected={selected}
          setPeriod={setPeriod}
          setSelected={setSelected}
        />
        <section className="report-kpis">
          <ReportCard
            label={selectedMetric.title}
            value={selectedMetric.value}
            tone={selectedMetric.tone}
          />
          <CountCard label="Voci nel dettaglio" value={selectedMetric.rows.length} />
        </section>
        <section className="panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">DATI DEL PERIODO</span>
              <h2>Composizione del valore</h2>
            </div>
          </div>
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Categoria</th>
                  <th>Descrizione</th>
                  <th>Riferimento</th>
                  <th>Importo</th>
                </tr>
              </thead>
              <tbody>
                {selectedMetric.rows.map((row, index) => (
                  <tr key={`${row.category}-${row.date}-${index}`}>
                    <td>{row.date || '—'}</td>
                    <td>{row.category}</td>
                    <td>{row.description}</td>
                    <td>{row.reference}</td>
                    <td>{money(row.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {selectedMetric.rows.length === 0 && (
              <div className="empty-state compact-empty">
                <strong>Nessun dato nel periodo</strong>
                <span>Modifica il filtro temporale per vedere altre voci.</span>
              </div>
            )}
          </div>
        </section>
      </div>
    )
  }

  if (selectedSeller) {
    const sellerOfficial = sellerTakings.reduce(
      (sum, item) => sum + officialTaking(item),
      0,
    )
    const sellerUndeclared = sellerTakings.reduce(
      (sum, item) => sum + realTaking(item),
      0,
    )
    const sellerActual = sellerOfficial + sellerUndeclared
    const sellerTheoretical = sellerInvoices.reduce(
      (sum, item) => sum + item.theoreticalRevenue,
      0,
    )
    return (
      <div className="page-stack">
        <DetailHeader
          eyebrow="STATISTICHE VENDITORE"
          name={selectedSeller.name}
          note={
            [selectedSeller.phone, selectedSeller.email]
              .filter(Boolean)
              .join(' · ') || 'Nessun contatto indicato'
          }
          onBack={() => setDetail(null)}
          onExport={exportSellerExcel}
          period={period}
          selected={selected}
          setPeriod={setPeriod}
          setSelected={setSelected}
        />
        <section className="report-kpis">
          <ReportCard label="Incasso fiscale" value={sellerOfficial} tone="green" />
          <ReportCard
            label="Incasso non fiscale"
            value={sellerUndeclared}
            tone="cyan"
          />
          <ReportCard
            label="Totale incasso reale"
            value={sellerActual}
            tone="cyan"
          />
          <ReportCard label="Venit previsto" value={sellerTheoretical} tone="violet" />
          <ReportCard
            label="Venit stock"
            value={sellerTheoretical - sellerActual}
            tone="amber"
          />
        </section>
        <section className="report-columns">
          <article className="panel">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">FATTURE ATTRIBUITE</span>
                <h2>{sellerInvoices.length} fatture nel periodo</h2>
              </div>
            </div>
            <div className="data-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Data / N.</th>
                    <th>Fornitore</th>
                    <th>Costo</th>
                    <th>Venit previsto</th>
                    <th>Ricarico</th>
                  </tr>
                </thead>
                <tbody>
                  {[...sellerInvoices]
                    .sort((left, right) => right.date.localeCompare(left.date))
                    .map((invoice) => (
                      <tr key={invoice.id}>
                        <td>{invoice.date}<small>{invoice.number || 'Senza numero'}</small></td>
                        <td>{invoice.supplierName || '—'}</td>
                        <td>{money(invoice.total)}</td>
                        <td>{money(invoice.theoreticalRevenue)}</td>
                        <td>{invoice.markupPercent.toFixed(2)}%</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </article>
          <article className="panel">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">INCASSI REGISTRATI</span>
                <h2>{sellerTakings.length} giornate nel periodo</h2>
              </div>
            </div>
            <div className="data-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Contanti</th>
                    <th>POS</th>
                    <th>Fiscale</th>
                    <th>Non fiscale</th>
                    <th>Totale reale</th>
                  </tr>
                </thead>
                <tbody>
                  {[...sellerTakings]
                    .sort((left, right) => right.date.localeCompare(left.date))
                    .map((taking) => (
                      <tr key={taking.id}>
                        <td>{taking.date}</td>
                        <td>{money(taking.cash)}</td>
                        <td>{money(taking.pos)}</td>
                        <td>{money(officialTaking(taking))}</td>
                        <td>{money(realTaking(taking))}</td>
                        <td>
                          {money(officialTaking(taking) + realTaking(taking))}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </article>
        </section>
      </div>
    )
  }

  if (selectedSupplier) {
    const supplierTotal = supplierInvoices.reduce(
      (sum, invoice) => sum + invoice.total,
      0,
    )
    const supplierRemaining = supplierInvoices.reduce(
      (sum, invoice) => sum + invoiceRemaining(invoice),
      0,
    )
    const supplierOverdue = supplierInvoices.filter(
      (invoice) => invoiceDueState(invoice) === 'overdue',
    ).length
    return (
      <div className="page-stack">
        <DetailHeader
          eyebrow="STATISTICHE FORNITORE"
          name={selectedSupplier.name}
          note={`${selectedSupplier.paymentTermsDays} giorni per il pagamento${
            selectedSupplier.phone ? ` · ${selectedSupplier.phone}` : ''
          }`}
          onBack={() => setDetail(null)}
          onExport={exportSupplierExcel}
          period={period}
          selected={selected}
          setPeriod={setPeriod}
          setSelected={setSelected}
        />
        <section className="report-kpis">
          <CountCard label="Fatture" value={supplierInvoices.length} />
          <ReportCard label="Totale acquistato" value={supplierTotal} tone="cyan" />
          <ReportCard
            label="Totale pagato"
            value={supplierTotal - supplierRemaining}
            tone="green"
          />
          <ReportCard label="Residuo" value={supplierRemaining} tone="amber" />
          <CountCard label="Fatture scadute" value={supplierOverdue} tone="red" />
        </section>
        <section className="panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">DETTAGLIO ACQUISTI E PAGAMENTI</span>
              <h2>Fatture del periodo selezionato</h2>
            </div>
          </div>
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Data / N.</th>
                  <th>Venditore</th>
                  <th>Totale</th>
                  <th>Pagato</th>
                  <th>Residuo</th>
                  <th>Scadenza</th>
                  <th>Pagamenti</th>
                </tr>
              </thead>
              <tbody>
                {[...supplierInvoices]
                  .sort((left, right) => right.date.localeCompare(left.date))
                  .map((invoice) => {
                    const dueState = invoiceDueState(invoice)
                    const stateLabel = {
                      paid: 'Pagata',
                      overdue: 'Scaduta',
                      'due-soon': 'In scadenza',
                      open: 'Aperta',
                    }[dueState]
                    return (
                      <tr className={`invoice-row ${dueState}`} key={invoice.id}>
                        <td>{invoice.date}<small>{invoice.number || 'Senza numero'}</small></td>
                        <td>
                          <span className={`seller-name ${sellerColorClass(invoice.sellerName)}`}>
                            {invoice.sellerName || '—'}
                          </span>
                        </td>
                        <td>{money(invoice.total)}</td>
                        <td>{money(invoice.total - invoiceRemaining(invoice))}</td>
                        <td>{money(invoiceRemaining(invoice))}</td>
                        <td>
                          <span className={`record-status ${dueState}`}>
                            {stateLabel}
                          </span>
                          <small>{invoice.dueDate || 'Non indicata'}</small>
                        </td>
                        <td>
                          {invoice.payments.length > 0
                            ? invoice.payments.map((payment) => (
                                <small key={payment.id}>
                                  {payment.date} · {money(payment.amount)} · {payment.method}
                                </small>
                              ))
                            : '—'}
                        </td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className="page-stack">
      <header className="page-heading">
        <div>
          <span className="eyebrow">STATISTICHE E FISCO</span>
          <h1>Situazione aziendale</h1>
          <p>
            Incassi fiscali e reali, fatture, spese fisse, IVA e andamento per
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
        <ReportCard
          label="Incasso fiscale"
          value={official}
          tone="green"
          onClick={() => setDetail({ type: 'metric', metric: 'official' })}
        />
        <ReportCard
          label="Incasso non fiscale"
          value={undeclared}
          tone="cyan"
          onClick={() => setDetail({ type: 'metric', metric: 'undeclared' })}
        />
        <ReportCard
          label="Totale incasso reale"
          value={totalTakings}
          tone="violet"
          onClick={() => setDetail({ type: 'metric', metric: 'actual' })}
        />
        <ReportCard
          label="Costi totali (fatture)"
          value={purchases}
          tone="amber"
          onClick={() => setDetail({ type: 'metric', metric: 'purchases' })}
        />
        <ReportCard
          label="Spese fisse e ripartite"
          value={fixedCosts}
          tone="amber"
          onClick={() => setDetail({ type: 'metric', metric: 'fixed-costs' })}
        />
        <ReportCard
          label="Utile fiscale"
          value={official - operatingCosts}
          tone={official - operatingCosts >= 0 ? 'green' : 'red'}
          onClick={() =>
            setDetail({ type: 'metric', metric: 'official-profit' })
          }
        />
        <ReportCard
          label="Utile reale"
          value={totalTakings - operatingCosts}
          tone={totalTakings - operatingCosts >= 0 ? 'cyan' : 'red'}
          onClick={() =>
            setDetail({ type: 'metric', metric: 'actual-profit' })
          }
        />
        <ReportCard
          label="IVA a credito"
          value={inputVat}
          tone="cyan"
          onClick={() => setDetail({ type: 'metric', metric: 'input-vat' })}
        />
        <ReportCard
          label="IVA a debito"
          value={outputVat}
          tone="amber"
          onClick={() => setDetail({ type: 'metric', metric: 'output-vat' })}
        />
        <ReportCard
          label="Saldo IVA"
          value={outputVat - inputVat}
          tone={outputVat - inputVat > 0 ? 'red' : 'green'}
          onClick={() => setDetail({ type: 'metric', metric: 'vat-balance' })}
        />
        <ReportCard
          label="Venit stock"
          value={theoretical - totalTakings}
          tone="violet"
          onClick={() => setDetail({ type: 'metric', metric: 'stock' })}
        />
        <ReportCard
          label={`Pronostico utile al ${seasonEnd}`}
          value={seasonForecast}
          tone={seasonForecast >= 0 ? 'cyan' : 'red'}
          onClick={() => setDetail({ type: 'metric', metric: 'forecast' })}
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
          <div className="entity-stat-grid">
            {sellerStats.map((seller) => (
              <button
                className="entity-stat-card"
                key={seller.id}
                onClick={() => setDetail({ type: 'seller', id: seller.id })}
                type="button"
              >
                <span className="eyebrow">VENDITORE</span>
                <strong>{seller.name}</strong>
                <span>Reale totale {money(seller.actual)}</span>
                <span>Venit previsto {money(seller.theoretical)}</span>
                <em>Apri valutazione dettagliata</em>
              </button>
            ))}
          </div>
        </article>

        <article className="panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">FORNITORI</span>
              <h2>Acquisti e residui</h2>
            </div>
          </div>
          <div className="entity-stat-grid">
            {supplierStats.map((supplier) => (
              <button
                className="entity-stat-card"
                key={supplier.id}
                onClick={() => setDetail({ type: 'supplier', id: supplier.id })}
                type="button"
              >
                <span className="eyebrow">FORNITORE</span>
                <strong>{supplier.name}</strong>
                <span>{supplier.count} fatture · {money(supplier.total)}</span>
                <span>Residuo {money(supplier.remaining)}</span>
                <em>Apri valutazione dettagliata</em>
              </button>
            ))}
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
                  style={{ width: `${(values.actual / maxChart) * 100}%` }}
                />
                <span
                  className="bar costs"
                  style={{ width: `${(values.costs / maxChart) * 100}%` }}
                />
              </div>
              <small>
                F {money(values.official)} · R {money(values.actual)} · C{' '}
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
  onClick,
}: {
  label: string
  value: number
  tone: 'green' | 'cyan' | 'violet' | 'amber' | 'red'
  onClick?: () => void
}) {
  if (onClick) {
    return (
      <button
        className={`report-card report-card-button report-${tone}`}
        onClick={onClick}
        type="button"
      >
        <span>{label}</span>
        <strong>{money(value)}</strong>
        <em>Apri dettaglio ed export</em>
      </button>
    )
  }
  return (
    <article className={`report-card report-${tone}`}>
      <span>{label}</span>
      <strong>{money(value)}</strong>
    </article>
  )
}

function CountCard({
  label,
  value,
  tone = 'violet',
}: {
  label: string
  value: number
  tone?: 'violet' | 'red'
}) {
  return (
    <article className={`report-card report-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  )
}

function DetailHeader({
  eyebrow,
  name,
  note,
  onBack,
  onExport,
  period,
  selected,
  setPeriod,
  setSelected,
}: {
  eyebrow: string
  name: string
  note: string
  onBack: () => void
  onExport?: () => void
  period: Period
  selected: string
  setPeriod: (period: Period) => void
  setSelected: (selected: string) => void
}) {
  return (
    <header className="page-heading">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{name}</h1>
        <p>{note}</p>
        <div className="detail-heading-actions">
          <button className="button button-secondary" onClick={onBack} type="button">
            Torna alle statistiche
          </button>
          {onExport && (
            <button className="button button-primary" onClick={onExport} type="button">
              Esporta Excel
            </button>
          )}
        </div>
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
  )
}
