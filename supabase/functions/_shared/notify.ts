import { adminClient } from './db.ts'
import { esc, itemsTable, layout, money, p, parseEmails, sendEmail, taxNote } from './email.ts'
import { siteUrl, trackingUrl } from './http.ts'
import { formatHour, slotLabel } from './hours.js'

const REFUND_TO: Record<string, string> = { card: 'en tu tarjeta', paypal: 'en tu cuenta de PayPal', bizum: 'en tu cuenta bancaria (Bizum)' }

export type OrderEvent = 'confirmed' | 'rider_assigned' | 'delivered' | 'cancelled'

async function loadOrder(orderId: string) {
  const db = adminClient()
  const { data: order, error } = await db
    .from('orders')
    .select('*, restaurant:restaurants(*), items:order_items(*), rider:profiles!orders_rider_id_fkey(full_name, phone, email)')
    .eq('id', orderId)
    .single()
  if (error) throw error
  const { data: settings } = await db.from('settings').select('timezone').eq('id', 1).single()
  return { order, tz: settings?.timezone ?? 'Atlantic/Canary' }
}

const when = (order: any, tz: string) =>
  order.scheduled_for ? `programado para <b>${esc(slotLabel(new Date(order.scheduled_for), new Date(), tz))}</b>` : 'lo antes posible'

const addressText = (o: any) =>
  [o.address?.street, o.address?.details].filter(Boolean).join(', ') + (o.address?.notes ? ` · ${o.address.notes}` : '')

// Envía los emails de un evento una sola vez por pedido
export async function notifyOrder(orderId: string, event: OrderEvent) {
  const db = adminClient()
  const { order, tz } = await loadOrder(orderId)
  if (order.notified?.[event]) return { skipped: true }
  await db.from('orders').update({ notified: { ...order.notified, [event]: new Date().toISOString() } }).eq('id', orderId)

  const r = order.restaurant
  const link = trackingUrl(order.tracking_token)
  const totals = {
    Subtotal: Number(order.subtotal),
    Envío: Number(order.delivery_fee),
    ...(Number(order.tip) > 0 ? { 'Propina rider': Number(order.tip) } : {}),
    ...(Number(order.discount) > 0 ? { Descuento: -Number(order.discount) } : {}),
    Total: Number(order.total),
  }
  const sent: Promise<boolean>[] = []

  const dineIn = order.order_type === 'dine_in'

  if (event === 'confirmed' && dineIn) {
    sent.push(
      sendEmail(
        order.customer_email,
        `Pedido ${order.code} · ${order.table_name} · ${r.name}`,
        layout(
          '¡Pedido enviado a cocina!',
          p(`${esc(r.name)} ya tiene tu pedido <b>${order.code}</b> para la <b>${esc(order.table_name)}</b>.`) +
            p(order.payment_method === 'cash' ? `Pagarás <b>${money(order.total)}</b> en el local.` : 'Pago recibido. ¡Gracias!') +
            itemsTable(order.items, totals) + taxNote(order.tax_breakdown, Number(order.total)),
          { href: link, label: 'Ver mi pedido' },
        ),
      ),
    )
  }

  if (event === 'confirmed' && !dineIn) {
    sent.push(
      sendEmail(
        order.customer_email,
        `Pedido ${order.code} confirmado · ${r.name}`,
        layout(
          `¡Pedido confirmado, ${order.customer_name.split(' ')[0]}!`,
          p(`${esc(r.name)} ya tiene tu pedido <b>${order.code}</b>, ${when(order, tz)}.`) +
            p(`Entrega en: ${esc(addressText(order))}`) +
            p(order.payment_method === 'cash' ? `Pagarás <b>${money(order.total)}</b> en efectivo al recibirlo.` : 'Pago recibido. ¡Gracias!') +
            itemsTable(order.items, totals) + taxNote(order.tax_breakdown, Number(order.total)),
          { href: link, label: 'Seguir mi pedido' },
        ),
      ),
    )

    // Repartidores activos: nuevo pedido disponible
    const { data: riders } = await db.from('profiles').select('email').eq('role', 'rider').eq('active', true)
    sent.push(
      sendEmail(
        (riders ?? []).map((x) => x.email),
        `🛵 Nuevo pedido disponible · ${r.name} (${Number(order.distance_km).toFixed(1)} km)`,
        layout(
          'Nuevo pedido para repartir',
          p(`Recogida en <b>${esc(r.name)}</b> · ${esc(r.address)}`) +
            p(`Entrega a ${Number(order.distance_km).toFixed(1).replace('.', ',')} km, ${when(order, tz)}.`) +
            p(Number(order.tip) > 0 ? `Propina: <b>${money(order.tip)}</b> 🐰` : 'Sin propina por ahora.') +
            p(order.payment_method === 'cash' ? `⚠️ Cobro en efectivo: ${money(order.total)}` : 'Pagado online.'),
          { href: `${siteUrl()}#/reparto`, label: 'Aceptar pedido' },
        ),
      ),
    )

  }

  if (event === 'confirmed') {
    // Restaurante: los emails de avisos configurados en su ficha; si no hay, el de su responsable
    const { data: owner } = r.owner_id ? await db.from('profiles').select('email').eq('id', r.owner_id).single() : { data: null }
    const configured = parseEmails(r.email)
    const restaurantEmails = configured.length ? configured : parseEmails(owner?.email)
    const customer = dineIn
      ? ''
      : p(
          `👤 <b>${esc(order.customer_name)}</b> · <a href="tel:${esc(String(order.customer_phone ?? '').replace(/\s/g, ''))}">${esc(order.customer_phone)}</a><br>📍 ${esc(addressText(order))}`,
        )
    const payment =
      order.payment_method === 'cash'
        ? `💶 Cobrar en el local: <b>${money(order.total)}</b>`
        : `✅ Pagado online (${money(order.total)} con IGIC)`
    sent.push(
      sendEmail(
        restaurantEmails,
        `🔔 Nuevo pedido ${order.code}${dineIn ? ` · ${order.table_name}` : ''}`,
        layout(
          `Nuevo pedido ${order.code}`,
          p(dineIn ? `🍽️ Pedido en sala: <b>${esc(order.table_name)}</b>.` : `🛵 A domicilio, entrega ${when(order, tz)}.`) +
            customer +
            p(payment) +
            p('<span style="color:#666;font-size:13px">Importes a tu precio de carta, sin IGIC:</span>') +
            itemsTable(order.items.map((i: any) => ({ ...i, unit_price: i.base_price })), { 'Total a precio de carta': Number(order.restaurant_subtotal) }),
          { href: `${siteUrl()}#/panel/pedidos`, label: 'Ver e imprimir en el panel' },
        ),
      ),
    )
  }

  if (event === 'rider_assigned' && order.rider) {
    const rider = order.rider
    sent.push(
      sendEmail(
        order.customer_email,
        `${rider.full_name.split(' ')[0]} llevará tu pedido ${order.code}`,
        layout(
          'Ya tienes repartidor 🛵',
          p(`<b>${esc(rider.full_name.split(' ')[0])}</b> se encargará de tu pedido de ${esc(r.name)}.`) +
            p('Puedes seguirlo en tiempo real desde la app.'),
          { href: link, label: 'Seguir mi pedido' },
        ),
      ),
      sendEmail(
        rider.email,
        `Pedido ${order.code} asignado · ${r.name}`,
        layout(
          `Pedido ${order.code}`,
          p(`<b>Recogida:</b> ${esc(r.name)} · ${esc(r.address)}${r.phone ? ` · ☎ ${esc(r.phone)}` : ''}`) +
            p(`<b>Entrega:</b> ${esc(order.customer_name)} · ${esc(addressText(order))} · ☎ ${esc(order.customer_phone)}`) +
            p(`Cuándo: ${when(order, tz)}`) +
            p(order.payment_method === 'cash' ? `⚠️ Cobrar en efectivo: <b>${money(order.total)}</b>` : 'Pagado online.') +
            itemsTable(order.items),
          { href: `${siteUrl()}#/reparto`, label: 'Abrir app de reparto' },
        ),
      ),
    )
  }

  if (event === 'delivered' && !dineIn) {
    sent.push(
      sendEmail(
        order.customer_email,
        `¡Que aproveche! Pedido ${order.code} entregado`,
        layout(
          '¡Pedido entregado! 🐰💨',
          p(`Tu pedido de ${esc(r.name)} se entregó a las ${formatHour(new Date(order.delivered_at ?? Date.now()), tz)}.`) +
            p('¿Qué tal ha ido? Valóralo o deja una propina extra a tu repartidor.'),
          { href: link, label: 'Valorar pedido' },
        ),
      ),
    )
  }

  if (event === 'cancelled') {
    sent.push(
      sendEmail(
        order.customer_email,
        `Pedido ${order.code} cancelado`,
        layout(
          'Tu pedido se ha cancelado',
          p(`${esc(r.name)} no ha podido atender tu pedido ${order.code}.`) +
            p(order.payment_status === 'paid' && ['card', 'paypal', 'bizum'].includes(order.payment_method) ? `Te devolveremos el importe ${REFUND_TO[order.payment_method]} en los próximos días.` : ''),
          { href: link, label: 'Ver detalles' },
        ),
      ),
    )
  }

  const results = await Promise.all(sent)
  return { sent: results.filter(Boolean).length }
}


// Aviso al restaurante de una propina para su equipo (desde el QR de una mesa)
export async function notifyStaffTip(tipId: string) {
  const db = adminClient()
  const { data: t } = await db.from('staff_tips').select('*, restaurant:restaurants(name, email, owner_id)').eq('id', tipId).single()
  if (!t) return false
  const r = t.restaurant
  const { data: owner } = r.owner_id ? await db.from('profiles').select('email').eq('id', r.owner_id).single() : { data: null }
  const configured = parseEmails(r.email)
  const to = configured.length ? configured : parseEmails(owner?.email)
  return sendEmail(
    to,
    `💛 Propina de ${money(t.amount)} · ${t.table_name}`,
    layout(
      '¡Propina para el equipo! 💛',
      p(`Un cliente de la <b>${esc(t.table_name)}</b> ha dejado <b>${money(t.amount)}</b> de propina para el equipo de ${esc(r.name)}.`) +
        (t.customer_name ? p(`De: <b>${esc(t.customer_name)}</b>`) : '') +
        (t.message ? p(`<i>“${esc(t.message)}”</i>`) : '') +
        p('<span style="color:#666;font-size:13px">Se incluye íntegra en vuestra próxima liquidación.</span>'),
      { href: `${siteUrl()}#/panel/ventas`, label: 'Ver propinas en el panel' },
    ),
  )
}
