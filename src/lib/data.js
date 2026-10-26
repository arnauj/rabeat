import { supabase, unwrap } from './supabase.js'
import { sendLive } from './live.js'

const RESTAURANT_LIST = '*, opening_hours(*), dishes(name)'
const RESTAURANT_FULL = '*, opening_hours(*), menu_categories(*), dishes(*, dish_option_groups(*, dish_options(*)))'

export async function listRestaurants() {
  return unwrap(await supabase.from('restaurants').select(RESTAURANT_LIST).eq('active', true).order('name'))
}

// Restaurante con su carta ordenada por categorías
export async function getRestaurant(slugOrId, { byId = false } = {}) {
  const q = supabase.from('restaurants').select(RESTAURANT_FULL)
  const data = unwrap(await (byId ? q.eq('id', slugOrId) : q.eq('slug', slugOrId)).maybeSingle())
  return data ? withMenu(data) : null
}

export function withMenu(r) {
  const categories = [...(r.menu_categories ?? [])].sort((a, b) => a.position - b.position || a.name.localeCompare(b.name))
  const byPos = (a, b) => a.position - b.position
  const dishes = [...(r.dishes ?? [])]
    .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name))
    .map((d) => ({
      ...d,
      groups: [...(d.dish_option_groups ?? [])].sort(byPos).map((g) => ({ ...g, options: [...(g.dish_options ?? [])].sort(byPos) })),
    }))
  return {
    ...r,
    menu: categories.map((c) => ({ ...c, dishes: dishes.filter((d) => d.category_id === c.id) })),
  }
}

export async function myRestaurants(profile) {
  let q = supabase.from('restaurants').select('*, opening_hours(*)').order('name')
  if (profile.role !== 'superuser') q = q.eq('owner_id', profile.id)
  return unwrap(await q)
}

export async function getTracking(token) {
  return unwrap(await supabase.rpc('get_tracking', { p_token: token }))
}

export async function setOrderStatus(orderId, status, token) {
  const order = unwrap(await supabase.rpc('set_order_status', { p_order: orderId, p_status: status }))
  // Aviso instantáneo a la pantalla de seguimiento del cliente
  sendLive(token ?? order?.tracking_token, 'status', { status })
  return order
}

export const ORDER_SELECT = '*, restaurant:restaurants(id, name, slug, address, phone, lat, lng), items:order_items(*)'

// Imagen al bucket público "images" (carpeta del usuario)
export async function uploadImage(file, userId) {
  if (file.size > 5 * 1024 * 1024) throw new Error('La imagen supera los 5 MB')
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
  const path = `${userId}/${crypto.randomUUID()}.${ext}`
  unwrap(await supabase.storage.from('images').upload(path, file, { cacheControl: '31536000', contentType: file.type }))
  return supabase.storage.from('images').getPublicUrl(path).data.publicUrl
}
