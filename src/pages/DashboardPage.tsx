import { StatCard } from '../components/StatCard'
import {
  activeAccounting,
  invoiceRemaining,
  money,
  officialTaking,
  realTaking,
} from '../domain/accounting'
import { useAppStore } from '../store/AppStoreContext'

export function DashboardPage() {
  const { state } = useAppStore()
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
  const totalTakings = official + real
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
  const knownSellerIds = new Set(accounting.sellers.map((seller) => seller.id))
  const sellerSummaries = accounting.sellers.map((seller) => {
    const invoices = accounting.invoices.filter(
      (invoice) => invoice.sellerId === seller.id,
    )
    const takings = accounting.takings.filter(
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
    const sellerTheoretical = invoices.reduce(
      (sum, invoice) => sum + invoice.theoreticalRevenue,
      0,
    )
    return {
      id: seller.id,
      name: seller.name,
      invoiceValue: invoices.reduce(
        (sum, invoice) => sum + invoice.total,
        0,
      ),
      cash: takings.reduce((sum, taking) => sum + taking.cash, 0),
      pos: takings.reduce((sum, taking) => sum + taking.pos, 0),
      official: sellerOfficial,
      real: sellerReal,
      vat: takings.reduce((sum, taking) => sum + taking.vat, 0),
      theoretical: sellerTheoretical,
      stock: sellerTheoretical - sellerOfficial - sellerReal,
    }
  })
  const unassignedInvoices = accounting.invoices.filter(
    (invoice) => !invoice.sellerId || !knownSellerIds.has(invoice.sellerId),
  )
  const unassignedTakings = accounting.takings.filter(
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
    const unassignedTheoretical = unassignedInvoices.reduce(
      (sum, invoice) => sum + invoice.theoreticalRevenue,
      0,
    )
    sellerSummaries.push({
      id: 'unassigned',
      name: 'Non assegnato',
      invoiceValue: unassignedInvoices.reduce(
        (sum, invoice) => sum + invoice.total,
        0,
      ),
      cash: unassignedTakings.reduce((sum, taking) => sum + taking.cash, 0),
      pos: unassignedTakings.reduce((sum, taking) => sum + taking.pos, 0),
      official: unassignedOfficial,
      real: unassignedReal,
      vat: unassignedTakings.reduce((sum, taking) => sum + taking.vat, 0),
      theoretical: unassignedTheoretical,
      stock: unassignedTheoretical - unassignedOfficial - unassignedReal,
    })
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

      <section className="stats-grid">
        <StatCard
          detail={`${accounting.invoices.length} documenti registrati`}
          label="Fatture ricevute"
          tone="cyan"
          value={money(invoiceValue)}
        />
        <StatCard
          detail="Acconti e saldi registrati"
          label="Fatture pagate"
          tone="green"
          value={money(paidInvoices)}
        />
        <StatCard
          detail="Importo ancora dovuto ai fornitori"
          label="Residuo da pagare"
          tone="amber"
          value={money(remainingInvoices)}
        />
        <StatCard
          detail="Su fatture, affitti e contabile"
          label="IVA acquisti"
          tone="cyan"
          value={money(inputVat)}
        />
        <StatCard
          detail="Già inclusa negli importi Cash + POS"
          label="IVA incassi"
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
          tone={vatBalance > 0 ? 'red' : vatBalance < 0 ? 'green' : 'cyan'}
          value={money(Math.abs(vatBalance))}
        />
        <StatCard
          detail="Contanti registrati negli incassi"
          label="Cash"
          tone="green"
          value={money(cash)}
        />
        <StatCard
          detail="Pagamenti elettronici registrati"
          label="POS"
          tone="green"
          value={money(pos)}
        />
        <StatCard
          detail="Cash + POS, IVA già compresa"
          label="Incasso registrato"
          tone="green"
          value={money(official)}
        />
        <StatCard
          detail="Importo non dichiarato inserito manualmente"
          label="Incasso reale"
          tone="cyan"
          value={money(real)}
        />
        <StatCard
          detail="Cash + POS + incasso reale"
          label="Totale incassi"
          tone="violet"
          value={money(totalTakings)}
        />
        <StatCard
          detail="Cash prelevato dai punti vendita"
          label="Cash ritirato"
          tone="violet"
          value={money(withdrawals)}
        />
        <StatCard
          detail="Vendita teorica dei prodotti acquistati"
          label="Venit complessivo"
          tone="cyan"
          value={money(theoretical)}
        />
        <StatCard
          detail="Venit teorico meno tutti gli incassi"
          label="Venit stock"
          tone="amber"
          value={money(theoretical - totalTakings)}
        />
        <StatCard
          detail="Fatture, affitti, contabile e spese registrate"
          label="Costi complessivi"
          tone="amber"
          value={money(totalCosts)}
        />
        <StatCard
          detail="Tutti gli incassi meno i costi registrati"
          label="Risultato reale"
          tone={totalTakings - totalCosts >= 0 ? 'green' : 'red'}
          value={money(totalTakings - totalCosts)}
        />
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">DETTAGLIO VENDITORI</span>
            <h2>Situazione separata per venditore</h2>
          </div>
          <span className="count-pill">{sellerSummaries.length}</span>
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
                  <div>
                    <span>Fatture assegnate</span>
                    <strong>{money(seller.invoiceValue)}</strong>
                  </div>
                  <div>
                    <span>Venit teorico</span>
                    <strong>{money(seller.theoretical)}</strong>
                  </div>
                  <div>
                    <span>Cash</span>
                    <strong>{money(seller.cash)}</strong>
                  </div>
                  <div>
                    <span>POS</span>
                    <strong>{money(seller.pos)}</strong>
                  </div>
                  <div>
                    <span>Incasso registrato</span>
                    <strong>{money(seller.official)}</strong>
                  </div>
                  <div>
                    <span>Incasso reale</span>
                    <strong>{money(seller.real)}</strong>
                  </div>
                  <div>
                    <span>IVA inclusa</span>
                    <strong>{money(seller.vat)}</strong>
                  </div>
                  <div>
                    <span>Totale incassi</span>
                    <strong>{money(seller.official + seller.real)}</strong>
                  </div>
                  <div>
                    <span>Venit stock</span>
                    <strong>{money(seller.stock)}</strong>
                  </div>
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
                const seller = accounting.sellers.find(
                  (item) => item.id === store.sellerId,
                )
                const storeTakings = accounting.takings.filter(
                  (taking) => taking.sellerId === store.sellerId,
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
