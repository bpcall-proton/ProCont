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
  createInitialState,
  createStoreWithSeller,
  updateCompany as patchCompany,
} from '../domain/defaults'
import type { AppState, Company, DataMode, SyncState } from '../domain/types'
import { CloudRepository } from '../data/cloudRepository'
import { LocalRepository } from '../data/localRepository'
import type { AppRepository } from '../data/repository'
import {
  AppStoreContext,
  type AppStoreContextValue,
  type NewStoreInput,
} from './AppStoreContext'

function withTimestamp(state: AppState): AppState {
  return { ...state, updatedAt: new Date().toISOString() }
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
        }))
      },
      addStore: (input: NewStoreInput) => {
        const { store, seller } = createStoreWithSeller(input)
        updateState((current) => ({
          ...current,
          stores: [...current.stores, store],
          sellers: [...current.sellers, seller],
        }))
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
      setImageRetention: (days: number | null) => {
        updateState((current) => ({
          ...current,
          dataSettings: {
            ...current.dataSettings,
            imageRetentionDays: days,
          },
        }))
      },
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
