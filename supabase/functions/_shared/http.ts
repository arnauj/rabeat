export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

export const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

// Envuelve un handler con CORS y errores en JSON
export function handle(fn: (req: Request) => Promise<Response>) {
  return async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
    try {
      return await fn(req)
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 500
      if (status === 500) console.error(e)
      return json({ error: e instanceof Error ? e.message : String(e) }, status)
    }
  }
}

export const env = (name: string, fallback = '') => Deno.env.get(name) ?? fallback

export const siteUrl = () => {
  const url = env('SITE_URL', 'https://arnauj.github.io/rabeat/')
  return url.endsWith('/') ? url : `${url}/`
}
export const trackingUrl = (token: string) => `${siteUrl()}#/pedido/${token}`
