import {
  useMemo,
  useState,
  type ChangeEvent,
  type FormEvent,
} from 'react'
import { ScanIcon } from '../components/Icons'
import {
  addDays,
  defaultPaymentTermsDays,
  markupPercentage,
  money,
  roundMoney,
  today,
} from '../domain/accounting'
import { createId } from '../domain/defaults'
import type {
  AccountingInvoice,
  ReviewDocument,
  ReviewInvoiceSuggestion,
} from '../domain/types'
import { useAppStore } from '../store/AppStoreContext'

type ReviewForm = {
  number: string
  supplierId: string
  sellerId: string
  description: string
  taxableAmount: string
  vat: string
  theoreticalRevenue: string
  date: string
}

function numberValue(value: string) {
  const parsed = Number(value.replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : 0
}

function suggestionForm(suggestion: ReviewInvoiceSuggestion): ReviewForm {
  return {
    number: suggestion.number,
    supplierId: suggestion.supplierId ?? '',
    sellerId: suggestion.sellerId ?? '',
    description: suggestion.description,
    taxableAmount:
      suggestion.taxableAmount > 0 ? String(suggestion.taxableAmount) : '',
    vat: suggestion.vat > 0 ? String(suggestion.vat) : '',
    theoreticalRevenue:
      suggestion.theoreticalRevenue > 0
        ? String(suggestion.theoreticalRevenue)
        : '',
    date: suggestion.date || today(),
  }
}

function fileDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

export function ReviewPage() {
  const {
    state,
    updateAccounting,
    updateReviewDocuments,
  } = useAppStore()
  const companyId = state.accounting.activeCompanyId
  const documents = useMemo(
    () =>
      state.reviewDocuments
        .filter((document) => document.companyId === companyId)
        .sort((left, right) => right.receivedAt.localeCompare(left.receivedAt)),
    [companyId, state.reviewDocuments],
  )
  const suppliers = state.accounting.suppliers.filter(
    (supplier) => supplier.companyId === companyId,
  )
  const sellers = state.accounting.sellers.filter(
    (seller) => seller.companyId === companyId,
  )
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [form, setForm] = useState<ReviewForm | null>(null)
  const selected = documents.find((document) => document.id === selectedId)
  const total = form
    ? roundMoney(
        numberValue(form.taxableAmount) + numberValue(form.vat),
      )
    : 0
  const markup = form
    ? markupPercentage(total, numberValue(form.theoreticalRevenue))
    : 0

  async function uploadPhotos(event: ChangeEvent<HTMLInputElement>) {
    const files = [...(event.target.files ?? [])]
    if (!companyId || files.length === 0) return
    const images = await Promise.all(files.map(fileDataUrl))
    const document: ReviewDocument = {
      id: createId('review-document'),
      companyId,
      source: 'manual-upload',
      senderName: '',
      receivedAt: new Date().toISOString(),
      status: 'unrecognized',
      images,
      suggestion: {
        number: '',
        supplierId: null,
        sellerId: null,
        description: '',
        taxableAmount: 0,
        vat: 0,
        theoreticalRevenue: 0,
        date: today(),
      },
    }
    updateReviewDocuments((current) => [document, ...current])
    event.target.value = ''
  }

  function openDocument(document: ReviewDocument) {
    setSelectedId(document.id)
    setForm(suggestionForm(document.suggestion))
  }

  function removeDocument(id: string) {
    if (!window.confirm('Eliminare definitivamente queste foto?')) return
    updateReviewDocuments((current) =>
      current.filter((document) => document.id !== id),
    )
    if (selectedId === id) {
      setSelectedId(null)
      setForm(null)
    }
  }

  function registerInvoice(
    document: ReviewDocument,
    suggestion: ReviewInvoiceSuggestion,
  ) {
    const supplier = state.accounting.suppliers.find(
      (item) => item.id === suggestion.supplierId,
    )
    const seller = state.accounting.sellers.find(
      (item) => item.id === suggestion.sellerId,
    )
    const invoiceTotal = roundMoney(
      suggestion.taxableAmount + suggestion.vat,
    )
    const invoice: AccountingInvoice = {
      id: createId('invoice'),
      companyId: document.companyId,
      number: suggestion.number.trim(),
      supplierId: supplier?.id ?? null,
      supplierName: supplier?.name ?? '',
      sellerId: seller?.id ?? null,
      sellerName: seller?.name ?? document.senderName,
      description: suggestion.description.trim(),
      category: 'Acquisti',
      taxableAmount: suggestion.taxableAmount,
      vat: suggestion.vat,
      theoreticalRevenue: suggestion.theoreticalRevenue,
      total: invoiceTotal,
      markupPercent: markupPercentage(
        invoiceTotal,
        suggestion.theoreticalRevenue,
      ),
      lines: [],
      date: suggestion.date,
      dueDate: addDays(
        suggestion.date,
        supplier?.paymentTermsDays ?? defaultPaymentTermsDays,
      ),
      settled: false,
      paidAmount: 0,
      payments: [],
      paymentDate: null,
      paymentMethod: null,
    }
    updateAccounting((current) => ({
      ...current,
      invoices: [invoice, ...current.invoices],
    }))
    updateReviewDocuments((current) =>
      current.filter((item) => item.id !== document.id),
    )
    setSelectedId(null)
    setForm(null)
  }

  function acceptSuggestion(document: ReviewDocument) {
    if (!document.suggestion.number || document.suggestion.taxableAmount <= 0) {
      openDocument(document)
      return
    }
    registerInvoice(document, document.suggestion)
  }

  function submitManual(event: FormEvent) {
    event.preventDefault()
    if (!selected || !form) return
    registerInvoice(selected, {
      number: form.number,
      supplierId: form.supplierId || null,
      sellerId: form.sellerId || null,
      description: form.description,
      taxableAmount: numberValue(form.taxableAmount),
      vat: numberValue(form.vat),
      theoreticalRevenue: numberValue(form.theoreticalRevenue),
      date: form.date,
    })
  }

  function saveAndClose() {
    if (!selected || !form) return
    const suggestion: ReviewInvoiceSuggestion = {
      number: form.number,
      supplierId: form.supplierId || null,
      sellerId: form.sellerId || null,
      description: form.description,
      taxableAmount: numberValue(form.taxableAmount),
      vat: numberValue(form.vat),
      theoreticalRevenue: numberValue(form.theoreticalRevenue),
      date: form.date,
    }
    updateReviewDocuments((current) =>
      current.map((document) =>
        document.id === selected.id
          ? { ...document, status: 'pending', suggestion }
          : document,
      ),
    )
    setSelectedId(null)
    setForm(null)
  }

  return (
    <div className="page-stack">
      <header className="page-heading">
        <div>
          <span className="eyebrow">DOCUMENTI</span>
          <h1>Foto in arrivo</h1>
          <p>
            Le foto non comprese restano parcheggiate finché non le registri
            oppure le elimini.
          </p>
        </div>
        <label className="button button-secondary photo-upload">
          Aggiungi foto da controllare
          <input
            accept="image/*"
            multiple
            onChange={uploadPhotos}
            type="file"
          />
        </label>
      </header>

      {documents.length === 0 ? (
        <section className="panel empty-state large-empty">
          <span className="empty-icon">
            <ScanIcon size={42} />
          </span>
          <strong>Nessuna foto in attesa</strong>
          <span>
            I documenti non riconosciuti da WhatsApp e Viber compariranno qui.
          </span>
        </section>
      ) : (
        <section className="review-document-grid">
          {documents.map((document) => (
            <article className="panel review-document-card" key={document.id}>
              <div className="review-photo-strip">
                {document.images.map((image, index) => (
                  <img
                    alt={`Documento ${index + 1}`}
                    key={`${document.id}-${index}`}
                    src={image}
                  />
                ))}
              </div>
              <div className="review-document-body">
                <div>
                  <span className={`record-status ${document.status}`}>
                    {document.status === 'unrecognized'
                      ? 'Non riconosciuta'
                      : document.status === 'possible-duplicate'
                        ? 'Possibile duplicato'
                        : 'Da revisionare'}
                  </span>
                  <small>
                    {new Date(document.receivedAt).toLocaleString('it-IT')} ·{' '}
                    {document.senderName || 'Mittente da identificare'}
                  </small>
                </div>
                <dl>
                  <div>
                    <dt>Fattura</dt>
                    <dd>{document.suggestion.number || '—'}</dd>
                  </div>
                  <div>
                    <dt>Data</dt>
                    <dd>{document.suggestion.date || '—'}</dd>
                  </div>
                  <div>
                    <dt>Totale</dt>
                    <dd>
                      {money(
                        document.suggestion.taxableAmount +
                          document.suggestion.vat,
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>Venit indicato</dt>
                    <dd>{money(document.suggestion.theoreticalRevenue)}</dd>
                  </div>
                </dl>
                <div className="review-actions">
                  <button
                    className="button button-primary"
                    onClick={() => acceptSuggestion(document)}
                    type="button"
                  >
                    Inserisci dati rilevati
                  </button>
                  <button
                    className="button button-secondary"
                    onClick={() => openDocument(document)}
                    type="button"
                  >
                    Inserimento manuale
                  </button>
                  <button
                    className="button danger-button"
                    onClick={() => removeDocument(document.id)}
                    type="button"
                  >
                    Elimina
                  </button>
                </div>
              </div>
            </article>
          ))}
        </section>
      )}

      {selected && form && (
        <form
          className="panel accounting-form review-entry"
          onSubmit={submitManual}
        >
          <div className="panel-heading">
            <div>
              <span className="eyebrow">CONTROLLO TITOLARE</span>
              <h2>Completa i dati della fattura</h2>
            </div>
            <button
              className="button button-secondary"
              onClick={saveAndClose}
              type="button"
            >
              Salva e lascia in attesa
            </button>
          </div>
          <div className="review-photo-strip large">
            {selected.images.map((image, index) => (
              <img
                alt={`Documento da controllare ${index + 1}`}
                key={`${selected.id}-large-${index}`}
                src={image}
              />
            ))}
          </div>
          <div className="form-grid accounting-fields">
            <label>
              Numero fattura
              <input
                onChange={(event) =>
                  setForm({ ...form, number: event.target.value })
                }
                required
                value={form.number}
              />
            </label>
            <label>
              Data
              <input
                onChange={(event) =>
                  setForm({ ...form, date: event.target.value })
                }
                required
                type="date"
                value={form.date}
              />
            </label>
            <label>
              Fornitore
              <select
                onChange={(event) =>
                  setForm({ ...form, supplierId: event.target.value })
                }
                value={form.supplierId}
              >
                <option value="">Nessuno</option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Venditrice
              <select
                onChange={(event) =>
                  setForm({ ...form, sellerId: event.target.value })
                }
                value={form.sellerId}
              >
                <option value="">Nessuna</option>
                {sellers.map((seller) => (
                  <option key={seller.id} value={seller.id}>
                    {seller.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Imponibile
              <input
                inputMode="decimal"
                min="0"
                onChange={(event) =>
                  setForm({ ...form, taxableAmount: event.target.value })
                }
                required
                value={form.taxableAmount}
              />
            </label>
            <label>
              IVA facoltativa
              <input
                inputMode="decimal"
                min="0"
                onChange={(event) =>
                  setForm({ ...form, vat: event.target.value })
                }
                placeholder="0,00"
                value={form.vat}
              />
            </label>
            <label>
              Totale automatico
              <input readOnly value={money(total)} />
            </label>
            <label>
              Venit totale del foglio
              <input
                inputMode="decimal"
                min="0"
                onChange={(event) =>
                  setForm({
                    ...form,
                    theoreticalRevenue: event.target.value,
                  })
                }
                value={form.theoreticalRevenue}
              />
            </label>
            <label>
              Ricarico fattura
              <input readOnly value={`${markup}%`} />
            </label>
            <label className="wide-field">
              Descrizione / note
              <input
                onChange={(event) =>
                  setForm({ ...form, description: event.target.value })
                }
                value={form.description}
              />
            </label>
          </div>
          <div className="form-actions">
            <button className="button button-primary" type="submit">
              Registra fattura e archivia foto
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
