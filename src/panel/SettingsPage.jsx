import { useEffect, useState } from 'react'
import { Button, Card, Cover, Field, Select, Sheet, SheetHeader, useToast } from '../components/ui.jsx'
import Icon from '../components/Icon.jsx'
import { useSettings } from '../lib/settings.jsx'
import { callFunction, supabase, unwrap } from '../lib/supabase.js'
import { useAuth } from '../lib/auth.jsx'
import { money } from '../lib/format.js'
import { grossPrice, quote, ratesFor } from '../lib/pricing.js'
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
          <CommissionsCard form={form} set={set} settings={settings} />
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


// ---------- Comisiones: generales (domicilio y mesa) y personalizadas por restaurante ----------
const RATE_KEYS = ['commission_pct', 'markup_pct', 'dine_in_commission_pct', 'dine_in_markup_pct']
const RESTAURANT_RATES = 'id, name, slug, active, cover_url, cover_is_logo, cover_bg, ' + RATE_KEYS.join(', ')
const pct = (v) => `${String(Number(v)).replace('.', ',')} %`
const hasOwn = (r) => RATE_KEYS.some((k) => r[k] != null)

// Campo de porcentaje compacto con el símbolo dentro
function PctInput({ label, hint, value, onChange, placeholder }) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-xs font-bold text-neutral-500">{label}</span>
      <span className="flex items-center rounded-2xl bg-white ring-1 ring-neutral-200 transition focus-within:ring-2 focus-within:ring-brand-500">
        <input
          inputMode="decimal"
          value={value ?? ''}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value.replace(/[^\d.,]/g, '').slice(0, 6))}
          className="w-full min-w-0 bg-transparent px-4 py-3 text-lg font-extrabold tabular-nums outline-none placeholder:font-semibold placeholder:text-neutral-300"
        />
        <span className="pr-4 text-sm font-bold text-neutral-400">%</span>
      </span>
      {hint && <span className="mt-1 block text-[11px] leading-snug text-neutral-500">{hint}</span>}
    </label>
  )
}

function RatePanel({ emoji, title, children }) {
  return (
    <div className="rounded-3xl bg-neutral-50 p-4 ring-1 ring-neutral-100">
      <p className="mb-3 flex items-center gap-2 text-sm font-extrabold">
        <span className="grid size-8 place-items-center rounded-xl bg-white text-base shadow-sm">{emoji}</span>
        {title}
      </p>
      <div className="grid grid-cols-2 gap-3">{children}</div>
    </div>
  )
}

function CommissionsCard({ form, set, settings }) {
  const { data: restaurants, reload } = useAsync(
    async () => unwrap(await supabase.from('restaurants').select(RESTAURANT_RATES).order('name')),
    [],
  )
  const [editing, setEditing] = useState(null) // { id } | { id: null } (nuevo)
  const custom = (restaurants ?? []).filter(hasOwn)
  const field = (k) => (v) => set(k)({ target: { value: v } })

  return (
    <Card title="Comisiones" icon="percent">
      <p className="-mt-2 mb-4 text-sm text-neutral-500">
        Generales para todos los restaurantes. La <b>comisión</b> se descuenta de lo que cobra el restaurante; el <b>recargo</b> se suma al precio que paga el
        cliente.
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        <RatePanel emoji="🛵" title="A domicilio">
          <PctInput label="Comisión" value={form.restaurant_commission_pct} onChange={field('restaurant_commission_pct')} />
          <PctInput label="Recargo" value={form.price_markup_pct} onChange={field('price_markup_pct')} />
        </RatePanel>
        <RatePanel emoji="🍽️" title="En mesa (QR)">
          <PctInput label="Comisión" value={form.dine_in_commission_pct} onChange={field('dine_in_commission_pct')} />
          <PctInput label="Recargo" value={form.dine_in_markup_pct} onChange={field('dine_in_markup_pct')} hint="Normalmente 0" />
        </RatePanel>
      </div>

      <div className="mt-5 border-t border-dashed border-neutral-200 pt-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-2 font-extrabold">
              Personalizadas
              {custom.length > 0 && <span className="rounded-full bg-brand-600 px-2 py-0.5 text-[11px] font-bold text-white">{custom.length}</span>}
            </p>
            <p className="text-xs text-neutral-500">Sustituyen a las generales solo en ese restaurante</p>
          </div>
          <button
            onClick={() => setEditing({ id: null })}
            className="flex shrink-0 items-center gap-1.5 rounded-2xl bg-brand-50 px-3.5 py-2.5 text-sm font-extrabold text-brand-700 transition active:scale-95 hover:bg-brand-100"
          >
            <Icon name="plus" className="size-4" /> Añadir
          </button>
        </div>

        {custom.length === 0 ? (
          <button
            onClick={() => setEditing({ id: null })}
            className="flex w-full flex-col items-center gap-1 rounded-3xl border-2 border-dashed border-neutral-200 px-4 py-6 text-center transition hover:border-brand-300 hover:bg-brand-50/40"
          >
            <span className="text-2xl">🏷️</span>
            <span className="text-sm font-bold">Todos usan las comisiones generales</span>
            <span className="text-xs text-neutral-500">Pulsa para dar a un restaurante su propia comisión</span>
          </button>
        ) : (
          <ul className="space-y-2">
            {custom.map((r) => {
              const home = ratesFor(settings, r)
              const table = ratesFor(settings, r, true)
              return (
                <li key={r.id}>
                  <button
                    onClick={() => setEditing({ id: r.id })}
                    className="flex w-full min-w-0 items-center gap-3 rounded-2xl bg-white p-2.5 text-left ring-1 ring-neutral-200 transition hover:ring-brand-300 active:scale-[0.99]"
                  >
                    <Cover restaurant={r} variant="thumb" className="size-11 shrink-0 rounded-xl" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-extrabold">{r.name}</span>
                      <span className="mt-1 flex flex-wrap gap-1">
                        <RateChip emoji="🛵" commission={home.restaurant_commission_pct} markup={home.price_markup_pct} own={r.commission_pct != null || r.markup_pct != null} />
                        <RateChip emoji="🍽️" commission={table.restaurant_commission_pct} markup={table.price_markup_pct} own={r.dine_in_commission_pct != null || r.dine_in_markup_pct != null} />
                      </span>
                    </span>
                    <Icon name="right" className="size-4 shrink-0 text-neutral-300" />
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <CustomRateSheet
        editing={editing}
        restaurants={restaurants ?? []}
        settings={settings}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null)
          reload(true)
        }}
      />
    </Card>
  )
}

function RateChip({ emoji, commission, markup, own }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums ${own ? 'bg-brand-50 text-brand-700' : 'bg-neutral-100 text-neutral-500'}`}>
      {emoji} {pct(commission)} · +{pct(markup)}
    </span>
  )
}

// Modal: elegir restaurante, cargar su comisión y guardarla
function CustomRateSheet({ editing, restaurants, settings, onClose, onSaved }) {
  const toast = useToast()
  const [id, setId] = useState('')
  const [vals, setVals] = useState({})
  const [saving, setSaving] = useState(false)
  const r = restaurants.find((x) => x.id === id)

  // Al abrir (o cambiar de restaurante) se cargan sus valores actuales
  useEffect(() => {
    if (!editing) return
    setId(editing.id ?? '')
  }, [editing])
  useEffect(() => {
    setVals(Object.fromEntries(RATE_KEYS.map((k) => [k, r?.[k] == null ? '' : String(r[k]).replace('.', ',')])))
  }, [r])

  const parsed = Object.fromEntries(RATE_KEYS.map((k) => [k, vals[k]?.trim() ? Number(vals[k].replace(',', '.')) : null]))
  const invalid = Object.values(parsed).some((v) => v != null && !(v >= 0 && v <= 100))
  const preview = ratesFor(settings, { ...r, ...parsed })
  const set = (k) => (v) => setVals((s) => ({ ...s, [k]: v }))

  const save = async (patch) => {
    setSaving(true)
    const { error } = await supabase.from('restaurants').update(patch).eq('id', id)
    setSaving(false)
    if (error) return toast(error.message, 'error')
    toast(Object.values(patch).every((v) => v == null) ? `${r.name} vuelve a las comisiones generales` : `Comisión de ${r.name} guardada`)
    onSaved()
  }

  const isNew = !editing?.id
  const options = restaurants.filter((x) => !isNew || !hasOwn(x) || x.id === id)

  return (
    <Sheet open={!!editing} onClose={onClose} label="Comisión personalizada">
      <SheetHeader title="Comisión personalizada" subtitle={isNew ? 'Elige un restaurante' : r?.name} onClose={onClose} />
      <div className="space-y-4 p-5">
        {isNew ? (
          <Select label="Restaurante" value={id} onChange={(e) => setId(e.target.value)}>
            <option value="">Selecciona un restaurante…</option>
            {options.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
                {hasOwn(x) ? ' (personalizada)' : ''}
              </option>
            ))}
          </Select>
        ) : (
          r && (
            <div className="flex items-center gap-3 rounded-2xl bg-neutral-50 p-3">
              <Cover restaurant={r} variant="thumb" className="size-12 shrink-0 rounded-xl" />
              <p className="min-w-0 truncate font-extrabold">{r.name}</p>
            </div>
          )
        )}

        {r && (
          <>
            <p className="rounded-2xl bg-amber-50 px-3 py-2 text-xs text-amber-900 ring-1 ring-amber-200">
              Deja un campo vacío para usar la general (en gris). Se aplica a los pedidos nuevos.
            </p>
            <RatePanel emoji="🛵" title="A domicilio">
              <PctInput label="Comisión" value={vals.commission_pct} onChange={set('commission_pct')} placeholder={String(settings.restaurant_commission_pct)} />
              <PctInput label="Recargo" value={vals.markup_pct} onChange={set('markup_pct')} placeholder={String(settings.price_markup_pct)} />
            </RatePanel>
            <RatePanel emoji="🍽️" title="En mesa (QR)">
              <PctInput label="Comisión" value={vals.dine_in_commission_pct} onChange={set('dine_in_commission_pct')} placeholder={String(settings.dine_in_commission_pct)} />
              <PctInput label="Recargo" value={vals.dine_in_markup_pct} onChange={set('dine_in_markup_pct')} placeholder={String(settings.dine_in_markup_pct)} />
            </RatePanel>
            <div className="rounded-2xl bg-ink p-4 text-sm text-white">
              <p className="text-xs font-bold tracking-wide text-white/60 uppercase">Ejemplo a domicilio · plato de 10 € sin IGIC</p>
              <div className="mt-2 flex justify-between">
                <span className="text-white/80">El cliente paga</span>
                <b className="tabular-nums">{money(grossPrice(10, preview.price_markup_pct, settings.igic_pct))}</b>
              </div>
              <div className="flex justify-between">
                <span className="text-white/80">rabeat cobra de comisión</span>
                <b className="tabular-nums">{money((10 * preview.restaurant_commission_pct) / 100)}</b>
              </div>
            </div>
            {invalid && <p className="text-sm font-semibold text-brand-600">Los porcentajes deben estar entre 0 y 100.</p>}
          </>
        )}
      </div>
      <div className="sticky bottom-0 flex gap-2 border-t border-neutral-100 bg-white/95 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur">
        {!isNew && r && hasOwn(r) && (
          <Button variant="danger" disabled={saving} onClick={() => save(Object.fromEntries(RATE_KEYS.map((k) => [k, null])))}>
            Quitar
          </Button>
        )}
        <Button className="flex-1 py-3.5" loading={saving} disabled={!r || invalid || (isNew && Object.values(parsed).every((v) => v == null))} onClick={() => save(parsed)}>
          Guardar comisión
        </Button>
      </div>
    </Sheet>
  )
}
