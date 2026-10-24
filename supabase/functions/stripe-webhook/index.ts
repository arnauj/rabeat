// Webhook de Stripe: confirma pagos de pedidos y propinas
import { env, json } from '../_shared/http.ts'
import { verifyStripeSignature } from '../_shared/stripe.ts'
import { applyCheckoutSession } from '../_shared/payments.ts'

Deno.serve(async (req) => {
  const body = await req.text()
  const valid = await verifyStripeSignature(body, req.headers.get('stripe-signature'), env('STRIPE_WEBHOOK_SECRET'))
  if (!valid) return json({ error: 'Firma no válida' }, 400)

  const event = JSON.parse(body)
  try {
    if (
      [
        'checkout.session.completed',
        'checkout.session.async_payment_succeeded',
        'checkout.session.async_payment_failed',
        'checkout.session.expired',
      ].includes(event.type)
    ) {
      await applyCheckoutSession(event.data.object)
    }
  } catch (e) {
    console.error(e)
    return json({ error: 'Error procesando el evento' }, 500)
  }
  return json({ received: true })
})
