import Icon from '../components/Icon.jsx'
import { ErrorBox, Loading, SafeImg, Toggle, Cover, useNow, useRestaurantStatus, useToast } from '../components/ui.jsx'
import { useAuth } from '../lib/auth.jsx'
import { useSettings } from '../lib/settings.jsx'
import { useAsync } from '../lib/useAsync.js'
import { myRestaurants } from '../lib/data.js'
import { supabase, unwrap } from '../lib/supabase.js'
import { money } from '../lib/format.js'
import { PageTitle } from './Panel.jsx'
import { DailyBars, periodRange, StatTile } from './common.jsx'

export default function Dashboard() {
  const { profile } = useAuth()
  const { settings, config } = useSettings()
  const isSuper = profile.role === 'superuser'
  const tz = settings.timezone

  const { data, error, loading, reload } = useAsync(async () => {
    const today = periodRange('today', tz)
    const week = periodRange('7d', tz)
    const [sales, weekSales, active, restaurants, report] = await Promise.all([
      supabase.rpc('restaurant_sales', { p_restaurant: null, p_from: today.from.toISOString(), p_to: today.to.toISOString() }).then(unwrap),
      supabase.rpc('restaurant_sales', { p_restaurant: null, p_from: week.from.toISOString(), p_to: week.to.toISOString() }).then(unwrap),
      supabase
        .from('orders')
        .select('id, status', { count: 'exact' })
        .in('status', ['confirmed', 'preparing', 'ready', 'on_the_way'])
        .then(unwrap),
      myRestaurants(profile),
      isSuper
        ? supabase.rpc('platform_report', { p_from: today.from.toISOString(), p_to: today.to.toISOString() }).then(unwrap)
        : null,
    ])
    return { sales, weekSales, active, restaurants, report }
  }, [profile.id, tz])

  if (loading && !data) return <Loading />
  if (error) return <ErrorBox error={error} onRetry={reload} />

  const newOrders = data.active.filter((o) => o.status === 'confirmed').length
  const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hourCycle: 'h23' }).format(new Date()))
  const greeting = hour < 13 ? 'Buenos días' : hour < 20 ? 'Buenas tardes' : 'Buenas noches'

  return (
    <>
      <PageTitle subtitle={isSuper ? 'Vista global de la plataforma' : 'Así va tu negocio hoy'}>
        {greeting}, {(profile.full_name || '').split(' ')[0] || 'equipo'} 👋
      </PageTitle>

      {isSuper && config?.payments !== 'stripe' && (
        <div className="mb-4 rounded-3xl bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-200">
          🧪 <b>Pagos en modo pruebas.</b> Añade <code>STRIPE_SECRET_KEY</code> y <code>STRIPE_WEBHOOK_SECRET</code> en <code>supabase/.env</code> y
          ejecuta <code>npm run supabase:secrets</code> para cobrar de verdad.
          {config && !config.email && ' Los emails tampoco están activos: falta SMTP_PASS.'}
        </div>
      )}

      {newOrders > 0 && (
        <a href="#/panel/pedidos" className="mb-4 flex items-center gap-3 rounded-3xl bg-brand-600 p-4 font-bold text-white shadow-lg shadow-brand-600/30">
          <span className="grid size-10 place-items-center rounded-2xl bg-white/20 text-xl">🔔</span>
          {newOrders} pedido{newOrders > 1 ? 's' : ''} nuevo{newOrders > 1 ? 's' : ''} esperando
          <Icon name="right" className="ml-auto size-5" />
        </a>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Pedidos hoy" value={data.sales.orders} hint={`${data.active.length} en curso`} accent />
        <StatTile label="Ventas hoy" value={money(data.sales.gross)} hint="precio de carta" />
        <StatTile label={isSuper ? 'Ingresos plataforma hoy' : 'A cobrar hoy'} value={money(isSuper ? platformRevenue(data.report) : data.sales.payout)} hint={isSuper ? 'recargo + comisión + envío, sin IGIC' : 'ventas − comisión + IGIC'} />
        <StatTile label="Ticket medio" value={money(data.sales.avg_ticket)} hint="hoy" />
      </div>

      <section className="mt-4 rounded-3xl bg-white p-5 ring-1 ring-neutral-200/70">
        <DailyBars data={data.weekSales.by_day} label="Ventas (7 días)" />
      </section>

      <section className="mt-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-extrabold">{isSuper ? 'Restaurantes' : 'Tus restaurantes'}</h2>
          <a href="#/panel/restaurantes" className="text-sm font-bold text-brand-600">
            Gestionar
          </a>
        </div>
        {data.restaurants.length === 0 ? (
          <a href="#/panel/restaurantes" className="block rounded-3xl bg-white p-6 text-center ring-1 ring-neutral-200/70">
            <p className="text-3xl">🏪</p>
            <p className="mt-2 font-bold">Da de alta tu primer restaurante</p>
          </a>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {data.restaurants.slice(0, isSuper ? 6 : 20).map((r) => (
              <QuickRestaurant key={r.id} restaurant={r} onChange={reload} />
            ))}
          </div>
        )}
      </section>
    </>
  )
}

// Ingreso neto de la plataforma: lo cobrado − propinas − lo que se paga a restaurantes − IGIC propio a declarar
export const platformRevenue = (r) =>
  r ? Number(r.gmv) - Number(r.tips) - Number(r.restaurant_payouts) - (Number(r.tax ?? 0) - Number(r.restaurant_tax ?? 0)) : 0

function QuickRestaurant({ restaurant: r, onChange }) {
  const now = useNow()
  const toast = useToast()
  const status = useRestaurantStatus(r, now)
  const toggle = async (value) => {
    const { error } = await supabase.from('restaurants').update({ accepting_orders: value }).eq('id', r.id)
    if (error) return toast(error.message, 'error')
    toast(value ? 'Pedidos reanudados' : 'Pedidos en pausa')
    onChange()
  }
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-3xl bg-white p-3 ring-1 ring-neutral-200/70">
      <Cover restaurant={r} variant="thumb" className="size-14 shrink-0 rounded-2xl" />
      <a href={`#/panel/restaurantes/${r.id}`} className="min-w-0 flex-1">
        <p className="truncate font-extrabold">{r.name}</p>
        <p className="truncate text-xs text-neutral-500">{r.active ? status.label : 'Oculto en la app'}</p>
      </a>
      <div className="shrink-0">
        <Toggle checked={r.accepting_orders} onChange={toggle} label={<span className="sr-only">Aceptar pedidos</span>} />
      </div>
    </div>
  )
}
