import { DAY_SHORT, hhmm } from './time.js'

// "Mar–Jue · 12:00–16:00" a partir del horario propio de un plato
export function weekdayScheduleSummary(schedule) {
  if (!Array.isArray(schedule) || !schedule.length) return null
  const byRange = new Map()
  for (const s of schedule) {
    const key = `${hhmm(s.opens)}–${hhmm(s.closes)}`
    byRange.set(key, [...(byRange.get(key) ?? []), Number(s.weekday)])
  }
  return [...byRange.entries()]
    .map(([range, days]) => `${daysText(days)} · ${range}`)
    .join(' y ')
}

function daysText(days) {
  const order = [1, 2, 3, 4, 5, 6, 0]
  const sorted = order.filter((d) => days.includes(d))
  if (sorted.length === 7) return 'todos los días'
  // Rango consecutivo: Mar–Jue
  const idx = sorted.map((d) => order.indexOf(d))
  const consecutive = idx.every((v, i) => i === 0 || v === idx[i - 1] + 1)
  if (consecutive && sorted.length > 2) return `${DAY_SHORT[sorted[0]]}–${DAY_SHORT[sorted[sorted.length - 1]]}`
  return sorted.map((d) => DAY_SHORT[d]).join(', ')
}

// Alérgenos del plato o, si se compone con opciones, la unión de las opciones
export const dishAllergens = (d) =>
  d.allergens?.length ? d.allergens : [...new Set((d.groups ?? []).flatMap((g) => g.options.flatMap((o) => o.allergens ?? [])))]

// Precio mínimo sin impuestos (para mostrar "desde")
export function minBasePrice(d) {
  let base = Number(d.price)
  for (const g of d.groups ?? []) {
    if (!g.min_select) continue
    const prices = g.options
      .filter((o) => o.available !== false)
      .map((o) => Number(o.price_delta))
      .sort((a, b) => a - b)
    base += prices.slice(0, g.min_select).reduce((n, p) => n + p, 0)
  }
  return base
}
