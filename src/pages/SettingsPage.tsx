import {
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from 'react'
import type {
  AccountingCompany,
  InterfaceBackground,
  InterfaceTextColor,
  Locale,
} from '../domain/types'
import { CloudIcon, DeviceIcon } from '../components/Icons'
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
    driveFolderLocation,
    driveSyncMessage,
    localStoragePaths,
    refreshDriveFolder,
    selectPrimaryDriveFolder,
    openPrimaryDriveFolder,
    syncMessage,
    syncState,
    updateCompany,
    setActiveAccountingCompany,
    addAccountingCompany,
    updateAccountingCompany,
    updateAccounting,
    setDataMode,
    copyLocalDataToCloud,
    setDriveBackup,
    selectDriveFolder,
    syncDriveBackup,
    archiveSeason,
    restoreSeasonArchive,
    setCurrency,
    setImageRetention,
    setLanguage,
    setInterfaceBackground,
    setInterfaceTextColor,
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
  const [localCloudBusy, setLocalCloudBusy] = useState(false)
  const [backupBusy, setBackupBusy] = useState(false)
  const [backupMessage, setBackupMessage] = useState<string | null>(null)
  const [driveFolderConfirmation, setDriveFolderConfirmation] = useState<
    'warning' | 'final' | null
  >(null)
  const [seasonDialog, setSeasonDialog] = useState<
    'name' | 'confirmation' | null
  >(null)
  const [seasonName, setSeasonName] = useState('')
  const [seasonBusy, setSeasonBusy] = useState(false)
  const [seasonMessage, setSeasonMessage] = useState<string | null>(null)
  const [verificationSellerDrafts, setVerificationSellerDrafts] = useState<
    Record<string, string[]>
  >({})
  const [verificationMessage, setVerificationMessage] = useState<string | null>(
    null,
  )
  const fileInput = useRef<HTMLInputElement>(null)
  const seasonArchiveInput = useRef<HTMLInputElement>(null)
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
  const verificationSettings = state.accounting.verificationSettings.find(
    (settings) => settings.companyId === companyId,
  )
  const verificationSellers = state.accounting.sellers.filter(
    (seller) => seller.companyId === companyId && seller.name.trim(),
  )
  const verificationSellerIds =
    verificationSellerDrafts[companyId ?? ''] ??
    verificationSettings?.sellerIds ??
    []
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

  async function runLocalBackup() {
    if (!window.desktopApp) return
    setBackupBusy(true)
    setBackupMessage(null)
    try {
      const result = await window.desktopApp.backupLocalStates()
      setBackupMessage(
        result.files > 0
          ? `Backup completato: ${result.files} file salvati.`
          : 'Cartella creata. Non sono ancora presenti archivi JSON da copiare.',
      )
    } catch (error) {
      setBackupMessage(
        error instanceof Error
          ? error.message
          : 'Backup JSON non riuscito.',
      )
    } finally {
      setBackupBusy(false)
    }
  }

  function setVerificationEnabled(enabled: boolean) {
    if (!companyId) return
    if (enabled && (verificationSettings?.sellerIds.length ?? 0) === 0) {
      setVerificationMessage(
        'Seleziona e conferma almeno un venditore prima di attivare.',
      )
      return
    }
    updateAccounting((current) => {
      const currentSettings = current.verificationSettings.find(
        (settings) => settings.companyId === companyId,
      )
      return {
        ...current,
        verificationSettings: [
          ...current.verificationSettings.filter(
            (settings) => settings.companyId !== companyId,
          ),
          {
            companyId,
            enabled,
            sellerIds: currentSettings?.sellerIds ?? [],
          },
        ],
      }
    })
    setVerificationMessage(
      enabled
        ? 'Verifica contabile attiva fino alla disattivazione manuale.'
        : 'Verifica contabile disattivata.',
    )
  }

  function confirmVerificationSellers() {
    if (!companyId || verificationSellerIds.length === 0) {
      setVerificationMessage('Seleziona almeno un venditore.')
      return
    }
    const names = verificationSellers
      .filter((seller) => verificationSellerIds.includes(seller.id))
      .map((seller) => seller.name)
    if (
      !window.confirm(
        `Confermi la verifica contabile permanente per: ${names.join(', ')}?`,
      )
    ) {
      return
    }
    updateAccounting((current) => ({
      ...current,
      verificationSettings: [
        ...current.verificationSettings.filter(
          (settings) => settings.companyId !== companyId,
        ),
        {
          companyId,
          enabled: true,
          sellerIds: verificationSellerIds,
        },
      ],
    }))
    setVerificationMessage(
      `Verifica contabile attiva per: ${names.join(', ')}.`,
    )
  }

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

  async function confirmSeasonArchive() {
    setSeasonBusy(true)
    setSeasonMessage(null)
    const result = await archiveSeason(seasonName)
    setSeasonBusy(false)
    if (!result.ok) {
      setSeasonMessage(result.error ?? 'Archiviazione non riuscita.')
      return
    }
    setSeasonDialog(null)
    setSeasonName('')
    setSeasonMessage(
      `Stagione archiviata e nuovo esercizio pronto: ${result.destination}`,
    )
  }

  async function restoreSeason(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    const confirmed = window.confirm(
      `Ripristinare ${file.name}? I dati correnti dell’azienda attiva saranno sostituiti. Archiviali prima se devi conservarli.`,
    )
    if (!confirmed) {
      event.target.value = ''
      return
    }
    setSeasonBusy(true)
    setSeasonMessage('Ripristino stagione in corso. Non chiudere l’app.')
    const result = await restoreSeasonArchive(await file.text())
    setSeasonBusy(false)
    setSeasonMessage(
      result.ok
        ? 'Stagione ripristinata nell’azienda attiva.'
        : result.error ?? 'Ripristino stagione non riuscito.',
    )
    event.target.value = ''
  }

  async function choosePrimaryDriveFolder() {
    setGoogleBusy(true)
    setGoogleMessage(null)
    try {
      const result = await selectPrimaryDriveFolder()
      if (result.ok) {
        await refreshDriveFolder()
        setGoogleMessage(
          'Cartella Google Drive selezionata. Ora puoi aprire i JSON sincronizzati.',
        )
      } else if (result.error) {
        setGoogleMessage(result.error)
      }
    } finally {
      setGoogleBusy(false)
    }
  }

  async function confirmLocalDataToCloud() {
    if (
      !window.confirm(
        'Copiare i JSON locali dell’EXE nella cartella Google Drive? I file locali non saranno modificati.',
      ) ||
      !window.confirm(
        'Conferma: i dati locali sostituiranno i JSON presenti nella cartella Google Drive.',
      )
    ) {
      return
    }
    setLocalCloudBusy(true)
    const result = await copyLocalDataToCloud()
    setGoogleMessage(
      result.ok
        ? 'Dati locali copiati nella cartella Google Drive.'
        : result.error ?? 'Copia nella cartella Google Drive non riuscita.',
    )
    setLocalCloudBusy(false)
  }

  async function openCloudData() {
    if (
      dataSettings.mode !== 'cloud' &&
      !window.confirm(
        'Aprire i JSON presenti nella cartella Google Drive? I dati locali non verranno caricati né uniti.',
      )
    ) {
      return
    }
    await setDataMode('cloud')
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
        'MERCE SENZA FATTURA',
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
        invoice.unregisteredGoods,
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
        taking.unregisteredGoods,
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
          'Merce senza fattura': invoice.unregisteredGoods,
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
          Cash: taking.cash,
          POS: taking.pos,
          IVA: taking.vat,
          'Incasso reale': taking.realTotal,
          'Cash ritirato': taking.withdrawal,
          'Merce acquistata senza fattura': taking.unregisteredGoods,
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
        <article className="panel verification-settings-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">CONTROLLO MERCE</span>
              <h2>Verifica contabile</h2>
              <p>
                Separa carichi, produzione e trasferimenti dalla contabilità
                ordinaria.
              </p>
            </div>
            <div className="verification-toggle-control">
              <strong className={verificationSettings?.enabled ? 'active' : ''}>
                {verificationSettings?.enabled ? 'ON' : 'OFF'}
              </strong>
              <button
                aria-label="Attiva o disattiva verifica contabile"
                aria-pressed={Boolean(verificationSettings?.enabled)}
                className={`toggle ${
                  verificationSettings?.enabled ? 'on' : ''
                }`}
                onClick={() =>
                  setVerificationEnabled(!verificationSettings?.enabled)
                }
                type="button"
              >
                <span />
              </button>
            </div>
          </div>
          <fieldset className="production-sellers verification-sellers">
            <legend>Venditori sottoposti a verifica</legend>
            {verificationSellers.length === 0 ? (
              <p>Registra prima almeno un venditore.</p>
            ) : (
              verificationSellers.map((seller) => (
                <label className="checkbox-row" key={seller.id}>
                  <input
                    checked={verificationSellerIds.includes(seller.id)}
                    onChange={(event) =>
                      setVerificationSellerDrafts((current) => {
                        const selected =
                          current[companyId ?? ''] ??
                          verificationSettings?.sellerIds ??
                          []
                        return {
                          ...current,
                          [companyId ?? '']: event.target.checked
                            ? [...selected, seller.id]
                            : selected.filter(
                                (sellerId) => sellerId !== seller.id,
                              ),
                        }
                      })
                    }
                    type="checkbox"
                  />
                  {seller.name}
                </label>
              ))
            )}
          </fieldset>
          <div className="verification-settings-actions">
            <button
              className="button button-primary"
              onClick={confirmVerificationSellers}
              type="button"
            >
              Conferma e attiva
            </button>
            <small>
              La selezione confermata resta attiva finché non la modifichi o
              disattivi manualmente.
            </small>
          </div>
          {verificationMessage && (
            <p className="import-message">{verificationMessage}</p>
          )}
        </article>

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
              <span className="eyebrow">ASPETTO</span>
              <h2>Colori interfaccia</h2>
            </div>
          </div>
          <div className="theme-settings">
            <fieldset>
              <legend>Sfondo</legend>
              <div className="theme-options">
                {[
                  ['black', 'Nero'],
                  ['gray', 'Grigio'],
                  ['pink', 'Rosa'],
                  ['blue', 'Azzurro'],
                ].map(([value, label]) => (
                  <button
                    aria-pressed={dataSettings.background === value}
                    className={
                      dataSettings.background === value ? 'selected' : ''
                    }
                    key={value}
                    onClick={() =>
                      setInterfaceBackground(value as InterfaceBackground)
                    }
                    type="button"
                  >
                    <span
                      className={`theme-swatch background-${value}`}
                    />
                    {label}
                  </button>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend>Scrittura</legend>
              <div className="theme-options">
                {[
                  ['white', 'Bianca accesa'],
                  ['yellow', 'Gialla'],
                  ['green', 'Verde'],
                  ['black', 'Nera'],
                ].map(([value, label]) => (
                  <button
                    aria-pressed={dataSettings.textColor === value}
                    className={
                      dataSettings.textColor === value ? 'selected' : ''
                    }
                    key={value}
                    onClick={() =>
                      setInterfaceTextColor(value as InterfaceTextColor)
                    }
                    type="button"
                  >
                    <span className={`theme-swatch text-${value}`}>Aa</span>
                    {label}
                  </button>
                ))}
              </div>
            </fieldset>
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
              onClick={() => void openCloudData()}
              type="button"
            >
              <span className="mode-icon violet-icon">
                <CloudIcon size={26} />
              </span>
              <strong>Google Drive</strong>
              <span>Usa direttamente i JSON nella cartella sincronizzata.</span>
            </button>
          </div>
          {!cloudAvailable && (
            <p className="settings-note">
              Seleziona la cartella sincronizzata da Google Drive Desktop.
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
            {window.desktopApp && localStoragePaths?.backup && (
              <div className="backup-path-card">
                <button
                  className="backup-path-open"
                  onClick={() =>
                    void window.desktopApp?.openBackupDirectory()
                  }
                  type="button"
                >
                  <span>
                    <small>CARTELLA BACKUP JSON</small>
                    <strong>Clicca per aprire la cartella</strong>
                  </span>
                  <code>{localStoragePaths.backup}</code>
                </button>
                <button
                  className="button backup-now-button"
                  disabled={backupBusy}
                  onClick={() => void runLocalBackup()}
                  type="button"
                >
                  {backupBusy
                    ? 'Backup in corso...'
                    : 'Crea cartella / Esegui backup ora'}
                </button>
                {backupMessage && (
                  <em className="backup-result">{backupMessage}</em>
                )}
              </div>
            )}
            <div
              aria-label={`Archivio Google Drive: ${cloudStatusLabel}`}
              className={`cloud-status-compact ${cloudStatusClass}`}
              title={
                syncMessage ??
                (dataSettings.mode === 'cloud'
                  ? 'JSON Google Drive attivi'
                  : 'Seleziona Google Drive per usare i JSON condivisi')
              }
            >
              <span className="drive-status-dot" />
              <small>Google Drive</small>
              <strong>{cloudStatusLabel}</strong>
            </div>
          </div>
          <div className="setting-row google-account-row">
            <span>
              <strong>Cartella dati Google Drive</strong>
              <small>
                {driveFolderLocation ??
                  'Nessuna cartella selezionata'}
              </small>
            </span>
            <button
              className="button button-secondary"
              disabled={googleBusy}
              onClick={() => void choosePrimaryDriveFolder()}
              type="button"
            >
              {googleBusy ? 'Apertura...' : 'Scegli cartella'}
            </button>
            {window.desktopApp && driveFolderLocation && (
              <button
                className="button"
                onClick={() => void openPrimaryDriveFolder()}
                type="button"
              >
                Apri cartella
              </button>
            )}
          </div>
          {googleMessage && (
            <p aria-live="polite" className="import-message">
              {googleMessage}
            </p>
          )}
          {window.desktopApp && driveFolderLocation && (
            <div className="cloud-recovery-panel">
              <div>
                <strong>Copia sicura locale → Google Drive</strong>
                <small>
                  Usa i JSON locali dell’EXE come dati corretti, senza
                  modificarli, e sostituisce i file nella cartella scelta.
                </small>
              </div>
              <button
                className="button button-primary"
                disabled={localCloudBusy}
                onClick={() => void confirmLocalDataToCloud()}
                type="button"
              >
                {localCloudBusy
                  ? 'Copia in corso...'
                  : 'Copia dati locali nella cartella'}
              </button>
            </div>
          )}
          <p className="settings-note">
            L’EXE legge la cartella locale sincronizzata; il sito richiede il
            permesso del browser alla stessa cartella.
          </p>
          <ol className="settings-steps">
            <li>Installa Google Drive Desktop e attendi la sincronizzazione.</li>
            <li>Premi “Scegli cartella” e seleziona la cartella dei JSON.</li>
            <li>
              Apri Google Drive: verranno letti workspace.json e i file delle
              aziende, senza unire i dati locali.
            </li>
            <li>
              Ripeti la scelta su ogni nuovo PC. Su iPhone e Android usa
              import/export se il browser non consente l’accesso alla cartella.
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

        <article className="panel season-archive-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">CHIUSURA ESERCIZIO</span>
              <h2>Archivia stagione</h2>
            </div>
          </div>
          <p className="settings-note">
            Salva l’intero esercizio dell’azienda attiva nella cartella
            configurata. Solo dopo il salvataggio riuscito vengono azzerati
            fatture, incassi, costi e produzione; anagrafiche e configurazioni
            restano pronte per la nuova stagione.
          </p>
          <input
            accept="application/json,.json"
            className="visually-hidden"
            onChange={(event) => void restoreSeason(event)}
            ref={seasonArchiveInput}
            type="file"
          />
          <div className="backup-actions">
            <button
              className="button danger-button"
              disabled={
                seasonBusy ||
                !window.desktopApp ||
                !driveFolderConfigured ||
                !accountingCompany
              }
              onClick={() => {
                setSeasonMessage(null)
                setSeasonDialog('name')
              }}
              type="button"
            >
              Archivia stagione
            </button>
            <button
              className="button button-secondary"
              disabled={seasonBusy || !accountingCompany}
              onClick={() => seasonArchiveInput.current?.click()}
              type="button"
            >
              Riprendi stagione archiviata
            </button>
          </div>
          {!window.desktopApp && (
            <p className="drive-folder-warning">
              Il salvataggio diretto nella cartella configurata è disponibile
              nell’EXE desktop.
            </p>
          )}
          {window.desktopApp && !driveFolderConfigured && (
            <p className="drive-folder-warning">
              Prima seleziona la cartella del computer nella sezione Backup e
              conservazione.
            </p>
          )}
          {seasonMessage && (
            <p aria-live="polite" className="import-message">
              {seasonMessage}
            </p>
          )}
        </article>

        {seasonDialog && (
          <div className="drive-folder-confirmation-overlay">
            <div
              aria-labelledby="season-archive-title"
              aria-modal="true"
              className={`drive-folder-confirmation ${
                seasonDialog === 'confirmation'
                  ? 'drive-folder-confirmation-flashing'
                  : ''
              }`}
              role="dialog"
            >
              {seasonDialog === 'name' ? (
                <>
                  <h2 id="season-archive-title">Nome della stagione</h2>
                  <p>
                    Indica il periodo da archiviare, per esempio 2026/2027.
                  </p>
                  <label className="season-name-field">
                    Nome archivio
                    <input
                      autoFocus
                      onChange={(event) => setSeasonName(event.target.value)}
                      placeholder="Esempio: 2026/2027"
                      value={seasonName}
                    />
                  </label>
                  <div className="drive-folder-confirmation-actions">
                    <button
                      className="button button-secondary"
                      onClick={() => setSeasonDialog(null)}
                      type="button"
                    >
                      Annulla
                    </button>
                    <button
                      className="button button-primary"
                      disabled={!seasonName.trim()}
                      onClick={() => setSeasonDialog('confirmation')}
                      type="button"
                    >
                      Continua
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <span className="drive-folder-confirmation-icon">!</span>
                  <h2 id="season-archive-title">CONFERMI IL RESET?</h2>
                  <strong>STAGIONE: {seasonName.trim()}</strong>
                  <p>
                    L’archivio sarà salvato prima nella cartella configurata.
                    Il reset partirà soltanto se il salvataggio riesce.
                  </p>
                  <div className="drive-folder-confirmation-actions">
                    <button
                      className="button button-secondary"
                      disabled={seasonBusy}
                      onClick={() => setSeasonDialog(null)}
                      type="button"
                    >
                      NO
                    </button>
                    <button
                      className="button danger-button"
                      disabled={seasonBusy}
                      onClick={() => void confirmSeasonArchive()}
                      type="button"
                    >
                      {seasonBusy ? 'Archiviazione...' : 'SÌ, ARCHIVIA E RESETTA'}
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
