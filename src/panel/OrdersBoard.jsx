import { useEffect, useRef, useState } from 'react'
import Icon from '../components/Icon.jsx'
import { Button, ErrorBox, Loading, Select, useToast } from '../components/ui.jsx'
import { useAuth } from '../lib/auth.jsx'
import { useSettings } from '../lib/settings.jsx'
import { useAsync } from '../lib/useAsync.js'
import { myRestaurants, ORDER_SELECT, setOrderStatus } from '../lib/data.js'
import { callFunction, supabase, unwrap } from '../lib/supabase.js'
import { dateTime, money, ORDER_STATUS, PAYMENT_METHOD } from '../lib/format.js'
import { PageTitle } from './Panel.jsx'

const FILTERS = [
  { id: 'active', label: 'En curso', statuses: ['confirmed', 'preparing', 'ready', 'on_the_way'] },
  { id: 'done', label: 'Entregados', statuses: ['delivered'] },
  { id: 'cancelled', label: 'Cancelados', statuses: ['cancelled'] },
  { id: 'all', label: 'Todos', statuses: null },
]

// Avisa con un pitido corto cuando entra un pedido nuevo
function beep() {
  try {
    const ctx = new AudioContext()
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.frequency.value = 880
    g.gain.setValueAtTime(0.2, ctx.currentTime)
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4)
    o.connect(g).connect(ctx.destination)
    o.start()
    o.stop(ctx.currentTime + 0.4)
  } catch {
    /* sin audio */
  }
}

export default function OrdersBoard() {
  const { profile } = useAuth()
  const { settings } = useSettings()
  const isSuper = profile.role === 'superuser'
  const [filter, setFilter] = useState('active')
  const [restaurantId, setRestaurantId] = useState('')
  const [type, setType] = useState('')
  const { data: restaurants } = useAsync(() => myRestaurants(profile), [profile.id])
  const known = useRef(null)

  const { data: orders, error, loading, reload } = useAsync(async () => {
    let q = supabase.from('orders').select(ORDER_SELECT).neq('status', 'pending_payment').order('created_at', { ascending: false }).limit(100)
    const f = FILTERS.find((x) => x.id === filter)
    if (f.statuses) q = q.in('status', f.statuses)
    if (type) q = q.eq('order_type', type)
    if (restaurantId) q = q.eq('restaurant_id', restaurantId)
    else if (!isSuper && restaurants) q = q.in('restaurant_id', restaurants.map((r) => r.id))
    return unwrap(await q)
  }, [filter, type, restaurantId, restaurants, isSuper])

  // Pitido al detectar pedidos nuevos
  useEffect(() => {
    if (!orders) return
    const ids = new Set(orders.filter((o) => o.status === 'confirmed').map((o) => o.id))
    if (known.current && [...ids].some((id) => !known.current.has(id))) beep()
    known.current = ids
  }, [orders])

  // Tiempo real + respaldo cada 20 s
  useEffect(() => {
    const channel = supabase
      .channel('panel-orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => reload(true))
      .subscribe()
    const t = setInterval(() => reload(true), 20000)
    return () => {
      supabase.removeChannel(channel)
      clearInterval(t)
    }
  }, [reload])

  return (
    <>
      <PageTitle subtitle="Se actualiza solo y suena al entrar un pedido nuevo">Pedidos</PageTitle>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="no-scrollbar flex gap-1 overflow-x-auto rounded-2xl bg-white p-1 ring-1 ring-neutral-200">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`shrink-0 rounded-xl px-3 py-1.5 text-sm font-bold ${filter === f.id ? 'bg-ink text-white' : 'text-neutral-500'}`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex gap-1 rounded-2xl bg-white p-1 ring-1 ring-neutral-200">
          {[
            ['', 'Todos'],
            ['delivery', '🛵 Domicilio'],
            ['dine_in', '🍽️ Mesa'],
          ].map(([id, label]) => (
            <button key={id} onClick={() => setType(id)} className={`shrink-0 rounded-xl px-3 py-1.5 text-sm font-bold ${type === id ? 'bg-ink text-white' : 'text-neutral-500'}`}>
              {label}
            </button>
          ))}
        </div>
        {restaurants?.length > 1 && (
          <Select value={restaurantId} onChange={(e) => setRestaurantId(e.target.value)} className="sm:w-64">
            <option value="">Todos los restaurantes</option>
            {restaurants.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>
        )}
      </div>

      {loading && !orders ? (
        <Loading />
      ) : error ? (
        <ErrorBox error={error} onRetry={reload} />
      ) : orders.length === 0 ? (
        <div className="rounded-3xl bg-white p-10 text-center ring-1 ring-neutral-200/70">
          <p className="text-4xl">🍽️</p>
          <p className="mt-2 font-bold">No hay pedidos aquí</p>
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {orders.map((o) => (
            <OrderCard key={o.id} order={o} isSuper={isSuper} tz={settings.timezone} onChange={() => reload(true)} />
          ))}
        </div>
      )}
    </>
  )
}

function OrderCard({ order: o, isSuper, tz, onChange }) {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const st = ORDER_STATUS[o.status]

  const move = async (status) => {
    if (status === 'cancelled' && !confirm(`¿Cancelar el pedido ${o.code}? Se avisará al cliente por email.`)) return
    setBusy(true)
    try {
      await setOrderStatus(o.id, status)
      if (['cancelled', 'delivered'].includes(status)) callFunction('notify', { order_id: o.id, event: status }).catch(() => {})
      toast(`Pedido ${o.code}: ${ORDER_STATUS[status].label.toLowerCase()}`)
      onChange()
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const dineIn = o.order_type === 'dine_in'
  const next = {
    confirmed: ['preparing', 'Empezar a preparar'],
    preparing: ['ready', dineIn ? 'Listo para servir' : 'Listo para recoger'],
    ...(dineIn ? { ready: ['delivered', 'Servido en mesa'] } : {}),
  }[o.status]

  return (
    <article className={`rounded-3xl bg-white p-4 ring-1 ${o.status === 'confirmed' ? 'ring-2 ring-brand-500' : 'ring-neutral-200/70'}`}>
      <header className="flex items-start justify-between gap-3">
        <div>
          {dineIn && (
            <p className="mb-1 inline-flex items-center gap-1 rounded-full bg-ink px-2.5 py-1 text-sm font-extrabold text-white">🍽️ {o.table_name}</p>
          )}
          <p className="flex items-center gap-2 text-lg font-extrabold">
            {o.code}
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${st.cls}`}>{st.label}</span>
          </p>
          <p className="text-xs text-neutral-500">
            {o.restaurant?.name} · {dateTime(o.created_at, tz)}
          </p>
        </div>
        <div className="text-right">
          <p className="font-extrabold tabular-nums">{money(o.restaurant_subtotal)}</p>
          <p className="text-[11px] text-neutral-500">neto {money(o.restaurant_payout)}</p>
        </div>
      </header>

      {o.scheduled_for && (
        <p className="mt-3 flex items-center gap-2 rounded-2xl bg-ink px-3 py-2 text-sm font-bold text-white">
          <Icon name="calendar" className="size-4 text-brand-400" /> Programado para {dateTime(o.scheduled_for, tz)}
        </p>
      )}

      <ul className="mt-3 space-y-1 text-sm">
        {o.items.map((i) => (
          <li key={i.id}>
            <b>{i.qty}×</b> {i.name}
            {i.note && <span className="block pl-5 text-xs font-semibold text-brand-700">↳ {i.note}</span>}
          </li>
        ))}
      </ul>

      {dineIn ? (
        <div className="mt-3 rounded-2xl bg-neutral-50 p-3 text-xs text-neutral-600">
          <p>
            <b className="text-ink">Pedido en sala</b>
            {o.customer_name && o.customer_name !== o.table_name && ` · ${o.customer_name}`} ·{' '}
            {o.payment_method === 'cash' ? (o.payment_status === 'paid' ? 'Cobrado en el local' : `Cobrar en el local ${money(o.total)}`) : `${PAYMENT_METHOD[o.payment_method]} · pagado`}
          </p>
        </div>
      ) : (
      <div className="mt-3 rounded-2xl bg-neutral-50 p-3 text-xs text-neutral-600">
        <p className="font-bold text-ink">{o.customer_name}</p>
        <p>
          <a href={`tel:${o.customer_phone.replace(/\s/g, '')}`} className="font-semibold text-brand-600">
            {o.customer_phone}
          </a>{' '}
          · {PAYMENT_METHOD[o.payment_method]} · {money(o.total)}
        </p>
        <p className="mt-1">
          {o.address.street}
          {o.address.details && `, ${o.address.details}`} · {Number(o.distance_km).toFixed(1)} km
        </p>
        {o.address.notes && <p className="italic">“{o.address.notes}”</p>}
        <p className="mt-1">{o.rider_id ? '🛵 Rider asignado' : '⏳ Sin rider todavía'}</p>
      </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {next && (
          <Button loading={busy} onClick={() => move(next[0])} className="flex-1">
            {next[1]}
          </Button>
        )}
        {['confirmed', 'preparing', 'ready'].includes(o.status) && (
          <Button variant="danger" disabled={busy} onClick={() => move('cancelled')}>
            Cancelar
          </Button>
        )}
        {isSuper && (
          <Select value="" onChange={(e) => e.target.value && move(e.target.value)} className="w-full sm:w-auto" aria-label="Forzar estado">
            <option value="">Forzar estado…</option>
            {Object.entries(ORDER_STATUS)
              .filter(([k]) => k !== o.status && k !== 'pending_payment')
              .map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
          </Select>
        )}
        <a href={`#/pedido/${o.tracking_token}`} className="grid size-11 place-items-center rounded-2xl bg-neutral-100" aria-label="Ver seguimiento" title="Ver seguimiento">
          <Icon name="eye" className="size-4" />
        </a>
      </div>
    </article>
  )
}
