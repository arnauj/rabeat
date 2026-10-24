// Pruebas de la lógica compartida: node --test scripts/test-logic.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { getStatus, deliverySlots, isValidSlot, formatHour, statusLabel, zonedTime } from '../supabase/functions/_shared/hours.js'
import { quote, customerPrice, deliveryFee, haversineKm } from '../supabase/functions/_shared/pricing.js'

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

test('precios, envío y comisiones', () => {
  const settings = { price_markup_pct: 10, restaurant_commission_pct: 15, delivery_base_fee: 1.5, delivery_fee_per_km: 0.6, max_tip: 50 }
  assert.equal(customerPrice(10.9, 10), 11.99)
  assert.equal(deliveryFee(2.5, settings), 3)
  const q = quote({ items: [{ base_price: 10, qty: 2 }, { base_price: 3.9, qty: 1 }], settings, km: 2.5, tip: 2, promo: { kind: 'percent', value: 10, min_subtotal: 0 } })
  assert.equal(q.restaurant_subtotal, 23.9)
  assert.equal(q.subtotal, 26.29)
  assert.equal(q.markup_amount, 2.39)
  assert.equal(q.discount, 2.63)
  assert.equal(q.total, 28.66)
  assert.equal(q.commission_amount, 3.59)
  assert.equal(q.restaurant_payout, 20.31)
  assert.ok(Math.abs(haversineKm({ lat: 28.1036, lng: -15.4155 }, { lat: 28.1405, lng: -15.4334 }) - 4.45) < 0.1)
})
