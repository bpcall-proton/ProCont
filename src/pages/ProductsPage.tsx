import { useMemo, useState, type FormEvent } from 'react'
import {
  activeAccounting,
  markupPercentage,
  money,
  productSalePrice,
} from '../domain/accounting'
import { createId } from '../domain/defaults'
import type {
  AccountingProduct,
  ProductPricingMode,
} from '../domain/types'
import { useAppStore } from '../store/AppStoreContext'

const emptyProduct = {
  supplierId: '',
  code: '',
  name: '',
  purchaseCostInclVat: '',
  pricingMode: 'sale-price' as ProductPricingMode,
  salePriceInclVat: '',
  markupPercent: '',
  notes: '',
}

function numberValue(value: string) {
  const parsed = Number(value.replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : 0
}

export function ProductsPage() {
  const { state, updateAccounting } = useAppStore()
  const data = activeAccounting(state.accounting)
  const [form, setForm] = useState(emptyProduct)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [supplierFilter, setSupplierFilter] = useState('')
  const [query, setQuery] = useState('')
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const products = useMemo(
    () =>
      data.products
        .filter(
          (product) =>
            !supplierFilter || product.supplierId === supplierFilter,
        )
        .filter(
          (product) =>
            !normalizedQuery ||
            product.name.toLocaleLowerCase().includes(normalizedQuery) ||
            product.code.toLocaleLowerCase().includes(normalizedQuery),
        )
        .sort((left, right) => left.name.localeCompare(right.name)),
    [data.products, normalizedQuery, supplierFilter],
  )

  function submit(event: FormEvent) {
    event.preventDefault()
    const companyId = state.accounting.activeCompanyId
    if (!companyId) return
    const supplier = data.suppliers.find(
      (item) => item.id === form.supplierId,
    )
    const product: AccountingProduct = {
      id: editingId ?? createId('product'),
      companyId,
      supplierId: supplier?.id ?? null,
      supplierName: supplier?.name ?? '',
      code: form.code.trim(),
      name: form.name.trim(),
      purchaseCostInclVat: numberValue(form.purchaseCostInclVat),
      pricingMode: form.pricingMode,
      salePriceInclVat:
        form.pricingMode === 'sale-price'
          ? numberValue(form.salePriceInclVat)
          : 0,
      markupPercent:
        form.pricingMode === 'markup'
          ? numberValue(form.markupPercent)
          : 0,
      notes: form.notes.trim(),
    }
    updateAccounting((current) => ({
      ...current,
      products: editingId
        ? current.products.map((item) =>
            item.id === editingId ? product : item,
          )
        : [product, ...current.products],
    }))
    setEditingId(null)
    setForm(emptyProduct)
  }

  function edit(product: AccountingProduct) {
    setEditingId(product.id)
    setForm({
      supplierId: product.supplierId ?? '',
      code: product.code,
      name: product.name,
      purchaseCostInclVat: String(product.purchaseCostInclVat),
      pricingMode: product.pricingMode,
      salePriceInclVat: String(product.salePriceInclVat),
      markupPercent: String(product.markupPercent),
      notes: product.notes,
    })
  }

  function remove(id: string) {
    if (!window.confirm('Eliminare questo prodotto?')) return
    updateAccounting((current) => ({
      ...current,
      products: current.products.filter((item) => item.id !== id),
    }))
  }

  return (
    <div className="page-stack">
      <header className="page-heading">
        <div>
          <span className="eyebrow">ANAGRAFICA VENIT</span>
          <h1>Prodotti dei fornitori</h1>
          <p>
            Definisci il costo comprensivo di IVA e il prezzo di vendita, il
            ricarico percentuale oppure il calcolo manuale.
          </p>
        </div>
      </header>

      <form className="panel accounting-form" onSubmit={submit}>
        <div className="panel-heading">
          <div>
            <span className="eyebrow">SCHEDA PRODOTTO</span>
            <h2>{editingId ? 'Modifica prodotto' : 'Nuovo prodotto'}</h2>
          </div>
        </div>
        <div className="form-grid product-fields">
          <label>
            Fornitore
            <select
              onChange={(event) =>
                setForm({ ...form, supplierId: event.target.value })
              }
              value={form.supplierId}
            >
              <option value="">Nessuno</option>
              {data.suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Codice / barcode
            <input
              onChange={(event) =>
                setForm({ ...form, code: event.target.value })
              }
              value={form.code}
            />
          </label>
          <label>
            Nome prodotto
            <input
              onChange={(event) =>
                setForm({ ...form, name: event.target.value })
              }
              required
              value={form.name}
            />
          </label>
          <label>
            Costo unitario IVA inclusa
            <input
              inputMode="decimal"
              min="0"
              onChange={(event) =>
                setForm({
                  ...form,
                  purchaseCostInclVat: event.target.value,
                })
              }
              required
              value={form.purchaseCostInclVat}
            />
          </label>
          <label>
            Regola venit
            <select
              onChange={(event) =>
                setForm({
                  ...form,
                  pricingMode: event.target.value as ProductPricingMode,
                })
              }
              value={form.pricingMode}
            >
              <option value="sale-price">Prezzo vendita fisso</option>
              <option value="markup">Percentuale di ricarico</option>
              <option value="manual">Da scrivere sulla fattura</option>
            </select>
          </label>
          {form.pricingMode === 'sale-price' && (
            <label>
              Vendita unitaria IVA inclusa
              <input
                inputMode="decimal"
                min="0"
                onChange={(event) =>
                  setForm({ ...form, salePriceInclVat: event.target.value })
                }
                required
                value={form.salePriceInclVat}
              />
            </label>
          )}
          {form.pricingMode === 'markup' && (
            <label>
              Ricarico %
              <input
                inputMode="decimal"
                onChange={(event) =>
                  setForm({ ...form, markupPercent: event.target.value })
                }
                required
                value={form.markupPercent}
              />
            </label>
          )}
          <label className="wide-field">
            Note
            <input
              onChange={(event) =>
                setForm({ ...form, notes: event.target.value })
              }
              value={form.notes}
            />
          </label>
        </div>
        <div className="form-actions">
          {editingId && (
            <button
              className="button button-secondary"
              onClick={() => {
                setEditingId(null)
                setForm(emptyProduct)
              }}
              type="button"
            >
              Annulla
            </button>
          )}
          <button className="button button-primary" type="submit">
            {editingId ? 'Salva prodotto' : 'Aggiungi prodotto'}
          </button>
        </div>
      </form>

      <section className="panel">
        <div className="table-toolbar invoice-table-toolbar">
          <h2>Catalogo prodotti</h2>
          <div className="invoice-filters">
            <input
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Cerca nome o codice"
              type="search"
              value={query}
            />
            <select
              onChange={(event) => setSupplierFilter(event.target.value)}
              value={supplierFilter}
            >
              <option value="">Tutti i fornitori</option>
              {data.suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="data-table-wrap">
          <table className="data-table product-table">
            <thead>
              <tr>
                <th>Prodotto</th>
                <th>Fornitore</th>
                <th>Costo IVA inclusa</th>
                <th>Vendita / regola</th>
                <th>Ricarico</th>
                <th>Azioni</th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => {
                const salePrice = productSalePrice(product)
                const markup =
                  product.pricingMode === 'manual'
                    ? null
                    : markupPercentage(
                        product.purchaseCostInclVat,
                        salePrice,
                      )
                return (
                  <tr key={product.id}>
                    <td>
                      <strong>{product.name}</strong>
                      <small>{product.code || 'Codice non indicato'}</small>
                    </td>
                    <td>{product.supplierName || '—'}</td>
                    <td>{money(product.purchaseCostInclVat)}</td>
                    <td>
                      {product.pricingMode === 'manual'
                        ? 'Manuale in fattura'
                        : money(salePrice)}
                    </td>
                    <td>{markup === null ? '—' : `${markup}%`}</td>
                    <td className="row-actions">
                      <button onClick={() => edit(product)} type="button">
                        Modifica
                      </button>
                      <button
                        className="danger-text"
                        onClick={() => remove(product.id)}
                        type="button"
                      >
                        Elimina
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {products.length === 0 && (
            <div className="empty-state compact-empty">
              <strong>Nessun prodotto</strong>
              <span>Aggiungi il primo prodotto e la sua regola venit.</span>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
