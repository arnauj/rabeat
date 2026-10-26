import { useEffect, useRef } from 'react'
import { supabase } from './supabase.js'

// Canal en directo de un pedido (Supabase Realtime, difusión): el rider envía su posición
// cada pocos segundos y el panel/rider avisan de cada cambio de estado. El token del pedido
// es secreto, así que solo lo conocen el cliente, el restaurante y el rider.
const channels = new Map()

function channel(token) {
  let c = channels.get(token)
  if (!c) {
    c = supabase.channel(`track:${token}`, { config: { broadcast: { self: false } } })
    c.subscribe()
    channels.set(token, c)
  }
  return c
}

export function sendLive(token, event, payload = {}) {
  if (!token) return
  channel(token)
    .send({ type: 'broadcast', event, payload: { ...payload, at: Date.now() } })
    .catch(() => {})
}

export function closeLive(token) {
  const c = channels.get(token)
  if (c) supabase.removeChannel(c)
  channels.delete(token)
}

// Escucha un pedido: onPosition({ lat, lng, at, heading }) y onStatus()
export function useLiveOrder(token, { onPosition, onStatus }) {
  const handlers = useRef({ onPosition, onStatus })
  handlers.current = { onPosition, onStatus }
  useEffect(() => {
    if (!token) return
    const c = supabase
      .channel(`track:${token}`, { config: { broadcast: { self: false } } })
      .on('broadcast', { event: 'position' }, ({ payload }) => handlers.current.onPosition?.(payload))
      .on('broadcast', { event: 'status' }, ({ payload }) => handlers.current.onStatus?.(payload))
      .subscribe()
    return () => {
      supabase.removeChannel(c)
    }
  }, [token])
}

// Distancia en km y minutos aproximados en moto por ciudad
export function travel(from, to) {
  if (!from || !to || from.lat == null || to.lat == null) return null
  const R = 6371
  const dLat = ((to.lat - from.lat) * Math.PI) / 180
  const dLng = ((to.lng - from.lng) * Math.PI) / 180
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((from.lat * Math.PI) / 180) * Math.cos((to.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  const km = 2 * R * Math.asin(Math.sqrt(a)) * 1.3 // las calles no van en línea recta
  return { km, min: Math.max(1, Math.round((km / 22) * 60 + 1)) }
}
