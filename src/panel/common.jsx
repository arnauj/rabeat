import { useState } from 'react'
import { startOfZonedDay } from '../lib/time.js'
import { money } from '../lib/format.js'

export const PERIODS = [
  { id: 'today', label: 'Hoy' },
  { id: '7d', label: '7 días' },
  { id: '30d', label: '30 días' },
  { id: 'month', label: 'Este mes' },
  { id: 'all', label: 'Todo' },
]

export function periodRange(id, tz, now = new Date()) {
  const to = startOfZonedDay(now, tz, 1)
  if (id === 'today') return { from: startOfZonedDay(now, tz), to }
  if (id === '7d') return { from: startOfZonedDay(now, tz, -6), to }
  if (id === '30d') return { from: startOfZonedDay(now, tz, -29), to }
  if (id === 'month') {
    const day = Number(new Intl.DateTimeFormat('en-US', { timeZone: tz, day: 'numeric' }).format(now))
    return { from: startOfZonedDay(now, tz, -(day - 1)), to }
  }
  return { from: new Date('2020-01-01T00:00:00Z'), to }
}

export function PeriodPicker({ value, onChange }) {
  return (
    <div className="no-scrollbar flex gap-1 overflow-x-auto rounded-2xl bg-white p-1 ring-1 ring-neutral-200" role="tablist" aria-label="Periodo">
      {PERIODS.map((p) => (
        <button
          key={p.id}
          role="tab"
          aria-selected={value === p.id}
          onClick={() => onChange(p.id)}
          className={`shrink-0 rounded-xl px-3 py-1.5 text-sm font-bold transition ${value === p.id ? 'bg-ink text-white' : 'text-neutral-500 hover:text-ink'}`}
        >
          {p.label}
        </button>
      ))}
    </div>
  )
}

export function StatTile({ label, value, hint, accent = false }) {
  return (
    <div className={`rounded-3xl p-4 ring-1 ${accent ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white ring-neutral-200/70'}`}>
      <p className={`text-xs font-bold ${accent ? 'text-white/80' : 'text-neutral-500'}`}>{label}</p>
      <p className="mt-1 text-2xl font-extrabold tracking-tight tabular-nums">{value}</p>
      {hint && <p className={`mt-0.5 text-xs ${accent ? 'text-white/75' : 'text-neutral-400'}`}>{hint}</p>}
    </div>
  )
}

// Barras de una sola serie (ventas por día) con tooltip al pasar o tocar
export function DailyBars({ data, valueKey = 'gross', label = 'Ventas', format = money }) {
  const [active, setActive] = useState(null)
  if (!data?.length) return <p className="py-10 text-center text-sm text-neutral-400">Sin ventas en este periodo</p>
  const max = Math.max(...data.map((d) => Number(d[valueKey]))) || 1
  const fmtDay = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
  const shown = active ?? data.length - 1
  return (
    <figure>
      <figcaption className="mb-3 flex items-baseline justify-between text-sm">
        <span className="font-bold">{label} por día</span>
        <span className="text-neutral-500">
          {fmtDay(data[shown].day)} · <b className="text-ink tabular-nums">{format(data[shown][valueKey])}</b> · {data[shown].orders} pedidos
        </span>
      </figcaption>
      <div className="flex h-40 items-end gap-[2px] border-b border-neutral-200" onMouseLeave={() => setActive(null)}>
        {data.map((d, i) => (
          <button
            key={d.day}
            onMouseEnter={() => setActive(i)}
            onFocus={() => setActive(i)}
            onClick={() => setActive(i)}
            className="group flex h-full flex-1 items-end"
            aria-label={`${fmtDay(d.day)}: ${format(d[valueKey])}`}
          >
            <span
              className={`block w-full rounded-t-[4px] transition ${i === shown ? 'bg-brand-600' : 'bg-brand-300 group-hover:bg-brand-500'}`}
              style={{ height: `${Math.max(3, (Number(d[valueKey]) / max) * 100)}%` }}
            />
          </button>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-neutral-400">
        <span>{fmtDay(data[0].day)}</span>
        {data.length > 1 && <span>{fmtDay(data[data.length - 1].day)}</span>}
      </div>
    </figure>
  )
}

export function Table({ head, children }) {
  return (
    <div className="overflow-x-auto rounded-3xl bg-white ring-1 ring-neutral-200/70">
      <table className="w-full min-w-[560px] text-sm">
        <thead className="bg-neutral-50 text-left text-xs text-neutral-500">
          <tr>
            {head.map((h, i) => (
              <th key={i} className={`px-4 py-3 font-bold ${i > 0 ? 'text-right' : ''}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100 tabular-nums">{children}</tbody>
      </table>
    </div>
  )
}
