import { useMemo, useState } from 'react'
import TopBar from '../components/TopBar.jsx'
import { InstallBanner } from '../components/InstallApp.jsx'
import Icon from '../components/Icon.jsx'
import RestaurantCard from '../components/RestaurantCard.jsx'
import { ErrorBox, Loading, SectionTitle, useNow } from '../components/ui.jsx'
import { CATEGORIES } from '../data/categories.js'
import { listRestaurants } from '../lib/data.js'
import { useAsync } from '../lib/useAsync.js'
import { getStatus } from '../lib/time.js'
import { useSettings } from '../lib/settings.jsx'
import { useLocation } from '../lib/location.jsx'
import { deliveryDistanceKm, inDeliveryRange } from '../lib/pricing.js'
import { useCart } from '../lib/cart.jsx'

const normalize = (s) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()

export default function Home() {
  const now = useNow()
  const { settings } = useSettings()
  const { address, openPicker } = useLocation()
  const { table, setTable } = useCart()
  const { data: restaurants, error, loading, reload } = useAsync(listRestaurants, [])
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('all')
  const [onlyOpen, setOnlyOpen] = useState(false)

  const { open, closed, far } = useMemo(() => {
    const q = normalize(query.trim())
    const list = (restaurants ?? [])
      .filter((r) => category === 'all' || r.category === category)
      .filter((r) => !q || normalize([r.name, r.cuisine, ...(r.dishes ?? []).map((d) => d.name)].join(' ')).includes(q))
      .map((r) => {
        const km = address ? deliveryDistanceKm(r, address) : null
        return { r, km, status: getStatus(r.opening_hours, now, settings.timezone), inRange: !address || inDeliveryRange(km, settings) }
      })
    const near = list.filter((x) => x.inRange)
    const byDistance = (a, b) => (a.km ?? 0) - (b.km ?? 0)
    return {
      open: near.filter((x) => x.status.open && x.r.accepting_orders).sort(byDistance),
      closed: near
        .filter((x) => !x.status.open || !x.r.accepting_orders)
        .sort((a, b) => (a.status.opensAt ?? Infinity) - (b.status.opensAt ?? Infinity)),
      far: list.filter((x) => !x.inRange),
    }
  }, [restaurants, query, category, now, settings, address])

  return (
    <>
      <TopBar />
      <main className="mx-auto max-w-6xl px-4 sm:px-6">
        {table && (
          <div className="mt-4 flex items-center gap-3 rounded-3xl bg-brand-600 p-4 text-white">
            <span className="text-2xl">🍽️</span>
            <a href={`#/r/${table.restaurantSlug}`} className="min-w-0 flex-1">
              <span className="block font-extrabold">Estás en {table.restaurantName} · {table.name}</span>
              <span className="block text-sm text-white/85">Volver a la carta de tu mesa</span>
            </a>
            <button onClick={() => setTable(null)} className="shrink-0 rounded-full bg-white/15 px-3 py-1.5 text-xs font-bold ring-1 ring-white/30">
              Salir
            </button>
          </div>
        )}
        <InstallBanner className="mt-4" />
        <Hero />

        {!address && (
          <button
            onClick={openPicker}
            className="mt-4 flex w-full items-center gap-3 rounded-3xl bg-ink p-4 text-left text-white shadow-lg transition active:scale-[0.99]"
          >
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-brand-600">
              <Icon name="pin" />
            </span>
            <span className="flex-1">
              <span className="block font-bold">¿Dónde te lo llevamos?</span>
              <span className="block text-sm text-white/70">Indica tu dirección para ver el envío y los tiempos reales.</span>
            </span>
            <Icon name="right" className="size-5 text-white/60" />
          </button>
        )}

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
                  category === c.id ? 'bg-ink text-white shadow-md' : 'bg-white text-neutral-700 ring-1 ring-neutral-200 hover:ring-neutral-300'
                }`}
              >
                <span>{c.icon}</span>
                {c.label}
              </button>
            ))}
          </div>
        </div>

        {loading && !restaurants ? (
          <Loading label="Buscando restaurantes…" />
        ) : error ? (
          <div className="my-6">
            <ErrorBox error={error} onRetry={reload} />
          </div>
        ) : (
          <>
            <div className="mt-4 mb-5 flex items-center justify-between">
              <p className="text-sm text-neutral-500">
                <strong className="text-ink">{open.length}</strong> abiertos · <strong className="text-ink">{closed.length}</strong> cerrados
              </p>
              <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold">
                Solo abiertos
                <input type="checkbox" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} className="peer sr-only" />
                <span className="relative h-6 w-11 rounded-full bg-neutral-300 transition after:absolute after:top-0.5 after:left-0.5 after:size-5 after:rounded-full after:bg-white after:shadow after:transition peer-checked:bg-brand-600 peer-checked:after:translate-x-5 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-400" />
              </label>
            </div>

            {open.length > 0 && (
              <section className="mb-10">
                <SectionTitle>Abiertos ahora</SectionTitle>
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {open.map(({ r, km }) => (
                    <RestaurantCard key={r.id} restaurant={r} km={km} now={now} />
                  ))}
                </div>
              </section>
            )}

            {!onlyOpen && closed.length > 0 && (
              <section className="mb-10">
                <SectionTitle>Cerrados · programa tu pedido</SectionTitle>
                <p className="-mt-2 mb-4 text-sm text-neutral-500">Pide ahora y te lo llevamos en cuanto abran, a la hora que elijas.</p>
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {closed.map(({ r, km }) => (
                    <RestaurantCard key={r.id} restaurant={r} km={km} now={now} />
                  ))}
                </div>
              </section>
            )}

            {!onlyOpen && far.length > 0 && (
              <section className="mb-10 opacity-70">
                <SectionTitle>Fuera de tu zona de reparto</SectionTitle>
                <p className="-mt-2 mb-4 text-sm text-neutral-500">Repartimos hasta {String(settings.delivery_max_km).replace('.', ',')} km desde cada restaurante.</p>
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {far.map(({ r, km }) => (
                    <RestaurantCard key={r.id} restaurant={r} km={km} now={now} outOfRange />
                  ))}
                </div>
              </section>
            )}

            {open.length + closed.length + far.length === 0 && (
              <div className="py-20 text-center">
                <p className="text-5xl">🐰💨</p>
                <p className="mt-4 text-lg font-bold">{query ? `No encontramos nada con «${query}»` : 'Todavía no hay restaurantes aquí'}</p>
                <p className="text-neutral-500">Prueba con otra búsqueda o categoría.</p>
              </div>
            )}
          </>
        )}
      </main>
      <Footer />
    </>
  )
}

function Hero() {
  return (
    <section className="relative mt-4 overflow-hidden rounded-[28px] bg-gradient-to-br from-brand-600 via-brand-600 to-brand-800 px-6 py-7 text-white shadow-xl shadow-brand-600/20 sm:px-10 sm:py-10">
      <div className="speed-lines pointer-events-none absolute inset-y-0 left-0 w-2/3 opacity-60 [mask-image:linear-gradient(90deg,black,transparent)]" />
      <div className="relative z-10 max-w-[62%] sm:max-w-md">
        <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-3 py-1 text-xs font-bold backdrop-blur">
          <Icon name="bolt" className="size-3.5" /> Lo mejor de Gran Canaria
        </span>
        <h1 className="mt-3 font-display text-3xl leading-[0.95] font-black tracking-tight italic sm:text-5xl">
          Tu comida,
          <br />a toda liebre.
        </h1>
        <p className="mt-3 max-w-[11rem] text-sm text-white/85 sm:max-w-none sm:text-base">En tu puerta. Y si está cerrado, lo programas.</p>
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
