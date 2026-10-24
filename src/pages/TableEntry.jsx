import { useEffect, useState } from 'react'
import { Loading } from '../components/ui.jsx'
import { useCart } from '../lib/cart.jsx'
import { supabase } from '../lib/supabase.js'

// Entrada desde el QR de una mesa: #/mesa/<código>
export default function TableEntry({ code }) {
  const { setTable } = useCart()
  const [error, setError] = useState(false)

  useEffect(() => {
    supabase.rpc('get_table', { p_code: code ?? '' }).then(({ data }) => {
      if (!data) return setError(true)
      setTable({
        code: data.code,
        name: data.name,
        restaurantId: data.restaurant.id,
        restaurantSlug: data.restaurant.slug,
        restaurantName: data.restaurant.name,
      })
      window.location.replace(`#/r/${data.restaurant.slug}`)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code])

  if (!error) return <Loading label="Abriendo la carta de tu mesa…" />
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
