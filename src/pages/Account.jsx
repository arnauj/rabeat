import { useEffect, useState } from 'react'
import TopBar from '../components/TopBar.jsx'
import { InstallCard } from '../components/InstallApp.jsx'
import Icon from '../components/Icon.jsx'
import { Button, Card, Cover, Field, Loading, SectionTitle, useToast } from '../components/ui.jsx'
import { useAuth } from '../lib/auth.jsx'
import { useLocation } from '../lib/location.jsx'
import { useAsync } from '../lib/useAsync.js'
import { supabase, unwrap } from '../lib/supabase.js'
import { navigate } from '../lib/router.js'

const ROLE_LABEL = { superuser: 'Superusuario', restaurant: 'Restaurante', rider: 'Repartidor', customer: 'Cliente' }

export default function Account() {
  const { user, profile, ready, signOut, refreshProfile } = useAuth()
  const { address, openPicker } = useLocation()
  const toast = useToast()
  const [form, setForm] = useState({ full_name: '', phone: '' })
  const [password, setPassword] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (ready && !user) navigate('/entrar?next=/cuenta')
  }, [ready, user])
  useEffect(() => {
    if (profile) setForm({ full_name: profile.full_name, phone: profile.phone })
  }, [profile])

  const { data: favorites } = useAsync(
    async () =>
      user ? unwrap(await supabase.from('favorites').select('restaurant:restaurants(slug, name, cover_url, cover_is_logo, cover_bg, cuisine)').eq('user_id', user.id)) : [],
    [user?.id],
  )

  if (!profile) return <Loading />

  const save = async () => {
    setSaving(true)
    const { error } = await supabase.from('profiles').update(form).eq('id', user.id)
    setSaving(false)
    if (error) return toast(error.message, 'error')
    toast('Datos guardados')
    refreshProfile()
  }

  const changePassword = async () => {
    if (password.length < 8) return toast('La contraseña debe tener al menos 8 caracteres', 'error')
    const { error } = await supabase.auth.updateUser({ password })
    if (error) return toast(error.message, 'error')
    setPassword('')
    toast('Contraseña actualizada')
  }

  return (
    <>
      <TopBar />
      <main className="mx-auto max-w-xl space-y-4 px-4 py-6">
        <div className="flex items-center gap-4">
          <span className="grid size-16 place-items-center rounded-3xl bg-brand-600 font-display text-2xl font-black text-white italic">
            {(profile.full_name || profile.email).charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-xl font-extrabold">{profile.full_name || 'Mi cuenta'}</h1>
            <p className="truncate text-sm text-neutral-500">{profile.email}</p>
            <span className="mt-1 inline-block rounded-full bg-ink px-2.5 py-0.5 text-[11px] font-bold text-white">{ROLE_LABEL[profile.role]}</span>
          </div>
        </div>

        {(profile.role === 'superuser' || profile.role === 'restaurant') && (
          <a href="#/panel" className="flex items-center gap-3 rounded-3xl bg-ink p-4 font-bold text-white">
            <Icon name="chart" /> Ir al panel de gestión <Icon name="right" className="ml-auto size-5" />
          </a>
        )}
        {profile.role === 'rider' && (
          <a href="#/reparto" className="flex items-center gap-3 rounded-3xl bg-ink p-4 font-bold text-white">
            <Icon name="bike" /> Ir a la app de reparto <Icon name="right" className="ml-auto size-5" />
          </a>
        )}

        <Card title="Mis datos" icon="user">
          <div className="space-y-3">
            <Field label="Nombre" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
            <Field label="Teléfono" type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            <Button onClick={save} loading={saving} className="w-full">
              Guardar
            </Button>
          </div>
        </Card>

        <Card title="Dirección de entrega" icon="pin">
          <button onClick={openPicker} className="flex w-full items-center gap-3 rounded-2xl bg-neutral-100 p-3 text-left">
            <span className="flex-1 text-sm font-bold">{address?.street ?? 'Añadir dirección'}</span>
            <Icon name="edit" className="size-4 text-neutral-400" />
          </button>
        </Card>

        {favorites?.length > 0 && (
          <div>
            <SectionTitle>Favoritos</SectionTitle>
            <div className="grid grid-cols-2 gap-3">
              {favorites.map(({ restaurant: r }) => (
                <a key={r.slug} href={`#/r/${r.slug}`} className="overflow-hidden rounded-2xl bg-white ring-1 ring-neutral-200/70">
                  <Cover restaurant={r} className="aspect-[16/10] w-full" />
                  <p className="truncate p-2 text-sm font-bold">{r.name}</p>
                </a>
              ))}
            </div>
          </div>
        )}

        <InstallCard />
        <Card title="Seguridad" icon="settings">
          <div className="flex gap-2">
            <Field className="flex-1" type="password" placeholder="Nueva contraseña" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            <Button variant="dark" onClick={changePassword}>
              Cambiar
            </Button>
          </div>
        </Card>

        <Button
          variant="danger"
          className="w-full"
          onClick={async () => {
            await signOut()
            navigate('/')
          }}
        >
          <Icon name="logout" className="size-4" /> Cerrar sesión
        </Button>
      </main>
    </>
  )
}
