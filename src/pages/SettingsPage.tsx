import {
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from 'react'
import type { AccountingCompany, Locale } from '../domain/types'
import { CloudIcon, DeviceIcon } from '../components/Icons'
import {
  DriveRepository,
  type DriveRevisionList,
} from '../data/driveRepository'
import {
  createDrivePairing,
  disconnectDriveSession,
  driveServiceConfigured,
  readDrivePairing,
  type DrivePairing,
} from '../data/driveSession'
import {
  useAppStore,
  type AccountingCompanyInput,
} from '../store/AppStoreContext'

const emptyCompany: AccountingCompanyInput = {
  name: '',
  taxId: '',
  city: '',
  notes: '',
  seasonEndDate: null,
}

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

function filenamePart(value: string) {
  return (
    value
      .trim()
      .toLocaleLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'azienda'
  )
}

function CompanyEditor({
  company,
  onSave,
}: {
  company: AccountingCompany
  onSave: (
    companyId: string,
    input: AccountingCompanyInput,
  ) => { ok: boolean; error?: string }
}) {
  const [form, setForm] = useState<AccountingCompanyInput>({
    name: company.name,
    taxId: company.taxId,
    city: company.city,
    notes: company.notes,
    seasonEndDate: company.seasonEndDate,
  })
  const [message, setMessage] = useState<string | null>(null)

  function submit(event: FormEvent) {
    event.preventDefault()
    const result = onSave(company.id, form)
    setMessage(result.ok ? 'Dati aziendali aggiornati.' : result.error ?? null)
  }

  return (
    <form className="form-stack company-editor" onSubmit={submit}>
      <div className="form-grid">
        <label>
          Ragione sociale
          <input
            onChange={(event) =>
              setForm((current) => ({ ...current, name: event.target.value }))
            }
            required
            value={form.name}
          />
        </label>
        <label>
          Partita IVA / Codice fiscale
          <input
            onChange={(event) =>
              setForm((current) => ({ ...current, taxId: event.target.value }))
            }
            value={form.taxId}
          />
        </label>
        <label>
          Città
          <input
            onChange={(event) =>
              setForm((current) => ({ ...current, city: event.target.value }))
            }
            value={form.city}
          />
        </label>
        <label>
          Data fine stagione
          <input
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                seasonEndDate: event.target.value || null,
              }))
            }
            type="date"
            value={form.seasonEndDate ?? ''}
          />
        </label>
      </div>
      <label>
        Note
        <textarea
          onChange={(event) =>
            setForm((current) => ({ ...current, notes: event.target.value }))
          }
          rows={3}
          value={form.notes}
        />
      </label>
      <button className="button button-primary" type="submit">
        Salva azienda
      </button>
      {message && <p className="import-message">{message}</p>}
    </form>
  )
}

export function SettingsPage() {
  const {
    state,
    cloudAvailable,
    driveAccountEmail,
    driveSyncMessage,
    localStoragePaths,
    refreshDriveConnection,
    syncMessage,
    syncState,
    updateCompany,
    setActiveAccountingCompany,
    addAccountingCompany,
    updateAccountingCompany,
    setDataMode,
    setDriveBackup,
    selectDriveFolder,
    syncDriveBackup,
    setCurrency,
    setImageRetention,
    setLanguage,
    importLegacyData,
    exportUnifiedData,
    exportLegacyData,
  } = useAppStore()
  const { dataSettings } = state
  const [importMessage, setImportMessage] = useState<string | null>(null)
  const [newCompany, setNewCompany] =
    useState<AccountingCompanyInput>(emptyCompany)
  const [companyMessage, setCompanyMessage] = useState<string | null>(null)
  const [googleMessage, setGoogleMessage] = useState<string | null>(null)
  const [googleBusy, setGoogleBusy] = useState(false)
  const [cloudRevisionBusy, setCloudRevisionBusy] = useState(false)
  const [cloudRevisionMessage, setCloudRevisionMessage] = useState<
    string | null
  >(null)
  const [cloudRevisionCompanyId, setCloudRevisionCompanyId] = useState<
    string | null
  >(null)
  const [cloudRevisions, setCloudRevisions] =
    useState<DriveRevisionList | null>(null)
  const [drivePairing, setDrivePairing] = useState<DrivePairing | null>(null)
  const [driveFolderConfirmation, setDriveFolderConfirmation] = useState<
    'warning' | 'final' | null
  >(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const accountingCompany =
    state.accounting.companies.find(
      (item) => item.id === state.accounting.activeCompanyId,
    ) ?? null
  const companyId = accountingCompany?.id
  const companyFilename = filenamePart(accountingCompany?.name ?? '')
  const invoices = state.accounting.invoices.filter(
    (invoice) => invoice.companyId === companyId,
  )
  const takings = state.accounting.takings.filter(
    (taking) => taking.companyId === companyId,
  )
  const products = state.accounting.products.filter(
    (product) => product.companyId === companyId,
  )
  const driveFolderIsUrl = /^https?:\/\//i.test(
    dataSettings.driveFolder.trim(),
  )
  const driveFolderConfigured =
    dataSettings.driveFolder.trim().length > 0 && !driveFolderIsUrl
  const cloudStatusClass =
    !cloudAvailable || syncState === 'error'
      ? 'drive-status-denied'
      : dataSettings.mode === 'cloud' && syncState !== 'saving'
        ? 'drive-status-ok'
        : 'drive-status-pending'
  const cloudStatusLabel = !cloudAvailable
    ? 'Non collegato'
    : syncState === 'error'
      ? 'Errore di sincronizzazione'
      : dataSettings.mode !== 'cloud'
        ? 'Pronto, modalità locale'
        : syncState === 'saving'
          ? 'Sincronizzazione in corso'
          : 'Sincronizzato'

  function requestDriveFolderChange() {
    if (driveFolderConfigured) {
      setDriveFolderConfirmation('warning')
      return
    }
    void selectDriveFolder()
  }

  async function confirmDriveFolderChange() {
    setDriveFolderConfirmation(null)
    await selectDriveFolder()
  }

  async function prepareGoogleConnection() {
    setGoogleBusy(true)
    setGoogleMessage(null)
    try {
      const device = window.desktopApp
        ? `Computer ${window.desktopApp.platform}`
        : /Android/i.test(navigator.userAgent)
          ? 'Android'
          : /iPad|iPhone/i.test(navigator.userAgent)
            ? 'iPhone o iPad'
            : 'Browser web'
      setDrivePairing(await createDrivePairing(device))
      setGoogleMessage(
        'Apri Google, autorizza Drive e lascia aperta questa schermata.',
      )
    } catch (error) {
      setGoogleMessage(
        error instanceof Error
          ? error.message
          : 'Preparazione accesso Google non riuscita',
      )
    }
    setGoogleBusy(false)
  }

  async function waitForGoogleConnection() {
    if (!drivePairing) return
    setGoogleBusy(true)
    try {
      while (Date.now() / 1000 < drivePairing.expiresAt) {
        const session = await readDrivePairing(drivePairing.pairingId)
        if (session) {
          refreshDriveConnection()
          setDrivePairing(null)
          setGoogleMessage(
            `${session.email} collegato. Sincronizzazione Drive attiva.`,
          )
          if (dataSettings.mode !== 'cloud') {
            await setDataMode('cloud')
          }
          return
        }
        await new Promise((resolve) => window.setTimeout(resolve, 2_000))
      }
      setGoogleMessage('Collegamento scaduto: riprova.')
      setDrivePairing(null)
    } catch (error) {
      setGoogleMessage(
        error instanceof Error
          ? error.message
          : 'Collegamento Google non riuscito',
      )
    } finally {
      setGoogleBusy(false)
    }
  }

  async function disconnectGoogleDrive() {
    setGoogleBusy(true)
    if (dataSettings.mode === 'cloud') await setDataMode('local')
    await disconnectDriveSession()
    refreshDriveConnection()
    setDrivePairing(null)
    setGoogleMessage('Dispositivo scollegato da Google Drive.')
    setGoogleBusy(false)
  }

  async function loadCloudRevisions() {
    if (!companyId) return
    setCloudRevisionBusy(true)
    setCloudRevisionMessage(null)
    try {
      const result = await new DriveRepository(companyId).listCompanyRevisions(
        companyId,
      )
      setCloudRevisions(result)
      setCloudRevisionCompanyId(companyId)
      setCloudRevisionMessage(
        result.revisions.length > 1
          ? 'Versioni disponibili: confronta data e dimensione prima di ripristinare.'
          : 'Non sono disponibili versioni precedenti recuperabili.',
      )
    } catch (error) {
      setCloudRevisions(null)
      setCloudRevisionCompanyId(companyId)
      setCloudRevisionMessage(
        error instanceof Error
          ? error.message
          : 'Ricerca versioni Cloud non riuscita',
      )
    } finally {
      setCloudRevisionBusy(false)
    }
  }

  async function restoreCloudRevision(revisionId: string) {
    if (!companyId || !cloudRevisions) return
    const firstConfirmation = window.confirm(
      'ATTENZIONE: stai per ripristinare una versione precedente dell’archivio Cloud. La versione attuale resterà nella cronologia. Continuare?',
    )
    if (!firstConfirmation) return
    const finalConfirmation = window.confirm(
      'SEI SICURO AL 100% DI VOLER RIPRISTINARE QUESTA VERSIONE?',
    )
    if (!finalConfirmation) return
    setCloudRevisionBusy(true)
    setCloudRevisionMessage('Ripristino Cloud in corso. Non chiudere l’app.')
    try {
      await new DriveRepository(companyId).restoreCompanyRevision(
        companyId,
        revisionId,
        cloudRevisions.currentRevision,
      )
      setCloudRevisionMessage(
        'Versione ripristinata. Ricaricamento dei dati in corso.',
      )
      window.location.reload()
    } catch (error) {
      setCloudRevisionMessage(
        error instanceof Error
          ? error.message
          : 'Ripristino Cloud non riuscito',
      )
      setCloudRevisionBusy(false)
    }
  }

  function addCompany(event: FormEvent) {
    event.preventDefault()
    const result = addAccountingCompany(newCompany)
    setCompanyMessage(
      result.ok ? 'Nuova azienda inserita e selezionata.' : result.error ?? null,
    )
    if (result.ok) setNewCompany(emptyCompany)
  }

  async function importJson(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    const result = importLegacyData(await file.text())
    setImportMessage(
      result.ok
        ? `Dati importati soltanto in ${accountingCompany?.name ?? "nell'azienda selezionata"}.`
        : result.error ?? 'Importazione fallita.',
    )
    event.target.value = ''
  }

  function exportCsv() {
    const lines = [
      [
        'TIPO',
        'DATA',
        'NUMERO',
        'NOME',
        'IMPONIBILE',
        'IVA',
        'TOTALE',
        'VENIT',
        'RICARICO %',
      ],
      ...invoices.map((invoice) => [
        'FATTURA',
        invoice.date,
        invoice.number,
        invoice.supplierName,
        invoice.taxableAmount,
        invoice.vat,
        invoice.total,
        invoice.theoreticalRevenue,
        invoice.markupPercent,
      ]),
      ...takings.map((taking) => [
        'INCASSO',
        taking.date,
        '',
        taking.sellerName,
        '',
        taking.vat,
        taking.cash + taking.pos,
        taking.realTotal,
        '',
      ]),
    ]
    download(
      `\uFEFF${lines.map((row) => row.map(csvCell).join(';')).join('\n')}`,
      'text/csv;charset=utf-8',
      `fatture-incassi-${companyFilename}-${new Date().toISOString().slice(0, 10)}.csv`,
    )
  }

  async function exportExcel() {
    const XLSX = await import('xlsx')
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(
        invoices.map((invoice) => ({
          Data: invoice.date,
          Numero: invoice.number,
          Fornitore: invoice.supplierName,
          Venditore: invoice.sellerName,
          Imponibile: invoice.taxableAmount,
          IVA: invoice.vat,
          Totale: invoice.total,
          Venit: invoice.theoreticalRevenue,
          'Ricarico %': invoice.markupPercent,
          'Righe prodotto': invoice.lines.length,
          Pagata: invoice.settled ? 'Sì' : 'No',
          Residuo: Math.max(0, invoice.total - invoice.paidAmount),
        })),
      ),
      'Fatture',
    )
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(
        invoices.flatMap((invoice) =>
          invoice.lines.map((line) => ({
            Fattura: invoice.number,
            Data: invoice.date,
            Fornitore: invoice.supplierName,
            Codice: line.productCode,
            Prodotto: line.description,
            Quantità: line.quantity,
            'Costo unitario IVA inclusa': line.unitPurchaseCostInclVat,
            'Costo totale IVA inclusa': line.purchaseTotalInclVat,
            'Vendita unitaria IVA inclusa': line.unitSalePriceInclVat,
            'Venit totale IVA inclusa': line.saleTotalInclVat,
            'Ricarico %': line.markupPercent,
          })),
        ),
      ),
      'Righe fatture',
    )
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(
        products.map((product) => ({
          Prodotto: product.name,
          Codice: product.code,
          Fornitore: product.supplierName,
          'Costo IVA inclusa': product.purchaseCostInclVat,
          'Regola venit': product.pricingMode,
          'Vendita IVA inclusa': product.salePriceInclVat,
          'Ricarico %': product.markupPercent,
          Note: product.notes,
        })),
      ),
      'Prodotti',
    )
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(
        takings.map((taking) => ({
          Data: taking.date,
          Venditore: taking.sellerName,
          Fornitore: taking.supplierName,
          Cash: taking.cash,
          POS: taking.pos,
          Ritiro: taking.withdrawal,
          IVA: taking.vat,
          'Incasso reale': taking.realTotal,
        })),
      ),
      'Incassi',
    )
    XLSX.writeFile(
      workbook,
      `fatture-incassi-${companyFilename}-${new Date().toISOString().slice(0, 10)}.xlsx`,
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
              <span className="eyebrow">AZIENDE</span>
              <h2>Gestione multi-azienda</h2>
            </div>
            <span className="count-pill">
              {state.accounting.companies.length}
            </span>
          </div>
          <div className="company-list">
            {state.accounting.companies.map((item) => {
              const stores = state.stores.filter(
                (store) => store.companyId === item.id,
              ).length
              const invoices = state.accounting.invoices.filter(
                (invoice) => invoice.companyId === item.id,
              ).length
              return (
                <button
                  className={
                    item.id === accountingCompany?.id ? 'selected' : ''
                  }
                  key={item.id}
                  onClick={() => setActiveAccountingCompany(item.id)}
                  type="button"
                >
                  <span>
                    <strong>{item.name}</strong>
                    <small>
                      {item.taxId || 'Partita IVA non indicata'} · {stores}{' '}
                      punti vendita · {invoices} fatture
                    </small>
                  </span>
                  <span>
                    {item.id === accountingCompany?.id ? 'Attiva' : 'Apri'}
                  </span>
                </button>
              )
            })}
          </div>
          {accountingCompany && (
            <CompanyEditor
              company={accountingCompany}
              key={accountingCompany.id}
              onSave={updateAccountingCompany}
            />
          )}
          <form className="company-create-form" onSubmit={addCompany}>
            <div>
              <span className="eyebrow">NUOVA AZIENDA</span>
              <strong>Inserisci un altro soggetto contabile</strong>
            </div>
            <div className="form-grid">
              <label>
                Ragione sociale
                <input
                  onChange={(event) =>
                    setNewCompany((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  required
                  value={newCompany.name}
                />
              </label>
              <label>
                Partita IVA / Codice fiscale
                <input
                  onChange={(event) =>
                    setNewCompany((current) => ({
                      ...current,
                      taxId: event.target.value,
                    }))
                  }
                  value={newCompany.taxId}
                />
              </label>
              <label>
                Città
                <input
                  onChange={(event) =>
                    setNewCompany((current) => ({
                      ...current,
                      city: event.target.value,
                    }))
                  }
                  value={newCompany.city}
                />
              </label>
            </div>
            <button className="button button-secondary" type="submit">
              Aggiungi azienda
            </button>
            {companyMessage && (
              <p className="import-message">{companyMessage}</p>
            )}
          </form>
          <div className="form-stack company-language">
            <label>
              Lingua dell'interfaccia
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
            <label>
              Valuta
              <select
                onChange={(event) =>
                  setCurrency(
                    event.target.value as 'EUR' | 'MDL' | 'USD',
                  )
                }
                value={dataSettings.currency}
              >
                <option value="EUR">Euro (EUR)</option>
                <option value="MDL">Leu moldavo (MDL)</option>
                <option value="USD">Dollaro USA (USD)</option>
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
              Collega Google Drive per attivare la sincronizzazione senza
              Firebase.
            </p>
          )}
          <div className="archive-location-stack">
            <div className="storage-path-card">
              <small>Percorso JSON locale</small>
              <strong>
                {window.desktopApp
                  ? 'File dell’azienda attiva'
                  : 'Archivio interno del dispositivo'}
              </strong>
              <code>
                {localStoragePaths?.company ??
                  'IndexedDB del browser/app · nessun file JSON accessibile'}
              </code>
              {localStoragePaths && (
                <em>Archivio generale: {localStoragePaths.workspace}</em>
              )}
            </div>
            <div
              aria-label={`Sincronizzazione Cloud: ${cloudStatusLabel}`}
              className={`cloud-status-compact ${cloudStatusClass}`}
              title={
                syncMessage ??
                (dataSettings.mode === 'cloud'
                  ? 'Google Drive collegato e senza dati in attesa'
                  : 'Seleziona Cloud per sincronizzare i dati')
              }
            >
              <span className="drive-status-dot" />
              <small>Cloud</small>
              <strong>{cloudStatusLabel}</strong>
            </div>
          </div>
          <div className="setting-row google-account-row">
            <span>
              <strong>Accesso Google Drive</strong>
              <small>
                {driveAccountEmail
                  ? `${driveAccountEmail} · rinnovo automatico attivo`
                  : 'Non collegato · token Google protetti dal servizio'}
              </small>
            </span>
            <button
              className="button button-secondary"
              disabled={!driveServiceConfigured || googleBusy}
              onClick={() =>
                driveAccountEmail
                  ? void disconnectGoogleDrive()
                  : void prepareGoogleConnection()
              }
              type="button"
            >
              {googleBusy
                ? 'Collegamento...'
                : driveAccountEmail
                  ? 'Scollega dispositivo'
                  : 'Accedi con Google Drive'}
            </button>
          </div>
          {drivePairing && (
            <a
              className="button button-primary"
              href={drivePairing.authorizationUrl}
              onClick={() => void waitForGoogleConnection()}
              rel="noreferrer"
              target="_blank"
            >
              Apri Google e autorizza
            </a>
          )}
          {googleMessage && (
            <p aria-live="polite" className="import-message">
              {googleMessage}
            </p>
          )}
          {driveAccountEmail && accountingCompany && (
            <div className="cloud-recovery-panel">
              <div>
                <strong>Recupero versioni Cloud</strong>
                <small>
                  Cerca le copie precedenti dell’archivio di{' '}
                  {accountingCompany.name}. Nessun dato viene sovrascritto
                  durante la ricerca.
                </small>
              </div>
              <button
                className="button button-secondary"
                disabled={cloudRevisionBusy}
                onClick={() => void loadCloudRevisions()}
                type="button"
              >
                {cloudRevisionBusy
                  ? 'Ricerca in corso...'
                  : 'Cerca versioni precedenti'}
              </button>
              {cloudRevisionCompanyId === companyId &&
                cloudRevisions?.revisions.map((item) => {
                  const current =
                    item.id === cloudRevisions.currentRevisionId
                  return (
                    <div className="cloud-revision-row" key={item.id}>
                      <span>
                        <strong>
                          {new Intl.DateTimeFormat('it-IT', {
                            dateStyle: 'short',
                            timeStyle: 'medium',
                          }).format(new Date(item.modifiedTime))}
                        </strong>
                        <small>
                          {(item.size / 1024).toLocaleString('it-IT', {
                            maximumFractionDigits: 1,
                          })}{' '}
                          KB
                          {current ? ' · versione attuale' : ''}
                        </small>
                      </span>
                      <button
                        className="button"
                        disabled={cloudRevisionBusy || current}
                        onClick={() => void restoreCloudRevision(item.id)}
                        type="button"
                      >
                        {current ? 'Attuale' : 'Ripristina'}
                      </button>
                    </div>
                  )
                })}
              {cloudRevisionMessage && (
                <p aria-live="polite" className="import-message">
                  {cloudRevisionMessage}
                </p>
              )}
            </div>
          )}
          <p className="settings-note">
            I file JSON restano nel tuo Google Drive. Il programma conserva
            sul dispositivo solo un codice revocabile, mai la password o il
            token Google.
          </p>
          <ol className="settings-steps">
            <li>Premi “Accedi con Google Drive”.</li>
            <li>Apri Google e autorizza l'accesso ai file dell'app.</li>
            <li>Torna qui: la modalità Cloud si attiva automaticamente.</li>
            <li>
              Ripeti una sola volta su ogni nuovo PC, Android, iPhone o tablet.
            </li>
          </ol>
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
              <strong>Copia locale facoltativa</strong>
              <small>
                Solo EXE desktop · non serve alla sincronizzazione Cloud
              </small>
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
          <div className="drive-folder-form">
            <label>
              Cartella del computer
              <input
                placeholder="Seleziona la cartella sincronizzata sul computer"
                readOnly
                value={driveFolderIsUrl ? '' : dataSettings.driveFolder}
              />
            </label>
            <button
              className="button button-primary"
              disabled={!window.desktopApp}
              onClick={requestDriveFolderChange}
              type="button"
            >
              Scegli cartella
            </button>
            <button
              className="button"
              disabled={
                !window.desktopApp ||
                !dataSettings.driveBackupAfterApproval ||
                !driveFolderConfigured
              }
              onClick={() => void syncDriveBackup()}
              type="button"
            >
              Sincronizza ora
            </button>
          </div>
          {driveFolderIsUrl && (
            <p className="drive-folder-warning">
              L’indirizzo web salvato non è una cartella del computer. Premi
              “Scegli cartella” e seleziona la cartella Google Drive installata
              sul PC.
            </p>
          )}
          {driveSyncMessage && !driveFolderIsUrl && (
            <p aria-live="polite" className="import-message">
              {driveSyncMessage}
            </p>
          )}
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
            Questa è soltanto una copia di sicurezza aggiuntiva. Per usare gli
            stessi dati su PC, telefono e tablet utilizza la modalità Cloud
            nella sezione precedente.
          </p>
        </article>
        {driveFolderConfirmation && (
          <div className="drive-folder-confirmation-overlay">
            <div
              aria-labelledby="drive-folder-confirmation-title"
              aria-modal="true"
              className={`drive-folder-confirmation ${
                driveFolderConfirmation === 'warning'
                  ? 'drive-folder-confirmation-flashing'
                  : ''
              }`}
              role="dialog"
            >
              {driveFolderConfirmation === 'warning' ? (
                <>
                  <span className="drive-folder-confirmation-icon">!</span>
                  <h2 id="drive-folder-confirmation-title">
                    STAI CAMBIANDO LA CARTELLA
                  </h2>
                  <strong>ATTENZIONE: PERICOLO DI PERDITA DATI</strong>
                  <p>
                    La cartella memorizzata resterà invariata finché non
                    completi entrambe le conferme.
                  </p>
                  <div className="drive-folder-confirmation-actions">
                    <button
                      className="button button-secondary"
                      onClick={() => setDriveFolderConfirmation(null)}
                      type="button"
                    >
                      Annulla
                    </button>
                    <button
                      className="button danger-button"
                      onClick={() => setDriveFolderConfirmation('final')}
                      type="button"
                    >
                      Ho capito, continua
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <span className="drive-folder-confirmation-icon">!</span>
                  <h2 id="drive-folder-confirmation-title">
                    SEI SICURO AL 100%?
                  </h2>
                  <p>
                    Solo scegliendo SÌ potrai selezionare una nuova cartella.
                    Scegliendo NO non cambierà nulla.
                  </p>
                  <div className="drive-folder-confirmation-actions">
                    <button
                      className="button button-secondary"
                      onClick={() => setDriveFolderConfirmation(null)}
                      type="button"
                    >
                      NO
                    </button>
                    <button
                      className="button danger-button"
                      onClick={() => void confirmDriveFolderChange()}
                      type="button"
                    >
                      SÌ
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

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
            Importa il backup JSON v5 nella sola azienda selezionata, senza
            modificare gli archivi delle altre aziende.
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
                  `contabilita-pro-${companyFilename}-backup-v5.json`,
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
                  `fatture-incassi-pro-${companyFilename}-backup.json`,
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

      </section>
    </div>
  )
}
