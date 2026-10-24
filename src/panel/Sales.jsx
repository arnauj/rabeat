import { useState } from 'react'
import { ErrorBox, Loading, Select } from '../components/ui.jsx'
import { useAuth } from '../lib/auth.jsx'
import { useSettings } from '../lib/settings.jsx'
import { useAsync } from '../lib/useAsync.js'
import { myRestaurants } from '../lib/data.js'
import { supabase, unwrap } from '../lib/supabase.js'
import { money } from '../lib/format.js'
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
      <PageTitle subtitle="Importes a precio de carta del restaurante (sin el recargo de la plataforma)">Ventas</PageTitle>
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
            <StatTile label="Pedidos" value={data.orders} hint={data.cancelled ? `${data.cancelled} cancelados` : 'sin cancelaciones'} />
            <StatTile label="Ventas" value={money(data.gross)} />
            <StatTile label="Comisión rabeat" value={`−${money(data.commission)}`} hint={`${settings.restaurant_commission_pct}% por pedido`} />
            <StatTile label="Neto a cobrar" value={money(data.payout)} accent />
            <StatTile label="Ticket medio" value={money(data.avg_ticket)} />
          </div>
          <section className="rounded-3xl bg-white p-5 ring-1 ring-neutral-200/70">
            <DailyBars data={data.by_day} />
          </section>
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
