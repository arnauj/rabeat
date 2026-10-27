// Calcula (dry_run) o crea un pedido. El servidor recalcula todos los importes.
import { adminClient, currentUser } from '../_shared/db.ts'
import { handle, HttpError, json, siteUrl, trackingUrl } from '../_shared/http.ts'
import { getStatus, isValidSlot } from '../_shared/hours.js'
import { connectTransfer, deliveryDistanceKm, grossPrice, inDeliveryRange, quote, ratesFor, resolveOptions, taxRate } from '../_shared/pricing.js'
import { cents, onlineMethods, stripe, stripeEnabled } from '../_shared/stripe.ts'
import { notifyOrder } from '../_shared/notify.ts'
import { checkoutSession, payoutAccount } from '../_shared/connect.ts'

type Body = {
  dry_run?: boolean
  order_type?: 'delivery' | 'dine_in'
  table_code?: string
  restaurant_id: string
  items: { dish_id: string; qty: number; note?: string; options?: string[] }[]
  address?: { street: string; details?: string; notes?: string; lat: number; lng: number }
  customer?: { name?: string; email?: string; phone?: string }
  scheduled_for?: string | null
  tip?: number
  promo_code?: string
  payment_method?: 'card' | 'wallet' | 'paypal' | 'bizum' | 'cash' // wallet = Apple Pay / Google Pay (cobro con tarjeta)
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

function orderCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = crypto.getRandomValues(new Uint8Array(6))
  return 'RB' + [...bytes].map((b) => alphabet[b % alphabet.length]).join('')
}

Deno.serve(
  handle(async (req) => {
    if (req.method !== 'POST') throw new HttpError(405, 'Método no permitido')
    const body = (await req.json()) as Body
    const db = adminClient()
    const user = await currentUser(req)

    // --- Datos de referencia
    const [{ data: settings }, { data: restaurant }] = await Promise.all([
      db.from('settings').select('*').eq('id', 1).single(),
      db.from('restaurants').select('*, opening_hours(*)').eq('id', body.restaurant_id).single(),
    ])
    if (!settings) throw new Error('Faltan los ajustes de la plataforma')
    if (!restaurant || !restaurant.active) throw new HttpError(404, 'Restaurante no disponible')
    if (!restaurant.accepting_orders) throw new HttpError(409, 'El restaurante no acepta pedidos ahora mismo')

    const lines = (body.items ?? []).filter((i) => i && i.qty > 0)
    if (!lines.length) throw new HttpError(400, 'La cesta está vacía')
    if (lines.some((i) => !Number.isInteger(i.qty) || i.qty > 50)) throw new HttpError(400, 'Cantidad no válida')

    const { data: dishes } = await db
      .from('dishes')
      .select('id, name, price, available, restaurant_id, tax_pct, schedule, dish_option_groups(*, dish_options(*))')
      .in('id', lines.map((i) => i.dish_id))
    const byId = new Map((dishes ?? []).map((d) => [d.id, d]))
    const unavailable = lines.filter((i) => {
      const d = byId.get(i.dish_id)
      return !d || !d.available || d.restaurant_id !== restaurant.id
    })
    if (unavailable.length) throw new HttpError(409, 'Algún plato de tu cesta ya no está disponible')

    // --- Pedido en mesa (QR) o a domicilio
    const dineIn = body.order_type === 'dine_in'
    let table: { id: string; name: string } | null = null
    if (dineIn) {
      const { data } = await db
        .from('restaurant_tables')
        .select('id, name, active, restaurant_id')
        .eq('code', String(body.table_code ?? '').trim().toLowerCase())
        .maybeSingle()
      if (!data || !data.active || data.restaurant_id !== restaurant.id) throw new HttpError(404, 'Esta mesa no está disponible. Vuelve a escanear el QR.')
      table = data
    }

    // --- Distancia y envío (solo a domicilio)
    let point = { lat: NaN, lng: NaN }
    let km: number | null = null
    if (!dineIn) {
      point = { lat: Number(body.address?.lat), lng: Number(body.address?.lng) }
      if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng)) throw new HttpError(400, 'Indica la dirección de entrega en el mapa')
      km = deliveryDistanceKm(restaurant, point)
      if (km == null) throw new HttpError(409, 'El restaurante aún no tiene ubicación configurada')
      if (!inDeliveryRange(km, settings))
        throw new HttpError(409, `Tu dirección está a ${km.toFixed(1)} km: el máximo de reparto es ${settings.delivery_max_km} km`)
    }
    // En mesa: comisión y recargo propios, sin envío ni propina para repartidor
    // (cada restaurante puede tener los suyos; si no, los generales)
    const pricing = ratesFor(settings, restaurant, dineIn)

    // --- Promoción
    let promo = null
    const code = body.promo_code?.trim().toUpperCase()
    if (code) {
      const { data } = await db.from('promo_codes').select('*').eq('code', code).maybeSingle()
      const valid =
        data && data.active && (!data.expires_at || new Date(data.expires_at) > new Date()) && (data.max_uses == null || data.uses < data.max_uses)
      if (!valid) throw new HttpError(400, 'Código promocional no válido o caducado')
      promo = data
    }

    // Opciones (menús, tamaños, extras) e IGIC de cada línea
    const items = lines.map((i) => {
      const d = byId.get(i.dish_id)!
      const groups = (d.dish_option_groups ?? [])
        .sort((a: any, b: any) => a.position - b.position)
        .map((g: any) => ({ ...g, options: g.dish_options ?? [] }))
      const res = resolveOptions(groups, i.options ?? [])
      if (res.error) throw new HttpError(400, `${d.name}: ${res.error}`)
      return {
        ...i,
        name: d.name,
        schedule: d.schedule,
        base_price: Number(d.price) + res.delta!,
        tax_pct: taxRate(d.tax_pct, settings),
        chosen: res.chosen!,
      }
    })
    const q = quote({ items, settings: pricing, km, tip: dineIn ? 0 : body.tip ?? 0, promo })
    if (promo && q.discount === 0) throw new HttpError(400, `Este código requiere un pedido mínimo de ${promo.min_subtotal} €`)
    const minOk = dineIn || q.subtotal >= Number(restaurant.min_order)

    // --- Horario
    const now = new Date()
    const hours = restaurant.opening_hours ?? []
    const status = getStatus(hours, now, settings.timezone)
    let scheduledFor: Date | null = null
    if (dineIn && (body.scheduled_for || !status.open) && !body.dry_run) {
      throw new HttpError(409, 'El restaurante está cerrado ahora mismo')
    } else if (body.scheduled_for && !dineIn) {
      scheduledFor = new Date(body.scheduled_for)
      if (!isValidSlot(hours, scheduledFor, now, settings.timezone))
        throw new HttpError(409, 'La franja elegida ya no está disponible, elige otra')
    } else if (!status.open && !body.dry_run) {
      throw new HttpError(409, 'El restaurante está cerrado: programa el pedido para cuando abra')
    }

    // Platos con horario propio (p. ej. menú del día solo a mediodía)
    const when = scheduledFor ?? now
    const outOfSchedule = items.find((i) => Array.isArray(i.schedule) && i.schedule.length && !getStatus(i.schedule, when, settings.timezone).open)
    if (outOfSchedule && !body.dry_run) throw new HttpError(409, `«${outOfSchedule.name}» no está disponible a esa hora`)

    if (body.dry_run) return json({ quote: q, distance_km: km, min_order_ok: minOk, open: status.open, promo: promo?.code ?? null })

    // --- Validación del cliente
    if (!minOk) throw new HttpError(400, `El pedido mínimo es de ${restaurant.min_order} €`)
    const customer = body.customer ?? {}
    const email = customer.email?.trim().toLowerCase() || null
    if (dineIn) {
      if (email && !EMAIL_RE.test(email)) throw new HttpError(400, 'El email no es válido')
    } else {
      if (!customer.name?.trim() || !EMAIL_RE.test(email ?? '') || (customer.phone ?? '').replace(/\D/g, '').length < 9)
        throw new HttpError(400, 'Revisa tu nombre, email y teléfono')
      if (!body.address?.street?.trim()) throw new HttpError(400, 'Indica la calle y el número')
    }
    // A domicilio solo se paga online; el efectivo es solo para pagar en el local (pedidos en mesa)
    if (body.payment_method === 'cash' && !dineIn) throw new HttpError(400, 'Los pedidos a domicilio se pagan online')
    const online = body.payment_method === 'paypal' || body.payment_method === 'bizum' ? body.payment_method : 'card'
    if (body.payment_method !== 'cash' && stripeEnabled() && !onlineMethods().includes(online))
      throw new HttpError(400, 'Ese método de pago no está disponible')
    const method = body.payment_method === 'cash' ? 'cash' : stripeEnabled() ? online : 'test'

    // --- Alta del pedido
    const { data: order, error } = await db
      .from('orders')
      .insert({
        code: orderCode(),
        order_type: dineIn ? 'dine_in' : 'delivery',
        table_id: table?.id ?? null,
        table_name: table?.name ?? null,
        restaurant_id: restaurant.id,
        customer_id: user?.id ?? null,
        customer_name: customer.name?.trim() || table?.name || '',
        customer_email: email,
        customer_phone: customer.phone?.trim() || null,
        address: dineIn
          ? null
          : { street: body.address!.street.trim(), details: body.address!.details?.trim() ?? '', notes: body.address!.notes?.trim() ?? '' },
        lat: dineIn ? null : point.lat,
        lng: dineIn ? null : point.lng,
        distance_km: km,
        scheduled_for: dineIn ? null : scheduledFor?.toISOString() ?? null,
        status: method === 'cash' ? 'confirmed' : 'pending_payment',
        payment_method: method,
        promo_code: promo?.code ?? null,
        ...q,
      })
      .select()
      .single()
    if (error) throw error

    const { error: itemsError } = await db.from('order_items').insert(
      items.map((i) => ({
        order_id: order.id,
        dish_id: i.dish_id,
        name: i.name,
        base_price: i.base_price,
        unit_price: grossPrice(i.base_price, q.markup_pct, i.tax_pct),
        tax_pct: i.tax_pct,
        options: i.chosen,
        qty: i.qty,
        note: (i.note ?? '').slice(0, 140),
      })),
    )
    if (itemsError) throw itemsError

    // Efectivo: confirmado directamente
    if (method === 'cash') {
      await db.rpc('on_order_confirmed', { p_order: order.id })
      await notifyOrder(order.id, 'confirmed')
      return json({ token: order.tracking_token, code: order.code })
    }

    // Pasarela pendiente de configurar: pago simulado
    if (method === 'test') {
      await db.rpc('mark_order_paid', { p_order: order.id, p_session: 'test' })
      await notifyOrder(order.id, 'confirmed')
      return json({ token: order.tracking_token, code: order.code, test_payment: true })
    }

    // Stripe Checkout
    const lineItems: Record<string, unknown> = {}
    const add = (name: string, amount: number, quantity = 1) => {
      lineItems[Object.keys(lineItems).length] = {
        price_data: { currency: 'eur', unit_amount: cents(amount), product_data: { name } },
        quantity,
      }
    }
    items.forEach((i) =>
      add(i.chosen.length ? `${i.name} (${i.chosen.map((c) => c.name).join(', ')})`.slice(0, 250) : i.name, grossPrice(i.base_price, q.markup_pct, i.tax_pct), i.qty),
    )
    if (q.delivery_fee > 0 && km != null) add(`Envío (${km.toFixed(1)} km)`, q.delivery_fee)
    if (q.tip > 0) add('Propina para tu repartidor', q.tip)

    let discounts
    if (q.discount > 0) {
      const coupon = await stripe<{ id: string }>('coupons', {
        amount_off: cents(q.discount),
        currency: 'eur',
        duration: 'once',
        max_redemptions: 1,
        name: `Promo ${promo!.code}`,
      })
      discounts = { 0: { coupon: coupon.id } }
    }

    // Stripe Connect: si el restaurante tiene su cuenta activa, Stripe le transfiere su parte al cobrar
    const account = await payoutAccount(restaurant.id)
    const transfer = connectTransfer(q)
    const { session, account: paidTo } = await checkoutSession({
      mode: 'payment',
      locale: 'es',
      // Tarjeta (con Apple Pay / Google Pay en los dispositivos compatibles), PayPal o Bizum
      payment_method_types: { 0: method },
      customer_email: order.customer_email ?? undefined,
      client_reference_id: order.id,
      metadata: { type: 'order', order_id: order.id },
      payment_intent_data: { metadata: { order_id: order.id, code: order.code } },
      line_items: lineItems,
      discounts,
      expires_at: Math.floor(Date.now() / 1000) + 31 * 60,
      success_url: `${trackingUrl(order.tracking_token)}?pago=ok`,
      cancel_url: `${siteUrl()}#/pago?cancelado=${order.code}`,
    }, account, cents(transfer)).catch(async (e) => {
      // Sin sesión de pago el pedido no puede seguir: se anula para que no quede colgado
      await db.from('orders').update({ status: 'cancelled', payment_status: 'failed', cancelled_at: new Date().toISOString() }).eq('id', order.id)
      throw new HttpError(502, `No se pudo iniciar el pago${method === 'paypal' ? ' con PayPal' : method === 'bizum' ? ' con Bizum' : ''}. Prueba con otro método. (${e instanceof Error ? e.message : e})`)
    })
    await db
      .from('orders')
      .update({ stripe_session_id: session.id, stripe_account_id: paidTo, connect_amount: paidTo ? transfer : null })
      .eq('id', order.id)
    return json({ token: order.tracking_token, code: order.code, checkout_url: session.url })
  }),
)
