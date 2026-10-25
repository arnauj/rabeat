import { useMemo, useState } from 'react'
import Icon from '../components/Icon.jsx'
import { Button, ErrorBox, Field, Loading, Select, Sheet, SheetHeader, Toggle, useToast } from '../components/ui.jsx'
import { useAuth } from '../lib/auth.jsx'
import { useAsync } from '../lib/useAsync.js'
import { callFunction, supabase, unwrap } from '../lib/supabase.js'
import { PageTitle } from './Panel.jsx'

export const ROLES = {
  superuser: { label: 'Superusuario', cls: 'bg-ink text-white' },
  restaurant: { label: 'Restaurante', cls: 'bg-brand-50 text-brand-700' },
  rider: { label: 'Repartidor', cls: 'bg-violet-50 text-violet-700' },
  customer: { label: 'Cliente', cls: 'bg-neutral-100 text-neutral-600' },
}

const randomPassword = () => {
  const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return [...crypto.getRandomValues(new Uint8Array(12))].map((b) => chars[b % chars.length]).join('')
}

export default function Users() {
  const { data, error, loading, reload } = useAsync(
    async () => unwrap(await supabase.from('profiles').select('*, restaurants:restaurants!restaurants_owner_id_fkey(count)').order('created_at', { ascending: false })),
    [],
  )
  const [role, setRole] = useState('')
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState(null)

  const list = useMemo(
    () =>
      (data ?? []).filter(
        (u) => (!role || u.role === role) && `${u.full_name} ${u.email} ${u.phone}`.toLowerCase().includes(query.toLowerCase()),
      ),
    [data, role, query],
  )

  return (
    <>
      <PageTitle
        subtitle="Da de alta restaurantes, repartidores y otros administradores"
        action={
          <Button onClick={() => setEditing({})}>
            <Icon name="plus" className="size-4" /> Nuevo usuario
          </Button>
        }
      >
        Usuarios
      </PageTitle>
      <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_220px]">
        <Field placeholder="Buscar por nombre, email o teléfono…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <Select value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="">Todos los roles</option>
          {Object.entries(ROLES).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </Select>
      </div>
      {loading && !data ? (
        <Loading />
      ) : error ? (
        <ErrorBox error={error} onRetry={reload} />
      ) : (
        <ul className="divide-y divide-neutral-100 overflow-hidden rounded-3xl bg-white ring-1 ring-neutral-200/70">
          {list.map((u) => (
            <li key={u.id}>
              <button onClick={() => setEditing(u)} className="flex w-full items-center gap-3 p-4 text-left hover:bg-neutral-50">
                <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-neutral-100 font-extrabold">
                  {(u.full_name || u.email).charAt(0).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold">
                    {u.full_name || 'Sin nombre'} {!u.active && <span className="text-xs font-bold text-brand-600">· bloqueado</span>}
                  </span>
                  <span className="block truncate text-xs text-neutral-500">
                    {u.email}
                    {u.role === 'restaurant' && ` · ${u.restaurants?.[0]?.count ?? 0} restaurantes`}
                  </span>
                </span>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${ROLES[u.role].cls}`}>{ROLES[u.role].label}</span>
              </button>
            </li>
          ))}
          {!list.length && <li className="p-8 text-center text-sm text-neutral-400">Ningún usuario coincide</li>}
        </ul>
      )}
      <Sheet open={!!editing} onClose={() => setEditing(null)} label="Usuario">
        {editing && (
          <UserForm
            user={editing}
            onClose={() => setEditing(null)}
            onSaved={() => {
              setEditing(null)
              reload(true)
            }}
          />
        )}
      </Sheet>
    </>
  )
}

function UserForm({ user, onClose, onSaved }) {
  const toast = useToast()
  const { profile: me } = useAuth()
  const isNew = !user.id
  const [form, setForm] = useState({
    full_name: user.full_name ?? '',
    email: user.email ?? '',
    phone: user.phone ?? '',
    role: user.role ?? 'restaurant',
    active: user.active ?? true,
    password: isNew ? randomPassword() : '',
  })
  const [saving, setSaving] = useState(false)
  const set = (k) => (e) => setForm({ ...form, [k]: e?.target ? e.target.value : e })

  const save = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      if (isNew) {
        await callFunction('admin-users', { action: 'create', ...form })
        await navigator.clipboard?.writeText(`${form.email} / ${form.password}`).catch(() => {})
        toast('Usuario creado. Email y contraseña copiados al portapapeles')
      } else {
        await callFunction('admin-users', {
          action: 'update',
          id: user.id,
          full_name: form.full_name,
          phone: form.phone,
          role: form.role,
          active: form.active,
          password: form.password || undefined,
        })
        toast('Usuario actualizado')
      }
      onSaved()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!confirm(`¿Eliminar la cuenta de ${user.email}? Sus pedidos se conservan.`)) return
    try {
      await callFunction('admin-users', { action: 'delete', id: user.id })
      toast('Usuario eliminado')
      onSaved()
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  return (
    <form onSubmit={save}>
      <SheetHeader title={isNew ? 'Nuevo usuario' : form.full_name || form.email} subtitle={isNew ? 'Podrá entrar con su email y esta contraseña' : user.email} onClose={onClose} />
      <div className="space-y-3 p-5">
        <Select label="Rol" value={form.role} onChange={set('role')} disabled={user.id === me.id}>
          {Object.entries(ROLES).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </Select>
        <p className="text-xs text-neutral-500">
          {
            {
              superuser: 'Acceso total: ajustes, comisiones, usuarios y todos los restaurantes.',
              restaurant: 'Gestiona sus restaurantes, horarios, carta, pedidos y ventas.',
              rider: 'Acepta pedidos disponibles y los entrega. Recibe los avisos por email.',
              customer: 'Pide comida y sigue sus pedidos.',
            }[form.role]
          }
        </p>
        <Field label="Nombre" required value={form.full_name} onChange={set('full_name')} />
        {isNew && <Field label="Email" type="email" required value={form.email} onChange={set('email')} />}
        <Field label="Teléfono" type="tel" value={form.phone} onChange={set('phone')} />
        <div className="flex items-end gap-2">
          <Field
            className="flex-1"
            label={isNew ? 'Contraseña inicial' : 'Nueva contraseña (opcional)'}
            value={form.password}
            onChange={set('password')}
            hint="Mínimo 8 caracteres"
          />
          <Button type="button" variant="soft" className="mb-5" onClick={() => setForm({ ...form, password: randomPassword() })} aria-label="Generar contraseña">
            <Icon name="refresh" className="size-4" />
          </Button>
        </div>
        {!isNew && user.id !== me.id && <Toggle checked={form.active} onChange={set('active')} label="Cuenta activa" description="Si la desactivas no podrá entrar" />}
      </div>
      <div className="sticky bottom-0 flex gap-3 border-t border-neutral-100 bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {!isNew && user.id !== me.id && (
          <Button type="button" variant="danger" onClick={remove} aria-label="Eliminar usuario">
            <Icon name="trash" className="size-4" />
          </Button>
        )}
        <Button type="button" variant="soft" className="flex-1" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" className="flex-[2]" loading={saving}>
          {isNew ? 'Crear usuario' : 'Guardar'}
        </Button>
      </div>
    </form>
  )
}
