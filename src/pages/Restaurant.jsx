import { useMemo, useState } from 'react'
import Icon from '../components/Icon.jsx'
import TopBar from '../components/TopBar.jsx'
import DishSheet from '../components/DishSheet.jsx'
import CartPanel from '../components/CartPanel.jsx'
import { AllergenChips, SafeImg, Sheet, StatusPill, useNow } from '../components/ui.jsx'
import { getRestaurant } from '../data/restaurants.js'
import { ALLERGENS, ALLERGEN_KEYS } from '../data/allergens.js'
import { useCart } from '../lib/cart.jsx'
import { compact, money } from '../lib/format.js'
import { DAY_SHORT, formatHour, getStatus, relativeDay, weekScheduleText } from '../lib/time.js'
import { goBack } from '../lib/router.js'

export default function Restaurant({ id }) {
  const r = getRestaurant(id)
  const now = useNow()
  const cart = useCart()
  const [selected, setSelected] = useState(null)
  const [excluded, setExcluded] = useState([])
  const [filterOpen, setFilterOpen] = useState(false)
  const [showHours, setShowHours] = useState(false)
  const [pending, setPending] = useState(null) // añadido que reemplaza la cesta de otro restaurante

  const sections = useMemo(
    () =>
      r?.menu
        .map((s) => ({ ...s, dishes: s.dishes.filter((d) => !d.allergens.some((a) => excluded.includes(a))) }))
        .filter((s) => s.dishes.length) ?? [],
    [r, excluded],
  )

  if (!r)
    return (
      <>
        <TopBar />
        <div className="py-24 text-center">
          <p className="text-5xl">🥕</p>
          <p className="mt-3 font-bold">Este restaurante no existe</p>
          <a href="#/" className="mt-4 inline-block font-semibold text-brand-600">
            Volver al inicio
          </a>
        </div>
      </>
    )

  const status = getStatus(r, now)
  const qtyInCart = (dishId) =>
    cart.restaurantId === r.id ? cart.items.filter((i) => i.dishId === dishId).reduce((n, i) => n + i.qty, 0) : 0

  const handleAdd = (dish, qty, note) => {
    if (cart.restaurantId && cart.restaurantId !== r.id && cart.items.length) {
      setPending({ dish, qty, note })
      return
    }
    cart.add(r.id, dish, qty, note)
  }

  return (
    <>
      <div className="hidden sm:block">
        <TopBar />
      </div>

      {/* Portada */}
      <div className="relative mx-auto max-w-6xl sm:mt-4 sm:px-6">
        <div className="relative h-56 overflow-hidden sm:h-72 sm:rounded-[28px]">
          <SafeImg src={r.cover} alt={r.name} className={`size-full ${status.open ? '' : 'grayscale-[60%]'}`} />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-black/30" />
          <div className="absolute inset-x-0 top-0 flex justify-between p-4 pt-[max(1rem,env(safe-area-inset-top))]">
            <button
              onClick={() => goBack('/')}
              className="grid size-10 place-items-center rounded-full bg-white/90 text-ink shadow-lg backdrop-blur transition active:scale-90"
              aria-label="Volver"
            >
              <Icon name="back" />
            </button>
            <button
              className="grid size-10 place-items-center rounded-full bg-white/90 text-brand-600 shadow-lg backdrop-blur transition active:scale-90"
              aria-label="Guardar en favoritos"
            >
              <Icon name="heart" />
            </button>
          </div>
          <div className="absolute inset-x-0 bottom-0 p-5 pb-10 text-white sm:p-8 sm:pb-12">
            <StatusPill restaurant={r} now={now} className="mb-2" />
            <h1 className="font-display text-3xl font-black italic tracking-tight sm:text-5xl">{r.name}</h1>
            <p className="text-sm font-medium text-white/80">
              {r.cuisine} · {r.address}
            </p>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:grid lg:grid-cols-[1fr_360px] lg:gap-8">
        <main className="min-w-0">
          {/* Ficha */}
          <div className="relative -mt-6 grid grid-cols-4 divide-x divide-neutral-100 rounded-3xl bg-white p-3 shadow-lg ring-1 ring-neutral-200/60">
            <Stat label={`${compact(r.reviews)} reseñas`}>
              <Icon name="star" className="size-4 text-amber-400" />
              {r.rating.toString().replace('.', ',')}
            </Stat>
            <Stat label="minutos">
              {r.eta[0]}–{r.eta[1]}
            </Stat>
            <Stat label="envío">{r.deliveryFee === 0 ? 'Gratis' : money(r.deliveryFee)}</Stat>
            <Stat label="pedido mín.">{money(r.minOrder)}</Stat>
          </div>

          {!status.open && (
            <div className="mt-4 flex gap-3 rounded-3xl bg-ink p-4 text-white">
              <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-brand-600">
                <Icon name="calendar" />
              </span>
              <div>
                <p className="font-bold">Ahora mismo está cerrado</p>
                <p className="text-sm text-white/75">
                  {status.opensAt
                    ? `Abre ${relativeDay(status.opensAt, now)} a las ${formatHour(status.opensAt)}. `
                    : ''}
                  Puedes hacer tu pedido ya y elegir la hora de entrega dentro de su horario.
                </p>
              </div>
            </div>
          )}

          {/* Horario */}
          <div className="mt-4 rounded-3xl bg-white ring-1 ring-neutral-200/70">
            <button
              onClick={() => setShowHours((v) => !v)}
              className="flex w-full items-center justify-between px-4 py-3.5 text-left"
              aria-expanded={showHours}
            >
              <span className="flex items-center gap-2 text-sm font-bold">
                <Icon name="clock" className="size-4 text-brand-600" />
                Horario · Hoy: {weekScheduleText(r.hours[now.getDay()])}
              </span>
              <Icon name="down" className={`size-4 transition ${showHours ? 'rotate-180' : ''}`} />
            </button>
            {showHours && (
              <ul className="grid gap-1 px-4 pb-4 text-sm">
                {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                  <li
                    key={d}
                    className={`flex justify-between rounded-xl px-3 py-1.5 ${
                      d === now.getDay() ? 'bg-brand-50 font-bold text-brand-700' : 'text-neutral-600'
                    }`}
                  >
                    <span>{DAY_SHORT[d]}</span>
                    <span>{weekScheduleText(r.hours[d])}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Navegación por secciones + filtro de alérgenos */}
          <div className="sticky top-0 z-20 -mx-4 mt-4 flex items-center gap-2 bg-neutral-50/90 px-4 py-3 backdrop-blur-xl sm:top-[69px] sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0">
            <div className="no-scrollbar flex flex-1 gap-2 overflow-x-auto">
              {sections.map((s) => (
                <a
                  key={s.title}
                  href={`#/r/${r.id}`}
                  onClick={(e) => {
                    e.preventDefault()
                    document.getElementById(`sec-${s.title}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                  }}
                  className="shrink-0 rounded-full bg-white px-4 py-2 text-sm font-semibold ring-1 ring-neutral-200 hover:ring-neutral-300"
                >
                  {s.title}
                </a>
              ))}
            </div>
            <button
              onClick={() => setFilterOpen(true)}
              className={`flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-bold transition ${
                excluded.length ? 'bg-brand-600 text-white' : 'bg-ink text-white'
              }`}
            >
              <Icon name="filter" className="size-4" />
              Alérgenos{excluded.length ? ` (${excluded.length})` : ''}
            </button>
          </div>

          {sections.map((s) => (
            <section key={s.title} id={`sec-${s.title}`} className="scroll-mt-20 pt-4 sm:scroll-mt-36">
              <h2 className="mb-3 font-display text-xl font-extrabold italic tracking-tight">{s.title}</h2>
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                {s.dishes.map((d) => (
                  <DishCard
                    key={d.id}
                    dish={d}
                    inCart={qtyInCart(d.id)}
                    onOpen={() => setSelected(d)}
                    onQuickAdd={() => handleAdd(d, 1, '')}
                  />
                ))}
              </div>
            </section>
          ))}

          {sections.length === 0 && (
            <div className="py-16 text-center">
              <p className="text-4xl">🥗</p>
              <p className="mt-3 font-bold">Ningún plato cumple el filtro de alérgenos</p>
              <button onClick={() => setExcluded([])} className="mt-2 font-semibold text-brand-600">
                Quitar filtros
              </button>
            </div>
          )}

          <p className="mt-8 mb-28 rounded-2xl bg-amber-50 p-4 text-xs leading-relaxed text-amber-900 ring-1 ring-amber-200 lg:mb-10">
            <b>Información sobre alérgenos.</b> Los platos se elaboran en cocinas donde se manipulan los 14 alérgenos
            de declaración obligatoria (Reglamento UE 1169/2011); pueden existir trazas. Si tienes alguna alergia o
            intolerancia, indícalo en la nota del plato o contacta con el restaurante.
          </p>
        </main>

        <aside className="hidden lg:block">
          <div className="sticky top-[85px] mt-4">
            <CartPanel compact />
          </div>
        </aside>
      </div>

      {/* Barra flotante de cesta en móvil */}
      {cart.count > 0 && cart.restaurantId === r.id && (
        <a
          href="#/cesta"
          className="fixed inset-x-4 bottom-[calc(env(safe-area-inset-bottom)+4.75rem)] z-30 flex animate-slide-up items-center justify-between rounded-2xl bg-brand-600 px-5 py-4 font-bold text-white shadow-2xl shadow-brand-600/40 transition active:scale-[0.98] sm:bottom-6 sm:left-auto sm:w-96 lg:hidden"
        >
          <span className="flex items-center gap-3">
            <span className="grid size-7 place-items-center rounded-full bg-white text-sm text-brand-600">{cart.count}</span>
            {status.open ? 'Ver pedido' : 'Programar pedido'}
          </span>
          <span>{money(cart.subtotal)}</span>
        </a>
      )}

      <DishSheet
        dish={selected}
        restaurant={r}
        closed={!status.open}
        onClose={() => setSelected(null)}
        onAdd={(qty, note) => {
          handleAdd(selected, qty, note)
          setSelected(null)
        }}
      />

      <Sheet open={filterOpen} onClose={() => setFilterOpen(false)} label="Filtrar por alérgenos">
        <div className="p-6">
          <h3 className="text-xl font-extrabold">Ocultar platos con…</h3>
          <p className="mt-1 text-sm text-neutral-500">Marca los alérgenos que quieres evitar.</p>
          <div className="mt-5 grid grid-cols-2 gap-2">
            {ALLERGEN_KEYS.map((k) => {
              const on = excluded.includes(k)
              return (
                <button
                  key={k}
                  onClick={() => setExcluded((ex) => (on ? ex.filter((x) => x !== k) : [...ex, k]))}
                  className={`flex items-center gap-2 rounded-2xl px-3 py-2.5 text-left text-sm font-semibold ring-1 transition ${
                    on ? 'bg-brand-50 text-brand-700 ring-brand-500' : 'bg-white ring-neutral-200'
                  }`}
                >
                  <span className="text-lg">{ALLERGENS[k].icon}</span>
                  {ALLERGENS[k].name}
                  {on && <Icon name="check" className="ml-auto size-4" />}
                </button>
              )
            })}
          </div>
          <div className="mt-6 flex gap-3">
            <button onClick={() => setExcluded([])} className="flex-1 rounded-2xl bg-neutral-100 py-3.5 font-bold">
              Limpiar
            </button>
            <button onClick={() => setFilterOpen(false)} className="flex-[2] rounded-2xl bg-brand-600 py-3.5 font-bold text-white">
              Aplicar
            </button>
          </div>
        </div>
      </Sheet>

      <Sheet open={!!pending} onClose={() => setPending(null)} label="Cambiar de restaurante">
        <div className="p-6 text-center">
          <p className="text-4xl">🛍️</p>
          <h3 className="mt-3 text-xl font-extrabold">¿Empezar una cesta nueva?</h3>
          <p className="mt-1 text-sm text-neutral-500">
            Tu cesta tiene productos de <b>{cart.restaurant?.name}</b>. Si añades este plato, se vaciará.
          </p>
          <div className="mt-6 flex gap-3">
            <button onClick={() => setPending(null)} className="flex-1 rounded-2xl bg-neutral-100 py-3.5 font-bold">
              Cancelar
            </button>
            <button
              onClick={() => {
                cart.clear()
                cart.add(r.id, pending.dish, pending.qty, pending.note)
                setPending(null)
              }}
              className="flex-1 rounded-2xl bg-brand-600 py-3.5 font-bold text-white"
            >
              Nueva cesta
            </button>
          </div>
        </div>
      </Sheet>
    </>
  )
}

function Stat({ children, label }) {
  return (
    <div className="flex flex-col items-center px-1 text-center">
      <span className="flex items-center gap-1 text-[15px] font-extrabold whitespace-nowrap">{children}</span>
      <span className="text-[11px] font-medium text-neutral-500">{label}</span>
    </div>
  )
}

function DishCard({ dish: d, inCart, onOpen, onQuickAdd }) {
  return (
    <article className="group relative flex gap-3 rounded-3xl bg-white p-3 ring-1 ring-neutral-200/70 transition hover:shadow-lg hover:shadow-neutral-900/5">
      <button onClick={onOpen} className="absolute inset-0 z-0 rounded-3xl" aria-label={`Ver ${d.name}`} />
      <div className="pointer-events-none relative z-10 flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap gap-1">
          {d.tags.includes('popular') && (
            <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-bold text-brand-700">🔥 Top ventas</span>
          )}
          {d.tags.includes('vegano') && (
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">🌱 Vegano</span>
          )}
          {d.tags.includes('vegetariano') && (
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">🥕 Veggie</span>
          )}
          {d.tags.includes('picante') && (
            <span className="rounded-full bg-orange-50 px-2 py-0.5 text-[11px] font-bold text-orange-700">🌶️ Picante</span>
          )}
        </div>
        <h3 className="mt-1 font-extrabold leading-tight tracking-tight">{d.name}</h3>
        <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-neutral-500">{d.description}</p>
        <p className="mt-1.5 text-[11px] font-medium text-neutral-400">
          {d.portion} · {d.kcal} kcal · {compact(d.orders)} pedidos
        </p>
        <div className="mt-auto flex items-center justify-between gap-2 pt-2">
          <span className="text-base font-extrabold">{money(d.price)}</span>
          <AllergenChips allergens={d.allergens} />
        </div>
      </div>
      <div className="relative z-10 shrink-0">
        <SafeImg src={d.image} alt={d.name} className="pointer-events-none size-28 rounded-2xl sm:size-32" />
        <button
          onClick={onQuickAdd}
          className={`absolute -right-1 -bottom-1 grid h-9 min-w-9 place-items-center rounded-full px-2 text-sm font-bold shadow-lg ring-4 ring-white transition active:scale-90 ${
            inCart ? 'bg-ink text-white' : 'bg-brand-600 text-white'
          }`}
          aria-label={`Añadir ${d.name}`}
        >
          {inCart ? `${inCart}` : <Icon name="plus" className="size-5" strokeWidth={2.6} />}
        </button>
      </div>
    </article>
  )
}
