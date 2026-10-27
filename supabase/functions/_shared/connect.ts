// Stripe Connect (cuentas Express, destination charges): cada restaurante recibe su parte al instante
import { adminClient } from './db.ts'
import { stripe, stripeEnabled } from './stripe.ts'

export type Account = {
  id: string
  details_submitted?: boolean
  charges_enabled?: boolean
  payouts_enabled?: boolean
  capabilities?: Record<string, string>
  requirements?: { currently_due?: string[]; past_due?: string[] } | null
  metadata?: Record<string, string>
}

// Guarda el estado de la cuenta conectada (tras el alta, al volver de Stripe o por el webhook account.updated)
export async function saveAccount(account: Account, restaurantId?: string) {
  const db = adminClient()
  const row = {
    details_submitted: !!account.details_submitted,
    charges_enabled: !!account.charges_enabled,
    payouts_enabled: !!account.payouts_enabled,
    transfers_active: account.capabilities?.transfers === 'active',
    requirements_due: [...new Set([...(account.requirements?.past_due ?? []), ...(account.requirements?.currently_due ?? [])])],
    updated_at: new Date().toISOString(),
  }
  if (restaurantId) {
    await db.from('restaurant_stripe_accounts').upsert({ restaurant_id: restaurantId, account_id: account.id, ...row })
  } else {
    await db.from('restaurant_stripe_accounts').update(row).eq('account_id', account.id)
  }
  return row
}

// Cuenta a la que se puede enviar el dinero de un restaurante, o null (cobro centralizado)
export async function payoutAccount(restaurantId: string) {
  if (!stripeEnabled()) return null
  const { data } = await adminClient()
    .from('restaurant_stripe_accounts')
    .select('account_id, transfers_active')
    .eq('restaurant_id', restaurantId)
    .maybeSingle()
  return data?.transfers_active ? (data.account_id as string) : null
}

// Crea una sesión de Checkout transfiriendo `amount` € a la cuenta del restaurante.
// Si Stripe la rechaza con Connect (p. ej. un método de pago que no lo admite), se reintenta con cobro centralizado.
export async function checkoutSession(params: Record<string, unknown>, account: string | null, amountCents: number) {
  type Session = { id: string; url: string }
  if (account && amountCents > 0) {
    const pi = (params.payment_intent_data ?? {}) as Record<string, unknown>
    try {
      const session = await stripe<Session>('checkout/sessions', {
        ...params,
        payment_intent_data: { ...pi, transfer_data: { destination: account, amount: amountCents } },
      })
      return { session, account }
    } catch (e) {
      console.error('Connect: se cobra de forma centralizada', e)
    }
  }
  return { session: await stripe<Session>('checkout/sessions', params), account: null }
}
