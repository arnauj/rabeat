// Emails tras cambios de estado hechos desde la app (asignación de rider, entrega, cancelación)
import { adminClient, requireRole } from '../_shared/db.ts'
import { handle, HttpError, json } from '../_shared/http.ts'
import { notifyOrder } from '../_shared/notify.ts'

const EXPECTED: Record<string, (o: any) => boolean> = {
  rider_assigned: (o) => Boolean(o.rider_id),
  delivered: (o) => o.status === 'delivered',
  cancelled: (o) => o.status === 'cancelled',
}

Deno.serve(
  handle(async (req) => {
    const user = await requireRole(req, ['rider', 'restaurant', 'superuser'])
    const { order_id, event } = await req.json()
    if (!EXPECTED[event]) throw new HttpError(400, 'Evento no válido')
    const db = adminClient()
    const { data: o } = await db.from('orders').select('id, status, rider_id, restaurant:restaurants(owner_id)').eq('id', order_id).single()
    if (!o) throw new HttpError(404, 'Pedido no encontrado')
    const involved =
      user.role === 'superuser' || o.rider_id === user.id || (o.restaurant as unknown as { owner_id: string } | null)?.owner_id === user.id
    if (!involved) throw new HttpError(403, 'No participas en este pedido')
    if (!EXPECTED[event](o)) throw new HttpError(409, 'El pedido no está en ese estado')
    return json(await notifyOrder(order_id, event))
  }),
)
