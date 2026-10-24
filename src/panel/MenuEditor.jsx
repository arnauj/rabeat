import { useState } from 'react'
import Icon from '../components/Icon.jsx'
import { AllergenChips, Button, Field, SafeImg, Select, Sheet, SheetHeader, TextArea, Toggle, useToast } from '../components/ui.jsx'
import { useAuth } from '../lib/auth.jsx'
import { useSettings } from '../lib/settings.jsx'
import { uploadImage } from '../lib/data.js'
import { supabase } from '../lib/supabase.js'
import { money } from '../lib/format.js'
import { customerPrice } from '../lib/pricing.js'
import { ALLERGENS, ALLERGEN_KEYS } from '../data/allergens.js'
import { DISH_TAGS } from '../data/categories.js'

// Carta por categorías: alta, orden, precios, alérgenos y disponibilidad
export default function MenuEditor({ restaurant: r, onChange }) {
  const toast = useToast()
  const { settings } = useSettings()
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
        Pon <b>tu precio</b>: la app lo muestra al cliente con el recargo de la plataforma ({settings.price_markup_pct}%). Tus ventas y
        liquidaciones se calculan siempre sobre tu precio.
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
                    <span className={`block truncate font-bold ${d.available ? '' : 'text-neutral-400 line-through'}`}>{d.name}</span>
                    <span className="block text-xs text-neutral-500">
                      {money(d.price)} <span className="text-neutral-400">→ cliente {money(customerPrice(d.price, settings.price_markup_pct))}</span>
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
  const { settings } = useSettings()
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
  })
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
      restaurant_id: r.id,
    }
    const { error } = isNew
      ? await supabase.from('dishes').insert({ ...row, position: r.menu.find((c) => c.id === form.category_id)?.dishes.length ?? 0 })
      : await supabase.from('dishes').update(row).eq('id', dish.id)
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
        <Field label="Nombre" required value={form.name} onChange={set('name')} />
        <TextArea label="Descripción" rows={3} value={form.description} onChange={set('description')} />
        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Tu precio (€)"
            inputMode="decimal"
            required
            value={form.price}
            onChange={set('price')}
            hint={price >= 0 ? `El cliente verá ${money(customerPrice(price, settings.price_markup_pct))}` : ''}
          />
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
