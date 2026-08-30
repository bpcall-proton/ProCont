import { useMemo, useState } from 'react'
import { invoiceDueState, invoiceRemaining, money } from '../domain/accounting'
import { useAppStore } from '../store/AppStoreContext'

type PaymentFilter = 'paid' | 'partial' | 'all'

export function PaidInvoicesPage() {
  const { state, setActiveAccountingCompany } = useAppStore()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<PaymentFilter>('paid')
  const [supplierFilter, setSupplierFilter] = useState('')
  const [sellerFilter, setSellerFilter] = useState('')
  const [monthFilter, setMonthFilter] = useState('')
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const companyId = state.accounting.activeCompanyId
  const suppliers = state.accounting.suppliers.filter(
    (supplier) => supplier.companyId === companyId,
  )
  const sellers = state.accounting.sellers.filter(
    (seller) => seller.companyId === companyId,
  )

  const invoices = useMemo(
    () =>
      state.accounting.invoices
        .filter((invoice) => invoice.companyId === companyId)
        .filter((invoice) =>
          filter === 'paid'
            ? invoice.settled
            : filter === 'partial'
              ? !invoice.settled && invoice.paidAmount > 0
              : invoice.settled || invoice.paidAmount > 0,
        )
        .filter(
          (invoice) =>
            !normalizedQuery ||
            invoice.number.toLocaleLowerCase().includes(normalizedQuery) ||
            invoice.supplierName
              .toLocaleLowerCase()
              .includes(normalizedQuery) ||
            invoice.description
              .toLocaleLowerCase()
              .includes(normalizedQuery),
        )
        .filter(
          (invoice) =>
            !supplierFilter || invoice.supplierId === supplierFilter,
        )
        .filter(
          (invoice) => !sellerFilter || invoice.sellerId === sellerFilter,
        )
        .filter((invoice) => {
          if (!monthFilter) return true
          const lastPayment =
            invoice.payments[invoice.payments.length - 1]?.date ??
            invoice.paymentDate ??
            invoice.date
          return lastPayment.slice(0, 7) === monthFilter
        })
        .sort((left, right) =>
          (right.paymentDate ?? right.date).localeCompare(
            left.paymentDate ?? left.date,
          ),
        ),
    [
      companyId,
      filter,
      monthFilter,
      normalizedQuery,
      sellerFilter,
      state.accounting.invoices,
      supplierFilter,
    ],
  )

  return (
    <div className="page-stack">
      <header className="page-heading">
        <div>
          <span className="eyebrow">RICERCA RAPIDA</span>
          <h1>Fatture pagate</h1>
          <p>
            Cerca per fornitore, numero fattura o descrizione e controlla
            acconti, saldo e metodo di pagamento.
          </p>
        </div>
        <div className="report-filter">
          <select
            aria-label="Azienda contabile"
            onChange={(event) => {
              setSupplierFilter('')
              setSellerFilter('')
              setMonthFilter('')
              setActiveAccountingCompany(event.target.value)
            }}
            value={companyId ?? ''}
          >
            {state.accounting.companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name}
              </option>
            ))}
          </select>
          <select
            aria-label="Stato pagamento"
            onChange={(event) =>
              setFilter(event.target.value as PaymentFilter)
            }
            value={filter}
          >
            <option value="paid">Pagate</option>
            <option value="partial">Pagamenti parziali</option>
            <option value="all">Pagate e parziali</option>
          </select>
        </div>
      </header>

      <section className="panel">
        <div className="table-toolbar invoice-search-toolbar">
          <h2>Archivio pagamenti</h2>
          <div className="invoice-filters">
            <input
              aria-label="Cerca fattura o fornitore"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Cerca fornitore o n. fattura"
              type="search"
              value={query}
            />
            <select aria-label="Filtra per fornitore" value={supplierFilter} onChange={(event) => setSupplierFilter(event.target.value)}>
              <option value="">Tutti i fornitori</option>
              {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
            </select>
            <select aria-label="Filtra per venditore" value={sellerFilter} onChange={(event) => setSellerFilter(event.target.value)}>
              <option value="">Tutti i venditori</option>
              {sellers.map((seller) => <option key={seller.id} value={seller.id}>{seller.name}</option>)}
            </select>
            <input aria-label="Filtra per mese pagamento" type="month" value={monthFilter} onChange={(event) => setMonthFilter(event.target.value)} />
          </div>
        </div>
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Fattura</th>
                <th>Fornitore</th>
                <th>Totale</th>
                <th>Pagato / residuo</th>
                <th>Pagamenti</th>
                <th>Stato</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((invoice) => (
                <tr className={`invoice-row ${invoiceDueState(invoice)}`} key={invoice.id}>
                  <td>
                    <strong>{invoice.number || '—'}</strong>
                    <small>{invoice.date}</small>
                  </td>
                  <td>
                    {invoice.supplierName || '—'}
                    <small>{invoice.sellerName || 'Venditore non indicato'} · {invoice.description}</small>
                  </td>
                  <td>{money(invoice.total)}</td>
                  <td>
                    <strong>{money(invoice.paidAmount)}</strong>
                    <small>Residuo {money(invoiceRemaining(invoice))}</small>
                  </td>
                  <td>
                    {invoice.payments.length > 0 ? (
                      invoice.payments.map((payment) => (
                        <small key={payment.id}>
                          {payment.date} · {money(payment.amount)} ·{' '}
                          {payment.method}
                        </small>
                      ))
                    ) : (
                      <small>
                        {invoice.paymentDate ?? invoice.date} ·{' '}
                        {invoice.paymentMethod ?? 'Metodo non indicato'}
                      </small>
                    )}
                  </td>
                  <td>
                    <span
                      className={`record-status ${
                        invoice.settled ? 'paid' : 'open'
                      }`}
                    >
                      {invoice.settled ? 'Pagata' : 'Parziale'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {invoices.length === 0 && (
            <div className="empty-state compact-empty">
              <strong>Nessuna fattura trovata</strong>
              <span>Modifica la ricerca o il filtro dei pagamenti.</span>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
