import { useEffect, useMemo, useState } from 'react'
import Icon from '../components/Icon.jsx'
import { MapView } from '../components/Map.jsx'
import { Loading, Spinner, useToast } from '../components/ui.jsx'
import { useAsync } from '../lib/useAsync.js'
import { getTracking } from '../lib/data.js'
import { callFunction, supabase } from '../lib/supabase.js'
import { useSettings } from '../lib/settings.jsx'
import { useCart } from '../lib/cart.jsx'
import { money, PAYMENT_METHOD } from '../lib/format.js'
import { formatHour, slotLabel } from '../lib/time.js'

const DINE_IN_STAGES = [
  { id: 'confirmed', label: 'Pedido recibido', hint: 'La cocina ya tiene tu pedido' },
  { id: 'preparing', label: 'En la cocina', hint: 'Están preparando tu comida' },
  { id: 'ready', label: 'Listo', hint: 'Te lo llevan a la mesa enseguida' },
  { id: 'delivered', label: 'Servido', hint: '¡Que aproveche!' },
]

const STAGES = [
  { id: 'confirmed', label: 'Pedido confirmado', hint: 'El restaurante ha recibido tu pedido' },
  { id: 'preparing', label: 'En la cocina', hint: 'Están preparando tu comida' },
  { id: 'ready', label: 'Listo para recoger', hint: 'Esperando a tu rider' },
  { id: 'on_the_way', label: 'En camino', hint: 'Tu rider va a toda liebre' },
  { id: 'delivered', label: 'Entregado', hint: '¡Que aproveche!' },
]

export default function OrderTracking({ token, query }) {
  const { settings } = useSettings()
  const { rememberOrder } = useCart()
  const toast = useToast()
  const tz = settings.timezone
  const { data: o, loading, reload } = useAsync(() => getTracking(token), [token])
  const [checking, setChecking] = useState(false)

  // Actualización periódica mientras el pedido está activo
  useEffect(() => {
    if (!o || ['delivered', 'cancelled'].includes(o.status)) return
    const t = setInterval(() => reload(true), 8000)
    return () => clearInterval(t)
  }, [o, reload])

  // Vuelta desde Stripe: comprueba el pago sin esperar al webhook
  useEffect(() => {
    if (!query?.get('pago') && !query?.get('propina')) return
    setChecking(true)
    callFunction('confirm-payment', { token })
      .then(() => reload(true))
      .catch(() => {})
      .finally(() => setChecking(false))
    if (query.get('propina')) toast('¡Gracias por la propina! 🧡')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  useEffect(() => {
    if (o) rememberOrder({ token: o.token, code: o.code, restaurant: o.restaurant.name, created_at: o.created_at })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [o?.token])

  const markers = useMemo(
    () =>
      o
        ? [
            { ...o.restaurant, kind: 'restaurant', label: o.restaurant.name },
            { lat: o.lat, lng: o.lng, kind: 'home', label: 'Entrega' },
            ...(o.rider_lat && ['confirmed', 'preparing', 'ready', 'on_the_way'].includes(o.status)
              ? [{ lat: o.rider_lat, lng: o.rider_lng, kind: 'rider', label: 'Rider' }]
              : []),
          ]
        : [],
    [o],
  )

  if (loading && !o) return <Loading label="Buscando tu pedido…" />
  if (!o)
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

  const dineIn = o.order_type === 'dine_in'
  const stages = dineIn ? DINE_IN_STAGES : STAGES
  const stageIndex = stages.findIndex((s) => s.id === o.status)
  const delivered = o.status === 'delivered'
  const cancelled = o.status === 'cancelled'
  const pendingPayment = o.status === 'pending_payment'
  const scheduledWaiting = o.scheduled_for && o.status === 'confirmed'
  const eta = new Date(new Date(o.paid_at ?? o.created_at).getTime() + (o.restaurant.prep_max + Math.round(o.distance_km * 3 + 5)) * 60_000)

  return (
    <div className="min-h-dvh bg-neutral-50 pb-10">
      <div className="relative overflow-hidden bg-ink text-white">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-2">
          <a href="#/pedidos" className="grid size-10 place-items-center rounded-full bg-white/10" aria-label="Volver a pedidos">
            <Icon name="back" />
          </a>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-white/60">
              Pedido {o.code}
              {dineIn && ` · 🍽️ ${o.table_name}`}
            </p>
            <p className="truncate font-extrabold">{o.restaurant.name}</p>
          </div>
          <button onClick={() => reload()} className="grid size-10 place-items-center rounded-full bg-white/10" aria-label="Actualizar">
            <Icon name="refresh" className="size-4" />
          </button>
        </div>
        <div className="mx-auto max-w-3xl px-4 pb-24">
          {pendingPayment ? (
            <div className="mt-4 rounded-3xl bg-white/5 p-5 ring-1 ring-white/10">
              <p className="flex items-center gap-2 font-display text-2xl font-black italic">
                {checking && <Spinner className="size-5" />} Esperando el pago…
              </p>
              <p className="mt-2 text-sm text-white/70">Si ya has pagado, se confirmará en unos segundos. Si cancelaste el pago, el pedido se anulará solo.</p>
            </div>
          ) : cancelled ? (
            <div className="mt-4 rounded-3xl bg-white/5 p-5 ring-1 ring-white/10">
              <p className="font-display text-3xl font-black italic">Pedido cancelado</p>
              <p className="mt-2 text-sm text-white/70">
                {o.payment_status === 'paid' && o.payment_method === 'card' ? 'Te devolveremos el importe en tu tarjeta.' : 'No se ha realizado ningún cargo.'}
              </p>
            </div>
          ) : dineIn ? (
            <div className="mt-4 rounded-3xl bg-white/5 p-5 ring-1 ring-white/10">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-600 px-3 py-1 text-xs font-bold">🍽️ {o.table_name}</span>
              <p className="mt-3 font-display text-4xl font-black tracking-tight italic">
                {delivered ? '¡Servido!' : o.status === 'ready' ? '¡Ya va!' : 'En marcha'}
              </p>
              <p className="mt-2 text-sm text-white/70">
                {delivered ? '¡Que aproveche!' : `Te lo llevan a la mesa. Tiempo de cocina: ${o.restaurant.prep_min}–${o.restaurant.prep_max} min.`}
                {o.payment_method === 'cash' && o.payment_status !== 'paid' && ` Pagarás ${money(o.total)} en el local.`}
              </p>
            </div>
          ) : scheduledWaiting ? (
            <div className="mt-4 rounded-3xl bg-white/5 p-5 ring-1 ring-white/10">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-600 px-3 py-1 text-xs font-bold">
                <Icon name="calendar" className="size-3.5" /> Pedido programado
              </span>
              <p className="mt-3 font-display text-3xl font-black tracking-tight italic sm:text-4xl">{slotLabel(new Date(o.scheduled_for), new Date(), tz)}</p>
              <p className="mt-2 text-sm text-white/70">¡Listo! El restaurante lo preparará para esa hora y te avisaremos por email cuando salga tu rider.</p>
            </div>
          ) : (
            <>
              <p className="mt-2 text-sm text-white/70">{delivered ? 'Tu pedido ya está en casa' : o.scheduled_for ? 'Entrega programada' : 'Llegada estimada'}</p>
              <p className="font-display text-5xl font-black tracking-tight italic">
                {delivered ? '¡Entregado!' : o.scheduled_for ? formatHour(new Date(o.scheduled_for), tz) : formatHour(eta, tz)}
              </p>
            </>
          )}
          {!pendingPayment && !cancelled && !dineIn && (
            <div className="mt-4 overflow-hidden rounded-3xl ring-1 ring-white/10">
              <MapView markers={markers} className="h-64 sm:h-80" />
            </div>
          )}
        </div>
      </div>

      <div className="relative mx-auto -mt-16 max-w-3xl space-y-4 px-4">
        {!pendingPayment && !cancelled && (
          <div className="rounded-3xl bg-white p-5 shadow-xl shadow-neutral-900/5 ring-1 ring-neutral-200/70">
            <div className={`mb-5 grid gap-1.5 ${dineIn ? 'grid-cols-4' : 'grid-cols-5'}`}>
              {stages.map((s, i) => (
                <div key={s.id} className="h-1.5 overflow-hidden rounded-full bg-neutral-100">
                  <div
                    className={`h-full rounded-full bg-brand-600 transition-all duration-700 ${i === stageIndex && !delivered ? 'animate-pulse' : ''}`}
                    style={{ width: i <= stageIndex ? '100%' : '0%' }}
                  />
                </div>
              ))}
            </div>
            <ol className="space-y-3">
              {stages.map((s, i) => {
                const done = i < stageIndex || delivered
                const current = i === stageIndex
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
                      <p className={`text-sm font-bold ${i > stageIndex ? 'text-neutral-400' : ''}`}>{s.label}</p>
                      {current && !delivered && <p className="text-xs text-neutral-500">{s.hint}</p>}
                    </div>
                  </li>
                )
              })}
            </ol>
          </div>
        )}

        {!pendingPayment && !cancelled && !dineIn && <RiderCard order={o} delivered={delivered} onChange={() => reload(true)} />}
        {dineIn && delivered && <RateCard order={o} onChange={() => reload(true)} />}
        {dineIn && (
          <a href={`#/r/${o.restaurant.slug}`} className="block rounded-2xl bg-brand-600 py-4 text-center font-bold text-white">
            Pedir algo más
          </a>
        )}

        <div className="rounded-3xl bg-white p-5 ring-1 ring-neutral-200/70">
          <h3 className="font-extrabold">Resumen</h3>
          <ul className="mt-3 space-y-1.5 text-sm">
            {o.items.map((i, idx) => (
              <li key={idx} className="flex justify-between gap-3">
                <span className="text-neutral-600">
                  <b className="text-ink">{i.qty}×</b> {i.name}
                  {i.note && <span className="block text-xs text-neutral-400">“{i.note}”</span>}
                </span>
                <span className="font-semibold tabular-nums">{money(i.qty * i.unit_price)}</span>
              </li>
            ))}
          </ul>
          <dl className="mt-4 space-y-1.5 border-t border-dashed border-neutral-200 pt-4 text-sm">
            <Line label="Subtotal" value={money(o.subtotal)} />
            {!dineIn && (
              <>
                <Line label={`Envío · ${Number(o.distance_km).toFixed(1).replace('.', ',')} km`} value={money(o.delivery_fee)} />
                <Line label="Propina rider" value={money(o.tip)} />
              </>
            )}
            {Number(o.discount) > 0 && <Line label={`Descuento (${o.promo_code})`} value={`−${money(o.discount)}`} />}
            <div className="flex justify-between pt-2 text-base font-extrabold">
              <dt>Total · {dineIn && o.payment_method === 'cash' ? 'En el local' : PAYMENT_METHOD[o.payment_method]}</dt>
              <dd className="tabular-nums">{money(o.total)}</dd>
            </div>
          </dl>
          {o.address && (
            <p className="mt-4 flex items-start gap-2 rounded-2xl bg-neutral-100 p-3 text-xs text-neutral-600">
              <Icon name="pin" className="size-4 shrink-0 text-brand-600" />
              {o.address.street}
              {o.address.details && `, ${o.address.details}`}
              {o.address.notes && ` · ${o.address.notes}`}
            </p>
          )}
          {o.restaurant.phone && (
            <a href={`tel:${o.restaurant.phone.replace(/\s/g, '')}`} className="mt-3 flex items-center gap-2 text-sm font-bold text-brand-600">
              <Icon name="phone" className="size-4" /> Llamar al restaurante
            </a>
          )}
        </div>

        <a href="#/" className="block rounded-2xl bg-ink py-4 text-center font-bold text-white">
          Volver al inicio
        </a>
      </div>
    </div>
  )
}

function RiderCard({ order, delivered, onChange }) {
  const toast = useToast()
  const [busy, setBusy] = useState(null)
  const rider = order.rider
  const phone = rider?.phone?.replace(/\s/g, '')

  const addTip = async (amount) => {
    setBusy(amount)
    try {
      const res = await callFunction('add-tip', { token: order.token, amount })
      if (res.checkout_url) return (window.location.href = res.checkout_url)
      toast(`${rider?.name ?? 'Tu rider'} dice: ¡mil gracias! 🐰💨`)
      onChange()
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setBusy(null)
    }
  }

  const rate = async (n) => {
    const { error } = await supabase.rpc('rate_order', { p_token: order.token, p_rating: n })
    if (error) toast(error.message, 'error')
    else {
      toast('¡Gracias por tu valoración!')
      onChange()
    }
  }

  return (
    <div className="rounded-3xl bg-white p-5 ring-1 ring-neutral-200/70">
      <div className="flex items-center gap-3">
        <span className="grid size-14 place-items-center overflow-hidden rounded-2xl bg-brand-50">
          <img src="rider.png" alt="" className="w-12" />
        </span>
        <div className="flex-1">
          <p className="font-extrabold">{rider ? rider.name : 'Buscando rider…'}</p>
          <p className="text-xs text-neutral-500">{rider ? 'Tu repartidor rabeat' : 'Te avisaremos por email cuando tengamos rider'}</p>
        </div>
        {rider && phone && !delivered && (
          <div className="flex gap-2">
            <a href={`sms:${phone}`} className="grid size-10 place-items-center rounded-full bg-neutral-100" aria-label="Enviar mensaje al rider">
              <Icon name="chat" className="size-4" />
            </a>
            <a href={`tel:${phone}`} className="grid size-10 place-items-center rounded-full bg-brand-600 text-white" aria-label="Llamar al rider">
              <Icon name="phone" className="size-4" />
            </a>
          </div>
        )}
      </div>

      <div className="mt-4 rounded-2xl bg-brand-50 p-4">
        <p className="text-sm font-bold text-brand-800">{Number(order.tip) > 0 ? `Has dejado ${money(order.tip)} de propina. ¡Gracias! 🧡` : 'Aún no has dejado propina'}</p>
        <p className="mt-0.5 text-xs text-brand-700/80">
          {delivered ? '¿Ha ido todo bien? Puedes añadir algo más.' : 'Puedes añadir más propina en cualquier momento.'}
          {order.payment_method === 'cash' && ' Pedido en efectivo: entrégala al rider junto con el pago.'}
        </p>
        <div className="mt-3 flex gap-2">
          {[1, 2, 3].map((t) => (
            <button
              key={t}
              disabled={busy !== null}
              onClick={() => addTip(t)}
              className="flex flex-1 items-center justify-center gap-1 rounded-full bg-white py-2 text-sm font-extrabold text-brand-700 ring-1 ring-brand-200 transition active:scale-95 disabled:opacity-60"
            >
              {busy === t ? <Spinner className="size-4" /> : `+${money(t).replace(',00', '')}`}
            </button>
          ))}
        </div>
      </div>

      {delivered && (
        <div className="mt-4 text-center">
          <p className="text-sm font-bold">{order.rating ? 'Tu valoración' : 'Valora tu pedido'}</p>
          <div className="mt-2 flex justify-center gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} onClick={() => rate(n)} aria-label={`${n} estrellas`} className="transition active:scale-90">
                <Icon name="star" className={`size-8 ${n <= (order.rating ?? 0) ? 'text-amber-400' : 'text-neutral-200'}`} />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function RateCard({ order, onChange }) {
  const toast = useToast()
  const rate = async (n) => {
    const { error } = await supabase.rpc('rate_order', { p_token: order.token, p_rating: n })
    if (error) return toast(error.message, 'error')
    toast('¡Gracias por tu valoración!')
    onChange()
  }
  return (
    <div className="rounded-3xl bg-white p-5 text-center ring-1 ring-neutral-200/70">
      <p className="text-sm font-bold">{order.rating ? 'Tu valoración' : '¿Qué tal la comida?'}</p>
      <div className="mt-2 flex justify-center gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} onClick={() => rate(n)} aria-label={`${n} estrellas`} className="transition active:scale-90">
            <Icon name="star" className={`size-8 ${n <= (order.rating ?? 0) ? 'text-amber-400' : 'text-neutral-200'}`} />
          </button>
        ))}
      </div>
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
