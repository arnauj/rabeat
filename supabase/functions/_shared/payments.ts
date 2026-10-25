import { adminClient } from './db.ts'
import { notifyOrder, notifyStaffTip } from './notify.ts'
import { paymentDetail, stripe } from './stripe.ts'

type Session = { id: string; payment_status: string; status: string; payment_intent?: string | null; metadata?: Record<string, string> }

// Aplica el resultado de una sesión de Stripe Checkout (idempotente)
export async function applyCheckoutSession(session: Session) {
  const db = adminClient()
  const meta = session.metadata ?? {}
  const paid = session.payment_status === 'paid' || session.payment_status === 'no_payment_required'

  if (meta.type === 'order' && meta.order_id) {
    if (paid) {
      const { data: order } = await db.rpc('mark_order_paid', { p_order: meta.order_id, p_session: session.id })
      if (order && session.payment_intent) {
        // Apple Pay, Google Pay, PayPal o tarjeta: solo informativo, un fallo no afecta al pago
        const detail = await paymentDetail(session.payment_intent).catch((e) => (console.error(e), null))
        if (detail) await db.from('orders').update({ payment_detail: detail }).eq('id', meta.order_id)
      }
      if (order) await notifyOrder(meta.order_id, 'confirmed')
    } else if (session.status === 'expired') {
      await db
        .from('orders')
        .update({ status: 'cancelled', payment_status: 'failed', cancelled_at: new Date().toISOString() })
        .eq('id', meta.order_id)
        .eq('status', 'pending_payment')
    }
  }

  // Propina al equipo del restaurante desde el QR de una mesa
  if (meta.type === 'staff_tip' && meta.staff_tip_id) {
    if (paid) {
      const detail = session.payment_intent ? await paymentDetail(session.payment_intent).catch(() => null) : null
      const { data: tip } = await db
        .from('staff_tips')
        .update({ status: 'paid', paid_at: new Date().toISOString(), payment_detail: detail })
        .eq('id', meta.staff_tip_id)
        .neq('status', 'paid')
        .select('id')
        .maybeSingle()
      if (tip) await notifyStaffTip(tip.id)
    } else if (session.status === 'expired') {
      await db.from('staff_tips').update({ status: 'failed' }).eq('id', meta.staff_tip_id).eq('status', 'pending')
    }
  }

  if (meta.type === 'tip' && meta.tip_id) {
    if (paid) {
      const { data: tip } = await db
        .from('tip_payments')
        .update({ status: 'paid' })
        .eq('id', meta.tip_id)
        .neq('status', 'paid')
        .select()
        .maybeSingle()
      if (tip) await addTipToOrder(tip.order_id, Number(tip.amount))
    } else if (session.status === 'expired') {
      await db.from('tip_payments').update({ status: 'failed' }).eq('id', meta.tip_id).eq('status', 'pending')
    }
  }
}

export async function addTipToOrder(orderId: string, amount: number) {
  const db = adminClient()
  const { data: o } = await db.from('orders').select('tip,total').eq('id', orderId).single()
  if (!o) return
  await db
    .from('orders')
    .update({ tip: Number(o.tip) + amount, total: Number(o.total) + amount })
    .eq('id', orderId)
}

export async function syncSession(sessionId: string) {
  const session = await stripe<Session>(`checkout/sessions/${sessionId}`, undefined, 'GET')
  await applyCheckoutSession(session)
  return session
}
