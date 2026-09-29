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
const DEVICE_ID_KEY = 'fip:drive-device-id'
const SNAPSHOT_FORMAT = 'fip-drive-snapshot-v1'

type RevisionClock = Record<string, number>

interface DriveSnapshot {
  format: typeof SNAPSHOT_FORMAT
  deviceId: string
  clock: RevisionClock
  state: AppState
}

interface SnapshotCandidate {
  state: AppState
  clock: RevisionClock
}

function workspaceStorageId() {
  return 'workspace'
}

function companyStorageId(companyId: string) {
  return `company-${companyId}`
}

function driveDeviceId() {
  const stored = localStorage.getItem(DEVICE_ID_KEY)
  if (stored && /^[a-zA-Z0-9_-]{1,80}$/.test(stored)) return stored
  const created = crypto.randomUUID().replace(/-/g, '')
  localStorage.setItem(DEVICE_ID_KEY, created)
  return created
}

function deviceStorageId(deviceId: string) {
  return `device-${deviceId}`
}

function validDeviceStorageId(storageId: string) {
  return /^device-[a-zA-Z0-9_-]{1,80}$/.test(storageId)
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

async function listBrowserStates() {
  const directory = await requireBrowserDriveHandle()
  const storageIds: string[] = []
  for await (const [filename, handle] of directory.entries()) {
    if (
      handle.kind === 'file' &&
      /^[a-zA-Z0-9_-]{1,160}\.json$/.test(filename)
    ) {
      storageIds.push(filename.replace(/\.json$/, ''))
    }
  }
  return storageIds
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

function normalizedClock(value: unknown): RevisionClock | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const clock: RevisionClock = {}
  for (const [deviceId, revision] of Object.entries(value)) {
    if (
      !/^[a-zA-Z0-9_-]{1,80}$/.test(deviceId) ||
      typeof revision !== 'number' ||
      !Number.isSafeInteger(revision) ||
      revision < 0
    ) {
      return null
    }
    clock[deviceId] = revision
  }
  return clock
}

function dominates(left: RevisionClock, right: RevisionClock) {
  const deviceIds = new Set([...Object.keys(left), ...Object.keys(right)])
  let isNewer = false
  for (const deviceId of deviceIds) {
    const leftRevision = left[deviceId] ?? 0
    const rightRevision = right[deviceId] ?? 0
    if (leftRevision < rightRevision) return false
    if (leftRevision > rightRevision) isNewer = true
  }
  return isNewer
}

function mergeClocks(clocks: RevisionClock[]) {
  const merged: RevisionClock = {}
  clocks.forEach((clock) => {
    Object.entries(clock).forEach(([deviceId, revision]) => {
      merged[deviceId] = Math.max(merged[deviceId] ?? 0, revision)
    })
  })
  return merged
}

function stateFingerprint(state: AppState) {
  const content = JSON.stringify(state)
  let hash = 2166136261
  for (let index = 0; index < content.length; index += 1) {
    hash ^= content.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `${state.updatedAt}:${(hash >>> 0).toString(16)}`
}

export class DriveFolderRepository implements AppRepository {
  readonly mode = 'cloud' as const
  private latestKnownRevision: string | null = null
  private latestKnownClock: RevisionClock = {}
  private operationQueue: Promise<void> = Promise.resolve()
  private readonly deviceId = driveDeviceId()

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

  private async listStorageIds() {
    if (window.desktopApp) return window.desktopApp.listDriveStates()
    return listBrowserStates()
  }

  private async saveRaw(storageId: string, content: string) {
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

  private async loadCanonicalState() {
    const workspace = await this.loadState(workspaceStorageId())
    if (!workspace) return null
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
    return mergeCompanyStates(workspace, loadedCompanyStates)
  }

  private async loadDeviceSnapshot(storageId: string) {
    const raw = await this.loadRaw(storageId)
    if (!raw) return null
    try {
      const parsed: unknown = JSON.parse(raw)
      if (
        !parsed ||
        typeof parsed !== 'object' ||
        Array.isArray(parsed) ||
        !('format' in parsed) ||
        parsed.format !== SNAPSHOT_FORMAT ||
        !('deviceId' in parsed) ||
        typeof parsed.deviceId !== 'string' ||
        !validDeviceStorageId(deviceStorageId(parsed.deviceId)) ||
        !('clock' in parsed) ||
        !('state' in parsed)
      ) {
        return null
      }
      const clock = normalizedClock(parsed.clock)
      const state = normalizeStoredState(parsed.state, this.accountId)
      if (!clock || !state) return null
      return { state, clock } satisfies SnapshotCandidate
    } catch {
      return null
    }
  }

  private async loadSnapshot() {
    const storageIds = await this.listStorageIds()
    const deviceCandidates = (
      await Promise.all(
        storageIds
          .filter(validDeviceStorageId)
          .map((storageId) => this.loadDeviceSnapshot(storageId)),
      )
    ).filter(
      (candidate): candidate is SnapshotCandidate => candidate !== null,
    )
    let canonicalState: AppState | null = null
    let canonicalError: unknown = null
    try {
      canonicalState = await this.loadCanonicalState()
    } catch (error) {
      canonicalError = error
    }
    const candidates: SnapshotCandidate[] = [
      ...deviceCandidates,
      ...(canonicalState ? [{ state: canonicalState, clock: {} }] : []),
    ]
    if (candidates.length === 0) {
      if (canonicalError) throw canonicalError
      return { state: null, revision: null, clock: {} }
    }
    const currentCandidates = candidates.filter(
      (candidate) =>
        !candidates.some(
          (other) =>
            other !== candidate && dominates(other.clock, candidate.clock),
        ),
    )
    const candidatesByState = new Map<string, SnapshotCandidate[]>()
    currentCandidates.forEach((candidate) => {
      const fingerprint = stateFingerprint(candidate.state)
      const matching = candidatesByState.get(fingerprint) ?? []
      matching.push(candidate)
      candidatesByState.set(fingerprint, matching)
    })
    if (candidatesByState.size > 1) {
      throw new RepositoryUnavailableError(
        'Sono state rilevate modifiche contemporanee da più PC. Nessun dato è stato sovrascritto: chiudi l’altro PC e scegli quale archivio mantenere.',
      )
    }
    const [matchingCandidates] = candidatesByState.values()
    const state = matchingCandidates[0].state
    const clock = mergeClocks(
      matchingCandidates.map((candidate) => candidate.clock),
    )
    return {
      state,
      revision: stateFingerprint(state),
      clock,
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
      this.latestKnownClock = snapshot.clock
      return snapshot.state
    })
  }

  private async saveDeviceSnapshot(state: AppState) {
    const clock = {
      ...this.latestKnownClock,
      [this.deviceId]: (this.latestKnownClock[this.deviceId] ?? 0) + 1,
    }
    const snapshot: DriveSnapshot = {
      format: SNAPSHOT_FORMAT,
      deviceId: this.deviceId,
      clock,
      state,
    }
    await this.saveRaw(
      deviceStorageId(this.deviceId),
      JSON.stringify(snapshot),
    )
    this.latestKnownClock = clock
    this.latestKnownRevision = stateFingerprint(state)
  }

  async save(state: AppState) {
    await this.runExclusive(async () => {
      await this.ensureCurrentVersion()
      await this.saveDeviceSnapshot(state)
      const activeCompanyId = state.accounting.activeCompanyId
      if (activeCompanyId) {
        await this.saveRaw(
          companyStorageId(activeCompanyId),
          JSON.stringify(createCompanyState(state, activeCompanyId)),
        )
      }
      await this.saveRaw(
        workspaceStorageId(),
        JSON.stringify(createWorkspaceState(state)),
      )
      const snapshot = await this.loadSnapshot()
      this.latestKnownRevision = snapshot.revision
      this.latestKnownClock = snapshot.clock
    })
  }

  async saveAll(state: AppState) {
    await this.runExclusive(async () => {
      await this.ensureCurrentVersion()
      await this.saveDeviceSnapshot(state)
      await Promise.all(
        state.accounting.companies.map((company) =>
          this.saveRaw(
            companyStorageId(company.id),
            JSON.stringify(createCompanyState(state, company.id)),
          ),
        ),
      )
      await this.saveRaw(
        workspaceStorageId(),
        JSON.stringify(createWorkspaceState(state)),
      )
      const snapshot = await this.loadSnapshot()
      this.latestKnownRevision = snapshot.revision
      this.latestKnownClock = snapshot.clock
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
          this.latestKnownClock = snapshot.clock
          listener(snapshot.state)
        } else if (snapshot.state) {
          lastRevision = snapshot.revision
          this.latestKnownRevision = snapshot.revision
          this.latestKnownClock = snapshot.clock
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
