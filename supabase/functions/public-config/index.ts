// Configuración pública: qué integraciones están activas
import { handle, json } from '../_shared/http.ts'
import { onlineMethods, stripeEnabled } from '../_shared/stripe.ts'
import { emailEnabled } from '../_shared/email.ts'

// methods: pagos online disponibles (en modo pruebas se simulan todos)
Deno.serve(
  handle(async () =>
    json({ payments: stripeEnabled() ? 'stripe' : 'test', methods: stripeEnabled() ? onlineMethods() : ['card', 'paypal'], email: emailEnabled() }),
  ),
)
