import { dateTime, money, paymentLabel } from '../lib/format.js'

// Ticket de cocina/entrega para impresoras térmicas (80 mm o 58 mm), con el diálogo de impresión del navegador
export const TICKET_WIDTHS = { 80: '80 mm', 58: '58 mm' }
const WIDTH_KEY = 'rabeat:ticket-width'

export function getTicketWidth() {
  try {
    return localStorage.getItem(WIDTH_KEY) === '58' ? 58 : 80
  } catch {
    return 80
  }
}

export function setTicketWidth(w) {
  try {
    localStorage.setItem(WIDTH_KEY, String(w))
  } catch {
    /* sin almacenamiento */
  }
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
const row = (left, right, cls = '') => `<div class="row ${cls}"><span>${left}</span><span>${right}</span></div>`

export function ticketHtml(o, { tz, width = 80 } = {}) {
  const dineIn = o.order_type === 'dine_in'
  const r = o.restaurant ?? {}
  const paid = o.payment_status === 'paid'
  const items = [...(o.items ?? [])].sort((a, b) => (a.id > b.id ? 1 : -1))
  const pay =
    o.payment_method === 'cash'
      ? paid
        ? 'COBRADO EN EL LOCAL'
        : `COBRAR ${money(o.total)}`
      : `PAGADO · ${paymentLabel(o)}`

  const body = [
    `<div class="center big">${esc(r.name)}</div>`,
    r.address ? `<div class="center small">${esc(r.address)}</div>` : '',
    r.phone ? `<div class="center small">Tel. ${esc(r.phone)}</div>` : '',
    '<hr>',
    `<div class="center huge">${esc(o.code)}</div>`,
    `<div class="center inv">${dineIn ? `MESA · ${esc(o.table_name)}` : 'A DOMICILIO'}</div>`,
    `<div class="center small">Pedido: ${esc(dateTime(o.created_at, tz))}</div>`,
    o.scheduled_for ? `<div class="center bold">PROGRAMADO: ${esc(dateTime(o.scheduled_for, tz))}</div>` : '',
    '<hr>',
    ...(dineIn
      ? [o.customer_name && o.customer_name !== o.table_name ? `<div>Cliente: <b>${esc(o.customer_name)}</b></div>` : '']
      : [
          `<div><b>${esc(o.customer_name)}</b></div>`,
          o.customer_phone ? `<div>Tel. ${esc(o.customer_phone)}</div>` : '',
          `<div>${esc(o.address?.street)}${o.address?.details ? `, ${esc(o.address.details)}` : ''}</div>`,
          o.address?.notes ? `<div class="small">Indicaciones: ${esc(o.address.notes)}</div>` : '',
          o.distance_km != null ? `<div class="small">${Number(o.distance_km).toFixed(1).replace('.', ',')} km</div>` : '',
        ]),
    '<hr>',
    ...items.map(
      (i) =>
        row(`<b>${i.qty}× ${esc(i.name)}</b>`, money(i.unit_price * i.qty)) +
        (i.options?.length ? `<div class="sub">${i.options.map((x) => esc(x.name)).join(', ')}</div>` : '') +
        (i.note ? `<div class="sub bold">» ${esc(i.note)}</div>` : ''),
    ),
    '<hr>',
    row('Subtotal', money(o.subtotal)),
    Number(o.delivery_fee) > 0 ? row('Envío', money(o.delivery_fee)) : '',
    Number(o.discount) > 0 ? row(`Descuento${o.promo_code ? ` (${esc(o.promo_code)})` : ''}`, `-${money(o.discount)}`) : '',
    Number(o.tip) > 0 ? row('Propina rider', money(o.tip)) : '',
    row('TOTAL', money(o.total), 'total'),
    ...(o.tax_breakdown ?? []).map((t) =>
      row(`IGIC ${String(t.rate).replace('.', ',')}% s/ ${money(t.base)}`, money(t.tax), 'small'),
    ),
    '<hr>',
    `<div class="center inv">${esc(pay)}</div>`,
    '<div class="center small" style="margin-top:3mm">Gracias por pedir con rabeat · rabeat.eu</div>',
  ].join('')

  // Ancho útil: 72 mm en papel de 80 mm y 48 mm en el de 58 mm
  const inner = width === 58 ? 48 : 72
  const font = width === 58 ? 11 : 12.5
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Ticket ${esc(o.code)}</title><style>
@page { size: ${width}mm auto; margin: 0 }
* { box-sizing: border-box }
html, body { margin: 0; padding: 0; background: #fff; color: #000 }
body { width: ${inner}mm; margin: 0 auto; padding: 3mm 0 6mm; font: ${font}px/1.35 ui-monospace, Menlo, Consolas, 'Courier New', monospace }
.center { text-align: center } .bold, b { font-weight: 700 } .small { font-size: 0.85em }
.big { font-size: 1.35em; font-weight: 800 } .huge { font-size: 2em; font-weight: 800; letter-spacing: 1px }
.inv { background: #000; color: #fff; font-weight: 800; padding: 1mm 0; margin: 1mm 0; -webkit-print-color-adjust: exact; print-color-adjust: exact }
.row { display: flex; justify-content: space-between; gap: 2mm } .row span:last-child { white-space: nowrap }
.row.total { font-size: 1.3em; font-weight: 800; margin: 1mm 0 }
.sub { padding-left: 4mm; font-size: 0.9em }
hr { border: 0; border-top: 1px dashed #000; margin: 2mm 0 }
</style></head><body>${body}</body></html>`
}

// Ajusta el largo de la página al contenido para que la impresora no avance papel en blanco
export function fitPage(doc, width) {
  const mm = Math.ceil((doc.documentElement.scrollHeight * 25.4) / 96) + 4
  const style = doc.createElement('style')
  style.textContent = `@page { size: ${width}mm ${mm}mm; margin: 0 }`
  doc.head.appendChild(style)
}

// Imprime en un iframe oculto para no abrir ventanas nuevas
export function printTicket(order, opts) {
  const frame = document.createElement('iframe')
  frame.setAttribute('aria-hidden', 'true')
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'
  document.body.appendChild(frame)
  const doc = frame.contentDocument
  doc.open()
  doc.write(ticketHtml(order, opts))
  doc.close()
  const cleanup = () => setTimeout(() => frame.remove(), 1000)
  frame.contentWindow.addEventListener('afterprint', cleanup)
  setTimeout(() => {
    fitPage(doc, opts?.width ?? 80)
    frame.contentWindow.focus()
    frame.contentWindow.print()
    // Safari no siempre lanza afterprint
    setTimeout(cleanup, 60_000)
  }, 250)
}
