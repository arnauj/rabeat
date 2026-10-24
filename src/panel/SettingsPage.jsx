import { useEffect, useState } from 'react'
import { Button, Card, Field, Select, useToast } from '../components/ui.jsx'
import { useSettings } from '../lib/settings.jsx'
import { supabase } from '../lib/supabase.js'
import { money } from '../lib/format.js'
import { quote } from '../lib/pricing.js'
import { PageTitle } from './Panel.jsx'

const FIELDS = [
  'restaurant_commission_pct',
  'price_markup_pct',
  'delivery_base_fee',
  'delivery_fee_per_km',
  'delivery_max_km',
  'max_tip',
  'dine_in_commission_pct',
  'dine_in_markup_pct',
  'igic_pct',
]

export default function SettingsPage() {
  const { settings, reload } = useSettings()
  const toast = useToast()
  const [form, setForm] = useState(settings)
  const [saving, setSaving] = useState(false)
  useEffect(() => setForm(settings), [settings])
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })
  const n = (k) => Number(String(form[k]).replace(',', '.'))

  const save = async () => {
    const patch = Object.fromEntries(FIELDS.map((k) => [k, n(k)]))
    if (Object.values(patch).some((v) => !Number.isFinite(v) || v < 0)) return toast('Revisa los valores: deben ser números positivos', 'error')
    setSaving(true)
    const { error } = await supabase.from('settings').update({ ...patch, timezone: form.timezone }).eq('id', 1)
    setSaving(false)
    if (error) return toast(error.message, 'error')
    toast('Ajustes guardados: se aplican a los nuevos pedidos')
    reload()
  }

  // Ejemplo con un pedido de 20 € a 3 km
  const example = quote({
    items: [{ base_price: 20, qty: 1 }],
    settings: Object.fromEntries([...FIELDS.map((k) => [k, n(k) || 0])]),
    km: 3,
    tip: 0,
  })

  return (
    <>
      <PageTitle subtitle="Los cambios se aplican a los pedidos nuevos; los ya hechos conservan sus importes">Comisiones y envío</PageTitle>
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <Card title="Impuestos (IGIC)" icon="receipt">
            <Field
              label="Tipo general de IGIC (%)"
              inputMode="decimal"
              value={form.igic_pct}
              onChange={set('igic_pct')}
              hint="Los restaurantes suben sus precios sin IGIC. Se aplica a platos (salvo los que tengan otro tipo) y al envío."
            />
          </Card>
          <Card title="Comisiones" icon="percent">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label="Comisión al restaurante (%)"
                inputMode="decimal"
                value={form.restaurant_commission_pct}
                onChange={set('restaurant_commission_pct')}
                hint="Se descuenta de lo que cobra el restaurante en cada pedido"
              />
              <Field
                label="Recargo sobre el precio de los platos (%)"
                inputMode="decimal"
                value={form.price_markup_pct}
                onChange={set('price_markup_pct')}
                hint="Se suma al precio de carta que ve y paga el cliente"
              />
            </div>
          </Card>
          <Card title="Pedidos desde la mesa (QR)" icon="qr">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label="Comisión al restaurante en mesa (%)"
                inputMode="decimal"
                value={form.dine_in_commission_pct}
                onChange={set('dine_in_commission_pct')}
                hint="Lo que cobra rabeat al restaurante por cada pedido hecho desde una mesa"
              />
              <Field
                label="Recargo en el precio en mesa (%)"
                inputMode="decimal"
                value={form.dine_in_markup_pct}
                onChange={set('dine_in_markup_pct')}
                hint="Normalmente 0: el cliente paga el precio de carta del local"
              />
            </div>
            <p className="mt-2 text-xs text-neutral-500">Los pedidos en mesa no tienen gastos de envío ni propina para repartidor.</p>
          </Card>
          <Card title="Gastos de envío por distancia" icon="bike">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Tarifa base (€)" inputMode="decimal" value={form.delivery_base_fee} onChange={set('delivery_base_fee')} />
              <Field label="Precio por km (€)" inputMode="decimal" value={form.delivery_fee_per_km} onChange={set('delivery_fee_per_km')} />
              <Field label="Radio máximo (km)" inputMode="decimal" value={form.delivery_max_km} onChange={set('delivery_max_km')} />
            </div>
            <p className="mt-2 text-xs text-neutral-500">Distancia en línea recta entre el restaurante y la dirección del cliente.</p>
          </Card>
          <Card title="Otros" icon="settings">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Propina máxima (€)" inputMode="decimal" value={form.max_tip} onChange={set('max_tip')} />
              <Select label="Zona horaria de los horarios" value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })}>
                <option value="Atlantic/Canary">Canarias</option>
                <option value="Europe/Madrid">Península y Baleares</option>
              </Select>
            </div>
          </Card>
          <Button className="w-full py-4 sm:w-auto sm:px-10" loading={saving} onClick={save}>
            Guardar ajustes
          </Button>
        </div>

        <Card title="Ejemplo" icon="receipt" className="h-fit lg:sticky lg:top-8">
          <p className="mb-3 text-sm text-neutral-500">Plato de 20 € sin IGIC (precio del restaurante), entrega a 3 km:</p>
          <dl className="space-y-1.5 text-sm">
            <Row label="El cliente paga por el plato" value={money(example.subtotal)} />
            <Row label="Envío" value={money(example.delivery_fee)} />
            <Row label="Total cliente" value={money(example.total)} bold />
            <div className="my-2 border-t border-dashed border-neutral-200" />
            <Row label="IGIC incluido" value={money(example.tax_amount)} />
            <Row label="Recibe el restaurante (con su IGIC)" value={money(example.restaurant_payout)} />
            <Row label="Comisión rabeat" value={money(example.commission_amount)} />
            <Row label="Recargo rabeat" value={money(example.markup_amount)} />
            <Row label="Envío sin IGIC (rabeat)" value={money(example.delivery_fee / (1 + (n('igic_pct') || 0) / 100))} />
            <Row
              label="Ingreso neto rabeat"
              value={money(example.total - example.restaurant_payout - (example.tax_amount - example.restaurant_tax))}
              bold
            />
          </dl>
        </Card>
      </div>
    </>
  )
}

function Row({ label, value, bold }) {
  return (
    <div className={`flex justify-between ${bold ? 'font-extrabold' : ''}`}>
      <dt className={bold ? '' : 'text-neutral-500'}>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  )
}
