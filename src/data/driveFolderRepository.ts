import type { AppState } from '../domain/types'
import {
  createCompanyState,
  createWorkspaceState,
  mergeCompanyStates,
} from './companyState'
import { normalizeStoredState } from './migrations'
import {
  RepositoryUnavailableError,
  type AppRepository,
} from './repository'

const HANDLE_DATABASE = 'fatture-incassi-pro-drive-folder'
const HANDLE_STORE = 'handles'
const HANDLE_KEY = 'primary'

function workspaceStorageId() {
  return 'workspace'
}

function companyStorageId(companyId: string) {
  return `company-${companyId}`
}

export const DRIVE_WORKSPACE_FILENAME = `${workspaceStorageId()}.json`

export function driveCompanyFilename(companyId: string) {
  return `${companyStorageId(companyId)}.json`
}

function validStorageId(storageId: string) {
  if (!/^[a-zA-Z0-9_-]{1,160}$/.test(storageId)) {
    throw new Error('Identificativo archivio Google Drive non valido')
  }
  return storageId
}

function openHandleDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(HANDLE_DATABASE, 1)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(HANDLE_STORE)) {
        request.result.createObjectStore(HANDLE_STORE)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function readStoredHandle() {
  const database = await openHandleDatabase()
  return new Promise<FileSystemDirectoryHandle | null>((resolve, reject) => {
    const transaction = database.transaction(HANDLE_STORE, 'readonly')
    const request = transaction.objectStore(HANDLE_STORE).get(HANDLE_KEY)
    request.onsuccess = () =>
      resolve((request.result as FileSystemDirectoryHandle | null) ?? null)
    request.onerror = () => reject(request.error)
    transaction.oncomplete = () => database.close()
  })
}

async function saveStoredHandle(handle: FileSystemDirectoryHandle) {
  const database = await openHandleDatabase()
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(HANDLE_STORE, 'readwrite')
    transaction.objectStore(HANDLE_STORE).put(handle, HANDLE_KEY)
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

async function browserDriveHandle(requestPermission = false) {
  const handle = await readStoredHandle()
  if (!handle) return null
  let permission = await handle.queryPermission({ mode: 'readwrite' })
  if (permission === 'prompt' && requestPermission) {
    permission = await handle.requestPermission({ mode: 'readwrite' })
  }
  return permission === 'granted' ? handle : null
}

async function requireBrowserDriveHandle() {
  const handle = await browserDriveHandle()
  if (!handle) {
    throw new RepositoryUnavailableError(
      'Seleziona la cartella Google Drive nelle Impostazioni',
    )
  }
  return handle
}

async function readBrowserState(storageId: string) {
  const directory = await requireBrowserDriveHandle()
  try {
    const handle = await directory.getFileHandle(
      `${validStorageId(storageId)}.json`,
    )
    return (await handle.getFile()).text()
  } catch (error) {
    if (error instanceof DOMException && error.name === 'NotFoundError') {
      return null
    }
    throw error
  }
}

async function saveBrowserState(storageId: string, content: string) {
  const directory = await requireBrowserDriveHandle()
  const handle = await directory.getFileHandle(
    `${validStorageId(storageId)}.json`,
    { create: true },
  )
  const writable = await handle.createWritable()
  await writable.write(content)
  await writable.close()
}

export async function configuredDriveFolderLabel() {
  if (window.desktopApp) return window.desktopApp.getDriveDataFolder()
  const handle = await browserDriveHandle()
  return handle?.name ?? null
}

export async function selectDriveDataFolder() {
  if (window.desktopApp) return window.desktopApp.selectDriveDataFolder()
  if (!window.showDirectoryPicker) {
    throw new Error(
      'Questo browser non consente l’accesso a una cartella locale. Usa Chrome o Edge su PC.',
    )
  }
  const storedHandle = await browserDriveHandle(true)
  if (storedHandle) return storedHandle.name
  const handle = await window.showDirectoryPicker({ mode: 'readwrite' })
  await saveStoredHandle(handle)
  return handle.name
}

export async function openDriveDataFolder() {
  if (!window.desktopApp) return null
  return window.desktopApp.openDriveDataFolder()
}

export class DriveFolderRepository implements AppRepository {
  readonly mode = 'cloud' as const
  private latestKnownRevision: string | null = null
  private operationQueue: Promise<void> = Promise.resolve()

  constructor(private readonly accountId: string) {}

  private runExclusive<Result>(operation: () => Promise<Result>) {
    const result = this.operationQueue.then(operation, operation)
    this.operationQueue = result.then(
      () => undefined,
      () => undefined,
    )
    return result
  }

  private async loadRaw(storageId: string) {
    if (window.desktopApp) {
      return window.desktopApp.loadDriveState(validStorageId(storageId))
    }
    return readBrowserState(storageId)
  }

  private async saveRaw(storageId: string, state: AppState) {
    const content = JSON.stringify(state)
    if (window.desktopApp) {
      await window.desktopApp.saveDriveState(
        validStorageId(storageId),
        content,
      )
      return
    }
    await saveBrowserState(storageId, content)
  }

  private async loadState(storageId: string, companyId = this.accountId) {
    const raw = await this.loadRaw(storageId)
    if (!raw) return null
    try {
      const parsed: unknown = JSON.parse(raw)
      return normalizeStoredState(parsed, companyId)
    } catch {
      throw new Error(`${storageId}.json non è un archivio valido`)
    }
  }

  private async loadSnapshot() {
    const workspace = await this.loadState(workspaceStorageId())
    if (!workspace) {
      return { state: null, revision: null }
    }
    const companyStates = await Promise.all(
      workspace.accounting.companies.map((company) =>
        this.loadState(companyStorageId(company.id), company.id),
      ),
    )
    const missingCompanyIndex = companyStates.findIndex(
      (state) => state === null,
    )
    if (missingCompanyIndex !== -1) {
      const company = workspace.accounting.companies[missingCompanyIndex]
      throw new Error(
        `Manca company-${company.id}.json per ${company.name}. Nessun archivio locale è stato usato al suo posto.`,
      )
    }
    const loadedCompanyStates = companyStates as AppState[]
    const activeCompanyIndex = workspace.accounting.companies.findIndex(
      (company) => company.id === workspace.accounting.activeCompanyId,
    )
    if (
      activeCompanyIndex !== -1 &&
      loadedCompanyStates[activeCompanyIndex].updatedAt !== workspace.updatedAt
    ) {
      throw new RepositoryUnavailableError(
        'Google Drive sta ancora allineando i file tra i PC. Attendi e ricarica i dati.',
      )
    }
    return {
      state: mergeCompanyStates(workspace, loadedCompanyStates),
      revision: [
        `workspace:${workspace.updatedAt}`,
        ...workspace.accounting.companies.map(
          (company, index) =>
            `${company.id}:${loadedCompanyStates[index].updatedAt}`,
        ),
      ].join('|'),
    }
  }

  private async ensureCurrentVersion() {
    if (this.latestKnownRevision === null) return
    const snapshot = await this.loadSnapshot()
    if (snapshot.revision !== this.latestKnownRevision) {
      throw new Error(
        'I dati sono stati modificati da un altro PC. Ricarica prima di salvare.',
      )
    }
  }

  async load() {
    return this.runExclusive(async () => {
      const snapshot = await this.loadSnapshot()
      this.latestKnownRevision = snapshot.revision
      return snapshot.state
    })
  }

  async save(state: AppState) {
    await this.runExclusive(async () => {
      await this.ensureCurrentVersion()
      const activeCompanyId = state.accounting.activeCompanyId
      if (activeCompanyId) {
        await this.saveRaw(
          companyStorageId(activeCompanyId),
          createCompanyState(state, activeCompanyId),
        )
      }
      await this.saveRaw(workspaceStorageId(), createWorkspaceState(state))
      this.latestKnownRevision = (await this.loadSnapshot()).revision
    })
  }

  async saveAll(state: AppState) {
    await this.runExclusive(async () => {
      await this.ensureCurrentVersion()
      await Promise.all(
        state.accounting.companies.map((company) =>
          this.saveRaw(
            companyStorageId(company.id),
            createCompanyState(state, company.id),
          ),
        ),
      )
      await this.saveRaw(workspaceStorageId(), createWorkspaceState(state))
      this.latestKnownRevision = (await this.loadSnapshot()).revision
    })
  }

  subscribe(listener: (state: AppState) => void) {
    let cancelled = false
    let loading = false
    let lastRevision = this.latestKnownRevision
    const refresh = async () => {
      if (cancelled || loading) return
      loading = true
      try {
        const snapshot = await this.runExclusive(() => this.loadSnapshot())
        if (
          snapshot.state &&
          lastRevision !== null &&
          snapshot.revision !== lastRevision
        ) {
          lastRevision = snapshot.revision
          this.latestKnownRevision = snapshot.revision
          listener(snapshot.state)
        } else if (snapshot.state) {
          lastRevision = snapshot.revision
          this.latestKnownRevision = snapshot.revision
        }
      } catch {
        return
      } finally {
        loading = false
      }
    }
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') void refresh()
    }
    const timer = window.setInterval(() => void refresh(), 5_000)
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refreshWhenVisible)
    return () => {
      cancelled = true
      window.clearInterval(timer)
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refreshWhenVisible)
    }
  }
}
