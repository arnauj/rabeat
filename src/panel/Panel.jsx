import { useEffect } from 'react'
import Icon from '../components/Icon.jsx'
import { Loading, Logo } from '../components/ui.jsx'
import { useAuth } from '../lib/auth.jsx'
import { navigate } from '../lib/router.js'
import Dashboard from './Dashboard.jsx'
import OrdersBoard from './OrdersBoard.jsx'
import RestaurantsList from './RestaurantsList.jsx'
import RestaurantEditor from './RestaurantEditor.jsx'
import Sales from './Sales.jsx'
import SettingsPage from './SettingsPage.jsx'
import Users from './Users.jsx'
import Promos from './Promos.jsx'
import Payouts from './Payouts.jsx'

const NAV = [
  { id: '', label: 'Resumen', icon: 'chart' },
  { id: 'pedidos', label: 'Pedidos', icon: 'receipt' },
  { id: 'restaurantes', label: 'Restaurantes', icon: 'store' },
  { id: 'ventas', label: 'Ventas', icon: 'wallet' },
  { id: 'liquidaciones', label: 'Liquidaciones', icon: 'cash', super: true },
  { id: 'usuarios', label: 'Usuarios', icon: 'users', super: true },
  { id: 'promos', label: 'Promociones', icon: 'tag', super: true },
  { id: 'ajustes', label: 'Comisiones y envío', icon: 'settings', super: true },
]

export default function Panel({ parts }) {
  const { ready, user, profile, isStaff, signOut } = useAuth()
  const [section = '', param] = parts

  useEffect(() => {
    if (ready && !user) navigate('/entrar?next=/panel')
  }, [ready, user])

  if (!ready || (user && !profile)) return <Loading />
  if (!isStaff)
    return (
      <div className="grid min-h-dvh place-items-center p-6 text-center">
        <div>
          <p className="text-5xl">🔒</p>
          <p className="mt-3 text-lg font-extrabold">Acceso solo para restaurantes y administradores</p>
          <a href="#/" className="mt-3 inline-block font-bold text-brand-600">
            Volver al inicio
          </a>
        </div>
      </div>
    )

  const isSuper = profile.role === 'superuser'
  const nav = NAV.filter((n) => !n.super || isSuper)

  let page
  switch (section) {
    case 'pedidos':
      page = <OrdersBoard />
      break
    case 'restaurantes':
      page = param ? <RestaurantEditor id={param} tab={parts[2]} /> : <RestaurantsList />
      break
    case 'ventas':
      page = <Sales />
      break
    case 'liquidaciones':
      page = isSuper && <Payouts />
      break
    case 'usuarios':
      page = isSuper && <Users />
      break
    case 'promos':
      page = isSuper && <Promos />
      break
    case 'ajustes':
      page = isSuper && <SettingsPage />
      break
    default:
      page = <Dashboard />
  }

  return (
    <div className="min-h-dvh bg-neutral-50 lg:grid lg:grid-cols-[260px_1fr]">
      {/* Barra lateral (escritorio) */}
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-neutral-200 bg-white p-5 lg:flex">
        <a href="#/">
          <Logo className="h-10" />
        </a>
        <p className="mt-2 text-xs font-bold tracking-wide text-brand-600 uppercase">{isSuper ? 'Superusuario' : 'Panel restaurante'}</p>
        <nav className="mt-6 flex-1 space-y-1">
          {nav.map((n) => (
            <a
              key={n.id}
              href={`#/panel${n.id ? `/${n.id}` : ''}`}
              className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-bold transition ${
                section === n.id ? 'bg-ink text-white' : 'text-neutral-600 hover:bg-neutral-100'
              }`}
            >
              <Icon name={n.icon} className="size-5" />
              {n.label}
            </a>
          ))}
        </nav>
        <div className="border-t border-neutral-100 pt-4">
          <p className="truncate text-sm font-bold">{profile.full_name || profile.email}</p>
          <p className="truncate text-xs text-neutral-500">{profile.email}</p>
          <button
            onClick={async () => {
              await signOut()
              navigate('/')
            }}
            className="mt-3 flex items-center gap-2 text-sm font-bold text-neutral-500 hover:text-brand-600"
          >
            <Icon name="logout" className="size-4" /> Cerrar sesión
          </button>
        </div>
      </aside>

      <div className="min-w-0">
        {/* Cabecera y pestañas (móvil) */}
        <header className="sticky top-0 z-40 border-b border-neutral-200/70 bg-white/90 pt-[env(safe-area-inset-top)] backdrop-blur-xl lg:hidden">
          <div className="flex items-center gap-3 px-4 py-2.5">
            <a href="#/" aria-label="Ir a la app">
              <Logo className="h-8" />
            </a>
            <span className="rounded-full bg-ink px-2.5 py-1 text-[11px] font-bold text-white">{isSuper ? 'Admin' : 'Restaurante'}</span>
            <a href="#/cuenta" className="ml-auto grid size-9 place-items-center rounded-full bg-neutral-100" aria-label="Mi cuenta">
              <Icon name="user" className="size-4" />
            </a>
          </div>
          <nav className="no-scrollbar flex gap-1.5 overflow-x-auto px-4 pb-2.5">
            {nav.map((n) => (
              <a
                key={n.id}
                href={`#/panel${n.id ? `/${n.id}` : ''}`}
                className={`flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-bold transition ${
                  section === n.id ? 'bg-ink text-white' : 'bg-neutral-100 text-neutral-600'
                }`}
              >
                <Icon name={n.icon} className="size-4" />
                {n.label}
              </a>
            ))}
          </nav>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-5 pb-[calc(env(safe-area-inset-bottom)+2rem)] sm:px-6 lg:py-8">{page}</main>
      </div>
    </div>
  )
}

export function PageTitle({ children, subtitle, action }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-display text-2xl font-black tracking-tight italic sm:text-3xl">{children}</h1>
        {subtitle && <p className="mt-1 text-sm text-neutral-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}
