import { useEffect, useState } from 'react'
import Icon from '../components/Icon.jsx'
import { Button, Card, useToast } from '../components/ui.jsx'
import { supabase } from '../lib/supabase.js'
import { DAY_SHORT, hhmm } from '../lib/time.js'

const DAYS = [1, 2, 3, 4, 5, 6, 0]
const DAY_LONG = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

const toState = (rows) =>
  Object.fromEntries(
    DAYS.map((d) => [
      d,
      rows
        .filter((r) => r.weekday === d)
        .map((r) => ({ opens: hhmm(r.opens), closes: hhmm(r.closes) === '00:00' && hhmm(r.opens) === '00:00' ? '24:00' : hhmm(r.closes) }))
        .sort((a, b) => a.opens.localeCompare(b.opens)),
    ]),
  )

// Horario semanal con varios tramos por día (p. ej. comidas y cenas)
export default function HoursEditor({ restaurant, onSaved }) {
  const toast = useToast()
  const [days, setDays] = useState(() => toState(restaurant.opening_hours))
  const [saving, setSaving] = useState(false)
  useEffect(() => setDays(toState(restaurant.opening_hours)), [restaurant])

  const update = (d, fn) => setDays((s) => ({ ...s, [d]: fn(s[d]) }))
  const addRange = (d) =>
    update(d, (r) => [...r, r.length ? { opens: '20:00', closes: '23:30' } : { opens: '13:00', closes: '16:00' }])
  const copyToAll = (d) => setDays((s) => Object.fromEntries(DAYS.map((x) => [x, s[d].map((r) => ({ ...r }))])))

  const problems = DAYS.flatMap((d) =>
    days[d].flatMap((r, i) => {
      const out = []
      if (!r.opens || !r.closes || r.opens === r.closes) out.push(`${DAY_LONG[d]}: el tramo ${i + 1} no es válido`)
      const others = days[d].filter((_, j) => j !== i && j > i)
      if (others.some((o) => overlaps(r, o))) out.push(`${DAY_LONG[d]}: hay tramos que se solapan`)
      return out
    }),
  )

  const save = async () => {
    if (problems.length) return toast(problems[0], 'error')
    setSaving(true)
    try {
      const rows = DAYS.flatMap((d) =>
        days[d].map((r) => ({ restaurant_id: restaurant.id, weekday: d, opens: r.opens, closes: r.closes === '24:00' ? '24:00' : r.closes })),
      )
      const del = await supabase.from('opening_hours').delete().eq('restaurant_id', restaurant.id)
      if (del.error) throw del.error
      if (rows.length) {
        const ins = await supabase.from('opening_hours').insert(rows)
        if (ins.error) throw ins.error
      }
      toast('Horario guardado')
      onSaved()
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <Card title="Horario semanal" icon="clock">
        <p className="-mt-2 mb-4 text-sm text-neutral-500">
          Añade varios tramos por día (comidas y cenas). Si la hora de cierre es menor que la de apertura, el tramo termina al día siguiente
          (p. ej. 20:00 – 01:00). Para abrir todo el día usa 00:00 – 24:00.
        </p>
        <ul className="divide-y divide-neutral-100">
          {DAYS.map((d) => (
            <li key={d} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start">
              <div className="flex w-28 shrink-0 items-center justify-between sm:block sm:pt-2.5">
                <span className="font-bold">{DAY_LONG[d]}</span>
                {!days[d].length && <span className="text-xs font-semibold text-neutral-400 sm:block">Cerrado</span>}
              </div>
              <div className="flex-1 space-y-2">
                {days[d].map((r, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <TimeInput value={r.opens} onChange={(v) => update(d, (rs) => rs.map((x, j) => (j === i ? { ...x, opens: v } : x)))} label={`${DAY_SHORT[d]} apertura ${i + 1}`} />
                    <span className="text-neutral-400">–</span>
                    <TimeInput value={r.closes} onChange={(v) => update(d, (rs) => rs.map((x, j) => (j === i ? { ...x, closes: v } : x)))} label={`${DAY_SHORT[d]} cierre ${i + 1}`} allow24 />
                    {r.closes <= r.opens && r.closes !== '24:00' && <span className="text-[11px] font-bold text-violet-700">+1 día</span>}
                    <button onClick={() => update(d, (rs) => rs.filter((_, j) => j !== i))} className="ml-auto grid size-9 place-items-center rounded-full text-neutral-400 hover:bg-neutral-100 hover:text-brand-600" aria-label="Quitar tramo">
                      <Icon name="trash" className="size-4" />
                    </button>
                  </div>
                ))}
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => addRange(d)} className="rounded-full bg-neutral-100 px-3 py-1.5 text-xs font-bold text-neutral-700">
                    + Añadir tramo
                  </button>
                  {days[d].length > 0 && (
                    <button onClick={() => copyToAll(d)} className="rounded-full px-3 py-1.5 text-xs font-bold text-brand-600">
                      Copiar a todos los días
                    </button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </Card>
      {problems.length > 0 && <p className="text-sm font-semibold text-brand-600">{problems[0]}</p>}
      <Button className="w-full py-4 sm:w-auto sm:px-10" loading={saving} onClick={save}>
        Guardar horario
      </Button>
    </div>
  )
}

const minutes = (t) => (t === '24:00' ? 1440 : Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5)))
function overlaps(a, b) {
  const span = (r) => {
    const s = minutes(r.opens)
    let e = minutes(r.closes)
    if (e <= s) e += 1440
    return [s, e]
  }
  const [s1, e1] = span(a)
  const [s2, e2] = span(b)
  return s1 < e2 && s2 < e1
}

function TimeInput({ value, onChange, label, allow24 }) {
  // <input type="time"> no admite 24:00: se ofrece como opción aparte para el cierre
  if (allow24 && value === '24:00')
    return (
      <button onClick={() => onChange('23:59')} className="rounded-xl bg-neutral-100 px-3 py-2 font-bold tabular-nums" aria-label={label}>
        24:00
      </button>
    )
  return (
    <span className="flex items-center gap-1">
      <input
        type="time"
        step="900"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        className="rounded-xl bg-neutral-100 px-3 py-2 font-bold tabular-nums outline-none focus:ring-2 focus:ring-brand-500"
      />
      {allow24 && value === '23:59' && (
        <button onClick={() => onChange('24:00')} className="text-[11px] font-bold text-brand-600">
          24h
        </button>
      )}
    </span>
  )
}
