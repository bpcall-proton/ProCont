import type { AppState, DataMode } from '../domain/types'

export interface AppRepository {
  readonly mode: DataMode
  load: () => Promise<AppState | null>
  save: (state: AppState) => Promise<void>
  subscribe?: (listener: (state: AppState) => void) => () => void
}

export class RepositoryUnavailableError extends Error {}
