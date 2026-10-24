import { createContext, useContext, useEffect, useState } from 'react'
import { useAuth } from './auth.jsx'
import { supabase } from './supabase.js'

const KEY = 'rabeat:address'
const LocationContext = createContext(null)

const read = () => {
  try {
    return JSON.parse(localStorage.getItem(KEY)) ?? null
  } catch {
    return null
  }
}

// Dirección de entrega elegida (con coordenadas). Se recuerda en el navegador y en el perfil.
export function LocationProvider({ children }) {
  const { profile, user } = useAuth()
  const [address, setAddressState] = useState(read)
  const [pickerOpen, setPickerOpen] = useState(false)

  useEffect(() => {
    if (!address && profile?.default_address?.lat) setAddressState(profile.default_address)
  }, [profile, address])

  const setAddress = (a) => {
    setAddressState(a)
    try {
      localStorage.setItem(KEY, JSON.stringify(a))
    } catch {
      /* sin almacenamiento */
    }
    if (user) supabase.from('profiles').update({ default_address: a }).eq('id', user.id).then(() => {})
  }

  return (
    <LocationContext.Provider value={{ address, setAddress, pickerOpen, openPicker: () => setPickerOpen(true), closePicker: () => setPickerOpen(false) }}>
      {children}
    </LocationContext.Provider>
  )
}

export const useLocation = () => useContext(LocationContext)

// Geocodificación con OpenStreetMap (Nominatim), centrada en Canarias
export async function searchAddress(query) {
  const params = new URLSearchParams({
    q: query,
    format: 'jsonv2',
    addressdetails: '1',
    limit: '6',
    countrycodes: 'es',
    viewbox: '-18.4,29.5,-13.3,27.6',
    'accept-language': 'es',
  })
  const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`)
  if (!res.ok) throw new Error('No se pudo buscar la dirección')
  const data = await res.json()
  return data.map((r) => ({ label: formatOsm(r), lat: Number(r.lat), lng: Number(r.lon) }))
}

export async function reverseGeocode(lat, lng) {
  const params = new URLSearchParams({ lat, lon: lng, format: 'jsonv2', addressdetails: '1', 'accept-language': 'es' })
  const res = await fetch(`https://nominatim.openstreetmap.org/reverse?${params}`)
  if (!res.ok) return null
  const r = await res.json()
  return r?.address ? formatOsm(r) : null
}

function formatOsm(r) {
  const a = r.address ?? {}
  const street = [a.road ?? a.pedestrian ?? a.square ?? a.neighbourhood ?? r.name, a.house_number].filter(Boolean).join(' ')
  const city = a.city ?? a.town ?? a.village ?? a.municipality ?? ''
  return [street, city].filter(Boolean).join(', ') || r.display_name
}
