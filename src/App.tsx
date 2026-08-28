import { useState } from 'react'
import { AuthProvider } from './auth/AuthProvider'
import { useAuth } from './auth/AuthContext'
import { can, type Permission } from './auth/permissions'
import {
  DashboardIcon,
  LogoutIcon,
  ScanIcon,
  SettingsIcon,
  StoreIcon,
} from './components/Icons'
import { Logo } from './components/Logo'
import { DataModeBadge, SyncBadge } from './components/StatusBadge'
import { DashboardPage } from './pages/DashboardPage'
import { LoginPage } from './pages/LoginPage'
import { ReviewPage } from './pages/ReviewPage'
import { SettingsPage } from './pages/SettingsPage'
import { StoresPage } from './pages/StoresPage'
import { AppStoreProvider } from './store/AppStoreProvider'
import { useAppStore } from './store/AppStoreContext'

type Page = 'dashboard' | 'stores' | 'review' | 'settings'

const navigation: {
  id: Page
  label: string
  icon: typeof DashboardIcon
  permission: Permission
}[] = [
  {
    id: 'dashboard',
    label: 'Panoramica',
    icon: DashboardIcon,
    permission: 'viewDashboard',
  },
  {
    id: 'stores',
    label: 'Punti vendita',
    icon: StoreIcon,
    permission: 'viewStores',
  },
  {
    id: 'review',
    label: 'Foto in arrivo',
    icon: ScanIcon,
    permission: 'reviewDocuments',
  },
  {
    id: 'settings',
    label: 'Impostazioni',
    icon: SettingsIcon,
    permission: 'manageSettings',
  },
]

function Workspace() {
  const { user, signOut } = useAuth()
  const { state, loading, syncState, syncMessage } = useAppStore()
  const [page, setPage] = useState<Page>('dashboard')

  if (loading) {
    return (
      <div className="app-loading">
        <Logo />
        <span className="scanner-loader" />
      </div>
    )
  }

  const pages = {
    dashboard: <DashboardPage />,
    stores: <StoresPage />,
    review: <ReviewPage />,
    settings: <SettingsPage />,
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Logo />
        <nav>
          {navigation
            .filter((item) =>
              user ? can(user.role, item.permission) : false,
            )
            .map(({ id, label, icon: Icon }) => (
            <button
              className={page === id ? 'active' : ''}
              key={id}
              onClick={() => setPage(id)}
              type="button"
            >
              <Icon />
              <span>{label}</span>
              {id === 'review' &&
                state.review.pending + state.review.unrecognized > 0 && (
                  <small>
                    {state.review.pending + state.review.unrecognized}
                  </small>
                )}
            </button>
            ))}
        </nav>
        <div className="sidebar-footer">
          <div className="user-summary">
            <span className="user-avatar">
              {user?.role === 'owner' ? 'TI' : 'CO'}
            </span>
            <span>
              <strong>
                {user?.role === 'owner' ? 'Titolare' : 'Contabile'}
              </strong>
              <small>{user?.preview ? 'Anteprima locale' : user?.email}</small>
            </span>
          </div>
          <button className="logout-button" onClick={signOut} type="button">
            <LogoutIcon />
            Esci
          </button>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <strong>{state.company.name}</strong>
            <span>
              {state.stores.length} punti vendita · aggiornato{' '}
              {new Date(state.updatedAt).toLocaleTimeString('it-IT', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          </div>
          <div className="topbar-status">
            <SyncBadge message={syncMessage} state={syncState} />
            <DataModeBadge mode={state.dataSettings.mode} />
          </div>
        </header>
        <div className="page-container">{pages[page]}</div>
      </main>
    </div>
  )
}

function SessionGate() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="app-loading">
        <Logo />
        <span className="scanner-loader" />
      </div>
    )
  }

  if (!user) return <LoginPage />

  return (
    <AppStoreProvider key={user.id}>
      <Workspace />
    </AppStoreProvider>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <SessionGate />
    </AuthProvider>
  )
}
