import { StatCard } from '../components/StatCard'
import { money } from '../domain/accounting'
import { useAppStore } from '../store/AppStoreContext'

export function DashboardPage() {
  const { state } = useAppStore()
  const { financial, review } = state
  const companyId = state.accounting.activeCompanyId
  const activeCompany = state.accounting.companies.find(
    (company) => company.id === companyId,
  )
  const stores = state.stores.filter((store) => store.companyId === companyId)
  const sellers = state.sellers.filter(
    (seller) => seller.companyId === companyId,
  )

  return (
    <div className="page-stack">
      <header className="page-heading">
        <div>
          <span className="eyebrow">PANORAMICA AZIENDA</span>
          <h1>Controllo operativo</h1>
          <p>
            Dati e situazione dei punti vendita di{' '}
            {activeCompany?.name ?? "dell'azienda selezionata"}.
          </p>
        </div>
        <button className="button button-primary" type="button">
          Apri documenti in arrivo
        </button>
      </header>

      <section className="stats-grid">
        <StatCard
          detail="Fatture approvate"
          label="Valore fatture"
          tone="violet"
          value={money(financial.invoiceValue)}
        />
        <StatCard
          detail="Vendita teorica prodotti"
          label="Venit complessivo"
          tone="cyan"
          value={money(financial.theoreticalRevenue)}
        />
        <StatCard
          detail="Cash + POS + reale"
          label="Incassi reali"
          tone="green"
          value={money(financial.realTakings)}
        />
        <StatCard
          detail="Venit meno incassi reali"
          label="Venit stock"
          tone="amber"
          value={money(financial.stockRevenue)}
        />
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
                const seller = sellers.find(
                  (item) => item.id === store.sellerId,
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
                    <span className="store-value">{money(0)}</span>
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
