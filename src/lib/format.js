const eur = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' })

export const money = (n) => eur.format(Number(n) || 0)

export const compact = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1).replace('.', ',')}k` : String(n))

export const km = (n) => `${Number(n).toFixed(1).replace('.', ',')} km`

export const rating = (r) => (r.rating_count ? (r.rating_sum / r.rating_count).toFixed(1).replace('.', ',') : 'Nuevo')

export const slugify = (s) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)

export const dateTime = (d, tz) =>
  new Date(d).toLocaleString('es-ES', { timeZone: tz, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

export const ORDER_STATUS = {
  pending_payment: { label: 'Pendiente de pago', cls: 'bg-neutral-100 text-neutral-600' },
  confirmed: { label: 'Nuevo', cls: 'bg-brand-600 text-white' },
  preparing: { label: 'En cocina', cls: 'bg-amber-100 text-amber-800' },
  ready: { label: 'Listo para recoger', cls: 'bg-sky-100 text-sky-800' },
  on_the_way: { label: 'En camino', cls: 'bg-violet-100 text-violet-800' },
  delivered: { label: 'Entregado', cls: 'bg-emerald-100 text-emerald-800' },
  cancelled: { label: 'Cancelado', cls: 'bg-neutral-200 text-neutral-500 line-through' },
}

export const PAYMENT_METHOD = { card: 'Tarjeta', cash: 'Efectivo', test: 'Pago de prueba' }
