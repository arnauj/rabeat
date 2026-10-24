import { useEffect, useMemo, useRef, useState } from 'react'
import Icon from '../components/Icon.jsx'
import { MapView } from '../components/Map.jsx'
import { Button, ErrorBox, Loading, Logo, useToast } from '../components/ui.jsx'
import { useAuth } from '../lib/auth.jsx'
import { useSettings } from '../lib/settings.jsx'
import { useAsync } from '../lib/useAsync.js'
import { ORDER_SELECT, setOrderStatus } from '../lib/data.js'
import { callFunction, supabase, unwrap } from '../lib/supabase.js'
import { dateTime, km, money, ORDER_STATUS, PAYMENT_METHOD } from '../lib/format.js'
import { navigate } from '../lib/router.js'
import { PeriodPicker, periodRange, StatTile } from '../panel/common.jsx'

const TABS = [
  { id: '', label: 'Disponibles', icon: 'bell' },
  { id: 'activos', label: 'En curso', icon: 'bike' },
  { id: 'ganancias', label: 'Ganancias', icon: 'wallet' },
]

const directions = (lat, lng) => `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`

export default function RiderApp({ parts }) {
  const { ready, user, profile, role, signOut } = useAuth()
  const [tab = ''] = parts

  useEffect(() => {
    if (ready && !user) navigate('/entrar?next=/reparto')
  }, [ready, user])

  const { data: orders, error, loading, reload } = useAsync(async () => {
    if (role !== 'rider') return []
    return unwrap(
      await supabase
        .from('orders')
        .select(ORDER_SELECT)
        .or(`rider_id.is.null,rider_id.eq.${profile.id}`)
        .in('status', ['confirmed', 'preparing', 'ready', 'on_the_way'])
        .order('created_at'),
    )
  }, [role, profile?.id])

  useEffect(() => {
    if (role !== 'rider') return
    const channel = supabase
      .channel('rider-orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => reload(true))
      .subscribe()
    const t = setInterval(() => reload(true), 20000)
    return () => {
      supabase.removeChannel(channel)
      clearInterval(t)
    }
  }, [role, reload])

  const available = (orders ?? []).filter((o) => !o.rider_id)
  const mine = (orders ?? []).filter((o) => o.rider_id === profile?.id)
  useLocationSharing(mine)

  if (!ready || (user && !profile)) return <Loading />
  if (role !== 'rider')
    return (
      <div className="grid min-h-dvh place-items-center p-6 text-center">
        <div>
          <p className="text-5xl">🛵</p>
          <p className="mt-3 text-lg font-extrabold">Esta zona es para repartidores</p>
          <p className="text-sm text-neutral-500">Pide a un administrador que te dé el rol de repartidor.</p>
          <a href="#/" className="mt-3 inline-block font-bold text-brand-600">
            Volver al inicio
          </a>
        </div>
      </div>
    )

  return (
    <div className="min-h-dvh bg-neutral-50 pb-[calc(env(safe-area-inset-bottom)+5.5rem)]">
      <header className="sticky top-0 z-40 border-b border-neutral-200/70 bg-white/90 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-2.5">
          <a href="#/" aria-label="Ir a la app">
            <Logo className="h-8" />
          </a>
          <span className="rounded-full bg-violet-600 px-2.5 py-1 text-[11px] font-bold text-white">Reparto</span>
          <span className="ml-auto truncate text-sm font-bold">{profile.full_name.split(' ')[0]}</span>
          <button
            onClick={async () => {
              await signOut()
              navigate('/')
            }}
            className="grid size-9 place-items-center rounded-full bg-neutral-100"
            aria-label="Cerrar sesión"
          >
            <Icon name="logout" className="size-4" />
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-5">
        {error && <ErrorBox error={error} onRetry={reload} />}
        {loading && !orders ? (
          <Loading />
        ) : tab === 'ganancias' ? (
          <Earnings />
        ) : tab === 'activos' ? (
          <List
            title="Tus pedidos en curso"
            empty={['🛵', 'No tienes pedidos en curso', 'Acepta uno en «Disponibles».']}
            orders={mine}
            render={(o) => <ActiveOrder key={o.id} order={o} onChange={() => reload(true)} />}
          />
        ) : (
          <List
            title="Pedidos disponibles"
            empty={['😴', 'No hay pedidos ahora mismo', 'Te avisaremos por email cuando entre uno.']}
            orders={available}
            render={(o) => (
              <AvailableOrder
                key={o.id}
                order={o}
                onAccepted={() => {
                  reload(true)
                  navigate('/reparto/activos')
                }}
              />
            )}
          />
        )}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-neutral-200/80 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl">
        <ul className="mx-auto grid max-w-md grid-cols-3">
          {TABS.map((t) => {
            const count = t.id === '' ? available.length : t.id === 'activos' ? mine.length : 0
            return (
              <li key={t.id}>
                <a href={`#/reparto${t.id ? `/${t.id}` : ''}`} className={`relative flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-bold ${tab === t.id ? 'text-brand-600' : 'text-neutral-500'}`}>
                  <span className="relative">
                    <Icon name={t.icon === 'bell' ? 'bag' : t.icon} className="size-6" />
                    {count > 0 && (
                      <span className="absolute -top-1.5 -right-2.5 grid min-w-5 place-items-center rounded-full bg-brand-600 px-1 text-[10px] text-white ring-2 ring-white">
                        {count}
                      </span>
                    )}
                  </span>
                  {t.label}
                </a>
              </li>
            )
          })}
        </ul>
      </nav>
    </div>
  )
}

// Comparte la ubicación del rider con los clientes de sus pedidos en curso
function useLocationSharing(mine) {
  const ids = useMemo(() => mine.map((o) => o.id).join(','), [mine])
  const last = useRef(0)
  useEffect(() => {
    if (!ids || !navigator.geolocation) return
    const watch = navigator.geolocation.watchPosition(
      (pos) => {
        if (Date.now() - last.current < 15000) return
        last.current = Date.now()
        ids.split(',').forEach((id) =>
          supabase.rpc('rider_update_location', { p_order: id, p_lat: pos.coords.latitude, p_lng: pos.coords.longitude }).then(() => {}),
        )
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 10000 },
    )
    return () => navigator.geolocation.clearWatch(watch)
  }, [ids])
}

function List({ title, orders, render, empty }) {
  return (
    <>
      <h1 className="mb-4 font-display text-2xl font-black italic">{title}</h1>
      {orders.length ? (
        <div className="space-y-3">{orders.map(render)}</div>
      ) : (
        <div className="rounded-3xl bg-white p-10 text-center ring-1 ring-neutral-200/70">
          <p className="text-4xl">{empty[0]}</p>
          <p className="mt-2 font-bold">{empty[1]}</p>
          <p className="text-sm text-neutral-500">{empty[2]}</p>
        </div>
      )}
    </>
  )
}

function Summary({ order: o }) {
  const { settings } = useSettings()
  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 font-extrabold">
            {o.code}
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${ORDER_STATUS[o.status].cls}`}>{ORDER_STATUS[o.status].label}</span>
          </p>
          <p className="truncate text-xs text-neutral-500">
            {o.scheduled_for ? `📅 Programado ${dateTime(o.scheduled_for, settings.timezone)}` : `Pedido ${dateTime(o.created_at, settings.timezone)}`}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-lg font-extrabold text-brand-600">{Number(o.tip) > 0 ? `+${money(o.tip)}` : '—'}</p>
          <p className="text-[11px] text-neutral-500">propina</p>
        </div>
      </div>
      <ol className="mt-3 space-y-2 text-sm">
        <li className="flex gap-3">
          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-ink text-xs text-white">A</span>
          <span>
            <b>{o.restaurant.name}</b>
            <span className="block text-xs text-neutral-500">{o.restaurant.address}</span>
          </span>
        </li>
        <li className="flex gap-3">
          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-brand-600 text-xs text-white">B</span>
          <span>
            <b>{o.address.street}</b>
            <span className="block text-xs text-neutral-500">
              {km(o.distance_km)} · {PAYMENT_METHOD[o.payment_method]}
              {o.payment_method === 'cash' && <b className="text-brand-700"> · cobrar {money(o.total)}</b>}
            </span>
          </span>
        </li>
      </ol>
    </>
  )
}

function AvailableOrder({ order: o, onAccepted }) {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const accept = async () => {
    setBusy(true)
    try {
      unwrap(await supabase.rpc('rider_accept_order', { p_order: o.id }))
      callFunction('notify', { order_id: o.id, event: 'rider_assigned' }).catch(() => {})
      toast(`Pedido ${o.code} aceptado`)
      onAccepted()
    } catch (e) {
      toast(e.message, 'error')
      setBusy(false)
    }
  }
  return (
    <article className="rounded-3xl bg-white p-4 ring-1 ring-neutral-200/70">
      <Summary order={o} />
      <Button className="mt-4 w-full py-3.5" loading={busy} onClick={accept}>
        Aceptar pedido
      </Button>
    </article>
  )
}

function ActiveOrder({ order: o, onChange }) {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const markers = useMemo(
    () => [
      { lat: o.restaurant.lat, lng: o.restaurant.lng, kind: 'restaurant' },
      { lat: o.lat, lng: o.lng, kind: 'home' },
    ],
    [o],
  )

  const act = async (fn, ok) => {
    setBusy(true)
    try {
      await fn()
      toast(ok)
      onChange()
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const pickedUp = o.status === 'on_the_way'
  const target = pickedUp ? { lat: o.lat, lng: o.lng } : o.restaurant

  return (
    <article className="overflow-hidden rounded-3xl bg-white ring-1 ring-neutral-200/70">
      <MapView markers={markers} className="h-48" />
      <div className="p-4">
        <Summary order={o} />
        <div className="mt-3 rounded-2xl bg-neutral-50 p-3 text-sm">
          <p className="font-bold">{o.customer_name}</p>
          {o.address.details && <p>{o.address.details}</p>}
          {o.address.notes && <p className="text-xs italic text-neutral-500">“{o.address.notes}”</p>}
          <ul className="mt-2 text-xs text-neutral-600">
            {o.items.map((i) => (
              <li key={i.id}>
                {i.qty}× {i.name}
              </li>
            ))}
          </ul>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <a href={directions(target.lat, target.lng)} target="_blank" rel="noreferrer" className="flex flex-col items-center gap-1 rounded-2xl bg-neutral-100 py-2.5 text-xs font-bold">
            <Icon name="pin" className="size-4" /> Cómo llegar
          </a>
          <a href={`tel:${o.customer_phone.replace(/\s/g, '')}`} className="flex flex-col items-center gap-1 rounded-2xl bg-neutral-100 py-2.5 text-xs font-bold">
            <Icon name="phone" className="size-4" /> Cliente
          </a>
          {o.restaurant.phone ? (
            <a href={`tel:${o.restaurant.phone.replace(/\s/g, '')}`} className="flex flex-col items-center gap-1 rounded-2xl bg-neutral-100 py-2.5 text-xs font-bold">
              <Icon name="store" className="size-4" /> Restaurante
            </a>
          ) : (
            <span />
          )}
        </div>
        {pickedUp ? (
          <Button
            className="mt-3 w-full py-3.5"
            loading={busy}
            onClick={() =>
              act(async () => {
                await setOrderStatus(o.id, 'delivered')
                callFunction('notify', { order_id: o.id, event: 'delivered' }).catch(() => {})
              }, '¡Pedido entregado! 🎉')
            }
          >
            {o.payment_method === 'cash' ? `Cobrado ${money(o.total)} y entregado` : 'Marcar como entregado'}
          </Button>
        ) : (
          <div className="mt-3 flex gap-2">
            <Button variant="soft" disabled={busy} onClick={() => act(() => supabase.rpc('rider_release_order', { p_order: o.id }).then(unwrap), 'Pedido liberado')}>
              Liberar
            </Button>
            <Button className="flex-1 py-3.5" loading={busy} onClick={() => act(() => setOrderStatus(o.id, 'on_the_way'), 'Pedido recogido, ¡a toda liebre!')}>
              {o.status === 'ready' ? 'Recogido, voy en camino' : 'Recogido (aún en cocina)'}
            </Button>
          </div>
        )}
      </div>
    </article>
  )
}

function Earnings() {
  const { settings } = useSettings()
  const [period, setPeriod] = useState('7d')
  const { data, error, loading, reload } = useAsync(async () => {
    const { from, to } = periodRange(period, settings.timezone)
    return unwrap(await supabase.rpc('rider_earnings', { p_from: from.toISOString(), p_to: to.toISOString() }))
  }, [period, settings.timezone])
  return (
    <>
      <h1 className="mb-4 font-display text-2xl font-black italic">Tus ganancias</h1>
      <div className="mb-4">
        <PeriodPicker value={period} onChange={setPeriod} />
      </div>
      {loading && !data ? (
        <Loading />
      ) : error ? (
        <ErrorBox error={error} onRetry={reload} />
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <StatTile label="Propinas" value={money(data.tips)} accent />
          <StatTile label="Entregas" value={data.deliveries} />
          <StatTile label="Kilómetros" value={km(data.km)} />
          <StatTile label="Efectivo a entregar" value={money(data.cash_to_return)} hint="cobrado en pedidos en efectivo" />
        </div>
      )}
    </>
  )
}
