import type { Locale } from '../domain/types'
import { CloudIcon, DeviceIcon } from '../components/Icons'
import { useAppStore } from '../store/AppStoreContext'

export function SettingsPage() {
  const {
    state,
    cloudAvailable,
    updateCompany,
    setDataMode,
    setDriveBackup,
    setImageRetention,
  } = useAppStore()
  const { company, dataSettings } = state

  return (
    <div className="page-stack">
      <header className="page-heading">
        <div>
          <span className="eyebrow">CONFIGURAZIONE</span>
          <h1>Impostazioni</h1>
          <p>Azienda, archivio, backup e conservazione documenti.</p>
        </div>
      </header>

      <section className="settings-grid">
        <article className="panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">AZIENDA</span>
              <h2>Dati generali</h2>
            </div>
          </div>
          <div className="form-stack">
            <label>
              Ragione sociale
              <input
                onChange={(event) =>
                  updateCompany({ name: event.target.value })
                }
                value={company.name}
              />
            </label>
            <label>
              Partita IVA / Codice fiscale
              <input
                onChange={(event) =>
                  updateCompany({ taxId: event.target.value })
                }
                value={company.taxId}
              />
            </label>
            <label>
              Lingua principale
              <select
                onChange={(event) =>
                  updateCompany({ locale: event.target.value as Locale })
                }
                value={company.locale}
              >
                <option value="it">Italiano</option>
                <option value="ro">Română</option>
                <option value="en">English</option>
              </select>
            </label>
          </div>
        </article>

        <article className="panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">ARCHIVIO</span>
              <h2>Modalità dati</h2>
            </div>
          </div>
          <div className="mode-options">
            <button
              className={`mode-card ${
                dataSettings.mode === 'local' ? 'selected' : ''
              }`}
              onClick={() => void setDataMode('local')}
              type="button"
            >
              <span className="mode-icon">
                <DeviceIcon size={26} />
              </span>
              <strong>Locale</strong>
              <span>Dati principali conservati su questo dispositivo.</span>
            </button>
            <button
              className={`mode-card ${
                dataSettings.mode === 'cloud' ? 'selected' : ''
              }`}
              disabled={!cloudAvailable}
              onClick={() => void setDataMode('cloud')}
              type="button"
            >
              <span className="mode-icon violet-icon">
                <CloudIcon size={26} />
              </span>
              <strong>Cloud</strong>
              <span>Sincronizzazione continua tra web e desktop.</span>
            </button>
          </div>
          {!cloudAvailable && (
            <p className="settings-note">
              Il cloud sarà disponibile dopo la configurazione Firebase e
              l'accesso con un account reale.
            </p>
          )}
        </article>

        <article className="panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">PROTEZIONE</span>
              <h2>Backup e conservazione</h2>
            </div>
          </div>
          <div className="setting-row">
            <span>
              <strong>Backup Google Drive</strong>
              <small>Dopo ogni modifica approvata</small>
            </span>
            <button
              aria-pressed={dataSettings.driveBackupAfterApproval}
              className={`toggle ${
                dataSettings.driveBackupAfterApproval ? 'on' : ''
              }`}
              onClick={() =>
                setDriveBackup(!dataSettings.driveBackupAfterApproval)
              }
              type="button"
            >
              <span />
            </button>
          </div>
          <label>
            Conservazione foto originali
            <select
              onChange={(event) =>
                setImageRetention(
                  event.target.value === 'forever'
                    ? null
                    : Number(event.target.value),
                )
              }
              value={dataSettings.imageRetentionDays ?? 'forever'}
            >
              <option value="forever">Senza scadenza</option>
              <option value="365">1 anno</option>
              <option value="730">2 anni</option>
              <option value="1825">5 anni</option>
              <option value="3650">10 anni</option>
            </select>
          </label>
          <p className="settings-note">
            La preferenza Drive verrà applicata quando collegheremo il servizio
            di backup.
          </p>
        </article>
      </section>
    </div>
  )
}
