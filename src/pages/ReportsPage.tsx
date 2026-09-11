import { useMemo, useState } from 'react'
import {
  activeAccounting,
  addDays,
  allocatedExpense,
  bestContactNameMatch,
  invoiceDueState,
  invoiceRemaining,
  money,
  officialTaking,
  realTaking,
  roundMoney,
  sellerColorClass,
  today,
} from '../domain/accounting'
import { useStoredFilters } from '../hooks/useStoredFilters'
import { useAppStore } from '../store/AppStoreContext'

type Period = 'week' | 'month' | 'year' | 'all'
type MetricKey =
  | 'official'
  | 'real'
  | 'purchases'
  | 'unregistered-goods'
  | 'fixed-costs'
  | 'official-profit'
  | 'real-profit'
  | 'input-vat'
  | 'output-vat'
  | 'vat-balance'
  | 'stock'
  | 'forecast'
type HealthMetricKey =
  | 'health-score'
  | 'health-coherence'
  | 'health-markup'
  | 'health-margin'
  | 'health-coverage'
  | 'health-fiscal-markup'
type SellerMetricKey =
  | 'official'
  | 'real'
  | 'purchases'
  | 'unregistered-goods'
  | 'fixed-costs'
  | 'official-profit'
  | 'real-profit'
  | 'input-vat'
  | 'output-vat'
  | 'vat-balance'
  | 'theoretical'
  | 'stock'
  | 'invoice-remaining'
type SupplierMetricKey =
  | 'invoice-count'
  | 'purchased'
  | 'paid'
  | 'remaining'
  | 'overdue-count'
type ReportDetail =
  | { type: 'seller'; id: string }
  | { type: 'supplier'; id: string }
  | null
type CalculationSelection =
  | {
      scope: 'company'
      metric: MetricKey | HealthMetricKey
    }
  | {
      scope: 'seller'
      sellerId: string
      metric: SellerMetricKey | HealthMetricKey
    }
  | {
      scope: 'supplier'
      supplierId: string
      metric: SupplierMetricKey
    }
  | null

interface MetricDetailRow {
  date: string
  category: string
  description: string
  reference: string
  amount: number
}

type MetricValueKind = 'money' | 'percentage' | 'score' | 'count'
type ReportTone = 'green' | 'cyan' | 'violet' | 'amber' | 'red'

interface CalculationStep {
  label: string
  value: number
  kind: MetricValueKind
  reference: string
  operation?: string
}

interface MetricDetailDefinition {
  title: string
  note: string
  value: number | null
  kind: MetricValueKind
  tone: ReportTone
  formula: string
  steps: CalculationStep[]
  rows: MetricDetailRow[]
  rowKind?: MetricValueKind
}

type HealthTone = 'green' | 'violet' | 'amber' | 'red'

interface BusinessHealth {
  score: number | null
  coherence: number | null
  markup: number | null
  netMargin: number | null
  cashCoverage: number | null
  fiscalMarkup: number | null
  grossGoodsCost: number
  inventorySaleValue: number
  estimatedInventoryCost: number
  economicGoodsCost: number
  fiscalSoldPercentage: number | null
  estimatedFiscalInventoryCost: number
  estimatedFiscalGoodsCost: number
  expectedRevenue: number
  coherenceScore: number | null
  markupScore: number | null
  marginScore: number | null
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

function percentage(numerator: number, denominator: number) {
  return denominator > 0 ? roundMoney((numerator / denominator) * 100) : null
}

function workedDatesForTakings(
  takings: Array<{ date: string }>,
  start: string,
  end: string,
) {
  return new Set(
    takings
      .filter((item) => inRange(item.date, start, end))
      .map((item) => item.date),
  )
}

function monthlyAmountForWorkedDates(
  amount: number,
  referenceDate: string,
  workedDates: Set<string>,
) {
  const reference = new Date(`${referenceDate}T00:00:00Z`)
  if (Number.isNaN(reference.valueOf())) return 0
  const month = referenceDate.slice(0, 7)
  const daysWorked = [...workedDates].filter((date) =>
    date.startsWith(month),
  ).length
  const daysInMonth = new Date(
    Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth() + 1, 0),
  ).getUTCDate()
  return roundMoney((amount / daysInMonth) * daysWorked)
}

function expenseForWorkedDates(
  expense: {
    amount: number
    date: string
    recurrence: 'once' | 'monthly'
    recurrenceEndDate: string | null
  },
  start: string,
  end: string,
  workedDates: Set<string>,
) {
  if (expense.recurrence !== 'monthly') {
    return inRange(expense.date, start, end) ? expense.amount : 0
  }
  return roundMoney(
    [...workedDates].reduce((sum, date) => {
      if (
        !inRange(date, start, end) ||
        date < expense.date ||
        (expense.recurrenceEndDate && date > expense.recurrenceEndDate)
      ) {
        return sum
      }
      const cursor = new Date(`${date}T00:00:00Z`)
      const daysInMonth = new Date(
        Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0),
      ).getUTCDate()
      return sum + expense.amount / daysInMonth
    }, 0),
  )
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, value))
}

function weightedHealthScore(
  values: Array<{ score: number | null; weight: number }>,
) {
  const available = values.filter(
    (item): item is { score: number; weight: number } => item.score !== null,
  )
  const totalWeight = available.reduce((sum, item) => sum + item.weight, 0)
  if (totalWeight === 0) return null
  return Math.round(
    available.reduce((sum, item) => sum + item.score * item.weight, 0) /
      totalWeight,
  )
}

function calculateBusinessHealth({
  official,
  real,
  goodsCost,
  fixedCosts,
  theoreticalRevenue,
}: {
  official: number
  real: number
  goodsCost: number
  fixedCosts: number
  theoreticalRevenue: number
}): BusinessHealth {
  const inventorySaleValue = roundMoney(
    Math.max(theoreticalRevenue - real, 0),
  )
  const estimatedInventoryCost = roundMoney(
    Math.min(goodsCost, inventorySaleValue / 1.975),
  )
  const economicGoodsCost = roundMoney(
    Math.max(goodsCost - estimatedInventoryCost, 0),
  )
  const expectedRevenue = roundMoney(economicGoodsCost * 1.975)
  const fiscalSoldPercentage =
    theoreticalRevenue > 0
      ? roundMoney(
          Math.min(
            Math.max(
              ((theoreticalRevenue - inventorySaleValue) /
                theoreticalRevenue) *
                100,
              0,
            ),
            100,
          ),
        )
      : null
  const estimatedFiscalGoodsCost =
    fiscalSoldPercentage === null
      ? 0
      : roundMoney(goodsCost * (fiscalSoldPercentage / 100))
  const estimatedFiscalInventoryCost = roundMoney(
    Math.max(goodsCost - estimatedFiscalGoodsCost, 0),
  )
  const coherence = percentage(real, expectedRevenue)
  const markup =
    economicGoodsCost > 0
      ? roundMoney(((real - economicGoodsCost) / economicGoodsCost) * 100)
      : null
  const netMargin = percentage(real - economicGoodsCost - fixedCosts, real)
  const cashCoverage = percentage(official, real)
  const fiscalMarkup =
    estimatedFiscalGoodsCost > 0
      ? roundMoney(
          ((official - estimatedFiscalGoodsCost) /
            estimatedFiscalGoodsCost) *
            100,
        )
      : null
  const coherenceScore =
    coherence === null
      ? null
      : clampScore(100 - Math.abs(coherence - 100) * 2)
  const markupScore =
    markup === null
      ? null
      : markup < 85
        ? clampScore(100 - (85 - markup) * 3)
        : markup > 110
          ? clampScore(100 - (markup - 110) * 1.5)
          : 100
  const marginScore =
    netMargin === null
      ? null
      : clampScore(((netMargin + 15) / 30) * 100)
  return {
    score: weightedHealthScore([
      { score: coherenceScore, weight: 0.4 },
      { score: markupScore, weight: 0.3 },
      { score: marginScore, weight: 0.3 },
    ]),
    coherence,
    markup,
    netMargin,
    cashCoverage,
    fiscalMarkup,
    grossGoodsCost: goodsCost,
    inventorySaleValue,
    estimatedInventoryCost,
    economicGoodsCost,
    fiscalSoldPercentage,
    estimatedFiscalInventoryCost,
    estimatedFiscalGoodsCost,
    expectedRevenue,
    coherenceScore,
    markupScore,
    marginScore,
  }
}

function overallHealthTone(score: number | null): HealthTone {
  if (score === null) return 'violet'
  if (score >= 80) return 'green'
  if (score >= 60) return 'amber'
  return 'red'
}

function overallHealthLabel(score: number | null) {
  if (score === null) return 'Dati insufficienti'
  if (score >= 80) return 'Parametri coerenti'
  if (score >= 60) return 'Controllare alcuni valori'
  return 'Possibile anomalia'
}

function healthToneLabel(tone: HealthTone) {
  if (tone === 'green') return 'Coerente'
  if (tone === 'amber') return 'Attenzione'
  if (tone === 'red') return 'Problema'
  return 'Dati insufficienti'
}

function rangeHealthTone(
  value: number | null,
  greenMin: number,
  greenMax: number,
  warningMin: number,
  warningMax: number,
): HealthTone {
  if (value === null) return 'violet'
  if (value >= greenMin && value <= greenMax) return 'green'
  if (value >= warningMin && value <= warningMax) return 'amber'
  return 'red'
}

function minimumHealthTone(
  value: number | null,
  greenMin: number,
  warningMin: number,
): HealthTone {
  if (value === null) return 'violet'
  if (value >= greenMin) return 'green'
  if (value >= warningMin) return 'amber'
  return 'red'
}

function fiscalMarkupTone(value: number | null): HealthTone {
  if (value === null) return 'violet'
  if (value < 0) return 'red'
  if (value >= 15 && value <= 20) return 'green'
  return 'amber'
}

function metricValue(value: number | null, kind: MetricValueKind) {
  if (value === null) return '—'
  if (kind === 'money') return money(value)
  if (kind === 'percentage') return `${value.toFixed(2)}%`
  if (kind === 'score') return `${Math.round(value)}/100`
  return `${Math.round(value)}`
}

function metricTone(tone: HealthTone): ReportTone {
  return tone === 'violet' ? 'violet' : tone
}

function calculationRowsByCategory(rows: MetricDetailRow[]) {
  const categories = new Map<string, number>()
  rows.forEach((row) => {
    categories.set(
      row.category,
      roundMoney((categories.get(row.category) ?? 0) + row.amount),
    )
  })
  return [...categories.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((left, right) => Math.abs(right.value) - Math.abs(left.value))
}

function calculationRowsByMonth(rows: MetricDetailRow[]) {
  const months = new Map<string, number>()
  rows.forEach((row) => {
    if (!row.date) return
    const month = row.date.slice(0, 7)
    months.set(month, roundMoney((months.get(month) ?? 0) + row.amount))
  })
  return [...months.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([label, value]) => ({ label, value }))
}

function sumRows(rows: MetricDetailRow[]) {
  return roundMoney(rows.reduce((sum, row) => sum + row.amount, 0))
}

function healthMetricDetails({
  health,
  realRows,
  officialRows,
  purchaseRows,
  unregisteredGoodsRows,
  fixedCostRows,
}: {
  health: BusinessHealth
  realRows: MetricDetailRow[]
  officialRows: MetricDetailRow[]
  purchaseRows: MetricDetailRow[]
  unregisteredGoodsRows: MetricDetailRow[]
  fixedCostRows: MetricDetailRow[]
}): Record<HealthMetricKey, MetricDetailDefinition> {
  const goodsRows = [...purchaseRows, ...unregisteredGoodsRows]
  const economicRows = [...realRows, ...goodsRows, ...fixedCostRows]
  const fiscalRows = [...officialRows, ...goodsRows]
  const fiscalStockRows: MetricDetailRow[] =
    health.estimatedFiscalInventoryCost > 0
      ? [
          {
            date: '',
            category: 'Stock residuo',
            description: 'Costo stimato della merce ancora in magazzino',
            reference:
              'Quota percentuale dello stock residuo applicata agli acquisti lordi',
            amount: -health.estimatedFiscalInventoryCost,
          },
        ]
      : []
  return {
    'health-score': {
      title: 'Indice salute economica',
      note: 'Media ponderata di coerenza vendite, ricarico reale e margine netto. Cash e POS non entrano nel punteggio.',
      value: health.score,
      kind: 'score',
      tone: metricTone(overallHealthTone(health.score)),
      formula:
        '(Punteggio coerenza × 40%) + (punteggio ricarico × 30%) + (punteggio margine × 30%)',
      steps: [
        {
          label: 'Punteggio coerenza vendite',
          value: health.coherenceScore ?? 0,
          kind: 'score',
          reference: `Deriva dalla coerenza economica ${percentageLabel(health.coherence)}.`,
          operation: '× 40%',
        },
        {
          label: 'Punteggio ricarico reale',
          value: health.markupScore ?? 0,
          kind: 'score',
          reference: `Deriva dal ricarico reale ${percentageLabel(health.markup)}; fascia di riferimento 85–110%.`,
          operation: '× 30%',
        },
        {
          label: 'Punteggio margine netto',
          value: health.marginScore ?? 0,
          kind: 'score',
          reference: `Deriva dal margine netto ${percentageLabel(health.netMargin)}.`,
          operation: '× 30%',
        },
      ],
      rows: economicRows,
    },
    'health-coherence': {
      title: 'Coerenza vendite',
      note: 'Confronta l’incasso reale con il valore atteso della sola merce stimata come venduta. La merce ancora in magazzino non viene trattata come perdita.',
      value: health.coherence,
      kind: 'percentage',
      tone: metricTone(
        rangeHealthTone(health.coherence, 90, 110, 80, 120),
      ),
      formula:
        'Incasso reale ÷ (costo merce venduta stimato × 1,975) × 100',
      steps: [
        {
          label: 'Incasso reale',
          value: sumRows(realRows),
          kind: 'money',
          reference: 'Somma degli incassi reali registrati nel periodo.',
          operation: 'Numeratore',
        },
        {
          label: 'Costo merce acquistata',
          value: health.grossGoodsCost,
          kind: 'money',
          reference: 'Fatture fornitori più merce acquistata senza fattura.',
        },
        {
          label: 'Valore vendita dello stock residuo',
          value: health.inventorySaleValue,
          kind: 'money',
          reference: 'Venit teorico netto meno incasso reale; rappresenta merce ancora in magazzino.',
          operation: '÷ 1,975',
        },
        {
          label: 'Costo stimato dello stock',
          value: health.estimatedInventoryCost,
          kind: 'money',
          reference: 'Quota del costo acquisti attribuita alla merce non ancora venduta.',
          operation: 'Sottratto dagli acquisti',
        },
        {
          label: 'Costo merce venduta stimato',
          value: health.economicGoodsCost,
          kind: 'money',
          reference: 'Costo acquistato meno costo stimato dello stock residuo.',
          operation: '× 1,975',
        },
        {
          label: 'Vendite attese sulla merce venduta',
          value: health.expectedRevenue,
          kind: 'money',
          reference: 'Riferimento medio tra ricarico 85% e 110%.',
          operation: 'Denominatore',
        },
      ],
      rows: economicRows,
    },
    'health-markup': {
      title: 'Ricarico reale',
      note: 'Misura il ricarico ottenuto sull’incasso reale usando il costo stimato della merce effettivamente venduta.',
      value: health.markup,
      kind: 'percentage',
      tone: metricTone(
        rangeHealthTone(health.markup, 85, 110, 70, 150),
      ),
      formula:
        '(Incasso reale − costo merce venduta stimato) ÷ costo merce venduta stimato × 100',
      steps: [
        {
          label: 'Incasso reale',
          value: sumRows(realRows),
          kind: 'money',
          reference: 'Totale effettivamente incassato nel periodo.',
          operation: 'Meno',
        },
        {
          label: 'Costo merce venduta stimato',
          value: health.economicGoodsCost,
          kind: 'money',
          reference: 'Acquisti al netto del costo stimato della merce ancora in magazzino.',
          operation: 'Poi diviso per questo valore',
        },
      ],
      rows: [...realRows, ...goodsRows],
    },
    'health-margin': {
      title: 'Margine netto',
      note: 'Mostra quanto resta dell’incasso reale dopo merce venduta e costi fissi maturati sui giorni lavorati.',
      value: health.netMargin,
      kind: 'percentage',
      tone: metricTone(minimumHealthTone(health.netMargin, 10, 0)),
      formula:
        '(Incasso reale − costo merce venduta stimato − costi fissi maturati) ÷ incasso reale × 100',
      steps: [
        {
          label: 'Incasso reale',
          value: sumRows(realRows),
          kind: 'money',
          reference: 'Totale effettivamente incassato nel periodo.',
          operation: 'Base 100%',
        },
        {
          label: 'Costo merce venduta stimato',
          value: health.economicGoodsCost,
          kind: 'money',
          reference: 'Acquisti al netto dello stock residuo stimato.',
          operation: 'Sottratto',
        },
        {
          label: 'Costi fissi maturati',
          value: sumRows(fixedCostRows),
          kind: 'money',
          reference: 'Affitti, stipendi, tasse, contabile e altre spese attribuite al periodo.',
          operation: 'Sottratti',
        },
      ],
      rows: economicRows,
    },
    'health-coverage': {
      title: 'Copertura fiscale',
      note: 'Alert fiscale separato: confronta Cash + POS battuti con l’incasso reale dichiarato.',
      value: health.cashCoverage,
      kind: 'percentage',
      tone: metricTone(
        rangeHealthTone(health.cashCoverage, 95, 105, 85, 115),
      ),
      formula: '(Cash + POS) ÷ incasso reale × 100',
      steps: [
        {
          label: 'Incasso fiscale battuto',
          value: sumRows(officialRows),
          kind: 'money',
          reference: 'Somma di Cash e POS registrati nel periodo.',
          operation: 'Numeratore',
        },
        {
          label: 'Incasso reale',
          value: sumRows(realRows),
          kind: 'money',
          reference: 'Totale effettivamente incassato nel periodo.',
          operation: 'Denominatore',
        },
      ],
      rows: [...officialRows, ...realRows],
    },
    'health-fiscal-markup': {
      title: 'Ricarico fiscale sulla merce venduta stimata',
      note: 'Alert stimato calcolato sul battuto e sulla quota di acquisti attribuita alla merce venduta. Il Venit stock serve solo a ricavare la percentuale venduto/residuo e non viene convertito in costo con il ricarico medio.',
      value: health.fiscalMarkup,
      kind: 'percentage',
      tone: metricTone(fiscalMarkupTone(health.fiscalMarkup)),
      formula:
        '((Cash + POS) − (acquisti × % merce venduta)) ÷ (acquisti × % merce venduta) × 100',
      steps: [
        {
          label: 'Incasso fiscale battuto',
          value: sumRows(officialRows),
          kind: 'money',
          reference: 'Somma di Cash e POS registrati nel periodo.',
          operation: 'Meno',
        },
        {
          label: 'Costo merce acquistata lordo',
          value: health.grossGoodsCost,
          kind: 'money',
          reference: 'Fatture fornitori più merce acquistata senza fattura.',
          operation: 'Partenza costo',
        },
        {
          label: 'Merce venduta stimata',
          value: health.fiscalSoldPercentage ?? 0,
          kind: 'percentage',
          reference:
            'Percentuale del Venit già venduto rispetto a Venit venduto più stock residuo.',
          operation: 'Applicata agli acquisti lordi',
        },
        {
          label: 'Costo stock residuo stimato',
          value: health.estimatedFiscalInventoryCost,
          kind: 'money',
          reference:
            'Quota degli acquisti attribuita alla percentuale di merce rimasta.',
          operation: 'Sottratto dagli acquisti',
        },
        {
          label: 'Costo merce venduta stimato',
          value: health.estimatedFiscalGoodsCost,
          kind: 'money',
          reference:
            'Acquisti lordi moltiplicati per la percentuale di merce venduta.',
          operation: 'Sottratto dal battuto e usato come divisore',
        },
      ],
      rows: [...fiscalRows, ...fiscalStockRows],
    },
  }
}

function percentageLabel(value: number | null) {
  return value === null ? '—' : `${value.toLocaleString('it-IT')}%`
}

export function ReportsPage() {
  const { state } = useAppStore()
  const reportFilterDefaults = {
    period: 'all' as Period,
    selected: today(),
  }
  const [reportFilters, setReportFilters] = useStoredFilters(
    `report-filters:${state.accounting.activeCompanyId ?? 'none'}`,
    reportFilterDefaults,
  )
  const period = reportFilters.period
  const selected = reportFilters.selected
  const setPeriod = (nextPeriod: Period) =>
    setReportFilters((current) => ({ ...current, period: nextPeriod }))
  const setSelected = (nextSelected: string) =>
    setReportFilters((current) => ({ ...current, selected: nextSelected }))
  const [detail, setDetail] = useState<ReportDetail>(null)
  const [calculation, setCalculation] =
    useState<CalculationSelection>(null)
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
  const real = data.takings.reduce(
    (sum, item) => sum + realTaking(item),
    0,
  )
  const purchases = data.invoices.reduce(
    (sum, item) => sum + item.total,
    0,
  )
  const unregisteredGoods = data.invoices.reduce(
    (sum, item) => sum + item.unregisteredGoods,
    0,
  )
  const companyWorkedDates = workedDatesForTakings(
    data.takings,
    range.start,
    range.end,
  )
  const rents = data.rentals.reduce(
    (sum, item) =>
      sum +
      monthlyAmountForWorkedDates(
        item.total,
        item.date,
        companyWorkedDates,
      ),
    0,
  )
  const accountant = data.accountantInvoices.reduce(
    (sum, item) =>
      sum +
      monthlyAmountForWorkedDates(
        item.total,
        item.date,
        companyWorkedDates,
      ),
    0,
  )
  const expenseCosts = data.expenses.reduce(
    (sum, item) =>
      sum +
      expenseForWorkedDates(
        item,
        range.start,
        range.end,
        companyWorkedDates,
      ),
    0,
  )
  const fixedCosts = rents + accountant + expenseCosts
  const operatingCosts = purchases + fixedCosts
  const realOperatingCosts = operatingCosts + unregisteredGoods
  const expenseByType = {
    stipendi: data.expenses
      .filter((item) => item.type === 'stipendio')
      .reduce(
        (sum, item) =>
          sum +
          expenseForWorkedDates(
            item,
            range.start,
            range.end,
            companyWorkedDates,
          ),
        0,
      ),
    tasse: data.expenses
      .filter((item) => item.type === 'tassa')
      .reduce(
        (sum, item) =>
          sum +
          expenseForWorkedDates(
            item,
            range.start,
            range.end,
            companyWorkedDates,
          ),
        0,
      ),
    contabile: data.expenses
      .filter((item) => item.type === 'contabile')
      .reduce(
        (sum, item) =>
          sum +
          expenseForWorkedDates(
            item,
            range.start,
            range.end,
            companyWorkedDates,
          ),
        0,
      ),
    altre: data.expenses
      .filter((item) => item.type === 'altra')
      .reduce(
        (sum, item) =>
          sum +
          expenseForWorkedDates(
            item,
            range.start,
            range.end,
            companyWorkedDates,
          ),
        0,
      ),
  }
  const allSellerIds = source.sellers.map((seller) => seller.id)
  const knownSellerIds = new Set(allSellerIds)
  const allocationTargets = (item: { allocationSellerIds: string[] }) => {
    const validSellerIds = item.allocationSellerIds.filter((sellerId) =>
      knownSellerIds.has(sellerId),
    )
    return validSellerIds.length > 0 ? validSellerIds : allSellerIds
  }
  const allocatedSellerCost = (
    value: number,
    item: { allocationSellerIds: string[] },
    sellerId: string,
  ) => {
    const sellerIds = allocationTargets(item)
    return sellerIds.includes(sellerId) && sellerIds.length > 0
      ? roundMoney(value / sellerIds.length)
      : 0
  }
  const sellerCostBreakdown = (seller: { id: string }) => {
    const sellerWorkedDates = workedDatesForTakings(
      data.takings.filter((item) => item.sellerId === seller.id),
      range.start,
      range.end,
    )
    const rent = data.rentals.reduce(
      (sum, item) =>
        sum +
        allocatedSellerCost(
          monthlyAmountForWorkedDates(
            item.total,
            item.date,
            sellerWorkedDates,
          ),
          item,
          seller.id,
        ),
      0,
    )
    const allocatedExpenseType = (type: 'tassa' | 'contabile' | 'altra') =>
      data.expenses
        .filter((item) => item.type === type)
        .reduce(
          (sum, item) =>
            sum +
            allocatedSellerCost(
              expenseForWorkedDates(
                item,
                range.start,
                range.end,
                sellerWorkedDates,
              ),
              item,
              seller.id,
            ),
          0,
        )
    const taxes = allocatedExpenseType('tassa')
    const accounting =
      data.accountantInvoices.reduce(
        (sum, item) =>
          sum +
          allocatedSellerCost(
            monthlyAmountForWorkedDates(
              item.total,
              item.date,
              sellerWorkedDates,
            ),
            item,
            seller.id,
          ),
        0,
      ) + allocatedExpenseType('contabile')
    const other = allocatedExpenseType('altra')
    const salaryPaid = data.expenses
      .filter((item) => {
        if (item.type !== 'stipendio') return false
        const salarySellerId =
          item.sellerId && knownSellerIds.has(item.sellerId)
            ? item.sellerId
            : bestContactNameMatch(item.sellerName, source.sellers)?.id
        return (
          salarySellerId === seller.id &&
          inRange(item.date, range.start, range.end)
        )
      })
      .reduce((sum, item) => sum + item.amount, 0)
    return {
      rent,
      taxes,
      accounting,
      other,
      salaryPaid,
      total: roundMoney(rent + taxes + accounting + other + salaryPaid),
    }
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
  const supplierSellerRevenueTransfers = data.invoices.flatMap((invoice) => {
    if (
      !invoice.sellerId ||
      invoice.taxableAmount !== 0 ||
      invoice.theoreticalRevenue <= 0
    ) {
      return []
    }
    const supplier = source.suppliers.find(
      (item) => item.id === invoice.supplierId,
    )
    if (!supplier?.sellerRevenueTransferEnabled) return []
    const linkedSellerId =
      bestContactNameMatch(
        invoice.supplierName || supplier.name,
        source.sellers,
      )?.id ?? supplier.linkedSellerId
    if (
      !linkedSellerId ||
      linkedSellerId === invoice.sellerId ||
      !knownSellerIds.has(linkedSellerId) ||
      !knownSellerIds.has(invoice.sellerId)
    ) {
      return []
    }
    return [
      {
        fromSellerId: linkedSellerId,
        toSellerId: invoice.sellerId,
        amount: roundMoney(invoice.theoreticalRevenue),
        date: invoice.date,
        supplierName: invoice.supplierName || supplier.name,
        invoiceNumber: invoice.number,
      },
    ]
  })
  const transferredVenit = supplierSellerRevenueTransfers.reduce(
    (sum, transfer) => sum + transfer.amount,
    0,
  )
  const companyTheoretical = roundMoney(theoretical - transferredVenit)
  const companyHealth = calculateBusinessHealth({
    official,
    real,
    goodsCost: purchases + unregisteredGoods,
    fixedCosts,
    theoreticalRevenue: companyTheoretical,
  })

  const sellerStats = source.sellers.map((seller) => {
    const takings = data.takings.filter((item) => item.sellerId === seller.id)
    const invoices = data.invoices.filter(
      (item) => item.sellerId === seller.id,
    )
    const real = takings.reduce((sum, item) => sum + realTaking(item), 0)
    const totalVenit = roundMoney(
      invoices.reduce(
        (sum, item) => sum + item.theoreticalRevenue,
        0,
      ) -
        supplierSellerRevenueTransfers
          .filter((transfer) => transfer.fromSellerId === seller.id)
          .reduce((sum, transfer) => sum + transfer.amount, 0),
    )
    const invoiceTotal = invoices.reduce((sum, item) => sum + item.total, 0)
    const unregisteredGoods = invoices.reduce(
      (sum, item) => sum + item.unregisteredGoods,
      0,
    )
    const costs = sellerCostBreakdown(seller)
    const official = takings.reduce(
      (sum, item) => sum + officialTaking(item),
      0,
    )
    const health = calculateBusinessHealth({
      official,
      real,
      goodsCost: invoiceTotal + unregisteredGoods,
      fixedCosts: costs.total,
      theoreticalRevenue: totalVenit,
    })
    return {
      id: seller.id,
      name: seller.name,
      pointOfSaleSeller: seller.pointOfSaleSeller,
      official,
      invoiceTotal,
      invoiceRemaining: invoices.reduce(
        (sum, item) => sum + invoiceRemaining(item),
        0,
      ),
      real,
      theoretical: totalVenit,
      stockResidual: totalVenit - real,
      salaryPaid: costs.salaryPaid,
      allocatedCosts: costs.total,
      realProfit: roundMoney(
        real - invoiceTotal - unregisteredGoods - costs.total,
      ),
      health,
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
  const selectedSellerStats = selectedSeller
    ? sellerStats.find((seller) => seller.id === selectedSeller.id)
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
      ensure(month(item.date)).costs += item.total + item.unregisteredGoods
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
      .reduce(
        (sum, item) => sum + item.total + item.unregisteredGoods,
        0,
      ) +
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
  const officialRows: MetricDetailRow[] = data.takings.map((item) => ({
    date: item.date,
    category: 'Incasso fiscale',
    description: item.sellerName || 'Venditore non indicato',
    reference: `Cash ${money(item.cash)} · POS ${money(item.pos)}`,
    amount: officialTaking(item),
  }))
  const realRows: MetricDetailRow[] = data.takings.map((item) => ({
    date: item.date,
    category: 'Incasso reale',
    description: item.sellerName || 'Venditore non indicato',
    reference: `Incasso fiscale registrato ${money(officialTaking(item))}`,
    amount: realTaking(item),
  }))
  const purchaseRows: MetricDetailRow[] = data.invoices.map((item) => ({
    date: item.date,
    category: 'Fattura fornitore',
    description: item.supplierName || 'Fornitore non indicato',
    reference: `${item.number || 'Senza numero'} · ${item.sellerName || 'Venditore non indicato'}`,
    amount: item.total,
  }))
  const unregisteredGoodsRows: MetricDetailRow[] = data.invoices
    .map((item) => ({
      date: item.date,
      category: 'Merce acquistata senza fattura',
      description: item.supplierName || item.description || 'Acquisto',
      reference: `${item.number || 'Senza numero'} · ${item.sellerName || 'Venditore non indicato'}`,
      amount: item.unregisteredGoods,
    }))
    .filter((row) => row.amount !== 0)
  const fixedCostRows: MetricDetailRow[] = [
    ...data.rentals.map((item) => ({
      date: item.date,
      category: 'Affitto',
      description: item.property || item.tenant || 'Affitto',
      reference: `${item.period || 'Periodo non indicato'} · quota sui giorni lavorati`,
      amount: monthlyAmountForWorkedDates(
        item.total,
        item.date,
        companyWorkedDates,
      ),
    })),
    ...data.accountantInvoices.map((item) => ({
      date: item.date,
      category: 'Contabile',
      description: item.description || 'Fattura contabile',
      reference: `${item.number || 'Senza numero'} · quota sui giorni lavorati`,
      amount: monthlyAmountForWorkedDates(
        item.total,
        item.date,
        companyWorkedDates,
      ),
    })),
    ...data.expenses
      .map((item) => ({
        item,
        allocated: expenseForWorkedDates(
          item,
          range.start,
          range.end,
          companyWorkedDates,
        ),
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
            ? 'Importo mensile ripartito sui giorni lavorati'
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
  const negativeRealOperatingRows = [
    ...negativeOperatingRows,
    ...unregisteredGoodsRows.map((row) => ({
      ...row,
      amount: -row.amount,
    })),
  ]
  const metricDetails: Record<MetricKey, MetricDetailDefinition> = {
    official: {
      title: 'Incasso fiscale',
      note: 'Somma di Cash e POS; l’IVA indicata è già compresa.',
      value: official,
      kind: 'money',
      formula: 'Somma di Cash + POS di ogni incasso registrato',
      steps: [
        {
          label: 'Cash + POS del periodo',
          value: official,
          kind: 'money',
          reference: `${officialRows.length} registrazioni di incasso comprese tra ${range.start} e ${range.end}.`,
        },
      ],
      rows: officialRows,
      tone: 'green',
    },
    real: {
      title: 'Incasso reale',
      note: 'Totale effettivamente incassato, separato dall’incasso fiscale.',
      value: real,
      kind: 'money',
      formula: 'Somma del campo Incasso reale di ogni giornata registrata',
      steps: [
        {
          label: 'Incassi reali del periodo',
          value: real,
          kind: 'money',
          reference: `${realRows.length} registrazioni comprese tra ${range.start} e ${range.end}; Cash e POS non vengono sommati nuovamente.`,
        },
      ],
      rows: realRows,
      tone: 'violet',
    },
    purchases: {
      title: 'Costi totali delle fatture',
      note: 'Imponibile più IVA di tutte le fatture fornitori del periodo.',
      value: purchases,
      kind: 'money',
      formula: 'Somma del totale fattura (imponibile + IVA)',
      steps: [
        {
          label: 'Totale fatture fornitori',
          value: purchases,
          kind: 'money',
          reference: `${purchaseRows.length} fatture con data compresa tra ${range.start} e ${range.end}.`,
        },
      ],
      rows: purchaseRows,
      tone: 'amber',
    },
    'unregistered-goods': {
      title: 'Merce acquistata senza fattura',
      note: 'Spese pagate dalla cassa, escluse dall’IVA e dai costi documentati.',
      value: unregisteredGoods,
      kind: 'money',
      formula: 'Somma del campo Merce senza fattura nelle fatture del periodo',
      steps: [
        {
          label: 'Merce senza fattura',
          value: unregisteredGoods,
          kind: 'money',
          reference: `${unregisteredGoodsRows.length} movimenti non documentati compresi nel periodo.`,
        },
      ],
      rows: unregisteredGoodsRows,
      tone: 'red',
    },
    'fixed-costs': {
      title: 'Spese fisse e ripartite',
      note: 'Affitti, stipendi, tasse, contabile e altre spese del periodo.',
      value: fixedCosts,
      kind: 'money',
      formula:
        'Quote affitto + quote contabile + stipendi + tasse + altre spese maturate',
      steps: [
        {
          label: 'Affitti maturati',
          value: rents,
          kind: 'money',
          reference: `Importi mensili ripartiti su ${companyWorkedDates.size} giorni con incassi.`,
          operation: 'Somma',
        },
        {
          label: 'Fatture contabile maturate',
          value: accountant,
          kind: 'money',
          reference: `Quote mensili riferite ai ${companyWorkedDates.size} giorni lavorati.`,
          operation: 'Somma',
        },
        {
          label: 'Stipendi corrisposti',
          value: expenseByType.stipendi,
          kind: 'money',
          reference: 'Spese stipendio attribuite alla data di pagamento.',
          operation: 'Somma',
        },
        {
          label: 'Tasse',
          value: expenseByType.tasse,
          kind: 'money',
          reference: 'Tasse singole o quote mensili maturate nel periodo.',
          operation: 'Somma',
        },
        {
          label: 'Costi contabile',
          value: expenseByType.contabile,
          kind: 'money',
          reference: 'Spese contabile registrate nella gestione spese.',
          operation: 'Somma',
        },
        {
          label: 'Altre spese',
          value: expenseByType.altre,
          kind: 'money',
          reference: 'Altre uscite singole o ricorrenti attribuite al periodo.',
          operation: 'Somma',
        },
      ],
      rows: fixedCostRows,
      tone: 'amber',
    },
    'official-profit': {
      title: 'Utile fiscale',
      note: 'Incasso fiscale meno fatture fornitori e spese documentate.',
      value: official - operatingCosts,
      kind: 'money',
      formula:
        'Incasso fiscale − costi fatture fornitori − spese fisse e ripartite',
      steps: [
        {
          label: 'Incasso fiscale',
          value: official,
          kind: 'money',
          reference: 'Cash + POS registrati nel periodo.',
          operation: 'Partenza',
        },
        {
          label: 'Fatture fornitori',
          value: purchases,
          kind: 'money',
          reference: 'Totale documentato delle fatture del periodo.',
          operation: 'Sottratte',
        },
        {
          label: 'Spese fisse e ripartite',
          value: fixedCosts,
          kind: 'money',
          reference: 'Costi maturati e uscite attribuite al periodo.',
          operation: 'Sottratte',
        },
      ],
      rows: [...officialRows, ...negativeOperatingRows],
      tone: official - operatingCosts >= 0 ? 'green' : 'red',
    },
    'real-profit': {
      title: 'Utile reale',
      note: 'Incasso reale meno costi documentati e merce senza fattura.',
      value: real - realOperatingCosts,
      kind: 'money',
      formula:
        'Incasso reale − fatture fornitori − merce senza fattura − spese fisse e ripartite',
      steps: [
        {
          label: 'Incasso reale',
          value: real,
          kind: 'money',
          reference: 'Totale effettivamente incassato nel periodo.',
          operation: 'Partenza',
        },
        {
          label: 'Fatture fornitori',
          value: purchases,
          kind: 'money',
          reference: 'Costo totale documentato degli acquisti.',
          operation: 'Sottratte',
        },
        {
          label: 'Merce senza fattura',
          value: unregisteredGoods,
          kind: 'money',
          reference: 'Acquisti non documentati registrati nel periodo.',
          operation: 'Sottratta',
        },
        {
          label: 'Spese fisse e ripartite',
          value: fixedCosts,
          kind: 'money',
          reference: 'Affitti, stipendi, tasse, contabile e altre spese.',
          operation: 'Sottratte',
        },
      ],
      rows: [...realRows, ...negativeRealOperatingRows],
      tone: real - realOperatingCosts >= 0 ? 'cyan' : 'red',
    },
    'input-vat': {
      title: 'IVA a credito',
      note: 'IVA delle fatture fornitori, degli affitti e del contabile.',
      value: inputVat,
      kind: 'money',
      formula: 'IVA fatture fornitori + IVA affitti + IVA contabile',
      steps: [
        {
          label: 'IVA a credito totale',
          value: inputVat,
          kind: 'money',
          reference: `${inputVatRows.length} documenti fiscali inclusi nel periodo.`,
        },
      ],
      rows: inputVatRows,
      tone: 'cyan',
    },
    'output-vat': {
      title: 'IVA a debito',
      note: 'IVA già inclusa negli importi fiscali Cash e POS.',
      value: outputVat,
      kind: 'money',
      formula: 'Somma IVA indicata negli incassi fiscali del periodo',
      steps: [
        {
          label: 'IVA a debito totale',
          value: outputVat,
          kind: 'money',
          reference: `${outputVatRows.length} registrazioni di incasso incluse.`,
        },
      ],
      rows: outputVatRows,
      tone: 'amber',
    },
    'vat-balance': {
      title: 'Saldo IVA',
      note: 'IVA a debito meno IVA a credito.',
      value: outputVat - inputVat,
      kind: 'money',
      formula: 'IVA a debito − IVA a credito',
      steps: [
        {
          label: 'IVA a debito',
          value: outputVat,
          kind: 'money',
          reference: 'IVA inclusa in Cash e POS.',
          operation: 'Meno',
        },
        {
          label: 'IVA a credito',
          value: inputVat,
          kind: 'money',
          reference: 'IVA di fatture fornitori, affitti e contabile.',
        },
      ],
      rows: [
        ...outputVatRows,
        ...inputVatRows.map((row) => ({ ...row, amount: -row.amount })),
      ],
      tone: outputVat - inputVat > 0 ? 'red' : 'green',
    },
    stock: {
      title: 'Venit stock',
      note: 'Venit teorico netto dei trasferimenti interni meno l’incasso reale.',
      value: companyTheoretical - real,
      kind: 'money',
      formula:
        'Venit teorico fatture − Venit ceduto internamente − incasso reale',
      steps: [
        {
          label: 'Venit teorico delle fatture',
          value: theoretical,
          kind: 'money',
          reference: 'Valore di vendita teorico registrato nelle fatture del periodo.',
          operation: 'Partenza',
        },
        {
          label: 'Venit ceduto internamente',
          value: transferredVenit,
          kind: 'money',
          reference: 'Trasferimenti da fornitori marcati verso altri venditori.',
          operation: 'Sottratto',
        },
        {
          label: 'Incasso reale',
          value: real,
          kind: 'money',
          reference: 'Valore della merce già venduta e incassata.',
          operation: 'Sottratto',
        },
      ],
      rows: [
        ...data.invoices.map((item) => ({
          date: item.date,
          category: 'Venit teorico',
          description: item.supplierName || 'Fornitore non indicato',
          reference: item.number || 'Senza numero',
          amount: item.theoreticalRevenue,
        })),
        ...supplierSellerRevenueTransfers.map((transfer) => ({
          date: transfer.date,
          category: 'Venit ceduto interno',
          description: transfer.supplierName,
          reference: transfer.invoiceNumber || 'Senza numero',
          amount: -transfer.amount,
        })),
        ...realRows.map((row) => ({ ...row, amount: -row.amount })),
      ],
      tone: 'violet',
    },
    forecast: {
      title: `Pronostico utile al ${seasonEnd}`,
      note: 'Incassi reali acquisiti e stimati meno costi sostenuti e futuri.',
      value: seasonForecast,
      kind: 'money',
      formula:
        'Incassi reali acquisiti + media giornaliera × giorni rimanenti − costi sostenuti − costi futuri',
      steps: [
        {
          label: 'Incassi reali acquisiti',
          value: allRealTakings,
          kind: 'money',
          reference: `${allTakingDays} giornate con incassi dall’inizio dell’anno.`,
          operation: 'Somma',
        },
        {
          label: 'Media incasso giornaliera',
          value: averageDailyTaking,
          kind: 'money',
          reference: 'Incassi reali acquisiti divisi per giornate con incasso.',
          operation: `× ${remainingDays} giorni`,
        },
        {
          label: 'Incassi futuri stimati',
          value: averageDailyTaking * remainingDays,
          kind: 'money',
          reference: `Proiezione fino al ${seasonEnd}.`,
          operation: 'Somma',
        },
        {
          label: 'Costi sostenuti',
          value: yearCosts,
          kind: 'money',
          reference: 'Fatture, merce senza fattura e spese dall’inizio dell’anno.',
          operation: 'Sottratti',
        },
        {
          label: 'Spese fisse future',
          value: futureFixedCosts,
          kind: 'money',
          reference: `Quote mensili previste fino al ${seasonEnd}.`,
          operation: 'Sottratte',
        },
      ],
      rows: [
        {
          date: today(),
          category: 'Incassi reali acquisiti',
          description: 'Totale dall’inizio dell’anno',
          reference: `${allTakingDays} giornate con incassi`,
          amount: allRealTakings,
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
  const companyHealthDetails = healthMetricDetails({
    health: companyHealth,
    realRows,
    officialRows,
    purchaseRows,
    unregisteredGoodsRows,
    fixedCostRows,
  })
  const selectedMetric =
    calculation?.scope === 'company'
      ? calculation.metric in metricDetails
        ? metricDetails[calculation.metric as MetricKey]
        : companyHealthDetails[calculation.metric as HealthMetricKey]
      : undefined

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
    const costs = sellerCostBreakdown(selectedSeller)
    const invoiceTotal = sellerInvoices.reduce(
      (sum, invoice) => sum + invoice.total,
      0,
    )
    const unregisteredGoods = sellerInvoices.reduce(
      (sum, invoice) => sum + invoice.unregisteredGoods,
      0,
    )
    const officialTotal = sellerTakings.reduce(
      (sum, taking) => sum + officialTaking(taking),
      0,
    )
    const realTotal = sellerTakings.reduce(
      (sum, taking) => sum + realTaking(taking),
      0,
    )
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet([
        { Voce: 'Venditrice punto vendita', Importo: selectedSeller.pointOfSaleSeller ? 'Sì' : 'No' },
        { Voce: 'Incasso fiscale', Importo: officialTotal },
        { Voce: 'Incasso reale', Importo: realTotal },
        { Voce: 'Costi fatture fornitori', Importo: invoiceTotal },
        { Voce: 'Merce senza fattura', Importo: unregisteredGoods },
        { Voce: 'Quota affitto', Importo: costs.rent },
        { Voce: 'Quota tasse', Importo: costs.taxes },
        { Voce: 'Quota contabile', Importo: costs.accounting },
        { Voce: 'Quota altre spese', Importo: costs.other },
        { Voce: 'Stipendio corrisposto', Importo: costs.salaryPaid },
        {
          Voce: 'Utile fiscale personale',
          Importo: roundMoney(officialTotal - invoiceTotal - costs.total),
        },
        {
          Voce: 'Utile reale personale',
          Importo: roundMoney(
            realTotal - invoiceTotal - unregisteredGoods - costs.total,
          ),
        },
      ]),
      'Riepilogo',
    )
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(
        sellerInvoices.map((invoice) => ({
          Data: invoice.date,
          Numero: invoice.number,
          Fornitore: invoice.supplierName,
          Totale: invoice.total,
          'Residuo da pagare': invoiceRemaining(invoice),
          'Totale Venit': invoice.theoreticalRevenue,
          'Merce senza fattura': invoice.unregisteredGoods,
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
          'Incasso reale': realTaking(taking),
          'IVA inclusa': taking.vat,
          'Cash ritirato': taking.withdrawal,
          'Merce acquistata senza fattura': taking.unregisteredGoods,
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
          'Merce senza fattura': invoice.unregisteredGoods,
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
      <CalculationDetailPage
        detail={selectedMetric}
        eyebrow="VERIFICA CALCOLO AZIENDALE"
        onBack={() => setCalculation(null)}
        onExport={exportMetricExcel}
        period={period}
        selected={selected}
        setPeriod={setPeriod}
        setSelected={setSelected}
      />
    )
  }

  if (selectedSeller) {
    const sellerOfficial = sellerTakings.reduce(
      (sum, item) => sum + officialTaking(item),
      0,
    )
    const sellerReal = sellerTakings.reduce(
      (sum, item) => sum + realTaking(item),
      0,
    )
    const sellerInvoiceTotal = sellerInvoices.reduce(
      (sum, item) => sum + item.total,
      0,
    )
    const sellerInvoiceRemaining = sellerInvoices.reduce(
      (sum, item) => sum + invoiceRemaining(item),
      0,
    )
    const sellerUnregisteredGoods = sellerInvoices.reduce(
      (sum, item) => sum + item.unregisteredGoods,
      0,
    )
    const sellerCosts = sellerCostBreakdown(selectedSeller)
    const sellerOperatingCosts = sellerInvoiceTotal + sellerCosts.total
    const sellerRealOperatingCosts =
      sellerOperatingCosts + sellerUnregisteredGoods
    const sellerInputVat =
      sellerInvoices.reduce((sum, item) => sum + item.vat, 0) +
      data.rentals.reduce(
        (sum, item) =>
          sum + allocatedSellerCost(item.vat, item, selectedSeller.id),
        0,
      ) +
      data.accountantInvoices.reduce(
        (sum, item) =>
          sum + allocatedSellerCost(item.vat, item, selectedSeller.id),
        0,
      )
    const sellerOutputVat = sellerTakings.reduce(
      (sum, item) => sum + item.vat,
      0,
    )
    const sellerTheoretical = roundMoney(
      sellerInvoices.reduce(
        (sum, item) => sum + item.theoreticalRevenue,
        0,
      ) -
        supplierSellerRevenueTransfers
          .filter((transfer) => transfer.fromSellerId === selectedSeller.id)
          .reduce((sum, transfer) => sum + transfer.amount, 0),
    )
    const sellerHealth =
      selectedSellerStats?.health ??
      calculateBusinessHealth({
        official: sellerOfficial,
        real: sellerReal,
        goodsCost: sellerInvoiceTotal + sellerUnregisteredGoods,
        fixedCosts: sellerCosts.total,
        theoreticalRevenue: sellerTheoretical,
      })
    const sellerWorkedDates = workedDatesForTakings(
      sellerTakings,
      range.start,
      range.end,
    )
    const sellerOfficialRows: MetricDetailRow[] = sellerTakings.map((item) => ({
      date: item.date,
      category: 'Incasso fiscale',
      description: selectedSeller.name,
      reference: `Cash ${money(item.cash)} · POS ${money(item.pos)}`,
      amount: officialTaking(item),
    }))
    const sellerRealRows: MetricDetailRow[] = sellerTakings.map((item) => ({
      date: item.date,
      category: 'Incasso reale',
      description: selectedSeller.name,
      reference: `Incasso fiscale della giornata ${money(officialTaking(item))}`,
      amount: realTaking(item),
    }))
    const sellerPurchaseRows: MetricDetailRow[] = sellerInvoices.map((item) => ({
      date: item.date,
      category: 'Fattura fornitore',
      description: item.supplierName || 'Fornitore non indicato',
      reference: item.number || 'Senza numero',
      amount: item.total,
    }))
    const sellerUnregisteredRows: MetricDetailRow[] = sellerInvoices
      .filter((item) => item.unregisteredGoods !== 0)
      .map((item) => ({
        date: item.date,
        category: 'Merce senza fattura',
        description: item.supplierName || item.description || 'Acquisto',
        reference: item.number || 'Senza numero',
        amount: item.unregisteredGoods,
      }))
    const sellerCostRows: MetricDetailRow[] = [
      ...data.rentals
        .map((item) => {
          const matured = monthlyAmountForWorkedDates(
            item.total,
            item.date,
            sellerWorkedDates,
          )
          const allocated = allocatedSellerCost(
            matured,
            item,
            selectedSeller.id,
          )
          return {
            date: item.date,
            category: 'Quota affitto',
            description: item.property || item.tenant || 'Affitto',
            reference: `${money(item.total)} mensili · ${sellerWorkedDates.size} giorni lavorati · ripartito tra ${allocationTargets(item).length} venditori`,
            amount: allocated,
          }
        })
        .filter((row) => row.amount !== 0),
      ...data.accountantInvoices
        .map((item) => {
          const matured = monthlyAmountForWorkedDates(
            item.total,
            item.date,
            sellerWorkedDates,
          )
          return {
            date: item.date,
            category: 'Quota contabile',
            description: item.description || 'Fattura contabile',
            reference: `${money(item.total)} mensili · ${sellerWorkedDates.size} giorni lavorati · ripartito tra ${allocationTargets(item).length} venditori`,
            amount: allocatedSellerCost(
              matured,
              item,
              selectedSeller.id,
            ),
          }
        })
        .filter((row) => row.amount !== 0),
      ...data.expenses
        .map((item) => {
          const salarySellerId =
            item.sellerId && knownSellerIds.has(item.sellerId)
              ? item.sellerId
              : bestContactNameMatch(item.sellerName, source.sellers)?.id
          const isSalary =
            item.type === 'stipendio' &&
            salarySellerId === selectedSeller.id &&
            inRange(item.date, range.start, range.end)
          const allocated = isSalary
            ? item.amount
            : item.type === 'stipendio'
              ? 0
              : allocatedSellerCost(
                  expenseForWorkedDates(
                    item,
                    range.start,
                    range.end,
                    sellerWorkedDates,
                  ),
                  item,
                  selectedSeller.id,
                )
          return {
            date: item.date,
            category: {
              stipendio: 'Stipendio corrisposto',
              tassa: 'Quota tassa',
              contabile: 'Quota contabile',
              altra: 'Quota altra spesa',
            }[item.type],
            description: item.description || item.sellerName || 'Spesa',
            reference: isSalary
              ? `Pagamento attribuito direttamente a ${selectedSeller.name}`
              : `${item.recurrence === 'monthly' ? 'Quota mensile maturata' : 'Spesa del periodo'} · ripartita tra ${allocationTargets(item).length} venditori`,
            amount: allocated,
          }
        })
        .filter((row) => row.amount !== 0),
    ]
    const sellerInputVatRows: MetricDetailRow[] = [
      ...sellerInvoices.map((item) => ({
        date: item.date,
        category: 'IVA fattura fornitore',
        description: item.supplierName || 'Fornitore non indicato',
        reference: item.number || 'Senza numero',
        amount: item.vat,
      })),
      ...data.rentals
        .map((item) => ({
          date: item.date,
          category: 'Quota IVA affitto',
          description: item.property || item.tenant || 'Affitto',
          reference: `Ripartita tra ${allocationTargets(item).length} venditori`,
          amount: allocatedSellerCost(item.vat, item, selectedSeller.id),
        }))
        .filter((row) => row.amount !== 0),
      ...data.accountantInvoices
        .map((item) => ({
          date: item.date,
          category: 'Quota IVA contabile',
          description: item.description || 'Fattura contabile',
          reference: `Ripartita tra ${allocationTargets(item).length} venditori`,
          amount: allocatedSellerCost(item.vat, item, selectedSeller.id),
        }))
        .filter((row) => row.amount !== 0),
    ]
    const sellerOutputVatRows: MetricDetailRow[] = sellerTakings.map((item) => ({
      date: item.date,
      category: 'IVA incassi',
      description: selectedSeller.name,
      reference: 'IVA già inclusa in Cash + POS',
      amount: item.vat,
    }))
    const sellerTheoreticalRows: MetricDetailRow[] = [
      ...sellerInvoices.map((item) => ({
        date: item.date,
        category: 'Venit teorico fattura',
        description: item.supplierName || 'Fornitore non indicato',
        reference: item.number || 'Senza numero',
        amount: item.theoreticalRevenue,
      })),
      ...supplierSellerRevenueTransfers
        .filter((transfer) => transfer.fromSellerId === selectedSeller.id)
        .map((transfer) => ({
          date: transfer.date,
          category: 'Venit ceduto internamente',
          description: transfer.supplierName,
          reference: transfer.invoiceNumber || 'Senza numero',
          amount: -transfer.amount,
        })),
    ]
    const sellerRemainingRows: MetricDetailRow[] = sellerInvoices
      .map((item) => ({
        date: item.date,
        category: 'Residuo fattura',
        description: item.supplierName || 'Fornitore non indicato',
        reference: item.number || 'Senza numero',
        amount: invoiceRemaining(item),
      }))
      .filter((row) => row.amount !== 0)
    const sellerMetricDetails: Record<
      SellerMetricKey,
      MetricDetailDefinition
    > = {
      official: {
        title: 'Incasso fiscale personale',
        note: `Cash e POS registrati per ${selectedSeller.name}.`,
        value: sellerOfficial,
        kind: 'money',
        tone: 'green',
        formula: 'Somma Cash + POS delle giornate attribuite al venditore',
        steps: [
          {
            label: 'Incasso fiscale',
            value: sellerOfficial,
            kind: 'money',
            reference: `${sellerOfficialRows.length} giornate attribuite a ${selectedSeller.name}.`,
          },
        ],
        rows: sellerOfficialRows,
      },
      real: {
        title: 'Incasso reale personale',
        note: `Incasso effettivo registrato per ${selectedSeller.name}.`,
        value: sellerReal,
        kind: 'money',
        tone: 'violet',
        formula: 'Somma Incasso reale delle giornate attribuite al venditore',
        steps: [
          {
            label: 'Incasso reale',
            value: sellerReal,
            kind: 'money',
            reference: `${sellerRealRows.length} giornate attribuite a ${selectedSeller.name}.`,
          },
        ],
        rows: sellerRealRows,
      },
      purchases: {
        title: 'Costi fatture fornitori personali',
        note: `Fatture attribuite a ${selectedSeller.name}.`,
        value: sellerInvoiceTotal,
        kind: 'money',
        tone: 'amber',
        formula: 'Somma totale delle fatture attribuite al venditore',
        steps: [
          {
            label: 'Costo fatture',
            value: sellerInvoiceTotal,
            kind: 'money',
            reference: `${sellerPurchaseRows.length} fatture attribuite a ${selectedSeller.name}.`,
          },
        ],
        rows: sellerPurchaseRows,
      },
      'unregistered-goods': {
        title: 'Merce senza fattura personale',
        note: `Acquisti non documentati attribuiti a ${selectedSeller.name}.`,
        value: sellerUnregisteredGoods,
        kind: 'money',
        tone: 'red',
        formula: 'Somma Merce senza fattura delle fatture attribuite',
        steps: [
          {
            label: 'Merce senza fattura',
            value: sellerUnregisteredGoods,
            kind: 'money',
            reference: `${sellerUnregisteredRows.length} movimenti attribuiti.`,
          },
        ],
        rows: sellerUnregisteredRows,
      },
      'fixed-costs': {
        title: 'Spese personali e ripartite',
        note: 'Costi assegnati direttamente o ripartiti usando i venditori selezionati in ogni spesa.',
        value: sellerCosts.total,
        kind: 'money',
        tone: 'amber',
        formula:
          'Quota affitto + quota tasse + quota contabile + altre quote + stipendio corrisposto',
        steps: [
          {
            label: 'Quota affitto',
            value: sellerCosts.rent,
            kind: 'money',
            reference: `${sellerWorkedDates.size} giorni lavorati dal venditore.`,
            operation: 'Somma',
          },
          {
            label: 'Quota tasse',
            value: sellerCosts.taxes,
            kind: 'money',
            reference: 'Tasse assegnate o ripartite sul venditore.',
            operation: 'Somma',
          },
          {
            label: 'Quota contabile',
            value: sellerCosts.accounting,
            kind: 'money',
            reference: 'Fatture e spese contabile assegnate o ripartite.',
            operation: 'Somma',
          },
          {
            label: 'Quota altre spese',
            value: sellerCosts.other,
            kind: 'money',
            reference: 'Altre spese assegnate o ripartite.',
            operation: 'Somma',
          },
          {
            label: 'Stipendio corrisposto',
            value: sellerCosts.salaryPaid,
            kind: 'money',
            reference: 'Pagamento registrato nel periodo per questo venditore.',
            operation: 'Somma',
          },
        ],
        rows: sellerCostRows,
      },
      'official-profit': {
        title: 'Utile fiscale personale',
        note: 'Risultato basato su Cash + POS, fatture e costi attribuiti.',
        value: sellerOfficial - sellerOperatingCosts,
        kind: 'money',
        tone:
          sellerOfficial - sellerOperatingCosts >= 0 ? 'green' : 'red',
        formula:
          'Incasso fiscale − costi fatture − spese personali e ripartite',
        steps: [
          {
            label: 'Incasso fiscale',
            value: sellerOfficial,
            kind: 'money',
            reference: 'Cash + POS del venditore.',
            operation: 'Partenza',
          },
          {
            label: 'Costi fatture',
            value: sellerInvoiceTotal,
            kind: 'money',
            reference: 'Fatture attribuite al venditore.',
            operation: 'Sottratti',
          },
          {
            label: 'Spese attribuite',
            value: sellerCosts.total,
            kind: 'money',
            reference: 'Quote e pagamenti personali del periodo.',
            operation: 'Sottratte',
          },
        ],
        rows: [
          ...sellerOfficialRows,
          ...sellerPurchaseRows.map((row) => ({ ...row, amount: -row.amount })),
          ...sellerCostRows.map((row) => ({ ...row, amount: -row.amount })),
        ],
      },
      'real-profit': {
        title: 'Utile reale personale',
        note: 'Risultato economico basato sull’incasso reale e tutte le uscite attribuite.',
        value: sellerReal - sellerRealOperatingCosts,
        kind: 'money',
        tone:
          sellerReal - sellerRealOperatingCosts >= 0 ? 'cyan' : 'red',
        formula:
          'Incasso reale − costi fatture − merce senza fattura − spese attribuite',
        steps: [
          {
            label: 'Incasso reale',
            value: sellerReal,
            kind: 'money',
            reference: 'Incasso effettivo del venditore.',
            operation: 'Partenza',
          },
          {
            label: 'Costi fatture',
            value: sellerInvoiceTotal,
            kind: 'money',
            reference: 'Fatture attribuite al venditore.',
            operation: 'Sottratti',
          },
          {
            label: 'Merce senza fattura',
            value: sellerUnregisteredGoods,
            kind: 'money',
            reference: 'Acquisti non documentati attribuiti.',
            operation: 'Sottratta',
          },
          {
            label: 'Spese attribuite',
            value: sellerCosts.total,
            kind: 'money',
            reference: 'Quote e pagamenti personali del periodo.',
            operation: 'Sottratte',
          },
        ],
        rows: [
          ...sellerRealRows,
          ...sellerPurchaseRows.map((row) => ({ ...row, amount: -row.amount })),
          ...sellerUnregisteredRows.map((row) => ({
            ...row,
            amount: -row.amount,
          })),
          ...sellerCostRows.map((row) => ({ ...row, amount: -row.amount })),
        ],
      },
      'input-vat': {
        title: 'IVA a credito personale',
        note: 'IVA delle fatture e quote IVA di affitti e contabile attribuite.',
        value: sellerInputVat,
        kind: 'money',
        tone: 'cyan',
        formula: 'IVA fatture + quota IVA affitti + quota IVA contabile',
        steps: [
          {
            label: 'IVA a credito',
            value: sellerInputVat,
            kind: 'money',
            reference: `${sellerInputVatRows.length} documenti o quote attribuite.`,
          },
        ],
        rows: sellerInputVatRows,
      },
      'output-vat': {
        title: 'IVA a debito personale',
        note: 'IVA indicata negli incassi fiscali attribuiti.',
        value: sellerOutputVat,
        kind: 'money',
        tone: 'amber',
        formula: 'Somma IVA degli incassi attribuiti al venditore',
        steps: [
          {
            label: 'IVA a debito',
            value: sellerOutputVat,
            kind: 'money',
            reference: `${sellerOutputVatRows.length} giornate attribuite.`,
          },
        ],
        rows: sellerOutputVatRows,
      },
      'vat-balance': {
        title: 'Saldo IVA personale',
        note: 'IVA a debito meno IVA a credito attribuita.',
        value: sellerOutputVat - sellerInputVat,
        kind: 'money',
        tone: sellerOutputVat - sellerInputVat > 0 ? 'red' : 'green',
        formula: 'IVA a debito − IVA a credito',
        steps: [
          {
            label: 'IVA a debito',
            value: sellerOutputVat,
            kind: 'money',
            reference: 'IVA degli incassi fiscali.',
            operation: 'Meno',
          },
          {
            label: 'IVA a credito',
            value: sellerInputVat,
            kind: 'money',
            reference: 'IVA di fatture, affitti e contabile attribuita.',
          },
        ],
        rows: [
          ...sellerOutputVatRows,
          ...sellerInputVatRows.map((row) => ({
            ...row,
            amount: -row.amount,
          })),
        ],
      },
      theoretical: {
        title: 'Totale Venit personale',
        note: 'Venit teorico delle fatture meno le cessioni interne del venditore.',
        value: sellerTheoretical,
        kind: 'money',
        tone: 'violet',
        formula: 'Venit teorico fatture − Venit ceduto internamente',
        steps: [
          {
            label: 'Venit teorico fatture',
            value: sellerInvoices.reduce(
              (sum, item) => sum + item.theoreticalRevenue,
              0,
            ),
            kind: 'money',
            reference: `${sellerInvoices.length} fatture attribuite.`,
            operation: 'Meno',
          },
          {
            label: 'Venit ceduto',
            value: supplierSellerRevenueTransfers
              .filter(
                (transfer) => transfer.fromSellerId === selectedSeller.id,
              )
              .reduce((sum, transfer) => sum + transfer.amount, 0),
            kind: 'money',
            reference: 'Trasferimenti interni da fornitori marcati.',
          },
        ],
        rows: sellerTheoreticalRows,
      },
      stock: {
        title: 'Venit stock personale',
        note: 'Valore di vendita teorico ancora non trasformato in incasso reale.',
        value: sellerTheoretical - sellerReal,
        kind: 'money',
        tone: 'violet',
        formula: 'Totale Venit personale − incasso reale personale',
        steps: [
          {
            label: 'Totale Venit',
            value: sellerTheoretical,
            kind: 'money',
            reference: 'Venit teorico netto dei trasferimenti interni.',
            operation: 'Meno',
          },
          {
            label: 'Incasso reale',
            value: sellerReal,
            kind: 'money',
            reference: 'Valore già venduto e incassato.',
          },
        ],
        rows: [
          ...sellerTheoreticalRows,
          ...sellerRealRows.map((row) => ({ ...row, amount: -row.amount })),
        ],
      },
      'invoice-remaining': {
        title: 'Residuo fatture da pagare',
        note: 'Debito ancora aperto sulle fatture attribuite al venditore.',
        value: sellerInvoiceRemaining,
        kind: 'money',
        tone: 'red',
        formula: 'Somma (totale fattura − pagamenti registrati)',
        steps: [
          {
            label: 'Residuo totale',
            value: sellerInvoiceRemaining,
            kind: 'money',
            reference: `${sellerRemainingRows.length} fatture con residuo aperto.`,
          },
        ],
        rows: sellerRemainingRows,
      },
    }
    const sellerHealthDetails = healthMetricDetails({
      health: sellerHealth,
      realRows: sellerRealRows,
      officialRows: sellerOfficialRows,
      purchaseRows: sellerPurchaseRows,
      unregisteredGoodsRows: sellerUnregisteredRows,
      fixedCostRows: sellerCostRows,
    })
    const selectedSellerMetric =
      calculation?.scope === 'seller' &&
      calculation.sellerId === selectedSeller.id
        ? calculation.metric in sellerMetricDetails
          ? sellerMetricDetails[calculation.metric as SellerMetricKey]
          : sellerHealthDetails[calculation.metric as HealthMetricKey]
        : undefined
    if (selectedSellerMetric) {
      return (
        <CalculationDetailPage
          detail={selectedSellerMetric}
          eyebrow={`VERIFICA CALCOLO · ${selectedSeller.name}`}
          onBack={() => setCalculation(null)}
          onExport={exportSellerExcel}
          period={period}
          selected={selected}
          setPeriod={setPeriod}
          setSelected={setSelected}
        />
      )
    }
    return (
      <div className="page-stack">
        <DetailHeader
          eyebrow="STATISTICHE VENDITORE"
          name={selectedSeller.name}
          note={
            [
              selectedSeller.pointOfSaleSeller
                ? 'Venditrice reale del punto vendita'
                : 'Personale produzione / altro',
              selectedSeller.phone,
              selectedSeller.email,
            ]
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
        {selectedSeller.pointOfSaleSeller && (
          <HealthOverview
            health={sellerHealth}
            title={`Controllo del punto ${selectedSeller.name}`}
            note={`La valutazione economica usa incasso reale, acquisti e costi maturati su ${workedDatesForTakings(sellerTakings, range.start, range.end).size} giorni effettivamente lavorati.`}
            onSelect={(metric) =>
              setCalculation({
                scope: 'seller',
                sellerId: selectedSeller.id,
                metric,
              })
            }
          />
        )}
        <section className="report-kpis">
          <ReportCard
            label="Incasso fiscale"
            value={sellerOfficial}
            tone="green"
            onClick={() =>
              setCalculation({
                scope: 'seller',
                sellerId: selectedSeller.id,
                metric: 'official',
              })
            }
          />
          <ReportCard
            label="Incasso reale"
            value={sellerReal}
            tone="violet"
            onClick={() =>
              setCalculation({
                scope: 'seller',
                sellerId: selectedSeller.id,
                metric: 'real',
              })
            }
          />
          <ReportCard
            label="Costi fatture fornitori"
            value={sellerInvoiceTotal}
            tone="amber"
            onClick={() =>
              setCalculation({
                scope: 'seller',
                sellerId: selectedSeller.id,
                metric: 'purchases',
              })
            }
          />
          <ReportCard
            label="Merce senza fattura"
            value={sellerUnregisteredGoods}
            tone="red"
            onClick={() =>
              setCalculation({
                scope: 'seller',
                sellerId: selectedSeller.id,
                metric: 'unregistered-goods',
              })
            }
          />
          <ReportCard
            label="Spese personali e ripartite"
            value={sellerCosts.total}
            tone="amber"
            onClick={() =>
              setCalculation({
                scope: 'seller',
                sellerId: selectedSeller.id,
                metric: 'fixed-costs',
              })
            }
          />
          <ReportCard
            label="Utile fiscale personale"
            value={sellerOfficial - sellerOperatingCosts}
            tone={
              sellerOfficial - sellerOperatingCosts >= 0 ? 'green' : 'red'
            }
            onClick={() =>
              setCalculation({
                scope: 'seller',
                sellerId: selectedSeller.id,
                metric: 'official-profit',
              })
            }
          />
          <ReportCard
            label="Utile reale personale"
            value={sellerReal - sellerRealOperatingCosts}
            tone={
              sellerReal - sellerRealOperatingCosts >= 0 ? 'cyan' : 'red'
            }
            onClick={() =>
              setCalculation({
                scope: 'seller',
                sellerId: selectedSeller.id,
                metric: 'real-profit',
              })
            }
          />
          <ReportCard
            label="IVA a credito"
            value={sellerInputVat}
            tone="cyan"
            onClick={() =>
              setCalculation({
                scope: 'seller',
                sellerId: selectedSeller.id,
                metric: 'input-vat',
              })
            }
          />
          <ReportCard
            label="IVA a debito"
            value={sellerOutputVat}
            tone="amber"
            onClick={() =>
              setCalculation({
                scope: 'seller',
                sellerId: selectedSeller.id,
                metric: 'output-vat',
              })
            }
          />
          <ReportCard
            label="Saldo IVA"
            value={sellerOutputVat - sellerInputVat}
            tone={sellerOutputVat - sellerInputVat > 0 ? 'red' : 'green'}
            onClick={() =>
              setCalculation({
                scope: 'seller',
                sellerId: selectedSeller.id,
                metric: 'vat-balance',
              })
            }
          />
          <ReportCard
            label="Totale Venit"
            value={sellerTheoretical}
            tone="violet"
            onClick={() =>
              setCalculation({
                scope: 'seller',
                sellerId: selectedSeller.id,
                metric: 'theoretical',
              })
            }
          />
          <ReportCard
            label="Venit stock"
            value={sellerTheoretical - sellerReal}
            tone="violet"
            onClick={() =>
              setCalculation({
                scope: 'seller',
                sellerId: selectedSeller.id,
                metric: 'stock',
              })
            }
          />
          <ReportCard
            label="Residuo fatture da pagare"
            value={sellerInvoiceRemaining}
            tone="red"
            onClick={() =>
              setCalculation({
                scope: 'seller',
                sellerId: selectedSeller.id,
                metric: 'invoice-remaining',
              })
            }
          />
        </section>
        <section className="panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">RIPARTIZIONE USCITE PERSONALI</span>
              <h2>Quote definite nei singoli affitti e nelle singole spese</h2>
            </div>
          </div>
          <div className="stats-strip expense-breakdown">
            <div><span>Quota affitto</span><strong>{money(sellerCosts.rent)}</strong></div>
            <div><span>Quota tasse</span><strong>{money(sellerCosts.taxes)}</strong></div>
            <div><span>Quota contabile</span><strong>{money(sellerCosts.accounting)}</strong></div>
            <div><span>Quota altre spese</span><strong>{money(sellerCosts.other)}</strong></div>
            <div><span>Stipendio corrisposto nel periodo</span><strong>{money(sellerCosts.salaryPaid)}</strong></div>
            <div><span>Totale attribuito</span><strong>{money(sellerCosts.total)}</strong></div>
          </div>
          <p className="production-help">
            Senza nomi selezionati, ogni costo viene ripartito tra tutti i
            venditori. Lo stipendio usa la data della spesa pagata e può
            riferirsi anche al mese di lavoro precedente.
          </p>
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
                    <th>Residuo da pagare</th>
                    <th>Venit</th>
                    <th>Merce senza fattura</th>
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
                        <td>{money(invoiceRemaining(invoice))}</td>
                        <td>{money(invoice.theoreticalRevenue)}</td>
                        <td>{money(invoice.unregisteredGoods)}</td>
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
                    <th>Reale</th>
                    <th>Merce senza fattura</th>
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
                        <td>{money(taking.unregisteredGoods)}</td>
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
    const supplierPurchaseRows: MetricDetailRow[] = supplierInvoices.map(
      (invoice) => ({
        date: invoice.date,
        category: 'Fattura fornitore',
        description: invoice.number || 'Senza numero',
        reference: invoice.sellerName || 'Venditore non indicato',
        amount: invoice.total,
      }),
    )
    const supplierPaidRows: MetricDetailRow[] = supplierInvoices
      .map((invoice) => ({
        date: invoice.paymentDate || invoice.date,
        category: 'Importo pagato',
        description: invoice.number || 'Senza numero',
        reference: `${invoice.sellerName || 'Venditore non indicato'} · ${invoice.payments.length} pagamenti registrati`,
        amount: invoice.total - invoiceRemaining(invoice),
      }))
      .filter((row) => row.amount !== 0)
    const supplierRemainingRows: MetricDetailRow[] = supplierInvoices
      .map((invoice) => ({
        date: invoice.dueDate || invoice.date,
        category: 'Residuo da pagare',
        description: invoice.number || 'Senza numero',
        reference: `${invoice.sellerName || 'Venditore non indicato'} · scadenza ${invoice.dueDate || 'non indicata'}`,
        amount: invoiceRemaining(invoice),
      }))
      .filter((row) => row.amount !== 0)
    const supplierOverdueRows: MetricDetailRow[] = supplierInvoices
      .filter((invoice) => invoiceDueState(invoice) === 'overdue')
      .map((invoice) => ({
        date: invoice.dueDate || invoice.date,
        category: 'Fattura scaduta',
        description: invoice.number || 'Senza numero',
        reference: `${invoice.sellerName || 'Venditore non indicato'} · residuo ${money(invoiceRemaining(invoice))}`,
        amount: 1,
      }))
    const supplierMetricDetails: Record<
      SupplierMetricKey,
      MetricDetailDefinition
    > = {
      'invoice-count': {
        title: 'Numero fatture fornitore',
        note: `Fatture di ${selectedSupplier.name} comprese nel periodo.`,
        value: supplierInvoices.length,
        kind: 'count',
        rowKind: 'money',
        tone: 'violet',
        formula: 'Conteggio delle fatture del fornitore nel periodo selezionato',
        steps: [
          {
            label: 'Fatture incluse',
            value: supplierInvoices.length,
            kind: 'count',
            reference: `Data fattura compresa tra ${range.start} e ${range.end}.`,
          },
        ],
        rows: supplierPurchaseRows,
      },
      purchased: {
        title: 'Totale acquistato dal fornitore',
        note: `Somma delle fatture di ${selectedSupplier.name}.`,
        value: supplierTotal,
        kind: 'money',
        tone: 'cyan',
        formula: 'Somma del totale di ogni fattura del fornitore',
        steps: [
          {
            label: 'Totale acquistato',
            value: supplierTotal,
            kind: 'money',
            reference: `${supplierInvoices.length} fatture incluse.`,
          },
        ],
        rows: supplierPurchaseRows,
      },
      paid: {
        title: 'Totale pagato al fornitore',
        note: 'Totali fattura meno residui ancora aperti.',
        value: supplierTotal - supplierRemaining,
        kind: 'money',
        tone: 'green',
        formula: 'Totale acquistato − residuo ancora da pagare',
        steps: [
          {
            label: 'Totale acquistato',
            value: supplierTotal,
            kind: 'money',
            reference: 'Somma delle fatture del fornitore.',
            operation: 'Meno',
          },
          {
            label: 'Residuo aperto',
            value: supplierRemaining,
            kind: 'money',
            reference: 'Somma dei debiti ancora presenti.',
          },
        ],
        rows: supplierPaidRows,
      },
      remaining: {
        title: 'Residuo fornitore',
        note: 'Debito totale ancora aperto sulle fatture del periodo.',
        value: supplierRemaining,
        kind: 'money',
        tone: 'amber',
        formula: 'Somma (totale fattura − pagamenti registrati)',
        steps: [
          {
            label: 'Residuo da pagare',
            value: supplierRemaining,
            kind: 'money',
            reference: `${supplierRemainingRows.length} fatture con debito aperto.`,
          },
        ],
        rows: supplierRemainingRows,
      },
      'overdue-count': {
        title: 'Fatture scadute',
        note: 'Fatture non saldate con data di scadenza precedente a oggi.',
        value: supplierOverdue,
        kind: 'count',
        rowKind: 'count',
        tone: 'red',
        formula:
          'Conteggio fatture con residuo positivo e scadenza precedente a oggi',
        steps: [
          {
            label: 'Fatture scadute',
            value: supplierOverdue,
            kind: 'count',
            reference: `${supplierRemainingRows.length} fatture aperte controllate.`,
          },
        ],
        rows: supplierOverdueRows,
      },
    }
    const selectedSupplierMetric =
      calculation?.scope === 'supplier' &&
      calculation.supplierId === selectedSupplier.id
        ? supplierMetricDetails[calculation.metric]
        : undefined
    if (selectedSupplierMetric) {
      return (
        <CalculationDetailPage
          detail={selectedSupplierMetric}
          eyebrow={`VERIFICA CALCOLO · ${selectedSupplier.name}`}
          onBack={() => setCalculation(null)}
          onExport={exportSupplierExcel}
          period={period}
          selected={selected}
          setPeriod={setPeriod}
          setSelected={setSelected}
        />
      )
    }
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
          <CountCard
            label="Fatture"
            value={supplierInvoices.length}
            onClick={() =>
              setCalculation({
                scope: 'supplier',
                supplierId: selectedSupplier.id,
                metric: 'invoice-count',
              })
            }
          />
          <ReportCard
            label="Totale acquistato"
            value={supplierTotal}
            tone="cyan"
            onClick={() =>
              setCalculation({
                scope: 'supplier',
                supplierId: selectedSupplier.id,
                metric: 'purchased',
              })
            }
          />
          <ReportCard
            label="Totale pagato"
            value={supplierTotal - supplierRemaining}
            tone="green"
            onClick={() =>
              setCalculation({
                scope: 'supplier',
                supplierId: selectedSupplier.id,
                metric: 'paid',
              })
            }
          />
          <ReportCard
            label="Residuo"
            value={supplierRemaining}
            tone="amber"
            onClick={() =>
              setCalculation({
                scope: 'supplier',
                supplierId: selectedSupplier.id,
                metric: 'remaining',
              })
            }
          />
          <CountCard
            label="Fatture scadute"
            value={supplierOverdue}
            tone="red"
            onClick={() =>
              setCalculation({
                scope: 'supplier',
                supplierId: selectedSupplier.id,
                metric: 'overdue-count',
              })
            }
          />
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
          <button
            className="button button-secondary"
            onClick={() => setReportFilters(reportFilterDefaults)}
            type="button"
          >
            Azzera filtri
          </button>
        </div>
      </header>

      <HealthOverview
        health={companyHealth}
        title="Indice salute aziendale"
        note={`La valutazione economica usa incasso reale, acquisti e costi maturati su ${companyWorkedDates.size} giorni effettivamente lavorati. Cash e POS generano soltanto alert fiscali.`}
        onSelect={(metric) =>
          setCalculation({ scope: 'company', metric })
        }
      />

      <section className="report-kpis">
        <ReportCard
          label="Incasso fiscale"
          value={official}
          tone="green"
          onClick={() =>
            setCalculation({ scope: 'company', metric: 'official' })
          }
        />
        <ReportCard
          label="Incasso reale"
          value={real}
          tone="violet"
          onClick={() =>
            setCalculation({ scope: 'company', metric: 'real' })
          }
        />
        <ReportCard
          label="Costi totali (fatture)"
          value={purchases}
          tone="amber"
          onClick={() =>
            setCalculation({ scope: 'company', metric: 'purchases' })
          }
        />
        <ReportCard
          label="Merce acquistata senza fattura"
          value={unregisteredGoods}
          tone="red"
          onClick={() =>
            setCalculation({
              scope: 'company',
              metric: 'unregistered-goods',
            })
          }
        />
        <ReportCard
          label="Spese fisse e ripartite"
          value={fixedCosts}
          tone="amber"
          onClick={() =>
            setCalculation({ scope: 'company', metric: 'fixed-costs' })
          }
        />
        <ReportCard
          label="Utile fiscale"
          value={official - operatingCosts}
          tone={official - operatingCosts >= 0 ? 'green' : 'red'}
          onClick={() =>
            setCalculation({ scope: 'company', metric: 'official-profit' })
          }
        />
        <ReportCard
          label="Utile reale"
          value={real - realOperatingCosts}
          tone={real - realOperatingCosts >= 0 ? 'cyan' : 'red'}
          onClick={() =>
            setCalculation({ scope: 'company', metric: 'real-profit' })
          }
        />
        <ReportCard
          label="IVA a credito"
          value={inputVat}
          tone="cyan"
          onClick={() =>
            setCalculation({ scope: 'company', metric: 'input-vat' })
          }
        />
        <ReportCard
          label="IVA a debito"
          value={outputVat}
          tone="amber"
          onClick={() =>
            setCalculation({ scope: 'company', metric: 'output-vat' })
          }
        />
        <ReportCard
          label="Saldo IVA"
          value={outputVat - inputVat}
          tone={outputVat - inputVat > 0 ? 'red' : 'green'}
          onClick={() =>
            setCalculation({ scope: 'company', metric: 'vat-balance' })
          }
        />
        <ReportCard
          label="Venit stock"
          value={companyTheoretical - real}
          tone="violet"
          onClick={() =>
            setCalculation({ scope: 'company', metric: 'stock' })
          }
        />
        <ReportCard
          label={`Pronostico utile al ${seasonEnd}`}
          value={seasonForecast}
          tone={seasonForecast >= 0 ? 'cyan' : 'red'}
          onClick={() =>
            setCalculation({ scope: 'company', metric: 'forecast' })
          }
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
          <div><span>Merce senza fattura</span><strong>{money(unregisteredGoods)}</strong></div>
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
                <span className="eyebrow">
                  {seller.pointOfSaleSeller
                    ? 'VENDITRICE PUNTO VENDITA'
                    : 'PRODUZIONE / ALTRO'}
                </span>
                <strong>{seller.name}</strong>
                <span>Totale fatture {money(seller.invoiceTotal)}</span>
                <span>Totale Venit {money(seller.theoretical)}</span>
                <span>Incassato reale {money(seller.real)}</span>
                <span>Stock residuo reale {money(seller.stockResidual)}</span>
                <span>
                  Spese attribuite {money(seller.allocatedCosts)}
                </span>
                <span>
                  Stipendio corrisposto {money(seller.salaryPaid)}
                </span>
                <span>Risultato reale {money(seller.realProfit)}</span>
                <span
                  className={`health-inline health-${overallHealthTone(
                    seller.pointOfSaleSeller ? seller.health.score : null,
                  )}`}
                >
                  {seller.pointOfSaleSeller
                    ? `Indice salute ${seller.health.score ?? '—'}/100 · ${overallHealthLabel(
                        seller.health.score,
                      )}`
                    : 'Indice salute non applicabile'}
                </span>
                <span>
                  Residuo fatture da pagare {money(seller.invoiceRemaining)}
                </span>
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
                  style={{ width: `${(values.real / maxChart) * 100}%` }}
                />
                <span
                  className="bar costs"
                  style={{ width: `${(values.costs / maxChart) * 100}%` }}
                />
              </div>
              <small>
                F {money(values.official)} · R {money(values.real)} · C{' '}
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

function CalculationDetailPage({
  detail,
  eyebrow,
  onBack,
  onExport,
  period,
  selected,
  setPeriod,
  setSelected,
}: {
  detail: MetricDetailDefinition
  eyebrow: string
  onBack: () => void
  onExport?: () => void
  period: Period
  selected: string
  setPeriod: (period: Period) => void
  setSelected: (selected: string) => void
}) {
  const categoryRows = calculationRowsByCategory(detail.rows)
  const monthRows = calculationRowsByMonth(detail.rows)
  const rowKind = detail.rowKind ?? 'money'
  const sourceTotal = sumRows(detail.rows)
  const canReconcile = detail.kind === rowKind && detail.value !== null
  const reconciliationDifference =
    canReconcile && detail.value !== null
      ? roundMoney(detail.value - sourceTotal)
      : null
  const reconciled =
    reconciliationDifference !== null &&
    Math.abs(reconciliationDifference) < 0.01
  const chartMaximum = Math.max(
    ...categoryRows.map((row) => Math.abs(row.value)),
    ...monthRows.map((row) => Math.abs(row.value)),
    1,
  )

  const renderChart = (
    rows: Array<{ label: string; value: number }>,
    emptyMessage: string,
  ) => (
    <div className="calculation-chart">
      {rows.map((row) => (
        <div className="calculation-chart-row" key={row.label}>
          <strong>{row.label}</strong>
          <div className="calculation-chart-track">
            <span
              className={
                row.value < 0
                  ? 'calculation-chart-bar negative'
                  : 'calculation-chart-bar positive'
              }
              style={{
                width: `${(Math.abs(row.value) / chartMaximum) * 100}%`,
              }}
            />
          </div>
          <small>{metricValue(row.value, rowKind)}</small>
        </div>
      ))}
      {rows.length === 0 && (
        <div className="empty-state compact-empty">
          <strong>Nessun dato disponibile</strong>
          <span>{emptyMessage}</span>
        </div>
      )}
    </div>
  )

  return (
    <div className="page-stack">
      <DetailHeader
        eyebrow={eyebrow}
        name={detail.title}
        note={detail.note}
        onBack={onBack}
        onExport={onExport}
        period={period}
        selected={selected}
        setPeriod={setPeriod}
        setSelected={setSelected}
      />

      <section className="calculation-summary-grid">
        <article className={`calculation-result report-${detail.tone}`}>
          <span className="eyebrow">RISULTATO FINALE</span>
          <strong>{metricValue(detail.value, detail.kind)}</strong>
          <p>
            Tipo di dato:{' '}
            {{
              money: 'importo monetario',
              percentage: 'percentuale',
              score: 'punteggio su 100',
              count: 'numero di record',
            }[detail.kind]}
          </p>
        </article>
        <article className="calculation-formula">
          <span className="eyebrow">FORMULA APPLICATA</span>
          <strong>{detail.formula}</strong>
          <p>Ogni valore usato è spiegato nei passaggi sottostanti.</p>
        </article>
        <article
          className={`calculation-reconciliation ${
            canReconcile ? (reconciled ? 'is-matched' : 'is-different') : ''
          }`}
        >
          <span className="eyebrow">CONTROLLO DATI SORGENTE</span>
          <strong>{metricValue(sourceTotal, rowKind)}</strong>
          <p>
            {canReconcile
              ? reconciled
                ? 'La somma algebrica delle righe coincide con il risultato.'
                : `Differenza rispetto al risultato: ${metricValue(
                    reconciliationDifference,
                    detail.kind,
                  )}.`
              : 'Le righe mostrano i dati usati nella formula: una percentuale o un punteggio non deve coincidere con la loro somma.'}
          </p>
        </article>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">OPERAZIONI E RIFERIMENTI</span>
            <h2>Calcolo passo per passo</h2>
          </div>
        </div>
        <div className="calculation-steps">
          {detail.steps.map((step, index) => (
            <article className="calculation-step" key={`${step.label}-${index}`}>
              <span className="calculation-step-index">{index + 1}</span>
              <div>
                <strong>{step.label}</strong>
                <b>{metricValue(step.value, step.kind)}</b>
                {step.operation && <em>{step.operation}</em>}
                <p>{step.reference}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="calculation-chart-grid">
        <article className="panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">GRAFICO PER CATEGORIA</span>
              <h2>Da cosa è composto</h2>
            </div>
          </div>
          {renderChart(
            categoryRows,
            'Le categorie appariranno quando saranno presenti righe sorgente.',
          )}
        </article>
        <article className="panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">GRAFICO TEMPORALE</span>
              <h2>Andamento per mese</h2>
            </div>
          </div>
          {renderChart(
            monthRows,
            'Il grafico mensile richiede righe sorgente con una data.',
          )}
        </article>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">DATI ORIGINALI DEL PERIODO</span>
            <h2>Righe usate o consultate dal calcolo</h2>
          </div>
          <strong>{detail.rows.length} voci</strong>
        </div>
        <div className="data-table-wrap">
          <table className="data-table calculation-source-table">
            <thead>
              <tr>
                <th>Data</th>
                <th>Categoria / riferimento</th>
                <th>Descrizione</th>
                <th>A cosa si riferisce</th>
                <th>Valore usato</th>
              </tr>
            </thead>
            <tbody>
              {detail.rows.map((row, index) => (
                <tr key={`${row.category}-${row.date}-${index}`}>
                  <td>{row.date || '—'}</td>
                  <td>{row.category}</td>
                  <td>{row.description}</td>
                  <td>{row.reference}</td>
                  <td className={row.amount < 0 ? 'value-negative' : ''}>
                    {metricValue(row.amount, rowKind)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {detail.rows.length === 0 && (
            <div className="empty-state compact-empty">
              <strong>Nessun dato nel periodo</strong>
              <span>
                Modifica il filtro temporale per controllare altre registrazioni.
              </span>
            </div>
          )}
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

function HealthOverview({
  health,
  title,
  note,
  onSelect,
}: {
  health: BusinessHealth
  title: string
  note: string
  onSelect: (metric: HealthMetricKey) => void
}) {
  return (
    <section className="panel health-overview">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">CONTROLLO AUTOMATICO</span>
          <h2>{title}</h2>
          <p>{note}</p>
        </div>
      </div>
      <div className="report-kpis health-kpis">
        <HealthCard
          label="Indice salute"
          value={health.score === null ? '—' : `${health.score}/100`}
          status={overallHealthLabel(health.score)}
          tone={overallHealthTone(health.score)}
          onClick={() => onSelect('health-score')}
        />
        <HealthCard
          label="Coerenza vendite"
          value={percentageLabel(health.coherence)}
          status="Incasso reale rispetto al valore atteso dagli acquisti"
          tone={rangeHealthTone(health.coherence, 90, 110, 80, 120)}
          onClick={() => onSelect('health-coherence')}
        />
        <HealthCard
          label="Ricarico reale"
          value={percentageLabel(health.markup)}
          status="Incasso reale meno acquisti · riferimento 85–110%"
          tone={rangeHealthTone(health.markup, 85, 110, 70, 150)}
          onClick={() => onSelect('health-markup')}
        />
        <HealthCard
          label="Margine netto"
          value={percentageLabel(health.netMargin)}
          status="Verde da 10%, giallo da 0%"
          tone={minimumHealthTone(health.netMargin, 10, 0)}
          onClick={() => onSelect('health-margin')}
        />
      </div>
      <div className="health-section-heading">
        <div>
          <span className="eyebrow">CONTROLLO FISCALE</span>
          <strong>Alert separati dall’indice economico</strong>
        </div>
        <p>
          Confrontano quanto battuto in cassa con l’incasso reale e il costo
          stimato della merce venduta, escludendo lo stock residuo.
        </p>
      </div>
      <div className="report-kpis health-kpis">
        <HealthCard
          label="Copertura fiscale"
          value={percentageLabel(health.cashCoverage)}
          status="Cash + POS rispetto all’incasso reale · verde 95–105%"
          tone={rangeHealthTone(health.cashCoverage, 95, 105, 85, 115)}
          onClick={() => onSelect('health-coverage')}
        />
        <HealthCard
          label="Ricarico fiscale su venduto stimato"
          value={percentageLabel(health.fiscalMarkup)}
          status="Verde 15–20% · giallo fuori fascia · rosso sotto 0%"
          tone={fiscalMarkupTone(health.fiscalMarkup)}
          onClick={() => onSelect('health-fiscal-markup')}
        />
      </div>
    </section>
  )
}

function HealthCard({
  label,
  value,
  status,
  tone,
  onClick,
}: {
  label: string
  value: string
  status: string
  tone: HealthTone
  onClick: () => void
}) {
  return (
    <button
      className={`report-card report-card-button health-card report-${tone}`}
      onClick={onClick}
      type="button"
    >
      <span>{label}</span>
      <strong>{value}</strong>
      <span className={`health-status health-status-${tone}`}>
        <i aria-hidden="true" />
        {healthToneLabel(tone)}
      </span>
      <em>{status}</em>
      <em>Apri dati, formula e grafici</em>
    </button>
  )
}

function CountCard({
  label,
  value,
  tone = 'violet',
  onClick,
}: {
  label: string
  value: number
  tone?: 'violet' | 'red'
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
        <strong>{value}</strong>
        <em>Apri dati, formula e grafici</em>
      </button>
    )
  }
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
        <button
          className="button button-secondary"
          onClick={() => {
            setPeriod('all')
            setSelected(today())
          }}
          type="button"
        >
          Azzera filtri
        </button>
      </div>
    </header>
  )
}
