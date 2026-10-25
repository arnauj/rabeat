import { useEffect, useState } from 'react'
import Icon from '../components/Icon.jsx'
import PaymentMethods from '../components/PaymentMethods.jsx'
import { Cover, Field, Loading, Spinner, TextArea } from '../components/ui.jsx'
import { useSettings } from '../lib/settings.jsx'
import { callFunction } from '../lib/supabase.js'
import { money } from '../lib/format.js'
import { InactiveQr, useTable } from './TableEntry.jsx'

const AMOUNTS = [1, 2, 3, 5, 10]

// Propina para el equipo del restaurante desde el QR de una mesa: #/mesa/<código>/propina
export default function TableTip({ code, query }) {
  const table = useTable(code)
  const { settings, config } = useSettings()
  const [amount, setAmount] = useState(2)
  const [custom, setCustom] = useState('')
  const [customOpen, setCustomOpen] = useState(false)
  const [name, setName] = useState('')
  const [message, setMessage] = useState('')
  const [payment, setPayment] = useState('wallet')
  const [paying, setPaying] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(null) // { amount } tras pagar
  const returned = query?.get('gracias')
  const [checking, setChecking] = useState(Boolean(returned))

  // Vuelta desde la pasarela: confirma el cobro (reintenta unos segundos por si el pago tarda)
  useEffect(() => {
    if (!returned) return
    let tries = 0
    let stop = false
    const check = async () => {
      try {
        const res = await callFunction('table-tip', { action: 'status', id: returned })
        if (stop) return
        if (res.status === 'paid') return (setDone({ amount: Number(res.amount) }), setChecking(false))
        if (res.status === 'failed' || ++tries >= 8) return (setError('No hemos podido confirmar el pago. No se ha hecho ningún cargo.'), setChecking(false))
        setTimeout(check, 2500)
      } catch (e) {
        setError(e.message)
        setChecking(false)
      }
    }
    check()
    return () => {
      stop = true
    }
  }, [returned])

  if (table === null || checking) return <Loading label={checking ? 'Confirmando tu propina…' : 'Abriendo tu mesa…'} />
  if (!table) return <InactiveQr />
  const r = table.restaurant
  const value = customOpen ? Number(custom.replace(',', '.')) || 0 : amount
  const max = Number(settings.max_tip ?? 50)
  const valid = value >= 0.5 && value <= max
  const testMode = config?.payments !== 'stripe'

  const pay = async () => {
    if (!valid) return setError(`La propina debe estar entre 0,50 € y ${money(max)}`)
    setPaying(true)
    setError('')
    try {
      const res = await callFunction('table-tip', { action: 'create', table_code: table.code, amount: value, payment_method: payment, name, message })
      if (res.checkout_url) return void (window.location.href = res.checkout_url)
      setDone({ amount: value })
    } catch (e) {
      setError(e.message)
    } finally {
      setPaying(false)
    }
  }

  if (done)
    return (
      <div className="grid min-h-dvh place-items-center bg-neutral-50 px-6 text-center">
        <div className="w-full max-w-sm">
          <div className="mx-auto grid size-24 animate-fade-in place-items-center rounded-full bg-amber-50 text-5xl ring-8 ring-amber-50/60">💛</div>
          <h1 className="mt-5 font-display text-3xl font-black italic">¡Gracias!</h1>
          <p className="mt-2 text-neutral-600">
            El equipo de <b>{r.name}</b> recibirá tu propina de <b>{money(done.amount)}</b>.
          </p>
          <div className="mt-8 space-y-2">
            <a href={`#/mesa/${table.code}`} className="block rounded-2xl bg-ink py-4 font-extrabold text-white">
              Volver a la mesa
            </a>
            <a href="#/" className="block py-3 text-sm font-bold text-neutral-500">
              Ir a rabeat
            </a>
          </div>
        </div>
      </div>
    )

  return (
    <div className="min-h-dvh bg-neutral-50 pb-36">
      <header className="sticky top-0 z-30 border-b border-neutral-200/70 bg-white/90 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-xl items-center gap-3 px-4 py-3">
          <a href={`#/mesa/${table.code}`} className="grid size-10 shrink-0 place-items-center rounded-full bg-neutral-100" aria-label="Volver">
            <Icon name="back" className="size-5" />
          </a>
          <div className="min-w-0">
            <p className="truncate font-extrabold leading-tight">Dejar propina</p>
            <p className="truncate text-xs text-neutral-500">
              {r.name} · {table.name}
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-xl space-y-4 px-4 pt-4">
        <section className="flex items-center gap-4 rounded-3xl bg-gradient-to-br from-amber-50 to-white p-5 ring-1 ring-amber-100">
          <Cover restaurant={r} variant="thumb" className="size-16 shrink-0 rounded-2xl ring-1 ring-black/5" />
          <div className="min-w-0">
            <p className="text-lg leading-tight font-extrabold">Para el equipo de {r.name}</p>
            <p className="mt-1 text-sm text-neutral-600">Sin pedido: la propina va íntegra al personal 💛</p>
          </div>
        </section>

        <section className="rounded-3xl bg-white p-5 ring-1 ring-neutral-200/70">
          <h2 className="mb-3 font-extrabold">¿Cuánto quieres dejar?</h2>
          <div className="grid grid-cols-3 gap-2">
            {AMOUNTS.map((a) => (
              <button
                key={a}
                onClick={() => (setAmount(a), setCustomOpen(false), setError(''))}
                className={`rounded-2xl py-4 text-lg font-extrabold tabular-nums transition active:scale-95 ${
                  !customOpen && amount === a ? 'bg-ink text-white shadow-lg' : 'bg-neutral-100 text-ink'
                }`}
              >
                {a} €
              </button>
            ))}
            <button
              onClick={() => (setCustomOpen(true), setError(''))}
              className={`rounded-2xl py-4 text-base font-extrabold transition active:scale-95 ${customOpen ? 'bg-ink text-white shadow-lg' : 'bg-neutral-100 text-ink'}`}
            >
              Otra
            </button>
          </div>
          {customOpen && (
            <label className="mt-3 flex items-center rounded-2xl bg-neutral-100 px-4 ring-brand-500 focus-within:bg-white focus-within:ring-2">
              <input
                autoFocus
                inputMode="decimal"
                value={custom}
                onChange={(e) => setCustom(e.target.value.replace(/[^\d.,]/g, '').slice(0, 6))}
                placeholder="0,00"
                className="w-full bg-transparent py-3.5 text-2xl font-extrabold tabular-nums outline-none"
                aria-label="Importe de la propina"
              />
              <span className="text-xl font-bold text-neutral-400">€</span>
            </label>
          )}
        </section>

        <section className="space-y-3 rounded-3xl bg-white p-5 ring-1 ring-neutral-200/70">
          <h2 className="font-extrabold">
            Unas palabras <span className="text-sm font-semibold text-neutral-400">(opcional)</span>
          </h2>
          <Field placeholder="Tu nombre" autoComplete="given-name" value={name} onChange={(e) => setName(e.target.value.slice(0, 60))} />
          <TextArea rows={2} placeholder="¡Todo buenísimo, gracias!" value={message} onChange={(e) => setMessage(e.target.value.slice(0, 280))} />
        </section>

        <section className="rounded-3xl bg-white p-5 ring-1 ring-neutral-200/70">
          <h2 className="mb-3 font-extrabold">¿Cómo pagas?</h2>
          <PaymentMethods value={payment} onChange={setPayment} methods={config?.methods} testMode={testMode} />
        </section>
      </main>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-neutral-200 bg-white/95 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur">
        <div className="mx-auto max-w-xl">
          {error && <p className="mb-2 text-center text-xs font-semibold text-brand-600">{error}</p>}
          <button
            onClick={pay}
            disabled={paying || !valid}
            className="flex w-full items-center justify-between rounded-2xl bg-brand-600 px-5 py-4 text-base font-extrabold text-white shadow-xl shadow-brand-600/30 transition active:scale-[0.98] disabled:opacity-60"
          >
            <span className="flex items-center gap-2">
              {paying && <Spinner className="size-4" />} Dejar propina
            </span>
            <span className="tabular-nums">{money(value)}</span>
          </button>
        </div>
      </div>
    </div>
  )
}
