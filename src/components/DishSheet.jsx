import { useEffect, useMemo, useState } from 'react'
import Icon from './Icon.jsx'
import { QtyStepper, SafeImg, Sheet } from './ui.jsx'
import { ALLERGENS } from '../data/allergens.js'
import { compact, money } from '../lib/format.js'
import { resolveOptions } from '../lib/pricing.js'
import { weekdayScheduleSummary } from '../lib/dishes.js'

// priceOf(importeSinImpuestos) → precio final con recargo e IGIC
export default function DishSheet({ dish, restaurant, priceOf, closed, canOrder = true, onClose, onAdd }) {
  const [qty, setQty] = useState(1)
  const [note, setNote] = useState('')
  const [picked, setPicked] = useState([])
  const [tried, setTried] = useState(false)

  useEffect(() => {
    setQty(1)
    setNote('')
    setTried(false)
    // Preselecciona la primera opción de los grupos obligatorios de una sola elección
    setPicked((dish?.groups ?? []).filter((g) => g.min_select === 1 && g.max_select === 1).map((g) => g.options.find((o) => o.available)?.id).filter(Boolean))
  }, [dish])

  const groups = dish?.groups ?? []
  const result = useMemo(() => (dish ? resolveOptions(groups, picked) : { delta: 0 }), [dish, groups, picked])
  const unit = dish ? priceOf(Number(dish.price) + (result.delta ?? 0)) : 0

  const toggle = (g, o) => {
    setPicked((cur) => {
      const inGroup = cur.filter((id) => g.options.some((x) => x.id === id))
      if (cur.includes(o.id)) return cur.filter((id) => id !== o.id)
      if (g.max_select === 1) return [...cur.filter((id) => !inGroup.includes(id)), o.id]
      if (inGroup.length >= g.max_select) return cur
      return [...cur, o.id]
    })
  }

  const add = () => {
    setTried(true)
    if (result.error) return
    onAdd(qty, note, groups.length ? { ids: picked, delta: result.delta, chosen: result.chosen } : null)
  }

  const schedule = weekdayScheduleSummary(dish?.schedule)

  return (
    <Sheet open={!!dish} onClose={onClose} label={dish?.name}>
      {dish && (
        <>
          <div className="relative">
            {dish.image_url ? (
              <SafeImg src={dish.image_url.replace('w=600', 'w=1000')} alt={dish.name} className="aspect-[4/3] w-full" />
            ) : (
              <div className="h-20" />
            )}
            <button onClick={onClose} className="absolute top-4 right-4 grid size-10 place-items-center rounded-full bg-white/90 shadow-lg backdrop-blur" aria-label="Cerrar">
              <Icon name="x" />
            </button>
          </div>
          <div className="p-5 sm:p-6">
            <p className="text-xs font-bold tracking-wide text-brand-600 uppercase">
              {restaurant.name}
              {dish.code && ` · Nº ${dish.code}`}
            </p>
            <h2 className="mt-1 font-display text-2xl font-extrabold tracking-tight italic">{dish.name}</h2>
            {dish.name_en && <p className="text-sm text-neutral-400 italic">{dish.name_en}</p>}
            {dish.description && <p className="mt-2 text-[15px] leading-relaxed text-neutral-600">{dish.description}</p>}
            {dish.description_en && <p className="mt-1 text-sm text-neutral-400 italic">{dish.description_en}</p>}
            {schedule && (
              <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-ink px-3 py-1 text-xs font-bold text-white">
                <Icon name="clock" className="size-3.5" /> Solo {schedule}
              </p>
            )}

            <div className="mt-5 grid grid-cols-4 gap-2 text-center">
              <Info icon="🍽️" value={dish.portion || '—'} label="Ración" />
              <Info icon="⚡" value={dish.kcal ? `${dish.kcal}` : '—'} label="kcal" />
              <Info icon="⏱️" value={dish.prep_minutes ? `${dish.prep_minutes} min` : '—'} label="Preparación" />
              <Info icon="🛵" value={compact(dish.orders_count)} label="Pedidos" />
            </div>

            {groups.map((g) => {
              const count = picked.filter((id) => g.options.some((o) => o.id === id)).length
              const invalid = tried && (count < g.min_select || count > g.max_select)
              return (
                <fieldset key={g.id} className={`mt-5 rounded-2xl p-1 ${invalid ? 'ring-2 ring-brand-500' : ''}`}>
                  <legend className="flex w-full items-baseline justify-between gap-2 px-1">
                    <span className="font-extrabold">{g.name}</span>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${g.min_select > 0 ? 'bg-ink text-white' : 'bg-neutral-100 text-neutral-500'}`}>
                      {groupHint(g)}
                    </span>
                  </legend>
                  <ul className="mt-2 divide-y divide-neutral-100 rounded-2xl ring-1 ring-neutral-200">
                    {g.options.map((o) => {
                      const on = picked.includes(o.id)
                      return (
                        <li key={o.id}>
                          <button
                            type="button"
                            disabled={!o.available}
                            onClick={() => toggle(g, o)}
                            aria-pressed={on}
                            className="flex w-full items-center gap-3 px-3 py-3 text-left disabled:opacity-40"
                          >
                            <span
                              className={`grid size-6 shrink-0 place-items-center border-2 ${g.max_select === 1 ? 'rounded-full' : 'rounded-lg'} ${
                                on ? 'border-brand-600 bg-brand-600 text-white' : 'border-neutral-300'
                              }`}
                            >
                              {on && <Icon name="check" className="size-3.5" strokeWidth={3} />}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm font-semibold">{o.name}</span>
                              {o.allergens?.length > 0 && (
                                <span className="block text-[11px] text-neutral-400">{o.allergens.map((a) => ALLERGENS[a]?.icon).join(' ')}</span>
                              )}
                            </span>
                            {Number(o.price_delta) !== 0 && (
                              <span className="text-sm font-bold text-neutral-600">
                                {Number(o.price_delta) > 0 ? '+' : '−'}
                                {money(Math.abs(priceOf(Number(o.price_delta)) - priceOf(0)))}
                              </span>
                            )}
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                </fieldset>
              )
            })}

            <div className="mt-5 rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-200">
              <p className="flex items-center gap-2 text-sm font-bold text-amber-900">
                <Icon name="info" className="size-4" /> Alérgenos
              </p>
              {dish.allergens.length ? (
                <ul className="mt-3 flex flex-wrap gap-2">
                  {dish.allergens.map((a) => (
                    <li key={a} className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-sm font-semibold ring-1 ring-amber-200">
                      <span>{ALLERGENS[a].icon}</span>
                      {ALLERGENS[a].name}
                    </li>
                  ))}
                </ul>
              ) : groups.length ? (
                <p className="mt-2 text-sm text-amber-900">Dependen de lo que elijas: los indicamos junto a cada opción.</p>
              ) : (
                <p className="mt-2 text-sm text-amber-900">Este plato no contiene ninguno de los 14 alérgenos principales.</p>
              )}
            </div>

            <label className="mt-5 block">
              <span className="text-sm font-bold">Instrucciones especiales</span>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                maxLength={140}
                placeholder="Ej.: sin cebolla, salsa aparte…"
                className="mt-2 w-full resize-none rounded-2xl bg-neutral-100 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-500"
              />
            </label>

            {closed && (
              <p className="mt-4 flex items-center gap-2 rounded-2xl bg-neutral-900 px-4 py-3 text-sm text-white">
                <Icon name="calendar" className="size-4 shrink-0 text-brand-400" />
                Restaurante cerrado: elegirás la hora de entrega al pagar.
              </p>
            )}
            <p className="mt-3 text-center text-[11px] text-neutral-400">Precios con IGIC incluido</p>
          </div>

          {canOrder && (
            <div className="sticky bottom-0 border-t border-neutral-100 bg-white/95 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur">
              {tried && result.error && <p className="mb-2 text-center text-xs font-bold text-brand-600">{result.error}</p>}
              <div className="flex items-center gap-3">
                <QtyStepper value={qty} onChange={setQty} min={1} />
                <button
                  onClick={add}
                  className="flex flex-1 items-center justify-between rounded-2xl bg-brand-600 px-5 py-3.5 font-bold text-white shadow-lg shadow-brand-600/30 transition active:scale-[0.98]"
                >
                  <span>Añadir</span>
                  <span>{money(unit * qty)}</span>
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </Sheet>
  )
}

function groupHint(g) {
  const free = g.free_select
  const extra = Number(g.extra_price) > 0 && free != null ? ` · extra +${money(g.extra_price)}` : ''
  if (g.min_select === 1 && g.max_select === 1) return 'Elige 1'
  if (g.min_select === 0) return `Opcional · hasta ${g.max_select}${free != null && free < g.max_select ? ` (${free} incl.)` : ''}${extra}`
  return `Elige ${g.min_select}–${g.max_select}${free != null && free < g.max_select ? ` (${free} incl.)` : ''}${extra}`
}

function Info({ icon, value, label }) {
  return (
    <div className="rounded-2xl bg-neutral-100 px-1 py-2.5">
      <div className="text-lg">{icon}</div>
      <div className="mt-0.5 text-[13px] leading-tight font-extrabold">{value}</div>
      <div className="text-[10px] font-medium text-neutral-500">{label}</div>
    </div>
  )
}
