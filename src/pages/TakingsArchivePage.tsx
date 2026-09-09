import { TakingsPanel } from './AccountingPage'
import { useAppStore } from '../store/AppStoreContext'

interface TakingsArchivePageProps {
  onBack: () => void
}

export function TakingsArchivePage({ onBack }: TakingsArchivePageProps) {
  const { state, setActiveAccountingCompany } = useAppStore()

  return (
    <div className="page-stack">
      <header className="page-heading">
        <div>
          <span className="eyebrow">GESTIONE INCASSI</span>
          <h1>Incassi</h1>
          <p>
            Registra un nuovo incasso e consulta lo storico dell'azienda
            selezionata.
          </p>
        </div>
        <div className="invoice-archive-actions">
          <select
            aria-label="Azienda archivio incassi"
            onChange={(event) =>
              setActiveAccountingCompany(event.target.value)
            }
            value={state.accounting.activeCompanyId ?? ''}
          >
            {state.accounting.companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name}
              </option>
            ))}
          </select>
          <button
            className="button button-secondary"
            onClick={onBack}
            type="button"
          >
            Torna a Contabilità
          </button>
        </div>
      </header>

      <TakingsPanel
        compact
        key={state.accounting.activeCompanyId ?? 'no-company'}
      />
    </div>
  )
}
