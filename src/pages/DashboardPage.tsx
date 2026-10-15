import { useState } from 'react'
import { StatCard } from '../components/StatCard'
import { TrafficLight } from '../components/TrafficLight'
import {
  activeAccounting,
  bestContactNameMatch,
  expenseForMaturedDates,
  money,
  monthlyCostsForMaturedDates,
  officialTaking,
  productionSalaryCostsForPeriod,
  realTaking,
  roundMoney,
  today,
  maturedDatesForPeriod,
} from '../domain/accounting'
import { useStoredFilters } from '../hooks/useStoredFilters'
import { useAppStore } from '../store/AppStoreContext'

type DashboardMetricKey =
  | 'invoices'
  | 'paid-invoices'
  | 'remaining-invoices'
  | 'input-vat'
  | 'output-vat'
  | 'vat-balance'
  | 'cash'
  | 'pos'
  | 'official'
  | 'real'
  | 'withdrawals'
  | 'unregistered-goods'
  | 'cash-residual'
  | 'theoretical'
  | 'stock'
  | 'costs'
  | 'real-result'
  | 'annual-real-balance'

type SellerMetricKey =
  | 'invoices'
  | 'theoretical'
  | 'cash'
  | 'pos'
  | 'official'
  | 'real'
  | 'vat'
  | 'withdrawals'
  | 'unregistered-goods'
  | 'cash-residual'
  | 'revenue-acquired'
  | 'revenue-ceded'
  | 'real-result'
  | 'stock-residual'

interface SellerMetricDetail {
  sellerId: string
  metric: SellerMetricKey
}

interface DashboardDetailRow {
  date: string
  category: string
  description: string
  reference: string
  amount: number
  sellerId?: string | null
}

interface DashboardMetric {
  title: string
  note: string
  value: number
  tone: 'cyan' | 'violet' | 'green' | 'amber' | 'red'
  rows: DashboardDetailRow[]
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

function startOfWeek(date: string) {
  const value = new Date(`${date}T00:00:00Z`)
  const daysFromMonday = (value.getUTCDay() + 6) % 7
  value.setUTCDate(value.getUTCDate() - daysFromMonday)
  return value.toISOString().slice(0, 10)
}

function formatDashboardDate(date: string) {
  const [year, month, day] = date.split('-')
  return year && month && day ? `${day}/${month}/${year}` : date
}

function isCompleteDashboardDate(date: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && Number(date.slice(0, 4)) >= 1900
}

function monthEnd(month: string) {
  const [year, monthNumber] = month.split('-').map(Number)
  if (!year || !monthNumber) return today()
  return new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10)
}

export function DashboardPage() {
  const { state } = useAppStore()
  const [detail, setDetail] = useState<DashboardMetricKey | null>(null)
  const [sellerDetail, setSellerDetail] =
    useState<SellerMetricDetail | null>(null)
  const [storeDetailId, setStoreDetailId] = useState<string | null>(null)
  const [sellerAsOfDate, setSellerAsOfDate] = useState('')
  const [sellerPeriodMode, setSellerPeriodMode] = useState<
    'annual' | 'month'
  >('annual')
  const [sellerMonth, setSellerMonth] = useState(today().slice(0, 7))
  const { review } = state
  const companyId = state.accounting.activeCompanyId
  const withdrawalFilterDefaults = {
    sellerId: '',
    month: '',
    year: '',
  }
  const [withdrawalFilters, setWithdrawalFilters] = useStoredFilters(
    `withdrawal-filters:${companyId ?? 'none'}`,
    withdrawalFilterDefaults,
  )
  const withdrawalSellerFilter = withdrawalFilters.sellerId
  const withdrawalMonthFilter = withdrawalFilters.month
  const withdrawalYearFilter = withdrawalFilters.year
  const currentDate = today()
  const currentYear = currentDate.slice(0, 4)
  const currentMonth = currentDate.slice(0, 7)
  const economicFilterDefaults = {
    mode: 'year',
    month: currentMonth,
    year: currentYear,
  }
  const [economicFilters, setEconomicFilters] = useStoredFilters(
    `dashboard-economic-filters:${companyId ?? 'none'}`,
    economicFilterDefaults,
  )
  const economicMode = economicFilters.mode === 'month' ? 'month' : 'year'
  const economicMonth = /^\d{4}-\d{2}$/.test(economicFilters.month)
    ? economicFilters.month
    : currentMonth
  const economicYear = /^\d{4}$/.test(economicFilters.year)
    ? economicFilters.year
    : currentYear
  const cashWithdrawalFilterDefaults = {
    startDate: currentDate,
    endDate: currentDate,
  }
  const [cashWithdrawalFilters, setCashWithdrawalFilters] = useStoredFilters(
    `cash-withdrawal-overview-filters:${companyId ?? 'none'}`,
    cashWithdrawalFilterDefaults,
  )
  const activeCompany = state.accounting.companies.find(
    (company) => company.id === companyId,
  )
  const accounting = activeAccounting(state.accounting)
  const economicRangeStart =
    economicMode === 'month'
      ? `${economicMonth}-01`
      : `${economicYear}-01-01`
  const unboundedEconomicRangeEnd =
    economicMode === 'month'
      ? monthEnd(economicMonth)
      : `${economicYear}-12-31`
  const economicRangeEnd =
    unboundedEconomicRangeEnd > currentDate
      ? currentDate
      : unboundedEconomicRangeEnd
  const isInEconomicBalanceRange = (date: string) =>
    date <= economicRangeEnd
  const economicPeriodLabel =
    economicMode === 'month'
      ? new Intl.DateTimeFormat('it-IT', {
          month: 'long',
          year: 'numeric',
          timeZone: 'UTC',
        }).format(new Date(`${economicRangeStart}T00:00:00Z`))
      : `anno ${economicYear} maturato`
  const economicYears = [
    ...new Set([
      currentYear,
      ...accounting.invoices.map((invoice) => invoice.date.slice(0, 4)),
      ...accounting.takings.map((taking) => taking.date.slice(0, 4)),
      ...accounting.rentals.map((rental) => rental.date.slice(0, 4)),
      ...accounting.accountantInvoices.map((invoice) =>
        invoice.date.slice(0, 4),
      ),
      ...accounting.expenses.map((expense) => expense.date.slice(0, 4)),
    ]),
  ]
    .filter((year) => /^\d{4}$/.test(year))
    .sort((left, right) => right.localeCompare(left))
  const stores = state.stores.filter(
    (store) =>
      store.companyId === companyId &&
      state.sellers.some(
        (seller) =>
          seller.id === store.sellerId &&
          seller.companyId === companyId &&
          accounting.sellers.some(
            (accountingSeller) =>
              accountingSeller.id === seller.accountingSellerId,
          ),
      ),
  )
  const annualInvoices = accounting.invoices.filter(
    (invoice) =>
      invoice.date >= economicRangeStart &&
      invoice.date <= economicRangeEnd,
  )
  const economicBalanceInvoices = accounting.invoices.filter((invoice) =>
    isInEconomicBalanceRange(invoice.date),
  )
  const economicBalanceRentals = accounting.rentals.filter((rental) =>
    isInEconomicBalanceRange(rental.date),
  )
  const economicBalanceAccountantInvoices =
    accounting.accountantInvoices.filter((invoice) =>
      isInEconomicBalanceRange(invoice.date),
    )
  const economicBalanceTakings = accounting.takings.filter((taking) =>
    isInEconomicBalanceRange(taking.date),
  )
  const annualTakings = accounting.takings.filter(
    (taking) =>
      taking.date >= economicRangeStart &&
      taking.date <= economicRangeEnd,
  )
  const annualMaturedDates = maturedDatesForPeriod(
    economicRangeStart,
    economicRangeEnd,
  )
  const annualRentalCosts = monthlyCostsForMaturedDates(
    accounting.rentals,
    annualMaturedDates,
    (rental) => rental.property.trim().toLocaleLowerCase() || rental.id,
  )
  const annualAccountantCosts = monthlyCostsForMaturedDates(
    accounting.accountantInvoices,
    annualMaturedDates,
    (invoice) =>
      invoice.description.trim().toLocaleLowerCase() || invoice.id,
  )
  const annualExpenseCosts = accounting.expenses
    .map((expense) => ({
      expense,
      amount: expenseForMaturedDates(
        expense,
        economicRangeStart,
        economicRangeEnd,
        annualMaturedDates,
      ),
    }))
    .filter(({ amount }) => amount !== 0)
  const annualProductionSalaryCosts = productionSalaryCostsForPeriod(
    accounting,
    economicRangeStart,
    economicRangeEnd,
  )
  const annualReal = roundMoney(
    annualTakings.reduce((sum, taking) => sum + realTaking(taking), 0),
  )
  const knownAnnualSellerIds = new Set(
    accounting.sellers.map((seller) => seller.id),
  )
  const transferredVenit = (invoices: typeof accounting.invoices) =>
    invoices.reduce((sum, invoice) => {
      if (
        !invoice.sellerId ||
        invoice.taxableAmount !== 0 ||
        invoice.theoreticalRevenue <= 0
      ) {
        return sum
      }
      const supplier = accounting.suppliers.find(
        (item) => item.id === invoice.supplierId,
      )
      if (!supplier?.sellerRevenueTransferEnabled) return sum
      const linkedSellerId =
        bestContactNameMatch(
          invoice.supplierName || supplier.name,
          accounting.sellers,
        )?.id ?? supplier.linkedSellerId
      return linkedSellerId &&
        linkedSellerId !== invoice.sellerId &&
        knownAnnualSellerIds.has(linkedSellerId) &&
        knownAnnualSellerIds.has(invoice.sellerId)
        ? sum + invoice.theoreticalRevenue
        : sum
    }, 0)
  const annualTransferredVenit = transferredVenit(annualInvoices)
  const annualTheoretical = roundMoney(
    annualInvoices.reduce(
      (sum, invoice) => sum + invoice.theoreticalRevenue,
      0,
    ) - annualTransferredVenit,
  )
  const stockInvoices = accounting.invoices.filter(
    (invoice) => invoice.date <= economicRangeEnd,
  )
  const stockTakings = accounting.takings.filter(
    (taking) => taking.date <= economicRangeEnd,
  )
  const stockTransferredVenit = transferredVenit(stockInvoices)
  const stockTheoretical = roundMoney(
    stockInvoices.reduce(
      (sum, invoice) => sum + invoice.theoreticalRevenue,
      0,
    ) - stockTransferredVenit,
  )
  const stockReal = roundMoney(
    stockTakings.reduce((sum, taking) => sum + realTaking(taking), 0),
  )
  const annualStock = roundMoney(
    Math.max(stockTheoretical - stockReal, 0),
  )
  const annualPurchaseCosts = roundMoney(
    annualInvoices.reduce(
      (sum, invoice) =>
        sum + invoice.total + invoice.unregisteredGoods,
      0,
    ),
  )
  const annualFixedCosts = roundMoney(
    annualRentalCosts.reduce((sum, cost) => sum + cost.amount, 0) +
      annualAccountantCosts.reduce((sum, cost) => sum + cost.amount, 0) +
      annualExpenseCosts.reduce((sum, cost) => sum + cost.amount, 0) +
      annualProductionSalaryCosts.reduce(
        (sum, cost) => sum + cost.amount,
        0,
      ),
  )
  const annualRealBalance = roundMoney(
    annualReal - annualPurchaseCosts - annualFixedCosts,
  )
  const annualPotentialBalance = roundMoney(
    annualRealBalance + annualStock,
  )
  const annualBalanceTone =
    annualRealBalance >= 0
      ? 'green'
      : annualPotentialBalance >= 0
        ? 'amber'
        : 'red'
  const annualBalanceStatus =
    annualRealBalance >= 0
      ? 'Positivo'
      : annualPotentialBalance >= 0
        ? 'Negativo oggi, recuperabile vendendo lo stock'
        : 'Negativo anche vendendo tutto lo stock'
  const economicPaidInvoices = accounting.invoices.filter((invoice) => {
    const paymentDate = invoice.paymentDate ?? invoice.date
    return (
      paymentDate >= economicRangeStart &&
      paymentDate <= economicRangeEnd &&
      (invoice.settled || invoice.paidAmount > 0)
    )
  })
  const economicInvoiceValue = roundMoney(
    annualInvoices.reduce((sum, invoice) => sum + invoice.total, 0),
  )
  const invoiceRemainingAtPeriodEnd = (
    invoice: (typeof accounting.invoices)[number],
  ) => {
    const payments = invoice.payments ?? []
    const recordedPaidAmount = payments
      .filter((payment) => payment.date <= economicRangeEnd)
      .reduce((sum, payment) => sum + payment.amount, 0)
    const legacyPaidAmount =
      payments.length === 0 &&
      (!invoice.paymentDate ||
        invoice.paymentDate <= economicRangeEnd)
        ? invoice.settled
          ? invoice.total
          : invoice.paidAmount
        : 0
    const paidAmount =
      invoice.settled &&
      (!invoice.paymentDate ||
        invoice.paymentDate <= economicRangeEnd)
        ? invoice.total
        : recordedPaidAmount || legacyPaidAmount
    return roundMoney(Math.max(0, invoice.total - paidAmount))
  }
  const economicPaidInvoiceValue = roundMoney(
    economicPaidInvoices.reduce(
      (sum, invoice) =>
        sum + (invoice.settled ? invoice.total : invoice.paidAmount),
      0,
    ),
  )
  const economicRemainingInvoices = roundMoney(
    economicBalanceInvoices.reduce(
      (sum, invoice) =>
        sum + invoiceRemainingAtPeriodEnd(invoice),
      0,
    ),
  )
  const economicInputVat = roundMoney(
    economicBalanceInvoices.reduce(
      (sum, invoice) => sum + invoice.vat,
      0,
    ) +
      economicBalanceRentals.reduce(
        (sum, rental) => sum + rental.vat,
        0,
      ) +
      economicBalanceAccountantInvoices.reduce(
        (sum, invoice) => sum + invoice.vat,
        0,
      ),
  )
  const economicOutputVat = roundMoney(
    economicBalanceTakings.reduce(
      (sum, taking) => sum + taking.vat,
      0,
    ),
  )
  const economicVatBalance = roundMoney(
    economicOutputVat - economicInputVat,
  )
  const economicCash = roundMoney(
    annualTakings.reduce((sum, taking) => sum + taking.cash, 0),
  )
  const economicPos = roundMoney(
    annualTakings.reduce((sum, taking) => sum + taking.pos, 0),
  )
  const economicWithdrawals = roundMoney(
    annualTakings.reduce((sum, taking) => sum + taking.withdrawal, 0),
  )
  const economicUnregisteredGoods = roundMoney(
    annualInvoices.reduce(
      (sum, invoice) => sum + invoice.unregisteredGoods,
      0,
    ),
  )
  const economicUnregisteredGoodsCash = roundMoney(
    annualTakings.reduce(
      (sum, taking) => sum + taking.unregisteredGoods,
      0,
    ),
  )
  const economicOfficial = roundMoney(
    annualTakings.reduce(
      (sum, taking) => sum + officialTaking(taking),
      0,
    ),
  )
  const economicRawCashResidual = roundMoney(
    annualReal -
      economicPos -
      economicWithdrawals -
      economicUnregisteredGoodsCash,
  )
  const economicCashResidual = roundMoney(
    Math.max(0, economicRawCashResidual),
  )
  const economicTotalCosts = roundMoney(
    annualPurchaseCosts + annualFixedCosts,
  )
  const invoiceRows: DashboardDetailRow[] = accounting.invoices.map(
    (invoice) => ({
      date: invoice.date,
      category: 'Fattura fornitore',
      description: invoice.supplierName || 'Fornitore non indicato',
      reference: `Fattura ${invoice.number || 'senza numero'} · ${invoice.sellerName || 'Venditore non indicato'}`,
      amount: invoice.total,
    }),
  )
  const paidInvoiceRows: DashboardDetailRow[] = accounting.invoices
    .map((invoice) => ({
      date: invoice.paymentDate ?? invoice.date,
      category: invoice.settled ? 'Fattura saldata' : 'Acconto',
      description: invoice.supplierName || 'Fornitore non indicato',
      reference: `Fattura ${invoice.number || 'senza numero'} · ${invoice.paymentMethod ?? 'Metodo non indicato'}`,
      amount: invoice.settled ? invoice.total : invoice.paidAmount,
    }))
    .filter((row) => row.amount > 0)
  const inputVatRows: DashboardDetailRow[] = [
    ...accounting.invoices.map((invoice) => ({
      date: invoice.date,
      category: 'IVA fattura fornitore',
      description: invoice.supplierName || 'Fornitore non indicato',
      reference: `Fattura ${invoice.number || 'senza numero'}`,
      amount: invoice.vat,
    })),
    ...accounting.rentals.map((rental) => ({
      date: rental.date,
      category: 'IVA affitto',
      description: rental.property || 'Immobile non indicato',
      reference: rental.period || 'Periodo non indicato',
      amount: rental.vat,
    })),
    ...accounting.accountantInvoices.map((invoice) => ({
      date: invoice.date,
      category: 'IVA contabile',
      description: invoice.description || 'Fattura contabile',
      reference: `Fattura ${invoice.number || 'senza numero'}`,
      amount: invoice.vat,
    })),
  ].filter((row) => row.amount !== 0)
  const outputVatRows: DashboardDetailRow[] = accounting.takings
    .map((taking) => ({
      date: taking.date,
      category: 'IVA incassi',
      description: taking.sellerName || 'Venditore non indicato',
      reference: 'IVA inclusa in Cash + POS',
      amount: taking.vat,
    }))
    .filter((row) => row.amount !== 0)
  const cashRows: DashboardDetailRow[] = accounting.takings
    .map((taking) => ({
      date: taking.date,
      category: 'Cash',
      description: taking.sellerName || 'Venditore non indicato',
      reference: `Incasso reale ${money(realTaking(taking))}`,
      amount: taking.cash,
    }))
    .filter((row) => row.amount !== 0)
  const posRows: DashboardDetailRow[] = accounting.takings
    .map((taking) => ({
      date: taking.date,
      category: 'POS',
      description: taking.sellerName || 'Venditore non indicato',
      reference: `Incasso reale ${money(realTaking(taking))}`,
      amount: taking.pos,
    }))
    .filter((row) => row.amount !== 0)
  const officialRows: DashboardDetailRow[] = accounting.takings
    .map((taking) => ({
      date: taking.date,
      category: 'Incasso registrato',
      description: taking.sellerName || 'Venditore non indicato',
      reference: `Cash ${money(taking.cash)} · POS ${money(taking.pos)}`,
      amount: officialTaking(taking),
    }))
    .filter((row) => row.amount !== 0)
  const realRows: DashboardDetailRow[] = accounting.takings
    .map((taking) => ({
      date: taking.date,
      category: 'Incasso reale',
      description: taking.sellerName || 'Venditore non indicato',
      reference: `Incasso registrato ${money(officialTaking(taking))}`,
      amount: realTaking(taking),
    }))
    .filter((row) => row.amount !== 0)
  const withdrawalRows: DashboardDetailRow[] = accounting.takings
    .map((taking) => ({
      date: taking.date,
      category: 'Cash ritirato',
      description: taking.sellerName || 'Venditore non indicato',
      reference: `Incasso reale ${money(realTaking(taking))}`,
      amount: taking.withdrawal,
      sellerId: taking.sellerId,
    }))
    .filter((row) => row.amount !== 0)
  const unregisteredGoodsRows: DashboardDetailRow[] = accounting.invoices
    .map((invoice) => ({
      date: invoice.date,
      category: 'Merce acquistata senza fattura',
      description: invoice.supplierName || invoice.description || 'Acquisto',
      reference: `Venditore ${invoice.sellerName || 'non indicato'}`,
      amount: invoice.unregisteredGoods,
      sellerId: invoice.sellerId,
    }))
    .filter((row) => row.amount !== 0)
  const theoreticalRows: DashboardDetailRow[] = accounting.invoices
    .map((invoice) => ({
      date: invoice.date,
      category: 'Venit teorico',
      description: invoice.supplierName || 'Fornitore non indicato',
      reference: `Fattura ${invoice.number || 'senza numero'} · ${invoice.sellerName || 'Venditore non indicato'}`,
      amount: invoice.theoreticalRevenue,
    }))
    .filter((row) => row.amount !== 0)
  const isInEconomicRange = (date: string) =>
    date >= economicRangeStart && date <= economicRangeEnd
  const economicInvoiceRows = invoiceRows.filter((row) =>
    isInEconomicRange(row.date),
  )
  const economicPaidInvoiceRows = paidInvoiceRows.filter((row) =>
    isInEconomicRange(row.date),
  )
  const economicRemainingInvoiceRows: DashboardDetailRow[] =
    economicBalanceInvoices
      .map((invoice) => ({
        date: invoice.dueDate || invoice.date,
        category: 'Residuo fattura',
        description:
          invoice.supplierName || 'Fornitore non indicato',
        reference: `Fattura ${invoice.number || 'senza numero'}`,
        amount: invoiceRemainingAtPeriodEnd(invoice),
      }))
      .filter((row) => row.amount > 0)
  const economicInputVatRows = inputVatRows.filter((row) =>
    isInEconomicBalanceRange(row.date),
  )
  const economicOutputVatRows = outputVatRows.filter((row) =>
    isInEconomicBalanceRange(row.date),
  )
  const economicCashRows = cashRows.filter((row) =>
    isInEconomicRange(row.date),
  )
  const economicPosRows = posRows.filter((row) =>
    isInEconomicRange(row.date),
  )
  const economicOfficialRows = officialRows.filter((row) =>
    isInEconomicRange(row.date),
  )
  const economicRealRows = realRows.filter((row) =>
    isInEconomicRange(row.date),
  )
  const economicWithdrawalRows = withdrawalRows.filter((row) =>
    isInEconomicRange(row.date),
  )
  const economicUnregisteredGoodsRows = unregisteredGoodsRows.filter(
    (row) => isInEconomicRange(row.date),
  )
  const economicCashResidualRows: DashboardDetailRow[] = [
    {
      date: economicRangeEnd,
      category: 'Incasso reale',
      description: 'Totale effettivamente incassato nel periodo',
      reference: 'Valore di partenza',
      amount: annualReal,
    },
    {
      date: economicRangeEnd,
      category: 'POS',
      description: 'Pagamenti elettronici del periodo',
      reference: 'Importo sottratto',
      amount: -economicPos,
    },
    {
      date: economicRangeEnd,
      category: 'Cash ritirato',
      description: 'Contanti ritirati nel periodo',
      reference: 'Importo sottratto',
      amount: -economicWithdrawals,
    },
    {
      date: economicRangeEnd,
      category: 'Merce acquistata senza fattura',
      description: 'Pagamenti effettuati dalla cassa nel periodo',
      reference: 'Importo sottratto',
      amount: -economicUnregisteredGoodsCash,
    },
    ...(economicRawCashResidual < 0
      ? [
          {
            date: economicRangeEnd,
            category: 'Limite minimo',
            description: 'Il cash residuo non può essere negativo',
            reference: 'Adeguamento a zero',
            amount: -economicRawCashResidual,
          },
        ]
      : []),
  ]
  const economicTheoreticalRows = [
    ...theoreticalRows.filter((row) => isInEconomicRange(row.date)),
    ...(annualTransferredVenit > 0
      ? [
          {
            date: economicRangeEnd,
            category: 'Venit ceduto',
            description: 'Trasferimenti tra venditori del periodo',
            reference: 'Importo sottratto',
            amount: -annualTransferredVenit,
          },
        ]
      : []),
  ]
  const economicStockTheoreticalRows = [
    ...theoreticalRows.filter((row) => row.date <= economicRangeEnd),
    ...(stockTransferredVenit > 0
      ? [
          {
            date: economicRangeEnd,
            category: 'Venit ceduto progressivo',
            description: 'Trasferimenti tra venditori fino alla data',
            reference: 'Importo sottratto',
            amount: -stockTransferredVenit,
          },
        ]
      : []),
  ]
  const economicStockRealRows = realRows
    .filter((row) => row.date <= economicRangeEnd)
    .map((row) => ({ ...row, amount: -row.amount }))
  const economicRentalRows: DashboardDetailRow[] =
    annualRentalCosts.map(({ item, amount }) => ({
      date: item.date,
      category: 'Affitto maturato',
      description: item.property || item.tenant || 'Affitto',
      reference: `Quota su ${annualMaturedDates.size} giorni maturati`,
      amount,
    }))
  const economicAccountantRows: DashboardDetailRow[] =
    annualAccountantCosts.map(({ item, amount }) => ({
      date: item.date,
      category: 'Contabile maturato',
      description: item.description || 'Fattura contabile',
      reference: `Quota su ${annualMaturedDates.size} giorni maturati`,
      amount,
    }))
  const economicExpenseRows: DashboardDetailRow[] =
    annualExpenseCosts.map(({ expense, amount }) => ({
      date: expense.date,
      category: 'Spesa del periodo',
      description: expense.description || expense.type,
      reference:
        expense.recurrence === 'monthly'
          ? `Quota su ${annualMaturedDates.size} giorni maturati`
          : expense.notes || 'Spesa effettiva',
      amount,
    }))
  const economicProductionSalaryRows: DashboardDetailRow[] =
    annualProductionSalaryCosts.map((cost) => {
      const seller = accounting.sellers.find(
        (item) => item.id === cost.sellerId,
      )
      return {
        date: cost.date,
        category: 'Stipendio produzione',
        description: seller?.name ?? 'Lavoratrice non disponibile',
        reference:
          cost.payMode === 'hourly'
            ? `${cost.quantity.toLocaleString('it-IT')} ore × ${money(cost.rate)}`
            : `${cost.quantity.toLocaleString('it-IT')} pezzi × ${money(cost.rate)}`,
        amount: cost.amount,
      }
    })
  const economicCostRows = [
    ...economicInvoiceRows,
    ...economicUnregisteredGoodsRows,
    ...economicRentalRows,
    ...economicAccountantRows,
    ...economicExpenseRows,
    ...economicProductionSalaryRows,
  ]
  const negativeEconomicCostRows = economicCostRows.map((row) => ({
    ...row,
    amount: -row.amount,
  }))
  const annualBalanceRows: DashboardDetailRow[] = [
    ...annualTakings
      .map((taking) => ({
        date: taking.date,
        category: 'Incasso reale del periodo',
        description: taking.sellerName || 'Venditore non indicato',
        reference: 'Valore effettivamente incassato',
        amount: realTaking(taking),
      }))
      .filter((row) => row.amount !== 0),
    ...annualInvoices.map((invoice) => ({
      date: invoice.date,
      category: 'Acquisto del periodo',
      description: invoice.supplierName || 'Fornitore non indicato',
      reference: `Fattura ${invoice.number || 'senza numero'} · include merce senza fattura`,
      amount: -(invoice.total + invoice.unregisteredGoods),
    })),
    ...annualRentalCosts.map(({ item, amount }) => ({
      date: item.date,
      category: 'Affitto maturato',
      description: item.property || item.tenant || 'Affitto',
      reference: `Quota su ${annualMaturedDates.size} giorni maturati`,
      amount: -amount,
    })),
    ...annualAccountantCosts.map(({ item, amount }) => ({
      date: item.date,
      category: 'Contabile maturato',
      description: item.description || 'Fattura contabile',
      reference: `Quota su ${annualMaturedDates.size} giorni maturati`,
      amount: -amount,
    })),
    ...annualExpenseCosts.map(({ expense, amount }) => ({
      date: expense.date,
      category: 'Spesa del periodo',
      description: expense.description || expense.type,
      reference:
        expense.recurrence === 'monthly'
          ? `Quota su ${annualMaturedDates.size} giorni maturati`
          : expense.notes || 'Spesa effettiva',
      amount: -amount,
    })),
    ...annualProductionSalaryCosts.map((cost) => {
      const seller = accounting.sellers.find(
        (item) => item.id === cost.sellerId,
      )
      return {
        date: cost.date,
        category: 'Stipendio produzione',
        description: seller?.name ?? 'Lavoratrice non disponibile',
        reference:
          cost.payMode === 'hourly'
            ? `${cost.quantity.toLocaleString('it-IT')} ore × ${money(cost.rate)}`
            : `${cost.quantity.toLocaleString('it-IT')} pezzi × ${money(cost.rate)}`,
        amount: -cost.amount,
      }
    }),
    ...(annualStock > 0
      ? [
          {
            date: economicRangeEnd,
            category: 'Scenario vendita stock',
            description: 'Venit stock ancora vendibile',
            reference: `Bilancio potenziale ${money(annualPotentialBalance)}`,
            amount: annualStock,
          },
        ]
      : []),
  ]
  const metrics: Record<DashboardMetricKey, DashboardMetric> = {
    invoices: {
      title: `Fatture ricevute · ${economicPeriodLabel}`,
      note: 'Totale delle fatture fornitori registrate nel periodo.',
      value: economicInvoiceValue,
      tone: 'cyan',
      rows: economicInvoiceRows,
    },
    'paid-invoices': {
      title: `Fatture pagate · ${economicPeriodLabel}`,
      note: 'Acconti e saldi registrati nel periodo.',
      value: economicPaidInvoiceValue,
      tone: 'green',
      rows: economicPaidInvoiceRows,
    },
    'remaining-invoices': {
      title: `Residuo da pagare · ${economicPeriodLabel}`,
      note:
        economicMode === 'month'
          ? 'Importi ancora dovuti a fine mese, compresi i residui precedenti.'
          : 'Importi ancora dovuti a fine anno, compresi i residui precedenti.',
      value: economicRemainingInvoices,
      tone: 'amber',
      rows: economicRemainingInvoiceRows,
    },
    'input-vat': {
      title: `IVA acquisti · ${economicPeriodLabel}`,
      note:
        economicMode === 'month'
          ? 'IVA progressiva fino a fine mese su fatture, affitti e contabile.'
          : 'IVA progressiva fino a fine anno su fatture, affitti e contabile.',
      value: economicInputVat,
      tone: 'cyan',
      rows: economicInputVatRows,
    },
    'output-vat': {
      title: `IVA incassi · ${economicPeriodLabel}`,
      note:
        economicMode === 'month'
          ? 'IVA progressiva fino a fine mese, già inclusa in Cash + POS.'
          : 'IVA progressiva fino a fine anno, già inclusa in Cash + POS.',
      value: economicOutputVat,
      tone: 'amber',
      rows: economicOutputVatRows,
    },
    'vat-balance': {
      title:
        economicVatBalance > 0
          ? `IVA: a debito · ${economicPeriodLabel}`
          : economicVatBalance < 0
            ? `IVA: a credito · ${economicPeriodLabel}`
            : 'IVA: in pareggio',
      note:
        economicMode === 'month'
          ? 'Saldo IVA progressivo, compreso il risultato dei mesi precedenti.'
          : 'Saldo IVA progressivo, compreso il risultato degli anni precedenti.',
      value: Math.abs(economicVatBalance),
      tone:
        economicVatBalance > 0
          ? 'red'
          : economicVatBalance < 0
            ? 'green'
            : 'cyan',
      rows: [
        ...economicOutputVatRows,
        ...economicInputVatRows.map((row) => ({
          ...row,
          amount: -row.amount,
        })),
      ],
    },
    cash: {
      title: `Cash · ${economicPeriodLabel}`,
      note: 'Contanti registrati negli incassi del periodo.',
      value: economicCash,
      tone: 'green',
      rows: economicCashRows,
    },
    pos: {
      title: `POS · ${economicPeriodLabel}`,
      note: 'Pagamenti elettronici registrati nel periodo.',
      value: economicPos,
      tone: 'green',
      rows: economicPosRows,
    },
    official: {
      title: `Incasso registrato · ${economicPeriodLabel}`,
      note: 'Somma di Cash e POS del periodo, con IVA già compresa.',
      value: economicOfficial,
      tone: 'green',
      rows: economicOfficialRows,
    },
    real: {
      title: `Incasso reale · ${economicPeriodLabel}`,
      note: 'Totale effettivamente incassato nel periodo.',
      value: annualReal,
      tone: 'cyan',
      rows: economicRealRows,
    },
    withdrawals: {
      title: `Cash ritirato · ${economicPeriodLabel}`,
      note: 'Contanti ritirati dai venditori nel periodo.',
      value: economicWithdrawals,
      tone: 'violet',
      rows: economicWithdrawalRows,
    },
    'unregistered-goods': {
      title: `Merce acquistata senza fattura · ${economicPeriodLabel}`,
      note: 'Spese del periodo pagate con la cassa.',
      value: economicUnregisteredGoods,
      tone: 'red',
      rows: economicUnregisteredGoodsRows,
    },
    'cash-residual': {
      title: `Cash residuo · ${economicPeriodLabel}`,
      note:
        'Incasso reale del periodo meno POS, Cash ritirato e merce senza fattura.',
      value: economicCashResidual,
      tone: 'green',
      rows: economicCashResidualRows,
    },
    theoretical: {
      title: `Venit complessivo · ${economicPeriodLabel}`,
      note: 'Vendita teorica dei prodotti acquistati nel periodo.',
      value: annualTheoretical,
      tone: 'cyan',
      rows: economicTheoreticalRows,
    },
    stock: {
      title: `Venit stock · ${economicPeriodLabel}`,
      note:
        'Residuo precedente più i movimenti del periodo selezionato.',
      value: annualStock,
      tone: 'amber',
      rows: [
        ...economicStockTheoreticalRows,
        ...economicStockRealRows,
      ],
    },
    costs: {
      title: `Costi complessivi · ${economicPeriodLabel}`,
      note:
        'Fatture e costi maturati nel periodo selezionato.',
      value: economicTotalCosts,
      tone: 'amber',
      rows: economicCostRows,
    },
    'real-result': {
      title: `Risultato reale · ${economicPeriodLabel}`,
      note: 'Incasso reale meno i costi maturati nel periodo.',
      value: annualRealBalance,
      tone: annualRealBalance >= 0 ? 'green' : 'red',
      rows: [...economicRealRows, ...negativeEconomicCostRows],
    },
    'annual-real-balance': {
      title: `Bilancio reale · ${economicPeriodLabel}`,
      note: `${annualBalanceStatus}. Bilancio attuale = incasso reale − acquisti − spese maturate sui giorni trascorsi. Bilancio potenziale vendendo tutto lo stock = ${money(annualPotentialBalance)}. Cash, POS e quote statistiche sono esclusi.`,
      value: annualRealBalance,
      tone: annualBalanceTone,
      rows: annualBalanceRows,
    },
  }
  const selectedSellerMonth = /^\d{4}-\d{2}$/.test(sellerMonth)
    ? sellerMonth
    : currentMonth
  const sellerMonthStart = `${selectedSellerMonth}-01`
  const unboundedSellerMonthEnd = monthEnd(selectedSellerMonth)
  const sellerMonthEnd =
    unboundedSellerMonthEnd > currentDate
      ? currentDate
      : unboundedSellerMonthEnd
  const isInSellerPeriod = (date: string) =>
    sellerPeriodMode === 'month'
      ? date >= sellerMonthStart && date <= sellerMonthEnd
      : !sellerAsOfDate || date <= sellerAsOfDate
  const sellerInvoices = accounting.invoices.filter((invoice) =>
    isInSellerPeriod(invoice.date),
  )
  const sellerTakings = accounting.takings.filter((taking) =>
    isInSellerPeriod(taking.date),
  )
  const knownSellerIds = new Set(accounting.sellers.map((seller) => seller.id))
  const sellerRevenueTransfers = (invoices: typeof accounting.invoices) =>
    invoices.flatMap((invoice) => {
      if (
        !invoice.sellerId ||
        invoice.taxableAmount !== 0 ||
        invoice.theoreticalRevenue <= 0
      ) {
        return []
      }
      const supplier = accounting.suppliers.find(
        (item) => item.id === invoice.supplierId,
      )
      if (!supplier?.sellerRevenueTransferEnabled) return []
      const linkedSellerId =
        bestContactNameMatch(
          invoice.supplierName || supplier.name,
          accounting.sellers,
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
          date: invoice.date,
          amount: roundMoney(invoice.theoreticalRevenue),
          reference: `Fattura ${invoice.number || 'senza numero'} · ${
            supplier.name
          }`,
        },
      ]
    })
  const supplierSellerRevenueTransfers =
    sellerRevenueTransfers(sellerInvoices)
  const sellerStockEnd =
    sellerPeriodMode === 'month'
      ? sellerMonthEnd
      : sellerAsOfDate || economicRangeEnd
  const sellerStockInvoices = accounting.invoices.filter(
    (invoice) => invoice.date <= sellerStockEnd,
  )
  const sellerStockTakings = accounting.takings.filter(
    (taking) => taking.date <= sellerStockEnd,
  )
  const sellerStockRevenueTransfers =
    sellerRevenueTransfers(sellerStockInvoices)
  const sellerResultEnd =
    sellerPeriodMode === 'month'
      ? sellerMonthEnd
      : sellerAsOfDate || today()
  const sellerResultStart =
    sellerPeriodMode === 'month'
      ? sellerMonthStart
      : `${sellerResultEnd.slice(0, 7)}-01`
  const sellerResultInvoices = sellerInvoices.filter(
    (invoice) =>
      invoice.date >= sellerResultStart && invoice.date <= sellerResultEnd,
  )
  const sellerResultTakings = sellerTakings.filter(
    (taking) =>
      taking.date >= sellerResultStart && taking.date <= sellerResultEnd,
  )
  const sellerResultTransfers = supplierSellerRevenueTransfers.filter(
    (transfer) =>
      transfer.date >= sellerResultStart && transfer.date <= sellerResultEnd,
  )
  const sellerResultMaturedDates = maturedDatesForPeriod(
    sellerResultStart,
    sellerResultEnd,
  )
  const sellerResultRentalCosts = monthlyCostsForMaturedDates(
    accounting.rentals,
    sellerResultMaturedDates,
    (rental) => rental.property.trim().toLocaleLowerCase() || rental.id,
  )
  const sellerResultAccountantCosts = monthlyCostsForMaturedDates(
    accounting.accountantInvoices,
    sellerResultMaturedDates,
    (invoice) => invoice.description.trim().toLocaleLowerCase() || invoice.id,
  )
  const sellerResultProductionSalaryCosts =
    productionSalaryCostsForPeriod(
      accounting,
      sellerResultStart,
      sellerResultEnd,
    )
  const allSellerIds = accounting.sellers.map((seller) => seller.id)
  const productionSalarySellerIds = accounting.sellers
    .filter((seller) => seller.pointOfSaleSeller)
    .map((seller) => seller.id)
  const allocationTargets = (item: { allocationSellerIds: string[] }) => {
    const validSellerIds = item.allocationSellerIds.filter((sellerId) =>
      knownSellerIds.has(sellerId),
    )
    return item.allocationSellerIds.length > 0
      ? validSellerIds
      : allSellerIds
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
  const allocatedProductionSalaryCost = (
    value: number,
    sellerId: string,
  ) => {
    const sellerIndex = productionSalarySellerIds.indexOf(sellerId)
    if (sellerIndex < 0) return 0
    const equalShare = roundMoney(
      value / productionSalarySellerIds.length,
    )
    return sellerIndex === productionSalarySellerIds.length - 1
      ? roundMoney(
          value -
            equalShare * (productionSalarySellerIds.length - 1),
        )
      : equalShare
  }
  const productionCostRecipients = accounting.sellers.filter(
    (seller) => seller.productionCostRecipient,
  )
  const productionCostAllocations = accounting.sellers
    .filter((seller) => seller.productionCostDistributor)
    .flatMap((distributor) => {
      const sourceInvoices = sellerResultInvoices.filter(
        (invoice) => invoice.sellerId === distributor.id,
      )
      const sourceCost = roundMoney(
        sourceInvoices.reduce((sum, invoice) => sum + invoice.total, 0),
      )
      const recipients = productionCostRecipients
        .filter((recipient) => recipient.id !== distributor.id)
        .map((recipient) => {
          const deliveryInvoices = sellerResultInvoices.filter((invoice) => {
            if (
              invoice.sellerId !== recipient.id ||
              invoice.theoreticalRevenue <= 0
            ) {
              return false
            }
            const supplier = accounting.suppliers.find(
              (item) => item.id === invoice.supplierId,
            )
            return (
              supplier?.linkedSellerId === distributor.id ||
              bestContactNameMatch(
                invoice.supplierName || supplier?.name || '',
                [distributor],
              )?.id === distributor.id
            )
          })
          return {
            recipient,
            venit: roundMoney(
              deliveryInvoices.reduce(
                (sum, invoice) => sum + invoice.theoreticalRevenue,
                0,
              ),
            ),
          }
        })
        .filter((recipient) => recipient.venit > 0)
      const totalVenit = roundMoney(
        recipients.reduce((sum, recipient) => sum + recipient.venit, 0),
      )
      if (sourceCost <= 0 || totalVenit <= 0) return []
      let allocatedCost = 0
      return recipients.map((recipient, index) => {
        const cost =
          index === recipients.length - 1
            ? roundMoney(sourceCost - allocatedCost)
            : roundMoney(sourceCost * (recipient.venit / totalVenit))
        allocatedCost = roundMoney(allocatedCost + cost)
        return {
          distributor,
          recipient: recipient.recipient,
          cost,
        }
      })
    })
  const statisticalTransferCostAllocations = accounting.sellers.flatMap(
    (sourceSeller) => {
      const transfers = sellerResultTransfers.filter(
        (transfer) => transfer.fromSellerId === sourceSeller.id,
      )
      const sourceInvoices = sellerResultInvoices.filter(
        (invoice) => invoice.sellerId === sourceSeller.id,
      )
      const sourceVenit = roundMoney(
        sourceInvoices.reduce(
          (sum, invoice) => sum + invoice.theoreticalRevenue,
          0,
        ),
      )
      const sourceCost = roundMoney(
        sourceInvoices.reduce((sum, invoice) => sum + invoice.total, 0),
      )
      const transferredVenit = roundMoney(
        transfers.reduce((sum, transfer) => sum + transfer.amount, 0),
      )
      if (
        transfers.length === 0 ||
        sourceVenit <= 0 ||
        sourceCost <= 0 ||
        transferredVenit <= 0
      ) {
        return []
      }
      const allocatedTotal = roundMoney(
        sourceCost * Math.min(transferredVenit / sourceVenit, 1),
      )
      let allocatedCost = 0
      return transfers.map((transfer, index) => {
        const cost =
          index === transfers.length - 1
            ? roundMoney(allocatedTotal - allocatedCost)
            : roundMoney(
                allocatedTotal * (transfer.amount / transferredVenit),
              )
        allocatedCost = roundMoney(allocatedCost + cost)
        return { ...transfer, cost }
      })
    },
  )
  const sellerRealResult = (sellerId: string) => {
    const invoices = sellerResultInvoices.filter(
      (invoice) => invoice.sellerId === sellerId,
    )
    const real = sellerResultTakings
      .filter((taking) => taking.sellerId === sellerId)
      .reduce((sum, taking) => sum + realTaking(taking), 0)
    const directInvoiceCost = invoices.reduce(
      (sum, invoice) => sum + invoice.total,
      0,
    )
    const unregisteredGoods = invoices.reduce(
      (sum, invoice) => sum + invoice.unregisteredGoods,
      0,
    )
    const productionReceived = productionCostAllocations
      .filter((allocation) => allocation.recipient.id === sellerId)
      .reduce((sum, allocation) => sum + allocation.cost, 0)
    const productionDistributed = productionCostAllocations
      .filter((allocation) => allocation.distributor.id === sellerId)
      .reduce((sum, allocation) => sum + allocation.cost, 0)
    const transferCost =
      statisticalTransferCostAllocations
        .filter((allocation) => allocation.toSellerId === sellerId)
        .reduce((sum, allocation) => sum + allocation.cost, 0) -
      statisticalTransferCostAllocations
        .filter((allocation) => allocation.fromSellerId === sellerId)
        .reduce((sum, allocation) => sum + allocation.cost, 0)
    const rent = sellerResultRentalCosts.reduce(
      (sum, cost) =>
        sum + allocatedSellerCost(cost.amount, cost.item, sellerId),
      0,
    )
    const accountant = sellerResultAccountantCosts.reduce(
      (sum, cost) =>
        sum + allocatedSellerCost(cost.amount, cost.item, sellerId),
      0,
    )
    const expenses = accounting.expenses.reduce((sum, expense) => {
      const amount = expenseForMaturedDates(
        expense,
        sellerResultStart,
        sellerResultEnd,
        sellerResultMaturedDates,
      )
      if (expense.type === 'stipendio') {
        const salarySellerId =
          expense.sellerId && knownSellerIds.has(expense.sellerId)
            ? expense.sellerId
            : bestContactNameMatch(
                expense.sellerName,
                accounting.sellers,
              )?.id
        return salarySellerId === sellerId ? sum + amount : sum
      }
      return sum + allocatedSellerCost(amount, expense, sellerId)
    }, 0)
    const productionSalary = sellerResultProductionSalaryCosts.reduce(
      (sum, cost) =>
        sum + allocatedProductionSalaryCost(cost.amount, sellerId),
      0,
    )
    const goodsCost = roundMoney(
      directInvoiceCost +
        unregisteredGoods +
        productionReceived -
        productionDistributed +
        transferCost,
    )
    const fixedCosts = roundMoney(
      rent + accountant + expenses + productionSalary,
    )
    const value = roundMoney(real - goodsCost - fixedCosts)
    const rows: DashboardDetailRow[] = [
      {
        date: sellerResultEnd,
        category: 'Incasso reale',
        description: 'Totale del mese',
        reference: `${sellerResultStart} – ${sellerResultEnd}`,
        amount: real,
      },
      {
        date: sellerResultEnd,
        category: 'Costo merce',
        description: 'Fatture e merce senza fattura',
        reference: 'Costo diretto',
        amount: -(directInvoiceCost + unregisteredGoods),
      },
      {
        date: sellerResultEnd,
        category: 'Quota costi PRODUCT',
        description: 'Ripartizione in base al Venit',
        reference: 'Quota ricevuta meno quota distribuita',
        amount: -(productionReceived - productionDistributed),
      },
      {
        date: sellerResultEnd,
        category: 'Quota costo Venit trasferito',
        description: 'Solo calcolo statistico personale',
        reference: 'Quota ricevuta meno quota ceduta',
        amount: -transferCost,
      },
      {
        date: sellerResultEnd,
        category: 'Affitti maturati',
        description: 'Quota personale',
        reference: `${sellerResultMaturedDates.size} giorni maturati`,
        amount: -rent,
      },
      {
        date: sellerResultEnd,
        category: 'Contabile maturato',
        description: 'Quota personale',
        reference: `${sellerResultMaturedDates.size} giorni maturati`,
        amount: -accountant,
      },
      {
        date: sellerResultEnd,
        category: 'Tasse, spese e stipendi',
        description: 'Quota personale maturata',
        reference: `${sellerResultMaturedDates.size} giorni maturati`,
        amount: -expenses,
      },
      {
        date: sellerResultEnd,
        category: 'Stipendi produzione',
        description: 'Quota ripartita tra le venditrici',
        reference: `${productionSalarySellerIds.length} venditrici punto vendita`,
        amount: -productionSalary,
      },
    ].filter((row) => row.amount !== 0)
    return { value, rows }
  }
  const sellerSummaries = accounting.sellers.map((seller) => {
    const invoices = sellerInvoices.filter(
      (invoice) => invoice.sellerId === seller.id,
    )
    const takings = sellerTakings.filter(
      (taking) => taking.sellerId === seller.id,
    )
    const cumulativeStockInvoices = sellerStockInvoices.filter(
      (invoice) => invoice.sellerId === seller.id,
    )
    const cumulativeStockTakings = sellerStockTakings.filter(
      (taking) => taking.sellerId === seller.id,
    )
    const cumulativeCashReal = cumulativeStockTakings.reduce(
      (sum, taking) => sum + realTaking(taking),
      0,
    )
    const cumulativeCashPos = cumulativeStockTakings.reduce(
      (sum, taking) => sum + taking.pos,
      0,
    )
    const cumulativeCashWithdrawals = cumulativeStockTakings.reduce(
      (sum, taking) => sum + taking.withdrawal,
      0,
    )
    const cumulativeCashUnregisteredGoods = cumulativeStockTakings.reduce(
      (sum, taking) => sum + taking.unregisteredGoods,
      0,
    )
    const sellerOfficial = takings.reduce(
      (sum, taking) => sum + officialTaking(taking),
      0,
    )
    const sellerReal = takings.reduce(
      (sum, taking) => sum + realTaking(taking),
      0,
    )
    const sellerPos = takings.reduce((sum, taking) => sum + taking.pos, 0)
    const sellerWithdrawals = takings.reduce(
      (sum, taking) => sum + taking.withdrawal,
      0,
    )
    const sellerUnregisteredGoods = invoices.reduce(
      (sum, invoice) => sum + invoice.unregisteredGoods,
      0,
    )
    const sellerUnregisteredGoodsCash = takings.reduce(
      (sum, taking) => sum + taking.unregisteredGoods,
      0,
    )
    const sellerBaseTheoretical = invoices.reduce(
      (sum, invoice) => sum + invoice.theoreticalRevenue,
      0,
    )
    const revenueAcquiredTransfers = supplierSellerRevenueTransfers.filter(
      (transfer) => transfer.toSellerId === seller.id,
    )
    const revenueCededTransfers = supplierSellerRevenueTransfers.filter(
      (transfer) => transfer.fromSellerId === seller.id,
    )
    const revenueAcquired = revenueAcquiredTransfers.reduce(
      (sum, transfer) => sum + transfer.amount,
      0,
    )
    const revenueCeded = revenueCededTransfers.reduce(
      (sum, transfer) => sum + transfer.amount,
      0,
    )
    const stockRevenueCededTransfers =
      sellerStockRevenueTransfers.filter(
        (transfer) => transfer.fromSellerId === seller.id,
      )
    const cumulativeStockTheoretical = roundMoney(
      cumulativeStockInvoices.reduce(
        (sum, invoice) => sum + invoice.theoreticalRevenue,
        0,
      ) -
        stockRevenueCededTransfers.reduce(
          (sum, transfer) => sum + transfer.amount,
          0,
        ),
    )
    const cumulativeStockReal = roundMoney(
      cumulativeStockTakings.reduce(
        (sum, taking) => sum + realTaking(taking),
        0,
      ),
    )
    const sellerTheoretical = roundMoney(
      sellerBaseTheoretical - revenueCeded,
    )
    const realResult = sellerRealResult(seller.id)
    return {
      id: seller.id,
      name: seller.name,
      overviewPriority: seller.overviewPriority,
      invoices,
      takings,
      invoiceValue: invoices.reduce(
        (sum, invoice) => sum + invoice.total,
        0,
      ),
      cash: takings.reduce((sum, taking) => sum + taking.cash, 0),
      pos: sellerPos,
      withdrawals: sellerWithdrawals,
      unregisteredGoods: sellerUnregisteredGoods,
      unregisteredGoodsCash: sellerUnregisteredGoodsCash,
      cashResidual: Math.max(
        0,
        cumulativeCashReal -
          cumulativeCashPos -
          cumulativeCashWithdrawals -
          cumulativeCashUnregisteredGoods,
      ),
      cashBalanceReal: cumulativeCashReal,
      cashBalancePos: cumulativeCashPos,
      cashBalanceWithdrawals: cumulativeCashWithdrawals,
      cashBalanceUnregisteredGoods: cumulativeCashUnregisteredGoods,
      official: sellerOfficial,
      real: sellerReal,
      vat: takings.reduce((sum, taking) => sum + taking.vat, 0),
      theoretical: sellerTheoretical,
      revenueAcquired,
      revenueCeded,
      revenueAcquiredTransfers,
      revenueCededTransfers,
      stockInvoices: cumulativeStockInvoices,
      stockTakings: cumulativeStockTakings,
      stockRevenueCededTransfers,
      realResult: realResult.value,
      realResultRows: realResult.rows,
      stockResidual: roundMoney(
        cumulativeStockTheoretical - cumulativeStockReal,
      ),
    }
  })
  sellerSummaries.sort((left, right) => {
    const leftPriority =
      left.overviewPriority > 0
        ? left.overviewPriority
        : Number.POSITIVE_INFINITY
    const rightPriority =
      right.overviewPriority > 0
        ? right.overviewPriority
        : Number.POSITIVE_INFINITY
    return leftPriority === rightPriority ? 0 : leftPriority - rightPriority
  })
  const unassignedInvoices = sellerInvoices.filter(
    (invoice) => !invoice.sellerId || !knownSellerIds.has(invoice.sellerId),
  )
  const unassignedTakings = sellerTakings.filter(
    (taking) => !taking.sellerId || !knownSellerIds.has(taking.sellerId),
  )
  const unassignedStockInvoices = sellerStockInvoices.filter(
    (invoice) => !invoice.sellerId || !knownSellerIds.has(invoice.sellerId),
  )
  const unassignedStockTakings = sellerStockTakings.filter(
    (taking) => !taking.sellerId || !knownSellerIds.has(taking.sellerId),
  )
  if (unassignedInvoices.length > 0 || unassignedTakings.length > 0) {
    const unassignedOfficial = unassignedTakings.reduce(
      (sum, taking) => sum + officialTaking(taking),
      0,
    )
    const unassignedReal = unassignedTakings.reduce(
      (sum, taking) => sum + realTaking(taking),
      0,
    )
    const unassignedPos = unassignedTakings.reduce(
      (sum, taking) => sum + taking.pos,
      0,
    )
    const unassignedWithdrawals = unassignedTakings.reduce(
      (sum, taking) => sum + taking.withdrawal,
      0,
    )
    const unassignedUnregisteredGoods = unassignedInvoices.reduce(
      (sum, invoice) => sum + invoice.unregisteredGoods,
      0,
    )
    const unassignedUnregisteredGoodsCash = unassignedTakings.reduce(
      (sum, taking) => sum + taking.unregisteredGoods,
      0,
    )
    const unassignedTheoretical = unassignedInvoices.reduce(
      (sum, invoice) => sum + invoice.theoreticalRevenue,
      0,
    )
    const unassignedCashReal = unassignedStockTakings.reduce(
      (sum, taking) => sum + realTaking(taking),
      0,
    )
    const unassignedCashPos = unassignedStockTakings.reduce(
      (sum, taking) => sum + taking.pos,
      0,
    )
    const unassignedCashWithdrawals = unassignedStockTakings.reduce(
      (sum, taking) => sum + taking.withdrawal,
      0,
    )
    const unassignedCashUnregisteredGoods = unassignedStockTakings.reduce(
      (sum, taking) => sum + taking.unregisteredGoods,
      0,
    )
    sellerSummaries.push({
      id: 'unassigned',
      name: 'Non assegnato',
      overviewPriority: 0,
      invoices: unassignedInvoices,
      takings: unassignedTakings,
      invoiceValue: unassignedInvoices.reduce(
        (sum, invoice) => sum + invoice.total,
        0,
      ),
      cash: unassignedTakings.reduce((sum, taking) => sum + taking.cash, 0),
      pos: unassignedPos,
      withdrawals: unassignedWithdrawals,
      unregisteredGoods: unassignedUnregisteredGoods,
      unregisteredGoodsCash: unassignedUnregisteredGoodsCash,
      cashResidual: Math.max(
        0,
        unassignedCashReal -
          unassignedCashPos -
          unassignedCashWithdrawals -
          unassignedCashUnregisteredGoods,
      ),
      cashBalanceReal: unassignedCashReal,
      cashBalancePos: unassignedCashPos,
      cashBalanceWithdrawals: unassignedCashWithdrawals,
      cashBalanceUnregisteredGoods: unassignedCashUnregisteredGoods,
      official: unassignedOfficial,
      real: unassignedReal,
      vat: unassignedTakings.reduce((sum, taking) => sum + taking.vat, 0),
      theoretical: unassignedTheoretical,
      revenueAcquired: 0,
      revenueCeded: 0,
      revenueAcquiredTransfers: [],
      revenueCededTransfers: [],
      stockInvoices: unassignedStockInvoices,
      stockTakings: unassignedStockTakings,
      stockRevenueCededTransfers: [],
      realResult: 0,
      realResultRows: [],
      stockResidual: roundMoney(
        unassignedStockInvoices.reduce(
          (sum, invoice) => sum + invoice.theoreticalRevenue,
          0,
        ) -
          unassignedStockTakings.reduce(
            (sum, taking) => sum + realTaking(taking),
            0,
          ),
      ),
    })
  }
  const storeSummaries = stores
    .map((store) => {
      const routeSeller = state.sellers.find(
        (seller) => seller.id === store.sellerId,
      )
      const seller = routeSeller
        ? sellerSummaries.find(
            (summary) => summary.id === routeSeller.accountingSellerId,
          )
        : undefined
      return seller ? { store, seller } : null
    })
    .filter(
      (summary): summary is NonNullable<typeof summary> => summary !== null,
    )
  const selectedStore = storeDetailId
    ? storeSummaries.find((summary) => summary.store.id === storeDetailId)
    : undefined

  const cashWithdrawalTakings = accounting.takings.filter(
    (taking) =>
      taking.withdrawal !== 0 &&
      (!cashWithdrawalFilters.startDate ||
        taking.date >= cashWithdrawalFilters.startDate) &&
      (!cashWithdrawalFilters.endDate ||
        taking.date <= cashWithdrawalFilters.endDate),
  )
  const cashWithdrawalTotals = new Map<
    string,
    {
      id: string
      name: string
      total: number
      entries: number
      displayGroup: number
      overviewPriority: number
      sourceIndex: number
    }
  >()
  accounting.sellers.forEach((seller, sourceIndex) => {
    cashWithdrawalTotals.set(seller.id, {
      id: seller.id,
      name: seller.name,
      total: 0,
      entries: 0,
      displayGroup: seller.productionCostDistributor
        ? 0
        : seller.pointOfSaleSeller
          ? 1
          : 2,
      overviewPriority: seller.overviewPriority,
      sourceIndex,
    })
  })
  for (const taking of cashWithdrawalTakings) {
    const seller =
      accounting.sellers.find((item) => item.id === taking.sellerId) ??
      bestContactNameMatch(taking.sellerName, accounting.sellers)
    const fallbackName = taking.sellerName.trim() || 'Venditore non indicato'
    const key =
      seller?.id ?? `legacy:${fallbackName.toLocaleLowerCase()}`
    const current = cashWithdrawalTotals.get(key) ?? {
      id: key,
      name: fallbackName,
      total: 0,
      entries: 0,
      displayGroup: 2,
      overviewPriority: 0,
      sourceIndex: accounting.sellers.length,
    }
    cashWithdrawalTotals.set(key, {
      ...current,
      total: roundMoney(current.total + taking.withdrawal),
      entries: current.entries + 1,
    })
  }
  const cashWithdrawalSellerTotals = [...cashWithdrawalTotals.values()]
    .filter((seller) => seller.displayGroup < 2 || seller.entries > 0)
    .sort((left, right) => {
      if (left.displayGroup !== right.displayGroup) {
        return left.displayGroup - right.displayGroup
      }
      const leftPriority =
        left.overviewPriority > 0
          ? left.overviewPriority
          : Number.POSITIVE_INFINITY
      const rightPriority =
        right.overviewPriority > 0
          ? right.overviewPriority
          : Number.POSITIVE_INFINITY
      if (leftPriority !== rightPriority) {
        return leftPriority - rightPriority
      }
      return left.sourceIndex - right.sourceIndex
    })
  const cashWithdrawalTotal = roundMoney(
    cashWithdrawalTakings.reduce(
      (sum, taking) => sum + taking.withdrawal,
      0,
    ),
  )
  const currentCashBySeller = new Map<string, number>()
  for (const taking of accounting.takings) {
    if (taking.date > currentDate) continue
    const seller =
      accounting.sellers.find((item) => item.id === taking.sellerId) ??
      bestContactNameMatch(taking.sellerName, accounting.sellers)
    if (!seller?.pointOfSaleSeller) continue
    const current = currentCashBySeller.get(seller.id) ?? 0
    currentCashBySeller.set(
      seller.id,
      roundMoney(
        current +
          realTaking(taking) -
          taking.pos -
          taking.withdrawal -
          taking.unregisteredGoods,
      ),
    )
  }
  const currentCashInHandTotal = roundMoney(
    [...currentCashBySeller.values()].reduce(
      (sum, value) => sum + Math.max(0, value),
      0,
    ),
  )
  const cashWithdrawalPeriodLabel =
    cashWithdrawalFilters.startDate && cashWithdrawalFilters.endDate
      ? cashWithdrawalFilters.startDate === cashWithdrawalFilters.endDate
        ? formatDashboardDate(cashWithdrawalFilters.startDate)
        : `${formatDashboardDate(cashWithdrawalFilters.startDate)} – ${formatDashboardDate(cashWithdrawalFilters.endDate)}`
      : cashWithdrawalFilters.startDate
        ? `dal ${formatDashboardDate(cashWithdrawalFilters.startDate)}`
        : cashWithdrawalFilters.endDate
          ? `fino al ${formatDashboardDate(cashWithdrawalFilters.endDate)}`
          : 'Tutto lo storico'
  const currentWeekStart = startOfWeek(currentDate)

  const withdrawalYears = [
    ...new Set(
      withdrawalRows
        .map((row) => row.date.slice(0, 4))
        .filter((year) => /^\d{4}$/.test(year)),
    ),
  ].sort((first, second) => second.localeCompare(first))
  const filteredWithdrawalRows = withdrawalRows.filter((row) => {
    const [year, month] = row.date.split('-')
    return (
      (!withdrawalSellerFilter ||
        (withdrawalSellerFilter === 'unassigned'
          ? !row.sellerId
          : row.sellerId === withdrawalSellerFilter)) &&
      (!withdrawalMonthFilter || month === withdrawalMonthFilter) &&
      (!withdrawalYearFilter || year === withdrawalYearFilter)
    )
  })
  const selectedMetric = detail
    ? detail === 'withdrawals'
      ? {
          ...metrics.withdrawals,
          value: filteredWithdrawalRows.reduce(
            (sum, row) => sum + row.amount,
            0,
          ),
          rows: filteredWithdrawalRows,
        }
      : metrics[detail]
    : null
  const selectedSeller = sellerDetail
    ? sellerSummaries.find((seller) => seller.id === sellerDetail.sellerId)
    : undefined
  const selectedSellerMetric: DashboardMetric | null =
    sellerDetail && selectedSeller
      ? (() => {
          const invoiceRows = selectedSeller.invoices.map((invoice) => ({
            date: invoice.date,
            category: 'Fattura assegnata',
            description: invoice.supplierName || 'Fornitore non indicato',
            reference: `Fattura ${invoice.number || 'senza numero'}`,
            amount: invoice.total,
          }))
          const invoiceTheoreticalRows = selectedSeller.invoices
            .map((invoice) => ({
              date: invoice.date,
              category: 'Venit teorico',
              description: invoice.supplierName || 'Fornitore non indicato',
              reference: `Fattura ${invoice.number || 'senza numero'}`,
              amount: invoice.theoreticalRevenue,
            }))
            .filter((row) => row.amount !== 0)
          const revenueAcquiredRows = selectedSeller.revenueAcquiredTransfers
            .map((transfer) => ({
              date: transfer.date,
              category: 'Venit acquisito',
              description: `Da ${
                accounting.sellers.find(
                  (seller) => seller.id === transfer.fromSellerId,
                )?.name ?? 'venditore non disponibile'
              }`,
              reference: transfer.reference,
              amount: transfer.amount,
            }))
            .filter((row) => row.amount !== 0)
          const revenueCededRows = selectedSeller.revenueCededTransfers
            .map((transfer) => ({
              date: transfer.date,
              category: 'Venit ceduto',
              description: `A ${
                accounting.sellers.find(
                  (seller) => seller.id === transfer.toSellerId,
                )?.name ?? 'venditore non disponibile'
              }`,
              reference: transfer.reference,
              amount: -Math.abs(transfer.amount),
            }))
            .filter((row) => row.amount !== 0)
          const theoreticalRows = [
            ...invoiceTheoreticalRows,
            ...revenueCededRows,
          ]
          const sellerTakingRows = (
            category: string,
            amount: (taking: (typeof accounting.takings)[number]) => number,
            reference: (
              taking: (typeof accounting.takings)[number],
            ) => string,
          ) =>
            selectedSeller.takings
              .map((taking) => ({
                date: taking.date,
                category,
                description: selectedSeller.name,
                reference: reference(taking),
                amount: amount(taking),
              }))
              .filter((row) => row.amount !== 0)
          const cashRows = sellerTakingRows(
            'Cash',
            (taking) => taking.cash,
            (taking) => `Incasso reale ${money(realTaking(taking))}`,
          )
          const posRows = sellerTakingRows(
            'POS',
            (taking) => taking.pos,
            (taking) => `Incasso reale ${money(realTaking(taking))}`,
          )
          const officialRows = sellerTakingRows(
            'Incasso registrato',
            officialTaking,
            (taking) =>
              `Cash ${money(taking.cash)} · POS ${money(taking.pos)}`,
          )
          const realRows = sellerTakingRows(
            'Incasso reale',
            realTaking,
            (taking) =>
              `Incasso registrato ${money(officialTaking(taking))}`,
          )
          const vatRows = sellerTakingRows(
            'IVA inclusa',
            (taking) => taking.vat,
            () => 'IVA inclusa in Cash + POS',
          )
          const withdrawalRows = sellerTakingRows(
            'Cash ritirato',
            (taking) => taking.withdrawal,
            (taking) => `Incasso reale ${money(realTaking(taking))}`,
          )
          const unregisteredGoodsRows = selectedSeller.invoices
            .map((invoice) => ({
              date: invoice.date,
              category: 'Merce acquistata senza fattura',
              description:
                invoice.supplierName || invoice.description || 'Acquisto',
              reference: `Fattura ${invoice.number || 'senza numero'}`,
              amount: invoice.unregisteredGoods,
            }))
            .filter((row) => row.amount !== 0)
          const rawCashResidual =
            selectedSeller.cashBalanceReal -
            selectedSeller.cashBalancePos -
            selectedSeller.cashBalanceWithdrawals -
            selectedSeller.cashBalanceUnregisteredGoods
          const cashResidualRows: DashboardDetailRow[] = [
            {
              date: '',
              category: 'Incasso reale',
              description: selectedSeller.name,
              reference: 'Valore di partenza',
              amount: selectedSeller.cashBalanceReal,
            },
            {
              date: '',
              category: 'POS',
              description: selectedSeller.name,
              reference: 'Importo sottratto',
              amount: -selectedSeller.cashBalancePos,
            },
            {
              date: '',
              category: 'Cash ritirato',
              description: selectedSeller.name,
              reference: 'Importo sottratto',
              amount: -selectedSeller.cashBalanceWithdrawals,
            },
            {
              date: '',
              category: 'Merce acquistata senza fattura',
              description: selectedSeller.name,
              reference: 'Importo sottratto dalla cassa',
              amount: -selectedSeller.cashBalanceUnregisteredGoods,
            },
            ...(rawCashResidual < 0
              ? [
                  {
                    date: '',
                    category: 'Limite minimo',
                    description: selectedSeller.name,
                    reference: 'Adeguamento a zero',
                    amount: -rawCashResidual,
                  },
                ]
              : []),
          ]
          const stockInvoiceRows = selectedSeller.stockInvoices
            .map((invoice) => ({
              date: invoice.date,
              category: 'Venit teorico progressivo',
              description: invoice.supplierName || 'Fornitore non indicato',
              reference: `Fattura ${invoice.number || 'senza numero'}`,
              amount: invoice.theoreticalRevenue,
            }))
            .filter((row) => row.amount !== 0)
          const stockCededRows =
            selectedSeller.stockRevenueCededTransfers
              .map((transfer) => ({
                date: transfer.date,
                category: 'Venit ceduto progressivo',
                description: `A ${
                  accounting.sellers.find(
                    (seller) => seller.id === transfer.toSellerId,
                  )?.name ?? 'venditore non disponibile'
                }`,
                reference: transfer.reference,
                amount: -Math.abs(transfer.amount),
              }))
              .filter((row) => row.amount !== 0)
          const stockRealRows = selectedSeller.stockTakings
            .map((taking) => ({
              date: taking.date,
              category: 'Incasso reale progressivo',
              description: selectedSeller.name,
              reference: `Incasso registrato ${money(officialTaking(taking))}`,
              amount: -realTaking(taking),
            }))
            .filter((row) => row.amount !== 0)
          const stockResidualRows = [
            ...stockInvoiceRows,
            ...stockCededRows,
            ...stockRealRows,
          ]
          const periodNote =
            sellerPeriodMode === 'month'
              ? ` Dati del mese ${selectedSellerMonth}.`
              : sellerAsOfDate
                ? ` Dati fino al ${sellerAsOfDate}, data compresa.`
                : ' Tutto lo storico disponibile.'
          const stockPeriodNote =
            sellerPeriodMode === 'month'
              ? ` Stock progressivo fino al ${sellerMonthEnd}: comprende il residuo precedente.`
              : sellerAsOfDate
                ? ` Stock progressivo fino al ${sellerAsOfDate}, data compresa.`
                : ` Stock progressivo fino al ${economicRangeEnd}: comprende il residuo precedente e i movimenti del periodo selezionato.`
          const sellerMetrics: Record<SellerMetricKey, DashboardMetric> = {
            invoices: {
              title: `Fatture assegnate · ${selectedSeller.name}`,
              note: `Fatture attribuite al venditore.${periodNote}`,
              value: selectedSeller.invoiceValue,
              tone: 'cyan',
              rows: invoiceRows,
            },
            theoretical: {
              title: `Venit teorico · ${selectedSeller.name}`,
              note: `Venit delle fatture meno il Venit ceduto; quello acquisito è già compreso.${periodNote}`,
              value: selectedSeller.theoretical,
              tone: 'violet',
              rows: theoreticalRows,
            },
            cash: {
              title: `Cash · ${selectedSeller.name}`,
              note: `Contanti registrati negli incassi del venditore.${periodNote}`,
              value: selectedSeller.cash,
              tone: 'green',
              rows: cashRows,
            },
            pos: {
              title: `POS · ${selectedSeller.name}`,
              note: `Pagamenti elettronici registrati per il venditore.${periodNote}`,
              value: selectedSeller.pos,
              tone: 'green',
              rows: posRows,
            },
            official: {
              title: `Incasso registrato · ${selectedSeller.name}`,
              note: `Somma di Cash e POS del venditore.${periodNote}`,
              value: selectedSeller.official,
              tone: 'green',
              rows: officialRows,
            },
            real: {
              title: `Incasso reale · ${selectedSeller.name}`,
              note: `Totale effettivamente incassato dal venditore.${periodNote}`,
              value: selectedSeller.real,
              tone: 'cyan',
              rows: realRows,
            },
            vat: {
              title: `IVA inclusa · ${selectedSeller.name}`,
              note: `IVA inclusa in Cash e POS del venditore.${periodNote}`,
              value: selectedSeller.vat,
              tone: 'amber',
              rows: vatRows,
            },
            withdrawals: {
              title: `Cash ritirato · ${selectedSeller.name}`,
              note: `Contanti già ritirati dal venditore.${periodNote}`,
              value: selectedSeller.withdrawals,
              tone: 'violet',
              rows: withdrawalRows,
            },
            'unregistered-goods': {
              title: `Merce acquistata senza fattura · ${selectedSeller.name}`,
              note: `Spese non documentate attribuite al venditore.${periodNote}`,
              value: selectedSeller.unregisteredGoods,
              tone: 'red',
              rows: unregisteredGoodsRows,
            },
            'cash-residual': {
              title: `Cash in mano attuale · ${selectedSeller.name}`,
              note: `Saldo progressivo fino alla fine del periodo: Incasso reale meno POS, Cash ritirato e merce senza fattura.${stockPeriodNote}`,
              value: selectedSeller.cashResidual,
              tone: 'green',
              rows: cashResidualRows,
            },
            'revenue-acquired': {
              title: `Venit acquisito dall'altro · ${selectedSeller.name}`,
              note: `Venit acquisito già conteggiato nel Venit principale.${periodNote}`,
              value: selectedSeller.revenueAcquired,
              tone: 'green',
              rows: revenueAcquiredRows,
            },
            'revenue-ceded': {
              title: `Venit ceduto all'altro · ${selectedSeller.name}`,
              note: `Venit ceduto all'altro venditore e tolto dallo Stock residuo.${periodNote}`,
              value: -selectedSeller.revenueCeded,
              tone: 'red',
              rows: revenueCededRows,
            },
            'real-result': {
              title: `Risultato reale · ${selectedSeller.name}`,
              note: `Incasso reale del mese meno costo merce, quote PRODUCT, costo Venit trasferito e spese maturate fino al giorno selezionato.`,
              value: selectedSeller.realResult,
              tone: selectedSeller.realResult >= 0 ? 'green' : 'red',
              rows: selectedSeller.realResultRows,
            },
            'stock-residual': {
              title: `Stock residuo · ${selectedSeller.name}`,
              note: `Venit teorico progressivo meno Incasso reale progressivo.${stockPeriodNote}`,
              value: selectedSeller.stockResidual,
              tone: 'amber',
              rows: stockResidualRows,
            },
          }
          return sellerMetrics[sellerDetail.metric]
        })()
      : null
  const displayedMetric = selectedSellerMetric ?? selectedMetric

  async function exportDetailExcel() {
    if (!displayedMetric) return
    const XLSX = await import('xlsx')
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(
        displayedMetric.rows.map((row) => ({
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
      `panoramica-${filenamePart(displayedMetric.title)}-${filenamePart(activeCompany?.name ?? '')}-${new Date().toISOString().slice(0, 10)}.xlsx`,
    )
  }

  if (displayedMetric) {
    return (
      <div className="page-stack">
        <header className="page-heading">
          <div>
            <span className="eyebrow">
              {selectedSellerMetric
                ? 'DETTAGLIO VENDITORE'
                : 'DETTAGLIO PANORAMICA'}
            </span>
            <h1>{displayedMetric.title}</h1>
            <p>{displayedMetric.note}</p>
            <div className="detail-heading-actions">
              <button
                className="button button-secondary"
                onClick={() => {
                  setDetail(null)
                  setSellerDetail(null)
                }}
                type="button"
              >
                Torna alla Panoramica
              </button>
              <button
                className="button button-primary"
                onClick={() => void exportDetailExcel()}
                type="button"
              >
                Esporta Excel
              </button>
            </div>
          </div>
        </header>
        <section className="report-kpis">
          <article
            className={`report-card report-${displayedMetric.tone}`}
          >
            <span>{displayedMetric.title}</span>
            <strong>{money(displayedMetric.value)}</strong>
          </article>
          <article className="report-card report-violet">
            <span>Voci nel dettaglio</span>
            <strong>{displayedMetric.rows.length}</strong>
          </article>
        </section>
        {detail === 'withdrawals' && !selectedSellerMetric && (
          <section className="panel">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">FILTRI RITIRI</span>
                <h2>Venditore e periodo</h2>
              </div>
            </div>
            <div className="invoice-filters">
              <select
                aria-label="Filtra Cash ritirato per venditore"
                onChange={(event) =>
                  setWithdrawalFilters((current) => ({
                    ...current,
                    sellerId: event.target.value,
                  }))
                }
                value={withdrawalSellerFilter}
              >
                <option value="">Tutti i venditori</option>
                {accounting.sellers.map((seller) => (
                  <option key={seller.id} value={seller.id}>
                    {seller.name}
                  </option>
                ))}
                {withdrawalRows.some((row) => !row.sellerId) && (
                  <option value="unassigned">Venditore non indicato</option>
                )}
              </select>
              <select
                aria-label="Filtra Cash ritirato per mese"
                onChange={(event) =>
                  setWithdrawalFilters((current) => ({
                    ...current,
                    month: event.target.value,
                  }))
                }
                value={withdrawalMonthFilter}
              >
                <option value="">Tutti i mesi</option>
                {[
                  'Gennaio',
                  'Febbraio',
                  'Marzo',
                  'Aprile',
                  'Maggio',
                  'Giugno',
                  'Luglio',
                  'Agosto',
                  'Settembre',
                  'Ottobre',
                  'Novembre',
                  'Dicembre',
                ].map((month, index) => (
                  <option
                    key={month}
                    value={String(index + 1).padStart(2, '0')}
                  >
                    {month}
                  </option>
                ))}
              </select>
              <select
                aria-label="Filtra Cash ritirato per anno"
                onChange={(event) =>
                  setWithdrawalFilters((current) => ({
                    ...current,
                    year: event.target.value,
                  }))
                }
                value={withdrawalYearFilter}
              >
                <option value="">Tutti gli anni</option>
                {withdrawalYears.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
              <button
                className="button"
                onClick={() =>
                  setWithdrawalFilters(withdrawalFilterDefaults)
                }
                type="button"
              >
                Azzera filtri
              </button>
            </div>
          </section>
        )}
        <section className="panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">COMPOSIZIONE DEL VALORE</span>
              <h2>Dettaglio completo</h2>
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
                {displayedMetric.rows.map((row, index) => (
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
            {displayedMetric.rows.length === 0 && (
              <div className="empty-state compact-empty">
                <strong>Nessun dato registrato</strong>
                <span>La card non contiene ancora voci da mostrare.</span>
              </div>
            )}
          </div>
        </section>
      </div>
    )
  }

  if (selectedStore) {
    const openMetric = (metric: SellerMetricKey) =>
      setSellerDetail({ sellerId: selectedStore.seller.id, metric })
    return (
      <div className="page-stack">
        <header className="page-heading">
          <div>
            <span className="eyebrow">DETTAGLIO PUNTO VENDITA</span>
            <h1>{selectedStore.store.name}</h1>
            <p>
              {selectedStore.store.city || 'Città non indicata'} · Venditrice{' '}
              {selectedStore.seller.name}
            </p>
          </div>
          <button
            className="button button-secondary"
            onClick={() => setStoreDetailId(null)}
            type="button"
          >
            Torna alla Panoramica
          </button>
        </header>
        <section className="stats-grid dashboard-stats-grid">
          <StatCard
            detail={`${selectedStore.seller.invoices.length} fatture assegnate`}
            label="Fatture"
            onClick={() => openMetric('invoices')}
            tone="cyan"
            value={money(selectedStore.seller.invoiceValue)}
          />
          <StatCard
            detail="Fatture − Venit ceduto; acquisito già compreso"
            label="Venit teorico"
            onClick={() => openMetric('theoretical')}
            tone="violet"
            value={money(selectedStore.seller.theoretical)}
          />
          <StatCard
            detail={`Progressivo fino al ${sellerStockEnd}`}
            label="Stock residuo"
            onClick={() => openMetric('stock-residual')}
            tone="amber"
            value={money(selectedStore.seller.stockResidual)}
          />
          <StatCard
            detail={`${selectedStore.seller.takings.length} incassi registrati`}
            label="Incasso reale"
            onClick={() => openMetric('real')}
            tone="cyan"
            value={money(selectedStore.seller.real)}
          />
          <StatCard
            detail="Contanti registrati"
            label="Cash"
            onClick={() => openMetric('cash')}
            tone="green"
            value={money(selectedStore.seller.cash)}
          />
          <StatCard
            detail="Pagamenti elettronici"
            label="POS"
            onClick={() => openMetric('pos')}
            tone="green"
            value={money(selectedStore.seller.pos)}
          />
          <StatCard
            detail="Cash già ritirato dal punto"
            label="Cash ritirato"
            onClick={() => openMetric('withdrawals')}
            tone="violet"
            value={money(selectedStore.seller.withdrawals)}
          />
          <StatCard
            detail="Cash disponibile dopo uscite e ritiri"
            label="Cash in mano"
            onClick={() => openMetric('cash-residual')}
            tone="green"
            value={money(selectedStore.seller.cashResidual)}
          />
          <StatCard
            detail="Acquisti pagati dalla cassa senza fattura"
            label="Merce senza fattura"
            onClick={() => openMetric('unregistered-goods')}
            tone="red"
            value={money(selectedStore.seller.unregisteredGoods)}
          />
          <StatCard
            detail="IVA inclusa negli incassi registrati"
            label="IVA incassi"
            onClick={() => openMetric('vat')}
            tone="amber"
            value={money(selectedStore.seller.vat)}
          />
          <StatCard
            detail="Già conteggiato nel Venit principale"
            label="Venit acquisito dall'altro"
            onClick={() => openMetric('revenue-acquired')}
            tone="green"
            value={money(selectedStore.seller.revenueAcquired)}
          />
          <StatCard
            detail="Venit ceduto e tolto dallo Stock residuo"
            label="Venit ceduto all'altro"
            onClick={() => openMetric('revenue-ceded')}
            tone="red"
            value={money(-selectedStore.seller.revenueCeded)}
          />
        </section>
      </div>
    )
  }

  return (
    <div className="page-stack">
      <header className="page-heading">
        <div>
          <span className="eyebrow">PANORAMICA AZIENDA</span>
          <h1>Controllo operativo</h1>
          <p>
            Dati complessivi e situazione dei venditori di{' '}
            {activeCompany?.name ?? "dell'azienda selezionata"}.
          </p>
        </div>
        <div className="dashboard-heading-actions">
          <button
            className="dashboard-annual-traffic"
            onClick={() => setDetail('annual-real-balance')}
            type="button"
          >
            <TrafficLight size="large" tone={annualBalanceTone} />
            <span>
              Bilancio {economicMode === 'month' ? 'mensile' : 'annuale'}
              <strong>{annualBalanceStatus}</strong>
            </span>
          </button>
          <button className="button button-primary" type="button">
            Apri documenti in arrivo
          </button>
        </div>
      </header>

      <section className="panel dashboard-economic-period">
        <div className="dashboard-economic-period-heading">
          <div>
            <span className="eyebrow">SITUAZIONE ECONOMICA GENERALE</span>
            <h2>{economicPeriodLabel}</h2>
            <p>
              Il filtro aggiorna tutte le card sottostanti. Lo Stock residuo
              include anche il residuo precedente.
            </p>
          </div>
          <div className="dashboard-economic-period-controls">
            <label>
              Vista
              <select
                onChange={(event) =>
                  setEconomicFilters((current) => ({
                    ...current,
                    mode: event.target.value,
                  }))
                }
                value={economicMode}
              >
                <option value="year">Annuale maturata</option>
                <option value="month">Singolo mese</option>
              </select>
            </label>
            {economicMode === 'month' ? (
              <label>
                Mese
                <input
                  max={currentMonth}
                  onChange={(event) =>
                    setEconomicFilters((current) => ({
                      ...current,
                      month: event.target.value || currentMonth,
                    }))
                  }
                  type="month"
                  value={economicMonth}
                />
              </label>
            ) : (
              <label>
                Anno
                <select
                  onChange={(event) =>
                    setEconomicFilters((current) => ({
                      ...current,
                      year: event.target.value,
                    }))
                  }
                  value={economicYear}
                >
                  {economicYears.map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        </div>
      </section>

      <section className="stats-grid dashboard-stats-grid">
        <StatCard
          detail={`${annualInvoices.length} documenti nel periodo`}
          label="Fatture ricevute"
          onClick={() => setDetail('invoices')}
          tone="cyan"
          value={money(economicInvoiceValue)}
        />
        <StatCard
          detail="Acconti e saldi registrati nel periodo"
          label="Fatture pagate"
          onClick={() => setDetail('paid-invoices')}
          tone="green"
          value={money(economicPaidInvoiceValue)}
        />
        <StatCard
          detail={
            economicMode === 'month'
              ? 'Compresi i residui dei mesi precedenti'
              : 'Compresi i residui degli anni precedenti'
          }
          label="Residuo da pagare"
          onClick={() => setDetail('remaining-invoices')}
          tone="amber"
          value={money(economicRemainingInvoices)}
        />
        <StatCard
          detail={
            economicMode === 'month'
              ? 'Progressiva fino alla fine del mese'
              : 'Progressiva fino alla fine dell’anno'
          }
          label="IVA acquisti"
          onClick={() => setDetail('input-vat')}
          tone="cyan"
          value={money(economicInputVat)}
        />
        <StatCard
          detail={
            economicMode === 'month'
              ? 'Progressiva fino alla fine del mese'
              : 'Progressiva fino alla fine dell’anno'
          }
          label="IVA incassi"
          onClick={() => setDetail('output-vat')}
          tone="amber"
          value={money(economicOutputVat)}
        />
        <StatCard
          detail={
            economicVatBalance > 0
              ? 'IVA incassi superiore all’IVA acquisti'
              : economicVatBalance < 0
                ? 'IVA acquisti superiore all’IVA incassi'
                : 'IVA acquisti e incassi in equilibrio'
          }
          label={
            economicVatBalance > 0
              ? 'IVA: a debito'
              : economicVatBalance < 0
                ? 'IVA: a credito'
                : 'IVA: in pareggio'
          }
          onClick={() => setDetail('vat-balance')}
          tone={
            economicVatBalance > 0
              ? 'red'
              : economicVatBalance < 0
                ? 'green'
                : 'cyan'
          }
          value={money(Math.abs(economicVatBalance))}
        />
        <StatCard
          detail="Contanti registrati nel periodo"
          label="Cash"
          onClick={() => setDetail('cash')}
          tone="green"
          value={money(economicCash)}
        />
        <StatCard
          detail="Pagamenti elettronici del periodo"
          label="POS"
          onClick={() => setDetail('pos')}
          tone="green"
          value={money(economicPos)}
        />
        <StatCard
          detail="Cash + POS del periodo, IVA già compresa"
          label="Incasso registrato"
          onClick={() => setDetail('official')}
          tone="green"
          value={money(economicOfficial)}
        />
        <StatCard
          detail="Totale effettivamente incassato nel periodo"
          label="Incasso reale"
          onClick={() => setDetail('real')}
          tone="cyan"
          value={money(annualReal)}
        />
        <StatCard
          detail="Cash prelevato nel periodo"
          label="Cash ritirato"
          onClick={() => setDetail('withdrawals')}
          tone="violet"
          value={money(economicWithdrawals)}
        />
        <StatCard
          detail="Spesa senza fattura registrata nel periodo"
          label="Merce senza fattura"
          onClick={() => setDetail('unregistered-goods')}
          tone="red"
          value={money(economicUnregisteredGoods)}
        />
        <StatCard
          detail="Valori del solo periodo selezionato"
          label="Cash residuo"
          onClick={() => setDetail('cash-residual')}
          tone="green"
          value={money(economicCashResidual)}
        />
        <StatCard
          detail="Vendita teorica degli acquisti del periodo"
          label="Venit complessivo"
          onClick={() => setDetail('theoretical')}
          tone="cyan"
          value={money(annualTheoretical)}
        />
        <StatCard
          detail="Residuo precedente + movimenti del periodo"
          label="Venit stock"
          onClick={() => setDetail('stock')}
          tone="amber"
          value={money(annualStock)}
        />
        <StatCard
          detail="Fatture e spese maturate nel periodo"
          label="Costi complessivi"
          onClick={() => setDetail('costs')}
          tone="amber"
          value={money(economicTotalCosts)}
        />
        <StatCard
          detail="Incasso reale meno i costi del periodo"
          label="Risultato reale"
          onClick={() => setDetail('real-result')}
          tone={annualRealBalance >= 0 ? 'green' : 'red'}
          value={money(annualRealBalance)}
        />
      </section>

      <section className="panel cash-withdrawal-overview">
        <div className="panel-heading cash-withdrawal-overview-heading">
          <div>
            <span className="eyebrow">CASH RITIRATO</span>
            <h2>Riepilogo per giorno o periodo</h2>
            <p>
              Totale complessivo e importo ritirato da ogni venditore.
            </p>
          </div>
          <div className="cash-withdrawal-overview-controls">
            <div
              aria-label="Seleziona un periodo rapido"
              className="cash-withdrawal-period-buttons"
              role="group"
            >
              <button
                className={
                  cashWithdrawalFilters.startDate === currentDate &&
                  cashWithdrawalFilters.endDate === currentDate
                    ? 'is-active'
                    : ''
                }
                onClick={() =>
                  setCashWithdrawalFilters({
                    startDate: currentDate,
                    endDate: currentDate,
                  })
                }
                type="button"
              >
                Oggi
              </button>
              <button
                className={
                  cashWithdrawalFilters.startDate === currentWeekStart &&
                  cashWithdrawalFilters.endDate === currentDate
                    ? 'is-active'
                    : ''
                }
                onClick={() =>
                  setCashWithdrawalFilters({
                    startDate: currentWeekStart,
                    endDate: currentDate,
                  })
                }
                type="button"
              >
                Questa settimana
              </button>
              <button
                className={
                  !cashWithdrawalFilters.startDate &&
                  !cashWithdrawalFilters.endDate
                    ? 'is-active'
                    : ''
                }
                onClick={() =>
                  setCashWithdrawalFilters({
                    startDate: '',
                    endDate: '',
                  })
                }
                type="button"
              >
                Tutto
              </button>
            </div>
            <div className="cash-withdrawal-date-range">
              <label>
                <span>Da</span>
                <input
                  aria-label="Data iniziale Cash ritirato"
                  onBlur={() =>
                    setCashWithdrawalFilters((current) =>
                      isCompleteDashboardDate(current.startDate) &&
                      isCompleteDashboardDate(current.endDate) &&
                      current.endDate < current.startDate
                        ? {
                            startDate: current.startDate,
                            endDate: current.startDate,
                          }
                        : current,
                    )
                  }
                  onChange={(event) =>
                    setCashWithdrawalFilters((current) => ({
                      ...current,
                      startDate: event.target.value,
                    }))
                  }
                  type="date"
                  value={cashWithdrawalFilters.startDate}
                />
              </label>
              <label>
                <span>A</span>
                <input
                  aria-label="Data finale Cash ritirato"
                  onBlur={() =>
                    setCashWithdrawalFilters((current) =>
                      isCompleteDashboardDate(current.startDate) &&
                      isCompleteDashboardDate(current.endDate) &&
                      current.startDate > current.endDate
                        ? {
                            startDate: current.endDate,
                            endDate: current.endDate,
                          }
                        : current,
                    )
                  }
                  onChange={(event) =>
                    setCashWithdrawalFilters((current) => ({
                      ...current,
                      endDate: event.target.value,
                    }))
                  }
                  type="date"
                  value={cashWithdrawalFilters.endDate}
                />
              </label>
            </div>
          </div>
        </div>
        <div className="cash-withdrawal-period-summary">
          <span>Periodo: {cashWithdrawalPeriodLabel}</span>
          <strong>
            {cashWithdrawalTakings.length}{' '}
            {cashWithdrawalTakings.length === 1 ? 'ritiro' : 'ritiri'}
          </strong>
        </div>
        <div className="stats-grid cash-withdrawal-overview-grid">
          <StatCard
            detail={`Somma del periodo · ${cashWithdrawalTakings.length} ${
              cashWithdrawalTakings.length === 1 ? 'movimento' : 'movimenti'
            }`}
            label="Totale Cash ritirato"
            tone="violet"
            value={money(cashWithdrawalTotal)}
          />
          <StatCard
            detail="Somma progressiva del Cash in mano attuale di tutti i punti vendita"
            label="Cash in mano attuale"
            tone="green"
            value={money(currentCashInHandTotal)}
          />
          {cashWithdrawalSellerTotals.map((seller) => (
            <StatCard
              detail={`${seller.entries} ${
                seller.entries === 1 ? 'ritiro' : 'ritiri'
              } nel periodo`}
              key={seller.id}
              label={seller.name}
              tone="cyan"
              value={money(seller.total)}
            />
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">DETTAGLIO VENDITORI</span>
            <h2>Situazione separata per venditore</h2>
          </div>
          <div className="dashboard-seller-heading-controls">
            <label className="dashboard-seller-date-filter">
              <span>Periodo</span>
              <select
                onChange={(event) =>
                  setSellerPeriodMode(
                    event.target.value === 'month' ? 'month' : 'annual',
                  )
                }
                value={sellerPeriodMode}
              >
                <option value="annual">Annuale / fino alla data</option>
                <option value="month">Mensile</option>
              </select>
            </label>
            {sellerPeriodMode === 'month' ? (
              <label className="dashboard-seller-date-filter">
                <span>Mese</span>
                <input
                  max={currentMonth}
                  onChange={(event) => setSellerMonth(event.target.value)}
                  type="month"
                  value={selectedSellerMonth}
                />
              </label>
            ) : (
              <label className="dashboard-seller-date-filter">
                <span>Situazione al (data compresa)</span>
                <input
                  max={currentDate}
                  type="date"
                  value={sellerAsOfDate}
                  onChange={(event) => setSellerAsOfDate(event.target.value)}
                />
              </label>
            )}
            {sellerPeriodMode === 'annual' && sellerAsOfDate && (
              <button
                className="text-button"
                onClick={() => setSellerAsOfDate('')}
                type="button"
              >
                Tutto lo storico
              </button>
            )}
            <span className="count-pill">{sellerSummaries.length}</span>
          </div>
        </div>
        {sellerSummaries.length === 0 ? (
          <div className="empty-state compact-empty">
            <strong>Nessun venditore configurato</strong>
            <span>Gli incassi non assegnati compariranno qui.</span>
          </div>
        ) : (
          <div className="dashboard-seller-grid">
            {sellerSummaries.map((seller) => (
              <article className="dashboard-seller-card" key={seller.id}>
                <div className="dashboard-seller-heading">
                  <span className="store-avatar">
                    {seller.name.slice(0, 2).toUpperCase()}
                  </span>
                  <div>
                    <span className="eyebrow">VENDITORE</span>
                    <h3>{seller.name}</h3>
                  </div>
                </div>
                <div className="dashboard-seller-metrics">
                  <button
                    onClick={() =>
                      setSellerDetail({
                        sellerId: seller.id,
                        metric: 'invoices',
                      })
                    }
                    type="button"
                  >
                    <span>Fatture assegnate</span>
                    <strong>{money(seller.invoiceValue)}</strong>
                    <em>Apri dettaglio</em>
                  </button>
                  <button
                    onClick={() =>
                      setSellerDetail({
                        sellerId: seller.id,
                        metric: 'theoretical',
                      })
                    }
                    type="button"
                  >
                    <span>Venit teorico</span>
                    <strong>{money(seller.theoretical)}</strong>
                    <em>Apri dettaglio</em>
                  </button>
                  <button
                    onClick={() =>
                      setSellerDetail({ sellerId: seller.id, metric: 'cash' })
                    }
                    type="button"
                  >
                    <span>Cash</span>
                    <strong>{money(seller.cash)}</strong>
                    <em>Apri dettaglio</em>
                  </button>
                  <button
                    onClick={() =>
                      setSellerDetail({ sellerId: seller.id, metric: 'pos' })
                    }
                    type="button"
                  >
                    <span>POS</span>
                    <strong>{money(seller.pos)}</strong>
                    <em>Apri dettaglio</em>
                  </button>
                  <button
                    onClick={() =>
                      setSellerDetail({
                        sellerId: seller.id,
                        metric: 'official',
                      })
                    }
                    type="button"
                  >
                    <span>Incasso registrato</span>
                    <strong>{money(seller.official)}</strong>
                    <em>Apri dettaglio</em>
                  </button>
                  <button
                    onClick={() =>
                      setSellerDetail({ sellerId: seller.id, metric: 'real' })
                    }
                    type="button"
                  >
                    <span>Incasso reale</span>
                    <strong>{money(seller.real)}</strong>
                    <em>Apri dettaglio</em>
                  </button>
                  <button
                    onClick={() =>
                      setSellerDetail({ sellerId: seller.id, metric: 'vat' })
                    }
                    type="button"
                  >
                    <span>IVA inclusa</span>
                    <strong>{money(seller.vat)}</strong>
                    <em>Apri dettaglio</em>
                  </button>
                  <button
                    className="seller-cash-metric"
                    onClick={() =>
                      setSellerDetail({
                        sellerId: seller.id,
                        metric: 'unregistered-goods',
                      })
                    }
                    type="button"
                  >
                    <span>Merce senza fattura</span>
                    <strong>{money(seller.unregisteredGoods)}</strong>
                    <em>Apri dettaglio</em>
                  </button>
                  <button
                    className="seller-stock-residual"
                    onClick={() =>
                      setSellerDetail({
                        sellerId: seller.id,
                        metric: 'stock-residual',
                      })
                    }
                    type="button"
                  >
                    <span>Stock residuo</span>
                    <strong>{money(seller.stockResidual)}</strong>
                    <em>Apri dettaglio</em>
                  </button>
                  <button
                    className="seller-revenue-acquired"
                    onClick={() =>
                      setSellerDetail({
                        sellerId: seller.id,
                        metric: 'revenue-acquired',
                      })
                    }
                    type="button"
                  >
                    <span>Venit acquisito dall'altro</span>
                    <strong>{money(seller.revenueAcquired)}</strong>
                    <em>Già conteggiato nel Venit principale</em>
                  </button>
                  <button
                    className="seller-revenue-ceded"
                    onClick={() =>
                      setSellerDetail({
                        sellerId: seller.id,
                        metric: 'revenue-ceded',
                      })
                    }
                    type="button"
                  >
                    <span>Venit ceduto all'altro</span>
                    <strong>{money(-seller.revenueCeded)}</strong>
                    <em>Tolto dallo Stock residuo</em>
                  </button>
                  <button
                    className={
                      seller.realResult >= 0
                        ? 'seller-real-result metric-positive'
                        : 'seller-real-result metric-negative'
                    }
                    onClick={() =>
                      setSellerDetail({
                        sellerId: seller.id,
                        metric: 'real-result',
                      })
                    }
                    type="button"
                  >
                    <span>Risultato reale</span>
                    <strong>{money(seller.realResult)}</strong>
                    <em>Costi maturati del mese</em>
                  </button>
                  <button
                    className="seller-cash-metric seller-cash-withdrawn seller-final-cash"
                    onClick={() =>
                      setSellerDetail({
                        sellerId: seller.id,
                        metric: 'withdrawals',
                      })
                    }
                    type="button"
                  >
                    <span>Cash ritirato</span>
                    <strong>{money(seller.withdrawals)}</strong>
                    <em>Apri dettaglio</em>
                  </button>
                  <button
                    className="seller-cash-metric seller-cash-residual seller-final-cash"
                    onClick={() =>
                      setSellerDetail({
                        sellerId: seller.id,
                        metric: 'cash-residual',
                      })
                    }
                    type="button"
                  >
                    <span>Cash in mano attuale</span>
                    <strong>{money(seller.cashResidual)}</strong>
                    <em>Apri dettaglio</em>
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="dashboard-grid">
        <article className="panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">PUNTI VENDITA</span>
              <h2>Situazione per punto</h2>
            </div>
            <span className="count-pill">{storeSummaries.length}</span>
          </div>
          {storeSummaries.length === 0 ? (
            <div className="empty-state compact-empty">
              <strong>Nessun punto vendita configurato</strong>
              <span>Aggiungi il primo punto dalla sezione dedicata.</span>
            </div>
          ) : (
            <div className="store-summary-list">
              {storeSummaries.map(({ store, seller }) => (
                <button
                  className="store-summary store-summary-button"
                  key={store.id}
                  onClick={() => setStoreDetailId(store.id)}
                  type="button"
                >
                  <span className="store-avatar">
                    {store.name.slice(0, 2).toUpperCase()}
                  </span>
                  <span>
                    <strong>{store.name}</strong>
                    <small>
                      {store.city || 'Città non indicata'} · {seller.name}
                    </small>
                  </span>
                  <span className="store-summary-values">
                    <strong>{money(seller.real)}</strong>
                    <small>Incasso reale</small>
                    <em>
                      Venit {money(seller.theoretical)} · Stock{' '}
                      {money(seller.stockResidual)}
                    </em>
                  </span>
                </button>
              ))}
            </div>
          )}
        </article>

        <article className="panel review-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">CONTROLLO</span>
              <h2>Da verificare</h2>
            </div>
          </div>
          <div className="review-metrics">
            <div>
              <strong>{review.pending}</strong>
              <span>Documenti da revisionare</span>
            </div>
            <div>
              <strong>{review.unrecognized}</strong>
              <span>Foto non riconosciute</span>
            </div>
            <div>
              <strong>{review.possibleDuplicates}</strong>
              <span>Possibili duplicati</span>
            </div>
          </div>
        </article>
      </section>
    </div>
  )
}
