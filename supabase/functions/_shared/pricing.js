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

// Comisión y recargo de un restaurante: los suyos propios o, si no tiene, los generales.
// Devuelve los ajustes listos para quote(); dineIn = pedido desde la mesa.
export function ratesFor(settings, restaurant, dineIn = false) {
  const pick = (own, general) => (own == null || own === '' ? Number(general ?? 0) : Number(own))
  const r = restaurant ?? {}
  return {
    ...settings,
    restaurant_commission_pct: dineIn
      ? pick(r.dine_in_commission_pct, settings.dine_in_commission_pct)
      : pick(r.commission_pct, settings.restaurant_commission_pct),
    price_markup_pct: dineIn ? pick(r.dine_in_markup_pct, settings.dine_in_markup_pct) : pick(r.markup_pct, settings.price_markup_pct),
  }
}

// Precio final que ve el cliente: precio sin impuestos + recargo + IGIC
export const taxRate = (taxPct, settings) => Number(taxPct ?? settings.igic_pct ?? 0)
export const grossPrice = (basePrice, markupPct, taxPct) => round2(customerPrice(basePrice, markupPct) * (1 + Number(taxPct) / 100))

// Valida las opciones elegidas de un plato y calcula su suplemento (sin IGIC).
// groups: [{ id, name, min_select, max_select, free_select, extra_price, options: [{ id, name, price_delta, available }] }]
export function resolveOptions(groups = [], selected = []) {
  const picked = new Set(selected)
  let delta = 0
  const chosen = []
  for (const g of groups) {
    const opts = (g.options ?? []).filter((o) => picked.has(o.id))
    if (opts.some((o) => o.available === false)) return { error: `Alguna opción de «${g.name}» ya no está disponible` }
    if (opts.length < Number(g.min_select)) return { error: `Elige ${g.min_select > 1 ? `al menos ${g.min_select}` : 'una opción'} en «${g.name}»` }
    if (opts.length > Number(g.max_select)) return { error: `Puedes elegir como máximo ${g.max_select} en «${g.name}»` }
    const free = g.free_select == null ? Infinity : Number(g.free_select)
    // Ordena por la posición de la carta para que el cobro de extras sea estable
    opts
      .sort((a, b) => selected.indexOf(a.id) - selected.indexOf(b.id))
      .forEach((o, i) => {
        const price = round2(Number(o.price_delta) + (i >= free ? Number(g.extra_price) : 0))
        delta += price
        chosen.push({ group: g.name, name: o.name, price })
      })
  }
  const known = new Set(groups.flatMap((g) => (g.options ?? []).map((o) => o.id)))
  if (selected.some((id) => !known.has(id))) return { error: 'Opción no válida' }
  return { delta: round2(delta), chosen }
}

// items: [{ base_price (con opciones, sin IGIC), qty, tax_pct (null = tipo general) }]
export function quote({ items, settings, km, tip = 0, promo = null }) {
  const markupPct = Number(settings.price_markup_pct)
  const commissionPct = Number(settings.restaurant_commission_pct)
  const general = Number(settings.igic_pct ?? 0)
  const lines = items.map((i) => {
    const rate = taxRate(i.tax_pct, settings)
    return { ...i, rate, net: customerPrice(i.base_price, markupPct), gross: grossPrice(i.base_price, markupPct, rate) }
  })
  const restaurantSubtotal = round2(lines.reduce((n, i) => n + Number(i.base_price) * i.qty, 0))
  const restaurantTax = round2(lines.reduce((n, i) => n + (Number(i.base_price) * i.qty * i.rate) / 100, 0))
  const markupAmount = round2(lines.reduce((n, i) => n + (i.net - Number(i.base_price)) * i.qty, 0))
  const subtotal = round2(lines.reduce((n, i) => n + i.gross * i.qty, 0))
  const feeNet = km == null ? 0 : deliveryFee(km, settings)
  const fee = round2(feeNet * (1 + general / 100))
  const discount = promoDiscount(promo, subtotal)
  const safeTip = round2(Math.max(0, Math.min(Number(tip) || 0, Number(settings.max_tip ?? 50))))
  const commission = round2((restaurantSubtotal * commissionPct) / 100)

  // Desglose de IGIC: el descuento reduce la base de forma proporcional
  const ratio = subtotal > 0 ? (subtotal - discount) / subtotal : 1
  const byRate = new Map()
  for (const l of lines) byRate.set(l.rate, (byRate.get(l.rate) ?? 0) + l.gross * l.qty * ratio)
  if (fee > 0) byRate.set(general, (byRate.get(general) ?? 0) + fee)
  const breakdown = [...byRate.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([rate, gross]) => {
      const base = round2(gross / (1 + rate / 100))
      return { rate, base, tax: round2(gross - base) }
    })
    .filter((b) => b.base > 0 || b.tax > 0)

  return {
    subtotal,
    restaurant_subtotal: restaurantSubtotal,
    restaurant_tax: restaurantTax,
    markup_pct: markupPct,
    markup_amount: markupAmount,
    delivery_fee: fee,
    discount,
    tip: safeTip,
    tax_amount: round2(breakdown.reduce((n, b) => n + b.tax, 0)),
    tax_breakdown: breakdown,
    total: round2(subtotal + fee + safeTip - discount),
    commission_pct: commissionPct,
    commission_amount: commission,
    // El restaurante recibe su precio − comisión + el IGIC de su comida (que debe declarar)
    restaurant_payout: round2(restaurantSubtotal - commission + restaurantTax),
  }
}
