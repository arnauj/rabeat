import Icon from './Icon.jsx'
import { Logo } from './ui.jsx'
import { useCart } from '../lib/cart.jsx'
import { money } from '../lib/format.js'

export const DEFAULT_ADDRESS = 'C/ Triana 42, 2ºB · Las Palmas de G.C.'

export default function TopBar() {
  const { count, subtotal } = useCart()
  return (
    <header className="sticky top-0 z-30 border-b border-neutral-200/70 bg-white/85 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2.5 sm:px-6">
        <a href="#/" aria-label="rabeat, inicio" className="shrink-0">
          <Logo className="h-9 sm:h-11" />
        </a>
        <button className="ml-auto flex min-w-0 items-center gap-2 rounded-full bg-neutral-100 py-1.5 pr-3 pl-2 text-left transition hover:bg-neutral-200 sm:ml-6 sm:mr-auto">
          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-brand-600 text-white">
            <Icon name="pin" className="size-4" />
          </span>
          <span className="min-w-0">
            <span className="block text-[10px] font-semibold tracking-wide text-neutral-500 uppercase">Entregar en</span>
            <span className="block max-w-[46vw] truncate text-sm font-bold sm:max-w-xs">{DEFAULT_ADDRESS}</span>
          </span>
          <Icon name="down" className="size-4 shrink-0 text-neutral-500" />
        </button>
        <nav className="hidden items-center gap-1 sm:flex">
          <a href="#/pedidos" className="rounded-full px-4 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-100">
            Mis pedidos
          </a>
          <a
            href="#/cesta"
            className="flex items-center gap-2 rounded-full bg-ink px-4 py-2.5 text-sm font-bold text-white transition hover:bg-neutral-800"
          >
            <Icon name="bag" className="size-4" />
            {count > 0 ? (
              <>
                {count} · {money(subtotal)}
              </>
            ) : (
              'Cesta'
            )}
          </a>
        </nav>
      </div>
    </header>
  )
}
