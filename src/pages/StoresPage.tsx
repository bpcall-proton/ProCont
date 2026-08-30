import { useState, type FormEvent } from 'react'
import { useAuth } from '../auth/AuthContext'
import { can } from '../auth/permissions'
import { useAppStore } from '../store/AppStoreContext'

const emptyForm = {
  storeName: '',
  city: '',
  sellerName: '',
  sellerPhone: '',
  sellerViberUserId: '',
}

export function StoresPage() {
  const { user } = useAuth()
  const { state, addStore, removeStore, setSellerViberUserId } = useAppStore()
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState('')
  const [viberDrafts, setViberDrafts] = useState<Record<string, string>>({})
  const canEdit = user ? can(user.role, 'manageStores') : false
  const companyId = state.accounting.activeCompanyId
  const activeCompany = state.accounting.companies.find(
    (company) => company.id === companyId,
  )
  const stores = state.stores.filter((store) => store.companyId === companyId)
  const sellers = state.sellers.filter(
    (seller) => seller.companyId === companyId,
  )

  function submit(event: FormEvent) {
    event.preventDefault()
    const result = addStore({ ...form, companyId: companyId ?? '' })
    if (!result.ok) {
      setError(result.error ?? 'Impossibile aggiungere il punto vendita')
      return
    }
    setError('')
    setForm(emptyForm)
  }

  return (
    <div className="page-stack">
      <header className="page-heading">
        <div>
          <span className="eyebrow">ORGANIZZAZIONE</span>
          <h1>Punti vendita</h1>
          <p>Una venditrice responsabile per ogni punto vendita.</p>
        </div>
      </header>

      {canEdit && (
        <form className="panel store-form" onSubmit={submit}>
          <div className="panel-heading">
            <div>
              <span className="eyebrow">NUOVO PUNTO</span>
              <h2>Aggiungi punto vendita</h2>
            </div>
          </div>
          <div className="form-grid">
            <label>
              Azienda
              <input readOnly value={activeCompany?.name ?? ''} />
            </label>
            <label>
              Nome punto vendita
              <input
                onChange={(event) =>
                  setForm({ ...form, storeName: event.target.value })
                }
                placeholder="Centro"
                required
                value={form.storeName}
              />
            </label>
            <label>
              Città
              <input
                onChange={(event) =>
                  setForm({ ...form, city: event.target.value })
                }
                placeholder="Chişinău"
                value={form.city}
              />
            </label>
            <label>
              Venditrice responsabile
              <input
                onChange={(event) =>
                  setForm({ ...form, sellerName: event.target.value })
                }
                placeholder="Nome e cognome"
                required
                value={form.sellerName}
              />
            </label>
            <label>
              Telefono WhatsApp
              <input
                onChange={(event) =>
                  setForm({ ...form, sellerPhone: event.target.value })
                }
                placeholder="+373..."
                required
                type="tel"
                value={form.sellerPhone}
              />
            </label>
            <label>
              ID utente Viber (facoltativo)
              <input
                onChange={(event) =>
                  setForm({
                    ...form,
                    sellerViberUserId: event.target.value,
                  })
                }
                placeholder="sender.id ricevuto dal bot"
                value={form.sellerViberUserId}
              />
            </label>
          </div>
          <div className="form-actions">
            <button className="button button-primary" type="submit">
              Aggiungi punto
            </button>
          </div>
          {error && <p className="form-error">{error}</p>}
        </form>
      )}

      <section className="store-grid">
        {stores.map((store) => {
          const seller = sellers.find(
            (item) => item.id === store.sellerId,
          )
          return (
            <article className="panel store-card" key={store.id}>
              <div className="store-card-top">
                <span className="store-avatar large">
                  {store.name.slice(0, 2).toUpperCase()}
                </span>
                <span className="channel-status">WhatsApp + Viber</span>
              </div>
              <span className="eyebrow">{activeCompany?.name}</span>
              <h2>{store.name}</h2>
              <p>{store.city || 'Città non indicata'}</p>
              <div className="seller-block">
                <span>Venditrice responsabile</span>
                <strong>{seller?.name}</strong>
                <small>{seller?.phone}</small>
              </div>
              {canEdit && seller && (
                <div className="viber-pairing">
                  <label>
                    ID utente Viber
                    <input
                      onChange={(event) =>
                        setViberDrafts({
                          ...viberDrafts,
                          [seller.id]: event.target.value,
                        })
                      }
                      placeholder="sender.id ricevuto dal bot"
                      value={viberDrafts[seller.id] ?? seller.viberUserId}
                    />
                  </label>
                  <button
                    className="button button-secondary"
                    onClick={() => {
                      const result = setSellerViberUserId(
                        seller.id,
                        viberDrafts[seller.id] ?? seller.viberUserId,
                      )
                      setError(result.error ?? '')
                    }}
                    type="button"
                  >
                    Salva collegamento Viber
                  </button>
                </div>
              )}
              {canEdit && (
                <button
                  className="text-button danger-text"
                  onClick={() => removeStore(store.id)}
                  type="button"
                >
                  Rimuovi punto vendita
                </button>
              )}
            </article>
          )
        })}
        {stores.length === 0 && !canEdit && (
          <div className="panel empty-state">
            <strong>Nessun punto vendita disponibile</strong>
            <span>Il titolare deve completare la configurazione.</span>
          </div>
        )}
      </section>
    </div>
  )
}
