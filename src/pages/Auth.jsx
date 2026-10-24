import { useEffect, useState } from 'react'
import Icon from '../components/Icon.jsx'
import { Button, Field, Logo, useToast } from '../components/ui.jsx'
import { useAuth } from '../lib/auth.jsx'
import { goBack, navigate } from '../lib/router.js'

const homeFor = (role, next) => next || (role === 'superuser' || role === 'restaurant' ? '/panel' : role === 'rider' ? '/reparto' : '/')

function Shell({ title, subtitle, children }) {
  return (
    <div className="flex min-h-dvh flex-col bg-white sm:items-center sm:justify-center sm:bg-neutral-50 sm:p-6">
      <div className="relative overflow-hidden bg-gradient-to-br from-brand-600 to-brand-800 px-6 pt-[max(1.25rem,env(safe-area-inset-top))] pb-10 text-white sm:w-full sm:max-w-md sm:rounded-t-[28px]">
        <div className="speed-lines pointer-events-none absolute inset-0 opacity-40 [mask-image:linear-gradient(90deg,black,transparent)]" />
        <button onClick={() => goBack('/')} className="relative grid size-10 place-items-center rounded-full bg-white/15" aria-label="Volver">
          <Icon name="back" />
        </button>
        <img src="rider.png" alt="" className="pointer-events-none absolute -right-4 bottom-0 w-36 drop-shadow-xl" />
        <h1 className="relative mt-6 font-display text-3xl font-black italic">{title}</h1>
        <p className="relative mt-1 max-w-[60%] text-sm text-white/85">{subtitle}</p>
      </div>
      <div className="-mt-5 flex-1 rounded-t-[28px] bg-white p-6 sm:mt-0 sm:w-full sm:max-w-md sm:flex-none sm:rounded-t-none sm:rounded-b-[28px] sm:shadow-xl">
        {children}
      </div>
    </div>
  )
}

export function Login({ next }) {
  const { signIn, resetPassword, role, user } = useAuth()
  const toast = useToast()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (user && role) navigate(homeFor(role, next))
  }, [user, role, next])

  const submit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      await signIn(email, password)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const forgot = async () => {
    if (!email) return setError('Escribe tu email y vuelve a pulsar «¿Has olvidado la contraseña?»')
    try {
      await resetPassword(email)
      toast('Te hemos enviado un email para restablecer la contraseña')
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <Shell title="¡Hola de nuevo!" subtitle="Entra para ver tus pedidos y pedir más rápido.">
      <form onSubmit={submit} className="space-y-3">
        <Field label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <Field label="Contraseña" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <p className="text-sm font-semibold text-brand-600">{error}</p>}
        <Button type="submit" loading={loading} className="w-full py-4 text-base">
          Entrar
        </Button>
        <button type="button" onClick={forgot} className="w-full py-2 text-sm font-semibold text-neutral-500">
          ¿Has olvidado la contraseña?
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-neutral-600">
        ¿No tienes cuenta?{' '}
        <a href={`#/registro${next ? `?next=${encodeURIComponent(next)}` : ''}`} className="font-bold text-brand-600">
          Regístrate gratis
        </a>
      </p>
      <div className="mt-8 flex justify-center">
        <Logo className="h-7 opacity-60" />
      </div>
    </Shell>
  )
}

export function Register({ next }) {
  const { signUp, user, role } = useAuth()
  const [form, setForm] = useState({ full_name: '', email: '', phone: '', password: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [checkEmail, setCheckEmail] = useState(false)

  useEffect(() => {
    if (user && role) navigate(homeFor(role, next))
  }, [user, role, next])

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  const submit = async (e) => {
    e.preventDefault()
    if (form.password.length < 8) return setError('La contraseña debe tener al menos 8 caracteres')
    setLoading(true)
    setError('')
    try {
      const data = await signUp(form)
      if (!data.session) setCheckEmail(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (checkEmail)
    return (
      <Shell title="Revisa tu email" subtitle="Solo falta un paso.">
        <p className="text-neutral-600">
          Te hemos enviado un enlace a <b>{form.email}</b> para confirmar tu cuenta.
        </p>
      </Shell>
    )

  return (
    <Shell title="Crea tu cuenta" subtitle="Guarda tu dirección y sigue todos tus pedidos.">
      <form onSubmit={submit} className="space-y-3">
        <Field label="Nombre y apellidos" autoComplete="name" required value={form.full_name} onChange={set('full_name')} />
        <Field label="Email" type="email" autoComplete="email" required value={form.email} onChange={set('email')} />
        <Field label="Teléfono" type="tel" autoComplete="tel" value={form.phone} onChange={set('phone')} />
        <Field label="Contraseña" type="password" autoComplete="new-password" required hint="Mínimo 8 caracteres" value={form.password} onChange={set('password')} />
        {error && <p className="text-sm font-semibold text-brand-600">{error}</p>}
        <Button type="submit" loading={loading} className="w-full py-4 text-base">
          Crear cuenta
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-neutral-600">
        ¿Ya tienes cuenta?{' '}
        <a href={`#/entrar${next ? `?next=${encodeURIComponent(next)}` : ''}`} className="font-bold text-brand-600">
          Entra
        </a>
      </p>
    </Shell>
  )
}
