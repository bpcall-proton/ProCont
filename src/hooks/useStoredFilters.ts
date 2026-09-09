import {
  useCallback,
  useSyncExternalStore,
  type SetStateAction,
} from 'react'

const filterCache = new Map<string, object>()
const filterListeners = new Map<string, Set<() => void>>()

function readStoredFilters<Filters extends object>(
  key: string,
  fallback: Filters,
) {
  const cached = filterCache.get(key)
  if (cached) return cached as Filters
  try {
    const stored = window.localStorage.getItem(key)
    const value = stored
      ? ({ ...fallback, ...JSON.parse(stored) } as Filters)
      : fallback
    filterCache.set(key, value)
    return value
  } catch {
    filterCache.set(key, fallback)
    return fallback
  }
}

export function useStoredFilters<Filters extends object>(
  key: string,
  initialFilters: Filters,
) {
  const subscribe = useCallback(
    (listener: () => void) => {
      const listeners = filterListeners.get(key) ?? new Set()
      listeners.add(listener)
      filterListeners.set(key, listeners)
      return () => {
        listeners.delete(listener)
        if (listeners.size === 0) filterListeners.delete(key)
      }
    },
    [key],
  )
  const getSnapshot = useCallback(
    () => readStoredFilters(key, initialFilters),
    [initialFilters, key],
  )
  const filters = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  const setFilters = useCallback(
    (next: SetStateAction<Filters>) => {
      const current = readStoredFilters(key, initialFilters)
      const value = typeof next === 'function' ? next(current) : next
      filterCache.set(key, value)
      try {
        window.localStorage.setItem(key, JSON.stringify(value))
      } catch {
        filterCache.set(key, value)
      }
      filterListeners.get(key)?.forEach((listener) => listener())
    },
    [initialFilters, key],
  )

  return [filters, setFilters] as const
}
