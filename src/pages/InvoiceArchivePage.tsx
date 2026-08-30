import { InvoicesPanel } from './AccountingPage'
import { useAppStore } from '../store/AppStoreContext'

interface InvoiceArchivePageProps {
  onBack: () => void
}

export function InvoiceArchivePage({ onBack }: InvoiceArchivePageProps) {
  const { state, setActiveAccountingCompany } = useAppStore()

  return (
    <div className="page-stack">
      <header className="page-heading">
        <div>
          <span className="eyebrow">CONSULTAZIONE COMPLETA</span>
          <h1>Archivio fatture</h1>
          <p>
            Scorri, filtra, modifica, registra pagamenti o elimina le fatture
            dell'azienda selezionata.
          </p>
        </div>
        <div className="invoice-archive-actions">
          <select
            aria-label="Azienda archivio fatture"
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

      <InvoicesPanel archiveOnly />
    </div>
  )
}
