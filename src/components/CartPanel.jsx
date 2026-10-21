import Icon from './Icon.jsx'
import { QtyStepper, SafeImg, useNow } from './ui.jsx'
import { useCart } from '../lib/cart.jsx'
import { money } from '../lib/format.js'
import { formatHour, getStatus, relativeDay } from '../lib/time.js'

export default function CartPanel({ compact = false }) {
  const cart = useCart()
  const now = useNow()
  const r = cart.restaurant

  if (!r || cart.items.length === 0)
    return (
      <div className="rounded-3xl bg-white p-6 text-center ring-1 ring-neutral-200/70">
        <img src="/rider.png" alt="" className="mx-auto w-28 opacity-90" />
        <p className="mt-3 font-extrabold">Tu cesta está vacía</p>
        <p className="mt-1 text-sm text-neutral-500">Añade platos y aquí verás tu pedido.</p>
      </div>
    )

  const status = getStatus(r, now)
  const missing = Math.max(0, r.minOrder - cart.subtotal)

  return (
    <div className="overflow-hidden rounded-3xl bg-white ring-1 ring-neutral-200/70">
      <div className="flex items-center justify-between gap-3 border-b border-neutral-100 p-4">
        <div className="min-w-0">
          <p className="text-[11px] font-bold tracking-wide text-neutral-500 uppercase">Tu pedido en</p>
          <a href={`#/r/${r.id}`} className="block truncate font-extrabold hover:text-brand-600">
            {r.name}
          </a>
        </div>
        <button onClick={cart.clear} className="text-sm font-semibold text-neutral-500 hover:text-brand-600">
          Vaciar
        </button>
      </div>

      <ul className={`divide-y divide-neutral-100 ${compact ? 'max-h-[42vh] overflow-y-auto' : ''}`}>
        {cart.items.map((i) => (
          <li key={i.key} className="flex items-center gap-3 p-4">
            <SafeImg src={i.image} alt={i.name} className="size-14 shrink-0 rounded-xl" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold">{i.name}</p>
              {i.note && <p className="truncate text-xs text-neutral-500">“{i.note}”</p>}
              <p className="text-sm font-semibold text-neutral-700">{money(i.price * i.qty)}</p>
            </div>
            <QtyStepper size="sm" value={i.qty} onChange={(q) => cart.setQty(i.key, q)} />
          </li>
        ))}
      </ul>

      <div className="space-y-3 border-t border-neutral-100 p-4">
        {!status.open && (
          <p className="flex items-start gap-2 rounded-2xl bg-neutral-900 p-3 text-xs text-white">
            <Icon name="calendar" className="mt-0.5 size-4 shrink-0 text-brand-400" />
            <span>
              Cerrado ahora. Programa la entrega
              {status.opensAt && ` a partir de ${relativeDay(status.opensAt, now)} a las ${formatHour(status.opensAt)}`}.
            </span>
          </p>
        )}
        {missing > 0 && (
          <div>
            <div className="h-1.5 overflow-hidden rounded-full bg-neutral-100">
              <div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${(cart.subtotal / r.minOrder) * 100}%` }} />
            </div>
            <p className="mt-1.5 text-xs font-medium text-neutral-500">
              Añade {money(missing)} más para llegar al pedido mínimo ({money(r.minOrder)}).
            </p>
          </div>
        )}
        <div className="flex justify-between text-sm">
          <span className="text-neutral-500">Subtotal</span>
          <span className="font-bold">{money(cart.subtotal)}</span>
        </div>
        <a
          href={missing > 0 ? undefined : '#/pago'}
          aria-disabled={missing > 0}
          className={`flex items-center justify-center gap-2 rounded-2xl py-3.5 font-bold transition ${
            missing > 0
              ? 'pointer-events-none bg-neutral-200 text-neutral-400'
              : 'bg-brand-600 text-white shadow-lg shadow-brand-600/30 hover:bg-brand-700 active:scale-[0.98]'
          }`}
        >
          {status.open ? 'Ir a pagar' : 'Programar y pagar'}
          <Icon name="right" className="size-4" />
        </a>
      </div>
    </div>
  )
}
