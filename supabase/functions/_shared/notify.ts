import { adminClient } from './db.ts'
import { esc, itemsTable, layout, money, p, sendEmail } from './email.ts'
import { siteUrl, trackingUrl } from './http.ts'
import { formatHour, slotLabel } from './hours.js'

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
            itemsTable(order.items, totals),
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
            itemsTable(order.items, totals),
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
            p(order.payment_method === 'cash' ? `⚠️ Cobro en efectivo: ${money(order.total)}` : 'Pagado con tarjeta.'),
          { href: `${siteUrl()}#/reparto`, label: 'Aceptar pedido' },
        ),
      ),
    )

  }

  if (event === 'confirmed') {
    // Restaurante (email del local y de su responsable)
    const { data: owner } = r.owner_id ? await db.from('profiles').select('email').eq('id', r.owner_id).single() : { data: null }
    const restaurantEmails = [...new Set([r.email, owner?.email].filter(Boolean))]
    sent.push(
      sendEmail(
        restaurantEmails,
        `🔔 Nuevo pedido ${order.code}${dineIn ? ` · ${order.table_name}` : ''}`,
        layout(
          `Nuevo pedido ${order.code}`,
          p(dineIn ? `🍽️ Pedido en sala: <b>${esc(order.table_name)}</b>.` : `Entrega ${when(order, tz)} a ${esc(order.customer_name)}.`) + itemsTable(order.items.map((i: any) => ({ ...i, unit_price: i.base_price }))),
          { href: `${siteUrl()}#/panel/pedidos`, label: 'Ver en el panel' },
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
            p(order.payment_method === 'cash' ? `⚠️ Cobrar en efectivo: <b>${money(order.total)}</b>` : 'Pagado con tarjeta.') +
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
            p(order.payment_status === 'paid' && order.payment_method === 'card' ? 'Te devolveremos el importe en tu tarjeta en los próximos días.' : ''),
          { href: link, label: 'Ver detalles' },
        ),
      ),
    )
  }

  const results = await Promise.all(sent)
  return { sent: results.filter(Boolean).length }
}

