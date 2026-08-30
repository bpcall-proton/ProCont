import type { AppState } from '../domain/types'
import {
  createCompanyState,
  createWorkspaceState,
  mergeCompanyStates,
} from './companyState'
import { normalizeStoredState } from './migrations'
import type { AppRepository } from './repository'

const DATABASE_NAME = 'fatture-incassi-pro'
const STORE_NAME = 'application-state'

function workspaceStorageId(accountId: string) {
  return `${accountId}-workspace`
}

function companyStorageId(companyId: string) {
  return `company-${companyId}`
}

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function loadFromIndexedDb(storageId: string, companyId: string) {
  const database = await openDatabase()
  return new Promise<AppState | null>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readonly')
    const request = transaction.objectStore(STORE_NAME).get(storageId)
    request.onsuccess = () =>
      resolve(normalizeStoredState(request.result, companyId))
    request.onerror = () => {
      database.close()
      reject(request.error)
    }
    transaction.oncomplete = () => database.close()
  })
}

async function saveToIndexedDb(storageId: string, state: AppState) {
  const database = await openDatabase()
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite')
    transaction.objectStore(STORE_NAME).put(state, storageId)
    transaction.oncomplete = () => {
      database.close()
      resolve()
    }
    transaction.onerror = () => {
      database.close()
      reject(transaction.error)
    }
  })
}

export class LocalRepository implements AppRepository {
  readonly mode = 'local' as const

  constructor(private readonly companyId: string) {}

  private async loadState(storageId: string) {
    if (window.desktopApp) {
      const raw = await window.desktopApp.loadLocalState(storageId)
      if (!raw) return null
      try {
        const parsed: unknown = JSON.parse(raw)
        return normalizeStoredState(parsed, this.companyId)
      } catch {
        return null
      }
    }
    return loadFromIndexedDb(storageId, this.companyId)
  }

  private async saveState(storageId: string, state: AppState) {
    if (window.desktopApp) {
      await window.desktopApp.saveLocalState(
        storageId,
        JSON.stringify(state),
      )
      return
    }
    await saveToIndexedDb(storageId, state)
  }

  private async saveAllCompanyStates(state: AppState) {
    await Promise.all(
      state.accounting.companies.map((company) =>
        this.saveState(
          companyStorageId(company.id),
          createCompanyState(state, company.id),
        ),
      ),
    )
  }

  async load() {
    const workspace = await this.loadState(workspaceStorageId(this.companyId))
    if (workspace) {
      const companyStates = await Promise.all(
        workspace.accounting.companies.map((company) =>
          this.loadState(companyStorageId(company.id)),
        ),
      )
      return mergeCompanyStates(
        workspace,
        companyStates.filter((state): state is AppState => state !== null),
      )
    }

    const legacyState = await this.loadState(this.companyId)
    if (!legacyState) return null
    await this.saveAllCompanyStates(legacyState)
    await this.saveState(
      workspaceStorageId(this.companyId),
      createWorkspaceState(legacyState),
    )
    return legacyState
  }

  async save(state: AppState) {
    const activeCompanyId = state.accounting.activeCompanyId
    if (activeCompanyId) {
      await this.saveState(
        companyStorageId(activeCompanyId),
        createCompanyState(state, activeCompanyId),
      )
    }
    await this.saveState(
      workspaceStorageId(this.companyId),
      createWorkspaceState(state),
    )
  }
}
