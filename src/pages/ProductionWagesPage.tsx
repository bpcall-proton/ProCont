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
  date: string
  startTime: string
  endTime: string
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
  const [month, setMonth] = useState(today().slice(0, 7))
  const [rateForm, setRateForm] = useState<RateForm>({
    sellerId: firstSellerId,
    mode: 'hourly',
    rate: '',
  })
  const [workForm, setWorkForm] = useState<WorkForm>({
    sellerId: firstSellerId,
    date: today(),
    startTime: '',
    endTime: '',
  })

  const ratesBySeller = new Map(
    data.productionWorkerRates.map((settings) => [
      settings.sellerId,
      settings,
    ]),
  )
  const selectedRate = ratesBySeller.get(workForm.sellerId)
  const monthlyHourlyEntries = data.productionWorkEntries
    .filter(
      (entry) =>
        entry.payMode === 'hourly' && entry.date.startsWith(month),
    )
    .sort((left, right) =>
      `${right.date}-${right.startTime}`.localeCompare(
        `${left.date}-${left.startTime}`,
      ),
    )
  const automaticPieceRows = data.productionWorkerRates
    .filter((settings) => settings.mode === 'per-piece')
    .flatMap((settings) =>
      data.productionSettings
        .filter((product) => product.workerIds.includes(settings.sellerId))
        .map((product) => {
          const quantity = data.productionEntries
            .filter(
              (entry) =>
                entry.productId === product.id &&
                entry.date.startsWith(month),
            )
            .reduce((total, entry) => total + entry.quantity, 0)
          return {
            sellerId: settings.sellerId,
            productId: product.id,
            productName: product.productName,
            quantity,
            rate: settings.rate,
            total: quantity * settings.rate,
          }
        }),
    )
  const selectedPieceRows = automaticPieceRows.filter(
    (row) => row.sellerId === workForm.sellerId,
  )
  const monthlySalary =
    monthlyHourlyEntries.reduce(
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
    ) +
    automaticPieceRows.reduce((total, row) => total + row.total, 0)
  const monthlyHours = monthlyHourlyEntries.reduce(
    (total, entry) =>
      total + durationHours(entry.startTime, entry.endTime),
    0,
  )
  const monthlyPieces = automaticPieceRows.reduce(
    (total, row) => total + row.quantity,
    0,
  )
  const workerTotals = data.sellers
    .map((seller) => {
      const entries = monthlyHourlyEntries.filter(
        (entry) => entry.sellerId === seller.id,
      )
      const automaticTotal = automaticPieceRows
        .filter((row) => row.sellerId === seller.id)
        .reduce((sum, row) => sum + row.total, 0)
      return {
        seller,
        total:
          entries.reduce(
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
          ) + automaticTotal,
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
    if (
      !data.company ||
      !selectedRate ||
      selectedRate.mode !== 'hourly'
    ) {
      return
    }
    const hours = durationHours(workForm.startTime, workForm.endTime)
    if (
      !workForm.date ||
      !workForm.startTime ||
      !workForm.endTime ||
      hours <= 0
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
          productId: null,
          date: workForm.date,
          startTime: workForm.startTime,
          endTime: workForm.endTime,
          quantity: 0,
          payMode: 'hourly',
          rate: selectedRate.rate,
        },
      ],
    }))
    setWorkForm((current) => ({
      ...current,
      startTime: '',
      endTime: '',
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
    <div className="page-stack production-wages-page">
      <header className="page-heading">
        <div>
          <span className="eyebrow">CONTROLLO PRODUZIONE</span>
          <h1>Stipendi produzione</h1>
          <p>
            Registra le ore lavorate; i pezzi prodotti vengono rilevati
            automaticamente per {data.company.name}.
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
            <h2>
              {selectedRate?.mode === 'per-piece'
                ? 'Produzione rilevata automaticamente'
                : 'Registra orario di lavoro'}
            </h2>
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
          {selectedRate?.mode === 'hourly' ? (
            <>
              <label>
                Data
                <input
                  onChange={(event) =>
                    setWorkForm({
                      ...workForm,
                      date: event.target.value,
                    })
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
              <button
                className="button button-primary"
                type="submit"
              >
                Registra ore
              </button>
            </>
          ) : selectedRate?.mode === 'per-piece' ? (
            <div className="production-piece-summary">
              <span>Pezzi rilevati nel mese</span>
              <strong>
                {selectedPieceRows
                  .reduce((total, row) => total + row.quantity, 0)
                  .toLocaleString('it-IT')}
              </strong>
              <small>
                {selectedPieceRows.length
                  ? selectedPieceRows
                      .map(
                        (row) =>
                          `${row.productName}: ${row.quantity.toLocaleString('it-IT')}`,
                      )
                      .join(' · ')
                  : 'Assegna la lavoratrice a un prodotto nella pagina Costo prodotto.'}
              </small>
              <strong>
                {money(
                  selectedPieceRows.reduce(
                    (total, row) => total + row.total,
                    0,
                  ),
                )}
              </strong>
            </div>
          ) : (
            <small>Configura prima la tariffa della lavoratrice.</small>
          )}
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
          {monthlyHourlyEntries.length ||
          automaticPieceRows.some((row) => row.quantity > 0) ? (
            <>
              {monthlyHourlyEntries.map((entry) => {
                const seller = data.sellers.find(
                  (item) => item.id === entry.sellerId,
                )
                const hours = durationHours(
                  entry.startTime,
                  entry.endTime,
                )
                return (
                  <article className="record-card" key={entry.id}>
                    <span>
                      <strong>
                        {seller?.name ?? 'Lavoratrice rimossa'}
                      </strong>
                      <small>
                        {entry.date} · {entry.startTime}–{entry.endTime}
                      </small>
                      <small>
                        {hours.toLocaleString('it-IT')} ore ×{' '}
                        {money(entry.rate)}
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
              })}
              {automaticPieceRows
                .filter((row) => row.quantity > 0)
                .map((row) => {
                  const seller = data.sellers.find(
                    (item) => item.id === row.sellerId,
                  )
                  return (
                    <article
                      className="record-card"
                      key={`${row.sellerId}-${row.productId}`}
                    >
                      <span>
                        <strong>
                          {seller?.name ?? 'Lavoratrice rimossa'}
                        </strong>
                        <small>{month} · calcolo automatico</small>
                        <small>
                          {row.quantity.toLocaleString('it-IT')} pezzi ×{' '}
                          {money(row.rate)} · {row.productName}
                        </small>
                      </span>
                      <span>
                        <strong>{money(row.total)}</strong>
                      </span>
                    </article>
                  )
                })}
            </>
          ) : (
            <p className="empty-state">Nessuna registrazione nel mese.</p>
          )}
        </div>
      </section>
    </div>
  )
}
