import type { AppState } from '../domain/types'
import {
  createCompanyState,
  createWorkspaceState,
  mergeCompanyStates,
} from './companyState'
import {
  loadMobileDriveSession,
  mobileDriveServiceConfigured,
  mobileDriveSyncUrl,
} from './mobileDriveSession'
import { normalizeStoredState } from './migrations'
import {
  RepositoryUnavailableError,
  type AppRepository,
} from './repository'

interface StoredState {
  content: unknown
  revision: string
}

export class MobileDriveRepository implements AppRepository {
  readonly mode = 'cloud' as const
  private readonly revisions = new Map<string, string>()

  constructor(private readonly accountId: string) {}

  private session() {
    const session = loadMobileDriveSession()
    if (!mobileDriveServiceConfigured || !session) {
      throw new RepositoryUnavailableError(
        'Collega Google Drive dal telefono nelle Impostazioni',
      )
    }
    return session
  }

  private async request(key: string, init?: RequestInit) {
    const session = this.session()
    const response = await fetch(
      `${mobileDriveSyncUrl}/v1/storage/${encodeURIComponent(key)}`,
      {
        ...init,
        headers: {
          ...init?.headers,
          Authorization: `Bearer ${session.deviceToken}`,
        },
      },
    )
    if (response.status === 401) {
      throw new RepositoryUnavailableError(
        'Ricollega Google Drive dal telefono nelle Impostazioni',
      )
    }
    return response
  }

  private async loadKey(key: string, companyId = this.accountId) {
    const response = await this.request(key)
    if (response.status === 404) return null
    if (!response.ok) {
      const body = (await response.json()) as { detail?: string }
      throw new Error(body.detail ?? 'Lettura Google Drive non riuscita')
    }
    const stored = (await response.json()) as StoredState
    this.revisions.set(key, stored.revision)
    return normalizeStoredState(stored.content, companyId)
  }

  private async saveKey(key: string, state: AppState) {
    const response = await this.request(key, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: state,
        expected_revision: this.revisions.get(key) ?? null,
      }),
    })
    if (response.status === 409) {
      throw new Error(
        'I dati sono stati modificati da un altro dispositivo. Ricarica prima di salvare.',
      )
    }
    if (!response.ok) {
      const body = (await response.json()) as { detail?: string }
      throw new Error(body.detail ?? 'Salvataggio Google Drive non riuscito')
    }
    const result = (await response.json()) as { revision: string }
    this.revisions.set(key, result.revision)
  }

  async load() {
    const workspace = await this.loadKey('workspace')
    if (!workspace) return null
    const companyStates = await Promise.all(
      workspace.accounting.companies.map((company) =>
        this.loadKey(`company-${company.id}`, company.id),
      ),
    )
    const missingCompanyIndex = companyStates.findIndex(
      (state) => state === null,
    )
    if (missingCompanyIndex !== -1) {
      const company = workspace.accounting.companies[missingCompanyIndex]
      throw new Error(
        `Manca company-${company.id}.json per ${company.name}.`,
      )
    }
    return mergeCompanyStates(workspace, companyStates as AppState[])
  }

  async save(state: AppState) {
    const activeCompanyId = state.accounting.activeCompanyId
    if (activeCompanyId) {
      await this.saveKey(
        `company-${activeCompanyId}`,
        createCompanyState(state, activeCompanyId),
      )
    }
    await this.saveKey('workspace', createWorkspaceState(state))
  }

  subscribe(listener: (state: AppState) => void) {
    let cancelled = false
    let loading = false
    let lastUpdatedAt = ''
    const refresh = async () => {
      if (cancelled || loading) return
      loading = true
      try {
        const state = await this.load()
        if (state && state.updatedAt !== lastUpdatedAt) {
          lastUpdatedAt = state.updatedAt
          listener(state)
        }
      } catch {
        return
      } finally {
        loading = false
      }
    }
    const timer = window.setInterval(() => void refresh(), 30_000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }
}
