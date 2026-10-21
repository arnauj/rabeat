import { useEffect, useState } from 'react'
import Icon from './Icon.jsx'
import { QtyStepper, SafeImg, Sheet } from './ui.jsx'
import { ALLERGENS } from '../data/allergens.js'
import { compact, money } from '../lib/format.js'

export default function DishSheet({ dish, restaurant, closed, onClose, onAdd }) {
  const [qty, setQty] = useState(1)
  const [note, setNote] = useState('')

  useEffect(() => {
    setQty(1)
    setNote('')
  }, [dish])

  return (
    <Sheet open={!!dish} onClose={onClose} label={dish?.name}>
      {dish && (
        <>
          <div className="relative">
            <SafeImg src={dish.image.replace('w=600', 'w=1000')} alt={dish.name} className="aspect-[4/3] w-full" />
            <button
              onClick={onClose}
              className="absolute top-4 right-4 grid size-10 place-items-center rounded-full bg-white/90 shadow-lg backdrop-blur"
              aria-label="Cerrar"
            >
              <Icon name="x" />
            </button>
          </div>
          <div className="p-5 sm:p-6">
            <p className="text-xs font-bold tracking-wide text-brand-600 uppercase">{restaurant.name}</p>
            <h2 className="mt-1 font-display text-2xl font-extrabold italic tracking-tight">{dish.name}</h2>
            <p className="mt-2 text-[15px] leading-relaxed text-neutral-600">{dish.description}</p>

            <div className="mt-5 grid grid-cols-4 gap-2 text-center">
              <Info icon="🍽️" value={dish.portion} label="Ración" />
              <Info icon="⚡" value={`${dish.kcal}`} label="kcal" />
              <Info icon="⏱️" value={`${dish.prep} min`} label="Preparación" />
              <Info icon="🛵" value={compact(dish.orders)} label="Pedidos" />
            </div>

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
          </div>

          <div className="sticky bottom-0 flex items-center gap-3 border-t border-neutral-100 bg-white/95 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur">
            <QtyStepper value={qty} onChange={setQty} min={1} />
            <button
              onClick={() => onAdd(qty, note)}
              className="flex flex-1 items-center justify-between rounded-2xl bg-brand-600 px-5 py-3.5 font-bold text-white shadow-lg shadow-brand-600/30 transition active:scale-[0.98]"
            >
              <span>Añadir</span>
              <span>{money(dish.price * qty)}</span>
            </button>
          </div>
        </>
      )}
    </Sheet>
  )
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
