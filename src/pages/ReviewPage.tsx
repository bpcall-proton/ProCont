import { ScanIcon } from '../components/Icons'

export function ReviewPage() {
  return (
    <div className="page-stack">
      <header className="page-heading">
        <div>
          <span className="eyebrow">DOCUMENTI</span>
          <h1>Foto in arrivo</h1>
          <p>Revisione, foto non riconosciute e possibili duplicati.</p>
        </div>
      </header>
      <section className="panel empty-state large-empty">
        <span className="empty-icon">
          <ScanIcon size={42} />
        </span>
        <strong>Nessuna foto in attesa</strong>
        <span>
          I documenti ricevuti da WhatsApp e Viber compariranno qui.
        </span>
        <span className="preview-chip">ACQUISIZIONE PREVISTA NELLA FASE 2</span>
      </section>
    </div>
  )
}
