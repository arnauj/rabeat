// Comprueba en Stripe el pago de un pedido (por si el webhook aún no ha llegado)
import { adminClient } from '../_shared/db.ts'
import { handle, HttpError, json } from '../_shared/http.ts'
import { stripeEnabled } from '../_shared/stripe.ts'
import { syncSession } from '../_shared/payments.ts'

Deno.serve(
  handle(async (req) => {
    const { token } = await req.json()
    if (!token) throw new HttpError(400, 'Falta el pedido')
    const db = adminClient()
    const { data: order } = await db.from('orders').select('id, stripe_session_id, payment_status').eq('tracking_token', token).single()
    if (!order) throw new HttpError(404, 'Pedido no encontrado')
    if (stripeEnabled()) {
      if (order.payment_status !== 'paid' && order.stripe_session_id?.startsWith('cs_')) await syncSession(order.stripe_session_id)
      const { data: tips } = await db.from('tip_payments').select('stripe_session_id').eq('order_id', order.id).eq('status', 'pending')
      for (const t of tips ?? []) if (t.stripe_session_id) await syncSession(t.stripe_session_id)
    }
    const { data } = await db.from('orders').select('payment_status, status').eq('id', order.id).single()
    return json(data)
  }),
)
