// Simulación acelerada del estado de un pedido (en segundos desde que empieza)
export const STAGES = [
  { id: 'confirmed', label: 'Pedido confirmado', hint: 'El restaurante ha aceptado tu pedido', at: 0 },
  { id: 'preparing', label: 'En la cocina', hint: 'Están preparando tu comida', at: 6 },
  { id: 'onTheWay', label: 'En camino', hint: 'Tu rider va a toda liebre', at: 20 },
  { id: 'delivered', label: 'Entregado', hint: '¡Que aproveche!', at: 45 },
]

export function orderProgress(order, now = new Date()) {
  const start = new Date(order.scheduledFor ?? order.createdAt)
  // Los programados empiezan a prepararse 30 min antes de la franja
  const kickoff = order.scheduledFor ? new Date(start.getTime() - 30 * 60_000) : start
  if (now < kickoff) return { scheduled: true, stageIndex: -1, ride: 0 }
  const elapsed = (now - kickoff) / 1000
  let stageIndex = 0
  STAGES.forEach((s, i) => {
    if (elapsed >= s.at) stageIndex = i
  })
  const onTheWay = STAGES[2]
  const delivered = STAGES[3]
  const ride = Math.min(1, Math.max(0, (elapsed - onTheWay.at) / (delivered.at - onTheWay.at)))
  return { scheduled: false, stageIndex, ride }
}
