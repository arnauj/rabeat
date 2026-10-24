// Horarios de apertura con zona horaria (compartido entre la app y las funciones del servidor).
// `hours` es una lista de tramos: [{ weekday: 0-6 (0 = domingo), opens: 'HH:MM', closes: 'HH:MM' }].
// Si closes <= opens, el tramo termina al día siguiente. '00:00'-'24:00' es el día completo.

export const DEFAULT_TZ = 'Atlantic/Canary'
const DAY_NAMES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
export const DAY_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

const formatters = new Map()
function zonedParts(date, tz) {
  let f = formatters.get(tz)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
    })
    formatters.set(tz, f)
  }
  const p = {}
  for (const { type, value } of f.formatToParts(date)) p[type] = Number(value)
  return { y: p.year, m: p.month, d: p.day, h: p.hour % 24, mi: p.minute }
}

// Instante UTC que corresponde a una hora de pared en la zona dada
export function zonedTime(y, m, d, h, mi, tz) {
  const guess = Date.UTC(y, m - 1, d, h, mi)
  const offsetAt = (t) => {
    const p = zonedParts(new Date(t), tz)
    return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi) - t
  }
  let t = guess - offsetAt(guess)
  const second = offsetAt(t)
  if (guess - second !== t) t = guess - second
  return new Date(t)
}

const toMin = (hhmm) => {
  const [h, m] = String(hhmm).split(':').map(Number)
  return h * 60 + m
}
const pad = (n) => String(n).padStart(2, '0')
export const hhmm = (t) => String(t).slice(0, 5)

// Fecha de calendario (en la zona) desplazada `offset` días
function zonedDay(from, offset, tz) {
  const p = zonedParts(from, tz)
  const base = new Date(Date.UTC(p.y, p.m - 1, p.d + offset))
  return { y: base.getUTCFullYear(), m: base.getUTCMonth() + 1, d: base.getUTCDate(), weekday: base.getUTCDay() }
}

export function openingIntervals(hours, from = new Date(), days = 3, tz = DEFAULT_TZ) {
  const out = []
  for (let offset = -1; offset <= days; offset++) {
    const day = zonedDay(from, offset, tz)
    for (const r of hours) {
      if (Number(r.weekday) !== day.weekday) continue
      const o = toMin(r.opens)
      let c = toMin(r.closes)
      if (c <= o) c += 24 * 60
      out.push({
        start: zonedTime(day.y, day.m, day.d, Math.floor(o / 60), o % 60, tz),
        end: zonedTime(day.y, day.m, day.d, Math.floor(c / 60), c % 60, tz),
      })
    }
  }
  out.sort((a, b) => a.start - b.start)
  const merged = []
  for (const it of out) {
    const last = merged[merged.length - 1]
    if (last && it.start <= last.end) last.end = new Date(Math.max(last.end, it.end))
    else merged.push({ ...it })
  }
  return merged
}

export function getStatus(hours, now = new Date(), tz = DEFAULT_TZ) {
  const intervals = openingIntervals(hours, now, 7, tz)
  const current = intervals.find((i) => i.start <= now && now < i.end)
  if (current) {
    const alwaysOpen = current.end - current.start >= 6 * 24 * 3600_000
    return { open: true, alwaysOpen, closesAt: current.end }
  }
  const next = intervals.find((i) => i.start > now)
  return { open: false, opensAt: next?.start ?? null }
}

export const formatHour = (date, tz = DEFAULT_TZ) => {
  const p = zonedParts(date, tz)
  return `${pad(p.h)}:${pad(p.mi)}`
}

export function relativeDay(date, now = new Date(), tz = DEFAULT_TZ) {
  const a = zonedParts(date, tz)
  const b = zonedParts(now, tz)
  const diff = Math.round((Date.UTC(a.y, a.m - 1, a.d) - Date.UTC(b.y, b.m - 1, b.d)) / 86_400_000)
  if (diff === 0) return 'hoy'
  if (diff === 1) return 'mañana'
  return `el ${DAY_NAMES[new Date(Date.UTC(a.y, a.m - 1, a.d)).getUTCDay()]}`
}

export function statusLabel(status, now = new Date(), tz = DEFAULT_TZ) {
  if (status.open) {
    if (status.alwaysOpen) return 'Abierto 24 h'
    return `Abierto · cierra a las ${formatHour(status.closesAt, tz)}`
  }
  if (!status.opensAt) return 'Sin horario disponible'
  return `Cerrado · abre ${relativeDay(status.opensAt, now, tz)} a las ${formatHour(status.opensAt, tz)}`
}

export const SLOT_MINUTES = 30
export const MIN_SCHEDULE_LEAD_MINUTES = 45

// Franjas de entrega de 30 min dentro del horario, desde ahora + margen de preparación
export function deliverySlots(hours, now = new Date(), days = 3, tz = DEFAULT_TZ) {
  const earliest = new Date(now.getTime() + MIN_SCHEDULE_LEAD_MINUTES * 60_000)
  const limit = new Date(now.getTime() + (days + 1) * 86_400_000)
  const slots = []
  for (const { start, end } of openingIntervals(hours, now, days, tz)) {
    let t = new Date(start.getTime() + SLOT_MINUTES * 60_000)
    const mins = zonedParts(t, tz).mi % SLOT_MINUTES
    if (mins) t = new Date(t.getTime() + (SLOT_MINUTES - mins) * 60_000)
    while (t.getTime() + SLOT_MINUTES * 60_000 <= end.getTime()) {
      if (t >= earliest && t < limit) slots.push(new Date(t))
      t = new Date(t.getTime() + SLOT_MINUTES * 60_000)
    }
  }
  return slots
}

export function isValidSlot(hours, slot, now = new Date(), tz = DEFAULT_TZ) {
  return deliverySlots(hours, now, 4, tz).some((s) => s.getTime() === slot.getTime())
}

export function groupSlotsByDay(slots, now = new Date(), tz = DEFAULT_TZ) {
  const groups = new Map()
  for (const s of slots) {
    const p = zonedParts(s, tz)
    const key = `${p.y}-${pad(p.m)}-${pad(p.d)}`
    if (!groups.has(key)) groups.set(key, { key, label: relativeDay(s, now, tz), date: s, slots: [] })
    groups.get(key).slots.push(s)
  }
  return [...groups.values()]
}

export function slotLabel(date, now = new Date(), tz = DEFAULT_TZ) {
  const day = relativeDay(date, now, tz)
  const end = new Date(date.getTime() + SLOT_MINUTES * 60_000)
  return `${day.charAt(0).toUpperCase()}${day.slice(1)}, ${formatHour(date, tz)} – ${formatHour(end, tz)}`
}

export const todayWeekday = (now = new Date(), tz = DEFAULT_TZ) => zonedDay(now, 0, tz).weekday

export function weekdayScheduleText(hours, weekday) {
  const ranges = hours
    .filter((h) => Number(h.weekday) === weekday)
    .sort((a, b) => toMin(a.opens) - toMin(b.opens))
  if (!ranges.length) return 'Cerrado'
  return ranges
    .map((r) => (hhmm(r.opens) === '00:00' && ['24:00', '00:00'].includes(hhmm(r.closes)) ? '24 horas' : `${hhmm(r.opens)} – ${hhmm(r.closes)}`))
    .join(' · ')
}

// Medianoche (en la zona) del día de `date` desplazado `offset` días
export function startOfZonedDay(date = new Date(), tz = DEFAULT_TZ, offset = 0) {
  const d = zonedDay(date, offset, tz)
  return zonedTime(d.y, d.m, d.d, 0, 0, tz)
}
