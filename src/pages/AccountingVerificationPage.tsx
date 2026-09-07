import { useState, type FormEvent } from 'react'
import {
  activeAccounting,
  money,
  productSalePrice,
  roundMoney,
  today,
} from '../domain/accounting'
import { createId } from '../domain/defaults'
import type {
  AccountingProduct,
  AccountingSeller,
  VerificationStockLoad,
} from '../domain/types'
import { useAppStore } from '../store/AppStoreContext'

const emptyMovement = {
  sellerId: '',
  productId: '',
  date: today(),
  quantity: '',
  note: '',
}

const emptyTransfer = {
  fromSellerId: '',
  toSellerId: '',
  productId: '',
  date: today(),
  quantity: '',
  reassignRevenue: true,
}

function quantity(value: string) {
  const parsed = Number(value.replace(',', '.'))
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0
}

function quantityLabel(value: number, unit: string) {
  return `${roundMoney(value).toLocaleString('it-IT')} ${unit}`
}

function sellerName(sellers: AccountingSeller[], sellerId: string) {
  return sellers.find((seller) => seller.id === sellerId)?.name ?? '—'
}

function productName(products: AccountingProduct[], productId: string) {
  return products.find((product) => product.id === productId)?.name ?? '—'
}

export function AccountingVerificationPage() {
  const { state, updateAccounting } = useAppStore()
  const data = activeAccounting(state.accounting)
  const [sellerFilter, setSellerFilter] = useState('')
  const [untilDate, setUntilDate] = useState(today())
  const [loadForm, setLoadForm] = useState(emptyMovement)
  const [productionForm, setProductionForm] = useState(emptyMovement)
  const [transferForm, setTransferForm] = useState(emptyTransfer)
  const companyId = data.company?.id ?? ''
  const settings = data.verificationSettings
  const verifiedSellers = data.sellers.filter((seller) =>
    settings?.sellerIds.includes(seller.id),
  )
  const activeSellerIds =
    sellerFilter && settings?.sellerIds.includes(sellerFilter)
      ? [sellerFilter]
      : verifiedSellers.map((seller) => seller.id)

  const rows = activeSellerIds.flatMap((sellerId) =>
    data.products
          .map((product) => {
            const invoiceLoad = data.invoices
              .filter(
                (invoice) =>
                  invoice.verificationIncluded &&
                  invoice.sellerId === sellerId &&
                  invoice.date <= untilDate,
              )
              .flatMap((invoice) => invoice.lines)
              .filter((line) => line.productId === product.id)
              .reduce((sum, line) => sum + line.quantity, 0)
            const manualLoad = data.verificationStockLoads
              .filter(
                (entry) =>
                  entry.sellerId === sellerId &&
                  entry.productId === product.id &&
                  entry.date <= untilDate,
              )
              .reduce((sum, entry) => sum + entry.quantity, 0)
            const produced = data.verificationProductionEntries
              .filter(
                (entry) =>
                  entry.sellerId === sellerId &&
                  entry.productId === product.id &&
                  entry.date <= untilDate,
              )
              .reduce((sum, entry) => sum + entry.quantity, 0)
            const received = data.verificationTransfers
              .filter(
                (transfer) =>
                  transfer.toSellerId === sellerId &&
                  transfer.productId === product.id &&
                  transfer.date <= untilDate,
              )
              .reduce((sum, transfer) => sum + transfer.quantity, 0)
            const sent = data.verificationTransfers
              .filter(
                (transfer) =>
                  transfer.fromSellerId === sellerId &&
                  transfer.productId === product.id &&
                  transfer.date <= untilDate,
              )
              .reduce((sum, transfer) => sum + transfer.quantity, 0)
            const stockOnlyReceived = data.verificationTransfers
              .filter(
                (transfer) =>
                  !transfer.reassignRevenue &&
                  transfer.toSellerId === sellerId &&
                  transfer.productId === product.id &&
                  transfer.date <= untilDate,
              )
              .reduce((sum, transfer) => sum + transfer.quantity, 0)
            const stockOnlySent = data.verificationTransfers
              .filter(
                (transfer) =>
                  !transfer.reassignRevenue &&
                  transfer.fromSellerId === sellerId &&
                  transfer.productId === product.id &&
                  transfer.date <= untilDate,
              )
              .reduce((sum, transfer) => sum + transfer.quantity, 0)
            const loaded = invoiceLoad + manualLoad
            const remaining = loaded + received - produced - sent
            const unitValue = productSalePrice(product)
            return {
              sellerId,
              product,
              invoiceLoad,
              manualLoad,
              loaded,
              produced,
              received,
              sent,
              remaining,
              producedRevenue: roundMoney(produced * unitValue),
              residualRevenue: roundMoney(
                (remaining - stockOnlyReceived + stockOnlySent) * unitValue,
              ),
            }
          })
          .filter(
            (row) =>
              row.loaded !== 0 ||
              row.produced !== 0 ||
              row.received !== 0 ||
              row.sent !== 0,
          ),
  )

  const unitTotals = (field: 'loaded' | 'produced' | 'remaining') => {
    const totals = new Map<string, number>()
    rows.forEach((row) =>
      totals.set(
        row.product.unit,
        (totals.get(row.product.unit) ?? 0) + row[field],
      ),
    )
    return [...totals.entries()]
      .map(([unit, value]) => quantityLabel(value, unit))
      .join(' · ') || '0'
  }
  const producedRevenue = rows.reduce(
    (sum, row) => sum + row.producedRevenue,
    0,
  )
  const residualRevenue = rows.reduce(
    (sum, row) => sum + row.residualRevenue,
    0,
  )
  const verificationInvoices = data.invoices.filter(
    (invoice) =>
      invoice.verificationIncluded &&
      invoice.sellerId !== null &&
      activeSellerIds.includes(invoice.sellerId) &&
      invoice.date <= untilDate,
  )

  function addLoad(event: FormEvent) {
    event.preventDefault()
    const entryQuantity = quantity(loadForm.quantity)
    if (!companyId || !loadForm.sellerId || !loadForm.productId || !entryQuantity) {
      return
    }
    const entry: VerificationStockLoad = {
      id: createId('verification-load'),
      companyId,
      sellerId: loadForm.sellerId,
      productId: loadForm.productId,
      date: loadForm.date,
      quantity: entryQuantity,
      note: loadForm.note.trim(),
    }
    updateAccounting((current) => ({
      ...current,
      verificationStockLoads: [entry, ...current.verificationStockLoads],
    }))
    setLoadForm({
      ...emptyMovement,
      sellerId: loadForm.sellerId,
      date: loadForm.date,
    })
  }

  function addProduction(event: FormEvent) {
    event.preventDefault()
    const entryQuantity = quantity(productionForm.quantity)
    if (
      !companyId ||
      !productionForm.sellerId ||
      !productionForm.productId ||
      !entryQuantity
    ) {
      return
    }
    updateAccounting((current) => ({
      ...current,
      verificationProductionEntries: [
        {
          id: createId('verification-production'),
          companyId,
          sellerId: productionForm.sellerId,
          productId: productionForm.productId,
          date: productionForm.date,
          quantity: entryQuantity,
        },
        ...current.verificationProductionEntries,
      ],
    }))
    setProductionForm({
      ...emptyMovement,
      sellerId: productionForm.sellerId,
      date: productionForm.date,
    })
  }

  function addTransfer(event: FormEvent) {
    event.preventDefault()
    const entryQuantity = quantity(transferForm.quantity)
    if (
      !companyId ||
      !transferForm.fromSellerId ||
      !transferForm.toSellerId ||
      transferForm.fromSellerId === transferForm.toSellerId ||
      !transferForm.productId ||
      !entryQuantity
    ) {
      return
    }
    updateAccounting((current) => ({
      ...current,
      verificationTransfers: [
        {
          id: createId('verification-transfer'),
          companyId,
          fromSellerId: transferForm.fromSellerId,
          toSellerId: transferForm.toSellerId,
          productId: transferForm.productId,
          date: transferForm.date,
          quantity: entryQuantity,
          reassignRevenue: transferForm.reassignRevenue,
        },
        ...current.verificationTransfers,
      ],
    }))
    setTransferForm({
      ...emptyTransfer,
      fromSellerId: transferForm.fromSellerId,
      date: transferForm.date,
    })
  }

  function removeMovement(
    type: 'load' | 'production' | 'transfer',
    id: string,
  ) {
    if (!window.confirm('Eliminare questo movimento di verifica?')) return
    updateAccounting((current) =>
      type === 'load'
        ? {
            ...current,
            verificationStockLoads: current.verificationStockLoads.filter(
              (entry) => entry.id !== id,
            ),
          }
        : type === 'production'
          ? {
              ...current,
              verificationProductionEntries:
                current.verificationProductionEntries.filter(
                  (entry) => entry.id !== id,
                ),
            }
          : {
              ...current,
              verificationTransfers: current.verificationTransfers.filter(
                (entry) => entry.id !== id,
              ),
            },
    )
  }

  if (!settings?.enabled) {
    return (
      <div className="page-stack">
        <header className="page-heading">
          <div>
            <span className="eyebrow">CONTROLLO MERCE</span>
            <h1>Verifica contabile</h1>
            <p>
              Attiva la funzione nelle Impostazioni e conferma i venditori da
              controllare.
            </p>
          </div>
        </header>
        <div className="empty-state">
          <strong>Verifica contabile non attiva</strong>
          <span>
            La contabilità ordinaria continua a funzionare senza variazioni.
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="page-stack">
      <header className="page-heading">
        <div>
          <span className="eyebrow">CONTROLLO MERCE</span>
          <h1>Verifica contabile</h1>
          <p>
            Carico fatture + trasferimenti ricevuti − produzione dichiarata −
            trasferimenti inviati.
          </p>
        </div>
        <div className="verification-filter">
          <select
            aria-label="Filtra venditore"
            onChange={(event) => setSellerFilter(event.target.value)}
            value={sellerFilter}
          >
            <option value="">Tutti i venditori verificati</option>
            {verifiedSellers.map((seller) => (
              <option key={seller.id} value={seller.id}>
                {seller.name}
              </option>
            ))}
          </select>
          <label>
            Situazione al
            <input
              onChange={(event) => setUntilDate(event.target.value)}
              type="date"
              value={untilDate}
            />
          </label>
        </div>
      </header>

      <section className="stats-strip verification-stats">
        <div>
          <span>Carico totale</span>
          <strong>{unitTotals('loaded')}</strong>
        </div>
        <div>
          <span>Produzione dichiarata</span>
          <strong>{unitTotals('produced')}</strong>
        </div>
        <div>
          <span>Giacenza teorica</span>
          <strong>{unitTotals('remaining')}</strong>
        </div>
        <div>
          <span>Venit prodotto / residuo</span>
          <strong>
            {money(producedRevenue)} / {money(residualRevenue)}
          </strong>
        </div>
      </section>

      <section className="verification-entry-grid">
        <form className="panel form-stack" onSubmit={addLoad}>
          <div className="panel-heading">
            <div>
              <span className="eyebrow">CARICO</span>
              <h2>Quantità manuale</h2>
            </div>
          </div>
          <select
            onChange={(event) =>
              setLoadForm({ ...loadForm, sellerId: event.target.value })
            }
            required
            value={loadForm.sellerId}
          >
            <option value="">Venditore / punto</option>
            {verifiedSellers.map((seller) => (
              <option key={seller.id} value={seller.id}>
                {seller.name}
              </option>
            ))}
          </select>
          <select
            onChange={(event) =>
              setLoadForm({ ...loadForm, productId: event.target.value })
            }
            required
            value={loadForm.productId}
          >
            <option value="">Prodotto</option>
            {data.products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name} · {product.unit}
              </option>
            ))}
          </select>
          <div className="verification-number-row">
            <input
              onChange={(event) =>
                setLoadForm({ ...loadForm, date: event.target.value })
              }
              required
              type="date"
              value={loadForm.date}
            />
            <input
              inputMode="decimal"
              min="0"
              onChange={(event) =>
                setLoadForm({ ...loadForm, quantity: event.target.value })
              }
              placeholder="Quantità / peso"
              required
              value={loadForm.quantity}
            />
          </div>
          <input
            onChange={(event) =>
              setLoadForm({ ...loadForm, note: event.target.value })
            }
            placeholder="Nota facoltativa"
            value={loadForm.note}
          />
          <button className="button button-primary" type="submit">
            Registra carico
          </button>
        </form>

        <form className="panel form-stack" onSubmit={addProduction}>
          <div className="panel-heading">
            <div>
              <span className="eyebrow">USCITA</span>
              <h2>Produzione giornaliera</h2>
            </div>
          </div>
          <select
            onChange={(event) =>
              setProductionForm({
                ...productionForm,
                sellerId: event.target.value,
              })
            }
            required
            value={productionForm.sellerId}
          >
            <option value="">Venditore / punto</option>
            {verifiedSellers.map((seller) => (
              <option key={seller.id} value={seller.id}>
                {seller.name}
              </option>
            ))}
          </select>
          <select
            onChange={(event) =>
              setProductionForm({
                ...productionForm,
                productId: event.target.value,
              })
            }
            required
            value={productionForm.productId}
          >
            <option value="">Prodotto prodotto/venduto</option>
            {data.products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name} · {product.unit}
              </option>
            ))}
          </select>
          <div className="verification-number-row">
            <input
              onChange={(event) =>
                setProductionForm({
                  ...productionForm,
                  date: event.target.value,
                })
              }
              required
              type="date"
              value={productionForm.date}
            />
            <input
              inputMode="decimal"
              min="0"
              onChange={(event) =>
                setProductionForm({
                  ...productionForm,
                  quantity: event.target.value,
                })
              }
              placeholder="Quantità prodotta"
              required
              value={productionForm.quantity}
            />
          </div>
          <small>
            Riduce la giacenza e calcola il Venit al prezzo configurato nel
            prodotto.
          </small>
          <button className="button button-primary" type="submit">
            Registra produzione
          </button>
        </form>

        <form className="panel form-stack" onSubmit={addTransfer}>
          <div className="panel-heading">
            <div>
              <span className="eyebrow">SPOSTAMENTO</span>
              <h2>Trasferimento interno</h2>
            </div>
          </div>
          <select
            onChange={(event) =>
              setTransferForm({
                ...transferForm,
                fromSellerId: event.target.value,
              })
            }
            required
            value={transferForm.fromSellerId}
          >
            <option value="">Punto che consegna</option>
            {data.sellers.map((seller) => (
              <option key={seller.id} value={seller.id}>
                {seller.name}
              </option>
            ))}
          </select>
          <select
            onChange={(event) =>
              setTransferForm({
                ...transferForm,
                toSellerId: event.target.value,
              })
            }
            required
            value={transferForm.toSellerId}
          >
            <option value="">Punto destinatario</option>
            {data.sellers.map((seller) => (
              <option key={seller.id} value={seller.id}>
                {seller.name}
              </option>
            ))}
          </select>
          <select
            onChange={(event) =>
              setTransferForm({
                ...transferForm,
                productId: event.target.value,
              })
            }
            required
            value={transferForm.productId}
          >
            <option value="">Prodotto</option>
            {data.products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name} · {product.unit}
              </option>
            ))}
          </select>
          <div className="verification-number-row">
            <input
              onChange={(event) =>
                setTransferForm({
                  ...transferForm,
                  date: event.target.value,
                })
              }
              required
              type="date"
              value={transferForm.date}
            />
            <input
              inputMode="decimal"
              min="0"
              onChange={(event) =>
                setTransferForm({
                  ...transferForm,
                  quantity: event.target.value,
                })
              }
              placeholder="Quantità trasferita"
              required
              value={transferForm.quantity}
            />
          </div>
          <label className="checkbox-row">
            <input
              checked={transferForm.reassignRevenue}
              onChange={(event) =>
                setTransferForm({
                  ...transferForm,
                  reassignRevenue: event.target.checked,
                })
              }
              type="checkbox"
            />
            Sposta anche il Venit potenziale al destinatario
          </label>
          <button className="button button-primary" type="submit">
            Registra trasferimento
          </button>
        </form>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">DOCUMENTI DI CARICO</span>
            <h2>Fatture analizzate</h2>
            <p>
              Le righe confermate alimentano la giacenza; le foto originali
              restano collegate alla fattura.
            </p>
          </div>
          <span className="count-pill">{verificationInvoices.length}</span>
        </div>
        <div className="verification-invoice-list">
          {verificationInvoices.map((invoice) => (
            <article className="record-card verification-invoice" key={invoice.id}>
              <div>
                <strong>
                  Fattura {invoice.number || 'senza numero'} · {invoice.date}
                </strong>
                <small>
                  {invoice.supplierName || 'Fornitore non indicato'} ·{' '}
                  {invoice.sellerName || 'Punto non indicato'}
                </small>
                <div className="verification-line-tags">
                  {invoice.lines.map((line) => (
                    <span key={line.id}>
                      {line.productCode || '—'} · {line.description} ·{' '}
                      {quantityLabel(line.quantity, line.unit)}
                    </span>
                  ))}
                </div>
                {invoice.verificationOcrText && (
                  <details>
                    <summary>
                      Testo OCR
                      {invoice.verificationOcrConfidence !== null
                        ? ` · ${invoice.verificationOcrConfidence.toFixed(0)}%`
                        : ''}
                    </summary>
                    <pre>{invoice.verificationOcrText}</pre>
                  </details>
                )}
              </div>
              <div className="review-photo-strip">
                {invoice.verificationImages.map((image, index) => (
                  <img
                    alt={`Fattura ${invoice.number || invoice.id} foto ${index + 1}`}
                    key={`${invoice.id}-${index}`}
                    src={image}
                  />
                ))}
              </div>
            </article>
          ))}
          {verificationInvoices.length === 0 && (
            <div className="empty-state compact-empty">
              <strong>Nessuna fattura verificata</strong>
              <span>
                Nel modulo Fatture carica le foto e attiva il flag di analisi.
              </span>
            </div>
          )}
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">SITUAZIONE TEORICA</span>
            <h2>Giacenza per prodotto e punto</h2>
            <p>
              Valore unitario: prezzo di vendita IVA inclusa configurato nella
              pagina Prodotti.
            </p>
          </div>
        </div>
        <div className="data-table-wrap">
          <table className="data-table verification-table">
            <thead>
              <tr>
                <th>Punto / prodotto</th>
                <th>Carico fatture</th>
                <th>Carico manuale</th>
                <th>Ricevuto</th>
                <th>Produzione</th>
                <th>Inviato</th>
                <th>Residuo teorico</th>
                <th>Venit prodotto</th>
                <th>Venit residuo</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  className={row.remaining < 0 ? 'verification-anomaly' : ''}
                  key={`${row.sellerId}-${row.product.id}`}
                >
                  <td>
                    <strong>{row.product.name}</strong>
                    <small>
                      {sellerName(data.sellers, row.sellerId)} ·{' '}
                      {row.product.code || 'senza codice'}
                    </small>
                  </td>
                  <td>
                    {quantityLabel(row.invoiceLoad, row.product.unit)}
                  </td>
                  <td>{quantityLabel(row.manualLoad, row.product.unit)}</td>
                  <td>{quantityLabel(row.received, row.product.unit)}</td>
                  <td>{quantityLabel(row.produced, row.product.unit)}</td>
                  <td>{quantityLabel(row.sent, row.product.unit)}</td>
                  <td>
                    <strong>
                      {quantityLabel(row.remaining, row.product.unit)}
                    </strong>
                    {row.remaining < 0 && <small>Controllare i dati</small>}
                  </td>
                  <td>{money(row.producedRevenue)}</td>
                  <td>{money(row.residualRevenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && (
            <div className="empty-state compact-empty">
              <strong>Nessun movimento</strong>
              <span>
                Carica una fattura verificata o registra un carico manuale.
              </span>
            </div>
          )}
        </div>
      </section>

      <section className="verification-history-grid">
        <article className="panel">
          <div className="panel-heading">
            <h2>Carichi manuali</h2>
            <span className="count-pill">
              {data.verificationStockLoads.length}
            </span>
          </div>
          <div className="movement-list">
            {data.verificationStockLoads.map((entry) => (
              <div className="record-card" key={entry.id}>
                <span>
                  <strong>{productName(data.products, entry.productId)}</strong>
                  <small>
                    {entry.date} · {sellerName(data.sellers, entry.sellerId)} ·{' '}
                    {entry.note || 'Carico manuale'}
                  </small>
                </span>
                <span>
                  {quantityLabel(
                    entry.quantity,
                    data.products.find(
                      (product) => product.id === entry.productId,
                    )?.unit ?? 'pz',
                  )}
                  <button
                    className="danger-text"
                    onClick={() => removeMovement('load', entry.id)}
                    type="button"
                  >
                    Elimina
                  </button>
                </span>
              </div>
            ))}
          </div>
        </article>

        <article className="panel">
          <div className="panel-heading">
            <h2>Produzione dichiarata</h2>
            <span className="count-pill">
              {data.verificationProductionEntries.length}
            </span>
          </div>
          <div className="movement-list">
            {data.verificationProductionEntries.map((entry) => (
              <div className="record-card" key={entry.id}>
                <span>
                  <strong>{productName(data.products, entry.productId)}</strong>
                  <small>
                    {entry.date} · {sellerName(data.sellers, entry.sellerId)}
                  </small>
                </span>
                <span>
                  {quantityLabel(
                    entry.quantity,
                    data.products.find(
                      (product) => product.id === entry.productId,
                    )?.unit ?? 'pz',
                  )}
                  <button
                    className="danger-text"
                    onClick={() => removeMovement('production', entry.id)}
                    type="button"
                  >
                    Elimina
                  </button>
                </span>
              </div>
            ))}
          </div>
        </article>

        <article className="panel">
          <div className="panel-heading">
            <h2>Trasferimenti</h2>
            <span className="count-pill">
              {data.verificationTransfers.length}
            </span>
          </div>
          <div className="movement-list">
            {data.verificationTransfers.map((entry) => (
              <div className="record-card" key={entry.id}>
                <span>
                  <strong>{productName(data.products, entry.productId)}</strong>
                  <small>
                    {entry.date} ·{' '}
                    {sellerName(data.sellers, entry.fromSellerId)} →{' '}
                    {sellerName(data.sellers, entry.toSellerId)}
                    {entry.reassignRevenue ? ' · Venit spostato' : ''}
                  </small>
                </span>
                <span>
                  {quantityLabel(
                    entry.quantity,
                    data.products.find(
                      (product) => product.id === entry.productId,
                    )?.unit ?? 'pz',
                  )}
                  <button
                    className="danger-text"
                    onClick={() => removeMovement('transfer', entry.id)}
                    type="button"
                  >
                    Elimina
                  </button>
                </span>
              </div>
            ))}
          </div>
        </article>
      </section>
    </div>
  )
}
