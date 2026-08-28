import { useRef, useState, type ChangeEvent } from 'react'
import type { Locale } from '../domain/types'
import { CloudIcon, DeviceIcon } from '../components/Icons'
import { useAppStore } from '../store/AppStoreContext'

function download(content: BlobPart, type: string, filename: string) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

function csvCell(value: string | number) {
  return `"${String(value).replaceAll('"', '""')}"`
}

export function SettingsPage() {
  const {
    state,
    cloudAvailable,
    updateCompany,
    setDataMode,
    setDriveBackup,
    setDriveFolder,
    setImageRetention,
    setLanguage,
    updateAccounting,
    importLegacyData,
    exportUnifiedData,
    exportLegacyData,
  } = useAppStore()
  const { company, dataSettings } = state
  const [importMessage, setImportMessage] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const accountingCompany =
    state.accounting.companies.find(
      (item) => item.id === state.accounting.activeCompanyId,
    ) ?? null

  async function importJson(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    const result = importLegacyData(await file.text())
    setImportMessage(
      result.ok
        ? 'Dati di Contabilità Pro importati correttamente.'
        : result.error ?? 'Importazione fallita.',
    )
    event.target.value = ''
  }

  function exportCsv() {
    const lines = [
      ['TIPO', 'DATA', 'NUMERO', 'NOME', 'IMPONIBILE', 'IVA', 'TOTALE', 'VENIT'],
      ...state.accounting.invoices.map((invoice) => [
        'FATTURA',
        invoice.date,
        invoice.number,
        invoice.supplierName,
        invoice.taxableAmount,
        invoice.vat,
        invoice.total,
        invoice.theoreticalRevenue,
      ]),
      ...state.accounting.takings.map((taking) => [
        'INCASSO',
        taking.date,
        '',
        taking.sellerName,
        '',
        taking.vat,
        taking.cash + taking.pos,
        taking.realTotal,
      ]),
    ]
    download(
      `\uFEFF${lines.map((row) => row.map(csvCell).join(';')).join('\n')}`,
      'text/csv;charset=utf-8',
      `fatture-incassi-${new Date().toISOString().slice(0, 10)}.csv`,
    )
  }

  async function exportExcel() {
    const XLSX = await import('xlsx')
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(
        state.accounting.invoices.map((invoice) => ({
          Data: invoice.date,
          Numero: invoice.number,
          Fornitore: invoice.supplierName,
          Venditore: invoice.sellerName,
          Imponibile: invoice.taxableAmount,
          IVA: invoice.vat,
          Totale: invoice.total,
          Venit: invoice.theoreticalRevenue,
          Pagata: invoice.settled ? 'Sì' : 'No',
          Residuo: Math.max(0, invoice.total - invoice.paidAmount),
        })),
      ),
      'Fatture',
    )
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(
        state.accounting.takings.map((taking) => ({
          Data: taking.date,
          Venditore: taking.sellerName,
          Cash: taking.cash,
          POS: taking.pos,
          Ritiro: taking.withdrawal,
          IVA: taking.vat,
          Reale: taking.realTotal,
        })),
      ),
      'Incassi',
    )
    XLSX.writeFile(
      workbook,
      `fatture-incassi-${new Date().toISOString().slice(0, 10)}.xlsx`,
    )
  }

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
                onChange={(event) => {
                  const language = event.target.value as Locale
                  updateCompany({ locale: language })
                  setLanguage(language)
                }}
                value={dataSettings.language}
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
            Cartella Google Drive
            <input
              onChange={(event) => setDriveFolder(event.target.value)}
              placeholder="URL della cartella oppure Folder ID"
              value={dataSettings.driveFolder}
            />
          </label>
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
            Il percorso è salvato; il caricamento automatico richiederà
            l'autorizzazione Google Drive del servizio di backup.
          </p>
        </article>

        <article className="panel integration-guide">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">FOTO AUTOMATICHE</span>
              <h2>WhatsApp e Viber</h2>
            </div>
          </div>
          <div className="integration-steps">
            <div>
              <strong>WhatsApp Business Cloud API</strong>
              <small>
                Crea l'app Meta, collega numero business e webhook HTTPS,
                quindi abilita i messaggi. Il numero mittente identifica
                automaticamente ragazza, bar e azienda.
              </small>
              <a href="https://developers.facebook.com/docs/whatsapp/cloud-api/get-started/" rel="noreferrer" target="_blank">Configurazione ufficiale Meta</a>
            </div>
            <div>
              <strong>Viber Bot</strong>
              <small>
                Richiede un bot commerciale, token e webhook HTTPS. Viber
                comunica un ID utente, quindi la ragazza viene collegata al
                primo messaggio tramite abbinamento amministrativo.
              </small>
              <a href="https://developers.viber.com/docs/api/rest-bot-api/" rel="noreferrer" target="_blank">Configurazione ufficiale Viber</a>
            </div>
          </div>
          <p className="settings-note">
            Token e credenziali resteranno nel backend protetto, mai nel file
            JSON o nell'applicazione.
          </p>
        </article>

        <article className="panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">CONTABILITÀ PRO</span>
              <h2>Importazione e compatibilità</h2>
            </div>
          </div>
          <p className="settings-note">
            Importa il backup JSON v5 della vecchia applicazione senza
            cancellare fatture, incassi, aziende, fornitori o pagamenti.
          </p>
          <input
            accept="application/json,.json"
            className="visually-hidden"
            onChange={(event) => void importJson(event)}
            ref={fileInput}
            type="file"
          />
          <div className="backup-actions">
            <button
              className="button button-primary"
              onClick={() => fileInput.current?.click()}
              type="button"
            >
              Importa JSON Contabilità Pro
            </button>
            <button
              className="button button-secondary"
              onClick={() =>
                download(
                  exportLegacyData(),
                  'application/json',
                  'contabilita-pro-backup-v5.json',
                )
              }
              type="button"
            >
              Esporta JSON compatibile
            </button>
          </div>
          {importMessage && <p className="import-message">{importMessage}</p>}
        </article>

        <article className="panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">BACKUP COMPLETO</span>
              <h2>Esporta archivio e report</h2>
            </div>
          </div>
          <div className="backup-actions">
            <button
              className="button button-primary"
              onClick={() =>
                download(
                  exportUnifiedData(),
                  'application/json',
                  'fatture-incassi-pro-backup.json',
                )
              }
              type="button"
            >
              Backup JSON completo
            </button>
            <button
              className="button button-secondary"
              onClick={() => void exportExcel()}
              type="button"
            >
              Esporta Excel
            </button>
            <button
              className="button button-secondary"
              onClick={exportCsv}
              type="button"
            >
              Esporta CSV
            </button>
            <button
              className="button button-secondary"
              onClick={() => window.print()}
              type="button"
            >
              Stampa / salva PDF
            </button>
          </div>
        </article>

        {accountingCompany && (
          <article className="panel">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">PRONOSTICO</span>
                <h2>Parametri azienda attiva</h2>
              </div>
            </div>
            <div className="form-stack">
              <label>
                Città
                <input
                  value={accountingCompany.city}
                  onChange={(event) =>
                    updateAccounting((current) => ({
                      ...current,
                      companies: current.companies.map((item) =>
                        item.id === accountingCompany.id
                          ? { ...item, city: event.target.value }
                          : item,
                      ),
                    }))
                  }
                />
              </label>
              <label>
                Data fine stagione
                <input
                  type="date"
                  value={accountingCompany.seasonEndDate ?? ''}
                  onChange={(event) =>
                    updateAccounting((current) => ({
                      ...current,
                      companies: current.companies.map((item) =>
                        item.id === accountingCompany.id
                          ? {
                              ...item,
                              seasonEndDate: event.target.value || null,
                            }
                          : item,
                      ),
                    }))
                  }
                />
              </label>
            </div>
          </article>
        )}
      </section>
    </div>
  )
}
