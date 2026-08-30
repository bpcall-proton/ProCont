import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { firebaseConfigured } from '../auth/firebase'
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
  DataMode,
  InterfaceLanguage,
  SyncState,
} from '../domain/types'
import { CloudRepository } from '../data/cloudRepository'
import { LocalRepository } from '../data/localRepository'
import type { AppRepository } from '../data/repository'
import {
  exportLegacyAccounting,
  exportUnifiedState,
  importLegacyIntoState,
} from '../data/migrations'
import { normalizeSenderPhone } from '../domain/senderRouting'
import {
  AppStoreContext,
  type AccountingCompanyInput,
  type AppStoreContextValue,
  type NewStoreInput,
} from './AppStoreContext'

function withTimestamp(state: AppState): AppState {
  const invoiceValue = state.accounting.invoices.reduce(
    (total, invoice) => total + invoice.total,
    0,
  )
  const theoreticalRevenue = state.accounting.invoices.reduce(
    (total, invoice) => total + invoice.theoreticalRevenue,
    0,
  )
  const realTakings = state.accounting.takings.reduce(
    (total, taking) =>
      total +
      (taking.realTotal > 0 ? taking.realTotal : taking.cash + taking.pos),
    0,
  )
  return {
    ...state,
    financial: {
      invoiceValue,
      theoreticalRevenue,
      realTakings,
      stockRevenue: theoreticalRevenue - realTakings,
    },
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

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const sessionUser = user
  if (!sessionUser) throw new Error('Sessione utente richiesta')
  const { companyId, preview } = sessionUser

  const localRepository = useMemo(
    () => new LocalRepository(companyId),
    [companyId],
  )
  const cloudRepository = useMemo(
    () => new CloudRepository(companyId),
    [companyId],
  )
  const [state, setState] = useState<AppState>(() =>
    createInitialState(companyId),
  )
  const [loading, setLoading] = useState(true)
  const [syncState, setSyncState] = useState<SyncState>('idle')
  const [syncMessage, setSyncMessage] = useState<string | null>(null)
  const activeRepository = useRef<AppRepository>(localRepository)
  const saveQueue = useRef(Promise.resolve())
  const stateRef = useRef(state)
  const unsubscribe = useRef<() => void>(() => undefined)

  const applyState = useCallback((next: AppState) => {
    stateRef.current = next
    setState(next)
  }, [])

  const enqueueSave = useCallback((next: AppState) => {
    setSyncState('saving')
    setSyncMessage(null)
    saveQueue.current = saveQueue.current
      .then(() => activeRepository.current.save(next))
      .then(() => setSyncState('saved'))
      .catch((error: unknown) => {
        setSyncState('error')
        setSyncMessage(
          error instanceof Error ? error.message : 'Salvataggio non riuscito',
        )
      })
  }, [])

  useEffect(() => {
    let cancelled = false
    async function hydrate() {
      const local = await localRepository.load()
      const initial = local ?? createInitialState(companyId)
      const requestedMode =
        readModePreference(companyId) ?? initial.dataSettings.mode
      const repository: AppRepository =
        requestedMode === 'cloud' && firebaseConfigured
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
          applyState(hydrated)
          unsubscribe.current()
          unsubscribe.current =
            repository.subscribe?.((next) => applyState(next)) ??
            (() => undefined)
        }
      } catch {
        activeRepository.current = localRepository
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
      cloudAvailable: firebaseConfigured && !preview,
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
        const phone = normalizeSenderPhone(input.sellerPhone)
        if (!phone) {
          return { ok: false, error: 'Inserisci un numero di telefono valido' }
        }
        if (
          stateRef.current.sellers.some(
            (seller) => normalizeSenderPhone(seller.phone) === phone,
          )
        ) {
          return {
            ok: false,
            error:
              'Questo numero è già assegnato: ogni ragazza deve identificare un solo punto vendita',
          }
        }
        const viberUserId = input.sellerViberUserId.trim()
        if (
          viberUserId &&
          stateRef.current.sellers.some(
            (seller) => seller.viberUserId === viberUserId,
          )
        ) {
          return {
            ok: false,
            error:
              'Questo ID Viber è già assegnato a un altro punto vendita',
          }
        }
        const { store, seller, accountingSeller } =
          createStoreWithSeller(input)
        updateState((current) => ({
          ...current,
          stores: [...current.stores, store],
          sellers: [...current.sellers, seller],
          accounting: {
            ...current.accounting,
            sellers: [...current.accounting.sellers, accountingSeller],
          },
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
          return {
            ...current,
            stores: current.stores.filter((item) => item.id !== storeId),
            sellers: store
              ? current.sellers.filter((item) => item.id !== store.sellerId)
              : current.sellers,
          }
        })
      },
      setDataMode: async (mode: DataMode) => {
        if (mode === state.dataSettings.mode) return
        if (mode === 'cloud' && (!firebaseConfigured || preview)) {
          setSyncState('error')
          setSyncMessage(
            'Configura Firebase e accedi con un account reale per usare il cloud',
          )
          return
        }
        setSyncState('saving')
        setSyncMessage('Migrazione archivio in corso')
        const destination: AppRepository =
          mode === 'cloud' ? cloudRepository : localRepository
        const migrated = withTimestamp({
          ...state,
          dataSettings: { ...state.dataSettings, mode },
        })
        try {
          await saveQueue.current
          await destination.save(migrated)
          unsubscribe.current()
          activeRepository.current = destination
          unsubscribe.current =
            destination.subscribe?.((next) => applyState(next)) ??
            (() => undefined)
          writeModePreference(companyId, mode)
          applyState(migrated)
          setSyncState('saved')
          setSyncMessage('Modalità dati aggiornata')
        } catch (error) {
          setSyncState('error')
          setSyncMessage(
            error instanceof Error ? error.message : 'Migrazione non riuscita',
          )
        }
      },
      setDriveBackup: (enabled: boolean) => {
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
      updateAccounting: (updater) => {
        updateState((current) => ({
          ...current,
          accounting: updater(current.accounting),
        }))
      },
      importLegacyData: (json: string) => {
        try {
          updateState((current) => importLegacyIntoState(current, json))
          return { ok: true }
        } catch (error) {
          return {
            ok: false,
            error:
              error instanceof Error ? error.message : 'Importazione fallita',
          }
        }
      },
      exportUnifiedData: () => exportUnifiedState(stateRef.current),
      exportLegacyData: () =>
        exportLegacyAccounting(stateRef.current.accounting),
    }),
    [
      cloudRepository,
      applyState,
      loading,
      localRepository,
      state,
      syncMessage,
      syncState,
      updateState,
      companyId,
      preview,
    ],
  )

  return (
    <AppStoreContext.Provider value={value}>
      {children}
    </AppStoreContext.Provider>
  )
}
