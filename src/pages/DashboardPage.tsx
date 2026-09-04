import { useState } from 'react'
import { StatCard } from '../components/StatCard'
import {
  activeAccounting,
  invoiceRemaining,
  money,
  officialTaking,
  realTaking,
} from '../domain/accounting'
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
  | 'cash-residual'
  | 'theoretical'
  | 'stock'
  | 'costs'
  | 'real-result'

type SellerMetricKey =
  | 'invoices'
  | 'theoretical'
  | 'cash'
  | 'pos'
  | 'official'
  | 'real'
  | 'vat'
  | 'withdrawals'
  | 'cash-residual'
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

export function DashboardPage() {
  const { state } = useAppStore()
  const [detail, setDetail] = useState<DashboardMetricKey | null>(null)
  const [sellerDetail, setSellerDetail] =
    useState<SellerMetricDetail | null>(null)
  const [sellerAsOfDate, setSellerAsOfDate] = useState('')
  const [withdrawalSellerFilter, setWithdrawalSellerFilter] = useState('')
  const [withdrawalMonthFilter, setWithdrawalMonthFilter] = useState('')
  const [withdrawalYearFilter, setWithdrawalYearFilter] = useState('')
  const { review } = state
  const companyId = state.accounting.activeCompanyId
  const activeCompany = state.accounting.companies.find(
    (company) => company.id === companyId,
  )
  const accounting = activeAccounting(state.accounting)
  const stores = state.stores.filter((store) => store.companyId === companyId)
  const invoiceValue = accounting.invoices.reduce(
    (sum, invoice) => sum + invoice.total,
    0,
  )
  const paidInvoices = accounting.invoices.reduce(
    (sum, invoice) =>
      sum + (invoice.settled ? invoice.total : invoice.paidAmount),
    0,
  )
  const remainingInvoices = accounting.invoices.reduce(
    (sum, invoice) => sum + invoiceRemaining(invoice),
    0,
  )
  const inputVat =
    accounting.invoices.reduce((sum, invoice) => sum + invoice.vat, 0) +
    accounting.rentals.reduce((sum, rental) => sum + rental.vat, 0) +
    accounting.accountantInvoices.reduce(
      (sum, invoice) => sum + invoice.vat,
      0,
    )
  const outputVat = accounting.takings.reduce(
    (sum, taking) => sum + taking.vat,
    0,
  )
  const vatBalance = outputVat - inputVat
  const cash = accounting.takings.reduce(
    (sum, taking) => sum + taking.cash,
    0,
  )
  const pos = accounting.takings.reduce(
    (sum, taking) => sum + taking.pos,
    0,
  )
  const withdrawals = accounting.takings.reduce(
    (sum, taking) => sum + taking.withdrawal,
    0,
  )
  const official = accounting.takings.reduce(
    (sum, taking) => sum + officialTaking(taking),
    0,
  )
  const real = accounting.takings.reduce(
    (sum, taking) => sum + realTaking(taking),
    0,
  )
  const cashResidual = Math.max(0, real - pos - withdrawals)
  const theoretical = accounting.invoices.reduce(
    (sum, invoice) => sum + invoice.theoreticalRevenue,
    0,
  )
  const rents = accounting.rentals.reduce(
    (sum, rental) => sum + rental.total,
    0,
  )
  const accountantCosts = accounting.accountantInvoices.reduce(
    (sum, invoice) => sum + invoice.total,
    0,
  )
  const otherExpenses = accounting.expenses.reduce(
    (sum, expense) => sum + expense.amount,
    0,
  )
  const totalCosts = invoiceValue + rents + accountantCosts + otherExpenses
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
  const remainingInvoiceRows: DashboardDetailRow[] = accounting.invoices
    .map((invoice) => ({
      date: invoice.dueDate || invoice.date,
      category: 'Residuo fattura',
      description: invoice.supplierName || 'Fornitore non indicato',
      reference: `Fattura ${invoice.number || 'senza numero'} · scadenza ${invoice.dueDate || 'non indicata'}`,
      amount: invoiceRemaining(invoice),
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
  const rawCashResidual = real - pos - withdrawals
  const cashResidualRows: DashboardDetailRow[] = [
    {
      date: '',
      category: 'Incasso reale',
      description: 'Totale effettivamente incassato',
      reference: 'Valore di partenza',
      amount: real,
    },
    {
      date: '',
      category: 'POS',
      description: 'Pagamenti elettronici',
      reference: 'Importo sottratto',
      amount: -pos,
    },
    {
      date: '',
      category: 'Cash ritirato',
      description: 'Contanti già ritirati',
      reference: 'Importo sottratto',
      amount: -withdrawals,
    },
    ...(rawCashResidual < 0
      ? [
          {
            date: '',
            category: 'Limite minimo',
            description: 'Il cash residuo non può essere negativo',
            reference: 'Adeguamento a zero',
            amount: -rawCashResidual,
          },
        ]
      : []),
  ]
  const theoreticalRows: DashboardDetailRow[] = accounting.invoices
    .map((invoice) => ({
      date: invoice.date,
      category: 'Venit teorico',
      description: invoice.supplierName || 'Fornitore non indicato',
      reference: `Fattura ${invoice.number || 'senza numero'} · ${invoice.sellerName || 'Venditore non indicato'}`,
      amount: invoice.theoreticalRevenue,
    }))
    .filter((row) => row.amount !== 0)
  const rentalRows: DashboardDetailRow[] = accounting.rentals.map(
    (rental) => ({
      date: rental.date,
      category: 'Affitto',
      description: rental.property || 'Immobile non indicato',
      reference: rental.period || 'Periodo non indicato',
      amount: rental.total,
    }),
  )
  const accountantRows: DashboardDetailRow[] =
    accounting.accountantInvoices.map((invoice) => ({
      date: invoice.date,
      category: 'Contabile',
      description: invoice.description || 'Fattura contabile',
      reference: `Fattura ${invoice.number || 'senza numero'}`,
      amount: invoice.total,
    }))
  const expenseRows: DashboardDetailRow[] = accounting.expenses.map(
    (expense) => ({
      date: expense.date,
      category: 'Spesa',
      description: expense.description || expense.type,
      reference: expense.sellerName || expense.notes || 'Spesa aziendale',
      amount: expense.amount,
    }),
  )
  const costRows = [
    ...invoiceRows,
    ...rentalRows,
    ...accountantRows,
    ...expenseRows,
  ]
  const negativeCostRows = costRows.map((row) => ({
    ...row,
    amount: -row.amount,
  }))
  const metrics: Record<DashboardMetricKey, DashboardMetric> = {
    invoices: {
      title: 'Fatture ricevute',
      note: 'Totale delle fatture fornitori registrate per l’azienda.',
      value: invoiceValue,
      tone: 'cyan',
      rows: invoiceRows,
    },
    'paid-invoices': {
      title: 'Fatture pagate',
      note: 'Acconti e saldi registrati sulle fatture fornitori.',
      value: paidInvoices,
      tone: 'green',
      rows: paidInvoiceRows,
    },
    'remaining-invoices': {
      title: 'Residuo da pagare',
      note: 'Importi ancora dovuti ai fornitori.',
      value: remainingInvoices,
      tone: 'amber',
      rows: remainingInvoiceRows,
    },
    'input-vat': {
      title: 'IVA acquisti',
      note: 'IVA registrata su fatture fornitori, affitti e contabile.',
      value: inputVat,
      tone: 'cyan',
      rows: inputVatRows,
    },
    'output-vat': {
      title: 'IVA incassi',
      note: 'IVA già inclusa negli importi Cash + POS.',
      value: outputVat,
      tone: 'amber',
      rows: outputVatRows,
    },
    'vat-balance': {
      title:
        vatBalance > 0
          ? 'IVA: a debito'
          : vatBalance < 0
            ? 'IVA: a credito'
            : 'IVA: in pareggio',
      note: 'Differenza tra IVA incassi e IVA acquisti.',
      value: Math.abs(vatBalance),
      tone: vatBalance > 0 ? 'red' : vatBalance < 0 ? 'green' : 'cyan',
      rows: [
        ...outputVatRows,
        ...inputVatRows.map((row) => ({ ...row, amount: -row.amount })),
      ],
    },
    cash: {
      title: 'Cash',
      note: 'Contanti registrati negli incassi.',
      value: cash,
      tone: 'green',
      rows: cashRows,
    },
    pos: {
      title: 'POS',
      note: 'Pagamenti elettronici registrati negli incassi.',
      value: pos,
      tone: 'green',
      rows: posRows,
    },
    official: {
      title: 'Incasso registrato',
      note: 'Somma di Cash e POS, con IVA già compresa.',
      value: official,
      tone: 'green',
      rows: officialRows,
    },
    real: {
      title: 'Incasso reale',
      note: 'Totale effettivamente incassato, autonomo dal fiscale.',
      value: real,
      tone: 'cyan',
      rows: realRows,
    },
    withdrawals: {
      title: 'Cash ritirato',
      note: 'Contanti ritirati dai venditori e dai punti vendita.',
      value: withdrawals,
      tone: 'violet',
      rows: withdrawalRows,
    },
    'cash-residual': {
      title: 'Cash residuo',
      note: 'Incasso reale meno POS e Cash ritirato.',
      value: cashResidual,
      tone: 'green',
      rows: cashResidualRows,
    },
    theoretical: {
      title: 'Venit complessivo',
      note: 'Vendita teorica dei prodotti acquistati.',
      value: theoretical,
      tone: 'cyan',
      rows: theoreticalRows,
    },
    stock: {
      title: 'Venit stock',
      note: 'Venit teorico meno incasso reale.',
      value: theoretical - real,
      tone: 'amber',
      rows: [
        ...theoreticalRows,
        ...realRows.map((row) => ({ ...row, amount: -row.amount })),
      ],
    },
    costs: {
      title: 'Costi complessivi',
      note: 'Fatture fornitori, affitti, contabile e altre spese.',
      value: totalCosts,
      tone: 'amber',
      rows: costRows,
    },
    'real-result': {
      title: 'Risultato reale',
      note: 'Incasso reale meno tutti i costi registrati.',
      value: real - totalCosts,
      tone: real - totalCosts >= 0 ? 'green' : 'red',
      rows: [...realRows, ...negativeCostRows],
    },
  }
  const sellerInvoices = accounting.invoices.filter(
    (invoice) => !sellerAsOfDate || invoice.date <= sellerAsOfDate,
  )
  const sellerTakings = accounting.takings.filter(
    (taking) => !sellerAsOfDate || taking.date <= sellerAsOfDate,
  )
  const knownSellerIds = new Set(accounting.sellers.map((seller) => seller.id))
  const sellerSummaries = accounting.sellers.map((seller) => {
    const invoices = sellerInvoices.filter(
      (invoice) => invoice.sellerId === seller.id,
    )
    const takings = sellerTakings.filter(
      (taking) => taking.sellerId === seller.id,
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
    const sellerTheoretical = invoices.reduce(
      (sum, invoice) => sum + invoice.theoreticalRevenue,
      0,
    )
    return {
      id: seller.id,
      name: seller.name,
      invoices,
      takings,
      invoiceValue: invoices.reduce(
        (sum, invoice) => sum + invoice.total,
        0,
      ),
      cash: takings.reduce((sum, taking) => sum + taking.cash, 0),
      pos: sellerPos,
      withdrawals: sellerWithdrawals,
      cashResidual: Math.max(0, sellerReal - sellerPos - sellerWithdrawals),
      official: sellerOfficial,
      real: sellerReal,
      vat: takings.reduce((sum, taking) => sum + taking.vat, 0),
      theoretical: sellerTheoretical,
      stockResidual: sellerTheoretical - sellerReal,
    }
  })
  const unassignedInvoices = sellerInvoices.filter(
    (invoice) => !invoice.sellerId || !knownSellerIds.has(invoice.sellerId),
  )
  const unassignedTakings = sellerTakings.filter(
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
    const unassignedTheoretical = unassignedInvoices.reduce(
      (sum, invoice) => sum + invoice.theoreticalRevenue,
      0,
    )
    sellerSummaries.push({
      id: 'unassigned',
      name: 'Non assegnato',
      invoices: unassignedInvoices,
      takings: unassignedTakings,
      invoiceValue: unassignedInvoices.reduce(
        (sum, invoice) => sum + invoice.total,
        0,
      ),
      cash: unassignedTakings.reduce((sum, taking) => sum + taking.cash, 0),
      pos: unassignedPos,
      withdrawals: unassignedWithdrawals,
      cashResidual: Math.max(
        0,
        unassignedReal - unassignedPos - unassignedWithdrawals,
      ),
      official: unassignedOfficial,
      real: unassignedReal,
      vat: unassignedTakings.reduce((sum, taking) => sum + taking.vat, 0),
      theoretical: unassignedTheoretical,
      stockResidual: unassignedTheoretical - unassignedReal,
    })
  }

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
          const theoreticalRows = selectedSeller.invoices
            .map((invoice) => ({
              date: invoice.date,
              category: 'Venit teorico',
              description: invoice.supplierName || 'Fornitore non indicato',
              reference: `Fattura ${invoice.number || 'senza numero'}`,
              amount: invoice.theoreticalRevenue,
            }))
            .filter((row) => row.amount !== 0)
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
          const rawCashResidual =
            selectedSeller.real -
            selectedSeller.pos -
            selectedSeller.withdrawals
          const cashResidualRows: DashboardDetailRow[] = [
            {
              date: '',
              category: 'Incasso reale',
              description: selectedSeller.name,
              reference: 'Valore di partenza',
              amount: selectedSeller.real,
            },
            {
              date: '',
              category: 'POS',
              description: selectedSeller.name,
              reference: 'Importo sottratto',
              amount: -selectedSeller.pos,
            },
            {
              date: '',
              category: 'Cash ritirato',
              description: selectedSeller.name,
              reference: 'Importo sottratto',
              amount: -selectedSeller.withdrawals,
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
          const stockResidualRows = [
            ...theoreticalRows,
            ...realRows.map((row) => ({ ...row, amount: -row.amount })),
          ]
          const periodNote = sellerAsOfDate
            ? ` Dati fino al ${sellerAsOfDate}, data compresa.`
            : ' Tutto lo storico disponibile.'
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
              note: `Venit delle fatture attribuite al venditore.${periodNote}`,
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
            'cash-residual': {
              title: `Cash in mano attuale · ${selectedSeller.name}`,
              note: `Incasso reale meno POS e Cash ritirato.${periodNote}`,
              value: selectedSeller.cashResidual,
              tone: 'green',
              rows: cashResidualRows,
            },
            'stock-residual': {
              title: `Stock residuo · ${selectedSeller.name}`,
              note: `Venit teorico meno Incasso reale.${periodNote}`,
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
                  setWithdrawalSellerFilter(event.target.value)
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
                  setWithdrawalMonthFilter(event.target.value)
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
                  setWithdrawalYearFilter(event.target.value)
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
                onClick={() => {
                  setWithdrawalSellerFilter('')
                  setWithdrawalMonthFilter('')
                  setWithdrawalYearFilter('')
                }}
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
        <button className="button button-primary" type="button">
          Apri documenti in arrivo
        </button>
      </header>

      <section className="stats-grid dashboard-stats-grid">
        <StatCard
          detail={`${accounting.invoices.length} documenti registrati`}
          label="Fatture ricevute"
          onClick={() => setDetail('invoices')}
          tone="cyan"
          value={money(invoiceValue)}
        />
        <StatCard
          detail="Acconti e saldi registrati"
          label="Fatture pagate"
          onClick={() => setDetail('paid-invoices')}
          tone="green"
          value={money(paidInvoices)}
        />
        <StatCard
          detail="Importo ancora dovuto ai fornitori"
          label="Residuo da pagare"
          onClick={() => setDetail('remaining-invoices')}
          tone="amber"
          value={money(remainingInvoices)}
        />
        <StatCard
          detail="Su fatture, affitti e contabile"
          label="IVA acquisti"
          onClick={() => setDetail('input-vat')}
          tone="cyan"
          value={money(inputVat)}
        />
        <StatCard
          detail="Già inclusa negli importi Cash + POS"
          label="IVA incassi"
          onClick={() => setDetail('output-vat')}
          tone="amber"
          value={money(outputVat)}
        />
        <StatCard
          detail={
            vatBalance > 0
              ? 'IVA incassi superiore all’IVA acquisti'
              : vatBalance < 0
                ? 'IVA acquisti superiore all’IVA incassi'
                : 'IVA acquisti e incassi in equilibrio'
          }
          label={
            vatBalance > 0
              ? 'IVA: a debito'
              : vatBalance < 0
                ? 'IVA: a credito'
                : 'IVA: in pareggio'
          }
          onClick={() => setDetail('vat-balance')}
          tone={vatBalance > 0 ? 'red' : vatBalance < 0 ? 'green' : 'cyan'}
          value={money(Math.abs(vatBalance))}
        />
        <StatCard
          detail="Contanti registrati negli incassi"
          label="Cash"
          onClick={() => setDetail('cash')}
          tone="green"
          value={money(cash)}
        />
        <StatCard
          detail="Pagamenti elettronici registrati"
          label="POS"
          onClick={() => setDetail('pos')}
          tone="green"
          value={money(pos)}
        />
        <StatCard
          detail="Cash + POS, IVA già compresa"
          label="Incasso registrato"
          onClick={() => setDetail('official')}
          tone="green"
          value={money(official)}
        />
        <StatCard
          detail="Totale effettivamente incassato"
          label="Incasso reale"
          onClick={() => setDetail('real')}
          tone="cyan"
          value={money(real)}
        />
        <StatCard
          detail="Cash prelevato dai punti vendita"
          label="Cash ritirato"
          onClick={() => setDetail('withdrawals')}
          tone="violet"
          value={money(withdrawals)}
        />
        <StatCard
          detail="Incasso reale − POS − Cash ritirato"
          label="Cash residuo"
          onClick={() => setDetail('cash-residual')}
          tone="green"
          value={money(cashResidual)}
        />
        <StatCard
          detail="Vendita teorica dei prodotti acquistati"
          label="Venit complessivo"
          onClick={() => setDetail('theoretical')}
          tone="cyan"
          value={money(theoretical)}
        />
        <StatCard
          detail="Venit teorico meno incasso reale"
          label="Venit stock"
          onClick={() => setDetail('stock')}
          tone="amber"
          value={money(theoretical - real)}
        />
        <StatCard
          detail="Fatture, affitti, contabile e spese registrate"
          label="Costi complessivi"
          onClick={() => setDetail('costs')}
          tone="amber"
          value={money(totalCosts)}
        />
        <StatCard
          detail="Incasso reale meno i costi registrati"
          label="Risultato reale"
          onClick={() => setDetail('real-result')}
          tone={real - totalCosts >= 0 ? 'green' : 'red'}
          value={money(real - totalCosts)}
        />
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">DETTAGLIO VENDITORI</span>
            <h2>Situazione separata per venditore</h2>
          </div>
          <div className="dashboard-seller-heading-controls">
            <label className="dashboard-seller-date-filter">
              <span>Situazione al (data compresa)</span>
              <input
                type="date"
                value={sellerAsOfDate}
                onChange={(event) => setSellerAsOfDate(event.target.value)}
              />
            </label>
            {sellerAsOfDate && (
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
                    className="seller-cash-metric seller-cash-withdrawn"
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
                    className="seller-cash-metric seller-cash-residual"
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
            <span className="count-pill">{stores.length}</span>
          </div>
          {stores.length === 0 ? (
            <div className="empty-state compact-empty">
              <strong>Nessun punto vendita configurato</strong>
              <span>Aggiungi il primo punto dalla sezione dedicata.</span>
            </div>
          ) : (
            <div className="store-summary-list">
              {stores.map((store) => {
                const linkedSeller = state.sellers.find(
                  (item) => item.id === store.sellerId,
                )
                const accountingSellerId =
                  linkedSeller?.accountingSellerId || store.sellerId
                const seller = accounting.sellers.find(
                  (item) => item.id === accountingSellerId,
                )
                const storeTakings = accounting.takings.filter(
                  (taking) => taking.sellerId === accountingSellerId,
                )
                return (
                  <div className="store-summary" key={store.id}>
                    <span className="store-avatar">
                      {store.name.slice(0, 2).toUpperCase()}
                    </span>
                    <span>
                      <strong>{store.name}</strong>
                      <small>
                        {store.city || 'Città non indicata'} ·{' '}
                        {seller?.name ?? 'Venditrice non assegnata'}
                      </small>
                    </span>
                    <span className="store-value">
                      {money(
                        storeTakings.reduce(
                          (sum, taking) => sum + realTaking(taking),
                          0,
                        ),
                      )}
                    </span>
                  </div>
                )
              })}
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
