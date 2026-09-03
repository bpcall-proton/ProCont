import { useEffect, useRef, useState } from 'react'
import packageMetadata from '../package.json'
import { AuthProvider } from './auth/AuthProvider'
import { useAuth } from './auth/AuthContext'
import { can, type Permission } from './auth/permissions'
import {
  AccountingIcon,
  DashboardIcon,
  LogoutIcon,
  PaidInvoicesIcon,
  ProductIcon,
  ProductionIcon,
  ReportsIcon,
  ScanIcon,
  SettingsIcon,
  StoreIcon,
} from './components/Icons'
import { Logo } from './components/Logo'
import { DataModeBadge, SyncBadge } from './components/StatusBadge'
import { DashboardPage } from './pages/DashboardPage'
import { AccountingPage } from './pages/AccountingPage'
import { InvoiceArchivePage } from './pages/InvoiceArchivePage'
import { LoginPage } from './pages/LoginPage'
import { PaidInvoicesPage } from './pages/PaidInvoicesPage'
import { ProductsPage } from './pages/ProductsPage'
import { ProductionPage } from './pages/ProductionPage'
import { ReviewPage } from './pages/ReviewPage'
import { ReportsPage } from './pages/ReportsPage'
import { SettingsPage } from './pages/SettingsPage'
import { StoresPage } from './pages/StoresPage'
import type { InterfaceLanguage } from './domain/types'
import { AppStoreProvider } from './store/AppStoreProvider'
import { useAppStore } from './store/AppStoreContext'

type Page =
  | 'dashboard'
  | 'accounting'
  | 'invoiceArchive'
  | 'paidInvoices'
  | 'products'
  | 'production'
  | 'reports'
  | 'stores'
  | 'review'
  | 'settings'

const navigation: {
  id: Page
  label: Record<InterfaceLanguage, string>
  icon: typeof DashboardIcon
  permission: Permission
}[] = [
  {
    id: 'dashboard',
    label: { it: 'Panoramica', ro: 'Prezentare', en: 'Overview' },
    icon: DashboardIcon,
    permission: 'viewDashboard',
  },
  {
    id: 'accounting',
    label: { it: 'Contabilità', ro: 'Contabilitate', en: 'Accounting' },
    icon: AccountingIcon,
    permission: 'manageAccounting',
  },
  {
    id: 'products',
    label: { it: 'Prodotti', ro: 'Produse', en: 'Products' },
    icon: ProductIcon,
    permission: 'manageAccounting',
  },
  {
    id: 'production',
    label: {
      it: 'Costo prodotto',
      ro: 'Cost producție',
      en: 'Product cost',
    },
    icon: ProductionIcon,
    permission: 'manageAccounting',
  },
  {
    id: 'paidInvoices',
    label: {
      it: 'Fatture pagate',
      ro: 'Facturi plătite',
      en: 'Paid invoices',
    },
    icon: PaidInvoicesIcon,
    permission: 'manageAccounting',
  },
  {
    id: 'reports',
    label: { it: 'Statistiche', ro: 'Statistici', en: 'Reports' },
    icon: ReportsIcon,
    permission: 'viewReports',
  },
  {
    id: 'stores',
    label: {
      it: 'Punti vendita',
      ro: 'Puncte de vânzare',
      en: 'Stores',
    },
    icon: StoreIcon,
    permission: 'viewStores',
  },
  {
    id: 'review',
    label: {
      it: 'Foto in arrivo',
      ro: 'Fotografii primite',
      en: 'Incoming photos',
    },
    icon: ScanIcon,
    permission: 'reviewDocuments',
  },
  {
    id: 'settings',
    label: { it: 'Impostazioni', ro: 'Setări', en: 'Settings' },
    icon: SettingsIcon,
    permission: 'manageSettings',
  },
]

function Workspace() {
  const { user, signOut } = useAuth()
  const {
    state,
    loading,
    syncState,
    syncMessage,
    retrySync,
    setActiveAccountingCompany,
  } = useAppStore()
  const [page, setPage] = useState<Page>('dashboard')
  const reviewPresented = useRef(false)
  const language = state.dataSettings.language
  const activeCompany =
    state.accounting.companies.find(
      (company) => company.id === state.accounting.activeCompanyId,
    ) ?? state.accounting.companies[0]
  const activeStores = activeCompany
    ? state.stores.filter((store) => store.companyId === activeCompany.id).length
    : 0
  const hasActiveReviewDocuments = state.reviewDocuments.some(
    (document) => document.companyId === activeCompany?.id,
  )

  useEffect(() => {
    if (
      !loading &&
      !reviewPresented.current &&
      user &&
      can(user.role, 'reviewDocuments') &&
      hasActiveReviewDocuments
    ) {
      reviewPresented.current = true
      setPage('review')
    }
  }, [
    loading,
    state.accounting.activeCompanyId,
    hasActiveReviewDocuments,
    user,
  ])

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
    accounting: (
      <AccountingPage onOpenInvoiceArchive={() => setPage('invoiceArchive')} />
    ),
    invoiceArchive: (
      <InvoiceArchivePage onBack={() => setPage('accounting')} />
    ),
    products: <ProductsPage />,
    production: <ProductionPage key={activeCompany?.id} />,
    paidInvoices: <PaidInvoicesPage />,
    reports: <ReportsPage />,
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
              <span>{label[language]}</span>
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
                {user?.role === 'owner'
                  ? language === 'it'
                    ? 'Titolare'
                    : language === 'ro'
                      ? 'Proprietar'
                      : 'Owner'
                  : language === 'it'
                    ? 'Contabile'
                    : language === 'ro'
                      ? 'Contabil'
                      : 'Accountant'}
              </strong>
              <small>{user?.preview ? 'Anteprima locale' : user?.email}</small>
            </span>
          </div>
          <div className="software-credit">
            <span>Ideatore del software</span>
            <strong>Bpcall S.r.l. © 2026 Moldavia</strong>
            <small>Versione {packageMetadata.version}</small>
          </div>
          <button className="logout-button" onClick={signOut} type="button">
            <LogoutIcon />
            {language === 'it'
              ? 'Esci'
              : language === 'ro'
                ? 'Ieșire'
                : 'Sign out'}
          </button>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div className="topbar-company">
            <span>Azienda attiva</span>
            <select
              aria-label="Azienda attiva"
              onChange={(event) =>
                setActiveAccountingCompany(event.target.value)
              }
              value={activeCompany?.id ?? ''}
            >
              {state.accounting.companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))}
            </select>
            <span>
              {activeStores} punti vendita · {state.accounting.companies.length}{' '}
              aziende · aggiornato{' '}
              {new Date(state.updatedAt).toLocaleTimeString('it-IT', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          </div>
          <div className="topbar-status">
            <SyncBadge message={syncMessage} state={syncState} />
            {syncState === 'error' && (
              <button
                className="sync-retry-button"
                onClick={() => void retrySync()}
                type="button"
              >
                Sincronizza / forza salvataggio
              </button>
            )}
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
