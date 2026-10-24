import nodemailer from 'npm:nodemailer@6.9.16'
import { env, siteUrl } from './http.ts'

export const emailEnabled = () => Boolean(env('SMTP_USER') && env('SMTP_PASS'))

let transporter: ReturnType<typeof nodemailer.createTransport> | null = null

// Gmail: puerto 465 (SSL). Supabase bloquea el 25 y el 587 en las Edge Functions.
function transport() {
  transporter ??= nodemailer.createTransport({
    host: env('SMTP_HOST', 'smtp.gmail.com'),
    port: Number(env('SMTP_PORT', '465')),
    secure: Number(env('SMTP_PORT', '465')) === 465,
    auth: { user: env('SMTP_USER'), pass: env('SMTP_PASS') },
  })
  return transporter
}

export async function sendEmail(to: string | string[], subject: string, html: string) {
  const recipients = (Array.isArray(to) ? to : [to]).filter(Boolean)
  if (!recipients.length) return false
  if (!emailEnabled()) {
    console.log(`[email desactivado] ${subject} → ${recipients.join(', ')}`)
    return false
  }
  try {
    await transport().sendMail({
      from: env('MAIL_FROM', `rabeat <${env('SMTP_USER')}>`),
      to: recipients.length === 1 ? recipients[0] : env('SMTP_USER'),
      bcc: recipients.length > 1 ? recipients : undefined,
      subject,
      html,
    })
    return true
  } catch (e) {
    console.error('Error enviando email', e)
    return false
  }
}

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

export const money = (n: number) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(Number(n))

// Plantilla base con la marca (estilos en línea para clientes de correo)
export function layout(title: string, body: string, cta?: { href: string; label: string }) {
  return `<!doctype html><html lang="es"><body style="margin:0;background:#f5f5f5;font-family:Helvetica,Arial,sans-serif;color:#111">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px"><tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:20px;overflow:hidden">
<tr><td style="padding:20px 24px;border-bottom:1px solid #eee"><img src="${siteUrl()}logo-email.png" alt="rabeat" height="40" style="display:block"></td></tr>
<tr><td style="padding:24px">
<h1 style="margin:0 0 12px;font-size:22px;font-style:italic;font-weight:900">${esc(title)}</h1>
${body}
${cta ? `<p style="margin:24px 0 8px"><a href="${cta.href}" style="display:inline-block;background:#E30613;color:#fff;text-decoration:none;font-weight:bold;padding:14px 22px;border-radius:14px">${esc(cta.label)}</a></p>` : ''}
</td></tr>
<tr><td style="padding:16px 24px;background:#111;color:#bbb;font-size:12px">rabeat · comida a domicilio desde Canarias</td></tr>
</table></td></tr></table></body></html>`
}

type Item = { name: string; qty: number; unit_price: number; note?: string; options?: { group: string; name: string; price: number }[] }

export function itemsTable(items: Item[], totals?: Record<string, number>) {
  const rows = items
    .map(
      (i) =>
        `<tr><td style="padding:6px 0"><b>${i.qty}×</b> ${esc(i.name)}${
          i.options?.length ? `<br><span style="color:#666;font-size:12px">${i.options.map((o) => esc(o.name)).join(' · ')}</span>` : ''
        }${i.note ? `<br><span style="color:#888;font-size:12px">“${esc(i.note)}”</span>` : ''}</td><td align="right" style="padding:6px 0">${money(i.qty * i.unit_price)}</td></tr>`,
    )
    .join('')
  const totalRows = totals
    ? Object.entries(totals)
        .map(
          ([k, v], idx, arr) =>
            `<tr><td style="padding:4px 0;color:${idx === arr.length - 1 ? '#111' : '#666'};${idx === arr.length - 1 ? 'font-weight:bold;font-size:16px' : ''}">${esc(k)}</td><td align="right" style="padding:4px 0;${idx === arr.length - 1 ? 'font-weight:bold;font-size:16px' : ''}">${money(v)}</td></tr>`,
        )
        .join('')
    : ''
  return `<table width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;border-top:1px solid #eee;margin-top:12px">${rows}${
    totalRows ? `<tr><td colspan="2" style="border-top:1px dashed #ddd;padding-top:6px"></td></tr>${totalRows}` : ''
  }</table>`
}

export const p = (html: string) => `<p style="margin:0 0 10px;font-size:15px;line-height:1.5">${html}</p>`
export { esc }

// Desglose de IGIC para el pie del pedido
export function taxNote(breakdown: { rate: number; base: number; tax: number }[] = [], total = 0) {
  if (!breakdown.length) return ''
  const rows = breakdown
    .map((b) => `IGIC ${String(b.rate).replace('.', ',')} %: base ${money(b.base)} · cuota ${money(b.tax)}`)
    .join('<br>')
  const tax = breakdown.reduce((n, b) => n + Number(b.tax), 0)
  return `<p style="margin:8px 0 0;font-size:12px;color:#888;line-height:1.5">Impuestos incluidos (IGIC ${money(tax)}${total ? ` de ${money(total)}` : ''})<br>${rows}</p>`
}
