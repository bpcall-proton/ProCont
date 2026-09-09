import {
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  setDoc,
  type Unsubscribe,
} from 'firebase/firestore'
import type { AppState } from '../domain/types'
import { firestore } from '../auth/firebase'
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

export class CloudRepository implements AppRepository {
  readonly mode = 'cloud' as const

  constructor(private readonly companyId: string) {}

  private workspaceReference() {
    if (!firestore) {
      throw new RepositoryUnavailableError('Database cloud non configurato')
    }
    return doc(firestore, 'companies', this.companyId, 'appState', 'workspace')
  }

  private legacyReference() {
    if (!firestore) {
      throw new RepositoryUnavailableError('Database cloud non configurato')
    }
    return doc(firestore, 'companies', this.companyId, 'appState', 'current')
  }

  private companyReference(companyId: string) {
    if (!firestore) {
      throw new RepositoryUnavailableError('Database cloud non configurato')
    }
    return doc(
      firestore,
      'companies',
      this.companyId,
      'accountingCompanies',
      companyId,
    )
  }

  private async saveAllCompanyStates(state: AppState) {
    const companies = new Map(
      state.accounting.companies.map((company) => [company.id, company]),
    )
    await Promise.all(
      [...companies.values()].map((company) =>
        setDoc(
          this.companyReference(company.id),
          createCompanyState(state, company.id),
        ),
      ),
    )
  }

  async load() {
    const workspaceSnapshot = await getDoc(this.workspaceReference())
    if (workspaceSnapshot.exists()) {
      const workspace = normalizeStoredState(
        workspaceSnapshot.data(),
        this.companyId,
      )
      if (!workspace) return null
      const workspaceCompanies = new Map(
        workspace.accounting.companies.map((company) => [company.id, company]),
      )
      const snapshots = await Promise.all(
        [...workspaceCompanies.values()].map(async (company) => ({
          company,
          snapshot: await getDoc(this.companyReference(company.id)),
        })),
      )
      const companies = snapshots.flatMap(({ company, snapshot }) => {
        if (!snapshot.exists()) return []
        const state = normalizeStoredState(snapshot.data(), company.id)
        return state ? [createCompanyState(state, company.id)] : []
      })
      const legacySnapshot = await getDoc(this.legacyReference())
      if (legacySnapshot.exists()) {
        await deleteDoc(this.legacyReference())
      }
      return mergeCompanyStates(workspace, companies)
    }

    const legacySnapshot = await getDoc(this.legacyReference())
    if (!legacySnapshot.exists()) return null
    const legacyState = normalizeStoredState(
      legacySnapshot.data(),
      this.companyId,
    )
    if (!legacyState) return null
    await this.saveAllCompanyStates(legacyState)
    await setDoc(
      this.workspaceReference(),
      createWorkspaceState(legacyState),
    )
    await deleteDoc(this.legacyReference())
    return legacyState
  }

  async save(state: AppState) {
    const activeCompanyId = state.accounting.activeCompanyId
    if (activeCompanyId) {
      await setDoc(
        this.companyReference(activeCompanyId),
        createCompanyState(state, activeCompanyId),
      )
    }
    await setDoc(this.workspaceReference(), createWorkspaceState(state))
  }

  subscribe(listener: (state: AppState) => void) {
    let companySubscriptions: Unsubscribe[] = []
    const unsubscribeWorkspace = onSnapshot(
      this.workspaceReference(),
      (snapshot) => {
        if (!snapshot.exists()) return
        const workspace = normalizeStoredState(snapshot.data(), this.companyId)
        if (!workspace) return

        companySubscriptions.forEach((unsubscribe) => unsubscribe())
        companySubscriptions = []
        const states = new Map<string, AppState>()
        const workspaceCompanies = new Map(
          workspace.accounting.companies.map((company) => [company.id, company]),
        )
        const pending = new Set(workspaceCompanies.keys())
        const emit = () => {
          if (pending.size === 0) {
            listener(mergeCompanyStates(workspace, [...states.values()]))
          }
        }

        workspaceCompanies.forEach((company) => {
          companySubscriptions.push(
            onSnapshot(this.companyReference(company.id), (companySnapshot) => {
              pending.delete(company.id)
              if (companySnapshot.exists()) {
                const state = normalizeStoredState(
                  companySnapshot.data(),
                  company.id,
                )
                if (state) {
                  states.set(
                    company.id,
                    createCompanyState(state, company.id),
                  )
                }
              } else {
                states.delete(company.id)
              }
              emit()
            }),
          )
        })
        emit()
      },
    )
    return () => {
      unsubscribeWorkspace()
      companySubscriptions.forEach((unsubscribe) => unsubscribe())
    }
  }
}
