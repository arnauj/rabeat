// Cálculo de importes (compartido entre la app y las funciones del servidor).
// El servidor recalcula siempre el pedido: lo que muestra la app es orientativo.

export const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100

// Precio que ve el cliente: precio del restaurante + recargo de la plataforma
export const customerPrice = (basePrice, markupPct) => round2(Number(basePrice) * (1 + Number(markupPct) / 100))

export function haversineKm(a, b) {
  const R = 6371
  const rad = (x) => (x * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

export const deliveryDistanceKm = (restaurant, point) =>
  restaurant?.lat == null || point?.lat == null ? null : round2(haversineKm(restaurant, point))

export function deliveryFee(km, settings) {
  return round2(Number(settings.delivery_base_fee) + Number(settings.delivery_fee_per_km) * km)
}

export const inDeliveryRange = (km, settings) => km != null && km <= Number(settings.delivery_max_km)

// Minutos estimados: preparación + trayecto (~3 min/km en ciudad + 5 de margen)
export function etaMinutes(restaurant, km) {
  const travel = km == null ? 10 : Math.round(km * 3 + 5)
  return [Number(restaurant.prep_min) + travel, Number(restaurant.prep_max) + travel]
}

export function promoDiscount(promo, subtotal) {
  if (!promo) return 0
  if (subtotal < Number(promo.min_subtotal ?? 0)) return 0
  const value = Number(promo.value)
  return round2(Math.min(subtotal, promo.kind === 'percent' ? (subtotal * value) / 100 : value))
}

// items: [{ base_price, qty }]
export function quote({ items, settings, km, tip = 0, promo = null }) {
  const markupPct = Number(settings.price_markup_pct)
  const commissionPct = Number(settings.restaurant_commission_pct)
  const restaurantSubtotal = round2(items.reduce((n, i) => n + Number(i.base_price) * i.qty, 0))
  const subtotal = round2(items.reduce((n, i) => n + customerPrice(i.base_price, markupPct) * i.qty, 0))
  const fee = km == null ? 0 : deliveryFee(km, settings)
  const discount = promoDiscount(promo, subtotal)
  const safeTip = round2(Math.max(0, Math.min(Number(tip) || 0, Number(settings.max_tip ?? 50))))
  const commission = round2((restaurantSubtotal * commissionPct) / 100)
  return {
    subtotal,
    restaurant_subtotal: restaurantSubtotal,
    markup_pct: markupPct,
    markup_amount: round2(subtotal - restaurantSubtotal),
    delivery_fee: fee,
    discount,
    tip: safeTip,
    total: round2(subtotal + fee + safeTip - discount),
    commission_pct: commissionPct,
    commission_amount: commission,
    restaurant_payout: round2(restaurantSubtotal - commission),
  }
}
