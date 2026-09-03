import type { DataMode, SyncState } from '../domain/types'
import { CloudIcon, DeviceIcon } from './Icons'

export function DataModeBadge({ mode }: { mode: DataMode }) {
  return (
    <span className={`status-badge mode-${mode}`}>
      {mode === 'cloud' ? <CloudIcon size={15} /> : <DeviceIcon size={15} />}
      {mode === 'cloud' ? 'Cloud' : 'Locale'}
    </span>
  )
}

export function SyncBadge({
  state,
  message,
}: {
  state: SyncState
  message: string | null
}) {
  const errorLabel =
    message?.toLocaleLowerCase().includes('google drive') ||
    message?.toLocaleLowerCase().includes('ricollega')
      ? 'Drive da collegare'
      : message?.toLocaleLowerCase().includes('cloud')
        ? 'Cloud non disponibile'
        : 'Salvataggio fallito'
  const label = {
    idle: 'Pronto',
    saving: 'Salvataggio',
    saved: 'Sincronizzato',
    error: errorLabel,
  }[state]
  return (
    <span
      aria-label={message ?? label}
      className={`sync-badge sync-${state}`}
      title={message ?? label}
    >
      <span className="sync-dot" />
      {label}
    </span>
  )
}
