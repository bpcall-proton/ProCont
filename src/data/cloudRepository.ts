import { doc, getDoc, onSnapshot, setDoc } from 'firebase/firestore'
import type { AppState } from '../domain/types'
import { firestore } from '../auth/firebase'
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
    const state = snapshot.data() as AppState
    return state.schemaVersion === 1 ? state : null
  }

  async save(state: AppState) {
    await setDoc(this.reference(), state)
  }

  subscribe(listener: (state: AppState) => void) {
    return onSnapshot(this.reference(), (snapshot) => {
      if (!snapshot.exists()) return
      const state = snapshot.data() as AppState
      if (state.schemaVersion === 1) listener(state)
    })
  }
}
