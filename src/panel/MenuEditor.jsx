import { useState } from 'react'
import Icon from '../components/Icon.jsx'
import { AllergenChips, Button, Field, SafeImg, Select, Sheet, SheetHeader, TextArea, Toggle, useToast } from '../components/ui.jsx'
import { useAuth } from '../lib/auth.jsx'
import { useSettings } from '../lib/settings.jsx'
import { uploadImage } from '../lib/data.js'
import { supabase } from '../lib/supabase.js'
import { money } from '../lib/format.js'
import { grossPrice, ratesFor } from '../lib/pricing.js'
import { ALLERGENS, ALLERGEN_KEYS } from '../data/allergens.js'
import { DISH_TAGS } from '../data/categories.js'

// Carta por categorías: alta, orden, precios, alérgenos y disponibilidad
export default function MenuEditor({ restaurant: r, onChange }) {
  const toast = useToast()
  const { settings: general } = useSettings()
  const settings = ratesFor(general, r)
  const [editing, setEditing] = useState(null) // plato (o {} para nuevo)
  const [newCategory, setNewCategory] = useState('')

  const run = async (promise, ok) => {
    const { error } = await promise
    if (error) return toast(error.message, 'error'), false
    if (ok) toast(ok)
    onChange()
    return true
  }

  const addCategory = async (e) => {
    e.preventDefault()
    if (!newCategory.trim()) return
    if (await run(supabase.from('menu_categories').insert({ restaurant_id: r.id, name: newCategory.trim(), position: r.menu.length }), 'Categoría creada'))
      setNewCategory('')
  }

  const renameCategory = (c) => {
    const name = prompt('Nuevo nombre de la categoría', c.name)
    if (name?.trim()) run(supabase.from('menu_categories').update({ name: name.trim() }).eq('id', c.id), 'Categoría renombrada')
  }

  const deleteCategory = (c) => {
    if (confirm(`¿Eliminar «${c.name}» y sus ${c.dishes.length} platos?`)) run(supabase.from('menu_categories').delete().eq('id', c.id), 'Categoría eliminada')
  }

  // Intercambia la posición con la vecina y normaliza el orden
  const moveCategory = async (index, dir) => {
    const list = [...r.menu]
    const j = index + dir
    if (j < 0 || j >= list.length) return
    ;[list[index], list[j]] = [list[j], list[index]]
    await Promise.all(list.map((c, i) => supabase.from('menu_categories').update({ position: i }).eq('id', c.id)))
    onChange()
  }

  const moveDish = async (cat, index, dir) => {
    const list = [...cat.dishes]
    const j = index + dir
    if (j < 0 || j >= list.length) return
    ;[list[index], list[j]] = [list[j], list[index]]
    await Promise.all(list.map((d, i) => supabase.from('dishes').update({ position: i }).eq('id', d.id)))
    onChange()
  }

  return (
    <div className="space-y-4">
      <div className="rounded-3xl bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-200">
        Pon <b>tu precio sin IGIC</b>: la app lo muestra al cliente con el IGIC ({settings.igic_pct}% general) y el recargo de la plataforma
        ({settings.price_markup_pct}%). Tus ventas y liquidaciones se calculan sobre tu precio, y el IGIC de tu comida se te abona para que lo declares.
      </div>

      {r.menu.map((c, ci) => (
        <section key={c.id} className="rounded-3xl bg-white ring-1 ring-neutral-200/70">
          <header className="flex items-center gap-2 border-b border-neutral-100 p-3 pl-4">
            <h3 className="min-w-0 flex-1 truncate text-lg font-extrabold">{c.name}</h3>
            <span className="text-xs text-neutral-400">{c.dishes.length} platos</span>
            <IconBtn icon="up" label="Subir categoría" onClick={() => moveCategory(ci, -1)} disabled={ci === 0} />
            <IconBtn icon="down" label="Bajar categoría" onClick={() => moveCategory(ci, 1)} disabled={ci === r.menu.length - 1} />
            <IconBtn icon="edit" label="Renombrar" onClick={() => renameCategory(c)} />
            <IconBtn icon="trash" label="Eliminar categoría" onClick={() => deleteCategory(c)} />
          </header>
          <ul className="divide-y divide-neutral-100">
            {c.dishes.map((d, di) => (
              <li key={d.id} className="flex items-center gap-3 p-3">
                <button onClick={() => setEditing(d)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                  <SafeImg src={d.image_url} alt="" className={`size-14 shrink-0 rounded-xl ${d.available ? '' : 'opacity-40 grayscale'}`} />
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate font-bold ${d.available ? '' : 'text-neutral-400 line-through'}`}>
                      {d.code && <span className="text-neutral-400">{d.code}. </span>}
                      {d.name}
                    </span>
                    <span className="block text-xs text-neutral-500">
                      {money(d.price)} sin IGIC{' '}
                      <span className="text-neutral-400">
                        → cliente {money(grossPrice(d.price, settings.price_markup_pct, d.tax_pct ?? settings.igic_pct))}
                      </span>
                      {d.groups?.length > 0 && <span className="text-violet-600"> · {d.groups.length} grupos de opciones</span>}
                    </span>
                    <span className="mt-1 block">
                      <AllergenChips allergens={d.allergens} />
                    </span>
                  </span>
                </button>
                <div className="flex shrink-0 flex-col">
                  <IconBtn icon="up" label="Subir plato" onClick={() => moveDish(c, di, -1)} disabled={di === 0} />
                  <IconBtn icon="down" label="Bajar plato" onClick={() => moveDish(c, di, 1)} disabled={di === c.dishes.length - 1} />
                </div>
                <Toggle
                  checked={d.available}
                  onChange={(v) => run(supabase.from('dishes').update({ available: v }).eq('id', d.id), v ? 'Plato disponible' : 'Plato agotado')}
                  label={<span className="sr-only">Disponible</span>}
                />
              </li>
            ))}
          </ul>
          <button onClick={() => setEditing({ category_id: c.id })} className="flex w-full items-center justify-center gap-2 rounded-b-3xl py-3 text-sm font-bold text-brand-600 hover:bg-brand-50">
            <Icon name="plus" className="size-4" /> Añadir plato a {c.name}
          </button>
        </section>
      ))}

      <form onSubmit={addCategory} className="flex gap-2 rounded-3xl bg-white p-3 ring-1 ring-neutral-200/70">
        <Field className="flex-1" placeholder="Nueva categoría (Entrantes, Postres…)" value={newCategory} onChange={(e) => setNewCategory(e.target.value)} />
        <Button type="submit" variant="dark" disabled={!newCategory.trim()}>
          Añadir
        </Button>
      </form>

      <Sheet open={!!editing} onClose={() => setEditing(null)} label="Plato" wide>
        {editing && (
          <DishForm
            dish={editing}
            restaurant={r}
            onClose={() => setEditing(null)}
            onSaved={() => {
              setEditing(null)
              onChange()
            }}
          />
        )}
      </Sheet>
    </div>
  )
}

function IconBtn({ icon, label, onClick, disabled }) {
  return (
    <button onClick={onClick} disabled={disabled} className="grid size-8 place-items-center rounded-full text-neutral-500 hover:bg-neutral-100 disabled:opacity-25" aria-label={label} title={label}>
      <Icon name={icon} className="size-4" />
    </button>
  )
}

function DishForm({ dish, restaurant: r, onClose, onSaved }) {
  const toast = useToast()
  const { profile } = useAuth()
  const { settings: general } = useSettings()
  const settings = ratesFor(general, r)
  const isNew = !dish.id
  const [form, setForm] = useState({
    name: dish.name ?? '',
    description: dish.description ?? '',
    price: dish.price ?? '',
    category_id: dish.category_id,
    image_url: dish.image_url ?? '',
    allergens: dish.allergens ?? [],
    tags: dish.tags ?? [],
    kcal: dish.kcal ?? '',
    portion: dish.portion ?? '',
    prep_minutes: dish.prep_minutes ?? '',
    available: dish.available ?? true,
    code: dish.code ?? '',
    name_en: dish.name_en ?? '',
    description_en: dish.description_en ?? '',
    tax_pct: dish.tax_pct ?? '',
  })
  const [schedule, setSchedule] = useState(() => fromSchedule(dish.schedule))
  const [groups, setGroups] = useState(() =>
    (dish.groups ?? []).map((g) => ({ ...g, free_select: g.free_select ?? '', options: g.options.map((o) => ({ ...o })) })),
  )
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const set = (k) => (e) => setForm({ ...form, [k]: e?.target ? e.target.value : e })
  const toggleIn = (k, v) => setForm((f) => ({ ...f, [k]: f[k].includes(v) ? f[k].filter((x) => x !== v) : [...f[k], v] }))
  const price = Number(String(form.price).replace(',', '.'))

  const save = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) return toast('Pon un nombre al plato', 'error')
    if (!(price >= 0)) return toast('Precio no válido', 'error')
    setSaving(true)
    const row = {
      ...form,
      name: form.name.trim(),
      price,
      kcal: form.kcal === '' ? null : Number(form.kcal),
      prep_minutes: form.prep_minutes === '' ? null : Number(form.prep_minutes),
      image_url: form.image_url || null,
      tax_pct: form.tax_pct === '' ? null : Number(form.tax_pct),
      schedule: toSchedule(schedule),
      restaurant_id: r.id,
    }
    const problem = groups.flatMap((g) => [
      !g.name.trim() && 'Pon nombre a todos los grupos de opciones',
      !g.options.length && `El grupo «${g.name}» no tiene opciones`,
      Number(g.max_select) < Number(g.min_select) && `En «${g.name}» el máximo es menor que el mínimo`,
      g.options.some((o) => !o.name.trim()) && `Hay opciones sin nombre en «${g.name}»`,
    ]).find(Boolean)
    if (problem) {
      setSaving(false)
      return toast(problem, 'error')
    }
    const id = dish.id ?? crypto.randomUUID()
    const { error } = isNew
      ? await supabase.from('dishes').insert({ ...row, id, position: r.menu.find((c) => c.id === form.category_id)?.dishes.length ?? 0 })
      : await supabase.from('dishes').update(row).eq('id', dish.id)
    if (!error) {
      const optError = await saveGroups(id, r.id, dish.groups ?? [], groups)
      if (optError) {
        setSaving(false)
        return toast(optError.message, 'error')
      }
    }
    setSaving(false)
    if (error) return toast(error.message, 'error')
    toast(isNew ? 'Plato añadido' : 'Plato guardado')
    onSaved()
  }

  const remove = async () => {
    if (!confirm(`¿Eliminar «${dish.name}»?`)) return
    const { error } = await supabase.from('dishes').delete().eq('id', dish.id)
    if (error) return toast(error.message, 'error')
    toast('Plato eliminado')
    onSaved()
  }

  const upload = async (file) => {
    if (!file) return
    setUploading(true)
    try {
      const url = await uploadImage(file, profile.id)
      setForm((f) => ({ ...f, image_url: url }))
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setUploading(false)
    }
  }

  return (
    <form onSubmit={save}>
      <SheetHeader title={isNew ? 'Nuevo plato' : 'Editar plato'} subtitle={r.name} onClose={onClose} />
      <div className="space-y-4 p-5">
        <div className="flex gap-3">
          <SafeImg src={form.image_url} alt="" className="size-24 shrink-0 rounded-2xl" />
          <div className="flex-1 space-y-2">
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-2xl bg-ink py-2.5 text-sm font-bold text-white">
              <Icon name="image" className="size-4" /> {uploading ? 'Subiendo…' : 'Subir foto'}
              <input type="file" accept="image/*" className="sr-only" onChange={(e) => upload(e.target.files?.[0])} />
            </label>
            <Field placeholder="…o URL de la imagen" value={form.image_url} onChange={set('image_url')} />
          </div>
        </div>
        <div className="grid grid-cols-[90px_1fr] gap-3">
          <Field label="Nº carta" placeholder="26-A" value={form.code} onChange={set('code')} />
          <Field label="Nombre" required value={form.name} onChange={set('name')} />
        </div>
        <Field label="Nombre en inglés (opcional)" value={form.name_en} onChange={set('name_en')} />
        <TextArea label="Descripción" rows={3} value={form.description} onChange={set('description')} />
        <TextArea label="Descripción en inglés (opcional)" rows={2} value={form.description_en} onChange={set('description_en')} />
        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Tu precio sin IGIC (€)"
            inputMode="decimal"
            required
            value={form.price}
            onChange={set('price')}
            hint={
              price >= 0
                ? `El cliente verá ${money(grossPrice(price, settings.price_markup_pct, form.tax_pct === '' ? settings.igic_pct : Number(form.tax_pct)))} (IGIC incl.)`
                : ''
            }
          />
          <Select label="IGIC" value={form.tax_pct} onChange={set('tax_pct')}>
            <option value="">General ({settings.igic_pct} %)</option>
            {[0, 3, 7, 9.5, 15, 20].map((t) => (
              <option key={t} value={t}>
                {String(t).replace('.', ',')} %
              </option>
            ))}
          </Select>
          <Select label="Categoría" value={form.category_id} onChange={set('category_id')}>
            {r.menu.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          <Field label="Ración" placeholder="1 persona, 250 g…" value={form.portion} onChange={set('portion')} />
          <Field label="Calorías (kcal)" type="number" min="0" inputMode="numeric" value={form.kcal} onChange={set('kcal')} />
          <Field label="Preparación (min)" type="number" min="0" inputMode="numeric" value={form.prep_minutes} onChange={set('prep_minutes')} />
          <div className="flex items-end pb-2">
            <Toggle checked={form.available} onChange={set('available')} label="Disponible" />
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-bold text-neutral-500">Alérgenos (Reglamento UE 1169/2011)</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {ALLERGEN_KEYS.map((k) => {
              const on = form.allergens.includes(k)
              return (
                <button
                  type="button"
                  key={k}
                  onClick={() => toggleIn('allergens', k)}
                  aria-pressed={on}
                  className={`flex items-center gap-2 rounded-2xl px-3 py-2 text-left text-sm font-semibold ring-1 transition ${on ? 'bg-amber-50 text-amber-900 ring-2 ring-amber-400' : 'bg-white ring-neutral-200'}`}
                >
                  <span>{ALLERGENS[k].icon}</span>
                  {ALLERGENS[k].name}
                </button>
              )
            })}
          </div>
          {!form.allergens.length && <p className="mt-2 text-xs text-emerald-700">Sin alérgenos marcados: se mostrará «Sin alérgenos declarados».</p>}
        </div>

        <ScheduleEditor value={schedule} onChange={setSchedule} />
        <OptionGroupsEditor groups={groups} onChange={setGroups} priceOf={(b) => grossPrice(b, settings.price_markup_pct, form.tax_pct === '' ? settings.igic_pct : Number(form.tax_pct))} />

        <div>
          <p className="mb-2 text-xs font-bold text-neutral-500">Etiquetas</p>
          <div className="flex flex-wrap gap-2">
            {DISH_TAGS.map((t) => {
              const on = form.tags.includes(t.id)
              return (
                <button type="button" key={t.id} onClick={() => toggleIn('tags', t.id)} aria-pressed={on} className={`rounded-full px-3 py-1.5 text-sm font-bold ring-1 ${on ? `${t.cls} ring-current` : 'bg-white ring-neutral-200'}`}>
                  {t.label}
                </button>
              )
            })}
          </div>
        </div>
      </div>
      <div className="sticky bottom-0 flex gap-3 border-t border-neutral-100 bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {!isNew && (
          <Button type="button" variant="danger" onClick={remove} aria-label="Eliminar plato">
            <Icon name="trash" className="size-4" />
          </Button>
        )}
        <Button type="button" variant="soft" className="flex-1" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" className="flex-[2]" loading={saving}>
          {isNew ? 'Añadir plato' : 'Guardar'}
        </Button>
      </div>
    </form>
  )
}

// ---------- Horario propio del plato (p. ej. menú del día solo a mediodía) ----------
const WEEK = [1, 2, 3, 4, 5, 6, 0]
const DAY_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

function fromSchedule(schedule) {
  if (!Array.isArray(schedule) || !schedule.length) return { enabled: false, days: [1, 2, 3, 4, 5], opens: '12:00', closes: '16:00' }
  return {
    enabled: true,
    days: [...new Set(schedule.map((s) => Number(s.weekday)))],
    opens: String(schedule[0].opens).slice(0, 5),
    closes: String(schedule[0].closes).slice(0, 5),
  }
}

const toSchedule = (s) => (s.enabled && s.days.length ? s.days.map((weekday) => ({ weekday, opens: s.opens, closes: s.closes })) : null)

function ScheduleEditor({ value: s, onChange }) {
  return (
    <div className="rounded-2xl bg-neutral-50 p-3">
      <Toggle
        checked={s.enabled}
        onChange={(enabled) => onChange({ ...s, enabled })}
        label="Solo en algunos días u horas"
        description="Por ejemplo, un menú del día que solo se sirve a mediodía"
      />
      {s.enabled && (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap gap-1">
            {WEEK.map((d) => {
              const on = s.days.includes(d)
              return (
                <button
                  type="button"
                  key={d}
                  aria-pressed={on}
                  onClick={() => onChange({ ...s, days: on ? s.days.filter((x) => x !== d) : [...s.days, d] })}
                  className={`rounded-full px-3 py-1.5 text-xs font-bold ${on ? 'bg-ink text-white' : 'bg-white ring-1 ring-neutral-200'}`}
                >
                  {DAY_SHORT[d]}
                </button>
              )
            })}
          </div>
          <div className="flex items-center gap-2 text-sm">
            <input type="time" value={s.opens} onChange={(e) => onChange({ ...s, opens: e.target.value })} className="rounded-xl bg-white px-3 py-2 font-bold ring-1 ring-neutral-200" aria-label="Desde" />
            –
            <input type="time" value={s.closes} onChange={(e) => onChange({ ...s, closes: e.target.value })} className="rounded-xl bg-white px-3 py-2 font-bold ring-1 ring-neutral-200" aria-label="Hasta" />
          </div>
        </div>
      )}
    </div>
  )
}

// ---------- Grupos de opciones (menús, tamaños, extras) ----------
const newOption = () => ({ id: crypto.randomUUID(), name: '', price_delta: 0, allergens: [], available: true, _new: true })
const newGroup = () => ({ id: crypto.randomUUID(), name: '', min_select: 1, max_select: 1, free_select: '', extra_price: 0, options: [newOption()], _new: true })

function OptionGroupsEditor({ groups, onChange, priceOf }) {
  const update = (i, patch) => onChange(groups.map((g, j) => (j === i ? { ...g, ...patch } : g)))
  const updateOpt = (i, k, patch) => update(i, { options: groups[i].options.map((o, j) => (j === k ? { ...o, ...patch } : o)) })
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-bold text-neutral-500">Opciones para elegir (menús, tamaños, extras)</p>
        <button type="button" onClick={() => onChange([...groups, newGroup()])} className="text-sm font-bold text-brand-600">
          + Añadir grupo
        </button>
      </div>
      {!groups.length && <p className="text-xs text-neutral-400">Sin opciones: el plato se pide tal cual.</p>}
      <div className="space-y-3">
        {groups.map((g, i) => (
          <div key={g.id} className="rounded-2xl p-3 ring-1 ring-neutral-200">
            <div className="flex gap-2">
              <Field className="flex-1" placeholder="Nombre del grupo: Primer plato, Tamaño, Proteína…" value={g.name} onChange={(e) => update(i, { name: e.target.value })} />
              <button type="button" onClick={() => onChange(groups.filter((_, j) => j !== i))} className="grid size-11 place-items-center rounded-2xl text-neutral-400 hover:bg-neutral-100 hover:text-brand-600" aria-label="Quitar grupo">
                <Icon name="trash" className="size-4" />
              </button>
            </div>
            <div className="mt-2 grid grid-cols-4 gap-2">
              <NumberField label="Mínimo" value={g.min_select} onChange={(v) => update(i, { min_select: v })} />
              <NumberField label="Máximo" value={g.max_select} onChange={(v) => update(i, { max_select: v })} />
              <NumberField label="Incluidas" value={g.free_select} placeholder="todas" onChange={(v) => update(i, { free_select: v })} />
              <NumberField label="Extra €" decimal value={g.extra_price} onChange={(v) => update(i, { extra_price: v })} />
            </div>
            <p className="mt-1 text-[11px] text-neutral-400">
              «Incluidas»: cuántas entran en el precio; cada una de más cuesta «Extra» (sin IGIC). Déjalo vacío si todas están incluidas.
            </p>
            <ul className="mt-2 space-y-2">
              {g.options.map((o, k) => (
                <li key={o.id} className="rounded-xl bg-neutral-50 p-2">
                  <div className="flex items-center gap-2">
                    <input
                      value={o.name}
                      onChange={(e) => updateOpt(i, k, { name: e.target.value })}
                      placeholder="Opción"
                      className="min-w-0 flex-1 rounded-lg bg-white px-3 py-2 text-sm font-semibold ring-1 ring-neutral-200 outline-none focus:ring-2 focus:ring-brand-500"
                      aria-label="Nombre de la opción"
                    />
                    <input
                      value={o.price_delta}
                      inputMode="decimal"
                      onChange={(e) => updateOpt(i, k, { price_delta: e.target.value })}
                      className="w-16 rounded-lg bg-white px-2 py-2 text-right text-sm ring-1 ring-neutral-200 outline-none focus:ring-2 focus:ring-brand-500"
                      aria-label="Suplemento sin IGIC"
                      title="Suplemento sin IGIC"
                    />
                    <button type="button" onClick={() => update(i, { options: g.options.filter((_, j) => j !== k) })} className="grid size-8 place-items-center text-neutral-400 hover:text-brand-600" aria-label="Quitar opción">
                      <Icon name="x" className="size-4" />
                    </button>
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {ALLERGEN_KEYS.map((a) => {
                      const on = o.allergens.includes(a)
                      return (
                        <button
                          type="button"
                          key={a}
                          title={ALLERGENS[a].name}
                          aria-pressed={on}
                          onClick={() => updateOpt(i, k, { allergens: on ? o.allergens.filter((x) => x !== a) : [...o.allergens, a] })}
                          className={`grid size-7 place-items-center rounded-full text-xs ${on ? 'bg-amber-100 ring-2 ring-amber-400' : 'opacity-30 grayscale'}`}
                        >
                          {ALLERGENS[a].icon}
                        </button>
                      )
                    })}
                    {Number(o.price_delta) > 0 && <span className="ml-auto self-center text-[11px] text-neutral-400">cliente +{money(priceOf(Number(o.price_delta)))}</span>}
                  </div>
                </li>
              ))}
            </ul>
            <button type="button" onClick={() => update(i, { options: [...g.options, newOption()] })} className="mt-2 text-xs font-bold text-brand-600">
              + Añadir opción
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

function NumberField({ label, value, onChange, placeholder, decimal }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-bold text-neutral-500">{label}</span>
      <input
        value={value}
        placeholder={placeholder}
        inputMode={decimal ? 'decimal' : 'numeric'}
        onChange={(e) => onChange(e.target.value.replace(decimal ? /[^\d.,]/g : /\D/g, ''))}
        className="w-full rounded-xl bg-neutral-100 px-3 py-2 text-sm font-bold outline-none focus:bg-white focus:ring-2 focus:ring-brand-500"
      />
    </label>
  )
}

// Guarda grupos y opciones conservando sus ids (las cestas abiertas siguen siendo válidas)
async function saveGroups(dishId, restaurantId, before, after) {
  const num = (v) => Number(String(v).replace(',', '.')) || 0
  const keepGroups = new Set(after.map((g) => g.id))
  const keepOptions = new Set(after.flatMap((g) => g.options.map((o) => o.id)))
  const goneOptions = before.flatMap((g) => g.options).filter((o) => !keepOptions.has(o.id)).map((o) => o.id)
  const goneGroups = before.filter((g) => !keepGroups.has(g.id)).map((g) => g.id)
  if (goneOptions.length) {
    const { error } = await supabase.from('dish_options').delete().in('id', goneOptions)
    if (error) return error
  }
  if (goneGroups.length) {
    const { error } = await supabase.from('dish_option_groups').delete().in('id', goneGroups)
    if (error) return error
  }
  if (!after.length) return null
  const { error: ge } = await supabase.from('dish_option_groups').upsert(
    after.map((g, i) => ({
      id: g.id,
      restaurant_id: restaurantId,
      dish_id: dishId,
      name: g.name.trim(),
      min_select: num(g.min_select),
      max_select: Math.max(1, num(g.max_select)),
      free_select: g.free_select === '' || g.free_select == null ? null : num(g.free_select),
      extra_price: num(g.extra_price),
      position: i,
    })),
  )
  if (ge) return ge
  const { error: oe } = await supabase.from('dish_options').upsert(
    after.flatMap((g) =>
      g.options.map((o, k) => ({
        id: o.id,
        restaurant_id: restaurantId,
        group_id: g.id,
        name: o.name.trim(),
        price_delta: num(o.price_delta),
        allergens: o.allergens,
        available: o.available !== false,
        position: k,
      })),
    ),
  )
  return oe
}
