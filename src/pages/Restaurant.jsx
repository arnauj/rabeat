import { useEffect, useMemo, useState } from 'react'
import Icon from '../components/Icon.jsx'
import TopBar from '../components/TopBar.jsx'
import DishSheet from '../components/DishSheet.jsx'
import CartPanel from '../components/CartPanel.jsx'
import { AllergenChips, Cover, ErrorBox, Loading, SafeImg, Sheet, StatusPill, useNow, useRestaurantStatus, useToast } from '../components/ui.jsx'
import { getRestaurant } from '../lib/data.js'
import { useAsync } from '../lib/useAsync.js'
import { ALLERGENS, ALLERGEN_KEYS } from '../data/allergens.js'
import { DISH_TAGS } from '../data/categories.js'
import { useCart } from '../lib/cart.jsx'
import { useAuth } from '../lib/auth.jsx'
import { useLocation } from '../lib/location.jsx'
import { useSettings } from '../lib/settings.jsx'
import { supabase } from '../lib/supabase.js'
import { compact, km as fmtKm, money, rating } from '../lib/format.js'
import { DAY_SHORT, formatHour, relativeDay, todayWeekday, weekdayScheduleText } from '../lib/time.js'
import { deliveryDistanceKm, deliveryFee, etaMinutes, inDeliveryRange } from '../lib/pricing.js'
import { goBack, navigate } from '../lib/router.js'
import { dishAllergens, minBasePrice, weekdayScheduleSummary } from '../lib/dishes.js'

export default function Restaurant({ slug }) {
  const { data: r, error, loading, reload } = useAsync(() => getRestaurant(slug), [slug])
  const now = useNow()
  const cart = useCart()
  const { settings } = useSettings()
  const { address, openPicker } = useLocation()
  const [selected, setSelected] = useState(null)
  const [excluded, setExcluded] = useState([])
  const [filterOpen, setFilterOpen] = useState(false)
  const [showHours, setShowHours] = useState(false)
  const [pending, setPending] = useState(null)

  // Mantiene la cesta al día con precios y disponibilidad reales
  useEffect(() => {
    if (r && cart.restaurantId === r.id) cart.sync(r.dishes)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r])

  const sections = useMemo(
    () =>
      r?.menu
        .map((s) => ({ ...s, dishes: s.dishes.filter((d) => d.available && !dishAllergens(d).some((a) => excluded.includes(a))) }))
        .filter((s) => s.dishes.length) ?? [],
    [r, excluded],
  )
  const status = useRestaurantStatus(r, now)

  if (loading && !r) return <Loading />
  if (error)
    return (
      <div className="p-6">
        <ErrorBox error={error} onRetry={reload} />
      </div>
    )
  if (!r)
    return (
      <>
        <TopBar />
        <div className="py-24 text-center">
          <p className="text-5xl">🥕</p>
          <p className="mt-3 font-bold">Este restaurante no existe o no está disponible</p>
          <a href="#/" className="mt-4 inline-block font-semibold text-brand-600">
            Volver al inicio
          </a>
        </div>
      </>
    )

  const dineIn = cart.isDineIn(r.id)
  const km = address && !dineIn ? deliveryDistanceKm(r, address) : null
  const inRange = dineIn || !address || inDeliveryRange(km, settings)
  const [etaA, etaB] = etaMinutes(r, km)
  const tz = settings.timezone
  const qtyInCart = (dishId) => (cart.restaurantId === r.id ? cart.items.filter((i) => i.dishId === dishId).reduce((n, i) => n + i.qty, 0) : 0)

  const handleAdd = (dish, qty, note, selection = null) => {
    if (cart.restaurantId && cart.restaurantId !== r.id && cart.items.length) return setPending({ dish, qty, note, selection })
    cart.add(r, dish, qty, note, selection)
  }

  return (
    <>
      <div className="hidden sm:block">
        <TopBar />
      </div>

      <div className="relative mx-auto max-w-6xl sm:mt-4 sm:px-6">
        <div className={`relative overflow-hidden sm:rounded-[28px] ${r.cover_is_logo ? 'h-72 sm:h-80' : 'h-56 sm:h-72'}`}>
          <Cover restaurant={r} variant="header" className={`size-full ${status.open ? '' : 'grayscale-[60%]'}`} />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-black/30" />
          <div className="absolute inset-x-0 top-0 flex justify-between p-4 pt-[max(1rem,env(safe-area-inset-top))]">
            <button onClick={() => goBack('/')} className="grid size-10 place-items-center rounded-full bg-white/90 text-ink shadow-lg backdrop-blur transition active:scale-90" aria-label="Volver">
              <Icon name="back" />
            </button>
            <FavoriteButton restaurantId={r.id} />
          </div>
          <div className="absolute inset-x-0 bottom-0 p-5 pb-10 text-white sm:p-8 sm:pb-12">
            <StatusPill restaurant={r} now={now} className="mb-2" />
            <h1 className="font-display text-3xl font-black tracking-tight italic sm:text-5xl">{r.name}</h1>
            <p className="text-sm font-medium text-white/80">
              {r.cuisine}
              {r.address && ` · ${r.address}`}
            </p>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:grid lg:grid-cols-[1fr_360px] lg:gap-8">
        <main className="min-w-0">
          <div className="relative -mt-6 grid grid-cols-4 divide-x divide-neutral-100 rounded-3xl bg-white p-3 shadow-lg ring-1 ring-neutral-200/60">
            <Stat label={r.rating_count ? `${compact(r.rating_count)} reseñas` : 'sin reseñas'}>
              <Icon name="star" className="size-4 text-amber-400" />
              {rating(r)}
            </Stat>
            {dineIn ? (
              <>
                <Stat label="min en cocina">
                  {r.prep_min}–{r.prep_max}
                </Stat>
                <Stat label="envío">Gratis</Stat>
                <Stat label="pides desde">{cart.table.name}</Stat>
              </>
            ) : (
              <>
                <Stat label="minutos">
                  {etaA}–{etaB}
                </Stat>
                <Stat label={km == null ? 'envío desde' : `envío · ${fmtKm(km)}`}>{money(km == null ? settings.delivery_base_fee : deliveryFee(km, settings))}</Stat>
                <Stat label="pedido mín.">{money(r.min_order)}</Stat>
              </>
            )}
          </div>

          {dineIn && (
            <div className="mt-4 flex items-center gap-3 rounded-3xl bg-brand-600 p-4 text-white shadow-lg shadow-brand-600/25">
              <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-white/20 text-2xl">🍽️</span>
              <div className="min-w-0 flex-1">
                <p className="font-extrabold">Estás en la {cart.table.name}</p>
                <p className="text-sm text-white/85">Pide desde el móvil y te lo llevan a la mesa. Sin gastos de envío.</p>
              </div>
              <button
                onClick={() => cart.setTable(null)}
                className="shrink-0 rounded-full bg-white/15 px-3 py-1.5 text-xs font-bold ring-1 ring-white/30"
              >
                Pedir a domicilio
              </button>
            </div>
          )}

          {r.description && <p className="mt-4 text-sm leading-relaxed text-neutral-600">{r.description}</p>}

          {!inRange && (
            <button onClick={openPicker} className="mt-4 flex w-full gap-3 rounded-3xl bg-brand-50 p-4 text-left ring-1 ring-brand-200">
              <span className="text-2xl">📍</span>
              <span>
                <span className="block font-bold text-brand-800">Tu dirección está fuera de su zona ({fmtKm(km)})</span>
                <span className="block text-sm text-brand-700">Repartimos hasta {fmtKm(settings.delivery_max_km)}. Toca para cambiar la dirección.</span>
              </span>
            </button>
          )}

          {!r.accepting_orders ? (
            <Banner title="Pedidos en pausa" text="El restaurante ha pausado los pedidos temporalmente. Vuelve a intentarlo más tarde." />
          ) : dineIn ? (
            !status.open && <Banner title="La cocina está cerrada" text="Ahora mismo no se pueden hacer pedidos desde la mesa." />
          ) : (
            !status.open && (
              <Banner
                title="Ahora mismo está cerrado"
                text={`${status.opensAt ? `Abre ${relativeDay(status.opensAt, now, tz)} a las ${formatHour(status.opensAt, tz)}. ` : ''}Puedes hacer tu pedido ya y elegir la hora de entrega dentro de su horario.`}
              />
            )
          )}

          <div className="mt-4 rounded-3xl bg-white ring-1 ring-neutral-200/70">
            <button onClick={() => setShowHours((v) => !v)} className="flex w-full items-center justify-between px-4 py-3.5 text-left" aria-expanded={showHours}>
              <span className="flex items-center gap-2 text-sm font-bold">
                <Icon name="clock" className="size-4 text-brand-600" />
                Horario · Hoy: {weekdayScheduleText(r.opening_hours, todayWeekday(now, tz))}
              </span>
              <Icon name="down" className={`size-4 transition ${showHours ? 'rotate-180' : ''}`} />
            </button>
            {showHours && (
              <ul className="grid gap-1 px-4 pb-4 text-sm">
                {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                  <li key={d} className={`flex justify-between rounded-xl px-3 py-1.5 ${d === todayWeekday(now, tz) ? 'bg-brand-50 font-bold text-brand-700' : 'text-neutral-600'}`}>
                    <span>{DAY_SHORT[d]}</span>
                    <span>{weekdayScheduleText(r.opening_hours, d)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="sticky top-0 z-20 -mx-4 mt-4 flex items-center gap-2 bg-neutral-50/90 px-4 py-3 backdrop-blur-xl sm:top-[69px] sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0">
            <div className="no-scrollbar flex flex-1 gap-2 overflow-x-auto">
              {sections.map((s) => (
                <button
                  key={s.id}
                  onClick={() => document.getElementById(`sec-${s.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                  className="shrink-0 rounded-full bg-white px-4 py-2 text-sm font-semibold ring-1 ring-neutral-200 hover:ring-neutral-300"
                >
                  {s.name}
                </button>
              ))}
            </div>
            <button
              onClick={() => setFilterOpen(true)}
              className={`flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-bold text-white transition ${excluded.length ? 'bg-brand-600' : 'bg-ink'}`}
            >
              <Icon name="filter" className="size-4" />
              Alérgenos{excluded.length ? ` (${excluded.length})` : ''}
            </button>
          </div>

          {sections.map((s) => (
            <section key={s.id} id={`sec-${s.id}`} className="scroll-mt-20 pt-4 sm:scroll-mt-36">
              <h2 className="mb-3 font-display text-xl font-extrabold tracking-tight italic">{s.name}</h2>
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                {s.dishes.map((d) => (
                  <DishCard
                    key={d.id}
                    dish={d}
                    price={cart.priceOf(minBasePrice(d), r.id, d.tax_pct)}
                    inCart={qtyInCart(d.id)}
                    onOpen={() => setSelected(d)}
                    onQuickAdd={r.accepting_orders && (!dineIn || status.open) ? () => (d.groups.length ? setSelected(d) : handleAdd(d, 1, '')) : null}
                  />
                ))}
              </div>
            </section>
          ))}

          {sections.length === 0 && (
            <div className="py-16 text-center">
              <p className="text-4xl">🥗</p>
              {excluded.length ? (
                <>
                  <p className="mt-3 font-bold">Ningún plato cumple el filtro de alérgenos</p>
                  <button onClick={() => setExcluded([])} className="mt-2 font-semibold text-brand-600">
                    Quitar filtros
                  </button>
                </>
              ) : (
                <p className="mt-3 font-bold">Este restaurante aún no ha publicado su carta</p>
              )}
            </div>
          )}

          <p className="mt-8 mb-28 rounded-2xl bg-amber-50 p-4 text-xs leading-relaxed text-amber-900 ring-1 ring-amber-200 lg:mb-10">
            <b>Información sobre alérgenos.</b> Los platos se elaboran en cocinas donde se manipulan los 14 alérgenos de declaración obligatoria
            (Reglamento UE 1169/2011); pueden existir trazas. Si tienes alguna alergia o intolerancia, indícalo en la nota del plato
            {r.phone && (
              <>
                {' '}
                o llama al restaurante:{' '}
                <a className="font-bold underline" href={`tel:${r.phone.replace(/\s/g, '')}`}>
                  {r.phone}
                </a>
              </>
            )}
            .
          </p>
        </main>

        <aside className="hidden lg:block">
          <div className="sticky top-[85px] mt-4">
            <CartPanel compact />
          </div>
        </aside>
      </div>

      {cart.count > 0 && cart.restaurantId === r.id && (
        <a
          href="#/cesta"
          className="fixed inset-x-4 bottom-[calc(env(safe-area-inset-bottom)+4.75rem)] z-30 flex animate-slide-up items-center justify-between rounded-2xl bg-brand-600 px-5 py-4 font-bold text-white shadow-2xl shadow-brand-600/40 transition active:scale-[0.98] sm:bottom-6 sm:left-auto sm:w-96 lg:hidden"
        >
          <span className="flex items-center gap-3">
            <span className="grid size-7 place-items-center rounded-full bg-white text-sm text-brand-600">{cart.count}</span>
            {dineIn ? `Ver pedido · ${cart.table.name}` : status.open ? 'Ver pedido' : 'Programar pedido'}
          </span>
          <span>{money(cart.subtotal)}</span>
        </a>
      )}

      <DishSheet
        dish={selected}
        restaurant={r}
        priceOf={(base) => cart.priceOf(base, r.id, selected?.tax_pct)}
        closed={!status.open && !dineIn}
        canOrder={r.accepting_orders && (!dineIn || status.open)}
        onClose={() => setSelected(null)}
        onAdd={(qty, note, selection) => {
          handleAdd(selected, qty, note, selection)
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
                  className={`flex items-center gap-2 rounded-2xl px-3 py-2.5 text-left text-sm font-semibold ring-1 transition ${on ? 'bg-brand-50 text-brand-700 ring-brand-500' : 'bg-white ring-neutral-200'}`}
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
                cart.add(r, pending.dish, pending.qty, pending.note, pending.selection)
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

function Banner({ title, text }) {
  return (
    <div className="mt-4 flex gap-3 rounded-3xl bg-ink p-4 text-white">
      <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-brand-600">
        <Icon name="calendar" />
      </span>
      <div>
        <p className="font-bold">{title}</p>
        <p className="text-sm text-white/75">{text}</p>
      </div>
    </div>
  )
}

function FavoriteButton({ restaurantId }) {
  const { user } = useAuth()
  const toast = useToast()
  const [fav, setFav] = useState(false)

  useEffect(() => {
    if (!user) return setFav(false)
    supabase
      .from('favorites')
      .select('restaurant_id')
      .eq('user_id', user.id)
      .eq('restaurant_id', restaurantId)
      .maybeSingle()
      .then(({ data }) => setFav(!!data))
  }, [user, restaurantId])

  const toggle = async () => {
    if (!user) {
      toast('Inicia sesión para guardar favoritos')
      return navigate(`/entrar?next=${encodeURIComponent(window.location.hash.slice(1))}`)
    }
    setFav(!fav)
    const { error } = fav
      ? await supabase.from('favorites').delete().eq('user_id', user.id).eq('restaurant_id', restaurantId)
      : await supabase.from('favorites').insert({ user_id: user.id, restaurant_id: restaurantId })
    if (error) {
      setFav(fav)
      toast(error.message, 'error')
    } else toast(fav ? 'Quitado de favoritos' : 'Guardado en favoritos')
  }

  return (
    <button
      onClick={toggle}
      className={`grid size-10 place-items-center rounded-full shadow-lg backdrop-blur transition active:scale-90 ${fav ? 'bg-brand-600 text-white' : 'bg-white/90 text-brand-600'}`}
      aria-label={fav ? 'Quitar de favoritos' : 'Guardar en favoritos'}
      aria-pressed={fav}
    >
      <Icon name="heart" />
    </button>
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

function DishCard({ dish: d, price, inCart, onOpen, onQuickAdd }) {
  const popular = d.orders_count >= 1000
  const allergens = dishAllergens(d)
  const schedule = weekdayScheduleSummary(d.schedule)
  const variable = d.groups.some((g) => g.options.some((o) => Number(o.price_delta) !== 0) || (Number(g.extra_price) > 0 && g.free_select != null))
  return (
    <article className="group relative flex gap-3 rounded-3xl bg-white p-3 ring-1 ring-neutral-200/70 transition hover:shadow-lg hover:shadow-neutral-900/5">
      <button onClick={onOpen} className="absolute inset-0 z-0 rounded-3xl" aria-label={`Ver ${d.name}`} />
      <div className="pointer-events-none relative z-10 flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap gap-1">
          {popular && <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-bold text-brand-700">🔥 Top ventas</span>}
          {schedule && <span className="rounded-full bg-ink px-2 py-0.5 text-[11px] font-bold text-white">🕒 {schedule}</span>}
          {d.groups.length > 0 && <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-bold text-violet-700">✨ Personalizable</span>}
          {DISH_TAGS.filter((t) => d.tags.includes(t.id)).map((t) => (
            <span key={t.id} className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${t.cls}`}>
              {t.label}
            </span>
          ))}
        </div>
        <h3 className="mt-1 leading-tight font-extrabold tracking-tight">
          {d.code && <span className="mr-1 text-neutral-400">{d.code}.</span>}
          {d.name}
        </h3>
        {d.name_en && <p className="text-[12px] text-neutral-400 italic">{d.name_en}</p>}
        <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-neutral-500">{d.description}</p>
        <p className="mt-1.5 text-[11px] font-medium text-neutral-400">
          {[d.portion, d.kcal && `${d.kcal} kcal`, d.orders_count > 0 && `${compact(d.orders_count)} pedidos`].filter(Boolean).join(' · ')}
        </p>
        <div className="mt-auto flex items-center justify-between gap-2 pt-2">
          <span className="text-base font-extrabold">
            {variable && <span className="text-xs font-semibold text-neutral-400">desde </span>}
            {money(price)}
          </span>
          {allergens.length || !d.groups.length ? <AllergenChips allergens={allergens} /> : null}
        </div>
      </div>
      <div className={`relative z-10 shrink-0 ${d.image_url ? '' : 'flex w-10 items-end'}`}>
        {d.image_url && <SafeImg src={d.image_url} alt={d.name} className="pointer-events-none size-28 rounded-2xl sm:size-32" />}
        {onQuickAdd && (
          <button
            onClick={onQuickAdd}
            className={`${d.image_url ? 'absolute -right-1 -bottom-1' : ''} grid h-9 min-w-9 place-items-center rounded-full px-2 text-sm font-bold text-white shadow-lg ring-4 ring-white transition active:scale-90 ${inCart ? 'bg-ink' : 'bg-brand-600'}`}
            aria-label={`Añadir ${d.name}`}
          >
            {inCart ? `${inCart}` : <Icon name="plus" className="size-5" strokeWidth={2.6} />}
          </button>
        )}
      </div>
    </article>
  )
}
