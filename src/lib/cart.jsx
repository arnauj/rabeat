import { createContext, useContext, useEffect, useMemo, useReducer } from 'react'
import { useSettings } from './settings.jsx'
import { customerPrice } from './pricing.js'

const STORAGE_KEY = 'rabeat:cart:v2'

// restaurant: { id, slug, name }  ·  items: precios base del restaurante (el recargo se aplica al mostrar)
const initial = { restaurant: null, items: [], orders: [] }

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? { ...initial, ...JSON.parse(raw) } : initial
  } catch {
    return initial
  }
}

function reducer(state, action) {
  switch (action.type) {
    case 'add': {
      const { restaurant, dish, qty, note } = action
      const base = state.restaurant?.id === restaurant.id ? state.items : []
      const key = `${dish.id}::${note ?? ''}`
      const existing = base.find((i) => i.key === key)
      const items = existing
        ? base.map((i) => (i.key === key ? { ...i, qty: Math.min(50, i.qty + qty) } : i))
        : [...base, { key, dishId: dish.id, name: dish.name, basePrice: Number(dish.price), image: dish.image_url, qty, note }]
      return { ...state, restaurant: { id: restaurant.id, slug: restaurant.slug, name: restaurant.name }, items }
    }
    case 'setQty': {
      const items = state.items
        .map((i) => (i.key === action.key ? { ...i, qty: Math.min(50, action.qty) } : i))
        .filter((i) => i.qty > 0)
      return { ...state, items, restaurant: items.length ? state.restaurant : null }
    }
    case 'sync': {
      // Actualiza precios/nombres o quita platos que ya no existen
      const items = state.items
        .map((i) => {
          const d = action.dishes.find((x) => x.id === i.dishId)
          return d && d.available ? { ...i, name: d.name, basePrice: Number(d.price), image: d.image_url } : null
        })
        .filter(Boolean)
      return { ...state, items, restaurant: items.length ? state.restaurant : null }
    }
    case 'clear':
      return { ...state, items: [], restaurant: null }
    case 'restore':
      return { ...state, items: action.items, restaurant: action.restaurant }
    case 'rememberOrder':
      return {
        ...state,
        orders: [action.order, ...state.orders.filter((o) => o.token !== action.order.token)].slice(0, 30),
      }
    default:
      return state
  }
}

const CartContext = createContext(null)

export function CartProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, undefined, load)
  const { settings } = useSettings()

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch {
      /* almacenamiento no disponible */
    }
  }, [state])

  const value = useMemo(() => {
    const markup = settings.price_markup_pct
    const count = state.items.reduce((n, i) => n + i.qty, 0)
    const subtotal = state.items.reduce((n, i) => n + customerPrice(i.basePrice, markup) * i.qty, 0)
    return {
      ...state,
      restaurantId: state.restaurant?.id ?? null,
      count,
      subtotal,
      priceOf: (basePrice) => customerPrice(basePrice, markup),
      add: (restaurant, dish, qty = 1, note = '') => dispatch({ type: 'add', restaurant, dish, qty, note: note.trim() }),
      setQty: (key, qty) => dispatch({ type: 'setQty', key, qty }),
      sync: (dishes) => dispatch({ type: 'sync', dishes }),
      clear: () => dispatch({ type: 'clear' }),
      restore: ({ items, restaurant }) => dispatch({ type: 'restore', items, restaurant }),
      rememberOrder: (order) => dispatch({ type: 'rememberOrder', order }),
    }
  }, [state, settings.price_markup_pct])

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export const useCart = () => useContext(CartContext)
