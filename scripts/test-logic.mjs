// Pruebas de la lógica compartida: node --test scripts/test-logic.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { getStatus, deliverySlots, isValidSlot, formatHour, statusLabel, zonedTime } from '../supabase/functions/_shared/hours.js'
import { quote, customerPrice, deliveryFee, haversineKm, resolveOptions, grossPrice } from '../supabase/functions/_shared/pricing.js'

const tz = 'Atlantic/Canary'
// 2026-10-24 es sábado; en octubre Canarias está en UTC+1 (verano) hasta el 25
const at = (h, m = 0, d = 24) => zonedTime(2026, 10, d, h, m, tz)

test('zonedTime respeta el horario de verano', () => {
  assert.equal(at(12).toISOString(), '2026-10-24T11:00:00.000Z')
  assert.equal(zonedTime(2026, 12, 1, 12, 0, tz).toISOString(), '2026-12-01T12:00:00.000Z')
})

test('abierto / cerrado con varios tramos y cruce de medianoche', () => {
  const hours = [
    { weekday: 6, opens: '12:00:00', closes: '16:00:00' },
    { weekday: 6, opens: '20:00', closes: '01:00' },
  ]
  assert.equal(getStatus(hours, at(13), tz).open, true)
  assert.equal(getStatus(hours, at(17), tz).open, false)
  assert.equal(formatHour(getStatus(hours, at(17), tz).opensAt, tz), '20:00')
  assert.equal(getStatus(hours, at(0, 30, 25), tz).open, true, 'domingo 00:30 sigue abierto por el tramo del sábado')
  assert.match(statusLabel(getStatus(hours, at(17), tz), at(17), tz), /abre hoy a las 20:00/)
})

test('24 horas', () => {
  const hours = [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, opens: '00:00', closes: '24:00' }))
  const s = getStatus(hours, at(3), tz)
  assert.equal(s.open && s.alwaysOpen, true)
})

test('franjas programadas dentro del horario', () => {
  const hours = [{ weekday: 6, opens: '16:00', closes: '21:00' }]
  const slots = deliverySlots(hours, at(10), 1, tz).map((s) => formatHour(s, tz))
  assert.deepEqual(slots, ['16:30', '17:00', '17:30', '18:00', '18:30', '19:00', '19:30', '20:00', '20:30'])
  assert.equal(isValidSlot(hours, at(17), at(10), tz), true)
  assert.equal(isValidSlot(hours, at(21), at(10), tz), false)
  assert.equal(isValidSlot(hours, at(16, 30), at(16), tz), false, 'menos de 45 min de margen')
})

test('precios, envío, comisiones e IGIC', () => {
  const settings = { price_markup_pct: 10, restaurant_commission_pct: 15, delivery_base_fee: 1.5, delivery_fee_per_km: 0.6, max_tip: 50, igic_pct: 7 }
  assert.equal(customerPrice(10.9, 10), 11.99)
  assert.equal(grossPrice(10, 0, 7), 10.7)
  assert.equal(deliveryFee(2.5, settings), 3)
  const q = quote({ items: [{ base_price: 10, qty: 2 }, { base_price: 3.9, qty: 1, tax_pct: 3 }], settings, km: 2.5, tip: 2 })
  assert.equal(q.restaurant_subtotal, 23.9)
  assert.equal(q.subtotal, 23.54 + 4.42) // 11 € + 7 % = 11,77 ×2 ; 4,29 € + 3 % = 4,42
  assert.equal(q.delivery_fee, 3.21) // 3 € + 7 %
  assert.equal(q.total, round(q.subtotal + 3.21 + 2))
  assert.equal(q.restaurant_tax, round(20 * 0.07 + 3.9 * 0.03))
  assert.equal(q.commission_amount, 3.59)
  assert.equal(q.restaurant_payout, round(23.9 - 3.59 + q.restaurant_tax))
  // Base + IGIC = total sin propina
  const base = q.tax_breakdown.reduce((n, b) => n + b.base, 0)
  assert.ok(Math.abs(base + q.tax_amount - (q.total - q.tip)) < 0.02)
  assert.deepEqual(q.tax_breakdown.map((b) => b.rate), [3, 7])
  assert.ok(Math.abs(haversineKm({ lat: 28.1036, lng: -15.4155 }, { lat: 28.1405, lng: -15.4334 }) - 4.45) < 0.1)
})

test('descuento reduce la base del IGIC', () => {
  const settings = { price_markup_pct: 0, restaurant_commission_pct: 10, delivery_base_fee: 0, delivery_fee_per_km: 0, igic_pct: 7 }
  const q = quote({ items: [{ base_price: 100, qty: 1 }], settings, km: null, promo: { kind: 'percent', value: 10, min_subtotal: 0 } })
  assert.equal(q.subtotal, 107)
  assert.equal(q.discount, 10.7)
  assert.equal(q.total, 96.3)
  assert.equal(q.tax_amount, 6.3)
  assert.equal(q.restaurant_payout, 97) // 100 − 10 + 7: el descuento lo asume la plataforma
})

test('opciones: mínimos, máximos y extras', () => {
  const groups = [
    { id: 'g1', name: 'Tamaño', min_select: 1, max_select: 1, free_select: null, extra_price: 0, options: [{ id: 'p', name: 'Pequeño', price_delta: 0 }, { id: 'g', name: 'Grande', price_delta: 2 }] },
    { id: 'g2', name: 'Proteína', min_select: 1, max_select: 2, free_select: 1, extra_price: 2.5, options: [{ id: 's', name: 'Salmón', price_delta: 0 }, { id: 'a', name: 'Atún', price_delta: 0 }] },
  ]
  assert.match(resolveOptions(groups, ['p']).error, /Proteína/)
  assert.match(resolveOptions(groups, ['p', 'g', 's']).error, /máximo 1 en «Tamaño»/)
  assert.equal(resolveOptions(groups, ['g', 's']).delta, 2)
  const r = resolveOptions(groups, ['g', 's', 'a'])
  assert.equal(r.delta, 4.5)
  assert.deepEqual(r.chosen.map((c) => c.price), [2, 0, 2.5])
  assert.equal(resolveOptions(groups, ['g', 'x', 's']).error, 'Opción no válida')
})

const round = (n) => Math.round((n + Number.EPSILON) * 100) / 100
