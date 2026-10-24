import { lazy, Suspense } from 'react'
import { useRoute } from './lib/router.js'
import { useCart } from './lib/cart.jsx'
import { useAuth } from './lib/auth.jsx'
import Icon from './components/Icon.jsx'
import AddressSheet from './components/AddressSheet.jsx'
import { Loading } from './components/ui.jsx'
import Home from './pages/Home.jsx'
import Restaurant from './pages/Restaurant.jsx'
import CartPage from './pages/CartPage.jsx'
import Checkout from './pages/Checkout.jsx'
import Orders from './pages/Orders.jsx'
import OrderTracking from './pages/OrderTracking.jsx'
import { Login, Register } from './pages/Auth.jsx'
import Account from './pages/Account.jsx'
import TableEntry from './pages/TableEntry.jsx'
import { money } from './lib/format.js'

// Paneles en carga diferida: el cliente no descarga el código de gestión
const Panel = lazy(() => import('./panel/Panel.jsx'))
const RiderApp = lazy(() => import('./rider/RiderApp.jsx'))

export default function App() {
  const { parts, query } = useRoute()
  const [page = '', param] = parts

  let content
  switch (page) {
    case 'r':
      content = <Restaurant slug={param} />
      break
    case 'cesta':
      content = <CartPage />
      break
    case 'pago':
      content = <Checkout query={query} />
      break
    case 'pedidos':
      content = <Orders />
      break
    case 'pedido':
      content = <OrderTracking token={param} query={query} />
      break
    case 'entrar':
      content = <Login next={query.get('next')} />
      break
    case 'registro':
      content = <Register next={query.get('next')} />
      break
    case 'cuenta':
      content = <Account />
      break
    case 'mesa':
      content = <TableEntry code={param} />
      break
    case 'panel':
      content = <Panel parts={parts.slice(1)} />
      break
    case 'reparto':
      content = <RiderApp parts={parts.slice(1)} />
      break
    default:
      content = <Home />
  }

  const showNav = !['pago', 'pedido', 'panel', 'reparto', 'entrar', 'registro', 'mesa'].includes(page)

  return (
    <div className={`min-h-dvh ${showNav ? 'pb-[calc(env(safe-area-inset-bottom)+5rem)] sm:pb-0' : ''}`}>
      <Suspense fallback={<Loading />}>{content}</Suspense>
      {showNav && <BottomNav page={page} />}
      <AddressSheet />
    </div>
  )
}

function BottomNav({ page }) {
  const { count, subtotal } = useCart()
  const { user, isStaff, role } = useAuth()
  const items = [
    { href: '#/', id: '', icon: 'home', label: 'Inicio' },
    { href: '#/cesta', id: 'cesta', icon: 'bag', label: 'Cesta', badge: count },
    { href: '#/pedidos', id: 'pedidos', icon: 'receipt', label: 'Pedidos' },
    isStaff
      ? { href: '#/panel', id: 'panel', icon: 'chart', label: 'Panel' }
      : role === 'rider'
        ? { href: '#/reparto', id: 'reparto', icon: 'bike', label: 'Reparto' }
        : { href: user ? '#/cuenta' : '#/entrar', id: user ? 'cuenta' : 'entrar', icon: 'user', label: user ? 'Cuenta' : 'Entrar' },
  ]
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-neutral-200/80 bg-white/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl sm:hidden">
      <ul className="mx-auto grid max-w-md grid-cols-4">
        {items.map((it) => {
          const active = page === it.id || (it.id === '' && page === 'r')
          return (
            <li key={it.id}>
              <a
                href={it.href}
                className={`relative flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-semibold transition ${active ? 'text-brand-600' : 'text-neutral-500'}`}
              >
                <span className="relative">
                  <Icon name={it.icon} className="size-6" strokeWidth={active ? 2.4 : 1.8} />
                  {it.badge > 0 && (
                    <span className="absolute -top-1.5 -right-2.5 grid min-w-5 place-items-center rounded-full bg-brand-600 px-1 text-[10px] font-bold text-white ring-2 ring-white">
                      {it.badge}
                    </span>
                  )}
                </span>
                {it.id === 'cesta' && it.badge > 0 ? money(subtotal) : it.label}
              </a>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
