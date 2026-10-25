import { useEffect, useState } from 'react'
import Icon from '../components/Icon.jsx'
import { AddressForm } from '../components/AddressSheet.jsx'
import { Button, Card, Cover, ErrorBox, Field, Loading, SafeImg, Select, Sheet, TextArea, Toggle, useToast } from '../components/ui.jsx'
import { useAuth } from '../lib/auth.jsx'
import { useSettings } from '../lib/settings.jsx'
import { ratesFor } from '../lib/pricing.js'
import { useAsync } from '../lib/useAsync.js'
import { getRestaurant, uploadImage } from '../lib/data.js'
import { callFunction, supabase, unwrap } from '../lib/supabase.js'
import { slugify } from '../lib/format.js'
import { navigate } from '../lib/router.js'
import { CATEGORIES } from '../data/categories.js'
import HoursEditor from './HoursEditor.jsx'
import MenuEditor from './MenuEditor.jsx'
import TablesEditor from './TablesEditor.jsx'

const TABS = [
  { id: 'datos', label: 'Datos', icon: 'store' },
  { id: 'horario', label: 'Horario', icon: 'clock' },
  { id: 'carta', label: 'Carta', icon: 'menu' },
  { id: 'mesas', label: 'Mesas', icon: 'qr' },
]

export default function RestaurantEditor({ id, tab = 'datos' }) {
  const { data: r, error, loading, reload } = useAsync(() => getRestaurant(id, { byId: true }), [id])

  if (loading && !r) return <Loading />
  if (error) return <ErrorBox error={error} onRetry={reload} />
  if (!r)
    return (
      <div className="py-16 text-center">
        <p className="font-bold">Restaurante no encontrado o sin permiso</p>
        <a href="#/panel/restaurantes" className="mt-2 inline-block font-bold text-brand-600">
          Volver
        </a>
      </div>
    )

  return (
    <>
      <div className="mb-4 flex items-center gap-3">
        <a href="#/panel/restaurantes" className="grid size-10 shrink-0 place-items-center rounded-full bg-white ring-1 ring-neutral-200" aria-label="Volver">
          <Icon name="back" />
        </a>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-2xl font-black italic">{r.name}</h1>
          <p className="text-xs text-neutral-500">{r.active ? 'Publicado' : 'Oculto en la app'} · {r.accepting_orders ? 'aceptando pedidos' : 'pedidos en pausa'}</p>
        </div>
        {r.active && (
          <a href={`#/r/${r.slug}`} className="hidden rounded-2xl bg-white px-3 py-2 text-sm font-bold ring-1 ring-neutral-200 sm:block">
            Ver en la app
          </a>
        )}
      </div>
      <div className="mb-5 grid grid-cols-4 gap-1 rounded-2xl bg-white p-1 ring-1 ring-neutral-200">
        {TABS.map((t) => (
          <a
            key={t.id}
            href={`#/panel/restaurantes/${id}/${t.id}`}
            className={`flex items-center justify-center gap-1.5 rounded-xl px-1 py-2 text-[13px] font-bold sm:text-sm ${tab === t.id ? 'bg-ink text-white' : 'text-neutral-500'}`}
          >
            <Icon name={t.icon} className="hidden size-4 sm:block" />
            {t.label}
          </a>
        ))}
      </div>
      {tab === 'horario' ? (
        <HoursEditor restaurant={r} onSaved={reload} />
      ) : tab === 'mesas' ? (
        <TablesEditor restaurant={r} />
      ) : tab === 'carta' ? (
        <MenuEditor restaurant={r} onChange={() => reload(true)} />
      ) : (
        <InfoForm restaurant={r} onSaved={reload} />
      )}
    </>
  )
}

function InfoForm({ restaurant: r, onSaved }) {
  const { profile } = useAuth()
  const toast = useToast()
  const isSuper = profile.role === 'superuser'
  const [form, setForm] = useState(() => pick(r))
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [mapOpen, setMapOpen] = useState(false)
  const { data: owners } = useAsync(
    async () => (isSuper ? unwrap(await supabase.from('profiles').select('id, full_name, email').eq('role', 'restaurant').order('full_name')) : []),
    [isSuper],
  )

  useEffect(() => setForm(pick(r)), [r])
  const set = (k) => (e) => setForm({ ...form, [k]: e?.target ? (e.target.type === 'number' ? e.target.value : e.target.value) : e })

  const save = async () => {
    if (form.active && (form.lat == null || !r.opening_hours.length))
      return toast('Para publicarlo necesita ubicación en el mapa y horario', 'error')
    setSaving(true)
    const patch = {
      ...form,
      slug: slugify(form.slug || form.name),
      min_order: Number(form.min_order) || 0,
      prep_min: Number(form.prep_min) || 0,
      prep_max: Math.max(Number(form.prep_max) || 0, Number(form.prep_min) || 0),
      owner_id: form.owner_id || null,
    }
    if (!isSuper) delete patch.owner_id
    const emails = splitEmails(form.email)
    if (emails.invalid.length) {
      setSaving(false)
      return toast(`Revisa el email de avisos: ${emails.invalid.join(', ')}`, 'error')
    }
    patch.email = emails.valid.join(', ')
    const { error } = await supabase.from('restaurants').update(patch).eq('id', r.id)
    setSaving(false)
    if (error) return toast(error.message.includes('slug') ? 'Esa dirección web ya está en uso' : error.message, 'error')
    toast('Cambios guardados')
    onSaved()
  }

  const upload = async (file) => {
    if (!file) return
    setUploading(true)
    try {
      setForm((f) => ({ ...f, cover_url: '' }))
      const url = await uploadImage(file, profile.id)
      setForm((f) => ({ ...f, cover_url: url }))
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setUploading(false)
    }
  }

  const remove = async () => {
    if (!confirm(`¿Eliminar ${r.name} con su carta y horario? Esta acción no se puede deshacer.`)) return
    const { error } = await supabase.from('restaurants').delete().eq('id', r.id)
    if (error)
      return toast(error.message.includes('foreign key') ? 'Tiene pedidos: ocúltalo en lugar de eliminarlo' : error.message, 'error')
    toast('Restaurante eliminado')
    navigate('/panel/restaurantes')
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
      <div className="space-y-4">
        <Card title="Información" icon="store">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nombre" value={form.name} onChange={set('name')} className="sm:col-span-2" />
            <Select label="Categoría" value={form.category} onChange={set('category')}>
              {CATEGORIES.filter((c) => c.id !== 'all').map((c) => (
                <option key={c.id} value={c.id}>
                  {c.icon} {c.label}
                </option>
              ))}
            </Select>
            <Field label="Tipo de cocina" placeholder="Canaria · Tradicional" value={form.cuisine} onChange={set('cuisine')} />
            <TextArea label="Descripción" rows={3} value={form.description} onChange={set('description')} className="sm:col-span-2" />
            <Field label="Teléfono del local" type="tel" value={form.phone} onChange={set('phone')} />
            <Field label="Dirección web" value={form.slug} onChange={set('slug')} hint={`…/#/r/${slugify(form.slug || form.name)}`} className="sm:col-span-2" />
          </div>
        </Card>

        <OrderEmails restaurant={r} value={form.email} onChange={set('email')} />
        <RatesInfo restaurant={r} isSuper={isSuper} />

        <Card title="Ubicación" icon="pin" action={<Button variant="soft" className="!py-2" onClick={() => setMapOpen(true)}>{form.lat == null ? 'Situar en el mapa' : 'Cambiar'}</Button>}>
          {form.lat == null ? (
            <p className="rounded-2xl bg-brand-50 p-3 text-sm font-semibold text-brand-800">
              Sin ubicación: es necesaria para calcular la distancia y los gastos de envío.
            </p>
          ) : (
            <p className="text-sm">
              <b>{form.address}</b>
              <span className="block text-xs text-neutral-500">
                {form.lat.toFixed(5)}, {form.lng.toFixed(5)}
              </span>
            </p>
          )}
        </Card>

        <Card title="Pedidos" icon="bag">
          <div className="grid grid-cols-3 gap-3">
            <Field label="Pedido mínimo (€)" type="number" min="0" step="0.5" inputMode="decimal" value={form.min_order} onChange={set('min_order')} />
            <Field label="Preparación mín. (min)" type="number" min="0" inputMode="numeric" value={form.prep_min} onChange={set('prep_min')} />
            <Field label="Preparación máx. (min)" type="number" min="0" inputMode="numeric" value={form.prep_max} onChange={set('prep_max')} />
          </div>
          <p className="mt-2 text-xs text-neutral-500">El tiempo de entrega que ve el cliente suma la preparación y el trayecto según la distancia.</p>
        </Card>
      </div>

      <div className="space-y-4">
        <Card title="Foto de portada" icon="image">
          <Cover restaurant={{ ...form, name: form.name }} className="aspect-[16/9] w-full rounded-2xl" />
          <div className="mt-3 flex gap-2">
            <label className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-2xl bg-ink py-3 text-sm font-bold text-white">
              {uploading ? 'Subiendo…' : 'Subir foto'}
              <input type="file" accept="image/*" className="sr-only" onChange={(e) => upload(e.target.files?.[0])} />
            </label>
          </div>
          <Field className="mt-3" placeholder="…o pega la URL de una imagen" value={form.cover_url ?? ''} onChange={set('cover_url')} />
          <div className="mt-4">
            <Toggle
              checked={form.cover_is_logo}
              onChange={set('cover_is_logo')}
              label="La portada es un logo"
              description="Se muestra entera, sin recortar, sobre un color de fondo"
            />
            {form.cover_is_logo && (
              <label className="mt-3 flex items-center gap-3 text-sm font-bold">
                <input type="color" value={form.cover_bg} onChange={set('cover_bg')} className="size-10 cursor-pointer rounded-xl" aria-label="Color de fondo" />
                Color de fondo
              </label>
            )}
          </div>
        </Card>

        <Card title="Visibilidad" icon="eye">
          <div className="space-y-4">
            <Toggle checked={form.active} onChange={set('active')} label="Publicado" description="Visible para los clientes en la app" />
            <Toggle checked={form.accepting_orders} onChange={set('accepting_orders')} label="Aceptando pedidos" description="Desactívalo para pausar los pedidos" />
          </div>
        </Card>

        {isSuper && (
          <Card title="Responsable" icon="user">
            <Select value={form.owner_id ?? ''} onChange={set('owner_id')}>
              <option value="">Sin asignar (lo gestionan los superusuarios)</option>
              {(owners ?? []).map((o) => (
                <option key={o.id} value={o.id}>
                  {o.full_name || o.email}
                </option>
              ))}
            </Select>
            <p className="mt-2 text-xs text-neutral-500">Usuario con rol restaurante que podrá gestionar este local.</p>
          </Card>
        )}

        <Button className="w-full py-4" loading={saving} onClick={save}>
          Guardar cambios
        </Button>
        <Button variant="danger" className="w-full" onClick={remove}>
          <Icon name="trash" className="size-4" /> Eliminar restaurante
        </Button>
      </div>

      <Sheet open={mapOpen} onClose={() => setMapOpen(false)} label="Ubicación del restaurante" wide>
        {mapOpen && (
          <AddressForm
            title="Ubicación del restaurante"
            withDetails={false}
            initial={form.lat != null ? { street: form.address, lat: form.lat, lng: form.lng } : null}
            onCancel={() => setMapOpen(false)}
            onSave={(a) => {
              setForm((f) => ({ ...f, address: a.street, lat: a.lat, lng: a.lng }))
              setMapOpen(false)
            }}
          />
        )}
      </Sheet>
    </div>
  )
}

function pick(r) {
  return {
    name: r.name,
    slug: r.slug,
    category: r.category,
    cuisine: r.cuisine,
    description: r.description,
    phone: r.phone,
    email: r.email,
    cover_url: r.cover_url,
    cover_is_logo: r.cover_is_logo ?? false,
    cover_bg: r.cover_bg ?? '#111111',
    address: r.address,
    lat: r.lat,
    lng: r.lng,
    min_order: r.min_order,
    prep_min: r.prep_min,
    prep_max: r.prep_max,
    active: r.active,
    accepting_orders: r.accepting_orders,
    owner_id: r.owner_id,
  }
}

// «a@x.com, b@y.com» → válidos e inválidos
function splitEmails(text) {
  const parts = String(text ?? '')
    .split(/[\s,;]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
  const ok = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)
  return { valid: [...new Set(parts.filter(ok))], invalid: parts.filter((e) => !ok(e)) }
}

// Emails donde el restaurante recibe los pedidos nuevos, con envío de prueba
function OrderEmails({ restaurant: r, value, onChange }) {
  const toast = useToast()
  const [sending, setSending] = useState(false)
  const unsaved = splitEmails(value).valid.join(', ') !== splitEmails(r.email).valid.join(', ')
  const test = async () => {
    setSending(true)
    try {
      const res = await callFunction('admin-users', { action: 'test_restaurant_email', restaurant_id: r.id })
      toast(`Email de prueba enviado a ${res.to.join(', ')}`)
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setSending(false)
    }
  }
  return (
    <Card title="Avisos de pedidos" icon="mail">
      <Field
        label="Emails donde recibir los pedidos"
        type="text"
        inputMode="email"
        autoComplete="off"
        placeholder="pedidos@turestaurante.com"
        value={value ?? ''}
        onChange={onChange}
        hint="Cada pedido nuevo llega aquí con los datos del cliente. Puedes poner varios separados por comas. Si lo dejas vacío, se usa el email del responsable."
      />
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button variant="soft" className="!py-2" loading={sending} disabled={unsaved || !splitEmails(r.email).valid.length} onClick={test}>
          Enviar email de prueba
        </Button>
        {unsaved && <span className="text-xs font-semibold text-amber-700">Guarda los cambios para poder probarlo</span>}
      </div>
    </Card>
  )
}

// Comisión y recargo que aplica rabeat a este restaurante (los fija el superusuario)
function RatesInfo({ restaurant: r, isSuper }) {
  const { settings } = useSettings()
  const home = ratesFor(settings, r)
  const table = ratesFor(settings, r, true)
  const own = [r.commission_pct, r.markup_pct, r.dine_in_commission_pct, r.dine_in_markup_pct].some((v) => v != null)
  const item = (label, v) => (
    <div className="rounded-2xl bg-neutral-50 p-3">
      <dt className="text-[11px] font-bold text-neutral-500">{label}</dt>
      <dd className="text-lg font-extrabold tabular-nums">{String(v).replace('.', ',')} %</dd>
    </div>
  )
  return (
    <Card
      title="Comisiones de rabeat"
      icon="percent"
      action={isSuper && <a href="#/panel/ajustes" className="text-sm font-bold text-brand-600">Cambiar</a>}
    >
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {item('Comisión a domicilio', home.restaurant_commission_pct)}
        {item('Recargo a domicilio', home.price_markup_pct)}
        {item('Comisión en mesa', table.restaurant_commission_pct)}
        {item('Recargo en mesa', table.price_markup_pct)}
      </dl>
      <p className="mt-2 text-xs text-neutral-500">
        {own ? 'Este restaurante tiene comisiones propias.' : 'Se aplican las comisiones generales de rabeat.'} La comisión se descuenta de tus ventas; el recargo se suma al precio
        que ve el cliente.
      </p>
    </Card>
  )
}
