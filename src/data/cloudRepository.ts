import { doc, getDoc, onSnapshot, setDoc } from 'firebase/firestore'
import type { AppState } from '../domain/types'
import { firestore } from '../auth/firebase'
import { normalizeStoredState } from './migrations'
import {
  RepositoryUnavailableError,
  type AppRepository,
} from './repository'

export class CloudRepository implements AppRepository {
  readonly mode = 'cloud' as const

  constructor(private readonly companyId: string) {}

  private reference() {
    if (!firestore) {
      throw new RepositoryUnavailableError('Database cloud non configurato')
    }
    return doc(firestore, 'companies', this.companyId, 'appState', 'current')
  }

  async load() {
    const snapshot = await getDoc(this.reference())
    if (!snapshot.exists()) return null
    return normalizeStoredState(snapshot.data(), this.companyId)
  }

  async save(state: AppState) {
    await setDoc(this.reference(), state)
  }

  subscribe(listener: (state: AppState) => void) {
    return onSnapshot(this.reference(), (snapshot) => {
      if (!snapshot.exists()) return
      const state = normalizeStoredState(snapshot.data(), this.companyId)
      if (state) listener(state)
    })
  }
}
