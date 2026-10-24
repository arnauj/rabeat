import { env } from './http.ts'

export const stripeEnabled = () => env('STRIPE_SECRET_KEY').startsWith('sk_')

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
