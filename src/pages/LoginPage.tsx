import { useState, type FormEvent } from 'react'
import { useAuth } from '../auth/AuthContext'
import { Logo } from '../components/Logo'

export function LoginPage() {
  const {
    firebaseConfigured,
    signIn,
    register,
    signInWithGoogle,
    continuePreview,
  } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    const result = creating
      ? await register(email, password)
      : await signIn(email, password)
    setError(result)
    setBusy(false)
  }

  async function google() {
    setBusy(true)
    setError(await signInWithGoogle())
    setBusy(false)
  }

  return (
    <main className="login-page">
      <div className="login-orbit login-orbit-one" />
      <div className="login-orbit login-orbit-two" />
      <section className="login-panel">
        <Logo />
        <div className="login-heading">
          <span className="eyebrow">DOCUMENT INTELLIGENCE</span>
          <h1>Trasforma le foto in dati controllabili.</h1>
          <p>
            Fatture, incassi e venit in un unico spazio sicuro, pronto per
            WhatsApp e Viber.
          </p>
        </div>

        {firebaseConfigured ? (
          <>
            <form className="login-form" onSubmit={submit}>
              <label>
                Email
                <input
                  autoComplete="email"
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  type="email"
                  value={email}
                />
              </label>
              <label>
                Password
                <input
                  autoComplete={creating ? 'new-password' : 'current-password'}
                  minLength={8}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  type="password"
                  value={password}
                />
              </label>
              {error && <p className="form-error">{error}</p>}
              <button className="button button-primary" disabled={busy}>
                {creating ? 'Crea account titolare' : 'Accedi'}
              </button>
            </form>
            <button
              className="button button-secondary"
              disabled={busy}
              onClick={google}
              type="button"
            >
              Continua con Google
            </button>
            <button
              className="text-button"
              onClick={() => setCreating((value) => !value)}
              type="button"
            >
              {creating
                ? 'Hai già un account? Accedi'
                : 'Prima configurazione? Crea account'}
            </button>
          </>
        ) : (
          <div className="preview-box">
            <span className="preview-chip">ANTEPRIMA LOCALE</span>
            <p>
              Firebase verrà collegato con il backend. Puoi già verificare
              struttura, ruoli e modalità dati.
            </p>
            <button
              className="button button-primary"
              onClick={() => continuePreview('owner')}
              type="button"
            >
              Entra come titolare
            </button>
            <button
              className="button button-secondary"
              onClick={() => continuePreview('accountant')}
              type="button"
            >
              Entra come contabile
            </button>
          </div>
        )}
      </section>
    </main>
  )
}
