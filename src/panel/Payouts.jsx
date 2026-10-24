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
    return unwrap(await supabase.rpc('platform_report', { p_from: from.toISOString(), p_to: to.toISOString() }))
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
            <StatTile label="Facturado a clientes" value={money(data.gmv)} hint={`${data.orders} pedidos · ${data.cash_orders} en efectivo`} />
            <StatTile label="Ingresos plataforma" value={money(platformRevenue(data))} accent hint="recargo + comisión + envío − descuentos" />
            <StatTile label="A pagar a restaurantes" value={money(data.restaurant_payouts)} />
            <StatTile label="Propinas a repartidores" value={money(data.tips)} />
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label="Recargo en precios" value={money(data.markup)} hint={`${settings.price_markup_pct}% actual`} />
            <StatTile label="Comisión restaurantes" value={money(data.commission)} hint={`${settings.restaurant_commission_pct}% actual`} />
            <StatTile label="Gastos de envío" value={money(data.delivery)} />
            <StatTile label="Descuentos (promos)" value={`−${money(data.discounts)}`} />
          </div>

          <section>
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-lg font-extrabold">Restaurantes</h2>
              <Button
                variant="soft"
                className="!py-2"
                onClick={() =>
                  downloadCsv(`liquidacion-restaurantes-${period}.csv`, [
                    ['Restaurante', 'Pedidos', 'Ventas', 'Comisión', 'A transferir', 'Cobrado en efectivo por riders'],
                    ...data.by_restaurant.map((r) => [r.name, r.orders, num(r.gross), num(r.commission), num(r.payout), num(r.cash_collected)]),
                  ])
                }
              >
                <Icon name="receipt" className="size-4" /> CSV
              </Button>
            </div>
            <Table head={['Restaurante', 'Pedidos', 'Ventas', 'Comisión', 'A transferir']}>
              {data.by_restaurant.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-3 font-semibold">{r.name}</td>
                  <td className="px-4 py-3 text-right">{r.orders}</td>
                  <td className="px-4 py-3 text-right">{money(r.gross)}</td>
                  <td className="px-4 py-3 text-right text-neutral-500">−{money(r.commission)}</td>
                  <td className="px-4 py-3 text-right font-extrabold">{money(r.payout)}</td>
                </tr>
              ))}
              {!data.by_restaurant.length && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-neutral-400">
                    Sin ventas en este periodo
                  </td>
                </tr>
              )}
            </Table>
          </section>

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
