import Icon from './Icon.jsx'
import { Logo } from './ui.jsx'
import { useCart } from '../lib/cart.jsx'
import { useAuth } from '../lib/auth.jsx'
import { useLocation } from '../lib/location.jsx'
import { money } from '../lib/format.js'

export default function TopBar() {
  const { count, subtotal } = useCart()
  const { user, isStaff, role } = useAuth()
  const { address, openPicker } = useLocation()

  return (
    <header className="sticky top-0 z-30 border-b border-neutral-200/70 bg-white/85 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2.5 sm:px-6">
        <a href="#/" aria-label="rabeat, inicio" className="shrink-0">
          <Logo className="h-9 sm:h-11" />
        </a>
        <button
          onClick={openPicker}
          className="ml-auto flex min-w-0 items-center gap-2 rounded-full bg-neutral-100 py-1.5 pr-3 pl-2 text-left transition hover:bg-neutral-200 sm:mr-auto sm:ml-6"
        >
          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-brand-600 text-white">
            <Icon name="pin" className="size-4" />
          </span>
          <span className="min-w-0">
            <span className="block text-[10px] font-semibold tracking-wide text-neutral-500 uppercase">Entregar en</span>
            <span className="block max-w-[46vw] truncate text-sm font-bold sm:max-w-xs">{address?.street ?? 'Elige tu dirección'}</span>
          </span>
          <Icon name="down" className="size-4 shrink-0 text-neutral-500" />
        </button>
        <nav className="hidden items-center gap-1 sm:flex">
          <a href="#/pedidos" className="rounded-full px-4 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-100">
            Mis pedidos
          </a>
          {isStaff && (
            <a href="#/panel" className="rounded-full px-4 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-100">
              Panel
            </a>
          )}
          {role === 'rider' && (
            <a href="#/reparto" className="rounded-full px-4 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-100">
              Reparto
            </a>
          )}
          <a
            href={user ? '#/cuenta' : '#/entrar'}
            className="grid size-10 place-items-center rounded-full text-neutral-700 hover:bg-neutral-100"
            aria-label={user ? 'Mi cuenta' : 'Entrar'}
            title={user ? 'Mi cuenta' : 'Entrar'}
          >
            <Icon name="user" />
          </a>
          <a href="#/cesta" className="flex items-center gap-2 rounded-full bg-ink px-4 py-2.5 text-sm font-bold text-white transition hover:bg-neutral-800">
            <Icon name="bag" className="size-4" />
            {count > 0 ? `${count} · ${money(subtotal)}` : 'Cesta'}
          </a>
        </nav>
      </div>
    </header>
  )
}
