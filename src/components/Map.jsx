import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

const TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
export const LAS_PALMAS = { lat: 28.1235, lng: -15.4363 }

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
  const first = markers.find((m) => m.lat != null) ?? LAS_PALMAS
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
  const map = useLeaflet(el, value ?? LAS_PALMAS, value ? 17 : 13)
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
