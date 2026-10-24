import TopBar from '../components/TopBar.jsx'
import Icon from '../components/Icon.jsx'
import { Cover, Loading, SectionTitle } from '../components/ui.jsx'
import { useCart } from '../lib/cart.jsx'
import { useAuth } from '../lib/auth.jsx'
import { useSettings } from '../lib/settings.jsx'
import { useAsync } from '../lib/useAsync.js'
import { getTracking } from '../lib/data.js'
import { supabase, unwrap } from '../lib/supabase.js'
import { dateTime, money, ORDER_STATUS } from '../lib/format.js'

const CUSTOMER_STATUS = { ...ORDER_STATUS, confirmed: { label: 'Confirmado', cls: 'bg-brand-50 text-brand-700' } }

export default function Orders() {
  const { orders: remembered } = useCart()
  const { user } = useAuth()
  const { settings } = useSettings()

  const { data: orders, loading } = useAsync(async () => {
    const byToken = new Map()
    if (user) {
      const mine = unwrap(
        await supabase
          .from('orders')
          .select('tracking_token, code, status, total, created_at, scheduled_for, order_type, table_name, items:order_items(qty), restaurant:restaurants(name, cover_url, cover_is_logo, cover_bg)')
          .eq('customer_id', user.id)
          .order('created_at', { ascending: false })
          .limit(50),
      )
      mine.forEach((o) => byToken.set(o.tracking_token, { ...o, token: o.tracking_token }))
    }
    // Pedidos hechos como invitado en este dispositivo
    const guests = await Promise.all(
      remembered.filter((o) => !byToken.has(o.token)).slice(0, 15).map((o) => getTracking(o.token).catch(() => null)),
    )
    guests.filter(Boolean).forEach((o) => byToken.set(o.token, o))
    return [...byToken.values()].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  }, [user?.id, remembered.length])

  return (
    <>
      <TopBar />
      <main className="mx-auto max-w-xl px-4 py-6">
        <SectionTitle>Mis pedidos</SectionTitle>
        {loading && !orders ? (
          <Loading />
        ) : !orders?.length ? (
          <div className="rounded-3xl bg-white p-8 text-center ring-1 ring-neutral-200/70">
            <img src="rider.png" alt="" className="mx-auto w-32" />
            <p className="mt-3 font-extrabold">Todavía no has pedido nada</p>
            <p className="text-sm text-neutral-500">Tu rider está calentando motores.</p>
            <a href="#/" className="mt-4 inline-block rounded-full bg-brand-600 px-5 py-2.5 text-sm font-bold text-white">
              Pedir ahora
            </a>
          </div>
        ) : (
          <ul className="space-y-3">
            {orders.map((o) => {
              const st = CUSTOMER_STATUS[o.status]
              const count = o.items.reduce((n, i) => n + i.qty, 0)
              return (
                <li key={o.token}>
                  <a href={`#/pedido/${o.token}`} className="flex items-center gap-3 rounded-3xl bg-white p-3 ring-1 ring-neutral-200/70 transition hover:shadow-lg">
                    <Cover restaurant={o.restaurant} variant="thumb" className="size-16 shrink-0 rounded-2xl" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-extrabold">{o.restaurant.name}</p>
                      <p className="truncate text-xs text-neutral-500">
                        {o.order_type === 'dine_in' && `🍽️ ${o.table_name} · `}
                        {dateTime(o.created_at, settings.timezone)} · {count} productos · {money(o.total)}
                      </p>
                      <span className={`mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${st.cls}`}>
                        {o.scheduled_for && o.status === 'confirmed' && <Icon name="calendar" className="size-3" />}
                        {o.scheduled_for && o.status === 'confirmed' ? `Programado · ${dateTime(o.scheduled_for, settings.timezone)}` : st.label}
                      </span>
                    </div>
                    <Icon name="right" className="size-5 text-neutral-400" />
                  </a>
                </li>
              )
            })}
          </ul>
        )}
        {!user && (
          <p className="mt-6 text-center text-sm text-neutral-500">
            Ves los pedidos hechos en este dispositivo.{' '}
            <a href="#/entrar?next=/pedidos" className="font-bold text-brand-600">
              Inicia sesión
            </a>{' '}
            para verlos en cualquier sitio.
          </p>
        )}
      </main>
    </>
  )
}
