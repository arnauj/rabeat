import { useState } from 'react'
import Icon from '../components/Icon.jsx'
import { Button, ErrorBox, Loading } from '../components/ui.jsx'
import { useSettings } from '../lib/settings.jsx'
import { useAsync } from '../lib/useAsync.js'
import { supabase, unwrap } from '../lib/supabase.js'
import { money } from '../lib/format.js'
import { PageTitle } from './Panel.jsx'
import { PeriodPicker, periodRange, StatTile, Table } from './common.jsx'
import { platformRevenue } from './Dashboard.jsx'

function downloadCsv(name, rows) {
  const csv = rows.map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';')).join('\n')
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
  const a = Object.assign(document.createElement('a'), { href: url, download: name })
  a.click()
  URL.revokeObjectURL(url)
}

const num = (n) => Number(n).toFixed(2).replace('.', ',')

export default function Payouts() {
  const { settings } = useSettings()
  const [period, setPeriod] = useState('month')
  const { data, error, loading, reload } = useAsync(async () => {
    const { from, to } = periodRange(period, settings.timezone)
    const range = { p_from: from.toISOString(), p_to: to.toISOString() }
    const [report, tips] = await Promise.all([
      supabase.rpc('platform_report', range).then(unwrap),
      supabase.rpc('staff_tips_report', { p_restaurant: null, ...range }).then(unwrap),
    ])
    // Propinas al equipo (QR de mesa): se suman a lo que se transfiere a cada restaurante
    const tipsBy = Object.fromEntries(tips.by_restaurant.map((t) => [t.id, Number(t.total)]))
    const rows = report.by_restaurant.map((r) => ({ ...r, staff_tips: tipsBy[r.id] ?? 0 }))
    for (const t of tips.by_restaurant)
      if (!rows.some((r) => r.id === t.id))
        rows.push({ id: t.id, name: t.name, orders: 0, gross: 0, commission: 0, payout: 0, cash_in_restaurant: 0, cash_collected: 0, staff_tips: Number(t.total) })
    return { ...report, by_restaurant: rows, staff_tips: Number(tips.total) }
  }, [period, settings.timezone])

  return (
    <>
      <PageTitle subtitle="Cobro centralizado: lo que la plataforma debe a cada restaurante y repartidor">Liquidaciones</PageTitle>
      <div className="mb-4">
        <PeriodPicker value={period} onChange={setPeriod} />
      </div>
      {loading && !data ? (
        <Loading />
      ) : error ? (
        <ErrorBox error={error} onRetry={reload} />
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label="Facturado a clientes" value={money(data.gmv)} hint={`${data.orders} pedidos · ${data.dine_in_orders ?? 0} en mesa · ${data.cash_orders} en efectivo`} />
            <StatTile label="Ingresos plataforma" value={money(platformRevenue(data))} accent hint="recargo + comisión + envío − descuentos, sin IGIC" />
            <StatTile label="A pagar a restaurantes" value={money(data.restaurant_payouts)} />
            <StatTile label="Propinas a repartidores" value={money(data.tips)} />
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label="Recargo en precios" value={money(data.markup)} hint={`${settings.price_markup_pct}% general`} />
            <StatTile label="Comisión restaurantes" value={money(data.commission)} hint={`${money(data.dine_in_commission ?? 0)} de pedidos en mesa`} />
            <StatTile label="Gastos de envío" value={money(data.delivery)} />
            <StatTile label="Descuentos (promos)" value={`−${money(data.discounts)}`} />
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label="Propinas a equipos" value={money(data.staff_tips)} hint="QR de mesa, sin pedido" />
            <StatTile label="IGIC cobrado a clientes" value={money(data.tax ?? 0)} />
            <StatTile label="IGIC de la comida" value={money(data.restaurant_tax ?? 0)} hint="se paga a cada restaurante, que lo declara" />
            <StatTile label="IGIC a declarar por rabeat" value={money((data.tax ?? 0) - (data.restaurant_tax ?? 0))} hint="recargo y envío" />
          </div>

          <section>
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-lg font-extrabold">Restaurantes</h2>
              <Button
                variant="soft"
                className="!py-2"
                onClick={() =>
                  downloadCsv(`liquidacion-restaurantes-${period}.csv`, [
                    ['Restaurante', 'Pedidos', 'En mesa', 'Ventas', 'Comisión', 'Neto restaurante', 'Cobrado por el local', 'Propinas equipo', 'A transferir', 'Efectivo cobrado por riders'],
                    ...data.by_restaurant.map((r) => [
                      r.name,
                      r.orders,
                      r.dine_in_orders ?? 0,
                      num(r.gross),
                      num(r.commission),
                      num(r.payout),
                      num(r.cash_in_restaurant ?? 0),
                      num(r.staff_tips),
                      num(r.payout - (r.cash_in_restaurant ?? 0) + r.staff_tips),
                      num(r.cash_collected),
                    ]),
                  ])
                }
              >
                <Icon name="receipt" className="size-4" /> CSV
              </Button>
            </div>
            <Table head={['Restaurante', 'Pedidos', 'Ventas', 'Comisión', 'Cobrado en el local', 'Propinas equipo', 'A transferir']}>
              {data.by_restaurant.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-3 font-semibold">{r.name}</td>
                  <td className="px-4 py-3 text-right">
                    {r.orders}
                    {r.dine_in_orders > 0 && <span className="block text-xs text-neutral-400">{r.dine_in_orders} en mesa</span>}
                  </td>
                  <td className="px-4 py-3 text-right">{money(r.gross)}</td>
                  <td className="px-4 py-3 text-right text-neutral-500">−{money(r.commission)}</td>
                  <td className="px-4 py-3 text-right text-neutral-500">{money(r.cash_in_restaurant ?? 0)}</td>
                  <td className="px-4 py-3 text-right text-neutral-500">{r.staff_tips > 0 ? `+${money(r.staff_tips)}` : '—'}</td>
                  <td className="px-4 py-3 text-right font-extrabold">{money(r.payout - (r.cash_in_restaurant ?? 0) + r.staff_tips)}</td>
                </tr>
              ))}
              {!data.by_restaurant.length && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-neutral-400">
                    Sin ventas en este periodo
                  </td>
                </tr>
              )}
            </Table>
          </section>

          <p className="-mt-3 text-xs text-neutral-500">
            «Cobrado en el local» son los pedidos en mesa pagados en el propio restaurante: ya tiene ese dinero, así que se descuenta de lo que hay que transferirle.
            Si sale negativo, es el restaurante quien debe la comisión a rabeat.
          </p>
          <section>
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-lg font-extrabold">Repartidores</h2>
              <Button
                variant="soft"
                className="!py-2"
                onClick={() =>
                  downloadCsv(`liquidacion-riders-${period}.csv`, [
                    ['Repartidor', 'Email', 'Entregas', 'Propinas', 'Efectivo cobrado'],
                    ...data.by_rider.map((r) => [r.name, r.email, r.deliveries, num(r.tips), num(r.cash_collected)]),
                  ])
                }
              >
                <Icon name="receipt" className="size-4" /> CSV
              </Button>
            </div>
            <Table head={['Repartidor', 'Entregas', 'Propinas', 'Efectivo cobrado']}>
              {data.by_rider.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-3">
                    <p className="font-semibold">{r.name || r.email}</p>
                    <p className="text-xs text-neutral-400">{r.email}</p>
                  </td>
                  <td className="px-4 py-3 text-right">{r.deliveries}</td>
                  <td className="px-4 py-3 text-right font-extrabold">{money(r.tips)}</td>
                  <td className="px-4 py-3 text-right text-neutral-500">{money(r.cash_collected)}</td>
                </tr>
              ))}
              {!data.by_rider.length && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-neutral-400">
                    Sin repartos en este periodo
                  </td>
                </tr>
              )}
            </Table>
            <p className="mt-2 text-xs text-neutral-500">
              «Efectivo cobrado» es lo que el repartidor recibió en mano en pedidos en efectivo: descuéntalo de lo que le debes o pídele que lo ingrese.
            </p>
          </section>
        </div>
      )}
    </>
  )
}
