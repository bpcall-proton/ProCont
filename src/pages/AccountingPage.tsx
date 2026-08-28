import { useMemo, useState, type FormEvent } from 'react'
import {
  activeAccounting,
  addDays,
  expenseCategories,
  invoiceRemaining,
  money,
  paymentMethods,
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
  PaymentMethod,
  Rental,
} from '../domain/types'
import { useAppStore } from '../store/AppStoreContext'

type Section = 'invoices' | 'takings' | 'contacts' | 'expenses'

function numberValue(value: string) {
  const parsed = Number(value.replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : 0
}

function mutateCompany(
  state: AccountingState,
  updater: (activeId: string) => AccountingState,
) {
  return state.activeCompanyId ? updater(state.activeCompanyId) : state
}

export function AccountingPage() {
  const { state, updateAccounting } = useAppStore()
  const [section, setSection] = useState<Section>('invoices')
  const [companyName, setCompanyName] = useState('')
  const active = activeAccounting(state.accounting)

  function addCompany(event: FormEvent) {
    event.preventDefault()
    const name = companyName.trim()
    if (!name) return
    const id = createId('accounting-company')
    updateAccounting((current) => ({
      ...current,
      companies: [
        ...current.companies,
        {
          id,
          name,
          taxId: '',
          city: '',
          notes: '',
          seasonEndDate: null,
        },
      ],
      activeCompanyId: id,
    }))
    setCompanyName('')
  }

  return (
    <div className="page-stack">
      <header className="page-heading accounting-heading">
        <div>
          <span className="eyebrow">GESTIONE COMPLETA</span>
          <h1>Contabilità manuale</h1>
          <p>
            Tutte le funzioni della precedente Contabilità Pro, nello stesso
            archivio dei documenti automatici.
          </p>
        </div>
        <div className="company-switcher">
          <select
            aria-label="Azienda contabile attiva"
            onChange={(event) =>
              updateAccounting((current) => ({
                ...current,
                activeCompanyId: event.target.value,
              }))
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

      {!active.company ? (
        <div className="panel empty-state">
          <strong>Aggiungi un'azienda contabile</strong>
          <span>Serve per registrare fatture, incassi e spese.</span>
        </div>
      ) : (
        <>
          {section === 'invoices' && <InvoicesPanel />}
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
  total: '',
  date: today(),
  settled: false,
}

function InvoicesPanel() {
  const { state, updateAccounting } = useAppStore()
  const data = activeAccounting(state.accounting)
  const [form, setForm] = useState(emptyInvoice)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'open' | 'paid'>('all')
  const [paymentTarget, setPaymentTarget] =
    useState<AccountingInvoice | null>(null)
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentDate, setPaymentDate] = useState(today())
  const [paymentMethod, setPaymentMethod] =
    useState<PaymentMethod>('Bonifico')
  const [advanceSupplier, setAdvanceSupplier] = useState('')
  const [advanceAmount, setAdvanceAmount] = useState('')

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
        .sort((left, right) => right.date.localeCompare(left.date)),
    [data.invoices, filter],
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

  function submit(event: FormEvent) {
    event.preventDefault()
    updateAccounting((current) =>
      mutateCompany(current, (companyId) => {
        const supplier = data.suppliers.find(
          (item) => item.id === form.supplierId,
        )
        const seller = data.sellers.find((item) => item.id === form.sellerId)
        const previous = current.invoices.find(
          (item) => item.id === editingId,
        )
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
          taxableAmount: numberValue(form.taxableAmount),
          vat: numberValue(form.vat),
          theoreticalRevenue: numberValue(form.theoreticalRevenue),
          total: numberValue(form.total),
          date: form.date,
          dueDate: addDays(form.date, 10),
          settled: form.settled,
          paidAmount: form.settled
            ? numberValue(form.total)
            : previous?.paidAmount ?? 0,
          payments: previous?.payments ?? [],
          paymentDate: form.settled
            ? previous?.paymentDate ?? form.date
            : previous?.paymentDate ?? null,
          paymentMethod: form.settled
            ? previous?.paymentMethod ?? 'Bonifico'
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
    setEditingId(null)
    setForm(emptyInvoice)
  }

  function edit(invoice: AccountingInvoice) {
    setEditingId(invoice.id)
    setForm({
      number: invoice.number,
      supplierId: invoice.supplierId ?? '',
      sellerId: invoice.sellerId ?? '',
      description: invoice.description,
      category: invoice.category,
      taxableAmount: String(invoice.taxableAmount),
      vat: String(invoice.vat),
      theoreticalRevenue: String(invoice.theoreticalRevenue),
      total: String(invoice.total),
      date: invoice.date,
      settled: invoice.settled,
    })
  }

  function remove(id: string) {
    if (!window.confirm('Eliminare questa fattura?')) return
    updateAccounting((current) => ({
      ...current,
      invoices: current.invoices.filter((item) => item.id !== id),
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

  return (
    <>
      <section className="stats-strip">
        <div><span>Totale fatture</span><strong>{money(total)}</strong></div>
        <div><span>Pagato</span><strong>{money(paid)}</strong></div>
        <div><span>Residuo</span><strong>{money(total - paid)}</strong></div>
        <div><span>Venit previsto</span><strong>{money(theoretical)}</strong></div>
      </section>

      <form className="panel accounting-form" onSubmit={submit}>
        <div className="panel-heading">
          <div>
            <span className="eyebrow">INSERIMENTO MANUALE</span>
            <h2>{editingId ? 'Modifica fattura' : 'Nuova fattura'}</h2>
          </div>
        </div>
        <div className="form-grid accounting-fields">
          <label>Numero<input required value={form.number} onChange={(event) => setForm({ ...form, number: event.target.value })} /></label>
          <label>Data<input type="date" required value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} /></label>
          <label>Fornitore<select value={form.supplierId} onChange={(event) => setForm({ ...form, supplierId: event.target.value })}><option value="">Nessuno</option>{data.suppliers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label>Venditore<select value={form.sellerId} onChange={(event) => setForm({ ...form, sellerId: event.target.value })}><option value="">Nessuno</option>{data.sellers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label>Descrizione<input value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
          <label>Categoria<select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>{expenseCategories.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label>Imponibile<input inputMode="decimal" value={form.taxableAmount} onChange={(event) => setForm({ ...form, taxableAmount: event.target.value })} /></label>
          <label>IVA<input inputMode="decimal" value={form.vat} onChange={(event) => setForm({ ...form, vat: event.target.value })} /></label>
          <label>Totale<input inputMode="decimal" required value={form.total} onChange={(event) => setForm({ ...form, total: event.target.value })} /></label>
          <label>Venit previsto<input inputMode="decimal" value={form.theoreticalRevenue} onChange={(event) => setForm({ ...form, theoreticalRevenue: event.target.value })} /></label>
        </div>
        <label className="checkbox-row"><input type="checkbox" checked={form.settled} onChange={(event) => setForm({ ...form, settled: event.target.checked })} /> Già pagata</label>
        <div className="form-actions">
          {editingId && <button className="button button-secondary" type="button" onClick={() => { setEditingId(null); setForm(emptyInvoice) }}>Annulla</button>}
          <button className="button button-primary" type="submit">{editingId ? 'Salva modifiche' : 'Registra fattura'}</button>
        </div>
      </form>

      <form className="panel compact-form" onSubmit={distributeAdvance}>
        <div><strong>Anticipo fornitore a cascata</strong><small>Distribuisce il pagamento dalle fatture più vecchie.</small></div>
        <select required value={advanceSupplier} onChange={(event) => setAdvanceSupplier(event.target.value)}><option value="">Fornitore</option>{data.suppliers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
        <input inputMode="decimal" placeholder="Importo" required value={advanceAmount} onChange={(event) => setAdvanceAmount(event.target.value)} />
        <button className="button button-secondary" type="submit">Distribuisci</button>
      </form>

      <section className="panel">
        <div className="table-toolbar">
          <h2>Archivio fatture</h2>
          <select value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)}>
            <option value="all">Tutte</option>
            <option value="open">Da pagare</option>
            <option value="paid">Pagate</option>
          </select>
        </div>
        <div className="data-table-wrap">
          <table className="data-table">
            <thead><tr><th>Data / N.</th><th>Fornitore</th><th>Totale</th><th>Venit</th><th>Stato</th><th>Azioni</th></tr></thead>
            <tbody>
              {invoices.map((invoice) => (
                <tr key={invoice.id}>
                  <td><strong>{invoice.date}</strong><small>{invoice.number || '—'} · {invoice.category}</small></td>
                  <td>{invoice.supplierName || '—'}<small>{invoice.description}</small></td>
                  <td>{money(invoice.total)}<small>Residuo {money(invoiceRemaining(invoice))}</small></td>
                  <td>{money(invoice.theoreticalRevenue)}</td>
                  <td><span className={`record-status ${invoice.settled ? 'paid' : 'open'}`}>{invoice.settled ? 'Pagata' : 'Da pagare'}</span></td>
                  <td className="row-actions">
                    <button type="button" onClick={() => edit(invoice)}>Modifica</button>
                    {!invoice.settled && <button type="button" onClick={() => { setPaymentTarget(invoice); setPaymentAmount(String(invoiceRemaining(invoice))) }}>Paga</button>}
                    <button className="danger-text" type="button" onClick={() => remove(invoice.id)}>Elimina</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {invoices.length === 0 && <div className="empty-state compact-empty"><strong>Nessuna fattura</strong><span>Usa il modulo sopra per l'inserimento manuale.</span></div>}
        </div>
      </section>

      {paymentTarget && (
        <form className="panel payment-panel" onSubmit={addPayment}>
          <div><strong>Pagamento fattura {paymentTarget.number}</strong><small>Residuo {money(invoiceRemaining(paymentTarget))}</small></div>
          <input inputMode="decimal" required value={paymentAmount} onChange={(event) => setPaymentAmount(event.target.value)} />
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
  withdrawal: '',
  vat: '',
  realTotal: '',
}

function TakingsPanel() {
  const { state, updateAccounting } = useAppStore()
  const data = activeAccounting(state.accounting)
  const [form, setForm] = useState(emptyTaking)
  const [editingId, setEditingId] = useState<string | null>(null)
  const official = data.takings.reduce(
    (sum, item) => sum + item.cash + item.pos,
    0,
  )
  const real = data.takings.reduce(
    (sum, item) =>
      sum + (item.realTotal > 0 ? item.realTotal : item.cash + item.pos),
    0,
  )

  function submit(event: FormEvent) {
    event.preventDefault()
    updateAccounting((current) =>
      mutateCompany(current, (companyId) => {
        const seller = data.sellers.find((item) => item.id === form.sellerId)
        const taking: AccountingTaking = {
          id: editingId ?? createId('taking'),
          companyId,
          date: form.date,
          sellerId: seller?.id ?? null,
          sellerName: seller?.name ?? '',
          cash: numberValue(form.cash),
          pos: numberValue(form.pos),
          withdrawal: numberValue(form.withdrawal),
          vat: numberValue(form.vat),
          realTotal: numberValue(form.realTotal),
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
    setEditingId(null)
    setForm(emptyTaking)
  }

  return (
    <>
      <section className="stats-strip">
        <div><span>Ufficiale</span><strong>{money(official)}</strong></div>
        <div><span>Reale</span><strong>{money(real)}</strong></div>
        <div><span>Di cui non dichiarato</span><strong>{money(Math.max(0, real - official))}</strong></div>
        <div><span>Ritiri cash</span><strong>{money(data.takings.reduce((sum, item) => sum + item.withdrawal, 0))}</strong></div>
      </section>
      <form className="panel accounting-form" onSubmit={submit}>
        <div className="panel-heading"><div><span className="eyebrow">INSERIMENTO MANUALE</span><h2>{editingId ? 'Modifica incasso' : 'Nuovo incasso'}</h2></div></div>
        <div className="form-grid accounting-fields">
          <label>Data<input type="date" required value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} /></label>
          <label>Venditore<select value={form.sellerId} onChange={(event) => setForm({ ...form, sellerId: event.target.value })}><option value="">Nessuno</option>{data.sellers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label>Cash<input inputMode="decimal" value={form.cash} onChange={(event) => setForm({ ...form, cash: event.target.value })} /></label>
          <label>POS<input inputMode="decimal" value={form.pos} onChange={(event) => setForm({ ...form, pos: event.target.value })} /></label>
          <label>Cash ritirato<input inputMode="decimal" value={form.withdrawal} onChange={(event) => setForm({ ...form, withdrawal: event.target.value })} /></label>
          <label>IVA incassi<input inputMode="decimal" value={form.vat} onChange={(event) => setForm({ ...form, vat: event.target.value })} /></label>
          <label>Incasso reale (compreso non dichiarato)<input inputMode="decimal" value={form.realTotal} onChange={(event) => setForm({ ...form, realTotal: event.target.value })} /></label>
        </div>
        <div className="form-actions">
          {editingId && <button className="button button-secondary" type="button" onClick={() => { setEditingId(null); setForm(emptyTaking) }}>Annulla</button>}
          <button className="button button-primary" type="submit">{editingId ? 'Salva modifiche' : 'Registra incasso'}</button>
        </div>
      </form>
      <section className="panel">
        <h2>Storico incassi</h2>
        <div className="data-table-wrap">
          <table className="data-table"><thead><tr><th>Data</th><th>Venditore</th><th>Cash</th><th>POS</th><th>Reale</th><th>Azioni</th></tr></thead>
            <tbody>{data.takings.map((taking) => (
              <tr key={taking.id}><td>{taking.date}</td><td>{taking.sellerName || '—'}</td><td>{money(taking.cash)}</td><td>{money(taking.pos)}</td><td>{money(taking.realTotal > 0 ? taking.realTotal : taking.cash + taking.pos)}</td><td className="row-actions"><button type="button" onClick={() => { setEditingId(taking.id); setForm({ date: taking.date, sellerId: taking.sellerId ?? '', cash: String(taking.cash), pos: String(taking.pos), withdrawal: String(taking.withdrawal), vat: String(taking.vat), realTotal: String(taking.realTotal) }) }}>Modifica</button><button className="danger-text" type="button" onClick={() => updateAccounting((current) => ({ ...current, takings: current.takings.filter((item) => item.id !== taking.id) }))}>Elimina</button></td></tr>
            ))}</tbody>
          </table>
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
          },
          ...current.suppliers,
        ],
      })),
    )
    setSupplierName('')
    setSupplierTaxId('')
  }

  return (
    <section className="contact-columns">
      <article className="panel">
        <div className="panel-heading"><div><span className="eyebrow">ANAGRAFICA</span><h2>Venditori</h2></div><span className="count-pill">{data.sellers.length}</span></div>
        <form className="inline-create-form" onSubmit={addSeller}><input placeholder="Nome venditore" required value={sellerName} onChange={(event) => setSellerName(event.target.value)} /><input placeholder="Telefono" value={sellerPhone} onChange={(event) => setSellerPhone(event.target.value)} /><button className="button button-primary" type="submit">Aggiungi</button></form>
        <div className="record-list">{data.sellers.map((seller) => {
          const takings = data.takings.filter((item) => item.sellerId === seller.id)
          const total = takings.reduce((sum, item) => sum + (item.realTotal > 0 ? item.realTotal : item.cash + item.pos), 0)
          return <div className="record-card" key={seller.id}><span><strong>{seller.name}</strong><small>{seller.phone || 'Nessun telefono'} · {takings.length} incassi</small></span><span><strong>{money(total)}</strong><button className="danger-text" type="button" onClick={() => updateAccounting((current) => ({ ...current, sellers: current.sellers.filter((item) => item.id !== seller.id) }))}>Elimina</button></span></div>
        })}</div>
      </article>
      <article className="panel">
        <div className="panel-heading"><div><span className="eyebrow">ANAGRAFICA</span><h2>Fornitori</h2></div><span className="count-pill">{data.suppliers.length}</span></div>
        <form className="inline-create-form" onSubmit={addSupplier}><input placeholder="Ragione sociale" required value={supplierName} onChange={(event) => setSupplierName(event.target.value)} /><input placeholder="Partita IVA" value={supplierTaxId} onChange={(event) => setSupplierTaxId(event.target.value)} /><button className="button button-primary" type="submit">Aggiungi</button></form>
        <div className="record-list">{data.suppliers.map((supplier) => {
          const invoices = data.invoices.filter((item) => item.supplierId === supplier.id)
          const total = invoices.reduce((sum, item) => sum + item.total, 0)
          return <div className="record-card" key={supplier.id}><span><strong>{supplier.name}</strong><small>{supplier.taxId || 'P.IVA non indicata'} · {invoices.length} fatture</small></span><span><strong>{money(total)}</strong><button className="danger-text" type="button" onClick={() => updateAccounting((current) => ({ ...current, suppliers: current.suppliers.filter((item) => item.id !== supplier.id) }))}>Elimina</button></span></div>
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
  const [rentalProperty, setRentalProperty] = useState('')
  const [rentalTotal, setRentalTotal] = useState('')
  const [accountantDescription, setAccountantDescription] = useState('')
  const [accountantTotal, setAccountantTotal] = useState('')

  function addExpense(event: FormEvent) {
    event.preventDefault()
    updateAccounting((current) =>
      mutateCompany(current, (companyId) => ({
        ...current,
        expenses: [
          {
            id: createId('expense'),
            companyId,
            type: expenseType,
            description: expenseDescription.trim(),
            sellerId: null,
            sellerName: '',
            amount: numberValue(expenseAmount),
            date: today(),
            notes: '',
            settled: false,
          },
          ...current.expenses,
        ],
      })),
    )
    setExpenseDescription('')
    setExpenseAmount('')
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
        <div className="panel-heading"><div><span className="eyebrow">USCITE</span><h2>Stipendi e tasse</h2></div></div>
        <form className="inline-create-form vertical-form" onSubmit={addExpense}>
          <select value={expenseType} onChange={(event) => setExpenseType(event.target.value as AccountingExpense['type'])}><option value="tassa">Tassa</option><option value="stipendio">Stipendio</option><option value="contabile">Costo contabile</option></select>
          <input placeholder="Descrizione" required value={expenseDescription} onChange={(event) => setExpenseDescription(event.target.value)} />
          <input inputMode="decimal" placeholder="Importo" required value={expenseAmount} onChange={(event) => setExpenseAmount(event.target.value)} />
          <button className="button button-primary" type="submit">Registra</button>
        </form>
        <ExpenseList items={data.expenses} onUpdate={(items) => updateAccounting((current) => ({ ...current, expenses: items }))} />
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
  onUpdate,
}: {
  items: AccountingExpense[]
  onUpdate: (items: AccountingExpense[]) => void
}) {
  return <div className="record-list">{items.map((item) => <div className="record-card" key={item.id}><span><strong>{item.description}</strong><small>{item.type} · {item.date}</small></span><span><strong>{money(item.amount)}</strong><button type="button" onClick={() => onUpdate(items.map((current) => current.id === item.id ? { ...current, settled: !current.settled } : current))}>{item.settled ? 'Pagata' : 'Da pagare'}</button><button className="danger-text" type="button" onClick={() => onUpdate(items.filter((current) => current.id !== item.id))}>Elimina</button></span></div>)}</div>
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
