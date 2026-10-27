// Webhook de Stripe: confirma pagos de pedidos y propinas, y el estado de las cuentas Connect de los restaurantes
import { env, json } from '../_shared/http.ts'
import { verifyStripeSignature } from '../_shared/stripe.ts'
import { applyCheckoutSession } from '../_shared/payments.ts'
import { saveAccount } from '../_shared/connect.ts'

Deno.serve(async (req) => {
  const body = await req.text()
  // Los eventos de cuentas conectadas llegan desde un endpoint aparte de Stripe, con su propio secreto
  const signature = req.headers.get('stripe-signature')
  const valid =
    (await verifyStripeSignature(body, signature, env('STRIPE_WEBHOOK_SECRET'))) ||
    (await verifyStripeSignature(body, signature, env('STRIPE_CONNECT_WEBHOOK_SECRET')))
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
    if (event.type === 'account.updated') await saveAccount(event.data.object)
  } catch (e) {
    console.error(e)
    return json({ error: 'Error procesando el evento' }, 500)
  }
  return json({ received: true })
})
