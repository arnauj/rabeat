import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: 'rabeat-auth' },
})

// Llama a una Edge Function y lanza un Error con el mensaje del servidor si falla
export async function callFunction(name, body) {
  const { data, error } = await supabase.functions.invoke(name, { body })
  if (error) {
    let message = error.message
    try {
      const payload = await error.context?.json?.()
      if (payload?.error) message = payload.error
    } catch {
      /* respuesta sin JSON */
    }
    throw new Error(message)
  }
  return data
}

// Lanza el error de una consulta de Supabase con un mensaje legible
export function unwrap({ data, error }) {
  if (error) throw new Error(error.message)
  return data
}
