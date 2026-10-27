import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import Icon from '../components/Icon.jsx'
import { Button, Card, ErrorBox, Field, Loading, Toggle, useToast } from '../components/ui.jsx'
import { useAsync } from '../lib/useAsync.js'
import { useSettings } from '../lib/settings.jsx'
import { ratesFor } from '../lib/pricing.js'
import { supabase, unwrap } from '../lib/supabase.js'

// Enlace que abre la carta en modo mesa (usa la dirección actual de la web)
export const tableUrl = (code) => `${window.location.origin}${window.location.pathname}#/mesa/${code}`

const qrDataUrl = (code, width = 600) =>
  QRCode.toDataURL(tableUrl(code), { width, margin: 1, errorCorrectionLevel: 'M', color: { dark: '#111111', light: '#ffffff' } })

const loadImage = (src) =>
  new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })

// Recorta el texto con "…" si no cabe en el ancho dado
function fitText(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text
  let t = text
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxWidth) t = t.slice(0, -1)
  return `${t}…`
}

const BRAND = '#E30613'
const INK = '#111111'

// Tarjeta imprimible: cabecera con el local, QR con la mesa y, abajo, publicidad de rabeat con la mascota
export async function tableCard(table, restaurantName) {
  const W = 1200
  const H = 1800
  const canvas = Object.assign(document.createElement('canvas'), { width: W, height: H })
  const ctx = canvas.getContext('2d')
  await document.fonts?.ready
  const [qr, mascot] = await Promise.all([loadImage(await qrDataUrl(table.code, 640)), loadImage('mascot.png').catch(() => null)])

  // Fondo crema con lunares suaves
  ctx.fillStyle = '#FFF7F0'
  ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = 'rgba(227,6,19,0.06)'
  for (let y = 300; y < 1290; y += 46) for (let x = (y / 46) % 2 ? 23 : 0; x < W; x += 46) {
    ctx.beginPath()
    ctx.arc(x, y, 4, 0, Math.PI * 2)
    ctx.fill()
  }

  // Cabecera roja con borde inferior curvo
  ctx.fillStyle = BRAND
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.lineTo(W, 0)
  ctx.lineTo(W, 230)
  ctx.quadraticCurveTo(W / 2, 330, 0, 230)
  ctx.closePath()
  ctx.fill()
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = '#ffffff'
  ctx.font = 'italic 900 88px Rubik, sans-serif'
  ctx.fillText(fitText(ctx, restaurantName, W - 120), W / 2, 140)
  ctx.font = '700 38px "Plus Jakarta Sans", sans-serif'
  ctx.fillStyle = 'rgba(255,255,255,0.9)'
  ctx.fillText('Escanea · Pide · Disfruta', W / 2, 205)

  // Tarjeta blanca del QR con sombra
  const card = { x: (W - 760) / 2, y: 330, w: 760, h: 860 }
  ctx.save()
  ctx.shadowColor = 'rgba(17,17,17,0.18)'
  ctx.shadowBlur = 50
  ctx.shadowOffsetY = 16
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  ctx.roundRect(card.x, card.y, card.w, card.h, 48)
  ctx.fill()
  ctx.restore()

  const q = { x: (W - 640) / 2, y: card.y + 60, s: 640 }
  ctx.drawImage(qr, q.x, q.y, q.s, q.s)
  // Esquinas rojas de "visor" alrededor del QR
  ctx.strokeStyle = BRAND
  ctx.lineWidth = 12
  ctx.lineCap = 'round'
  const pad = 24
  const len = 70
  const corners = [
    [q.x - pad, q.y - pad, 1, 1],
    [q.x + q.s + pad, q.y - pad, -1, 1],
    [q.x - pad, q.y + q.s + pad, 1, -1],
    [q.x + q.s + pad, q.y + q.s + pad, -1, -1],
  ]
  for (const [cx, cy, dx, dy] of corners) {
    ctx.beginPath()
    ctx.moveTo(cx, cy + dy * len)
    ctx.lineTo(cx, cy)
    ctx.lineTo(cx + dx * len, cy)
    ctx.stroke()
  }

  // Píldora con el nombre de la mesa
  ctx.font = '800 64px "Plus Jakarta Sans", sans-serif'
  const label = fitText(ctx, table.name, card.w - 120)
  const pw = ctx.measureText(label).width + 90
  ctx.fillStyle = INK
  ctx.beginPath()
  ctx.roundRect((W - pw) / 2, card.y + card.h - 120, pw, 96, 48)
  ctx.fill()
  ctx.fillStyle = '#ffffff'
  ctx.textBaseline = 'middle'
  ctx.fillText(label, W / 2, card.y + card.h - 70)

  // Banda publicitaria de rabeat
  const band = 1290
  ctx.fillStyle = INK
  ctx.beginPath()
  ctx.moveTo(0, band + 70)
  ctx.quadraticCurveTo(W / 2, band - 40, W, band + 70)
  ctx.lineTo(W, H)
  ctx.lineTo(0, H)
  ctx.closePath()
  ctx.fill()
  // Disco crema con aro rojo para que la mascota destaque sobre la banda oscura
  const disc = { x: 925, y: 1555, r: 205 }
  ctx.fillStyle = BRAND
  ctx.beginPath()
  ctx.arc(disc.x, disc.y, disc.r + 14, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#FFF7F0'
  ctx.beginPath()
  ctx.arc(disc.x, disc.y, disc.r, 0, Math.PI * 2)
  ctx.fill()
  if (mascot) {
    const mh = 520
    const mw = (mascot.width / mascot.height) * mh
    ctx.drawImage(mascot, disc.x - mw / 2 + 20, H - mh - 30, mw, mh)
  }

  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  const tx = 70
  ctx.fillStyle = BRAND
  ctx.font = '800 30px "Plus Jakarta Sans", sans-serif'
  ctx.fillText('POWERED BY', tx, band + 150)
  ctx.fillStyle = '#ffffff'
  ctx.font = 'italic 900 140px Rubik, sans-serif'
  ctx.fillText('rabeat', tx - 6, band + 285)
  ctx.font = '600 32px "Plus Jakarta Sans", sans-serif'
  ctx.fillStyle = 'rgba(255,255,255,0.75)'
  ctx.fillText('Tu carta en el móvil:', tx, band + 352)
  ctx.fillText('pide desde la mesa, sin esperas.', tx, band + 392)
  // Botón con la web
  ctx.font = 'italic 900 44px Rubik, sans-serif'
  const url = 'rabeat.eu'
  const bw = ctx.measureText(url).width + 80
  ctx.fillStyle = BRAND
  ctx.beginPath()
  ctx.roundRect(tx, band + 420, bw, 76, 38)
  ctx.fill()
  ctx.fillStyle = '#ffffff'
  ctx.textBaseline = 'middle'
  ctx.fillText(url, tx + 40, band + 460)

  return canvas
}

const cardDataUrl = async (table, restaurantName) => (await tableCard(table, restaurantName)).toDataURL('image/png')
const fileName = (table) => `qr-${table.name.toLowerCase().replace(/\s+/g, '-')}.png`

// Guarda la tarjeta. Se llama de forma síncrona desde el clic: iOS descarta descargas y el menú de compartir si antes hay un await.
// En móvil abre el menú de compartir (Guardar imagen, WhatsApp…); en escritorio descarga el PNG.
function saveFile(file, url) {
  const touch = window.matchMedia?.('(pointer: coarse)').matches
  if (touch && navigator.canShare?.({ files: [file] })) return navigator.share({ files: [file] }).catch(() => {})
  const a = Object.assign(document.createElement('a'), { href: url, download: file.name })
  document.body.append(a)
  a.click()
  a.remove()
}

export default function TablesEditor({ restaurant: r }) {
  const toast = useToast()
  const { settings } = useSettings()
  const { data: tables, error, loading, reload } = useAsync(
    async () => unwrap(await supabase.from('restaurant_tables').select('*').eq('restaurant_id', r.id).order('position').order('created_at')),
    [r.id],
  )
  const [name, setName] = useState('')
  const [bulk, setBulk] = useState('10')
  const [busy, setBusy] = useState(false)

  const insert = async (rows) => {
    setBusy(true)
    const start = tables?.length ?? 0
    const { error } = await supabase.from('restaurant_tables').insert(rows.map((n, i) => ({ restaurant_id: r.id, name: n, position: start + i })))
    setBusy(false)
    if (error) return toast(error.message, 'error')
    toast(rows.length > 1 ? `${rows.length} mesas creadas` : 'Mesa creada')
    reload(true)
  }

  const addOne = (e) => {
    e.preventDefault()
    if (name.trim()) insert([name.trim()]).then(() => setName(''))
  }

  const addBulk = () => {
    const n = Math.min(100, Math.max(1, Number(bulk) || 0))
    const existing = new Set((tables ?? []).map((t) => t.name.toLowerCase()))
    const names = []
    for (let i = 1; names.length < n && i < 1000; i++) if (!existing.has(`mesa ${i}`)) names.push(`Mesa ${i}`)
    insert(names)
  }

  const printAll = async () => {
    const active = (tables ?? []).filter((t) => t.active)
    if (!active.length) return toast('No hay mesas activas', 'error')
    const win = window.open('', '_blank')
    if (!win) return toast('Permite las ventanas emergentes para imprimir', 'error')
    win.document.write('<p style="font-family:sans-serif">Preparando QR…</p>')
    const cards = await Promise.all(active.map((t) => cardDataUrl(t, r.name)))
    win.document.open()
    win.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>QR mesas · ${r.name}</title>
      <style>@page{size:A4;margin:8mm}body{margin:0;font-family:sans-serif}.grid{display:grid;grid-template-columns:repeat(2,88mm);justify-content:center;gap:6mm;padding:8mm}
      img{width:88mm;border:1px solid #ddd;border-radius:5mm;break-inside:avoid}@media print{.grid{padding:0}}</style></head>
      <body><div class="grid">${cards.map((c) => `<img src="${c}">`).join('')}</div>
      <script>window.onload=()=>setTimeout(()=>window.print(),300)<\/script></body></html>`)
    win.document.close()
  }

  return (
    <div className="space-y-4">
      <div className="rounded-3xl bg-ink p-5 text-white">
        <p className="text-lg font-extrabold">🍽️ Pedidos desde la mesa</p>
        <p className="mt-1 text-sm text-white/75">
          Imprime un QR por mesa. Al escanearlo, el cliente ve la carta y pide sin dirección ni gastos de envío; el pedido te llega al
          panel indicando la mesa. Comisión de rabeat en estos pedidos: <b>{ratesFor(settings, r, true).restaurant_commission_pct}%</b>.
        </p>
        <p className="mt-2 text-sm text-white/75">
          💛 Con el mismo QR el cliente también puede <b>dejar solo una propina</b> para el equipo, sin pedir. Te avisamos por email y se liquida íntegra, sin
          comisión (la ves en <i>Ventas</i>).
        </p>
      </div>

      <Card title="Añadir mesas" icon="plus">
        <form onSubmit={addOne} className="flex gap-2">
          <Field className="flex-1" placeholder="Nombre: Mesa 1, Terraza 3, Barra…" value={name} onChange={(e) => setName(e.target.value)} />
          <Button type="submit" variant="dark" disabled={!name.trim() || busy}>
            Añadir
          </Button>
        </form>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-neutral-500">o crea de golpe</span>
          <input
            value={bulk}
            onChange={(e) => setBulk(e.target.value.replace(/\D/g, '').slice(0, 3))}
            inputMode="numeric"
            className="w-16 rounded-xl bg-neutral-100 px-3 py-2 text-center font-bold outline-none focus:ring-2 focus:ring-brand-500"
            aria-label="Número de mesas"
          />
          <Button variant="soft" className="!py-2" onClick={addBulk} disabled={busy}>
            mesas numeradas
          </Button>
        </div>
      </Card>

      {loading && !tables ? (
        <Loading />
      ) : error ? (
        <ErrorBox error={error} onRetry={reload} />
      ) : tables.length === 0 ? (
        <p className="text-center text-sm text-neutral-500">Todavía no hay mesas.</p>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold">{tables.length} mesas</p>
            <Button variant="dark" className="!py-2" onClick={printAll}>
              <Icon name="receipt" className="size-4" /> Imprimir todos los QR
            </Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {tables.map((t) => (
              <TableCard key={t.id} table={t} restaurantName={r.name} onChange={() => reload(true)} />
            ))}
          </div>
          {!r.active && (
            <p className="rounded-2xl bg-brand-50 p-3 text-sm font-semibold text-brand-800">
              El restaurante está oculto: los QR no funcionarán hasta que lo publiques.
            </p>
          )}
        </>
      )}
    </div>
  )
}

function TableCard({ table: t, restaurantName, onChange }) {
  const toast = useToast()
  const [card, setCard] = useState(null)
  const [name, setName] = useState(t.name)

  // Genera la tarjeta con el diseño completo: una miniatura ligera para la lista y el PNG listo para guardar al instante
  useEffect(() => {
    let alive = true
    let url
    tableCard(t, restaurantName).then((canvas) => {
      const thumb = Object.assign(document.createElement('canvas'), { width: 240, height: 360 })
      const tctx = thumb.getContext('2d')
      tctx.imageSmoothingQuality = 'high'
      tctx.drawImage(canvas, 0, 0, 240, 360)
      canvas.toBlob((blob) => {
        if (!alive || !blob) return
        url = URL.createObjectURL(blob)
        setCard({ thumb: thumb.toDataURL('image/png'), url, file: new File([blob], fileName(t), { type: 'image/png' }) })
      }, 'image/png')
    })
    return () => {
      alive = false
      if (url) URL.revokeObjectURL(url)
    }
  }, [t.code, t.name, restaurantName])

  const update = async (patch, ok) => {
    const { error } = await supabase.from('restaurant_tables').update(patch).eq('id', t.id)
    if (error) return toast(error.message, 'error')
    if (ok) toast(ok)
    onChange()
  }

  const remove = async () => {
    if (!confirm(`¿Eliminar ${t.name}? Su QR dejará de funcionar.`)) return
    const { error } = await supabase.from('restaurant_tables').delete().eq('id', t.id)
    if (error) return toast(error.message, 'error')
    toast('Mesa eliminada')
    onChange()
  }

  return (
    <article className={`flex gap-3 rounded-3xl bg-white p-3 ring-1 ring-neutral-200/70 ${t.active ? '' : 'opacity-60'}`}>
      <div className="h-36 w-24 shrink-0 overflow-hidden rounded-2xl bg-neutral-100 ring-1 ring-neutral-200">
        {card && <img src={card.thumb} alt={`QR de ${t.name}`} className="size-full object-cover" />}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name.trim() && name !== t.name && update({ name: name.trim() }, 'Mesa renombrada')}
          className="w-full rounded-xl px-2 py-1 font-extrabold outline-none hover:bg-neutral-50 focus:bg-neutral-100 focus:ring-2 focus:ring-brand-500"
          aria-label="Nombre de la mesa"
        />
        <Toggle checked={t.active} onChange={(v) => update({ active: v }, v ? 'Mesa activada' : 'Mesa desactivada')} label={<span className="text-xs">Activa</span>} />
        <div className="mt-auto flex gap-1">
          <button
            onClick={() => card && saveFile(card.file, card.url)}
            disabled={!card}
            className="flex-1 rounded-xl bg-neutral-100 py-2 text-xs font-bold disabled:opacity-50"
          >
            {card ? 'Descargar' : 'Preparando…'}
          </button>
          <button
            onClick={() => navigator.clipboard?.writeText(tableUrl(t.code)).then(() => toast('Enlace copiado'))}
            className="grid size-8 place-items-center rounded-xl bg-neutral-100"
            aria-label="Copiar enlace"
            title="Copiar enlace"
          >
            <Icon name="copy" className="size-4" />
          </button>
          <button onClick={remove} className="grid size-8 place-items-center rounded-xl text-neutral-400 hover:bg-neutral-100 hover:text-brand-600" aria-label="Eliminar mesa">
            <Icon name="trash" className="size-4" />
          </button>
        </div>
      </div>
    </article>
  )
}
