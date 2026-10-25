import { createContext, useContext, useEffect, useMemo, useReducer } from 'react'
import { useSettings } from './settings.jsx'
import { grossPrice, ratesFor } from './pricing.js'

const STORAGE_KEY = 'rabeat:cart:v2'

// restaurant: { id, slug, name, markup_pct, dine_in_markup_pct } (recargos propios; null = el general)  ·  items: precios base del restaurante (el recargo se aplica al mostrar)
// table: mesa del QR escaneado { code, name, restaurantId, restaurantSlug, restaurantName }
const initial = { restaurant: null, items: [], orders: [], table: null }

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? { ...initial, ...JSON.parse(raw) } : initial
  } catch {
    return initial
  }
}

const cartRestaurant = (r) => ({
  id: r.id,
  slug: r.slug,
  name: r.name,
  markup_pct: r.markup_pct ?? null,
  dine_in_markup_pct: r.dine_in_markup_pct ?? null,
})

function reducer(state, action) {
  switch (action.type) {
    case 'add': {
      const { restaurant, dish, qty, note, selection } = action
      const base = state.restaurant?.id === restaurant.id ? state.items : []
      const optionIds = selection?.ids ?? []
      const key = `${dish.id}::${optionIds.join(',')}::${note ?? ''}`
      const existing = base.find((i) => i.key === key)
      const items = existing
        ? base.map((i) => (i.key === key ? { ...i, qty: Math.min(50, i.qty + qty) } : i))
        : [
            ...base,
            {
              key,
              dishId: dish.id,
              name: dish.name,
              basePrice: Number(dish.price) + (selection?.delta ?? 0), // sin IGIC, con opciones
              optionDelta: selection?.delta ?? 0,
              optionIds,
              options: selection?.chosen ?? [],
              taxPct: dish.tax_pct,
              image: dish.image_url,
              qty,
              note,
            },
          ]
      return { ...state, restaurant: cartRestaurant(restaurant), items }
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
          return d && d.available
            ? { ...i, name: d.name, basePrice: Number(d.price) + (i.optionDelta ?? 0), taxPct: d.tax_pct, image: d.image_url }
            : null
        })
        .filter(Boolean)
      const restaurant = items.length ? (action.restaurant ? cartRestaurant(action.restaurant) : state.restaurant) : null
      return { ...state, items, restaurant }
    }
    case 'clear':
      return { ...state, items: [], restaurant: null }
    case 'restore':
      return { ...state, items: action.items, restaurant: action.restaurant }
    case 'setTable': {
      // Al entrar por el QR de otro restaurante, la cesta anterior no vale
      const keep = !action.table || state.restaurant?.id === action.table.restaurantId
      return { ...state, table: action.table, ...(keep ? {} : { items: [], restaurant: null }) }
    }
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
    // En mesa se aplica el recargo propio de los pedidos en el local
    const isDineIn = (restaurantId) => Boolean(state.table && state.table.restaurantId === restaurantId)
    // Recargo del restaurante (propio o general); acepta el restaurante o su id
    const markupFor = (x) => {
      const r = x && typeof x === 'object' ? x : x == null || x === state.restaurant?.id ? state.restaurant : { id: x }
      return ratesFor(settings, r, isDineIn(r?.id)).price_markup_pct
    }
    const cartMarkup = markupFor(state.restaurant)
    const count = state.items.reduce((n, i) => n + i.qty, 0)
    const rate = (taxPct) => Number(taxPct ?? settings.igic_pct ?? 0)
    const subtotal = state.items.reduce((n, i) => n + grossPrice(i.basePrice, cartMarkup, rate(i.taxPct)) * i.qty, 0)
    return {
      ...state,
      restaurantId: state.restaurant?.id ?? null,
      count,
      subtotal,
      isDineIn,
      dineIn: isDineIn(state.restaurant?.id),
      // Precio final (con recargo e IGIC) de un importe sin impuestos
      priceOf: (basePrice, restaurant = state.restaurant, taxPct = null) => grossPrice(basePrice, markupFor(restaurant), rate(taxPct)),
      itemPrice: (item) => grossPrice(item.basePrice, cartMarkup, rate(item.taxPct)),
      taxRate: rate,
      setTable: (table) => dispatch({ type: 'setTable', table }),
      add: (restaurant, dish, qty = 1, note = '', selection = null) =>
        dispatch({ type: 'add', restaurant, dish, qty, note: note.trim(), selection }),
      setQty: (key, qty) => dispatch({ type: 'setQty', key, qty }),
      sync: (dishes, restaurant) => dispatch({ type: 'sync', dishes, restaurant }),
      clear: () => dispatch({ type: 'clear' }),
      restore: ({ items, restaurant }) => dispatch({ type: 'restore', items, restaurant }),
      rememberOrder: (order) => dispatch({ type: 'rememberOrder', order }),
    }
  }, [state, settings])

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export const useCart = () => useContext(CartContext)
