const DAY_NAMES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
export const DAY_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

const toMin = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

const pad = (n) => String(n).padStart(2, '0')
export const formatHour = (date) => `${pad(date.getHours())}:${pad(date.getMinutes())}`

const startOfDay = (date) => {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

const addMinutes = (date, minutes) => new Date(date.getTime() + minutes * 60_000)

// Devuelve los intervalos de apertura reales (Date) que tocan los días [from-1, from+days]
export function openingIntervals(restaurant, from = new Date(), days = 3) {
  const base = startOfDay(from)
  const out = []
  for (let offset = -1; offset <= days; offset++) {
    const dayStart = new Date(base)
    dayStart.setDate(base.getDate() + offset)
    const ranges = restaurant.hours[dayStart.getDay()] ?? []
    for (const [open, close] of ranges) {
      const o = toMin(open)
      let c = toMin(close)
      if (c <= o) c += 24 * 60 // cruza medianoche
      out.push({ start: addMinutes(dayStart, o), end: addMinutes(dayStart, c) })
    }
  }
  // Une intervalos contiguos (p. ej. 24h seguidas)
  out.sort((a, b) => a.start - b.start)
  const merged = []
  for (const it of out) {
    const last = merged[merged.length - 1]
    if (last && it.start <= last.end) last.end = new Date(Math.max(last.end, it.end))
    else merged.push({ ...it })
  }
  return merged
}

export function getStatus(restaurant, now = new Date()) {
  const intervals = openingIntervals(restaurant, now, 7)
  const current = intervals.find((i) => i.start <= now && now < i.end)
  if (current) {
    const alwaysOpen = current.end - current.start >= 6 * 24 * 3600_000
    return { open: true, alwaysOpen, closesAt: current.end }
  }
  const next = intervals.find((i) => i.start > now)
  return { open: false, opensAt: next?.start ?? null }
}

export function relativeDay(date, now = new Date()) {
  const diff = Math.round((startOfDay(date) - startOfDay(now)) / 86_400_000)
  if (diff === 0) return 'hoy'
  if (diff === 1) return 'mañana'
  return `el ${DAY_NAMES[date.getDay()]}`
}

export function statusLabel(status, now = new Date()) {
  if (status.open) {
    if (status.alwaysOpen) return 'Abierto 24 h'
    return `Abierto · cierra a las ${formatHour(status.closesAt)}`
  }
  if (!status.opensAt) return 'Cerrado temporalmente'
  return `Cerrado · abre ${relativeDay(status.opensAt, now)} a las ${formatHour(status.opensAt)}`
}

// Franjas de entrega de 30 min dentro del horario, a partir de ahora + margen de preparación
export function deliverySlots(restaurant, now = new Date(), days = 3) {
  const earliest = addMinutes(now, 45)
  const slots = []
  for (const { start, end } of openingIntervals(restaurant, now, days)) {
    // la primera franja empieza 30 min después de abrir; la última acaba al cerrar
    let t = addMinutes(start, 30)
    const minutes = t.getMinutes()
    if (minutes % 30) t = addMinutes(t, 30 - (minutes % 30))
    while (addMinutes(t, 30) <= end) {
      if (t >= earliest) slots.push(new Date(t))
      t = addMinutes(t, 30)
    }
  }
  const limit = addMinutes(startOfDay(now), (days + 1) * 24 * 60)
  return slots.filter((s) => s < limit)
}

export function groupSlotsByDay(slots, now = new Date()) {
  const groups = new Map()
  for (const s of slots) {
    const key = startOfDay(s).toISOString()
    if (!groups.has(key)) groups.set(key, { key, label: relativeDay(s, now), date: s, slots: [] })
    groups.get(key).slots.push(s)
  }
  return [...groups.values()]
}

export const slotLabel = (date, now = new Date()) => {
  const day = relativeDay(date, now)
  return `${day.charAt(0).toUpperCase()}${day.slice(1)}, ${formatHour(date)} – ${formatHour(addMinutes(date, 30))}`
}

export const weekScheduleText = (ranges) =>
  ranges.length === 0
    ? 'Cerrado'
    : ranges.map(([a, b]) => (a === '00:00' && b === '24:00' ? '24 horas' : `${a} – ${b}`)).join(' · ')
