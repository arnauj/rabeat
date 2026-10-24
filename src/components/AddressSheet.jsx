import { useEffect, useRef, useState } from 'react'
import Icon from './Icon.jsx'
import { PickerMap } from './Map.jsx'
import { Button, Field, Sheet, SheetHeader, Spinner } from './ui.jsx'
import { reverseGeocode, searchAddress, useLocation } from '../lib/location.jsx'

// Elegir dirección: buscador (OpenStreetMap) + mapa para afinar el punto exacto
export default function AddressSheet() {
  const { address, setAddress, pickerOpen, closePicker } = useLocation()
  return (
    <Sheet open={pickerOpen} onClose={closePicker} label="Dirección de entrega" wide>
      {pickerOpen && (
        <AddressForm
          initial={address}
          onCancel={closePicker}
          onSave={(a) => {
            setAddress(a)
            closePicker()
          }}
        />
      )}
    </Sheet>
  )
}

export function AddressForm({ initial, onSave, onCancel, title = '¿Dónde te lo llevamos?', withDetails = true }) {
  const [query, setQuery] = useState(initial?.street ?? '')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [point, setPoint] = useState(initial?.lat ? { lat: initial.lat, lng: initial.lng } : null)
  const [street, setStreet] = useState(initial?.street ?? '')
  const [details, setDetails] = useState(initial?.details ?? '')
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [locating, setLocating] = useState(false)
  const [error, setError] = useState('')
  const skipSearch = useRef(true)
  const reverseTimer = useRef(null)

  useEffect(() => {
    if (skipSearch.current) {
      skipSearch.current = false
      return
    }
    if (query.trim().length < 4) return setResults([])
    const t = setTimeout(async () => {
      setSearching(true)
      try {
        setResults(await searchAddress(query))
        setError('')
      } catch (e) {
        setError(e.message)
      } finally {
        setSearching(false)
      }
    }, 450)
    return () => clearTimeout(t)
  }, [query])

  const choose = (r) => {
    skipSearch.current = true
    setQuery(r.label)
    setStreet(r.label)
    setPoint({ lat: r.lat, lng: r.lng })
    setResults([])
  }

  // Al mover el mapa, actualiza la calle (con retardo para no saturar el servicio)
  const onMapMove = (p) => {
    setPoint(p)
    clearTimeout(reverseTimer.current)
    reverseTimer.current = setTimeout(async () => {
      const label = await reverseGeocode(p.lat, p.lng).catch(() => null)
      if (label) {
        skipSearch.current = true
        setQuery(label)
        setStreet((s) => (s && s.split(',')[0] === label.split(',')[0] ? s : label))
      }
    }, 700)
  }

  const locate = () => {
    if (!navigator.geolocation) return setError('Tu navegador no permite obtener la ubicación')
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false)
        onMapMove({ lat: pos.coords.latitude, lng: pos.coords.longitude })
      },
      () => {
        setLocating(false)
        setError('No hemos podido obtener tu ubicación')
      },
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }

  const valid = point && street.trim().length > 3

  return (
    <>
      <SheetHeader title={title} subtitle="Busca la calle y ajusta el pin en el mapa" onClose={onCancel} />
      <div className="space-y-3 p-5">
        <div className="relative">
          <label className="flex items-center gap-3 rounded-2xl bg-neutral-100 px-4 py-3 focus-within:bg-white focus-within:ring-2 focus-within:ring-brand-500">
            <Icon name="search" className="size-5 text-neutral-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Calle y número, ciudad"
              className="w-full bg-transparent text-[15px] font-semibold outline-none"
              autoFocus={!initial}
            />
            {searching && <Spinner className="size-4 text-brand-600" />}
          </label>
          {results.length > 0 && (
            <ul className="absolute inset-x-0 top-full z-[600] mt-1 overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-neutral-200">
              {results.map((r) => (
                <li key={`${r.lat},${r.lng}`}>
                  <button onClick={() => choose(r)} className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm hover:bg-neutral-50">
                    <Icon name="pin" className="size-4 shrink-0 text-brand-600" />
                    {r.label}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <button onClick={locate} className="flex items-center gap-2 text-sm font-bold text-brand-600">
          {locating ? <Spinner className="size-4" /> : <Icon name="pin" className="size-4" />} Usar mi ubicación actual
        </button>
        <PickerMap value={point} onChange={onMapMove} className="h-64 rounded-3xl ring-1 ring-neutral-200 sm:h-72" />
        <Field label="Calle y número (como aparecerá en el pedido)" value={street} onChange={(e) => setStreet(e.target.value)} />
        {withDetails && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Piso, puerta" placeholder="2ºB" value={details} onChange={(e) => setDetails(e.target.value)} />
            <Field label="Indicaciones" placeholder="Portal verde…" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        )}
        {error && <p className="text-sm font-semibold text-brand-600">{error}</p>}
      </div>
      <div className="sticky bottom-0 flex gap-3 border-t border-neutral-100 bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <Button variant="soft" className="flex-1" onClick={onCancel}>
          Cancelar
        </Button>
        <Button
          className="flex-[2]"
          disabled={!valid}
          onClick={() => onSave({ street: street.trim(), details: details.trim(), notes: notes.trim(), lat: point.lat, lng: point.lng })}
        >
          Guardar dirección
        </Button>
      </div>
    </>
  )
}
