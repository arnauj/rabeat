import { useEffect, useMemo, useState } from 'react'
import { Button, Card, Field, Select, useToast } from '../components/ui.jsx'
import { useSettings } from '../lib/settings.jsx'
import { callFunction, supabase, unwrap } from '../lib/supabase.js'
import { useAuth } from '../lib/auth.jsx'
import { money } from '../lib/format.js'
import { quote } from '../lib/pricing.js'
import { useAsync } from '../lib/useAsync.js'
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
          <Card title="Comisiones generales (a domicilio)" icon="percent">
            <p className="-mt-2 mb-3 text-xs text-neutral-500">Se aplican a los restaurantes que no tienen comisión propia (más abajo).</p>
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
          <Card title="Comisiones generales en mesa (QR)" icon="qr">
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
          <RestaurantRates settings={settings} />
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
          <EmailTest />
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

// Envía un email de prueba con la configuración SMTP actual del servidor
function EmailTest() {
  const { profile } = useAuth()
  const { config } = useSettings()
  const toast = useToast()
  const [to, setTo] = useState(profile?.email ?? '')
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState(null)
  const send = async () => {
    setSending(true)
    setResult(null)
    try {
      const res = await callFunction('admin-users', { action: 'test_email', to })
      setResult({ ok: true, text: `Enviado a ${res.to}. Revisa la bandeja de entrada (y el spam).` })
      toast('Email de prueba enviado')
    } catch (e) {
      setResult({ ok: false, text: e.message })
    } finally {
      setSending(false)
    }
  }
  return (
    <Card title="Emails" icon="chat">
      <p className="mb-3 text-sm text-neutral-500">
        Estado: <b>{config?.email ? 'configurado' : 'sin configurar (no se envían emails)'}</b>
      </p>
      <div className="flex gap-2">
        <Field className="flex-1" type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="tu@email.com" />
        <Button variant="dark" loading={sending} onClick={send} disabled={!to}>
          Probar
        </Button>
      </div>
      {result && <p className={`mt-2 text-sm font-semibold ${result.ok ? 'text-emerald-700' : 'text-brand-600'}`}>{result.text}</p>}
    </Card>
  )
}

const RATE_FIELDS = [
  ['commission_pct', 'Comisión', 'restaurant_commission_pct'],
  ['markup_pct', 'Recargo', 'price_markup_pct'],
  ['dine_in_commission_pct', 'Comisión mesa', 'dine_in_commission_pct'],
  ['dine_in_markup_pct', 'Recargo mesa', 'dine_in_markup_pct'],
]

// Comisión y recargo propios de cada restaurante; vacío = el valor general
function RestaurantRates({ settings }) {
  const toast = useToast()
  const [query, setQuery] = useState('')
  const [edits, setEdits] = useState({})
  const [saving, setSaving] = useState(false)
  const { data: restaurants, reload } = useAsync(
    async () => unwrap(await supabase.from('restaurants').select('id, name, active, ' + RATE_FIELDS.map(([k]) => k).join(', ')).order('name')),
    [],
  )
  const value = (r, k) => (edits[r.id]?.[k] !== undefined ? edits[r.id][k] : r[k] == null ? '' : String(r[k]))
  const set = (r, k, v) => setEdits((e) => ({ ...e, [r.id]: { ...e[r.id], [k]: v.replace(/[^\d.,]/g, '').slice(0, 6) } }))
  const custom = (r) => RATE_FIELDS.some(([k]) => value(r, k) !== '')
  const list = useMemo(
    () => (restaurants ?? []).filter((r) => r.name.toLowerCase().includes(query.trim().toLowerCase())),
    [restaurants, query],
  )
  const changed = Object.keys(edits).length > 0

  const save = async () => {
    const rows = Object.entries(edits).map(([id, patch]) => [
      id,
      Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, v.trim() === '' ? null : Number(v.replace(',', '.'))])),
    ])
    if (rows.some(([, p]) => Object.values(p).some((v) => v !== null && !(v >= 0 && v <= 100))))
      return toast('Los porcentajes deben estar entre 0 y 100', 'error')
    setSaving(true)
    for (const [id, patch] of rows) {
      const { error } = await supabase.from('restaurants').update(patch).eq('id', id)
      if (error) {
        setSaving(false)
        return toast(error.message, 'error')
      }
    }
    setSaving(false)
    setEdits({})
    reload(true)
    toast('Comisiones de los restaurantes guardadas: se aplican a los nuevos pedidos')
  }

  return (
    <Card title="Comisiones por restaurante" icon="store">
      <p className="-mt-2 mb-3 text-xs text-neutral-500">
        Deja un campo vacío para usar el valor general (se muestra en gris). Lo que pongas aquí sustituye al general solo para ese restaurante.
      </p>
      {restaurants?.length > 6 && <Field placeholder="Buscar restaurante…" value={query} onChange={(e) => setQuery(e.target.value)} className="mb-3" />}
      <div className="space-y-2">
        {list.map((r) => (
          <div key={r.id} className={`rounded-2xl p-3 ring-1 ${custom(r) ? 'bg-brand-50/50 ring-brand-200' : 'ring-neutral-200'}`}>
            <p className="mb-2 flex items-center gap-2 text-sm font-extrabold">
              {r.name}
              {custom(r) && <span className="rounded-full bg-brand-600 px-2 py-0.5 text-[10px] font-bold text-white">Propia</span>}
              {!r.active && <span className="text-[11px] font-semibold text-neutral-400">oculto</span>}
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {RATE_FIELDS.map(([k, label, general]) => (
                <label key={k} className="block">
                  <span className="mb-1 block text-[11px] font-bold text-neutral-500">{label} %</span>
                  <input
                    inputMode="decimal"
                    value={value(r, k)}
                    placeholder={String(settings[general] ?? 0)}
                    onChange={(e) => set(r, k, e.target.value)}
                    className="w-full rounded-xl bg-neutral-100 px-3 py-2 text-base font-semibold outline-none placeholder:font-normal placeholder:text-neutral-400 focus:ring-2 focus:ring-brand-600"
                    aria-label={`${label} de ${r.name}`}
                  />
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
      {changed && (
        <div className="mt-3 flex gap-2">
          <Button loading={saving} onClick={save}>
            Guardar comisiones
          </Button>
          <Button variant="soft" disabled={saving} onClick={() => setEdits({})}>
            Descartar
          </Button>
        </div>
      )}
    </Card>
  )
}
