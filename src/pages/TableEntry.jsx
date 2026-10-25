import { useEffect, useState } from 'react'
import Icon from '../components/Icon.jsx'
import { Cover, Loading } from '../components/ui.jsx'
import { useCart } from '../lib/cart.jsx'
import { supabase } from '../lib/supabase.js'
import { navigate } from '../lib/router.js'

// Mesa del QR (null = cargando, false = no existe)
export function useTable(code) {
  const [table, setTable] = useState(null)
  useEffect(() => {
    supabase.rpc('get_table', { p_code: code ?? '' }).then(({ data }) => setTable(data || false))
  }, [code])
  return table
}

export function InactiveQr() {
  return (
    <div className="grid min-h-dvh place-items-center p-6 text-center">
      <div>
        <p className="text-5xl">🍽️</p>
        <p className="mt-3 text-lg font-extrabold">Este código QR no está activo</p>
        <p className="text-sm text-neutral-500">Pide ayuda al personal del restaurante.</p>
        <a href="#/" className="mt-4 inline-block font-bold text-brand-600">
          Ir a rabeat
        </a>
      </div>
    </div>
  )
}

// Entrada desde el QR de una mesa: #/mesa/<código> → pedir o solo dejar propina
export default function TableEntry({ code }) {
  const { setTable } = useCart()
  const table = useTable(code)

  if (table === null) return <Loading label="Abriendo tu mesa…" />
  if (!table) return <InactiveQr />
  const r = table.restaurant

  const order = () => {
    setTable({ code: table.code, name: table.name, restaurantId: r.id, restaurantSlug: r.slug, restaurantName: r.name })
    navigate(`/r/${r.slug}`)
  }

  return (
    <div className="min-h-dvh bg-neutral-50">
      <div className="relative h-64 overflow-hidden bg-ink sm:h-72">
        <Cover restaurant={r} variant="header" className="size-full" />
        {!r.cover_is_logo && <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />}
        <div className="absolute inset-x-0 bottom-0 mx-auto max-w-xl px-5 pb-5 text-white">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-sm font-bold ring-1 ring-white/25 backdrop-blur">
            🍽️ {table.name}
          </span>
          <h1 className="mt-2 font-display text-3xl leading-tight font-black italic drop-shadow">{r.name}</h1>
        </div>
      </div>

      <main className="mx-auto max-w-xl space-y-3 px-4 pb-[max(2rem,env(safe-area-inset-bottom))]">
        <h2 className="px-1 pt-5 text-sm font-bold text-neutral-500">¿Qué quieres hacer?</h2>
        <button
          onClick={order}
          className="flex w-full items-center gap-4 rounded-3xl bg-brand-600 p-5 text-left text-white shadow-xl shadow-brand-600/25 transition active:scale-[0.98]"
        >
          <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-white/15 text-3xl">🍽️</span>
          <span className="min-w-0 flex-1">
            <span className="block text-lg font-extrabold">Ver la carta y pedir</span>
            <span className="block text-sm text-white/85">Pide desde la mesa y te lo traen</span>
          </span>
          <Icon name="right" className="size-5 shrink-0 text-white/70" />
        </button>
        <a
          href={`#/mesa/${table.code}/propina`}
          className="flex w-full items-center gap-4 rounded-3xl bg-white p-5 text-left ring-1 ring-neutral-200 transition active:scale-[0.98]"
        >
          <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-amber-50 text-3xl">💛</span>
          <span className="min-w-0 flex-1">
            <span className="block text-lg font-extrabold">Solo dejar propina</span>
            <span className="block text-sm text-neutral-500">Para el equipo de {r.name}, íntegra para ellos</span>
          </span>
          <Icon name="right" className="size-5 shrink-0 text-neutral-300" />
        </a>
        <p className="pt-2 text-center text-xs text-neutral-400">
          <a href="#/" className="font-semibold">
            rabeat
          </a>{' '}
          · pagos seguros con Stripe
        </p>
      </main>
    </div>
  )
}
