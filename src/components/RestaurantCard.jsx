import Icon from './Icon.jsx'
import { SafeImg, StatusPill } from './ui.jsx'
import { getStatus } from '../lib/time.js'
import { compact, money } from '../lib/format.js'

export default function RestaurantCard({ restaurant: r, now }) {
  const { open } = getStatus(r, now)
  return (
    <a
      href={`#/r/${r.id}`}
      className="group block overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-neutral-200/70 transition hover:-translate-y-0.5 hover:shadow-xl hover:shadow-neutral-900/5"
    >
      <div className="relative aspect-[16/9] overflow-hidden">
        <SafeImg
          src={r.cover}
          alt={r.name}
          className={`size-full transition duration-500 group-hover:scale-105 ${open ? '' : 'grayscale-[70%]'}`}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
        <div className="absolute top-3 left-3 flex flex-wrap gap-2">
          <StatusPill restaurant={r} now={now} />
        </div>
        {r.promo && (
          <span className="absolute top-3 right-3 rounded-full bg-brand-600 px-2.5 py-1 text-xs font-bold text-white shadow">
            {r.promo}
          </span>
        )}
        {!open && (
          <span className="absolute right-3 bottom-3 inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-bold text-ink shadow-lg">
            <Icon name="calendar" className="size-3.5 text-brand-600" /> Programar pedido
          </span>
        )}
      </div>
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-lg font-extrabold tracking-tight">{r.name}</h3>
            <p className="text-sm text-neutral-500">{r.cuisine}</p>
          </div>
          <span className="flex shrink-0 items-center gap-1 rounded-xl bg-neutral-100 px-2 py-1 text-sm font-bold">
            <Icon name="star" className="size-4 text-amber-400" />
            {r.rating.toString().replace('.', ',')}
            <span className="font-medium text-neutral-400">({compact(r.reviews)})</span>
          </span>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] font-medium text-neutral-600">
          <span className="flex items-center gap-1">
            <Icon name="clock" className="size-4" /> {r.eta[0]}–{r.eta[1]} min
          </span>
          <span className="flex items-center gap-1">
            <Icon name="bike" className="size-4" />
            {r.deliveryFee === 0 ? <b className="text-brand-600">Gratis</b> : money(r.deliveryFee)}
          </span>
          <span>{r.distance.toString().replace('.', ',')} km</span>
        </div>
      </div>
    </a>
  )
}
