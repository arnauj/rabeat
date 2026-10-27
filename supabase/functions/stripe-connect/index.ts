// Stripe Connect para restaurantes: alta de la cuenta Express, estado y acceso a su panel de Stripe
import { adminClient, requireRole } from '../_shared/db.ts'
import { handle, HttpError, json, siteUrl } from '../_shared/http.ts'
import { stripe, stripeEnabled } from '../_shared/stripe.ts'
import { type Account, saveAccount } from '../_shared/connect.ts'

type Body = { action?: 'status' | 'onboard' | 'dashboard'; restaurant_id?: string }

Deno.serve(
  handle(async (req) => {
    if (req.method !== 'POST') throw new HttpError(405, 'Método no permitido')
    const body: Body = await req.json()
    const user = await requireRole(req, ['restaurant', 'superuser'])
    const db = adminClient()

    const { data: restaurant } = await db.from('restaurants').select('id, name, email, owner_id').eq('id', body.restaurant_id ?? '').maybeSingle()
    if (!restaurant || (user.role !== 'superuser' && restaurant.owner_id !== user.id)) throw new HttpError(404, 'Restaurante no encontrado')

    if (!stripeEnabled()) return json({ enabled: false, account: null })

    const { data: row } = await db.from('restaurant_stripe_accounts').select('account_id').eq('restaurant_id', restaurant.id).maybeSingle()
    let accountId = row?.account_id as string | undefined

    // Estado actualizado desde Stripe (al abrir la tarjeta o al volver del alta)
    if (body.action === 'status' || !body.action) {
      if (!accountId) return json({ enabled: true, account: null })
      const account = await stripe<Account>(`accounts/${accountId}`, undefined, 'GET')
      return json({ enabled: true, account: { account_id: accountId, ...(await saveAccount(account, restaurant.id)) } })
    }

    // Panel Express del restaurante: sus cobros, transferencias e IBAN
    if (body.action === 'dashboard') {
      if (!accountId) throw new HttpError(409, 'Primero completa el alta en Stripe')
      const link = await stripe<{ url: string }>(`accounts/${accountId}/login_links`, {})
      return json({ url: link.url })
    }

    if (body.action !== 'onboard') throw new HttpError(400, 'Acción no válida')

    // Alta: crea la cuenta Express (una por restaurante) y devuelve el enlace de Stripe para completarla
    if (!accountId) {
      const { data: owner } = restaurant.owner_id
        ? await db.from('profiles').select('email').eq('id', restaurant.owner_id).maybeSingle()
        : { data: null }
      const email = String(restaurant.email ?? '').split(/[\s,;]+/)[0] || owner?.email || undefined
      const account = await stripe<Account>('accounts', {
        type: 'express',
        country: 'ES',
        email,
        capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
        business_profile: {
          name: restaurant.name,
          mcc: '5812', // restaurantes
          product_description: 'Restaurante que vende comida a domicilio y en mesa a través de rabeat',
        },
        metadata: { restaurant_id: restaurant.id },
      })
      accountId = account.id
      await saveAccount(account, restaurant.id)
    }

    const back = `${siteUrl()}#/panel/restaurantes/${restaurant.id}/datos`
    const link = await stripe<{ url: string }>('account_links', {
      account: accountId,
      type: 'account_onboarding',
      refresh_url: `${back}?stripe=renovar`,
      return_url: `${back}?stripe=vuelta`,
    })
    return json({ url: link.url })
  }),
)
