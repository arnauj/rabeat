import Icon from './Icon.jsx'
import { Cover, StatusPill, useRestaurantStatus } from './ui.jsx'
import { compact, km as fmtKm, money, rating } from '../lib/format.js'
import { deliveryFee, etaMinutes } from '../lib/pricing.js'
import { useSettings } from '../lib/settings.jsx'

export default function RestaurantCard({ restaurant: r, now, km, outOfRange = false }) {
  const { settings } = useSettings()
  const { open } = useRestaurantStatus(r, now)
  const available = open && r.accepting_orders
  const [etaA, etaB] = etaMinutes(r, km)

  return (
    <a
      href={`#/r/${r.slug}`}
      className="group block overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-neutral-200/70 transition hover:-translate-y-0.5 hover:shadow-xl hover:shadow-neutral-900/5"
    >
      <div className="relative aspect-[16/9] overflow-hidden">
        <Cover restaurant={r} className={`size-full transition duration-500 group-hover:scale-105 ${available ? '' : 'grayscale-[70%]'}`} />
        {!r.cover_is_logo && <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />}
        <div className="absolute top-3 left-3">
          <StatusPill restaurant={r} now={now} />
        </div>
        {!available && !outOfRange && r.accepting_orders && (
          <span className="absolute right-3 bottom-3 inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-bold text-ink shadow-lg">
            <Icon name="calendar" className="size-3.5 text-brand-600" /> Programar pedido
          </span>
        )}
        {outOfRange && (
          <span className="absolute right-3 bottom-3 rounded-full bg-white px-3 py-1.5 text-xs font-bold text-ink shadow-lg">Fuera de zona</span>
        )}
      </div>
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-lg font-extrabold tracking-tight">{r.name}</h3>
            <p className="truncate text-sm text-neutral-500">{r.cuisine}</p>
          </div>
          <span className="flex shrink-0 items-center gap-1 rounded-xl bg-neutral-100 px-2 py-1 text-sm font-bold">
            <Icon name="star" className="size-4 text-amber-400" />
            {rating(r)}
            {r.rating_count > 0 && <span className="font-medium text-neutral-400">({compact(r.rating_count)})</span>}
          </span>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] font-medium text-neutral-600">
          <span className="flex items-center gap-1">
            <Icon name="clock" className="size-4" /> {etaA}–{etaB} min
          </span>
          <span className="flex items-center gap-1">
            <Icon name="bike" className="size-4" />
            {km == null ? `desde ${money(settings.delivery_base_fee)}` : money(deliveryFee(km, settings))}
          </span>
          {km != null && <span>{fmtKm(km)}</span>}
        </div>
      </div>
    </a>
  )
}
