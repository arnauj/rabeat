import { useState } from 'react'
import Icon from '../components/Icon.jsx'
import { Button, ErrorBox, Field, Loading, Select, Toggle, useToast } from '../components/ui.jsx'
import { useAsync } from '../lib/useAsync.js'
import { supabase, unwrap } from '../lib/supabase.js'
import { money } from '../lib/format.js'
import { PageTitle } from './Panel.jsx'

export default function Promos() {
  const toast = useToast()
  const { data, error, loading, reload } = useAsync(async () => unwrap(await supabase.from('promo_codes').select('*').order('created_at', { ascending: false })), [])
  const [form, setForm] = useState({ code: '', kind: 'percent', value: '', min_subtotal: '', max_uses: '', expires_at: '' })
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  const create = async (e) => {
    e.preventDefault()
    const { error } = await supabase.from('promo_codes').insert({
      code: form.code.trim().toUpperCase(),
      kind: form.kind,
      value: Number(String(form.value).replace(',', '.')),
      min_subtotal: Number(form.min_subtotal) || 0,
      max_uses: form.max_uses ? Number(form.max_uses) : null,
      expires_at: form.expires_at ? new Date(`${form.expires_at}T23:59:59`).toISOString() : null,
    })
    if (error) return toast(error.message.includes('duplicate') ? 'Ese código ya existe' : error.message.includes('check') ? 'Código: 3-20 letras o números' : error.message, 'error')
    toast('Código creado')
    setForm({ code: '', kind: 'percent', value: '', min_subtotal: '', max_uses: '', expires_at: '' })
    reload(true)
  }

  const update = async (code, patch) => {
    const { error } = await supabase.from('promo_codes').update(patch).eq('code', code)
    if (error) toast(error.message, 'error')
    reload(true)
  }

  const remove = async (code) => {
    if (!confirm(`¿Eliminar el código ${code}?`)) return
    const { error } = await supabase.from('promo_codes').delete().eq('code', code)
    if (error) toast(error.message, 'error')
    reload(true)
  }

  return (
    <>
      <PageTitle subtitle="Los descuentos los asume la plataforma: no afectan a lo que cobra el restaurante">Promociones</PageTitle>
      <form onSubmit={create} className="mb-5 grid gap-3 rounded-3xl bg-white p-4 ring-1 ring-neutral-200/70 sm:grid-cols-3 lg:grid-cols-6">
        <Field label="Código" required placeholder="VERANO" value={form.code} onChange={set('code')} className="uppercase" />
        <Select label="Tipo" value={form.kind} onChange={set('kind')}>
          <option value="percent">% de descuento</option>
          <option value="fixed">Importe fijo (€)</option>
        </Select>
        <Field label={form.kind === 'percent' ? 'Porcentaje' : 'Euros'} required inputMode="decimal" value={form.value} onChange={set('value')} />
        <Field label="Pedido mínimo (€)" inputMode="decimal" value={form.min_subtotal} onChange={set('min_subtotal')} />
        <Field label="Usos máximos" inputMode="numeric" placeholder="Sin límite" value={form.max_uses} onChange={set('max_uses')} />
        <Field label="Caduca" type="date" value={form.expires_at} onChange={set('expires_at')} />
        <Button type="submit" className="sm:col-span-3 lg:col-span-6">
          <Icon name="plus" className="size-4" /> Crear código
        </Button>
      </form>
      {loading && !data ? (
        <Loading />
      ) : error ? (
        <ErrorBox error={error} onRetry={reload} />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {data.map((p) => (
            <li key={p.code} className="flex items-center gap-3 rounded-3xl bg-white p-4 ring-1 ring-neutral-200/70">
              <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-brand-50 text-brand-600">
                <Icon name="tag" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-extrabold tracking-wide">{p.code}</p>
                <p className="text-xs text-neutral-500">
                  {p.kind === 'percent' ? `${p.value}%` : money(p.value)}
                  {Number(p.min_subtotal) > 0 && ` · mín. ${money(p.min_subtotal)}`} · {p.uses}
                  {p.max_uses ? `/${p.max_uses}` : ''} usos
                  {p.expires_at && ` · hasta ${new Date(p.expires_at).toLocaleDateString('es-ES')}`}
                </p>
              </div>
              <Toggle checked={p.active} onChange={(v) => update(p.code, { active: v })} label={<span className="sr-only">Activo</span>} />
              <button onClick={() => remove(p.code)} className="grid size-9 place-items-center rounded-full text-neutral-400 hover:bg-neutral-100 hover:text-brand-600" aria-label={`Eliminar ${p.code}`}>
                <Icon name="trash" className="size-4" />
              </button>
            </li>
          ))}
          {!data.length && <li className="text-sm text-neutral-500">No hay códigos todavía.</li>}
        </ul>
      )}
    </>
  )
}
