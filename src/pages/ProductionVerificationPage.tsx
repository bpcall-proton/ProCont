import { useMemo, useState, type FormEvent } from 'react'
import { activeAccounting, roundMoney, today } from '../domain/accounting'
import { createId } from '../domain/defaults'
import type {
  ProductionVerificationIngredient,
  ProductionVerificationSection,
  ProductionVerificationUnit,
} from '../domain/types'
import { useStoredFilters } from '../hooks/useStoredFilters'
import { useAppStore } from '../store/AppStoreContext'

type QuantityDraft = {
  purchased: string
  consumed: string
}

const emptySectionForm = {
  name: '',
  productName: '',
}

const emptyIngredientForm = {
  name: '',
  unit: 'kg' as ProductionVerificationUnit,
  amountPerPiece: '',
}

function sumValue(value: string) {
  const expression = value
    .trim()
    .replace(/^=\s*/, '')
    .replace(/[＋﹢]/g, '+')
    .replace(/\s+/g, '')
    .replace(/\+$/, '')
  if (!expression) return null
  const terms = expression.split('+')
  if (
    terms.some(
      (term) =>
        !term ||
        !/^(?:\d+(?:[.,]\d*)?|[.,]\d+)$/.test(term),
    )
  ) {
    return null
  }
  const total = terms.reduce(
    (sum, term) => sum + Number(term.replace(',', '.')),
    0,
  )
  return Number.isFinite(total) ? Math.max(0, roundMoney(total)) : null
}

function numberValue(value: string) {
  return sumValue(value) ?? 0
}

function calculatedValue(value: string) {
  if (!value.trim()) return ''
  const total = sumValue(value)
  return total === null ? value : String(total)
}

function monthRange(month: string) {
  const normalized = /^\d{4}-\d{2}$/.test(month) ? month : today().slice(0, 7)
  const [year, monthNumber] = normalized.split('-').map(Number)
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate()
  return {
    start: `${normalized}-01`,
    end: `${normalized}-${String(lastDay).padStart(2, '0')}`,
  }
}

function baseQuantity(quantity: number, unit: ProductionVerificationUnit) {
  return unit === 'kg' ? quantity * 1000 : quantity
}

function requirementLabel(
  ingredient: Pick<ProductionVerificationIngredient, 'unit'>,
) {
  return ingredient.unit === 'pz' ? 'pz per prodotto' : 'g per prodotto'
}

function quantityLabel(
  quantity: number,
  unit: ProductionVerificationUnit,
) {
  return `${roundMoney(quantity).toLocaleString('it-IT')} ${unit}`
}

function yieldFrom(
  quantity: number,
  ingredient: ProductionVerificationIngredient,
) {
  if (ingredient.amountPerPiece <= 0) return 0
  return Math.floor(
    baseQuantity(quantity, ingredient.unit) / ingredient.amountPerPiece,
  )
}

export function ProductionVerificationPage() {
  const { state, updateAccounting } = useAppStore()
  const data = activeAccounting(state.accounting)
  const companyId = data.company?.id ?? ''
  const [filters, setFilters] = useStoredFilters(
    `production-verification-filters:${companyId || 'none'}`,
    { month: today().slice(0, 7) },
  )
  const [selectedSectionId, setSelectedSectionId] = useState(
    data.productionVerificationSections[0]?.id ?? '',
  )
  const [sectionForm, setSectionForm] = useState(emptySectionForm)
  const [ingredientForm, setIngredientForm] = useState(emptyIngredientForm)
  const [editingIngredientId, setEditingIngredientId] = useState('')
  const [confirmingIngredientId, setConfirmingIngredientId] = useState('')
  const [entryDate, setEntryDate] = useState(today())
  const [actualQuantity, setActualQuantity] = useState('')
  const [entryNote, setEntryNote] = useState('')
  const [quantities, setQuantities] = useState<Record<string, QuantityDraft>>(
    {},
  )
  const [message, setMessage] = useState('')
  const range = monthRange(filters.month)
  const selectedSection =
    data.productionVerificationSections.find(
      (section) => section.id === selectedSectionId,
    ) ??
    data.productionVerificationSections[0] ??
    null

  const entries = useMemo(
    () =>
      selectedSection
        ? data.productionVerificationEntries
            .filter(
              (entry) =>
                entry.sectionId === selectedSection.id &&
                entry.date >= range.start &&
                entry.date <= range.end,
            )
            .sort((left, right) => right.date.localeCompare(left.date))
        : [],
    [
      data.productionVerificationEntries,
      range.end,
      range.start,
      selectedSection,
    ],
  )

  const ingredientRows = useMemo(
    () =>
      selectedSection?.ingredients.map((ingredient) => {
        const periodMovements = entries.flatMap((entry) =>
          entry.ingredients.filter(
            (movement) => movement.ingredientId === ingredient.id,
          ),
        )
        const allMovements = data.productionVerificationEntries
          .filter(
            (entry) =>
              entry.sectionId === selectedSection.id &&
              entry.date <= range.end,
          )
          .flatMap((entry) =>
            entry.ingredients.filter(
              (movement) => movement.ingredientId === ingredient.id,
            ),
          )
        const purchased = periodMovements.reduce(
          (sum, movement) => sum + movement.purchasedQuantity,
          0,
        )
        const consumed = periodMovements.reduce(
          (sum, movement) => sum + movement.consumedQuantity,
          0,
        )
        const available = allMovements.reduce(
          (sum, movement) =>
            sum + movement.purchasedQuantity - movement.consumedQuantity,
          0,
        )
        return {
          ingredient,
          purchased: roundMoney(purchased),
          consumed: roundMoney(consumed),
          available: roundMoney(available),
          theoretical: yieldFrom(consumed, ingredient),
          residualPotential: yieldFrom(Math.max(0, available), ingredient),
        }
      }) ?? [],
    [
      data.productionVerificationEntries,
      entries,
      range.end,
      selectedSection,
    ],
  )

  const theoreticalQuantity =
    ingredientRows.length > 0
      ? Math.min(...ingredientRows.map((row) => row.theoretical))
      : 0
  const producedQuantity = entries.reduce(
    (sum, entry) => sum + entry.actualQuantity,
    0,
  )
  const difference = producedQuantity - theoreticalQuantity
  const limitingIngredient = ingredientRows.find(
    (row) => row.theoretical === theoreticalQuantity,
  )?.ingredient

  function selectSection(sectionId: string) {
    setSelectedSectionId(sectionId)
    setIngredientForm(emptyIngredientForm)
    setEditingIngredientId('')
    setConfirmingIngredientId('')
    setQuantities({})
    setMessage('')
  }

  function addSection(event: FormEvent) {
    event.preventDefault()
    const name = sectionForm.name.trim()
    const productName = sectionForm.productName.trim()
    if (!companyId || !name || !productName) return
    const section: ProductionVerificationSection = {
      id: createId('production-verification-section'),
      companyId,
      name,
      productName,
      ingredients: [],
    }
    updateAccounting((current) => ({
      ...current,
      productionVerificationSections: [
        ...current.productionVerificationSections,
        section,
      ],
    }))
    setSelectedSectionId(section.id)
    setSectionForm(emptySectionForm)
    setMessage('Sezione creata. Aggiungi gli ingredienti necessari.')
  }

  function removeSection() {
    if (
      !selectedSection ||
      !window.confirm(
        `Eliminare la sezione ${selectedSection.name} e tutte le sue verifiche?`,
      )
    ) {
      return
    }
    const remainingSections = data.productionVerificationSections.filter(
      (section) => section.id !== selectedSection.id,
    )
    updateAccounting((current) => ({
      ...current,
      productionVerificationSections:
        current.productionVerificationSections.filter(
          (section) => section.id !== selectedSection.id,
        ),
      productionVerificationEntries:
        current.productionVerificationEntries.filter(
          (entry) => entry.sectionId !== selectedSection.id,
        ),
    }))
    setSelectedSectionId(remainingSections[0]?.id ?? '')
    setQuantities({})
    setMessage('')
  }

  function addIngredient(event: FormEvent) {
    event.preventDefault()
    if (!selectedSection) return
    const name = ingredientForm.name.trim()
    const amountPerPiece = numberValue(ingredientForm.amountPerPiece)
    if (!name || amountPerPiece <= 0) return
    const ingredient: ProductionVerificationIngredient = {
      id:
        editingIngredientId ||
        createId('production-verification-ingredient'),
      name,
      unit: ingredientForm.unit,
      amountPerPiece,
    }
    updateAccounting((current) => ({
      ...current,
      productionVerificationSections:
        current.productionVerificationSections.map((section) =>
          section.id === selectedSection.id
            ? {
                ...section,
                ingredients: editingIngredientId
                  ? section.ingredients.map((item) =>
                      item.id === editingIngredientId ? ingredient : item,
                    )
                  : [...section.ingredients, ingredient],
              }
            : section,
        ),
    }))
    setIngredientForm(emptyIngredientForm)
    setEditingIngredientId('')
    setMessage(
      editingIngredientId ? 'Ingrediente modificato.' : 'Ingrediente aggiunto.',
    )
  }

  function editIngredient(ingredient: ProductionVerificationIngredient) {
    setEditingIngredientId(ingredient.id)
    setConfirmingIngredientId('')
    setIngredientForm({
      name: ingredient.name,
      unit: ingredient.unit,
      amountPerPiece: String(ingredient.amountPerPiece),
    })
    setMessage('Modifica i dati e premi Salva modifica.')
    requestAnimationFrame(() =>
      document
        .getElementById('production-verification-ingredient-form')
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
    )
  }

  function cancelIngredientEdit() {
    setEditingIngredientId('')
    setIngredientForm(emptyIngredientForm)
    setMessage('')
  }

  function removeIngredient(ingredientId: string) {
    if (!selectedSection) {
      return
    }
    if (confirmingIngredientId !== ingredientId) {
      setConfirmingIngredientId(ingredientId)
      return
    }
    updateAccounting((current) => ({
      ...current,
      productionVerificationSections:
        current.productionVerificationSections.map((section) =>
          section.id === selectedSection.id
            ? {
                ...section,
                ingredients: section.ingredients.filter(
                  (ingredient) => ingredient.id !== ingredientId,
                ),
              }
            : section,
        ),
    }))
    setQuantities((current) => {
      const next = { ...current }
      delete next[ingredientId]
      return next
    })
    if (editingIngredientId === ingredientId) {
      cancelIngredientEdit()
    }
    setConfirmingIngredientId('')
    setMessage('Ingrediente eliminato.')
  }

  function saveEntry(event: FormEvent) {
    event.preventDefault()
    if (!companyId || !selectedSection || selectedSection.ingredients.length === 0) {
      return
    }
    const formData = new FormData(event.currentTarget as HTMLFormElement)
    const ingredientMovements = selectedSection.ingredients.map(
      (ingredient) => ({
        ingredientId: ingredient.id,
        purchasedQuantity: numberValue(
          String(formData.get(`purchased-${ingredient.id}`) ?? ''),
        ),
        consumedQuantity: numberValue(
          String(formData.get(`consumed-${ingredient.id}`) ?? ''),
        ),
      }),
    )
    const actual = numberValue(String(formData.get('actualQuantity') ?? ''))
    if (
      actual === 0 &&
      ingredientMovements.every(
        (movement) =>
          movement.purchasedQuantity === 0 &&
          movement.consumedQuantity === 0,
      )
    ) {
      setMessage('Inserisci almeno un acquisto, un consumo o la produzione.')
      return
    }
    updateAccounting((current) => ({
      ...current,
      productionVerificationEntries: [
        {
          id: createId('production-verification-entry'),
          companyId,
          sectionId: selectedSection.id,
          date: entryDate,
          actualQuantity: actual,
          note: entryNote.trim(),
          ingredients: ingredientMovements,
        },
        ...current.productionVerificationEntries,
      ],
    }))
    setQuantities({})
    setActualQuantity('')
    setEntryNote('')
    setMessage('Verifica registrata.')
  }

  function removeEntry(entryId: string) {
    if (!window.confirm('Eliminare questa verifica registrata?')) return
    updateAccounting((current) => ({
      ...current,
      productionVerificationEntries:
        current.productionVerificationEntries.filter(
          (entry) => entry.id !== entryId,
        ),
    }))
  }

  return (
    <div className="page-stack production-verification-page">
      <header className="page-heading">
        <div>
          <span className="eyebrow">CONTROLLO PRODUZIONE</span>
          <h1>Verifica produzione</h1>
          <p>
            Confronta acquisti, consumi, resa teorica e produzione reale per
            ciascun punto.
          </p>
        </div>
        <label className="production-verification-month">
          Mese
          <input
            onChange={(event) =>
              setFilters({ month: event.target.value || today().slice(0, 7) })
            }
            type="month"
            value={filters.month}
          />
        </label>
      </header>

      <section className="panel production-verification-sections">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">PUNTI DI CONTROLLO</span>
            <h2>Sezioni produzione</h2>
          </div>
        </div>
        <div className="production-product-tabs">
          {data.productionVerificationSections.map((section) => (
            <button
              className={selectedSection?.id === section.id ? 'active' : ''}
              key={section.id}
              onClick={() => selectSection(section.id)}
              type="button"
            >
              <strong>{section.name}</strong>
              <small>{section.productName}</small>
            </button>
          ))}
        </div>
        <form
          className="production-verification-section-form"
          onSubmit={addSection}
        >
          <input
            onChange={(event) =>
              setSectionForm({ ...sectionForm, name: event.target.value })
            }
            placeholder="Nome punto / sezione"
            required
            value={sectionForm.name}
          />
          <input
            onChange={(event) =>
              setSectionForm({
                ...sectionForm,
                productName: event.target.value,
              })
            }
            placeholder="Prodotto finito, es. Panino"
            required
            value={sectionForm.productName}
          />
          <button className="button button-primary" type="submit">
            Crea sezione
          </button>
        </form>
      </section>

      {!selectedSection ? (
        <div className="empty-state">
          <strong>Crea la prima sezione</strong>
          <span>
            Indica il punto di produzione e il prodotto finito da controllare.
          </span>
        </div>
      ) : (
        <>
          <section className="stats-grid production-verification-stats">
            <article className="stat-card stat-cyan">
              <span className="stat-label">Produzione teorica</span>
              <strong>{theoreticalQuantity.toLocaleString('it-IT')} pz</strong>
              <span className="stat-detail">
                Limite: {limitingIngredient?.name ?? 'configura ingredienti'}
              </span>
            </article>
            <article className="stat-card stat-green">
              <span className="stat-label">Produzione reale</span>
              <strong>{producedQuantity.toLocaleString('it-IT')} pz</strong>
              <span className="stat-detail">{filters.month}</span>
            </article>
            <article
              className={`stat-card ${
                difference === 0
                  ? 'stat-green'
                  : difference < 0
                    ? 'stat-amber'
                    : 'stat-violet'
              }`}
            >
              <span className="stat-label">Differenza</span>
              <strong>
                {difference > 0 ? '+' : ''}
                {difference.toLocaleString('it-IT')} pz
              </strong>
              <span className="stat-detail">
                {difference === 0
                  ? 'Produzione corrispondente'
                  : difference < 0
                    ? 'Produzione inferiore al consumo'
                    : 'Produzione superiore al consumo'}
              </span>
            </article>
          </section>

          <section className="production-verification-grid">
            <form
              className="panel form-stack production-verification-config"
              id="production-verification-ingredient-form"
              onSubmit={addIngredient}
            >
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">CONFIGURAZIONE</span>
                  <h2>
                    {selectedSection.name} · {selectedSection.productName}
                  </h2>
                </div>
                <button
                  className="danger-text"
                  onClick={removeSection}
                  type="button"
                >
                  Elimina sezione
                </button>
              </div>
              <input
                onChange={(event) =>
                  setIngredientForm({
                    ...ingredientForm,
                    name: event.target.value,
                  })
                }
                placeholder="Ingrediente, es. Salame"
                required
                value={ingredientForm.name}
              />
              <div className="production-verification-inline">
                <select
                  onChange={(event) =>
                    setIngredientForm({
                      ...ingredientForm,
                      unit: event.target.value as ProductionVerificationUnit,
                    })
                  }
                  value={ingredientForm.unit}
                >
                  <option value="kg">Acquistato in kg</option>
                  <option value="g">Acquistato in grammi</option>
                  <option value="pz">Acquistato a pezzi</option>
                </select>
                <input
                  inputMode="decimal"
                  min="0"
                  onChange={(event) =>
                    setIngredientForm({
                      ...ingredientForm,
                      amountPerPiece: event.target.value,
                    })
                  }
                  placeholder={
                    ingredientForm.unit === 'pz'
                      ? 'Pezzi per 1 prodotto'
                      : 'Grammi per 1 prodotto'
                  }
                  required
                  value={ingredientForm.amountPerPiece}
                />
              </div>
              <button className="button button-primary" type="submit">
                {editingIngredientId
                  ? 'Salva modifica'
                  : 'Aggiungi ingrediente'}
              </button>
              {editingIngredientId && (
                <button
                  className="button"
                  onClick={cancelIngredientEdit}
                  type="button"
                >
                  Annulla modifica
                </button>
              )}
              <div className="movement-list">
                {selectedSection.ingredients.map((ingredient) => (
                  <div className="record-card" key={ingredient.id}>
                    <span>
                      <strong>{ingredient.name}</strong>
                      <small>
                        {ingredient.amountPerPiece.toLocaleString('it-IT')}{' '}
                        {requirementLabel(ingredient)}
                      </small>
                    </span>
                    <div className="production-verification-actions">
                      <button
                        onClick={() => editIngredient(ingredient)}
                        type="button"
                      >
                        Modifica
                      </button>
                      <button
                        className="danger-text"
                        onClick={() => removeIngredient(ingredient.id)}
                        type="button"
                      >
                        {confirmingIngredientId === ingredient.id
                          ? 'Conferma'
                          : 'Elimina'}
                      </button>
                      {confirmingIngredientId === ingredient.id && (
                        <button
                          onClick={() => setConfirmingIngredientId('')}
                          type="button"
                        >
                          Annulla
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </form>

            <form
              className="panel form-stack production-verification-entry"
              onSubmit={saveEntry}
            >
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">REGISTRAZIONE</span>
                  <h2>Acquisti, consumi e produzione</h2>
                </div>
              </div>
              <input
                onChange={(event) => setEntryDate(event.target.value)}
                required
                type="date"
                value={entryDate}
              />
              {selectedSection.ingredients.map((ingredient) => {
                const draft = quantities[ingredient.id] ?? {
                  purchased: '',
                  consumed: '',
                }
                return (
                  <div
                    className="production-verification-ingredient-entry"
                    key={ingredient.id}
                  >
                    <strong>
                      {ingredient.name} <small>({ingredient.unit})</small>
                    </strong>
                    <input
                      inputMode="text"
                      name={`purchased-${ingredient.id}`}
                      onBlur={(event) =>
                        setQuantities((current) => ({
                          ...current,
                          [ingredient.id]: {
                            ...(current[ingredient.id] ?? draft),
                            purchased: calculatedValue(
                              event.currentTarget.value,
                            ),
                          },
                        }))
                      }
                      onChange={(event) =>
                        setQuantities((current) => ({
                          ...current,
                          [ingredient.id]: {
                            ...(current[ingredient.id] ?? draft),
                            purchased: event.currentTarget.value,
                          },
                        }))
                      }
                      placeholder={`Acquistato (${ingredient.unit}), es. 12+10`}
                      value={draft.purchased}
                    />
                    <input
                      inputMode="text"
                      name={`consumed-${ingredient.id}`}
                      onBlur={(event) =>
                        setQuantities((current) => ({
                          ...current,
                          [ingredient.id]: {
                            ...(current[ingredient.id] ?? draft),
                            consumed: calculatedValue(
                              event.currentTarget.value,
                            ),
                          },
                        }))
                      }
                      onChange={(event) =>
                        setQuantities((current) => ({
                          ...current,
                          [ingredient.id]: {
                            ...(current[ingredient.id] ?? draft),
                            consumed: event.currentTarget.value,
                          },
                        }))
                      }
                      placeholder={`Consumato (${ingredient.unit}), es. 12+10`}
                      value={draft.consumed}
                    />
                  </div>
                )
              })}
              <input
                inputMode="text"
                name="actualQuantity"
                onBlur={(event) =>
                  setActualQuantity(calculatedValue(event.currentTarget.value))
                }
                onChange={(event) => setActualQuantity(event.currentTarget.value)}
                placeholder={`${selectedSection.productName} prodotti, es. 12+10`}
                value={actualQuantity}
              />
              <input
                onChange={(event) => setEntryNote(event.target.value)}
                placeholder="Nota facoltativa"
                value={entryNote}
              />
              <button
                className="button button-primary"
                disabled={selectedSection.ingredients.length === 0}
                type="submit"
              >
                Registra verifica
              </button>
            </form>
          </section>

          {message && <p className="import-message">{message}</p>}

          <section className="panel">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">CONFRONTO INGREDIENTI</span>
                <h2>Resa nel mese</h2>
              </div>
            </div>
            <div className="data-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Ingrediente</th>
                    <th>Acquistato</th>
                    <th>Consumato</th>
                    <th>Resa dal consumo</th>
                    <th>Disponibile</th>
                    <th>Produzione residua possibile</th>
                    <th>Azioni</th>
                  </tr>
                </thead>
                <tbody>
                  {ingredientRows.map((row) => (
                    <tr
                      className={
                        row.theoretical === theoreticalQuantity
                          ? 'production-verification-limiting'
                          : ''
                      }
                      key={row.ingredient.id}
                    >
                      <td>
                        <strong>{row.ingredient.name}</strong>
                        <small>
                          {row.ingredient.amountPerPiece.toLocaleString(
                            'it-IT',
                          )}{' '}
                          {requirementLabel(row.ingredient)}
                        </small>
                      </td>
                      <td>
                        {quantityLabel(
                          row.purchased,
                          row.ingredient.unit,
                        )}
                      </td>
                      <td>
                        {quantityLabel(row.consumed, row.ingredient.unit)}
                      </td>
                      <td>{row.theoretical.toLocaleString('it-IT')} pz</td>
                      <td>
                        {quantityLabel(row.available, row.ingredient.unit)}
                      </td>
                      <td>
                        {row.residualPotential.toLocaleString('it-IT')} pz
                      </td>
                      <td>
                        <div className="production-verification-actions">
                          <button
                            onClick={() => editIngredient(row.ingredient)}
                            type="button"
                          >
                            Modifica
                          </button>
                          <button
                            className="danger-text"
                            onClick={() =>
                              removeIngredient(row.ingredient.id)
                            }
                            type="button"
                          >
                            {confirmingIngredientId === row.ingredient.id
                              ? 'Conferma'
                              : 'Elimina'}
                          </button>
                          {confirmingIngredientId === row.ingredient.id && (
                            <button
                              onClick={() => setConfirmingIngredientId('')}
                              type="button"
                            >
                              Annulla
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {ingredientRows.length === 0 && (
                <div className="empty-state compact-empty">
                  <strong>Nessun ingrediente configurato</strong>
                </div>
              )}
            </div>
          </section>

          <section className="panel">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">STORICO</span>
                <h2>Verifiche del mese</h2>
              </div>
              <span className="count-pill">{entries.length}</span>
            </div>
            <div className="movement-list">
              {entries.map((entry) => (
                <div className="record-card" key={entry.id}>
                  <span>
                    <strong>
                      {entry.date} · {entry.actualQuantity.toLocaleString(
                        'it-IT',
                      )}{' '}
                      {selectedSection.productName}
                    </strong>
                    <small>
                      {entry.ingredients
                        .map((movement) => {
                          const ingredient =
                            selectedSection.ingredients.find(
                              (item) => item.id === movement.ingredientId,
                            )
                          return ingredient
                            ? `${ingredient.name}: +${quantityLabel(
                                movement.purchasedQuantity,
                                ingredient.unit,
                              )} / −${quantityLabel(
                                movement.consumedQuantity,
                                ingredient.unit,
                              )}`
                            : ''
                        })
                        .filter(Boolean)
                        .join(' · ')}
                      {entry.note ? ` · ${entry.note}` : ''}
                    </small>
                  </span>
                  <button
                    className="danger-text"
                    onClick={() => removeEntry(entry.id)}
                    type="button"
                  >
                    Elimina
                  </button>
                </div>
              ))}
              {entries.length === 0 && (
                <div className="empty-state compact-empty">
                  <strong>Nessuna verifica nel mese selezionato</strong>
                </div>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  )
}
