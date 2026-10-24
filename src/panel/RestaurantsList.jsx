import { useState } from 'react'
import Icon from '../components/Icon.jsx'
import { Button, ErrorBox, Field, Loading, SafeImg, Sheet, SheetHeader, useNow, useRestaurantStatus, useToast } from '../components/ui.jsx'
import { useAuth } from '../lib/auth.jsx'
import { useAsync } from '../lib/useAsync.js'
import { myRestaurants } from '../lib/data.js'
import { supabase, unwrap } from '../lib/supabase.js'
import { slugify } from '../lib/format.js'
import { navigate } from '../lib/router.js'
import { categoryLabel } from '../data/categories.js'
import { PageTitle } from './Panel.jsx'

export default function RestaurantsList() {
  const { profile } = useAuth()
  const { data, error, loading, reload } = useAsync(() => myRestaurants(profile), [profile.id])
  const [creating, setCreating] = useState(false)
  const [query, setQuery] = useState('')
  const list = (data ?? []).filter((r) => r.name.toLowerCase().includes(query.toLowerCase()))

  return (
    <>
      <PageTitle
        subtitle={profile.role === 'superuser' ? 'Todos los restaurantes de la plataforma' : 'Tus locales, horarios y cartas'}
        action={
          <Button onClick={() => setCreating(true)}>
            <Icon name="plus" className="size-4" /> Nuevo restaurante
          </Button>
        }
      >
        Restaurantes
      </PageTitle>
      {data?.length > 6 && <Field placeholder="Buscar restaurante…" value={query} onChange={(e) => setQuery(e.target.value)} className="mb-4" />}
      {loading && !data ? (
        <Loading />
      ) : error ? (
        <ErrorBox error={error} onRetry={reload} />
      ) : list.length === 0 ? (
        <div className="rounded-3xl bg-white p-10 text-center ring-1 ring-neutral-200/70">
          <p className="text-4xl">🏪</p>
          <p className="mt-2 font-bold">Todavía no hay restaurantes</p>
          <Button className="mt-4" onClick={() => setCreating(true)}>
            Dar de alta el primero
          </Button>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((r) => (
            <Row key={r.id} restaurant={r} />
          ))}
        </div>
      )}
      <Sheet open={creating} onClose={() => setCreating(false)} label="Nuevo restaurante">
        {creating && <CreateForm onClose={() => setCreating(false)} />}
      </Sheet>
    </>
  )
}

function Row({ restaurant: r }) {
  const now = useNow()
  const status = useRestaurantStatus(r, now)
  return (
    <a href={`#/panel/restaurantes/${r.id}`} className="flex gap-3 rounded-3xl bg-white p-3 ring-1 ring-neutral-200/70 transition hover:shadow-lg">
      <SafeImg src={r.cover_url} alt="" className="size-20 shrink-0 rounded-2xl" />
      <div className="min-w-0 flex-1 py-0.5">
        <p className="truncate font-extrabold">{r.name}</p>
        <p className="truncate text-xs text-neutral-500">{categoryLabel(r.category)} · {r.address || 'Sin dirección'}</p>
        <div className="mt-2 flex flex-wrap gap-1">
          {!r.active && <span className="rounded-full bg-neutral-200 px-2 py-0.5 text-[11px] font-bold text-neutral-600">Oculto</span>}
          {!r.accepting_orders && <span className="rounded-full bg-neutral-900 px-2 py-0.5 text-[11px] font-bold text-white">En pausa</span>}
          {r.lat == null && <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-bold text-brand-700">Falta ubicación</span>}
          {!r.opening_hours.length && <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-bold text-brand-700">Sin horario</span>}
          {r.active && r.opening_hours.length > 0 && (
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${status.open ? 'bg-emerald-50 text-emerald-700' : 'bg-neutral-100 text-neutral-600'}`}>
              {status.open ? 'Abierto' : 'Cerrado'}
            </span>
          )}
        </div>
      </div>
      <Icon name="right" className="size-5 self-center text-neutral-300" />
    </a>
  )
}

function CreateForm({ onClose }) {
  const { profile } = useAuth()
  const toast = useToast()
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)

  const create = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const base = slugify(name) || 'restaurante'
      let slug = base
      for (let i = 2; ; i++) {
        const { data } = await supabase.from('restaurants').select('id').eq('slug', slug).maybeSingle()
        if (!data) break
        slug = `${base}-${i}`
      }
      const r = unwrap(
        await supabase
          .from('restaurants')
          .insert({ name: name.trim(), slug, owner_id: profile.role === 'restaurant' ? profile.id : null, active: false })
          .select()
          .single(),
      )
      toast('Restaurante creado. Completa sus datos, horario y carta.')
      onClose()
      navigate(`/panel/restaurantes/${r.id}`)
    } catch (err) {
      toast(err.message, 'error')
      setSaving(false)
    }
  }

  return (
    <form onSubmit={create}>
      <SheetHeader title="Nuevo restaurante" subtitle="Empezará oculto hasta que lo publiques" onClose={onClose} />
      <div className="space-y-3 p-5">
        <Field label="Nombre del restaurante" required autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej.: Guachinche El Conejo" />
        <p className="text-xs text-neutral-500">Dirección web: …/#/r/{slugify(name) || 'nombre'}</p>
      </div>
      <div className="flex gap-3 border-t border-neutral-100 p-4">
        <Button type="button" variant="soft" className="flex-1" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" className="flex-[2]" loading={saving} disabled={name.trim().length < 2}>
          Crear y configurar
        </Button>
      </div>
    </form>
  )
}
