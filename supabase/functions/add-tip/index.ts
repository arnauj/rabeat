// Propina extra para el repartidor después del pedido
import { adminClient } from '../_shared/db.ts'
import { handle, HttpError, json, trackingUrl } from '../_shared/http.ts'
import { cents, stripe, stripeEnabled } from '../_shared/stripe.ts'
import { addTipToOrder } from '../_shared/payments.ts'

Deno.serve(
  handle(async (req) => {
    const { token, amount } = await req.json()
    const value = Math.round(Number(amount) * 100) / 100
    if (!(value >= 0.5 && value <= 50)) throw new HttpError(400, 'La propina debe estar entre 0,50 € y 50 €')
    const db = adminClient()
    const { data: order } = await db.from('orders').select('*').eq('tracking_token', token).single()
    if (!order) throw new HttpError(404, 'Pedido no encontrado')
    if (order.status === 'cancelled' || order.status === 'pending_payment') throw new HttpError(409, 'Este pedido no admite propinas')

    // Efectivo o pasarela sin configurar: se suma directamente (en efectivo se entrega al rider)
    if (!['card', 'paypal'].includes(order.payment_method) || !stripeEnabled()) {
      await db.from('tip_payments').insert({ order_id: order.id, amount: value, status: 'paid' })
      await addTipToOrder(order.id, value)
      return json({ ok: true, direct: true })
    }

    const { data: tip, error } = await db.from('tip_payments').insert({ order_id: order.id, amount: value }).select().single()
    if (error) throw error
    const session = await stripe<{ id: string; url: string }>('checkout/sessions', {
      mode: 'payment',
      locale: 'es',
      payment_method_types: { 0: order.payment_method }, // mismo medio que el pedido
      customer_email: order.customer_email,
      metadata: { type: 'tip', tip_id: tip.id, order_id: order.id },
      line_items: { 0: { price_data: { currency: 'eur', unit_amount: cents(value), product_data: { name: `Propina para tu repartidor · ${order.code}` } }, quantity: 1 } },
      success_url: `${trackingUrl(order.tracking_token)}?propina=ok`,
      cancel_url: trackingUrl(order.tracking_token),
    })
    await db.from('tip_payments').update({ stripe_session_id: session.id }).eq('id', tip.id)
    return json({ checkout_url: session.url })
  }),
)
