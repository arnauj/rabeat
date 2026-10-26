import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

const TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
export const ARRECIFE = { lat: 28.963, lng: -13.5477 }

const ICONS = {
  restaurant: '<div class="grid size-10 place-items-center rounded-full bg-white text-xl shadow-lg ring-2 ring-ink">🍽️</div>',
  home: '<div class="grid size-10 place-items-center rounded-full bg-brand-600 text-xl shadow-lg ring-4 ring-white">🏠</div>',
  rider: '<div class="grid size-10 place-items-center rounded-full bg-brand-600 text-xl shadow-xl ring-4 ring-white">🛵</div>',
}

const icon = (kind) => L.divIcon({ html: ICONS[kind], className: '', iconSize: [40, 40], iconAnchor: [20, 20] })

function useLeaflet(ref, center, zoom, options = {}) {
  const map = useRef(null)
  useEffect(() => {
    map.current = L.map(ref.current, { zoomControl: false, attributionControl: true, ...options }).setView([center.lat, center.lng], zoom)
    L.tileLayer(TILES, { attribution: ATTRIBUTION, maxZoom: 19 }).addTo(map.current)
    L.control.zoom({ position: 'bottomright' }).addTo(map.current)
    return () => map.current.remove()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return map
}

// Mapa con marcadores (seguimiento de pedidos, reparto)
export function MapView({ markers, className = 'h-64', route = true }) {
  const el = useRef(null)
  const first = markers.find((m) => m.lat != null) ?? ARRECIFE
  const map = useLeaflet(el, first, 14, { scrollWheelZoom: false })
  const layer = useRef(null)
  const fitted = useRef(false)

  useEffect(() => {
    if (!map.current) return
    layer.current?.remove()
    layer.current = L.layerGroup().addTo(map.current)
    const valid = markers.filter((m) => m.lat != null && m.lng != null)
    valid.forEach((m) => L.marker([m.lat, m.lng], { icon: icon(m.kind), title: m.label }).addTo(layer.current))
    const ends = valid.filter((m) => m.kind !== 'rider')
    if (route && ends.length === 2)
      L.polyline(
        ends.map((m) => [m.lat, m.lng]),
        { color: '#E30613', weight: 4, dashArray: '8 8', opacity: 0.8 },
      ).addTo(layer.current)
    if (!fitted.current && valid.length > 1) {
      map.current.fitBounds(L.latLngBounds(valid.map((m) => [m.lat, m.lng])), { padding: [48, 48] })
      fitted.current = true
    }
  }, [markers, map, route])

  return <div ref={el} className={`z-0 ${className}`} />
}

// Selector de ubicación: el mapa se mueve y el pin queda en el centro
export function PickerMap({ value, onChange, className = 'h-72' }) {
  const el = useRef(null)
  const map = useLeaflet(el, value ?? ARRECIFE, value ? 17 : 13)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    const m = map.current
    const handler = () => {
      const c = m.getCenter()
      onChangeRef.current({ lat: Number(c.lat.toFixed(6)), lng: Number(c.lng.toFixed(6)) }, 'map')
    }
    m.on('moveend', handler)
    return () => m.off('moveend', handler)
  }, [map])

  useEffect(() => {
    if (!value || !map.current) return
    const c = map.current.getCenter()
    if (Math.abs(c.lat - value.lat) > 1e-5 || Math.abs(c.lng - value.lng) > 1e-5) map.current.setView([value.lat, value.lng], 17)
  }, [value, map])

  return (
    <div className={`relative overflow-hidden ${className}`}>
      <div ref={el} className="absolute inset-0 z-0" />
      <div className="pointer-events-none absolute top-1/2 left-1/2 z-[500] -translate-x-1/2 -translate-y-full">
        <svg viewBox="0 0 24 24" className="size-11 drop-shadow-lg" aria-hidden="true">
          <path d="M12 23s-8-7.1-8-13.2A8 8 0 0 1 20 9.8C20 15.9 12 23 12 23Z" fill="#E30613" stroke="#fff" strokeWidth="1.5" />
          <circle cx="12" cy="10" r="3" fill="#fff" />
        </svg>
      </div>
    </div>
  )
}

// Mapa de seguimiento en directo: el rider se desliza entre posiciones y el mapa le sigue
// (hasta que el usuario mueve el mapa; entonces aparece «Centrar»).
// target: hacia dónde va el rider ahora (restaurante para recoger o casa para entregar)
export function LiveMap({ restaurant, home, rider, target, className = 'h-72' }) {
  const el = useRef(null)
  const map = useLeaflet(el, home ?? restaurant ?? ARRECIFE, 15, { scrollWheelZoom: false })
  const parts = useRef({})
  const [following, setFollowing] = useState(true)
  const followRef = useRef(true)
  followRef.current = following

  // Restaurante y casa (fijos)
  useEffect(() => {
    const m = map.current
    const p = parts.current
    if (restaurant?.lat != null && !p.restaurant) p.restaurant = L.marker([restaurant.lat, restaurant.lng], { icon: icon('restaurant'), title: 'Restaurante' }).addTo(m)
    if (home?.lat != null && !p.home) p.home = L.marker([home.lat, home.lng], { icon: icon('home'), title: 'Entrega' }).addTo(m)
    const stop = () => setFollowing(false)
    m.on('dragstart', stop)
    return () => m.off('dragstart', stop)
  }, [map, restaurant?.lat, restaurant?.lng, home?.lat, home?.lng])

  // Rider: animación suave hasta la nueva posición
  useEffect(() => {
    const m = map.current
    const p = parts.current
    if (!rider || rider.lat == null) {
      p.rider?.remove()
      p.rider = null
      return
    }
    const to = L.latLng(rider.lat, rider.lng)
    if (!p.rider) {
      p.rider = L.marker(to, { icon: icon('rider'), title: 'Rider', zIndexOffset: 1000 }).addTo(m)
      return
    }
    const from = p.rider.getLatLng()
    const start = performance.now()
    let raf
    const step = (t) => {
      const k = Math.min(1, (t - start) / 1200)
      const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2
      p.rider.setLatLng([from.lat + (to.lat - from.lat) * e, from.lng + (to.lng - from.lng) * e])
      if (k < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [map, rider?.lat, rider?.lng]) // eslint-disable-line react-hooks/exhaustive-deps

  // Línea hacia el destino y encuadre automático
  useEffect(() => {
    const m = map.current
    const p = parts.current
    p.line?.remove()
    const from = rider?.lat != null ? rider : restaurant
    const to = rider?.lat != null ? target : home
    if (from?.lat != null && to?.lat != null)
      p.line = L.polyline(
        [
          [from.lat, from.lng],
          [to.lat, to.lng],
        ],
        { color: '#E30613', weight: 4, dashArray: '8 10', opacity: 0.75 },
      ).addTo(m)
    if (!followRef.current) return
    const pts = [from, to].filter((x) => x?.lat != null).map((x) => [x.lat, x.lng])
    if (pts.length === 2) m.fitBounds(L.latLngBounds(pts), { padding: [56, 56], maxZoom: 17, animate: true })
    else if (pts.length === 1) m.setView(pts[0], 16, { animate: true })
  }, [map, rider?.lat, rider?.lng, target?.lat, target?.lng, restaurant, home, following]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="relative">
      <div ref={el} className={`z-0 ${className}`} />
      {!following && (
        <button
          onClick={() => setFollowing(true)}
          className="absolute bottom-3 left-3 z-[500] flex items-center gap-1.5 rounded-full bg-white px-3.5 py-2 text-xs font-extrabold text-ink shadow-lg active:scale-95"
        >
          🎯 Centrar
        </button>
      )}
    </div>
  )
}
