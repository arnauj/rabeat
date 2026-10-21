import { useEffect, useRef, useState } from 'react'
import Icon from '../components/Icon.jsx'
import { useNow } from '../components/ui.jsx'
import { useCart } from '../lib/cart.jsx'
import { money } from '../lib/format.js'
import { orderProgress, STAGES } from '../lib/orders.js'
import { formatHour, slotLabel } from '../lib/time.js'

const ROUTE = 'M 60 250 C 110 250 120 190 170 180 S 230 120 260 110 S 320 60 340 50'

export default function OrderTracking({ id }) {
  const { orders, updateOrder } = useCart()
  const now = useNow(500)
  const order = orders.find((o) => o.id === id)

  if (!order)
    return (
      <div className="grid min-h-dvh place-items-center text-center">
        <div>
          <p className="text-5xl">🔍</p>
          <p className="mt-3 font-extrabold">No encontramos este pedido</p>
          <a href="#/pedidos" className="mt-2 inline-block font-semibold text-brand-600">
            Ver mis pedidos
          </a>
        </div>
      </div>
    )

  const progress = orderProgress(order, now)
  const created = new Date(order.createdAt)
  const arrival = order.scheduledFor
    ? new Date(order.scheduledFor)
    : new Date(created.getTime() + order.eta[1] * 60_000)
  const delivered = progress.stageIndex === STAGES.length - 1

  return (
    <div className="min-h-dvh bg-neutral-50 pb-10">
      {/* Cabecera con mapa */}
      <div className="relative overflow-hidden bg-ink text-white">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-2">
          <a href="#/pedidos" className="grid size-10 place-items-center rounded-full bg-white/10" aria-label="Volver a pedidos">
            <Icon name="back" />
          </a>
          <div>
            <p className="text-xs text-white/60">Pedido #{order.id}</p>
            <p className="font-extrabold">{order.restaurantName}</p>
          </div>
        </div>
        <div className="mx-auto max-w-3xl px-4 pb-24">
          {progress.scheduled ? (
            <ScheduledHero order={order} arrival={arrival} />
          ) : (
            <>
              <p className="mt-2 text-sm text-white/70">
                {delivered ? 'Tu pedido ya está en casa' : 'Llegada estimada'}
              </p>
              <p className="font-display text-5xl font-black italic tracking-tight">
                {delivered ? '¡Entregado!' : formatHour(arrival)}
              </p>
              <DeliveryMap ride={progress.ride} stageIndex={progress.stageIndex} />
            </>
          )}
        </div>
      </div>

      <div className="relative mx-auto -mt-16 max-w-3xl space-y-4 px-4">
        {/* Progreso */}
        <div className="rounded-3xl bg-white p-5 shadow-xl shadow-neutral-900/5 ring-1 ring-neutral-200/70">
          <div className="mb-5 grid grid-cols-4 gap-1.5">
            {STAGES.map((s, i) => (
              <div key={s.id} className="h-1.5 overflow-hidden rounded-full bg-neutral-100">
                <div
                  className={`h-full rounded-full bg-brand-600 transition-all duration-700 ${
                    i === progress.stageIndex && !delivered ? 'animate-pulse' : ''
                  }`}
                  style={{ width: i <= progress.stageIndex ? '100%' : '0%' }}
                />
              </div>
            ))}
          </div>
          <ol className="space-y-3">
            {STAGES.map((s, i) => {
              const done = i < progress.stageIndex || delivered
              const current = i === progress.stageIndex
              return (
                <li key={s.id} className="flex items-center gap-3">
                  <span
                    className={`grid size-8 shrink-0 place-items-center rounded-full text-sm font-bold transition ${
                      done ? 'bg-brand-600 text-white' : current ? 'bg-brand-50 text-brand-600 ring-2 ring-brand-600' : 'bg-neutral-100 text-neutral-400'
                    }`}
                  >
                    {done ? <Icon name="check" className="size-4" strokeWidth={3} /> : i + 1}
                  </span>
                  <div>
                    <p className={`text-sm font-bold ${i > progress.stageIndex ? 'text-neutral-400' : ''}`}>{s.label}</p>
                    {current && <p className="text-xs text-neutral-500">{s.hint}</p>}
                  </div>
                </li>
              )
            })}
          </ol>
        </div>

        {/* Rider */}
        <RiderCard order={order} delivered={delivered} active={progress.stageIndex >= 1} onTip={(extra) =>
          updateOrder(order.id, { tip: order.tip + extra, total: order.total + extra })
        } onRate={(rating) => updateOrder(order.id, { rating })} />

        {/* Resumen */}
        <div className="rounded-3xl bg-white p-5 ring-1 ring-neutral-200/70">
          <h3 className="font-extrabold">Resumen</h3>
          <ul className="mt-3 space-y-1.5 text-sm">
            {order.items.map((i) => (
              <li key={i.key} className="flex justify-between gap-3">
                <span className="text-neutral-600">
                  <b className="text-ink">{i.qty}×</b> {i.name}
                </span>
                <span className="font-semibold tabular-nums">{money(i.qty * i.price)}</span>
              </li>
            ))}
          </ul>
          <dl className="mt-4 space-y-1.5 border-t border-dashed border-neutral-200 pt-4 text-sm">
            <Line label="Subtotal" value={money(order.subtotal)} />
            <Line label="Envío" value={order.deliveryFee === 0 ? 'Gratis' : money(order.deliveryFee)} />
            <Line label="Tarifa de servicio" value={money(order.serviceFee)} />
            <Line label="Propina rider" value={money(order.tip)} />
            {order.discount > 0 && <Line label="Descuento" value={`−${money(order.discount)}`} />}
            <div className="flex justify-between pt-2 text-base font-extrabold">
              <dt>Total · {order.payment}</dt>
              <dd className="tabular-nums">{money(order.total)}</dd>
            </div>
          </dl>
          <p className="mt-4 flex items-start gap-2 rounded-2xl bg-neutral-100 p-3 text-xs text-neutral-600">
            <Icon name="pin" className="size-4 shrink-0 text-brand-600" />
            {order.address.street}
            {order.address.details && `, ${order.address.details}`}
            {order.address.notes && ` · ${order.address.notes}`}
          </p>
        </div>

        <a href="#/" className="block rounded-2xl bg-ink py-4 text-center font-bold text-white">
          Volver al inicio
        </a>
      </div>
    </div>
  )
}

function ScheduledHero({ order, arrival }) {
  return (
    <div className="mt-4 rounded-3xl bg-white/5 p-5 ring-1 ring-white/10">
      <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-600 px-3 py-1 text-xs font-bold">
        <Icon name="calendar" className="size-3.5" /> Pedido programado
      </span>
      <p className="mt-3 font-display text-3xl font-black italic tracking-tight sm:text-4xl">{slotLabel(arrival)}</p>
      <p className="mt-2 text-sm text-white/70">
        ¡Listo! {order.restaurantName} empezará a prepararlo 30 minutos antes y te avisaremos cuando el rider salga.
      </p>
      <img src="/rider.png" alt="" className="mx-auto mt-4 w-40 animate-ride" />
    </div>
  )
}

function DeliveryMap({ ride, stageIndex }) {
  const pathRef = useRef(null)
  const [pos, setPos] = useState({ x: 60, y: 250 })

  useEffect(() => {
    const p = pathRef.current
    if (!p) return
    const pt = p.getPointAtLength(p.getTotalLength() * ride)
    setPos({ x: pt.x, y: pt.y })
  }, [ride])

  return (
    <div className="relative mt-4 overflow-hidden rounded-3xl bg-neutral-800 ring-1 ring-white/10">
      <svg viewBox="0 0 400 300" className="block h-auto w-full">
        <defs>
          <pattern id="blocks" width="50" height="50" patternUnits="userSpaceOnUse">
            <rect width="50" height="50" fill="#262626" />
            <rect x="6" y="6" width="38" height="38" rx="6" fill="#2f2f2f" />
          </pattern>
        </defs>
        <rect width="400" height="300" fill="url(#blocks)" />
        <path d="M0 220 C 120 200 200 280 400 230 L 400 300 L 0 300 Z" fill="#0c4a6e" opacity="0.55" />
        <path d="M 0 150 L 400 120" stroke="#3a3a3a" strokeWidth="14" />
        <path d="M 200 0 L 230 300" stroke="#3a3a3a" strokeWidth="12" />
        <path d={ROUTE} stroke="#ffffff" strokeOpacity="0.15" strokeWidth="10" fill="none" strokeLinecap="round" />
        <path
          ref={pathRef}
          d={ROUTE}
          stroke="#E30613"
          strokeWidth="5"
          fill="none"
          strokeLinecap="round"
          strokeDasharray="10 8"
          className={stageIndex >= 2 ? '' : 'opacity-40'}
        />
        {/* Restaurante */}
        <g transform="translate(60 250)">
          <circle r="16" fill="#fff" />
          <text textAnchor="middle" dy="6" fontSize="16">🍽️</text>
        </g>
        {/* Casa */}
        <g transform="translate(340 50)">
          <circle r="18" fill="#E30613" />
          <circle r="26" fill="#E30613" opacity="0.25" className="animate-ping" style={{ transformOrigin: 'center' }} />
          <text textAnchor="middle" dy="6" fontSize="16">🏠</text>
        </g>
        {/* Rider */}
        {stageIndex >= 2 && (
          <g style={{ transform: `translate(${pos.x}px, ${pos.y}px)`, transition: 'transform 0.5s linear' }}>
            <circle r="22" fill="#fff" stroke="#E30613" strokeWidth="3" />
            <image href="/rider.png" x="-20" y="-20" width="40" height="40" />
          </g>
        )}
      </svg>
      {stageIndex < 2 && (
        <div className="absolute inset-x-4 bottom-4 flex items-center gap-2 rounded-2xl bg-black/60 px-4 py-2.5 text-sm font-semibold backdrop-blur">
          <span className="size-2 animate-pulse rounded-full bg-brand-500" />
          {stageIndex === 0 ? 'Confirmando con el restaurante…' : 'Cocinando tu pedido 🔥'}
        </div>
      )}
    </div>
  )
}

function RiderCard({ order, delivered, active, onTip, onRate }) {
  const [thanks, setThanks] = useState(false)
  return (
    <div className="rounded-3xl bg-white p-5 ring-1 ring-neutral-200/70">
      <div className="flex items-center gap-3">
        <span className="grid size-14 place-items-center overflow-hidden rounded-2xl bg-brand-50">
          <img src="/rider.png" alt="" className="w-12" />
        </span>
        <div className="flex-1">
          <p className="font-extrabold">{active ? 'Yeray' : 'Asignando rider…'}</p>
          <p className="flex items-center gap-1 text-xs text-neutral-500">
            {active ? (
              <>
                <Icon name="star" className="size-3.5 text-amber-400" /> 4,9 · Moto eléctrica · 2.340 entregas
              </>
            ) : (
              'Buscamos al rider más cercano'
            )}
          </p>
        </div>
        {active && !delivered && (
          <div className="flex gap-2">
            <button className="grid size-10 place-items-center rounded-full bg-neutral-100" aria-label="Chat con el rider">
              <Icon name="chat" className="size-4" />
            </button>
            <button className="grid size-10 place-items-center rounded-full bg-brand-600 text-white" aria-label="Llamar al rider">
              <Icon name="phone" className="size-4" />
            </button>
          </div>
        )}
      </div>

      <div className="mt-4 rounded-2xl bg-brand-50 p-4">
        <p className="text-sm font-bold text-brand-800">
          {order.tip > 0 ? `Has dejado ${money(order.tip)} de propina. ¡Gracias! 🧡` : 'Aún no has dejado propina'}
        </p>
        <p className="mt-0.5 text-xs text-brand-700/80">
          {delivered ? '¿Ha ido todo bien? Puedes añadir algo más.' : 'Puedes añadir más propina en cualquier momento.'}
        </p>
        <div className="mt-3 flex gap-2">
          {[1, 2, 3].map((t) => (
            <button
              key={t}
              onClick={() => {
                onTip(t)
                setThanks(true)
                setTimeout(() => setThanks(false), 1800)
              }}
              className="flex-1 rounded-full bg-white py-2 text-sm font-extrabold text-brand-700 ring-1 ring-brand-200 transition active:scale-95"
            >
              +{money(t).replace(',00', '')}
            </button>
          ))}
        </div>
        {thanks && <p className="mt-2 animate-fade-in text-center text-xs font-bold text-brand-700">Yeray dice: ¡mil gracias! 🐰💨</p>}
      </div>

      {delivered && (
        <div className="mt-4 text-center">
          <p className="text-sm font-bold">Valora tu pedido</p>
          <div className="mt-2 flex justify-center gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} onClick={() => onRate(n)} aria-label={`${n} estrellas`} className="transition active:scale-90">
                <Icon name="star" className={`size-8 ${n <= (order.rating ?? 0) ? 'text-amber-400' : 'text-neutral-200'}`} />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function Line({ label, value }) {
  return (
    <div className="flex justify-between">
      <dt className="text-neutral-500">{label}</dt>
      <dd className="font-semibold tabular-nums">{value}</dd>
    </div>
  )
}
