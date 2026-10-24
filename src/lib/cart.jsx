import { createContext, useContext, useEffect, useMemo, useReducer } from 'react'
import { useSettings } from './settings.jsx'
import { grossPrice } from './pricing.js'

const STORAGE_KEY = 'rabeat:cart:v2'

// restaurant: { id, slug, name }  ·  items: precios base del restaurante (el recargo se aplica al mostrar)
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
          return d && d.available
            ? { ...i, name: d.name, basePrice: Number(d.price) + (i.optionDelta ?? 0), taxPct: d.tax_pct, image: d.image_url }
            : null
        })
        .filter(Boolean)
      return { ...state, items, restaurant: items.length ? state.restaurant : null }
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
    const markupFor = (restaurantId) => (isDineIn(restaurantId) ? settings.dine_in_markup_pct ?? 0 : settings.price_markup_pct)
    const cartMarkup = markupFor(state.restaurant?.id)
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
      priceOf: (basePrice, restaurantId = state.restaurant?.id, taxPct = null) => grossPrice(basePrice, markupFor(restaurantId), rate(taxPct)),
      itemPrice: (item) => grossPrice(item.basePrice, cartMarkup, rate(item.taxPct)),
      taxRate: rate,
      setTable: (table) => dispatch({ type: 'setTable', table }),
      add: (restaurant, dish, qty = 1, note = '', selection = null) =>
        dispatch({ type: 'add', restaurant, dish, qty, note: note.trim(), selection }),
      setQty: (key, qty) => dispatch({ type: 'setQty', key, qty }),
      sync: (dishes) => dispatch({ type: 'sync', dishes }),
      clear: () => dispatch({ type: 'clear' }),
      restore: ({ items, restaurant }) => dispatch({ type: 'restore', items, restaurant }),
      rememberOrder: (order) => dispatch({ type: 'rememberOrder', order }),
    }
  }, [state, settings.price_markup_pct, settings.dine_in_markup_pct, settings.igic_pct])

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export const useCart = () => useContext(CartContext)
