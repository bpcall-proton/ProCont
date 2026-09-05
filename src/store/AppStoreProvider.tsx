import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useAuth } from '../auth/AuthContext'
import {
  createId,
  createInitialState,
  createStoreWithSeller,
  updateCompany as patchCompany,
} from '../domain/defaults'
import type {
  AccountingCompany,
  AppState,
  Company,
  Currency,
  DataMode,
  InterfaceBackground,
  InterfaceLanguage,
  InterfaceTextColor,
  SyncState,
} from '../domain/types'
import { DriveRepository } from '../data/driveRepository'
import {
  driveServiceConfigured,
  loadDriveSession,
} from '../data/driveSession'
import { LocalRepository } from '../data/localRepository'
import type { AppRepository } from '../data/repository'
import {
  exportLegacyAccounting,
  exportUnifiedState,
  importLegacyIntoActiveCompany,
} from '../data/migrations'
import { createCompanyState } from '../data/companyState'
import {
  realTaking,
  setMoneyCurrency,
} from '../domain/accounting'
import {
  AppStoreContext,
  type AccountingCompanyInput,
  type AppStoreContextValue,
  type LocalStoragePaths,
  type NewStoreInput,
} from './AppStoreContext'

function withActiveCompanySummaries(state: AppState): AppState {
  const companyId = state.accounting.activeCompanyId
  const invoices = state.accounting.invoices.filter(
    (invoice) => invoice.companyId === companyId,
  )
  const takings = state.accounting.takings.filter(
    (taking) => taking.companyId === companyId,
  )
  const reviewDocuments = state.reviewDocuments.filter(
    (document) => document.companyId === companyId,
  )
  const invoiceValue = invoices.reduce(
    (total, invoice) => total + invoice.total,
    0,
  )
  const theoreticalRevenue = invoices.reduce(
    (total, invoice) => total + invoice.theoreticalRevenue,
    0,
  )
  const realTakings = takings.reduce(
    (total, taking) => total + realTaking(taking),
    0,
  )
  const review = reviewDocuments.reduce(
    (summary, document) => {
      if (document.status === 'pending') summary.pending += 1
      if (document.status === 'unrecognized') summary.unrecognized += 1
      if (document.status === 'possible-duplicate') {
        summary.possibleDuplicates += 1
      }
      return summary
    },
    { pending: 0, unrecognized: 0, possibleDuplicates: 0 },
  )
  return {
    ...state,
    review,
    financial: {
      invoiceValue,
      theoreticalRevenue,
      realTakings,
      stockRevenue: theoreticalRevenue - realTakings,
    },
  }
}

function withTimestamp(state: AppState): AppState {
  return {
    ...withActiveCompanySummaries(state),
    updatedAt: new Date().toISOString(),
  }
}

function modePreferenceKey(companyId: string) {
  return `fip:data-mode:${companyId}`
}

function readModePreference(companyId: string): DataMode | null {
  const value = localStorage.getItem(modePreferenceKey(companyId))
  return value === 'local' || value === 'cloud' ? value : null
}

function writeModePreference(companyId: string, mode: DataMode) {
  localStorage.setItem(modePreferenceKey(companyId), mode)
}

function cloudRecoveryKey(companyId: string) {
  return `fip:cloud-recovery:${companyId}`
}

function readCloudRecovery(companyId: string) {
  return localStorage.getItem(cloudRecoveryKey(companyId)) === 'pending'
}

function writeCloudRecovery(companyId: string, pending: boolean) {
  if (pending) {
    localStorage.setItem(cloudRecoveryKey(companyId), 'pending')
    return
  }
  localStorage.removeItem(cloudRecoveryKey(companyId))
}

function normalizeCompanyValue(value: string) {
  return value.trim().toLocaleLowerCase()
}

function normalizeTaxId(value: string) {
  return value.replace(/\s/g, '').toLocaleUpperCase()
}

function validateAccountingCompany(
  companies: AccountingCompany[],
  input: AccountingCompanyInput,
  currentId?: string,
) {
  const name = input.name.trim()
  const taxId = input.taxId.trim()

  if (!name) return 'Inserisci il nome dell’azienda.'
  if (
    companies.some(
      (company) =>
        company.id !== currentId &&
        normalizeCompanyValue(company.name) === normalizeCompanyValue(name),
    )
  ) {
    return 'Esiste già un’azienda con questo nome.'
  }
  if (
    taxId &&
    companies.some(
      (company) =>
        company.id !== currentId &&
        normalizeTaxId(company.taxId) === normalizeTaxId(taxId),
    )
  ) {
    return 'Esiste già un’azienda con questa partita IVA o codice fiscale.'
  }

  return null
}

function backupFilename(state: AppState) {
  const company = state.accounting.companies.find(
    (item) => item.id === state.accounting.activeCompanyId,
  )
  const name =
    company?.name
      .trim()
      .toLocaleLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'azienda'
  return `fatture-incassi-pro-${name}.json`
}

function safeFilenamePart(value: string) {
  return (
    value
      .trim()
      .toLocaleLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'stagione'
  )
}

function resetActiveCompanySeason(state: AppState, companyId: string) {
  return {
    ...state,
    reviewDocuments: state.reviewDocuments.filter(
      (document) => document.companyId !== companyId,
    ),
    accounting: {
      ...state.accounting,
      invoices: state.accounting.invoices.filter(
        (invoice) => invoice.companyId !== companyId,
      ),
      takings: state.accounting.takings.filter(
        (taking) => taking.companyId !== companyId,
      ),
      rentals: state.accounting.rentals.filter(
        (rental) => rental.companyId !== companyId,
      ),
      accountantInvoices: state.accounting.accountantInvoices.filter(
        (invoice) => invoice.companyId !== companyId,
      ),
      expenses: state.accounting.expenses.filter(
        (expense) => expense.companyId !== companyId,
      ),
      productionSettings: state.accounting.productionSettings.map(
        (settings) =>
          settings.companyId === companyId
            ? { ...settings, expenseIds: [] }
            : settings,
      ),
      productionEntries: state.accounting.productionEntries.filter(
        (entry) => entry.companyId !== companyId,
      ),
    },
  }
}

function clearActiveCompanyData(state: AppState, companyId: string) {
  const outsideCompany = <Item extends { companyId: string }>(items: Item[]) =>
    items.filter((item) => item.companyId !== companyId)
  return {
    ...state,
    stores: outsideCompany(state.stores),
    sellers: outsideCompany(state.sellers),
    reviewDocuments: outsideCompany(state.reviewDocuments),
    accounting: {
      ...state.accounting,
      invoices: outsideCompany(state.accounting.invoices),
      takings: outsideCompany(state.accounting.takings),
      sellers: outsideCompany(state.accounting.sellers),
      suppliers: outsideCompany(state.accounting.suppliers),
      products: outsideCompany(state.accounting.products),
      rentals: outsideCompany(state.accounting.rentals),
      accountantInvoices: outsideCompany(
        state.accounting.accountantInvoices,
      ),
      expenses: outsideCompany(state.accounting.expenses),
      productionSettings: outsideCompany(
        state.accounting.productionSettings,
      ),
      productionEntries: outsideCompany(state.accounting.productionEntries),
      productionViewSettings: outsideCompany(
        state.accounting.productionViewSettings,
      ),
    },
  }
}

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const sessionUser = user
  if (!sessionUser) throw new Error('Sessione utente richiesta')
  const { companyId } = sessionUser

  const localRepository = useMemo(
    () => new LocalRepository(companyId),
    [companyId],
  )
  const cloudRepository = useMemo(
    () => new DriveRepository(companyId),
    [companyId],
  )
  const [state, setState] = useState<AppState>(() =>
    createInitialState(companyId),
  )
  setMoneyCurrency(state.dataSettings.currency)
  const [loading, setLoading] = useState(true)
  const [syncState, setSyncState] = useState<SyncState>('idle')
  const [syncMessage, setSyncMessage] = useState<string | null>(null)
  const [localStoragePaths, setLocalStoragePaths] =
    useState<LocalStoragePaths | null>(null)
  const [driveSyncState, setDriveSyncState] = useState<SyncState>('idle')
  const [driveSyncMessage, setDriveSyncMessage] = useState<string | null>(null)
  const [driveAccountEmail, setDriveAccountEmail] = useState(
    () => loadDriveSession()?.email ?? null,
  )
  const activeRepository = useRef<AppRepository>(localRepository)
  const saveQueue = useRef(Promise.resolve())
  const stateRef = useRef(state)
  const syncRecovery = useRef<'reload-cloud' | 'retry-save'>('retry-save')
  const unsubscribe = useRef<() => void>(() => undefined)

  const applyState = useCallback((next: AppState) => {
    const summarized = withActiveCompanySummaries(next)
    stateRef.current = summarized
    setState(summarized)
  }, [])

  const saveDriveBackup = useCallback(async (next: AppState) => {
    const driveFolder = next.dataSettings.driveFolder.trim()
    if (
      !window.desktopApp ||
      !next.dataSettings.driveBackupAfterApproval ||
      !driveFolder ||
      /^https?:\/\//i.test(driveFolder)
    ) {
      setDriveSyncState('idle')
      setDriveSyncMessage(
        /^https?:\/\//i.test(driveFolder)
          ? 'Usa “Scegli cartella”: un indirizzo web non è una cartella del computer.'
          : null,
      )
      return
    }
    setDriveSyncState('saving')
    setDriveSyncMessage('Salvataggio JSON in corso')
    try {
      const companyId = next.accounting.activeCompanyId
      const backupState = companyId
        ? createCompanyState(next, companyId)
        : next
      const destination = await window.desktopApp.saveDriveBackup(
        driveFolder,
        backupFilename(next),
        exportUnifiedState(backupState),
      )
      setDriveSyncState('saved')
      setDriveSyncMessage(`JSON aggiornato: ${destination}`)
    } catch (error) {
      setDriveSyncState('error')
      setDriveSyncMessage(
        error instanceof Error
          ? error.message
          : 'Backup Google Drive non riuscito',
      )
    }
  }, [])

  const enqueueSave = useCallback((next: AppState) => {
    syncRecovery.current = 'retry-save'
    setSyncState('saving')
    setSyncMessage(null)
    saveQueue.current = saveQueue.current
      .then(() => activeRepository.current.save(next))
      .then(async () => {
        setSyncState('saved')
        await saveDriveBackup(next)
      })
      .catch((error: unknown) => {
        setSyncState('error')
        setSyncMessage(
          error instanceof Error ? error.message : 'Salvataggio non riuscito',
        )
      })
  }, [saveDriveBackup])

  useEffect(() => {
    let cancelled = false
    async function hydrate() {
      const local = await localRepository.load()
      const initial = local ?? createInitialState(companyId)
      const requestedMode =
        readCloudRecovery(companyId)
          ? 'cloud'
          : readModePreference(companyId) ?? initial.dataSettings.mode
      const repository: AppRepository =
        requestedMode === 'cloud' &&
        driveServiceConfigured &&
        loadDriveSession()
          ? cloudRepository
          : localRepository
      activeRepository.current = repository
      try {
        const remote = await repository.load()
        const source = remote ?? initial
        const hydrated: AppState = {
          ...source,
          dataSettings: {
            ...source.dataSettings,
            mode: repository.mode,
          },
        }
        if (!cancelled) {
          if (repository.mode === 'cloud') {
            writeCloudRecovery(companyId, false)
          }
          applyState(hydrated)
          unsubscribe.current()
          unsubscribe.current =
            repository.subscribe?.((next) => applyState(next)) ??
            (() => undefined)
        }
      } catch {
        activeRepository.current = localRepository
        syncRecovery.current =
          repository.mode === 'cloud' ? 'reload-cloud' : 'retry-save'
        writeCloudRecovery(companyId, repository.mode === 'cloud')
        writeModePreference(companyId, 'local')
        if (!cancelled) {
          applyState({
            ...initial,
            dataSettings: { ...initial.dataSettings, mode: 'local' },
          })
          setSyncMessage('Cloud non disponibile: modalità locale ripristinata')
          setSyncState('error')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void hydrate()
    return () => {
      cancelled = true
      unsubscribe.current()
    }
  }, [applyState, cloudRepository, companyId, localRepository])

  useEffect(() => {
    const activeCompanyId = state.accounting.activeCompanyId
    if (!window.desktopApp || !activeCompanyId) return
    let cancelled = false
    void window.desktopApp
      .getLocalStatePaths(companyId, activeCompanyId)
      .then((paths) => {
        if (!cancelled) setLocalStoragePaths(paths)
      })
      .catch(() => {
        if (!cancelled) setLocalStoragePaths(null)
      })
    return () => {
      cancelled = true
    }
  }, [companyId, state.accounting.activeCompanyId])

  const updateState = useCallback(
    (updater: (current: AppState) => AppState) => {
      const next = withTimestamp(updater(stateRef.current))
      applyState(next)
      enqueueSave(next)
    },
    [applyState, enqueueSave],
  )

  const value = useMemo<AppStoreContextValue>(
    () => ({
      state,
      loading,
      syncState,
      syncMessage,
      localStoragePaths,
      driveSyncState,
      driveSyncMessage,
      driveAccountEmail,
      cloudAvailable:
        driveServiceConfigured && driveAccountEmail !== null,
      refreshDriveConnection: () => {
        setDriveAccountEmail(loadDriveSession()?.email ?? null)
      },
      retrySync: async () => {
        if (syncRecovery.current === 'reload-cloud') {
          setSyncState('saving')
          setSyncMessage('Ricaricamento dati Cloud in corso')
          try {
            await saveQueue.current
            const remote = await cloudRepository.load()
            if (!remote) {
              throw new Error(
                'Archivio Cloud non trovato: nessun dato è stato sovrascritto',
              )
            }
            const hydrated: AppState = {
              ...remote,
              dataSettings: { ...remote.dataSettings, mode: 'cloud' },
            }
            unsubscribe.current()
            activeRepository.current = cloudRepository
            unsubscribe.current =
              cloudRepository.subscribe?.((next) => applyState(next)) ??
              (() => undefined)
            writeModePreference(companyId, 'cloud')
            writeCloudRecovery(companyId, false)
            applyState(hydrated)
            syncRecovery.current = 'retry-save'
            setSyncState('saved')
            setSyncMessage('Dati Cloud ricaricati')
          } catch (error) {
            setSyncState('error')
            setSyncMessage(
              error instanceof Error
                ? error.message
                : 'Ricaricamento Cloud non riuscito',
            )
          }
          return
        }
        const next = stateRef.current
        setSyncState('saving')
        setSyncMessage('Sincronizzazione forzata in corso')
        saveQueue.current = saveQueue.current
          .then(() => activeRepository.current.save(next))
          .then(async () => {
            setSyncState('saved')
            setSyncMessage('Salvataggio completato')
            await saveDriveBackup(next)
          })
          .catch((error: unknown) => {
            setSyncState('error')
            setSyncMessage(
              error instanceof Error
                ? error.message
                : 'Salvataggio non riuscito',
            )
          })
        await saveQueue.current
      },
      updateCompany: (patch: Partial<Company>) => {
        updateState((current) => ({
          ...current,
          company: patchCompany(current.company, patch),
          accounting: {
            ...current.accounting,
            companies: current.accounting.companies.map((company) =>
              company.id === current.accounting.activeCompanyId
                ? {
                    ...company,
                    name: patch.name ?? company.name,
                    taxId: patch.taxId ?? company.taxId,
                  }
                : company,
            ),
          },
        }))
      },
      setActiveAccountingCompany: (activeCompanyId: string) => {
        if (
          !stateRef.current.accounting.companies.some(
            (company) => company.id === activeCompanyId,
          )
        ) {
          return
        }
        updateState((current) => ({
          ...current,
          accounting: {
            ...current.accounting,
            activeCompanyId,
          },
        }))
      },
      addAccountingCompany: (input: AccountingCompanyInput) => {
        const current = stateRef.current
        const error = validateAccountingCompany(
          current.accounting.companies,
          input,
        )
        if (error) return { ok: false, error }

        const company: AccountingCompany = {
          ...input,
          id: createId('accounting-company'),
          name: input.name.trim(),
          taxId: input.taxId.trim(),
          city: input.city.trim(),
          notes: input.notes.trim(),
        }
        updateState((next) => ({
          ...next,
          accounting: {
            ...next.accounting,
            companies: [...next.accounting.companies, company],
            activeCompanyId: company.id,
          },
        }))
        return { ok: true }
      },
      updateAccountingCompany: (
        companyId: string,
        input: AccountingCompanyInput,
      ) => {
        const current = stateRef.current
        if (
          !current.accounting.companies.some(
            (company) => company.id === companyId,
          )
        ) {
          return { ok: false, error: 'Azienda non trovata.' }
        }
        const error = validateAccountingCompany(
          current.accounting.companies,
          input,
          companyId,
        )
        if (error) return { ok: false, error }

        const patch = {
          ...input,
          name: input.name.trim(),
          taxId: input.taxId.trim(),
          city: input.city.trim(),
          notes: input.notes.trim(),
        }
        updateState((next) => ({
          ...next,
          company:
            next.company.id === companyId
              ? patchCompany(next.company, {
                  name: patch.name,
                  taxId: patch.taxId,
                })
              : next.company,
          accounting: {
            ...next.accounting,
            companies: next.accounting.companies.map((company) =>
              company.id === companyId ? { ...company, ...patch } : company,
            ),
          },
        }))
        return { ok: true }
      },
      addStore: (input: NewStoreInput) => {
        if (
          !stateRef.current.accounting.companies.some(
            (company) => company.id === input.companyId,
          )
        ) {
          return { ok: false, error: 'Seleziona un’azienda valida' }
        }
        if (!input.storeName.trim()) {
          return { ok: false, error: 'Inserisci il nome del punto vendita' }
        }
        const accountingSeller = stateRef.current.accounting.sellers.find(
          (seller) =>
            seller.id === input.accountingSellerId &&
            seller.companyId === input.companyId &&
            Boolean(seller.name.trim()),
        )
        if (!accountingSeller) {
          return { ok: false, error: 'Seleziona una venditrice valida' }
        }
        const linkedSeller = stateRef.current.sellers.find(
          (seller) =>
            seller.companyId === input.companyId &&
            seller.accountingSellerId === accountingSeller.id,
        )
        if (
          linkedSeller &&
          stateRef.current.stores.some(
            (store) => store.sellerId === linkedSeller.id,
          )
        ) {
          return {
            ok: false,
            error:
              'Questa venditrice è già assegnata a un altro punto vendita',
          }
        }
        const created = linkedSeller
          ? {
              seller: linkedSeller,
              store: {
                id: createId('store'),
                companyId: input.companyId,
                name: input.storeName.trim(),
                city: input.city.trim(),
                sellerId: linkedSeller.id,
              },
            }
          : createStoreWithSeller({ ...input, accountingSeller })
        updateState((current) => ({
          ...current,
          stores: [...current.stores, created.store],
          sellers: linkedSeller
            ? current.sellers
            : [...current.sellers, created.seller],
        }))
        return { ok: true }
      },
      setSellerViberUserId: (sellerId: string, value: string) => {
        const viberUserId = value.trim()
        if (
          viberUserId &&
          stateRef.current.sellers.some(
            (seller) =>
              seller.id !== sellerId &&
              seller.viberUserId === viberUserId,
          )
        ) {
          return {
            ok: false,
            error:
              'Questo ID Viber è già assegnato a un altro punto vendita',
          }
        }
        updateState((current) => ({
          ...current,
          sellers: current.sellers.map((seller) =>
            seller.id === sellerId ? { ...seller, viberUserId } : seller,
          ),
        }))
        return { ok: true }
      },
      removeStore: (storeId: string) => {
        updateState((current) => {
          const store = current.stores.find((item) => item.id === storeId)
          if (!store) return current
          const stores = current.stores.filter((item) => item.id !== storeId)
          const sellerStillAssigned = stores.some(
            (item) => item.sellerId === store.sellerId,
          )
          const routeSeller = current.sellers.find(
            (item) => item.id === store.sellerId,
          )
          const sellers = sellerStillAssigned
            ? current.sellers
            : current.sellers.filter((item) => item.id !== store.sellerId)
          const accountingSellerId = routeSeller?.accountingSellerId
          const accountingSeller = current.accounting.sellers.find(
            (item) => item.id === accountingSellerId,
          )
          const generatedSeller =
            accountingSeller?.notes.startsWith(
              'Responsabile del punto vendita ',
            ) ||
            accountingSeller?.notes ===
              'Venditrice collegata a un punto vendita'
          const accountingSellerHasData =
            accountingSellerId !== undefined &&
            (current.accounting.invoices.some(
              (item) => item.sellerId === accountingSellerId,
            ) ||
              current.accounting.takings.some(
                (item) => item.sellerId === accountingSellerId,
              ) ||
              current.accounting.expenses.some(
                (item) => item.sellerId === accountingSellerId,
              ) ||
              current.accounting.productionSettings.some((item) =>
                item.sellerIds.includes(accountingSellerId),
              ))
          return {
            ...current,
            stores,
            sellers,
            accounting:
              generatedSeller &&
              !sellerStillAssigned &&
              !accountingSellerHasData
                ? {
                    ...current.accounting,
                    sellers: current.accounting.sellers.filter(
                      (item) => item.id !== accountingSellerId,
                    ),
                  }
                : current.accounting,
          }
        })
      },
      setDataMode: async (mode: DataMode) => {
        if (mode === state.dataSettings.mode) return
        if (
          mode === 'cloud' &&
          (!driveServiceConfigured || !loadDriveSession())
        ) {
          setSyncState('error')
          setSyncMessage(
            'Collega Google Drive nelle Impostazioni per usare il cloud',
          )
          return
        }
        setSyncState('saving')
        setSyncMessage('Migrazione archivio in corso')
        const destination: AppRepository =
          mode === 'cloud' ? cloudRepository : localRepository
        let migrated = withTimestamp({
          ...state,
          dataSettings: { ...state.dataSettings, mode },
        })
        try {
          await saveQueue.current
          if (mode === 'cloud') {
            const remote = await destination.load()
            if (remote) {
              migrated = withTimestamp({
                ...remote,
                dataSettings: { ...remote.dataSettings, mode },
              })
            }
          }
          await destination.save(migrated)
          unsubscribe.current()
          activeRepository.current = destination
          syncRecovery.current = 'retry-save'
          unsubscribe.current =
            destination.subscribe?.((next) => applyState(next)) ??
            (() => undefined)
          writeModePreference(companyId, mode)
          writeCloudRecovery(companyId, false)
          applyState(migrated)
          setSyncState('saved')
          setSyncMessage('Modalità dati aggiornata')
        } catch (error) {
          syncRecovery.current =
            mode === 'cloud' ? 'reload-cloud' : 'retry-save'
          writeCloudRecovery(companyId, mode === 'cloud')
          setSyncState('error')
          setSyncMessage(
            error instanceof Error ? error.message : 'Migrazione non riuscita',
          )
        }
      },
      setDriveBackup: (enabled: boolean) => {
        setDriveSyncState('idle')
        setDriveSyncMessage(null)
        updateState((current) => ({
          ...current,
          dataSettings: {
            ...current.dataSettings,
            driveBackupAfterApproval: enabled,
          },
        }))
      },
      setDriveFolder: (folder: string) => {
        updateState((current) => ({
          ...current,
          dataSettings: {
            ...current.dataSettings,
            driveFolder: folder,
          },
        }))
      },
      selectDriveFolder: async () => {
        if (!window.desktopApp) {
          setDriveSyncState('error')
          setDriveSyncMessage(
            'La scelta della cartella è disponibile nell’EXE Windows',
          )
          return
        }
        try {
          const folder = await window.desktopApp.selectDriveBackupFolder()
          if (!folder) return
          const next = withTimestamp({
            ...stateRef.current,
            dataSettings: {
              ...stateRef.current.dataSettings,
              driveFolder: folder,
            },
          })
          setDriveSyncState('idle')
          setDriveSyncMessage(null)
          applyState(next)
          enqueueSave(next)
        } catch (error) {
          setDriveSyncState('error')
          setDriveSyncMessage(
            error instanceof Error
              ? error.message
              : 'Scelta della cartella non riuscita',
          )
        }
      },
      syncDriveBackup: async () => {
        await saveQueue.current
        await saveDriveBackup(stateRef.current)
      },
      archiveSeason: async (name: string) => {
        const current = stateRef.current
        const activeCompanyId = current.accounting.activeCompanyId
        const activeCompany = current.accounting.companies.find(
          (company) => company.id === activeCompanyId,
        )
        const archiveName = name.trim()
        const folder = current.dataSettings.driveFolder.trim()
        if (!archiveName) {
          return { ok: false, error: 'Inserisci il nome della stagione.' }
        }
        if (!activeCompanyId || !activeCompany) {
          return { ok: false, error: 'Seleziona prima un’azienda.' }
        }
        if (!window.desktopApp || !folder || /^https?:\/\//i.test(folder)) {
          return {
            ok: false,
            error:
              'Seleziona nell’EXE Windows una cartella locale prima di archiviare.',
          }
        }
        const archivedAt = new Date()
        const archiveState = createCompanyState(current, activeCompanyId)
        const timestamp = archivedAt
          .toISOString()
          .replace(/[-:]/g, '')
          .replace('T', '-')
          .slice(0, 15)
        const filename = `stagione-${safeFilenamePart(archiveName)}-${safeFilenamePart(activeCompany.name)}-${timestamp}.json`
        const content = JSON.stringify(
          {
            app: 'fatture-incassi-pro',
            version: 9,
            archive: {
              type: 'season',
              name: archiveName,
              companyId: activeCompanyId,
              companyName: activeCompany.name,
              archivedAt: archivedAt.toISOString(),
            },
            data: archiveState,
          },
          null,
          2,
        )
        try {
          const destination = await window.desktopApp.saveDriveBackup(
            folder,
            filename,
            content,
          )
          const resetState = withTimestamp(
            resetActiveCompanySeason(current, activeCompanyId),
          )
          setSyncState('saving')
          setSyncMessage('Reset del nuovo esercizio in corso')
          const persistence = saveQueue.current.then(() =>
            activeRepository.current.save(resetState),
          )
          saveQueue.current = persistence.catch(() => undefined)
          await persistence
          applyState(resetState)
          setSyncState('saved')
          setSyncMessage('Stagione archiviata e nuovo esercizio pronto')
          await saveDriveBackup(resetState)
          return { ok: true, destination }
        } catch (error) {
          setSyncState('error')
          setSyncMessage(
            error instanceof Error
              ? error.message
              : 'Archiviazione stagione non riuscita',
          )
          return {
            ok: false,
            error:
              error instanceof Error
                ? error.message
                : 'Archiviazione stagione non riuscita',
          }
        }
      },
      restoreSeasonArchive: async (json: string) => {
        const current = stateRef.current
        const activeCompanyId = current.accounting.activeCompanyId
        if (!activeCompanyId) {
          return { ok: false, error: 'Seleziona prima un’azienda.' }
        }
        try {
          const cleared = clearActiveCompanyData(current, activeCompanyId)
          const restored = withTimestamp(
            importLegacyIntoActiveCompany(cleared, json),
          )
          setSyncState('saving')
          setSyncMessage('Ripristino stagione in corso')
          const persistence = saveQueue.current.then(() =>
            activeRepository.current.save(restored),
          )
          saveQueue.current = persistence.catch(() => undefined)
          await persistence
          applyState(restored)
          setSyncState('saved')
          setSyncMessage('Stagione ripristinata')
          await saveDriveBackup(restored)
          return { ok: true }
        } catch (error) {
          setSyncState('error')
          setSyncMessage(
            error instanceof Error
              ? error.message
              : 'Ripristino stagione non riuscito',
          )
          return {
            ok: false,
            error:
              error instanceof Error
                ? error.message
                : 'Ripristino stagione non riuscito',
          }
        }
      },
      setCurrency: (currency: Currency) => {
        updateState((current) => ({
          ...current,
          dataSettings: {
            ...current.dataSettings,
            currency,
          },
        }))
      },
      setImageRetention: (days: number | null) => {
        updateState((current) => ({
          ...current,
          dataSettings: {
            ...current.dataSettings,
            imageRetentionDays: days,
          },
        }))
      },
      setLanguage: (language: InterfaceLanguage) => {
        updateState((current) => ({
          ...current,
          dataSettings: {
            ...current.dataSettings,
            language,
          },
        }))
      },
      setInterfaceBackground: (background: InterfaceBackground) => {
        updateState((current) => ({
          ...current,
          dataSettings: {
            ...current.dataSettings,
            background,
          },
        }))
      },
      setInterfaceTextColor: (textColor: InterfaceTextColor) => {
        updateState((current) => ({
          ...current,
          dataSettings: {
            ...current.dataSettings,
            textColor,
          },
        }))
      },
      updateAccounting: (updater) => {
        updateState((current) => ({
          ...current,
          accounting: updater(current.accounting),
        }))
      },
      updateReviewDocuments: (updater) => {
        updateState((current) => ({
          ...current,
          reviewDocuments: updater(current.reviewDocuments),
        }))
      },
      importLegacyData: (json: string) => {
        try {
          updateState((current) =>
            importLegacyIntoActiveCompany(current, json),
          )
          return { ok: true }
        } catch (error) {
          return {
            ok: false,
            error:
              error instanceof Error ? error.message : 'Importazione fallita',
          }
        }
      },
      exportUnifiedData: () => {
        const current = stateRef.current
        const companyId = current.accounting.activeCompanyId
        return exportUnifiedState(
          companyId ? createCompanyState(current, companyId) : current,
        )
      },
      exportLegacyData: () => {
        const current = stateRef.current
        const companyId = current.accounting.activeCompanyId
        return exportLegacyAccounting(
          companyId
            ? createCompanyState(current, companyId).accounting
            : current.accounting,
        )
      },
    }),
    [
      cloudRepository,
      applyState,
      enqueueSave,
      loading,
      localRepository,
      saveDriveBackup,
      state,
      syncMessage,
      syncState,
      localStoragePaths,
      driveSyncMessage,
      driveSyncState,
      driveAccountEmail,
      updateState,
      companyId,
    ],
  )

  return (
    <AppStoreContext.Provider value={value}>
      {children}
    </AppStoreContext.Provider>
  )
}
