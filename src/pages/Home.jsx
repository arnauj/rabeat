import { useMemo, useState } from 'react'
import TopBar from '../components/TopBar.jsx'
import Icon from '../components/Icon.jsx'
import RestaurantCard from '../components/RestaurantCard.jsx'
import { SectionTitle, useNow } from '../components/ui.jsx'
import { CATEGORIES, RESTAURANTS } from '../data/restaurants.js'
import { getStatus } from '../lib/time.js'

const normalize = (s) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()

export default function Home() {
  const now = useNow()
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('all')
  const [onlyOpen, setOnlyOpen] = useState(false)

  const { open, closed } = useMemo(() => {
    const q = normalize(query.trim())
    const list = RESTAURANTS.filter((r) => category === 'all' || r.category === category).filter((r) => {
      if (!q) return true
      const haystack = [r.name, r.cuisine, ...r.menu.flatMap((s) => s.dishes.map((d) => d.name))].join(' ')
      return normalize(haystack).includes(q)
    })
    const withStatus = list.map((r) => ({ r, status: getStatus(r, now) }))
    return {
      open: withStatus.filter((x) => x.status.open).map((x) => x.r),
      closed: withStatus
        .filter((x) => !x.status.open)
        .sort((a, b) => (a.status.opensAt ?? Infinity) - (b.status.opensAt ?? Infinity))
        .map((x) => x.r),
    }
  }, [query, category, now])

  return (
    <>
      <TopBar />
      <main className="mx-auto max-w-6xl px-4 sm:px-6">
        <Hero />

        <div className="sticky top-[61px] z-20 -mx-4 bg-neutral-50/90 px-4 pt-3 pb-2 backdrop-blur-xl sm:top-[69px] sm:-mx-6 sm:px-6">
          <label className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-sm ring-1 ring-neutral-200 focus-within:ring-2 focus-within:ring-brand-500">
            <Icon name="search" className="size-5 text-neutral-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Restaurantes o platos…"
              className="w-full bg-transparent text-[15px] font-medium outline-none placeholder:text-neutral-400"
              type="search"
            />
          </label>
          <div className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6">
            {CATEGORIES.map((c) => (
              <button
                key={c.id}
                onClick={() => setCategory(c.id)}
                className={`flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition ${
                  category === c.id
                    ? 'bg-ink text-white shadow-md'
                    : 'bg-white text-neutral-700 ring-1 ring-neutral-200 hover:ring-neutral-300'
                }`}
              >
                <span>{c.icon}</span>
                {c.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 mb-5 flex items-center justify-between">
          <p className="text-sm text-neutral-500">
            <strong className="text-ink">{open.length}</strong> abiertos ·{' '}
            <strong className="text-ink">{closed.length}</strong> cerrados
          </p>
          <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold">
            Solo abiertos
            <input type="checkbox" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} className="peer sr-only" />
            <span className="relative h-6 w-11 rounded-full bg-neutral-300 transition peer-checked:bg-brand-600 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-400 after:absolute after:top-0.5 after:left-0.5 after:size-5 after:rounded-full after:bg-white after:shadow after:transition peer-checked:after:translate-x-5" />
          </label>
        </div>

        {open.length > 0 && (
          <section className="mb-10">
            <SectionTitle>Abiertos ahora</SectionTitle>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {open.map((r) => (
                <RestaurantCard key={r.id} restaurant={r} now={now} />
              ))}
            </div>
          </section>
        )}

        {!onlyOpen && closed.length > 0 && (
          <section className="mb-10">
            <SectionTitle>Cerrados · programa tu pedido</SectionTitle>
            <p className="-mt-2 mb-4 text-sm text-neutral-500">
              Pide ahora y te lo llevamos en cuanto abran, a la hora que elijas.
            </p>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {closed.map((r) => (
                <RestaurantCard key={r.id} restaurant={r} now={now} />
              ))}
            </div>
          </section>
        )}

        {open.length + closed.length === 0 && (
          <div className="py-20 text-center">
            <p className="text-5xl">🐰💨</p>
            <p className="mt-4 text-lg font-bold">No encontramos nada con «{query}»</p>
            <p className="text-neutral-500">Prueba con otra búsqueda o categoría.</p>
          </div>
        )}
      </main>
      <Footer />
    </>
  )
}

function Hero() {
  return (
    <section className="relative mt-4 overflow-hidden rounded-[28px] bg-gradient-to-br from-brand-600 via-brand-600 to-brand-800 px-6 py-7 text-white shadow-xl shadow-brand-600/20 sm:px-10 sm:py-10">
      <div className="pointer-events-none absolute inset-y-0 left-0 w-2/3 speed-lines opacity-60 [mask-image:linear-gradient(90deg,black,transparent)]" />
      <div className="relative z-10 max-w-[62%] sm:max-w-md">
        <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-3 py-1 text-xs font-bold backdrop-blur">
          <Icon name="bolt" className="size-3.5" /> Entrega media en 24 min
        </span>
        <h1 className="mt-3 font-display text-3xl leading-[0.95] font-black italic tracking-tight sm:text-5xl">
          Tu comida,
          <br />a toda liebre.
        </h1>
        <p className="mt-3 max-w-[11rem] text-sm text-white/85 sm:max-w-none sm:text-base">
          Lo mejor de Gran Canaria en tu puerta. Y si está cerrado, lo programas.
        </p>
      </div>
      <img
        src="rider.png"
        alt=""
        className="pointer-events-none absolute -right-3 bottom-4 w-40 animate-ride drop-shadow-[0_12px_20px_rgba(0,0,0,0.35)] sm:right-8 sm:bottom-6 sm:w-80"
      />
    </section>
  )
}

function Footer() {
  return (
    <footer className="mt-8 hidden border-t border-neutral-200 bg-white sm:block">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-8 text-sm text-neutral-500">
        <img src="logo.webp" alt="rabeat" className="h-8" />
        <p>Comida a domicilio desde Canarias · © {new Date().getFullYear()} rabeat</p>
      </div>
    </footer>
  )
}
