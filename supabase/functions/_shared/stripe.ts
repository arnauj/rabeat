import { env } from './http.ts'

export const stripeEnabled = () => env('STRIPE_SECRET_KEY').startsWith('sk_')

// Métodos de pago online ofrecidos. «card» incluye Apple Pay y Google Pay (Stripe los muestra en el
// dispositivo compatible); «paypal» y «bizum» hay que activarlos antes en Stripe → Configuración → Métodos de pago.
export const ONLINE_METHODS = ['card', 'paypal', 'bizum'] as const
export const onlineMethods = () =>
  env('STRIPE_PAYMENT_METHODS', 'card,paypal,bizum')
    .split(',')
    .map((m) => m.trim())
    .filter((m) => (ONLINE_METHODS as readonly string[]).includes(m))

// Medio concreto con el que se pagó: apple_pay, google_pay, paypal, bizum o «visa ·4242»
export async function paymentDetail(paymentIntentId: string) {
  type Charge = { payment_method_details?: { type: string; card?: { brand?: string; last4?: string; wallet?: { type?: string } | null } } }
  const pi = await stripe<{ latest_charge?: Charge | null }>(`payment_intents/${paymentIntentId}?expand%5B%5D=latest_charge`, undefined, 'GET')
  const d = pi.latest_charge?.payment_method_details
  if (!d) return null
  if (d.type === 'card') return d.card?.wallet?.type ?? `${d.card?.brand ?? 'card'} ·${d.card?.last4 ?? ''}`
  return d.type
}

function encode(params: Record<string, unknown>, prefix = '', out: string[] = []) {
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue
    const key = prefix ? `${prefix}[${k}]` : k
    if (typeof v === 'object') encode(v as Record<string, unknown>, key, out)
    else out.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`)
  }
  return out
}

export async function stripe<T = Record<string, unknown>>(path: string, params?: Record<string, unknown>, method = 'POST') {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${env('STRIPE_SECRET_KEY')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: method === 'GET' ? undefined : encode(params ?? {}).join('&'),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(`Stripe: ${data?.error?.message ?? res.statusText}`)
  return data as T
}

export const cents = (eur: number) => Math.round(eur * 100)

// Verifica la cabecera Stripe-Signature (esquema v1, HMAC-SHA256)
export async function verifyStripeSignature(body: string, header: string | null, secret: string, toleranceSec = 300) {
  if (!header || !secret) return false
  const parts = header.split(',').map((p) => p.split('='))
  const t = parts.find(([k]) => k === 't')?.[1]
  const sigs = parts.filter(([k]) => k === 'v1').map(([, v]) => v)
  if (!t || !sigs.length) return false
  if (Math.abs(Date.now() / 1000 - Number(t)) > toleranceSec) return false
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${t}.${body}`))
  const expected = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('')
  return sigs.some((s) => s.length === expected.length && timingSafeEqual(s, expected))
}

function timingSafeEqual(a: string, b: string) {
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}
