// Configuración pública: qué integraciones están activas
import { handle, json } from '../_shared/http.ts'
import { stripeEnabled } from '../_shared/stripe.ts'
import { emailEnabled } from '../_shared/email.ts'

Deno.serve(handle(async () => json({ payments: stripeEnabled() ? 'stripe' : 'test', email: emailEnabled() })))
