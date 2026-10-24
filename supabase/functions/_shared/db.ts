import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.49.4'
import { env, HttpError } from './http.ts'

let admin: SupabaseClient | null = null

// Cliente con service role: salta RLS, solo para uso en el servidor
export function adminClient() {
  admin ??= createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return admin
}

export type Profile = { id: string; email: string; full_name: string; phone: string; role: string; active: boolean }

// Usuario que hace la petición (o null si es invitado)
export async function currentUser(req: Request): Promise<Profile | null> {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!token || token.split('.').length !== 3) return null
  const { data, error } = await adminClient().auth.getUser(token)
  if (error || !data.user) return null
  const { data: profile } = await adminClient().from('profiles').select('*').eq('id', data.user.id).single()
  return profile?.active ? (profile as Profile) : null
}

export async function requireRole(req: Request, roles: string[]) {
  const user = await currentUser(req)
  if (!user) throw new HttpError(401, 'Inicia sesión para continuar')
  if (!roles.includes(user.role)) throw new HttpError(403, 'No tienes permiso para esta acción')
  return user
}
