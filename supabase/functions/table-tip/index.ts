// Propina para el equipo del restaurante desde el QR de una mesa, sin pedido
import { adminClient } from '../_shared/db.ts'
import { handle, HttpError, json, siteUrl } from '../_shared/http.ts'
import { cents, onlineMethods, stripe, stripeEnabled } from '../_shared/stripe.ts'
import { syncSession } from '../_shared/payments.ts'
import { notifyStaffTip } from '../_shared/notify.ts'

type Body = { action?: 'create' | 'status'; id?: string; table_code?: string; amount?: number; payment_method?: string; name?: string; message?: string }

Deno.serve(
  handle(async (req) => {
    if (req.method !== 'POST') throw new HttpError(405, 'Método no permitido')
    const body: Body = await req.json()
    const db = adminClient()

    // Estado tras volver de la pasarela (por si el webhook aún no ha llegado)
    if (body.action === 'status') {
      const { data: tip } = await db.from('staff_tips').select('id, status, amount, stripe_session_id, restaurant:restaurants(name)').eq('id', body.id ?? '').maybeSingle()
      if (!tip) throw new HttpError(404, 'Propina no encontrada')
      if (tip.status === 'pending' && stripeEnabled() && tip.stripe_session_id?.startsWith('cs_')) await syncSession(tip.stripe_session_id)
      const { data } = await db.from('staff_tips').select('status, amount').eq('id', tip.id).single()
      return json(data)
    }

    // --- Mesa y restaurante
    const { data: table } = await db
      .from('restaurant_tables')
      .select('id, name, code, active, restaurant:restaurants(id, name, active)')
      .eq('code', String(body.table_code ?? '').trim().toLowerCase())
      .maybeSingle()
    const restaurant = table?.restaurant as unknown as { id: string; name: string; active: boolean } | null
    if (!table || !table.active || !restaurant?.active) throw new HttpError(404, 'Este código QR no está activo')

    const { data: settings } = await db.from('settings').select('max_tip').eq('id', 1).single()
    const amount = Math.round(Number(body.amount) * 100) / 100
    const max = Number(settings?.max_tip ?? 50)
    if (!(amount >= 0.5 && amount <= max)) throw new HttpError(400, `La propina debe estar entre 0,50 € y ${max} €`)

    const online = body.payment_method === 'paypal' || body.payment_method === 'bizum' ? body.payment_method : 'card'
    if (stripeEnabled() && !onlineMethods().includes(online)) throw new HttpError(400, 'Ese método de pago no está disponible')
    const method = stripeEnabled() ? online : 'test'

    const { data: tip, error } = await db
      .from('staff_tips')
      .insert({
        restaurant_id: restaurant.id,
        table_id: table.id,
        table_name: table.name,
        amount,
        customer_name: body.name?.trim().slice(0, 60) || null,
        message: body.message?.trim().slice(0, 280) || null,
        payment_method: method,
      })
      .select()
      .single()
    if (error) throw error

    // Pasarela pendiente de configurar: cobro simulado
    if (method === 'test') {
      await db.from('staff_tips').update({ status: 'paid', paid_at: new Date().toISOString(), stripe_session_id: 'test' }).eq('id', tip.id)
      await notifyStaffTip(tip.id)
      return json({ id: tip.id, paid: true, test_payment: true })
    }

    const back = `${siteUrl()}#/mesa/${table.code}/propina`
    const session = await stripe<{ id: string; url: string }>('checkout/sessions', {
      mode: 'payment',
      locale: 'es',
      payment_method_types: { 0: method },
      metadata: { type: 'staff_tip', staff_tip_id: tip.id },
      payment_intent_data: { metadata: { staff_tip_id: tip.id }, description: `Propina · ${restaurant.name} · ${table.name}` },
      line_items: {
        0: { price_data: { currency: 'eur', unit_amount: cents(amount), product_data: { name: `Propina para el equipo de ${restaurant.name}` } }, quantity: 1 },
      },
      expires_at: Math.floor(Date.now() / 1000) + 31 * 60,
      success_url: `${back}?gracias=${tip.id}`,
      cancel_url: back,
    }).catch(async (e) => {
      await db.from('staff_tips').update({ status: 'failed' }).eq('id', tip.id)
      throw new HttpError(502, `No se pudo iniciar el pago. Prueba con otro método. (${e instanceof Error ? e.message : e})`)
    })
    await db.from('staff_tips').update({ stripe_session_id: session.id }).eq('id', tip.id)
    return json({ id: tip.id, checkout_url: session.url })
  }),
)
