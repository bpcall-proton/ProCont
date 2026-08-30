import { useMemo, useState } from 'react'
import { invoiceRemaining, money } from '../domain/accounting'
import { useAppStore } from '../store/AppStoreContext'

type PaymentFilter = 'paid' | 'partial' | 'all'

export function PaidInvoicesPage() {
  const { state, setActiveAccountingCompany } = useAppStore()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<PaymentFilter>('paid')
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const companyId = state.accounting.activeCompanyId

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
        .sort((left, right) =>
          (right.paymentDate ?? right.date).localeCompare(
            left.paymentDate ?? left.date,
          ),
        ),
    [companyId, filter, normalizedQuery, state.accounting.invoices],
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
            onChange={(event) =>
              setActiveAccountingCompany(event.target.value)
            }
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
          <input
            aria-label="Cerca fattura o fornitore"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Cerca fornitore o n. fattura"
            type="search"
            value={query}
          />
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
                <tr key={invoice.id}>
                  <td>
                    <strong>{invoice.number || '—'}</strong>
                    <small>{invoice.date}</small>
                  </td>
                  <td>
                    {invoice.supplierName || '—'}
                    <small>{invoice.description}</small>
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
