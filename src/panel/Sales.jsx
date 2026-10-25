import { useState } from 'react'
import { ErrorBox, Loading, Select } from '../components/ui.jsx'
import { useAuth } from '../lib/auth.jsx'
import { useSettings } from '../lib/settings.jsx'
import { useAsync } from '../lib/useAsync.js'
import { myRestaurants } from '../lib/data.js'
import { supabase, unwrap } from '../lib/supabase.js'
import { dateTime, money, paymentLabel } from '../lib/format.js'
import { PageTitle } from './Panel.jsx'
import { DailyBars, PeriodPicker, periodRange, StatTile, Table } from './common.jsx'

export default function Sales() {
  const { profile } = useAuth()
  const { settings } = useSettings()
  const [period, setPeriod] = useState('30d')
  const [restaurantId, setRestaurantId] = useState('')
  const { data: restaurants } = useAsync(() => myRestaurants(profile), [profile.id])

  const { data, error, loading, reload } = useAsync(async () => {
    const { from, to } = periodRange(period, settings.timezone)
    return unwrap(
      await supabase.rpc('restaurant_sales', { p_restaurant: restaurantId || null, p_from: from.toISOString(), p_to: to.toISOString() }),
    )
  }, [period, restaurantId, settings.timezone])

  return (
    <>
      <PageTitle subtitle="Importes a precio de carta, sin IGIC ni recargo de la plataforma">Ventas</PageTitle>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <PeriodPicker value={period} onChange={setPeriod} />
        {restaurants?.length > 1 && (
          <Select value={restaurantId} onChange={(e) => setRestaurantId(e.target.value)} className="sm:w-72">
            <option value="">Todos {profile.role === 'superuser' ? 'los restaurantes' : 'mis restaurantes'}</option>
            {restaurants.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>
        )}
      </div>

      {loading && !data ? (
        <Loading />
      ) : error ? (
        <ErrorBox error={error} onRetry={reload} />
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <StatTile
              label="Pedidos"
              value={data.orders}
              hint={`🛵 ${data.delivery_orders ?? data.orders} · 🍽️ ${data.dine_in_orders ?? 0} en mesa${data.cancelled ? ` · ${data.cancelled} cancel.` : ''}`}
            />
            <StatTile label="Ventas" value={money(data.gross)} />
            <StatTile
              label="Comisión rabeat"
              value={`−${money(data.commission)}`}
              hint="según la comisión de cada pedido"
            />
            <StatTile label="Neto a cobrar" value={money(data.payout)} accent hint={`incluye ${money(data.tax ?? 0)} de IGIC a declarar`} />
            <StatTile label="Ticket medio" value={money(data.avg_ticket)} />
          </div>
          <section className="rounded-3xl bg-white p-5 ring-1 ring-neutral-200/70">
            <DailyBars data={data.by_day} />
          </section>
          <StaffTips period={period} restaurantId={restaurantId} />
          <section>
            <h2 className="mb-3 text-lg font-extrabold">Platos más vendidos</h2>
            {data.top_dishes.length ? (
              <Table head={['Plato', 'Unidades', 'Ventas']}>
                {data.top_dishes.map((d) => (
                  <tr key={d.name}>
                    <td className="px-4 py-3 font-semibold">{d.name}</td>
                    <td className="px-4 py-3 text-right">{d.qty}</td>
                    <td className="px-4 py-3 text-right font-bold">{money(d.gross)}</td>
                  </tr>
                ))}
              </Table>
            ) : (
              <p className="text-sm text-neutral-500">Todavía no hay ventas en este periodo.</p>
            )}
          </section>
        </div>
      )}
    </>
  )
}

// Propinas que los clientes dejan al equipo desde el QR de la mesa (sin pedido)
function StaffTips({ period, restaurantId }) {
  const { settings } = useSettings()
  const { data } = useAsync(async () => {
    const { from, to } = periodRange(period, settings.timezone)
    return unwrap(await supabase.rpc('staff_tips_report', { p_restaurant: restaurantId || null, p_from: from.toISOString(), p_to: to.toISOString() }))
  }, [period, restaurantId, settings.timezone])
  if (!data) return null
  return (
    <section className="rounded-3xl bg-white p-5 ring-1 ring-neutral-200/70">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-extrabold">💛 Propinas para el equipo</h2>
          <p className="text-xs text-neutral-500">Desde el QR de las mesas, sin pedido. Se liquidan íntegras, sin comisión.</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-xl font-extrabold tabular-nums">{money(data.total)}</p>
          <p className="text-xs text-neutral-500">{data.count} {data.count === 1 ? "propina" : "propinas"}</p>
        </div>
      </div>
      {data.recent.length ? (
        <ul className="divide-y divide-neutral-100">
          {data.recent.map((t) => (
            <li key={t.id} className="flex items-start gap-3 py-2.5">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-amber-50">💛</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">
                  {t.table_name}
                  {t.customer_name && <span className="font-semibold text-neutral-500"> · {t.customer_name}</span>}
                </p>
                {t.message && <p className="text-sm text-neutral-600 italic">“{t.message}”</p>}
                <p className="text-[11px] text-neutral-400">
                  {dateTime(t.paid_at, settings.timezone)} · {paymentLabel(t)}
                  {!restaurantId && ` · ${t.restaurant}`}
                </p>
              </div>
              <p className="shrink-0 font-extrabold tabular-nums">{money(t.amount)}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-neutral-500">Aún no hay propinas en este periodo.</p>
      )}
    </section>
  )
}
