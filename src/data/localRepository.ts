import type { AppState } from '../domain/types'
import type { AppRepository } from './repository'

const DATABASE_NAME = 'fatture-incassi-pro'
const STORE_NAME = 'application-state'

function validState(value: unknown): value is AppState {
  return (
    typeof value === 'object' &&
    value !== null &&
    'schemaVersion' in value &&
    value.schemaVersion === 1
  )
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

async function loadFromIndexedDb(companyId: string) {
  const database = await openDatabase()
  return new Promise<AppState | null>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readonly')
    const request = transaction.objectStore(STORE_NAME).get(companyId)
    request.onsuccess = () =>
      resolve(validState(request.result) ? request.result : null)
    request.onerror = () => {
      database.close()
      reject(request.error)
    }
    transaction.oncomplete = () => database.close()
  })
}

async function saveToIndexedDb(companyId: string, state: AppState) {
  const database = await openDatabase()
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite')
    transaction.objectStore(STORE_NAME).put(state, companyId)
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

  async load() {
    if (window.desktopApp) {
      const raw = await window.desktopApp.loadLocalState(this.companyId)
      if (!raw) return null
      try {
        const parsed: unknown = JSON.parse(raw)
        return validState(parsed) ? parsed : null
      } catch {
        return null
      }
    }
    return loadFromIndexedDb(this.companyId)
  }

  async save(state: AppState) {
    if (window.desktopApp) {
      await window.desktopApp.saveLocalState(
        this.companyId,
        JSON.stringify(state),
      )
      return
    }
    await saveToIndexedDb(this.companyId, state)
  }
}
