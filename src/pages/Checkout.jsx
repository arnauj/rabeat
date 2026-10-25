import { useEffect, useMemo, useRef, useState } from 'react'
import Icon from '../components/Icon.jsx'
import { Field, Loading, SafeImg, Cover, useNow, useRestaurantStatus, useToast } from '../components/ui.jsx'
import { useCart } from '../lib/cart.jsx'
import { useAuth } from '../lib/auth.jsx'
import { useLocation } from '../lib/location.jsx'
import { useSettings } from '../lib/settings.jsx'
import { useAsync } from '../lib/useAsync.js'
import { getRestaurant } from '../lib/data.js'
import { callFunction } from '../lib/supabase.js'
import { km as fmtKm, money } from '../lib/format.js'
import { deliverySlots, formatHour, groupSlotsByDay, slotLabel } from '../lib/time.js'
import { deliveryDistanceKm, etaMinutes, inDeliveryRange, quote, ratesFor } from '../lib/pricing.js'
import { goBack, navigate } from '../lib/router.js'
import TaxBreakdown from '../components/TaxBreakdown.jsx'

const TIP_OPTIONS = [0, 1, 2, 3, 5]
const PENDING_KEY = 'rabeat:pendingCheckout'

export default function Checkout({ query }) {
  const { dineIn } = useCart()
  return dineIn ? <DineInCheckout /> : <DeliveryCheckout query={query} />
}

function DeliveryCheckout({ query }) {
  const cart = useCart()
  const now = useNow()
  const toast = useToast()
  const { profile } = useAuth()
  const { settings, config } = useSettings()
  const { address, setAddress, openPicker } = useLocation()
  const { data: r, loading } = useAsync(() => (cart.restaurantId ? getRestaurant(cart.restaurantId, { byId: true }) : null), [cart.restaurantId])
  const status = useRestaurantStatus(r, now)
  const tz = settings.timezone

  // Vuelta desde Stripe tras cancelar: recupera la cesta
  useEffect(() => {
    const cancelled = query?.get('cancelado')
    if (!cancelled) return
    try {
      const saved = JSON.parse(sessionStorage.getItem(PENDING_KEY))
      if (saved?.code === cancelled && !cart.items.length) cart.restore(saved.cart)
      sessionStorage.removeItem(PENDING_KEY)
      toast('Pago cancelado. Tu cesta sigue aquí.', 'error')
    } catch {
      /* nada que recuperar */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const slots = useMemo(() => (r ? deliverySlots(r.opening_hours, now, 3, tz) : []), [r, now, tz])
  const days = useMemo(() => groupSlotsByDay(slots, now, tz), [slots, now, tz])

  const [mode, setMode] = useState('asap')
  const [dayKey, setDayKey] = useState(null)
  const [slot, setSlot] = useState(null)
  const [customer, setCustomer] = useState({ name: '', email: '', phone: '' })
  const [payment, setPayment] = useState('card')
  const [tip, setTip] = useState(2)
  const [customTip, setCustomTip] = useState('')
  const [isCustomTip, setIsCustomTip] = useState(false)
  const [promoInput, setPromoInput] = useState('')
  const [promo, setPromo] = useState('')
  const [serverQuote, setServerQuote] = useState(null)
  const [quoteError, setQuoteError] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [paying, setPaying] = useState(false)
  const [payError, setPayError] = useState('')

  useEffect(() => {
    if (profile) setCustomer((c) => ({ name: c.name || profile.full_name, email: c.email || profile.email, phone: c.phone || profile.phone }))
  }, [profile])

  useEffect(() => {
    if (r && !status.open) setMode('scheduled')
  }, [r, status.open])

  useEffect(() => {
    if (attempt) document.querySelector('[data-error="true"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [attempt])

  const tipAmount = isCustomTip ? Math.max(0, Math.min(Number(settings.max_tip), Number(customTip.replace(',', '.')) || 0)) : tip
  const km = r && address ? deliveryDistanceKm(r, address) : null
  const inRange = km != null && inDeliveryRange(km, settings)

  // Presupuesto del servidor (valida promo, distancia y precios reales)
  const items = useMemo(() => cart.items.map((i) => ({ dish_id: i.dishId, qty: i.qty, note: i.note, options: i.optionIds ?? [] })), [cart.items])
  const reqId = useRef(0)
  useEffect(() => {
    if (!r || !address || !items.length) return
    const id = ++reqId.current
    const t = setTimeout(async () => {
      try {
        const res = await callFunction('create-order', {
          dry_run: true,
          restaurant_id: r.id,
          items,
          address,
          tip: tipAmount,
          promo_code: promo || undefined,
          scheduled_for: mode === 'scheduled' && slot ? slot.toISOString() : null,
        })
        if (id === reqId.current) {
          setServerQuote(res)
          setQuoteError('')
        }
      } catch (e) {
        if (id !== reqId.current) return
        setServerQuote(null)
        setQuoteError(e.message)
        if (promo && /código/i.test(e.message)) setPromo('')
      }
    }, 350)
    return () => clearTimeout(t)
  }, [r, address, items, tipAmount, promo, mode, slot])

  if (loading && !r) return <Loading />
  if (!r || cart.items.length === 0)
    return (
      <div className="grid min-h-dvh place-items-center px-6 text-center">
        <div>
          <img src="rider.png" alt="" className="mx-auto w-32" />
          <p className="mt-4 text-lg font-extrabold">No hay nada que pagar</p>
          <a href="#/" className="mt-3 inline-block font-semibold text-brand-600">
            Buscar restaurantes
          </a>
        </div>
      </div>
    )

  const activeDay = days.find((d) => d.key === dayKey) ?? days[0]
  const local = quote({ items: cart.items.map((i) => ({ base_price: i.basePrice, qty: i.qty, tax_pct: cart.taxRate(i.taxPct) })), settings: ratesFor(settings, r), km: inRange ? km : null, tip: tipAmount })
  const q = serverQuote?.quote ?? local
  const [etaA, etaB] = etaMinutes(r, km)
  const testMode = config?.payments !== 'stripe'

  const errors = {
    address: !address ? 'Indica la dirección de entrega' : !inRange ? `Fuera de la zona de reparto (${fmtKm(km)} · máx. ${fmtKm(settings.delivery_max_km)})` : null,
    slot: mode === 'scheduled' && !slot ? 'Elige una franja de entrega' : null,
    customer:
      !customer.name.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(customer.email) || customer.phone.replace(/\D/g, '').length < 9
        ? 'Completa tu nombre, un email válido y un teléfono de 9 cifras'
        : null,
    min: q.subtotal < Number(r.min_order) ? `El pedido mínimo es ${money(r.min_order)}` : null,
  }
  const hasErrors = Object.values(errors).some(Boolean) || !r.accepting_orders

  const pay = async () => {
    setSubmitted(true)
    setPayError('')
    if (hasErrors) return setAttempt((n) => n + 1)
    setPaying(true)
    try {
      const res = await callFunction('create-order', {
        restaurant_id: r.id,
        items,
        address,
        customer,
        tip: tipAmount,
        promo_code: promo || undefined,
        scheduled_for: mode === 'scheduled' ? slot.toISOString() : null,
        payment_method: payment,
      })
      cart.rememberOrder({ token: res.token, code: res.code, restaurant: r.name, created_at: new Date().toISOString() })
      if (res.checkout_url) {
        sessionStorage.setItem(PENDING_KEY, JSON.stringify({ code: res.code, cart: { items: cart.items, restaurant: cart.restaurant } }))
        cart.clear()
        window.location.href = res.checkout_url
        return
      }
      cart.clear()
      navigate(`/pedido/${res.token}`)
    } catch (e) {
      setPayError(e.message)
      setPaying(false)
    }
  }

  return (
    <div className="min-h-dvh bg-neutral-50 pb-28 lg:pb-0">
      <header className="sticky top-0 z-30 border-b border-neutral-200/70 bg-white/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3 sm:px-6">
          <button onClick={() => goBack('/cesta')} className="grid size-10 place-items-center rounded-full bg-neutral-100" aria-label="Volver">
            <Icon name="back" />
          </button>
          <div>
            <h1 className="text-lg leading-tight font-extrabold">Finalizar pedido</h1>
            <p className="text-xs text-neutral-500">{r.name}</p>
          </div>
          <span className="ml-auto flex items-center gap-1 text-xs font-semibold text-emerald-700">
            <Icon name="check" className="size-4" /> Pago seguro
          </span>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-4 py-5 sm:px-6 lg:grid lg:grid-cols-[1fr_380px] lg:gap-8">
        <main className="space-y-4">
          <Section title="Dirección de entrega" icon="pin" error={submitted && errors.address}>
            {address ? (
              <div className="space-y-3">
                <button onClick={openPicker} className="flex w-full items-center gap-3 rounded-2xl bg-neutral-100 p-3 text-left">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white text-brand-600">
                    <Icon name="pin" className="size-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-bold">{address.street}</span>
                    <span className="block text-xs text-neutral-500">
                      {km != null ? `${fmtKm(km)} del restaurante` : ''} · Cambiar
                    </span>
                  </span>
                  <Icon name="edit" className="size-4 text-neutral-400" />
                </button>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Piso, puerta" placeholder="2ºB" value={address.details ?? ''} onChange={(e) => setAddress({ ...address, details: e.target.value })} />
                  <Field label="Indicaciones" placeholder="Portal verde…" value={address.notes ?? ''} onChange={(e) => setAddress({ ...address, notes: e.target.value })} />
                </div>
              </div>
            ) : (
              <button onClick={openPicker} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-ink py-4 font-bold text-white">
                <Icon name="pin" className="size-5" /> Elegir dirección en el mapa
              </button>
            )}
          </Section>

          <Section title="¿Cuándo lo quieres?" icon="clock" error={submitted && errors.slot}>
            {!status.open && (
              <p className="mb-3 rounded-2xl bg-neutral-900 px-4 py-3 text-sm text-white">
                🌙 {r.name} está cerrado ahora. Elige una hora dentro de su horario y te lo llevamos entonces.
              </p>
            )}
            <div className="grid grid-cols-2 gap-2">
              <Choice
                active={mode === 'asap'}
                disabled={!status.open}
                onClick={() => setMode('asap')}
                title="Lo antes posible"
                subtitle={status.open ? `${etaA}–${etaB} min` : 'No disponible'}
                icon="bolt"
              />
              <Choice
                active={mode === 'scheduled'}
                onClick={() => setMode('scheduled')}
                title="Programar"
                subtitle={slot && mode === 'scheduled' ? slotLabel(slot, now, tz) : 'Elige día y hora'}
                icon="calendar"
              />
            </div>
            {mode === 'scheduled' && (
              <div className="mt-4">
                {days.length === 0 ? (
                  <p className="text-sm text-neutral-500">No hay franjas disponibles en los próximos días.</p>
                ) : (
                  <>
                    <div className="no-scrollbar flex gap-2 overflow-x-auto">
                      {days.map((d) => (
                        <button
                          key={d.key}
                          onClick={() => setDayKey(d.key)}
                          className={`shrink-0 rounded-2xl px-4 py-2 text-left transition ${activeDay?.key === d.key ? 'bg-ink text-white' : 'bg-neutral-100 text-neutral-700'}`}
                        >
                          <span className="block text-sm font-bold first-letter:uppercase">{d.label}</span>
                          <span className="block text-[11px] opacity-70">{d.date.toLocaleDateString('es-ES', { timeZone: tz, day: 'numeric', month: 'short' })}</span>
                        </button>
                      ))}
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
                      {activeDay?.slots.map((s) => {
                        const on = slot?.getTime() === s.getTime()
                        return (
                          <button
                            key={s.toISOString()}
                            onClick={() => setSlot(s)}
                            className={`rounded-xl py-2.5 text-sm font-bold tabular-nums ring-1 transition ${on ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white ring-neutral-200 hover:ring-neutral-400'}`}
                          >
                            {formatHour(s, tz)}
                          </button>
                        )
                      })}
                    </div>
                  </>
                )}
              </div>
            )}
          </Section>

          <Section title="Tus datos" icon="user" error={submitted && errors.customer}>
            <div className="grid gap-3">
              <Field label="Nombre" autoComplete="name" value={customer.name} onChange={(e) => setCustomer({ ...customer, name: e.target.value })} />
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Email (te enviamos la confirmación)" type="email" autoComplete="email" value={customer.email} onChange={(e) => setCustomer({ ...customer, email: e.target.value })} />
                <Field label="Teléfono" type="tel" autoComplete="tel" value={customer.phone} onChange={(e) => setCustomer({ ...customer, phone: e.target.value })} />
              </div>
              {!profile && (
                <p className="text-xs text-neutral-500">
                  Pides como invitado.{' '}
                  <a href="#/entrar?next=/pago" className="font-bold text-brand-600">
                    Inicia sesión
                  </a>{' '}
                  para guardar tu historial.
                </p>
              )}
            </div>
          </Section>

          <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-600 to-brand-800 p-5 text-white shadow-lg shadow-brand-600/20">
            <div className="speed-lines pointer-events-none absolute inset-y-0 left-0 w-1/2 opacity-50 [mask-image:linear-gradient(90deg,black,transparent)]" />
            <img src="rider.png" alt="" className="pointer-events-none absolute top-2 -right-3 w-28 drop-shadow-lg sm:w-36" />
            <div className="relative pr-24 sm:pr-36">
              <h2 className="font-display text-xl font-extrabold italic">Propina para tu rider</h2>
              <p className="mt-1 text-sm text-white/85">El 100&nbsp;% va directo a quien te lleva el pedido. ¡Se agradece cada céntimo! 🐰</p>
            </div>
            <div className="relative z-10 mt-4 grid grid-cols-3 gap-2 sm:grid-cols-6">
              {TIP_OPTIONS.map((t) => {
                const on = !isCustomTip && tip === t
                return (
                  <button
                    key={t}
                    onClick={() => {
                      setIsCustomTip(false)
                      setTip(t)
                    }}
                    className={`rounded-full px-4 py-2 text-sm font-extrabold transition active:scale-95 ${on ? 'bg-white text-brand-700 shadow-lg' : 'bg-white/15 text-white ring-1 ring-white/30 hover:bg-white/25'}`}
                  >
                    {t === 0 ? 'Ahora no' : money(t).replace(',00', '')}
                  </button>
                )
              })}
              <button
                onClick={() => setIsCustomTip(true)}
                className={`rounded-full px-4 py-2 text-sm font-extrabold transition ${isCustomTip ? 'bg-white text-brand-700 shadow-lg' : 'bg-white/15 text-white ring-1 ring-white/30 hover:bg-white/25'}`}
              >
                Otra
              </button>
            </div>
            {isCustomTip && (
              <label className="relative mt-3 flex max-w-48 items-center rounded-2xl bg-white px-4 py-2.5 text-ink">
                <input
                  autoFocus
                  inputMode="decimal"
                  value={customTip}
                  onChange={(e) => setCustomTip(e.target.value.replace(/[^\d.,]/g, '').slice(0, 6))}
                  placeholder="0,00"
                  className="w-full bg-transparent font-bold outline-none"
                  aria-label="Importe de la propina"
                />
                <span className="font-bold text-neutral-400">€</span>
              </label>
            )}
          </section>

          <Section title="Método de pago" icon="card">
            <PaymentMethods
              value={payment}
              onChange={setPayment}
              methods={config?.methods}
              testMode={testMode}
            />
          </Section>
        </main>

        <aside className="mt-4 lg:mt-0">
          <div className="space-y-4 lg:sticky lg:top-24">
            <div className="rounded-3xl bg-white p-5 ring-1 ring-neutral-200/70">
              <div className="flex items-center gap-3">
                <Cover restaurant={r} variant="thumb" className="size-12 rounded-2xl" />
                <div>
                  <p className="font-extrabold">{r.name}</p>
                  <p className="text-xs text-neutral-500">
                    {cart.count} producto{cart.count !== 1 && 's'} · {mode === 'asap' ? `Llega en ${etaA}–${etaB} min` : slot ? slotLabel(slot, now, tz) : 'Programado'}
                  </p>
                </div>
              </div>
              <ul className="mt-4 space-y-1.5 text-sm">
                {cart.items.map((i) => (
                  <li key={i.key} className="flex justify-between gap-3">
                    <span className="text-neutral-600">
                      <b className="text-ink">{i.qty}×</b> {i.name}
                      {i.options?.length > 0 && <span className="block text-xs text-neutral-400">{i.options.map((o) => o.name).join(' · ')}</span>}
                    </span>
                    <span className="font-semibold tabular-nums">{money(i.qty * cart.itemPrice(i))}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-4 flex gap-2">
                <label className="flex flex-1 items-center gap-2 rounded-2xl bg-neutral-100 px-3">
                  <Icon name="tag" className="size-4 text-neutral-400" />
                  <input
                    value={promoInput}
                    onChange={(e) => setPromoInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && setPromo(promoInput.trim().toUpperCase())}
                    placeholder="Código promocional"
                    className="w-full bg-transparent py-2.5 text-sm font-semibold uppercase outline-none placeholder:normal-case"
                  />
                </label>
                <button onClick={() => setPromo(promoInput.trim().toUpperCase())} className="rounded-2xl bg-ink px-4 text-sm font-bold text-white">
                  Aplicar
                </button>
              </div>
              {promo && serverQuote?.promo === promo && <p className="mt-1.5 text-xs font-semibold text-emerald-700">✓ Código {promo} aplicado</p>}
              {quoteError && <p className="mt-1.5 text-xs font-semibold text-brand-600">{quoteError}</p>}

              <dl className="mt-4 space-y-2 border-t border-dashed border-neutral-200 pt-4 text-sm">
                <Row label="Subtotal" value={money(q.subtotal)} />
                <Row label={km != null ? `Envío · ${fmtKm(km)}` : 'Envío'} value={address ? money(q.delivery_fee) : '—'} />
                <Row label="Propina rider 🐰" value={money(q.tip)} accent />
                {q.discount > 0 && <Row label={`Descuento (${promo})`} value={`−${money(q.discount)}`} green />}
                <div className="flex justify-between border-t border-neutral-200 pt-3 text-lg font-extrabold">
                  <dt>Total</dt>
                  <dd className="tabular-nums">{money(q.total)}</dd>
                </div>
              </dl>
              <TaxBreakdown q={q} />
              <p className="mt-2 text-[11px] text-neutral-400">
                Envío: {money(settings.delivery_base_fee)} + {money(settings.delivery_fee_per_km)}/km desde el restaurante.
              </p>
            </div>

            <div className="fixed inset-x-0 bottom-0 z-30 border-t border-neutral-200 bg-white/95 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur lg:static lg:mx-0 lg:rounded-3xl lg:border-0 lg:bg-transparent lg:p-0">
              {(payError || (submitted && hasErrors)) && (
                <p className="mb-2 text-center text-xs font-semibold text-brand-600">
                  {payError || errors.min || (!r.accepting_orders ? 'El restaurante ha pausado los pedidos' : 'Revisa los campos marcados en rojo')}
                </p>
              )}
              <button
                onClick={pay}
                disabled={paying}
                className="flex w-full items-center justify-between rounded-2xl bg-brand-600 px-5 py-4 text-base font-extrabold text-white shadow-xl shadow-brand-600/30 transition hover:bg-brand-700 active:scale-[0.98] disabled:opacity-80"
              >
                {paying ? (
                  <span className="flex w-full items-center justify-center gap-2">
                    <span className="size-5 animate-spin rounded-full border-2 border-white/40 border-t-white" /> Procesando…
                  </span>
                ) : (
                  <>
                    <span>{mode === 'scheduled' ? 'Programar y pagar' : payment === 'paypal' ? 'Pagar con PayPal' : payment === 'bizum' ? 'Pagar con Bizum' : 'Pagar pedido'}</span>
                    <span className="tabular-nums">{money(q.total)}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}

function Section({ title, icon, error, children }) {
  return (
    <section data-error={!!error} className={`rounded-3xl bg-white p-5 ring-1 transition ${error ? 'ring-2 ring-brand-500' : 'ring-neutral-200/70'}`}>
      <h2 className="mb-4 flex items-center gap-2 text-base font-extrabold">
        <span className="grid size-8 place-items-center rounded-xl bg-brand-50 text-brand-600">
          <Icon name={icon} className="size-4" />
        </span>
        {title}
      </h2>
      {children}
      {error && <p className="mt-3 text-sm font-semibold text-brand-600">{error}</p>}
    </section>
  )
}

function Choice({ active, disabled, onClick, title, subtitle, icon }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex items-start gap-3 rounded-2xl p-3 text-left ring-1 transition disabled:cursor-not-allowed disabled:opacity-40 ${active ? 'bg-brand-50 ring-2 ring-brand-600' : 'bg-white ring-neutral-200'}`}
    >
      <Icon name={icon} className={`mt-0.5 size-5 shrink-0 ${active ? 'text-brand-600' : 'text-neutral-400'}`} />
      <span className="min-w-0">
        <span className="block text-sm font-extrabold">{title}</span>
        <span className="block truncate text-xs text-neutral-500">{subtitle}</span>
      </span>
    </button>
  )
}

// Apple Pay en dispositivos de Apple; Google Pay en el resto (Android, Chrome…)
const WALLET =
  typeof window !== 'undefined' && 'ApplePaySession' in window
    ? { name: 'Apple Pay', mark: (
        <span className="inline-flex items-center gap-0.5 text-lg leading-5 font-semibold">
          <svg viewBox="0 0 24 24" className="size-5 -translate-y-px fill-current" aria-hidden="true">
            <path d="M16.37 12.6c-.03-2.6 2.12-3.85 2.22-3.91-1.21-1.77-3.09-2.01-3.76-2.04-1.6-.16-3.12.94-3.93.94-.81 0-2.06-.92-3.39-.89-1.74.03-3.35 1.01-4.25 2.57-1.81 3.14-.46 7.8 1.3 10.35.86 1.25 1.89 2.65 3.23 2.6 1.3-.05 1.79-.84 3.36-.84 1.57 0 2.01.84 3.38.81 1.4-.03 2.28-1.27 3.13-2.53.99-1.45 1.4-2.86 1.42-2.93-.03-.01-2.72-1.04-2.71-4.13zM13.79 4.97c.71-.86 1.19-2.06 1.06-3.25-1.02.04-2.26.68-3 1.54-.66.76-1.23 1.98-1.08 3.15 1.14.09 2.3-.58 3.02-1.44z" />
          </svg>
          Pay
        </span>
      ) }
    : {
        name: 'Google Pay',
        mark: (
          <span className="text-base leading-5 font-bold">
            <span className="text-[#4285F4]">G</span>
            <span className="text-[#EA4335]">o</span>
            <span className="text-[#FBBC05]">o</span>
            <span className="text-[#4285F4]">g</span>
            <span className="text-[#34A853]">l</span>
            <span className="text-[#EA4335]">e</span> Pay
          </span>
        ),
      }

const BIZUM_MARK = <span className="text-lg leading-5 font-black tracking-tight text-[#05C3DD]">bizum</span>

const PAYPAL_MARK = (
  <span className="text-base leading-5 font-extrabold italic">
    <span className="text-[#003087]">Pay</span>
    <span className="text-[#009CDE]">Pal</span>
  </span>
)

// Selector de pago: tarjeta, Apple/Google Pay y PayPal (vía Stripe); en mesa, también pagar en el local
function PaymentMethods({ value, onChange, methods = ['card', 'paypal', 'bizum'], testMode, cash = null, cashFirst = false }) {
  const options = [
    methods.includes('card') && { id: 'wallet', mark: WALLET.mark, title: WALLET.name, subtitle: 'Rápido y seguro' },
    methods.includes('card') && { id: 'card', icon: 'card', title: 'Tarjeta', subtitle: 'Débito o crédito' },
    methods.includes('bizum') && { id: 'bizum', mark: BIZUM_MARK, title: 'Bizum', subtitle: 'Con tu móvil' },
    methods.includes('paypal') && { id: 'paypal', mark: PAYPAL_MARK, title: 'PayPal', subtitle: 'Con tu cuenta' },
  ].filter(Boolean)
  const cashOption = cash && { id: 'cash', icon: 'cash', title: cash.title, subtitle: cash.subtitle }
  const all = (cashFirst ? [cashOption, ...options] : [...options, cashOption]).filter(Boolean)
  const notes = {
    wallet: `En la página segura de pago pulsa el botón de ${WALLET.name}. Si no aparece, puedes pagar con tarjeta.`,
    card: 'Te llevaremos a la página segura de Stripe para introducir tu tarjeta.',
    paypal: 'Te llevaremos a PayPal para confirmar el pago con tu cuenta.',
    bizum: 'En la página segura de pago escribe tu móvil de Bizum y confirma el pago en la app de tu banco.',
    cash: cash?.note,
  }
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        {all.map((o) => (
          <PayOption key={o.id} active={value === o.id} onClick={() => onChange(o.id)} {...o} />
        ))}
      </div>
      {value !== 'cash' && testMode ? (
        <p className="mt-4 rounded-2xl bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">
          🧪 <b>Pasarela en modo pruebas.</b> La conexión con Stripe aún no está activada: el pago se simulará y el pedido se confirmará sin cargo.
        </p>
      ) : (
        <p className="mt-4 rounded-2xl bg-neutral-100 p-3 text-sm text-neutral-600">{notes[value]}</p>
      )}
    </>
  )
}

function PayOption({ active, onClick, icon, mark, title, subtitle }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={title}
      className={`flex min-h-20 flex-col items-center justify-center gap-1 rounded-2xl odd:last:col-span-2 px-2 py-3 text-center ring-1 transition ${active ? 'bg-brand-50 text-brand-700 ring-2 ring-brand-600' : 'bg-white ring-neutral-200'}`}
    >
      {mark ? <span className="text-ink">{mark}</span> : <Icon name={icon} className="size-5" />}
      {!mark && <span className="text-sm font-extrabold">{title}</span>}
      <span className="text-[11px] text-neutral-500">{subtitle}</span>
    </button>
  )
}

function Row({ label, value, accent, green }) {
  return (
    <div className="flex justify-between">
      <dt className="text-neutral-500">{label}</dt>
      <dd className={`font-semibold tabular-nums ${accent ? 'text-brand-600' : ''} ${green ? 'text-emerald-700' : ''}`}>{value}</dd>
    </div>
  )
}

// Pedido desde la mesa (QR): sin dirección, envío ni propina para repartidor
function DineInCheckout() {
  const cart = useCart()
  const now = useNow()
  const { profile } = useAuth()
  const { settings, config } = useSettings()
  const { data: r, loading } = useAsync(() => (cart.restaurantId ? getRestaurant(cart.restaurantId, { byId: true }) : null), [cart.restaurantId])
  const status = useRestaurantStatus(r, now)
  const [customer, setCustomer] = useState({ name: '', email: '' })
  const [payment, setPayment] = useState('cash')
  const [paying, setPaying] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (profile) setCustomer((c) => ({ name: c.name || profile.full_name, email: c.email || profile.email }))
  }, [profile])

  if (loading && !r) return <Loading />
  if (!r || !cart.items.length)
    return (
      <div className="grid min-h-dvh place-items-center px-6 text-center">
        <div>
          <p className="text-5xl">🍽️</p>
          <p className="mt-3 text-lg font-extrabold">Tu pedido está vacío</p>
          <a href={`#/r/${cart.table?.restaurantSlug ?? ''}`} className="mt-3 inline-block font-semibold text-brand-600">
            Ver la carta
          </a>
        </div>
      </div>
    )

  const q = quote({
    items: cart.items.map((i) => ({ base_price: i.basePrice, qty: i.qty, tax_pct: cart.taxRate(i.taxPct) })),
    settings: ratesFor(settings, r, true),
    km: null,
    tip: 0,
  })
  const testMode = config?.payments !== 'stripe'
  const emailOk = !customer.email || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(customer.email)
  const blocked = !status.open || !r.accepting_orders

  const send = async () => {
    if (!emailOk) return setError('El email no es válido')
    setPaying(true)
    setError('')
    try {
      const res = await callFunction('create-order', {
        order_type: 'dine_in',
        table_code: cart.table.code,
        restaurant_id: r.id,
        items: cart.items.map((i) => ({ dish_id: i.dishId, qty: i.qty, note: i.note, options: i.optionIds ?? [] })),
        customer,
        payment_method: payment,
      })
      cart.rememberOrder({ token: res.token, code: res.code, restaurant: r.name, created_at: new Date().toISOString() })
      if (res.checkout_url) {
        sessionStorage.setItem(PENDING_KEY, JSON.stringify({ code: res.code, cart: { items: cart.items, restaurant: cart.restaurant } }))
        cart.clear()
        window.location.href = res.checkout_url
        return
      }
      cart.clear()
      navigate(`/pedido/${res.token}`)
    } catch (e) {
      setError(e.message)
      setPaying(false)
    }
  }

  return (
    <div className="min-h-dvh bg-neutral-50 pb-32">
      <header className="sticky top-0 z-30 border-b border-neutral-200/70 bg-white/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-xl items-center gap-3 px-4 py-3">
          <button onClick={() => goBack(`/r/${r.slug}`)} className="grid size-10 place-items-center rounded-full bg-neutral-100" aria-label="Volver">
            <Icon name="back" />
          </button>
          <div>
            <h1 className="text-lg leading-tight font-extrabold">Pedido en {cart.table.name}</h1>
            <p className="text-xs text-neutral-500">{r.name}</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-xl space-y-4 px-4 py-5">
        <div className="flex items-center gap-3 rounded-3xl bg-brand-600 p-4 text-white">
          <span className="text-3xl">🍽️</span>
          <p className="text-sm">
            Te lo llevamos a la <b>{cart.table.name}</b> en cuanto esté listo ({r.prep_min}–{r.prep_max} min). Sin gastos de envío.
          </p>
        </div>

        <section className="rounded-3xl bg-white p-5 ring-1 ring-neutral-200/70">
          <ul className="space-y-2 text-sm">
            {cart.items.map((i) => (
              <li key={i.key} className="flex justify-between gap-3">
                <span className="text-neutral-600">
                  <b className="text-ink">{i.qty}×</b> {i.name}
                  {i.options?.length > 0 && <span className="block text-xs text-neutral-400">{i.options.map((o) => o.name).join(' · ')}</span>}
                  {i.note && <span className="block text-xs text-neutral-400">“{i.note}”</span>}
                </span>
                <span className="font-semibold tabular-nums">{money(i.qty * cart.itemPrice(i))}</span>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex justify-between border-t border-dashed border-neutral-200 pt-4 text-lg font-extrabold">
            <span>Total</span>
            <span className="tabular-nums">{money(q.total)}</span>
          </div>
          <TaxBreakdown q={q} />
        </section>

        <section className="rounded-3xl bg-white p-5 ring-1 ring-neutral-200/70">
          <h2 className="mb-3 font-extrabold">Tus datos (opcional)</h2>
          <div className="grid gap-3">
            <Field label="Nombre para avisarte" autoComplete="name" value={customer.name} onChange={(e) => setCustomer({ ...customer, name: e.target.value })} />
            <Field
              label="Email para el recibo"
              type="email"
              autoComplete="email"
              value={customer.email}
              error={!emailOk ? 'Email no válido' : ''}
              onChange={(e) => setCustomer({ ...customer, email: e.target.value })}
            />
          </div>
        </section>

        <section className="rounded-3xl bg-white p-5 ring-1 ring-neutral-200/70">
          <h2 className="mb-3 font-extrabold">¿Cómo pagas?</h2>
          <PaymentMethods
            value={payment}
            onChange={setPayment}
            methods={config?.methods}
            testMode={testMode}
            cashFirst
            cash={{ title: 'En el local', subtitle: 'Efectivo o tarjeta al camarero', note: 'Paga al camarero cuando quieras: el pedido va directo a cocina.' }}
          />
        </section>
      </main>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-neutral-200 bg-white/95 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur">
        <div className="mx-auto max-w-xl">
          {(error || blocked) && (
            <p className="mb-2 text-center text-xs font-semibold text-brand-600">
              {error || (!r.accepting_orders ? 'El restaurante ha pausado los pedidos' : 'La cocina está cerrada ahora mismo')}
            </p>
          )}
          <button
            onClick={send}
            disabled={paying || blocked}
            className="flex w-full items-center justify-between rounded-2xl bg-brand-600 px-5 py-4 text-base font-extrabold text-white shadow-xl shadow-brand-600/30 transition active:scale-[0.98] disabled:opacity-60"
          >
            {paying ? (
              <span className="flex w-full items-center justify-center gap-2">
                <span className="size-5 animate-spin rounded-full border-2 border-white/40 border-t-white" /> Enviando…
              </span>
            ) : (
              <>
                <span>{payment !== 'cash' ? 'Pagar y enviar a cocina' : 'Enviar a cocina'}</span>
                <span className="tabular-nums">{money(q.total)}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

