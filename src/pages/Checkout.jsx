import { useEffect, useMemo, useState } from 'react'
import Icon from '../components/Icon.jsx'
import { SafeImg, useNow } from '../components/ui.jsx'
import { DEFAULT_ADDRESS } from '../components/TopBar.jsx'
import { useCart } from '../lib/cart.jsx'
import { money, PROMO_CODES, SERVICE_FEE } from '../lib/format.js'
import { deliverySlots, formatHour, getStatus, groupSlotsByDay, slotLabel } from '../lib/time.js'
import { goBack, navigate } from '../lib/router.js'

const TIP_OPTIONS = [0, 1, 2, 3, 5]

const PAYMENTS = [
  { id: 'card', label: 'Tarjeta', icon: 'card' },
  { id: 'bizum', label: 'Bizum', icon: 'phone' },
  { id: 'wallet', label: 'Apple / Google Pay', icon: 'wallet' },
  { id: 'cash', label: 'Efectivo', icon: 'cash' },
]

const digits = (s) => s.replace(/\D/g, '')

export default function Checkout() {
  const cart = useCart()
  const now = useNow()
  const r = cart.restaurant

  const status = r ? getStatus(r, now) : { open: false }
  const slots = useMemo(() => (r ? deliverySlots(r, now) : []), [r, now])
  const days = useMemo(() => groupSlotsByDay(slots, now), [slots, now])

  const [mode, setMode] = useState(status.open ? 'asap' : 'scheduled')
  const [dayKey, setDayKey] = useState(null)
  const [slot, setSlot] = useState(null)

  const [address, setAddress] = useState({ street: DEFAULT_ADDRESS, details: '', notes: '', phone: '612 345 678' })
  const [payment, setPayment] = useState('card')
  const [cardData, setCardData] = useState({ number: '', expiry: '', cvc: '', name: '' })
  const [bizum, setBizum] = useState('')

  const [tip, setTip] = useState(2)
  const [customTip, setCustomTip] = useState('')
  const [isCustomTip, setIsCustomTip] = useState(false)

  const [promoInput, setPromoInput] = useState('')
  const [promo, setPromo] = useState(null)
  const [promoError, setPromoError] = useState('')

  const [submitted, setSubmitted] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [paying, setPaying] = useState(false)

  useEffect(() => {
    if (attempt) document.querySelector('[data-error="true"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [attempt])

  useEffect(() => {
    if (!status.open) setMode('scheduled')
  }, [status.open])

  if (!r || cart.items.length === 0)
    return (
      <div className="grid min-h-dvh place-items-center px-6 text-center">
        <div>
          <img src="/rider.png" alt="" className="mx-auto w-32" />
          <p className="mt-4 text-lg font-extrabold">No hay nada que pagar</p>
          <a href="#/" className="mt-3 inline-block font-semibold text-brand-600">
            Buscar restaurantes
          </a>
        </div>
      </div>
    )

  const activeDay = days.find((d) => d.key === dayKey) ?? days[0]
  const tipAmount = isCustomTip ? Math.max(0, Number(customTip.replace(',', '.')) || 0) : tip
  const discount = promo ? PROMO_CODES[promo].apply(cart.subtotal) : 0
  const total = cart.subtotal + r.deliveryFee + SERVICE_FEE + tipAmount - discount

  const errors = {
    slot: mode === 'scheduled' && !slot ? 'Elige una franja de entrega' : null,
    street: address.street.trim().length < 5 ? 'Indica la dirección de entrega' : null,
    card:
      payment === 'card' &&
      (digits(cardData.number).length !== 16 ||
        !/^(0[1-9]|1[0-2])\/\d{2}$/.test(cardData.expiry) ||
        digits(cardData.cvc).length !== 3)
        ? 'Revisa los datos de la tarjeta'
        : null,
    bizum: payment === 'bizum' && digits(bizum).length !== 9 ? 'Introduce un móvil de 9 cifras' : null,
  }
  const hasErrors = Object.values(errors).some(Boolean)

  const applyPromo = () => {
    const code = promoInput.trim().toUpperCase()
    if (PROMO_CODES[code]) {
      setPromo(code)
      setPromoError('')
    } else {
      setPromo(null)
      setPromoError('Código no válido. Prueba con RABEAT10')
    }
  }

  const pay = () => {
    setSubmitted(true)
    if (hasErrors) {
      setAttempt((n) => n + 1)
      return
    }
    setPaying(true)
    setTimeout(() => {
      const id = `RB${Date.now().toString(36).toUpperCase().slice(-6)}`
      cart.placeOrder({
        id,
        restaurantId: r.id,
        restaurantName: r.name,
        cover: r.cover,
        items: cart.items,
        subtotal: cart.subtotal,
        deliveryFee: r.deliveryFee,
        serviceFee: SERVICE_FEE,
        tip: Math.round(tipAmount * 100) / 100,
        discount,
        total,
        address,
        payment: PAYMENTS.find((p) => p.id === payment).label,
        scheduledFor: mode === 'scheduled' ? slot.toISOString() : null,
        createdAt: new Date().toISOString(),
        eta: r.eta,
      })
      navigate(`/pedido/${id}`)
    }, 1400)
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
          {/* Entrega */}
          <Card title="¿Cuándo lo quieres?" icon="clock" error={submitted && errors.slot}>
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
                subtitle={status.open ? `${r.eta[0]}–${r.eta[1]} min` : 'No disponible'}
                icon="bolt"
              />
              <Choice
                active={mode === 'scheduled'}
                onClick={() => setMode('scheduled')}
                title="Programar"
                subtitle={slot && mode === 'scheduled' ? slotLabel(slot, now) : 'Elige día y hora'}
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
                          className={`shrink-0 rounded-2xl px-4 py-2 text-left transition ${
                            activeDay?.key === d.key ? 'bg-ink text-white' : 'bg-neutral-100 text-neutral-700'
                          }`}
                        >
                          <span className="block text-sm font-bold first-letter:uppercase">{d.label}</span>
                          <span className="block text-[11px] opacity-70">
                            {d.date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                          </span>
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
                            className={`rounded-xl py-2.5 text-sm font-bold tabular-nums ring-1 transition ${
                              on ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white ring-neutral-200 hover:ring-neutral-400'
                            }`}
                          >
                            {formatHour(s)}
                          </button>
                        )
                      })}
                    </div>
                  </>
                )}
              </div>
            )}
          </Card>

          {/* Dirección */}
          <Card title="Dirección de entrega" icon="pin" error={submitted && errors.street}>
            <div className="grid gap-3">
              <Field label="Calle y número" value={address.street} onChange={(v) => setAddress({ ...address, street: v })} />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Piso, puerta" placeholder="2ºB" value={address.details} onChange={(v) => setAddress({ ...address, details: v })} />
                <Field label="Teléfono" value={address.phone} onChange={(v) => setAddress({ ...address, phone: v })} inputMode="tel" />
              </div>
              <Field
                label="Indicaciones para el rider"
                placeholder="Ej.: portal verde, llamar al timbre 2B"
                value={address.notes}
                onChange={(v) => setAddress({ ...address, notes: v })}
              />
            </div>
          </Card>

          {/* Propina */}
          <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-600 to-brand-800 p-5 text-white shadow-lg shadow-brand-600/20">
            <div className="pointer-events-none absolute inset-y-0 left-0 w-1/2 speed-lines opacity-50 [mask-image:linear-gradient(90deg,black,transparent)]" />
            <img src="/rider.png" alt="" className="pointer-events-none absolute top-2 -right-3 w-28 drop-shadow-lg sm:w-36" />
            <div className="relative pr-24 sm:pr-36">
              <h2 className="font-display text-xl font-extrabold italic">Propina para tu rider</h2>
              <p className="mt-1 text-sm text-white/85">
                El 100&nbsp;% va directo a quien te lleva el pedido. ¡Se agradece cada céntimo! 🐰
              </p>
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
                    className={`rounded-full px-4 py-2 text-sm font-extrabold transition active:scale-95 ${
                      on ? 'bg-white text-brand-700 shadow-lg' : 'bg-white/15 text-white ring-1 ring-white/30 hover:bg-white/25'
                    }`}
                  >
                    {t === 0 ? 'Ahora no' : money(t).replace(',00', '')}
                    {t === 2 && <span className="ml-1 text-[10px] font-bold opacity-70">★</span>}
                  </button>
                )
              })}
              <button
                onClick={() => setIsCustomTip(true)}
                className={`rounded-full px-4 py-2 text-sm font-extrabold transition ${
                  isCustomTip ? 'bg-white text-brand-700 shadow-lg' : 'bg-white/15 text-white ring-1 ring-white/30 hover:bg-white/25'
                }`}
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

          {/* Pago */}
          <Card title="Método de pago" icon="card" error={submitted && (errors.card || errors.bizum)}>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {PAYMENTS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setPayment(p.id)}
                  className={`flex flex-col items-center gap-1.5 rounded-2xl px-2 py-3 text-xs font-bold ring-1 transition ${
                    payment === p.id ? 'bg-brand-50 text-brand-700 ring-2 ring-brand-600' : 'bg-white ring-neutral-200'
                  }`}
                >
                  <Icon name={p.icon} className="size-5" />
                  {p.label}
                </button>
              ))}
            </div>

            {payment === 'card' && (
              <div className="mt-4 grid gap-3">
                <Field
                  label="Número de tarjeta"
                  placeholder="1234 5678 9012 3456"
                  inputMode="numeric"
                  value={cardData.number}
                  onChange={(v) =>
                    setCardData({ ...cardData, number: digits(v).slice(0, 16).replace(/(\d{4})(?=\d)/g, '$1 ') })
                  }
                />
                <div className="grid grid-cols-2 gap-3">
                  <Field
                    label="Caducidad"
                    placeholder="MM/AA"
                    inputMode="numeric"
                    value={cardData.expiry}
                    onChange={(v) => {
                      const d = digits(v).slice(0, 4)
                      setCardData({ ...cardData, expiry: d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d })
                    }}
                  />
                  <Field
                    label="CVC"
                    placeholder="123"
                    inputMode="numeric"
                    value={cardData.cvc}
                    onChange={(v) => setCardData({ ...cardData, cvc: digits(v).slice(0, 3) })}
                  />
                </div>
                <p className="text-xs text-neutral-500">Demo: usa cualquier número de 16 cifras. No se realiza ningún cargo.</p>
              </div>
            )}
            {payment === 'bizum' && (
              <div className="mt-4">
                <Field label="Móvil asociado a Bizum" placeholder="600 000 000" inputMode="tel" value={bizum} onChange={setBizum} />
              </div>
            )}
            {payment === 'wallet' && (
              <p className="mt-4 rounded-2xl bg-neutral-100 p-3 text-sm text-neutral-600">
                Confirmarás el pago con tu dispositivo al pulsar «Pagar».
              </p>
            )}
            {payment === 'cash' && (
              <p className="mt-4 rounded-2xl bg-neutral-100 p-3 text-sm text-neutral-600">
                Paga al rider en la entrega. Intenta tener el importe justo 🙏
              </p>
            )}
          </Card>
        </main>

        {/* Resumen */}
        <aside className="mt-4 lg:mt-0">
          <div className="space-y-4 lg:sticky lg:top-24">
            <div className="rounded-3xl bg-white p-5 ring-1 ring-neutral-200/70">
              <div className="flex items-center gap-3">
                <SafeImg src={r.cover} alt="" className="size-12 rounded-2xl" />
                <div>
                  <p className="font-extrabold">{r.name}</p>
                  <p className="text-xs text-neutral-500">
                    {cart.count} producto{cart.count !== 1 && 's'} ·{' '}
                    {mode === 'asap' ? `Llega en ${r.eta[0]}–${r.eta[1]} min` : slot ? slotLabel(slot, now) : 'Programado'}
                  </p>
                </div>
              </div>
              <ul className="mt-4 space-y-1.5 text-sm">
                {cart.items.map((i) => (
                  <li key={i.key} className="flex justify-between gap-3">
                    <span className="text-neutral-600">
                      <b className="text-ink">{i.qty}×</b> {i.name}
                    </span>
                    <span className="font-semibold tabular-nums">{money(i.qty * i.price)}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-4 flex gap-2">
                <label className="flex flex-1 items-center gap-2 rounded-2xl bg-neutral-100 px-3">
                  <Icon name="tag" className="size-4 text-neutral-400" />
                  <input
                    value={promoInput}
                    onChange={(e) => setPromoInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && applyPromo()}
                    placeholder="Código promocional"
                    className="w-full bg-transparent py-2.5 text-sm font-semibold uppercase outline-none placeholder:normal-case"
                  />
                </label>
                <button onClick={applyPromo} className="rounded-2xl bg-ink px-4 text-sm font-bold text-white">
                  Aplicar
                </button>
              </div>
              {promoError && <p className="mt-1.5 text-xs font-semibold text-brand-600">{promoError}</p>}
              {promo && <p className="mt-1.5 text-xs font-semibold text-emerald-700">✓ {PROMO_CODES[promo].label} aplicado</p>}

              <dl className="mt-4 space-y-2 border-t border-dashed border-neutral-200 pt-4 text-sm">
                <Row label="Subtotal" value={money(cart.subtotal)} />
                <Row label="Envío" value={r.deliveryFee === 0 ? 'Gratis' : money(r.deliveryFee)} />
                <Row label="Tarifa de servicio" value={money(SERVICE_FEE)} />
                <Row label="Propina rider 🐰" value={money(tipAmount)} accent />
                {discount > 0 && <Row label={`Descuento (${promo})`} value={`−${money(discount)}`} green />}
                <div className="flex justify-between border-t border-neutral-200 pt-3 text-lg font-extrabold">
                  <dt>Total</dt>
                  <dd className="tabular-nums">{money(total)}</dd>
                </div>
              </dl>
            </div>

            <div className="fixed inset-x-0 bottom-0 z-30 border-t border-neutral-200 bg-white/95 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur lg:static lg:mx-0 lg:rounded-3xl lg:border-0 lg:bg-transparent lg:p-0">
              {submitted && hasErrors && (
                <p className="mb-2 text-center text-xs font-semibold text-brand-600">Revisa los campos marcados en rojo</p>
              )}
              <button
                onClick={pay}
                disabled={paying}
                className="flex w-full items-center justify-between rounded-2xl bg-brand-600 px-5 py-4 text-base font-extrabold text-white shadow-xl shadow-brand-600/30 transition hover:bg-brand-700 active:scale-[0.98] disabled:opacity-80"
              >
                {paying ? (
                  <span className="flex w-full items-center justify-center gap-2">
                    <span className="size-5 animate-spin rounded-full border-2 border-white/40 border-t-white" /> Procesando pago…
                  </span>
                ) : (
                  <>
                    <span>{mode === 'scheduled' ? 'Programar y pagar' : 'Pagar pedido'}</span>
                    <span className="tabular-nums">{money(total)}</span>
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

function Card({ title, icon, error, children }) {
  return (
    <section
      data-error={!!error}
      className={`rounded-3xl bg-white p-5 ring-1 transition ${error ? 'ring-2 ring-brand-500' : 'ring-neutral-200/70'}`}
    >
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
      className={`flex items-start gap-3 rounded-2xl p-3 text-left ring-1 transition disabled:cursor-not-allowed disabled:opacity-40 ${
        active ? 'bg-brand-50 ring-2 ring-brand-600' : 'bg-white ring-neutral-200'
      }`}
    >
      <Icon name={icon} className={`mt-0.5 size-5 shrink-0 ${active ? 'text-brand-600' : 'text-neutral-400'}`} />
      <span className="min-w-0">
        <span className="block text-sm font-extrabold">{title}</span>
        <span className="block truncate text-xs text-neutral-500">{subtitle}</span>
      </span>
    </button>
  )
}

function Field({ label, value, onChange, placeholder, inputMode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-bold text-neutral-500">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        inputMode={inputMode}
        className="w-full rounded-2xl bg-neutral-100 px-4 py-3 text-[15px] font-semibold outline-none placeholder:font-medium placeholder:text-neutral-400 focus:bg-white focus:ring-2 focus:ring-brand-500"
      />
    </label>
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
