import { createContext, useContext, useEffect, useMemo, useReducer } from 'react'
import { getRestaurant } from '../data/restaurants.js'

const STORAGE_KEY = 'rabeat:v1'

const initial = { restaurantId: null, items: [], orders: [] }

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
      const { restaurantId, dish, qty, note } = action
      const base = state.restaurantId === restaurantId ? state.items : []
      const key = `${dish.id}::${note ?? ''}`
      const existing = base.find((i) => i.key === key)
      const items = existing
        ? base.map((i) => (i.key === key ? { ...i, qty: i.qty + qty } : i))
        : [
            ...base,
            { key, dishId: dish.id, name: dish.name, price: dish.price, image: dish.image, qty, note },
          ]
      return { ...state, restaurantId, items }
    }
    case 'setQty': {
      const items = state.items
        .map((i) => (i.key === action.key ? { ...i, qty: action.qty } : i))
        .filter((i) => i.qty > 0)
      return { ...state, items, restaurantId: items.length ? state.restaurantId : null }
    }
    case 'clear':
      return { ...state, items: [], restaurantId: null }
    case 'placeOrder':
      return { ...state, items: [], restaurantId: null, orders: [action.order, ...state.orders] }
    case 'updateOrder':
      return {
        ...state,
        orders: state.orders.map((o) => (o.id === action.id ? { ...o, ...action.patch } : o)),
      }
    default:
      return state
  }
}

const CartContext = createContext(null)

export function CartProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, undefined, load)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch {
      /* almacenamiento no disponible */
    }
  }, [state])

  const value = useMemo(() => {
    const count = state.items.reduce((n, i) => n + i.qty, 0)
    const subtotal = state.items.reduce((n, i) => n + i.qty * i.price, 0)
    return {
      ...state,
      restaurant: getRestaurant(state.restaurantId),
      count,
      subtotal,
      add: (restaurantId, dish, qty = 1, note = '') =>
        dispatch({ type: 'add', restaurantId, dish, qty, note: note.trim() }),
      setQty: (key, qty) => dispatch({ type: 'setQty', key, qty }),
      clear: () => dispatch({ type: 'clear' }),
      placeOrder: (order) => dispatch({ type: 'placeOrder', order }),
      updateOrder: (id, patch) => dispatch({ type: 'updateOrder', id, patch }),
    }
  }, [state])

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export const useCart = () => useContext(CartContext)
