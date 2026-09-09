import { useState, type FormEvent } from 'react'
import {
  activeAccounting,
  money,
  today,
} from '../domain/accounting'
import type { ProductionPayMode } from '../domain/types'
import { useAppStore } from '../store/AppStoreContext'

interface ProductionWagesPageProps {
  onBack: () => void
}

interface RateForm {
  sellerId: string
  mode: ProductionPayMode
  rate: string
}

interface WorkForm {
  sellerId: string
  productId: string
  date: string
  startTime: string
  endTime: string
  quantity: string
}

function durationHours(startTime: string, endTime: string) {
  const [startHours, startMinutes] = startTime.split(':').map(Number)
  const [endHours, endMinutes] = endTime.split(':').map(Number)
  if (
    !Number.isFinite(startHours) ||
    !Number.isFinite(startMinutes) ||
    !Number.isFinite(endHours) ||
    !Number.isFinite(endMinutes)
  ) {
    return 0
  }
  const start = startHours * 60 + startMinutes
  let end = endHours * 60 + endMinutes
  if (end < start) end += 24 * 60
  return (end - start) / 60
}

function entrySalary(
  payMode: ProductionPayMode,
  rate: number,
  startTime: string,
  endTime: string,
  quantity: number,
) {
  return payMode === 'hourly'
    ? durationHours(startTime, endTime) * rate
    : quantity * rate
}

export function ProductionWagesPage({
  onBack,
}: ProductionWagesPageProps) {
  const { state, updateAccounting } = useAppStore()
  const data = activeAccounting(state.accounting)
  const productionWorkerIds = new Set(
    data.productionSettings.flatMap((settings) => settings.workerIds),
  )
  const workers = productionWorkerIds.size
    ? data.sellers.filter((seller) => productionWorkerIds.has(seller.id))
    : data.sellers
  const firstSellerId = workers[0]?.id ?? ''
  const firstProductId = data.productionSettings[0]?.id ?? ''
  const [month, setMonth] = useState(today().slice(0, 7))
  const [rateForm, setRateForm] = useState<RateForm>({
    sellerId: firstSellerId,
    mode: 'hourly',
    rate: '',
  })
  const [workForm, setWorkForm] = useState<WorkForm>({
    sellerId: firstSellerId,
    productId: firstProductId,
    date: today(),
    startTime: '',
    endTime: '',
    quantity: '',
  })

  const ratesBySeller = new Map(
    data.productionWorkerRates.map((settings) => [
      settings.sellerId,
      settings,
    ]),
  )
  const selectedRate = ratesBySeller.get(workForm.sellerId)
  const monthlyEntries = data.productionWorkEntries
    .filter((entry) => entry.date.startsWith(month))
    .sort((left, right) =>
      `${right.date}-${right.startTime}`.localeCompare(
        `${left.date}-${left.startTime}`,
      ),
    )
  const monthlySalary = monthlyEntries.reduce(
    (total, entry) =>
      total +
      entrySalary(
        entry.payMode,
        entry.rate,
        entry.startTime,
        entry.endTime,
        entry.quantity,
      ),
    0,
  )
  const monthlyHours = monthlyEntries.reduce(
    (total, entry) =>
      total +
      (entry.payMode === 'hourly'
        ? durationHours(entry.startTime, entry.endTime)
        : 0),
    0,
  )
  const monthlyPieces = monthlyEntries.reduce(
    (total, entry) =>
      total + (entry.payMode === 'per-piece' ? entry.quantity : 0),
    0,
  )
  const workerTotals = data.sellers
    .map((seller) => {
      const entries = monthlyEntries.filter(
        (entry) => entry.sellerId === seller.id,
      )
      return {
        seller,
        total: entries.reduce(
          (sum, entry) =>
            sum +
            entrySalary(
              entry.payMode,
              entry.rate,
              entry.startTime,
              entry.endTime,
              entry.quantity,
            ),
          0,
        ),
      }
    })
    .filter((item) => item.total > 0)

  function saveRate(event: FormEvent) {
    event.preventDefault()
    if (!data.company || !rateForm.sellerId) return
    const rate = Number(rateForm.rate)
    if (!Number.isFinite(rate) || rate <= 0) return
    updateAccounting((current) => {
      const existing = current.productionWorkerRates.find(
        (settings) =>
          settings.companyId === data.company?.id &&
          settings.sellerId === rateForm.sellerId,
      )
      const next = {
        id: existing?.id ?? crypto.randomUUID(),
        companyId: data.company?.id ?? '',
        sellerId: rateForm.sellerId,
        mode: rateForm.mode,
        rate,
      }
      return {
        ...current,
        productionWorkerRates: existing
          ? current.productionWorkerRates.map((settings) =>
              settings.id === existing.id ? next : settings,
            )
          : [...current.productionWorkerRates, next],
      }
    })
    setWorkForm((current) => ({
      ...current,
      sellerId: rateForm.sellerId,
    }))
    setRateForm((current) => ({ ...current, rate: '' }))
  }

  function saveWork(event: FormEvent) {
    event.preventDefault()
    if (!data.company || !selectedRate) return
    const quantity = Number(workForm.quantity || 0)
    const hours = durationHours(workForm.startTime, workForm.endTime)
    if (
      !workForm.date ||
      !workForm.startTime ||
      !workForm.endTime ||
      (selectedRate.mode === 'hourly' && hours <= 0) ||
      (selectedRate.mode === 'per-piece' &&
        (!Number.isFinite(quantity) || quantity <= 0))
    ) {
      return
    }
    updateAccounting((current) => ({
      ...current,
      productionWorkEntries: [
        ...current.productionWorkEntries,
        {
          id: crypto.randomUUID(),
          companyId: data.company?.id ?? '',
          sellerId: workForm.sellerId,
          productId:
            selectedRate.mode === 'per-piece'
              ? workForm.productId || null
              : null,
          date: workForm.date,
          startTime: workForm.startTime,
          endTime: workForm.endTime,
          quantity:
            selectedRate.mode === 'per-piece' ? quantity : 0,
          payMode: selectedRate.mode,
          rate: selectedRate.rate,
        },
      ],
    }))
    setWorkForm((current) => ({
      ...current,
      startTime: '',
      endTime: '',
      quantity: '',
    }))
  }

  function editRate(sellerId: string) {
    const settings = ratesBySeller.get(sellerId)
    if (!settings) return
    setRateForm({
      sellerId,
      mode: settings.mode,
      rate: String(settings.rate),
    })
  }

  if (!data.company) {
    return (
      <div className="empty-state">
        Seleziona prima un'azienda per gestire gli stipendi.
      </div>
    )
  }

  return (
    <div className="page-stack">
      <header className="page-heading">
        <div>
          <span className="eyebrow">CONTROLLO PRODUZIONE</span>
          <h1>Stipendi produzione</h1>
          <p>
            Registra ore e quantità lavorate per {data.company.name} e
            controlla lo stipendio progressivo del mese.
          </p>
        </div>
        <button
          className="button button-secondary"
          onClick={onBack}
          type="button"
        >
          Torna a Costo prodotto
        </button>
      </header>

      <section className="panel production-wage-filter">
        <label>
          Mese dello stipendio
          <input
            onChange={(event) => setMonth(event.target.value)}
            required
            type="month"
            value={month}
          />
        </label>
        <div>
          <span>Totale stipendio</span>
          <strong>{money(monthlySalary)}</strong>
        </div>
        <div>
          <span>Ore retribuite</span>
          <strong>{monthlyHours.toLocaleString('it-IT')} h</strong>
        </div>
        <div>
          <span>Panini / pezzi</span>
          <strong>{monthlyPieces.toLocaleString('it-IT')}</strong>
        </div>
      </section>

      <form
        className="panel accounting-form"
        onSubmit={saveRate}
      >
        <div className="panel-heading">
          <div>
            <span className="eyebrow">PARAMETRI</span>
            <h2>Tariffe delle lavoratrici</h2>
          </div>
        </div>
        <div className="production-wage-form">
          <label>
            Lavoratrice
            <select
              onChange={(event) => {
                const sellerId = event.target.value
                const settings = ratesBySeller.get(sellerId)
                setRateForm({
                  sellerId,
                  mode: settings?.mode ?? 'hourly',
                  rate: settings ? String(settings.rate) : '',
                })
              }}
              required
              value={rateForm.sellerId}
            >
              <option value="">Seleziona</option>
              {workers.map((seller) => (
                <option key={seller.id} value={seller.id}>
                  {seller.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Tipo tariffa
            <select
              onChange={(event) =>
                setRateForm({
                  ...rateForm,
                  mode: event.target.value as ProductionPayMode,
                })
              }
              value={rateForm.mode}
            >
              <option value="hourly">All'ora</option>
              <option value="per-piece">Per panino / pezzo</option>
            </select>
          </label>
          <label>
            Importo
            <input
              inputMode="decimal"
              min="0.01"
              onChange={(event) =>
                setRateForm({ ...rateForm, rate: event.target.value })
              }
              required
              step="0.01"
              type="number"
              value={rateForm.rate}
            />
          </label>
          <button className="button button-primary" type="submit">
            Salva tariffa
          </button>
        </div>
        <div className="production-worker-rates">
          {data.productionWorkerRates.map((settings) => {
            const seller = data.sellers.find(
              (item) => item.id === settings.sellerId,
            )
            if (!seller) return null
            return (
              <button
                className="production-worker-rate"
                key={settings.id}
                onClick={() => editRate(settings.sellerId)}
                type="button"
              >
                <span>{seller.name}</span>
                <strong>
                  {money(settings.rate)}
                  {settings.mode === 'hourly' ? ' / ora' : ' / pezzo'}
                </strong>
              </button>
            )
          })}
        </div>
      </form>

      <form
        className="panel accounting-form"
        onSubmit={saveWork}
      >
        <div className="panel-heading">
          <div>
            <span className="eyebrow">LAVORO SVOLTO</span>
            <h2>Registra orario e produzione</h2>
          </div>
          <strong>
            {selectedRate
              ? selectedRate.mode === 'hourly'
                ? `${money(selectedRate.rate)} / ora`
                : `${money(selectedRate.rate)} / pezzo`
              : 'Tariffa da configurare'}
          </strong>
        </div>
        <div className="production-wage-form production-work-form">
          <label>
            Lavoratrice
            <select
              onChange={(event) =>
                setWorkForm({
                  ...workForm,
                  sellerId: event.target.value,
                })
              }
              required
              value={workForm.sellerId}
            >
              <option value="">Seleziona</option>
              {workers.map((seller) => (
                <option key={seller.id} value={seller.id}>
                  {seller.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Data
            <input
              onChange={(event) =>
                setWorkForm({ ...workForm, date: event.target.value })
              }
              required
              type="date"
              value={workForm.date}
            />
          </label>
          <label>
            Ora inizio
            <input
              onChange={(event) =>
                setWorkForm({
                  ...workForm,
                  startTime: event.target.value,
                })
              }
              required
              type="time"
              value={workForm.startTime}
            />
          </label>
          <label>
            Ora fine
            <input
              onChange={(event) =>
                setWorkForm({
                  ...workForm,
                  endTime: event.target.value,
                })
              }
              required
              type="time"
              value={workForm.endTime}
            />
          </label>
          {selectedRate?.mode === 'per-piece' && (
            <>
              <label>
                Prodotto
                <select
                  onChange={(event) =>
                    setWorkForm({
                      ...workForm,
                      productId: event.target.value,
                    })
                  }
                  value={workForm.productId}
                >
                  <option value="">Produzione generica</option>
                  {data.productionSettings.map((settings) => (
                    <option key={settings.id} value={settings.id}>
                      {settings.productName}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Quantità panini / pezzi
                <input
                  inputMode="decimal"
                  min="1"
                  onChange={(event) =>
                    setWorkForm({
                      ...workForm,
                      quantity: event.target.value,
                    })
                  }
                  required
                  step="1"
                  type="number"
                  value={workForm.quantity}
                />
              </label>
            </>
          )}
          <button
            className="button button-primary"
            disabled={!selectedRate}
            type="submit"
          >
            Registra lavoro
          </button>
        </div>
      </form>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">RIEPILOGO MENSILE</span>
            <h2>Stipendio per lavoratrice</h2>
          </div>
        </div>
        <div className="production-worker-totals">
          {workerTotals.length ? (
            workerTotals.map(({ seller, total }) => (
              <div key={seller.id}>
                <span>{seller.name}</span>
                <strong>{money(total)}</strong>
              </div>
            ))
          ) : (
            <p className="empty-state">Nessun lavoro registrato nel mese.</p>
          )}
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">STORICO</span>
            <h2>Registrazioni del mese</h2>
          </div>
        </div>
        <div className="production-wage-history">
          {monthlyEntries.length ? (
            monthlyEntries.map((entry) => {
              const seller = data.sellers.find(
                (item) => item.id === entry.sellerId,
              )
              const product = data.productionSettings.find(
                (item) => item.id === entry.productId,
              )
              const hours = durationHours(
                entry.startTime,
                entry.endTime,
              )
              return (
                <article className="record-card" key={entry.id}>
                  <span>
                    <strong>{seller?.name ?? 'Lavoratrice rimossa'}</strong>
                    <small>
                      {entry.date} · {entry.startTime}–{entry.endTime}
                    </small>
                    <small>
                      {entry.payMode === 'hourly'
                        ? `${hours.toLocaleString('it-IT')} ore × ${money(entry.rate)}`
                        : `${entry.quantity.toLocaleString('it-IT')} pezzi × ${money(entry.rate)}${product ? ` · ${product.productName}` : ''}`}
                    </small>
                  </span>
                  <span>
                    <strong>
                      {money(
                        entrySalary(
                          entry.payMode,
                          entry.rate,
                          entry.startTime,
                          entry.endTime,
                          entry.quantity,
                        ),
                      )}
                    </strong>
                    <button
                      className="danger-text"
                      onClick={() =>
                        updateAccounting((current) => ({
                          ...current,
                          productionWorkEntries:
                            current.productionWorkEntries.filter(
                              (item) => item.id !== entry.id,
                            ),
                        }))
                      }
                      type="button"
                    >
                      Elimina
                    </button>
                  </span>
                </article>
              )
            })
          ) : (
            <p className="empty-state">Nessuna registrazione nel mese.</p>
          )}
        </div>
      </section>
    </div>
  )
}
